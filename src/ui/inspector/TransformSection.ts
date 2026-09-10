// TRANSFORM: the five rows that orient, spin and size the shape.
//
// All five are real, and all five write to one place. PITCH / YAW / ROLL are the
// mesh's own absolute degrees; SPIN is degrees per second; SCALE is a factor —
// every one of them a field on ShapeRig, composed into the matrix Point3D
// rebuilds each vertex from.
//
// SCALE was the last placeholder here, and where it landed was a real decision
// (E4a/COS-240): in the mesh transform rather than in the projection. A factor
// applied inside convert3D2D would scale what the viewer sees without scaling z,
// so the near plane, the painter's sort and the depth histogram would all go on
// reasoning about a shape the size it used to be.
//
// All four really are the shape's, which they had not been since E1a: that
// ticket pointed the three angle rows at the camera because the rig had just
// been built and they were the only way to move the viewpoint, and E1b then gave
// the camera a mouse without anyone revisiting them (COS-434). The camera has
// ELEV / AZIM / ROLL of its own in the WORLD tab now.
//
// The three angle rows carry a `°` suffix, which supersedes the rule the UI epic
// shipped them under. That rule was right at the time: they were per-frame
// rotation *rates* mapped through a two-segment UI space, and printing degrees
// beside a rate would have invited someone to expect the shape to return to a
// pose. The rig makes them poses, so the suffix is now the honest label and the
// word RATE has gone from all three.

import SliderRow from "@ui/inspector/controls/SliderRow";

import type ControlRegistry from "@ui/ControlRegistry";
import type { ControlId } from "@ui/ControlRegistry";
import type UIStateStore from "@ui/UIStateStore";

// The mesh opens in its authored rest pose, so all three are zero. The oblique
// arrival the console needs is the camera's job and the camera's defaults own
// it; a shape pre-posed here would be a rotation nothing in the registry asked
// for, applied to all twenty primitives at once.
export const DEFAULT_PITCH_DEGREES = 0;
export const DEFAULT_YAW_DEGREES = 0;
export const DEFAULT_ROLL_DEGREES = 0;
// The yaw rate the per-frame sliders really ran at: 122 °/s, a three-second
// revolution, with pitch and roll following in the rig's own proportions. 24
// was tried first and is a fifth of this — slow enough that a viewer reads the
// shape as parked rather than turning.
export const DEFAULT_SPIN_DEGREES_PER_SECOND = 122;
export const DEFAULT_SCALE = 100;

// A full half-turn on all three. The ±89 the pitch row used to carry was the
// camera's constraint — a turntable has a roll axis and nothing to gain from a
// pole flip — and the shape inherited it by accident when these rows were
// pointed at the viewpoint. A mesh has no pole.
const ANGLE_LIMIT = 180;
const SPIN_MIN = 0;
// Twice the default, so the row's own default sits mid-track and there is
// headroom above the rate the rig shipped with rather than a ceiling under it.
const SPIN_MAX = 244;
// Percent in the row, a factor in the rig: 10..300 maps to 0.1..3.0. No cap and
// no guard sits between them — E2's near plane rejects what a large factor
// pushes behind the eye, and because the scale rides the mesh transform that
// plane genuinely sees the scaled depth.
const SCALE_MIN = 10;
const SCALE_MAX = 300;
const SCALE_PERCENT = 100;

// The private angle helper's parameters, as a record rather than a sixth
// positional (R4). It grew one when the rows became reachable from a hardware
// surface, and five was already the limit.
interface AngleRowOptions {
  label: string;
  testId: string;
  controlId: ControlId;
  limit: number;
  value: number;
  onInput: (value: number) => void;
}

export interface TransformSectionOptions {
  root: HTMLElement;
  store: UIStateStore;
  controls: ControlRegistry;
  onPitch: (degrees: number) => void;
  onYaw: (degrees: number) => void;
  onRoll: (degrees: number) => void;
  onSpin: (degreesPerSecond: number) => void;
  onScale: (factor: number) => void;
}

class TransformSection {
  private readonly store: UIStateStore;
  private readonly controls: ControlRegistry;
  private readonly apply: TransformSectionOptions;
  private readonly pitch: SliderRow;
  private readonly yaw: SliderRow;
  private readonly roll: SliderRow;
  private readonly spin: SliderRow;
  private readonly scale: SliderRow;

