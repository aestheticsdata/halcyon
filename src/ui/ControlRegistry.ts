// The one place a continuous console value is named, and the one place something
// other than its own row moves one.
//
// ActionRegistry solved this for buttons: a click and a key both end in the same
// call, so a chip cannot promise a key nothing binds. Values had no equivalent.
// Every slider in this console is a `private readonly` field on the section that
// built it, whose whole public surface is syncFromStore() — so of the eighteen
// continuous rows the console owns, not one could be moved by anything except a
// thumb on its own track. A hardware surface has to go somewhere, and the answer
// is not eighteen new public setters spread across five sections.
//
// Positions arrive NORMALISED, never as values. That is the load-bearing choice:
// the caller says "this control is 61% of the way up" and the entry — which holds
// the row's own bounds, because SliderRow assembled it — decides what that means.
// So a binding table names a control and nothing else, and pointing a fader at
// something new never involves knowing a range.
//
// A miss throws, for ActionRegistry's reason verbatim: a registry whose misses are
// silent is a registry that lets a typo reach production looking exactly like a
// control nobody wired.

import { normalisedToValue } from "@input/midi/midiScaling";

// Every continuous row in the console, whether or not anything drives it today.
// Declared whole rather than as the handful currently bound, for the same reason
// UIStateStore declares a slice with its default: the point of the binding table
// is that pointing a knob at FOG is one line, and that is only true while every
// continuous parameter already has a name that resolves.
//
// The vocabulary is the store's, which is what keeps the two roll-ish angles
// apart without a comment: the shape's are `pitch` / `yaw` / `roll`, the camera's
// are `camElev` / `camAzim` / `camRoll`. `opacity` is the one id with no slice
// behind it — the value lives on RenderPipelinePanel — and it is named for the
// row, which is the word the console already prints.
export type ControlId =
  | "pitch"
  | "yaw"
  | "roll"
  | "spin"
  | "scale"
  | "uvScale"
  | "opacity"
  | "lightAzimuth"
  | "lightElevation"
  | "lightAmbient"
  | "lightSpecular"
  | "camElev"
  | "camAzim"
  | "camRoll"
  | "fov"
  | "zoom"
  | "fog"
  | "gridStep";

export interface ControlDefinition {
  label: string;
  min: number;
  max: number;
  defaultValue: number;
  // Both halves of what a drag does: move the row, then run what the row's own
  // onInput runs. SliderRow assembles this rather than the section, because
  // setValue() deliberately does not fire onInput — so a hand-written entry gets
  // one half and the thumb and the engine part company.
  apply: (value: number) => void;
}

// What a documentation surface may see. Deliberately not ControlDefinition: the
// bindings panel prints a label and bounds, and handing it `apply` as well would
// hand a read-only surface a live write into the console.
export type ControlDescription = Omit<ControlDefinition, "apply">;

class ControlRegistry {
  private readonly controls: Map<ControlId, ControlDefinition>;

  constructor() {
    this.controls = new Map();
  }

  public has(id: ControlId): boolean {
    return this.controls.has(id);
  }

  public describe(id: ControlId): ControlDescription {
    const control = this.require(id);

    return {
      label: control.label,
      min: control.min,
      max: control.max,
      defaultValue: control.defaultValue,
    };
  }

  // Replaces rather than rejecting a second registration under one id, which is
  // the same allowance ActionRegistry's Map makes: Vite's HMR re-executes a
  // module without tearing the old one down, so a section that registers on
  // construction registers again on every edit. Two DIFFERENT rows claiming one
  // id is a real bug and is caught by the binding suite instead, where it can be
  // reported against both call sites rather than against whichever ran second.
  public register(id: ControlId, definition: ControlDefinition) {
    this.controls.set(id, definition);
  }

  // `normalised` is 0 at the bottom of the travel, 1 at the top and 0.5 at the
  // row's own default — see midiScaling for why the midpoint is exact rather
  // than merely close.
  public set(id: ControlId, normalised: number) {
    const control = this.require(id);

    control.apply(normalisedToValue(normalised, control));
  }

  private require(id: ControlId): ControlDefinition {
    const control = this.controls.get(id);

    if (!control) {
      throw new Error(`No control is registered under "${id}".`);
    }

    return control;
  }
}

export default ControlRegistry;
