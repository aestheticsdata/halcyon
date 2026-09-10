// Where a fader is, and what that means to a row.
//
// Split in two on purpose, and the seam is the point of the whole input layer:
// the first function knows the hardware and nothing about the console, the second
// knows a row's range and nothing about MIDI. Neither ever learns that PITCH is
// ±180° while SCALE is 10..300, which is what keeps a new binding a line of data
// rather than a line of arithmetic.
//
// Both halves are piecewise about the centre, for one reason. Seven bits give 128
// positions and every angle row in this console spans 361 integer degrees, so a
// straight `min + t · (max − min)` divides unevenly and skips the value that
// matters most: CC 63 lands on −1° and CC 64 on +1°, and there is no byte that
// yields 0. The same arithmetic misses SCALE's 100. Six of the seven rows a
// nanoKONTROL2 drives could not express their own default, which is to say a
// fader could never put a shape back upright.
//
// So the two halves of the travel interpolate independently, meeting at the row's
// registered default. A fader at rest is the minimum, fully open is the maximum,
// and the midpoint is exactly the value RESET would restore — with twice the
// resolution near it, which is where a hand works anyway.

// The seven-bit range a Control Change carries, and the position both halves
// pivot on. 64 rather than 63.5: it is the byte every controller with a centre
// detent actually sends, and a fractional centre is not a position the hardware
// can occupy.
const CC_MIN = 0;
const CC_MAX = 127;
const CC_CENTRE = 64;
const HALF = 0.5;

// A row's own bounds and the value it opens at. The registry fills this from the
// SliderRow that owns them, so nothing here is a second copy of a range.
export interface ControlRange {
  min: number;
  max: number;
  defaultValue: number;
}

// Clamped rather than trusted: `data2` arrives off a wire, and a driver that
// sends 128 should move the thumb to the top rather than past it.
export const midiToNormalised = (data2: number): number => {
  const clamped = Math.min(CC_MAX, Math.max(CC_MIN, data2));

  if (clamped <= CC_CENTRE) {
    return (clamped / CC_CENTRE) * HALF;
  }

  return HALF + ((clamped - CC_CENTRE) / (CC_MAX - CC_CENTRE)) * HALF;
};

// Rounded because every row this drives is integer-stepped — SliderRow reads its
// element with parseInt and declares no `step` — so an unrounded value would
// leave the thumb, the read-out and the engine describing three different
// numbers within a few pixels of each other.
export const normalisedToValue = (normalised: number, range: ControlRange): number => {
  const clamped = Math.min(1, Math.max(0, normalised));

  if (clamped <= HALF) {
    return Math.round(range.min + (clamped / HALF) * (range.defaultValue - range.min));
  }

  return Math.round(range.defaultValue + ((clamped - HALF) / HALF) * (range.max - range.defaultValue));
};