  constructor(options: TransformSectionOptions) {
    this.store = options.store;
    this.controls = options.controls;
    this.apply = options;
    // Registered here rather than in the store, which is what makes RESET
    // coverage automatic: resetAll() restores whatever was declared, so this
    // section is restored without the reset handler being edited.
    this.store.registerSlice({
      pitch: DEFAULT_PITCH_DEGREES,
      yaw: DEFAULT_YAW_DEGREES,
      roll: DEFAULT_ROLL_DEGREES,
      spin: DEFAULT_SPIN_DEGREES_PER_SECOND,
      scale: DEFAULT_SCALE,
    });

    this.pitch = this.buildAngle({
      label: "PITCH",
      testId: "transform-pitch",
      controlId: "pitch",
      limit: ANGLE_LIMIT,
      value: DEFAULT_PITCH_DEGREES,
      onInput: (value) => {
        this.store.setState({ pitch: value });
        options.onPitch(value);
      },
    });
    this.yaw = this.buildAngle({
      label: "YAW",
      testId: "transform-yaw",
      controlId: "yaw",
      limit: ANGLE_LIMIT,
      value: DEFAULT_YAW_DEGREES,
      onInput: (value) => {
        this.store.setState({ yaw: value });
        options.onYaw(value);
      },
    });
    this.roll = this.buildAngle({
      label: "ROLL",
      testId: "transform-roll",
      controlId: "roll",
      limit: ANGLE_LIMIT,
      value: DEFAULT_ROLL_DEGREES,
      onInput: (value) => {
        this.store.setState({ roll: value });
        options.onRoll(value);
      },
    });

    this.spin = new SliderRow({
      label: "SPIN",
      testId: "transform-spin",
      controls: this.controls,
      controlId: "spin",
      min: SPIN_MIN,
      max: SPIN_MAX,
      value: DEFAULT_SPIN_DEGREES_PER_SECOND,
      // Degrees per second, not the design's `/s` multiplier (L1413). The rig
      // accumulates against wall-clock time, so this row now names a real
      // physical rate and the shape completes a turn in the same time at any
      // frame rate the RENDER tab's cap can select.
      format: (value) => `${value}°/s`,
      onInput: (value) => {
        this.store.setState({ spin: value });
        options.onSpin(value);
      },
    });

    this.scale = new SliderRow({
      label: "SCALE",
      testId: "transform-scale",
      controls: this.controls,
      controlId: "scale",
      min: SCALE_MIN,
      max: SCALE_MAX,
      value: DEFAULT_SCALE,
      format: (value) => `${(value / SCALE_PERCENT).toFixed(2)}×`,
      onInput: (value) => {
        this.store.setState({ scale: value });
        options.onScale(value / SCALE_PERCENT);
      },
    });

    options.root.append(this.pitch.element, this.yaw.element, this.roll.element, this.spin.element, this.scale.element);
  }

  // Writes the store's values into the rows AND pushes them to the rig. Both
  // halves matter: this is the RESET path, and a reset that moved the sliders
  // without moving the shape would leave the two disagreeing until the next
  // drag.
  //
  // There is no write-back in the other direction any more, and its absence is
  // the point: nothing moves the shape except these rows, so the hazard the
  // deleted half existed to manage — a preset easing the same number a thumb is
  // dragging — cannot arise on this side at all. It survives once, on the
  // camera, as CameraSection.setCameraUi.
  public syncFromStore() {
    const state = this.store.getState();

    // The row's answer, not the store's: setValue clamps to the range the row
    // owns, and applying the number that was asked for rather than the one that
    // survived would let a preset file (E8b) pose the shape somewhere no slider
    // can reach while the track sits at its end.
    const pitch = this.pitch.setValue(state.pitch ?? DEFAULT_PITCH_DEGREES);
    const yaw = this.yaw.setValue(state.yaw ?? DEFAULT_YAW_DEGREES);
    const roll = this.roll.setValue(state.roll ?? DEFAULT_ROLL_DEGREES);
    const spin = this.spin.setValue(state.spin ?? DEFAULT_SPIN_DEGREES_PER_SECOND);
    const scale = this.scale.setValue(state.scale ?? DEFAULT_SCALE);

    // And back into the store, when the clamp actually moved something. Clamping
    // on the way to the rig alone would leave the store holding a number no row
    // shows and no control can produce — which SAVE PRESET would then write
    // straight back out, laundering a hand-edited file into one the console
    // appears to vouch for. Only a file can get one in here, so on every normal
    // path this costs one comparison per row and no notification.
    if (
      pitch !== state.pitch ||
      yaw !== state.yaw ||
      roll !== state.roll ||
      spin !== state.spin ||
      scale !== state.scale
    ) {
      this.store.setState({ pitch, yaw, roll, spin, scale });
    }

    this.apply.onPitch(pitch);
    this.apply.onYaw(yaw);
    this.apply.onRoll(roll);
    this.apply.onSpin(spin);
    this.apply.onScale(scale / SCALE_PERCENT);
  }

  // Symmetric about zero, which is what a range input can express and the old
  // engine-space bounds could not: neutral was 320 of 0..800 for pitch, 512 for
  // yaw and 0 of -1000..1200 for roll, a different fraction of the track on each
  // of the three. All three share one limit now, so all three sit mid-track.
  private buildAngle(options: AngleRowOptions): SliderRow {
    return new SliderRow({
      label: options.label,
      testId: options.testId,
      controls: this.controls,
      controlId: options.controlId,
      min: -options.limit,
      max: options.limit,
      value: options.value,
      format: (degrees) => `${degrees}°`,
      onInput: options.onInput,
    });
  }
}

export default TransformSection;
