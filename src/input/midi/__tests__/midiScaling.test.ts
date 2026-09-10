// The two halves of the curve, asserted separately because they answer to
// different constraints: one is bounded by what the hardware can send, the other
// by what the console's rows mean.
//
// The bug worth pinning is the one a linear map cannot avoid. Every angle row in
// this console is symmetric about zero and every one of them defaults to zero, so
// a map that cannot express the midpoint is a map that cannot put a shape back
// upright — and 128 CC steps over 361 integer degrees does not divide evenly. The
// two centre assertions below are the whole reason this module is piecewise.

import { midiToNormalised, normalisedToValue } from "@input/midi/midiScaling";
import { describe, expect, it } from "vitest";

const ANGLE = { min: -180, max: 180, defaultValue: 0 };
const SCALE = { min: 10, max: 300, defaultValue: 100 };
const ELEVATION = { min: -89, max: 89, defaultValue: 0 };

describe("midiToNormalised", () => {
  it("puts a fader at rest on zero and fully open on one", () => {
    expect(midiToNormalised(0)).toBe(0);
    expect(midiToNormalised(127)).toBe(1);
  });

  it("puts the centre detent on exactly one half", () => {
    expect(midiToNormalised(64)).toBe(0.5);
  });

  it("rises monotonically across the whole seven-bit range", () => {
    const positions = Array.from({ length: 128 }, (_, cc) => midiToNormalised(cc));

    expect(positions.every((value, index) => index === 0 || value > positions[index - 1])).toBe(true);
  });

  it("clamps a value outside the seven bits rather than extrapolating past the track", () => {
    expect(midiToNormalised(-1)).toBe(0);
    expect(midiToNormalised(999)).toBe(1);
  });
});

describe("normalisedToValue", () => {
  it("spans the row's whole range end to end", () => {
    expect(normalisedToValue(0, ANGLE)).toBe(-180);
    expect(normalisedToValue(1, ANGLE)).toBe(180);
  });

  // The reason this module exists. Under `min + t * (max - min)` there is no CC
  // byte that yields 0 on a -180..180 row: 63 gives -1 and 64 gives +1.
  it("lands on the row's own default at the midpoint", () => {
    expect(normalisedToValue(0.5, ANGLE)).toBe(0);
    expect(normalisedToValue(0.5, ELEVATION)).toBe(0);
    expect(normalisedToValue(0.5, SCALE)).toBe(100);
  });

  // SCALE is the row that proves the halves are independent: 100 is not the
  // midpoint of 10..300, so a single interpolation cannot put it at the centre.
  it("interpolates each half independently when the default is off-centre", () => {
    expect(normalisedToValue(0.25, SCALE)).toBe(55);
    expect(normalisedToValue(0.75, SCALE)).toBe(200);
  });

  it("returns integers, because every row this drives is integer-stepped", () => {
    const values = Array.from({ length: 128 }, (_, cc) => normalisedToValue(midiToNormalised(cc), SCALE));

    expect(values.every(Number.isInteger)).toBe(true);
  });

  it("reaches every bound and every default through the hardware, not merely in theory", () => {
    const reached = (range: typeof ANGLE) =>
      new Set(Array.from({ length: 128 }, (_, cc) => normalisedToValue(midiToNormalised(cc), range)));

    for (const range of [ANGLE, SCALE, ELEVATION]) {
      expect(reached(range).has(range.min)).toBe(true);
      expect(reached(range).has(range.defaultValue)).toBe(true);
      expect(reached(range).has(range.max)).toBe(true);
    }
  });

  it("does not divide by zero when a row defaults to one of its own bounds", () => {
    const atFloor = { min: 0, max: 244, defaultValue: 0 };

    expect(normalisedToValue(0, atFloor)).toBe(0);
    expect(normalisedToValue(0.5, atFloor)).toBe(0);
    expect(normalisedToValue(1, atFloor)).toBe(244);
  });
});
