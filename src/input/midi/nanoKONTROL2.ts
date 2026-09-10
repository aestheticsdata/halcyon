// The KORG nanoKONTROL2's surface, as data.
//
// This is a datasheet, not a configuration: it says which Control Change number
// each physical control sends and what that control is called on the case. It
// says nothing about what any of them do — that is midiBindings.ts, which names
// the ids below and never a number.
//
// The split is the whole ergonomics of the feature. A CC number is a fact about
// the device that the KORG Kontrol Editor can rewrite, and a binding is a fact
// about Halcyon; keeping them in one table would mean re-deriving every binding
// after a firmware scene change. Here, a unit that does not match the factory
// scene is corrected once in this file and every binding follows it.
//
// The numbers below are FACTORY SCENE 1 in CC mode. They are the documented
// defaults and they are what an untouched unit sends; a unit that has been
// through the Kontrol Editor, or that is switched into its DAW/Mackie mode, will
// disagree — in DAW mode the buttons send Note On/Off rather than CC at all,
// which this layer does not read. hardwaretester.com/midi is the quickest way to
// read the truth off a given unit.
//
// Every control on the case is listed, including the many nothing binds today.
// That is deliberate: the promise of the binding table is that pointing a
// physical control at a parameter is one line, and that is only true while every
// physical control already has a name.

export interface MIDIControlSpec {
  // The stable name a binding names. Never displayed.
  id: string;
  // What the device sends on channel 1.
  cc: number;
  // What is printed on the case, and what the bindings panel prints.
  label: string;
}

// `as const satisfies` rather than an annotation, and the distinction is
// load-bearing: an annotated export widens `id` back to `string`, which would
// undo the literal union derived below and leave the binding table unchecked.
// The same trade viewPresets.ts makes, and for the same reason.
const CONTINUOUS = [
  { id: "fader1", cc: 0, label: "FADER 1" },
  { id: "fader2", cc: 1, label: "FADER 2" },
  { id: "fader3", cc: 2, label: "FADER 3" },
  { id: "fader4", cc: 3, label: "FADER 4" },
  { id: "fader5", cc: 4, label: "FADER 5" },
  { id: "fader6", cc: 5, label: "FADER 6" },
  { id: "fader7", cc: 6, label: "FADER 7" },
  { id: "fader8", cc: 7, label: "FADER 8" },
  { id: "knob1", cc: 16, label: "KNOB 1" },
  { id: "knob2", cc: 17, label: "KNOB 2" },
  { id: "knob3", cc: 18, label: "KNOB 3" },
  { id: "knob4", cc: 19, label: "KNOB 4" },
  { id: "knob5", cc: 20, label: "KNOB 5" },
  { id: "knob6", cc: 21, label: "KNOB 6" },
  { id: "knob7", cc: 22, label: "KNOB 7" },
  { id: "knob8", cc: 23, label: "KNOB 8" },
] as const satisfies readonly MIDIControlSpec[];

// The buttons send 127 on press and 0 on release, which is what makes the router
// able to act on an edge rather than twice per press. A unit whose buttons have
// been switched to Toggle behaviour in the Kontrol Editor sends 127 and then 0 on
// ALTERNATE presses instead, and every action bound here would fire on half of
// them — a scene change this file cannot detect and the panel cannot show.
const BUTTONS = [
  { id: "solo1", cc: 32, label: "SOLO 1" },
  { id: "solo2", cc: 33, label: "SOLO 2" },
  { id: "solo3", cc: 34, label: "SOLO 3" },
  { id: "solo4", cc: 35, label: "SOLO 4" },
  { id: "solo5", cc: 36, label: "SOLO 5" },
  { id: "solo6", cc: 37, label: "SOLO 6" },
  { id: "solo7", cc: 38, label: "SOLO 7" },
  { id: "solo8", cc: 39, label: "SOLO 8" },
  { id: "mute1", cc: 48, label: "MUTE 1" },
  { id: "mute2", cc: 49, label: "MUTE 2" },
  { id: "mute3", cc: 50, label: "MUTE 3" },
  { id: "mute4", cc: 51, label: "MUTE 4" },
  { id: "mute5", cc: 52, label: "MUTE 5" },
  { id: "mute6", cc: 53, label: "MUTE 6" },
  { id: "mute7", cc: 54, label: "MUTE 7" },
  { id: "mute8", cc: 55, label: "MUTE 8" },
  { id: "rec1", cc: 64, label: "REC 1" },
  { id: "rec2", cc: 65, label: "REC 2" },
  { id: "rec3", cc: 66, label: "REC 3" },
  { id: "rec4", cc: 67, label: "REC 4" },
  { id: "rec5", cc: 68, label: "REC 5" },
  { id: "rec6", cc: 69, label: "REC 6" },
  { id: "rec7", cc: 70, label: "REC 7" },
  { id: "rec8", cc: 71, label: "REC 8" },
  { id: "trackPrev", cc: 58, label: "TRACK ◀" },
  { id: "trackNext", cc: 59, label: "TRACK ▶" },
  { id: "cycle", cc: 46, label: "CYCLE" },
  { id: "markerSet", cc: 60, label: "MARKER SET" },
  { id: "markerPrev", cc: 61, label: "MARKER ◀" },
  { id: "markerNext", cc: 62, label: "MARKER ▶" },
  { id: "rewind", cc: 43, label: "REW" },
  { id: "forward", cc: 44, label: "FF" },
  { id: "stop", cc: 42, label: "STOP" },
  { id: "play", cc: 41, label: "PLAY" },
  { id: "record", cc: 45, label: "REC" },
] as const satisfies readonly MIDIControlSpec[];

// A fader or a knob sends a position, so it can only drive a value; a button
// sends a press, so it can only run an action. Splitting the vocabulary here is
// what lets the binding table make the wrong pairing unrepresentable rather than
// merely unlikely — a control target on `play` is a compile error, not a message
// the router quietly drops.
export type ContinuousControlName = (typeof CONTINUOUS)[number]["id"];
export type ButtonControlName = (typeof BUTTONS)[number]["id"];
export type MIDIControlName = ContinuousControlName | ButtonControlName;

export const continuousControls: readonly MIDIControlSpec[] = CONTINUOUS;
export const buttonControls: readonly MIDIControlSpec[] = BUTTONS;

// Every control on the case, in the order the panel prints them: the two banks
// of continuous controls, then the buttons.
const nanoKONTROL2: readonly MIDIControlSpec[] = [...CONTINUOUS, ...BUTTONS];

export default nanoKONTROL2;
