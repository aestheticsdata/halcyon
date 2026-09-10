// What each control on the surface does. THIS is the file to edit.
//
// It names hardware ids from nanoKONTROL2.ts on the left and console vocabulary
// on the right, and it contains no CC numbers, no ranges, no callbacks and no
// engine. Pointing a physical control at something else is one line here, and
// nothing else in the tree changes.
//
// Two consumers read this table and neither may hardcode a binding: the router
// dispatches from it, and the bindings panel prints from it. That is the same
// arrangement shortcuts.ts has with KeyboardShortcuts and ShortcutsPanel, and it
// buys the same guarantee — the panel cannot advertise a fader the router does
// not dispatch, and the router cannot act on one the panel does not show.
//
// The keys are hardware ids rather than an array of rows, which is the one
// departure from shortcuts.ts. What it buys is four mistakes moving from a test
// into the compiler: an unknown control name (TS2561, with a "did you mean"),
// one control bound twice (TS1117), a value target on a button, and an action
// target on a fader. Nothing reads order out of this record — the panel takes its
// order from the datasheet — so there is no layout being smuggled into a Record.
//
// Everything is optional on both halves. A control absent from this table is
// simply unassigned, and removing a binding is removing a line.

import type { ViewPresetKey } from "@camera/viewPresets";
import type { ButtonControlName, ContinuousControlName } from "@input/midi/nanoKONTROL2";
import type { PlainActionId, StepActionId } from "@ui/ActionRegistry";
import type { ControlId } from "@ui/ControlRegistry";

// A fader or a knob reports where it is, so its only possible target is a
// continuous console value. The registry owns the range; this says which one.
export interface ControlTarget {
  kind: "control";
  id: ControlId;
}

// The three things a press can mean. They are separate arms rather than one
// `action` with an optional argument, and that is the design's central type
// decision: ActionRegistry's handler takes `(argument?: number)`, so a single
// arm would let `{ id: "selectPrimitive" }` compile, bind and then do nothing at
// the moment the button is pressed. Split, every one of the three carries exactly
// what its action needs and nothing can carry what it does not.
export interface ActionTarget {
  kind: "action";
  id: PlainActionId;
}

// A signed walk along a list, wrapping at both ends. `by` is ±1 rather than a
// number, because a step that could carry 7 would be an absolute jump wearing a
// step's name.
export interface StepTarget {
  kind: "step";
  id: StepActionId;
  by: -1 | 1;
}

// Named by the preset's own key rather than by its index. An index would be
// opaque in a hand-edited file and would silently change meaning the day anyone
// reorders viewPresets.ts; the router resolves the key to the index the action
// wants, in one place.
export interface ViewPresetTarget {
  kind: "viewPreset";
  key: ViewPresetKey;
}

export type ButtonTarget = ActionTarget | StepTarget | ViewPresetTarget;
export type MIDITarget = ControlTarget | ButtonTarget;

export type MIDIBindingTable = Partial<Record<ContinuousControlName, ControlTarget>> &
  Partial<Record<ButtonControlName, ButtonTarget>>;

const midiBindings: MIDIBindingTable = {
  // The shape's own pose, left to right in the order the TRANSFORM rows are
  // stacked, so the hand finds them where the eye already reads them.
  fader1: { kind: "control", id: "pitch" },
  fader2: { kind: "control", id: "yaw" },
  fader3: { kind: "control", id: "roll" },
  fader4: { kind: "control", id: "spin" },
  fader5: { kind: "control", id: "scale" },

  // The viewpoint. AZIM's row spans -180..180, so one full sweep of the knob is
  // one full revolution around the shape. ELEV stops at ±89 because the rig is a
  // turntable and the pole is a flip rather than a view.
  knob1: { kind: "control", id: "camAzim" },
  knob2: { kind: "control", id: "camElev" },
  knob3: { kind: "control", id: "fog" },

  // The five view presets, in the order viewPresets.ts declares them, so the
  // buttons read left to right the way the chips do.
  solo1: { kind: "viewPreset", key: "FRNT" },
  solo2: { kind: "viewPreset", key: "BACK" },
  solo3: { kind: "viewPreset", key: "TOP" },
  solo4: { kind: "viewPreset", key: "SIDE" },
  solo5: { kind: "viewPreset", key: "ISO" },

  // Two buttons where the console has one. Neither toggles: PLAY on a running
  // scene does nothing, and so does STOP on a paused one.
  play: { kind: "action", id: "resumeLoop" },
  stop: { kind: "action", id: "pauseLoop" },
  record: { kind: "action", id: "toggleTheatre" },

  // The only input that reaches all thirty-two primitives. The keyboard's digit
  // row stops at nine, which shortcuts.ts is explicit about: it will not print a
  // range promising keys no keyboard has.
  trackPrev: { kind: "step", id: "stepPrimitive", by: -1 },
  trackNext: { kind: "step", id: "stepPrimitive", by: 1 },

  // RESET restores every registered slice while the faders keep their positions,
  // so the two disagree until the next touch. That is inherent to absolute
  // takeover and it is self-healing: one detent on any fader re-asserts it.
  markerSet: { kind: "action", id: "resetControls" },

  markerPrev: { kind: "step", id: "stepShadingMode", by: -1 },
  markerNext: { kind: "step", id: "stepShadingMode", by: 1 },
};

export default midiBindings;
