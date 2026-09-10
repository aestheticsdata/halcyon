# Driving the console from a MIDI surface

Halcyon's console can be played from a hardware controller over Web MIDI. It shipped
against a KORG nanoKONTROL2 (HAL-194), but nothing below is specific to that unit except
one datasheet file. This is how the mapping works, how to change it, and how to read the
MIDI section when something does not.

## The one-minute version

- **`midiBindings.ts` is the file you edit.** One line per binding, no numbers in it.
- **`nanoKONTROL2.ts` is the datasheet.** The only place a CC number is written. Correct it
  if your unit was remapped; never touch it to change what a control *does*.
- A fader or knob can only drive a **value** (a slider row). A button can only run an
  **action**, **step** a list, or jump to a **view preset**. The compiler enforces this.
- Pointing a knob at something new is one line, *if* that thing is registered. Every
  slider row in the inspector already is. A new action needs a name first — see below.
- Press **CONNECT** in the MIDI section of the SHAPE tab once per origin. Chrome remembers.

## The two tables

The design's central choice is that the hardware and the bindings are separate data.

`nanoKONTROL2.ts` says what the device *is*: for every physical control, the Control
Change number it sends and the label printed on the case.

```ts
{ id: "knob3", cc: 18, label: "KNOB 3" },
```

`midiBindings.ts` says what each control *does*, keyed by those ids:

```ts
knob3: { kind: "control", id: "fog" },
```

The split is the ergonomics of the whole feature. A CC number is a fact about the device
that the KORG Kontrol Editor can rewrite; a binding is a fact about Halcyon. Keep them in
one table and a firmware scene change means re-deriving every binding. Keep them apart and
a remapped unit is corrected in one place, and the file edited day to day carries no magic
numbers at all.

The datasheet lists **every** control on the case, including the many nothing binds. That
is deliberate: "one line to bind" is only true while every physical control already has a
name.

## Four kinds of target

```ts
{ kind: "control",    id: "fog" }                    // a slider row, by its ControlId
{ kind: "action",     id: "resumeLoop" }             // a named action, no argument
{ kind: "step",       id: "stepPrimitive", by: 1 }   // walk a list, ±1, wrapping
{ kind: "viewPreset", key: "TOP" }                   // one of the camera presets
```

They are four arms rather than one `action` with an optional argument, and that is the
design's central *type* decision. `ActionRegistry`'s handler is `(argument?: number)`,
so a single arm would let `{ id: "selectPrimitive" }` with no argument compile, bind, and
then silently do nothing the moment the button is pressed. Split, each arm carries exactly
what its action needs and nothing can carry what it does not.

The table's keys are typed too. Faders and knobs (`ContinuousControlName`) accept only
`control`; buttons (`ButtonControlName`) accept only the other three. All of these fail
`pnpm run typecheck`, with a "did you mean" where TypeScript can offer one:

| mistake | error |
| -- | -- |
| `fader9: …` | TS2561 — *Did you mean to write 'fader1'?* |
| `play: { kind: "control", … }` | a value target on a button |
| `fader1: { kind: "action", … }` | an action target on a fader |
| `{ kind: "viewPreset", key: "TOPP" }` | TS2820 — *Did you mean '"TOP"'?* |
| `{ kind: "step", id: "resetControls", … }` | not a step action |
| `{ kind: "step", …, by: 7 }` | `by` is `-1 \| 1` |
| `{ kind: "control", id: "foh" }` | not a `ControlId` |
| the same key twice | TS1117 |

## How a fader reaches a slider

```
CC byte 0..127
  │  MIDIBindingRouter.receive   (dedupe on the raw byte; coalesce per frame)
  ▼
midiToNormalised(byte)          0 at rest, 1 fully open, exactly 0.5 at 64
  │  ControlRegistry.set(id, normalised)
  ▼
normalisedToValue(t, range)     piecewise: min → default → max
  │  the entry's apply()
  ▼
SliderRow.setValue(v)  then  the row's own onInput(v)   → store + engine, as a drag would
```

Two things in that chain are deliberate and easy to "tidy" into a bug.

**The curve is piecewise, not linear.** Seven bits give 128 positions and an angle row
spans 361 integer degrees, so `min + t · (max − min)` cannot land on the value that matters
most: CC 63 gives −1°, CC 64 gives +1°, and no byte yields 0. SCALE's default of 100 on a
10..300 row is likewise unreachable. So the two halves of the travel interpolate
independently and meet at the row's registered default: fader bottom is the minimum, fully
open is the maximum, and the midpoint is *exactly* what RESET would restore.

**Registration happens inside `SliderRow`, not in the section.** The row is the one object
that holds the label, the bounds, its own clamp and its `onInput` at once. It matters
because `setValue()` deliberately does not fire `onInput`: an entry written by hand at the
section gets one half, and the engine moves while the thumb stays put. A row registers by
being given two options:

```ts
new SliderRow({
  label: "FOG",
  controls: this.controls,   // the ControlRegistry, threaded down from Main
  controlId: "fog",          // the name the binding table uses
  …
});
```

The registry takes a **normalised** position, never a value. The MIDI layer never learns
that PITCH is ±180° while SPIN is 0..244, which is what keeps a new binding a line of data
rather than a line of arithmetic.

## How a button reaches an action

A press sends 127, a release sends 0; the router acts on the press only. `action` runs the
id through `ActionRegistry` — the same registry the toolbar's buttons and the keyboard
shortcuts already dispatch through. `step` runs a step action with `by` as its argument.
`viewPreset` resolves the key to an index against `viewPresets.ts`'s own order and runs
`applyViewPreset`, so a reordered preset table moves the chips and the buttons together
rather than silently re-pointing a button.

Before a button acts, the router **flushes any pending fader values first**. A fader
message and a press can arrive in the same frame, and MARKER SET is a reset: without this
rule the stale fader value lands a frame *after* the reset and silently undoes it.

## Adding a binding

**Point a control at a slider row that already exists** — every row in the inspector is
registered (18 of them: pitch, yaw, roll, spin, scale, uvScale, opacity, the four `light*`
values, camElev, camAzim, camRoll, fov, zoom, fog, gridStep). One line:

```ts
knob4: { kind: "control", id: "gridStep" },
```

**Point a button at an action that already exists** — anything in `ActionId` that takes no
argument. One line:

```ts
mute1: { kind: "action", id: "toggleSky" },
```

**Bind something that has no name yet.** This is the case that costs more than a line, and
the pattern is always the same: promote the private thing to a named `ActionId`.

1. Add the id to the `ActionId` union in `ActionRegistry.ts`. If it takes an index, add it
   to `IndexedActionId` there too, so the derived `PlainActionId` stops offering it.
2. Register a handler for it in `Main.registerActions()`. If the behaviour lives as a
   private method on some class, give that class a public method and call it — do **not**
   put a `data-action` on a button that class already binds, or it will fire twice per press.
3. Bind it.

`toggleTheatre` was added exactly this way: `ViewportExpander.toggle()` made public, one
line in `Main`, one line in the table. Once an action has a name it is reachable from MIDI,
from a keyboard chip, and from anything added later, all at once.

**Remove a binding** by deleting its line. The control becomes unassigned and the section
stops listing it.

## What throws, and when

`pnpm run typecheck` catches every shape error above. `pnpm test` runs
`midiBindings.test.ts`, which checks what the compiler cannot: two datasheet rows claiming
one CC, two physical controls pointed at the same row (they would fight, last message
winning), a step bound in one direction only.

`MIDIBindingRouter.bind()` then checks the table against the two registries at runtime and
throws on the first thing nothing registered. It runs **when a device attaches, never at
boot** — `deploy-halcyon.sh` runs `pnpm build` alone, and esbuild does not type-check, so a
throw wired into the opening frame would take the console down for every visitor who has
never seen a controller. Loud for the one person holding the hardware; invisible to
everyone else.

## The MIDI section, and reading it

It sits in the SHAPE tab under MATERIAL, and it prints from the same two tables the router
dispatches from — the same contract `shortcuts.ts` holds the keyboard to — so it cannot
advertise a binding that does not act.

The state line says what to do next, because a label alone was tested against a real unit
and failed the person holding it:

| state | meaning |
| -- | -- |
| `NOT CONNECTED` | Nothing asked for yet. Press CONNECT and allow the prompt. |
| `PERMISSION REFUSED` | Chrome remembers a refusal for this origin and **will not prompt again**. Lock icon → Site settings → MIDI → Allow, then reload. |
| `GRANTED — NO DEVICE` | Access granted, nothing attached. Plug the controller in; it attaches on its own. |
| `CONNECTED` | Attached. The device name is on the next line. |
| `NOT IN THIS BROWSER` | No Web MIDI — Safari, as of writing. |

**Chrome's permission is the thing that looks like a bug.** It is per origin, and a fresh
origin does not start in a "prompt" state — Chrome reports it as `denied`, and in that state
`requestMIDIAccess` rejects instantly with no prompt shown. Pressing CONNECT then visibly
does nothing. A site where the device "just works" is one whose origin was granted at some
point; `localhost:5173` starts with no such grant. The section reads the permission at boot
and reports it before anything is pressed, and connects on its own when the answer is
already yes — which shows nobody a prompt, so a portfolio visitor is never asked.

The **traffic line** under the device name shows the last message received, bound or not:

| reading | what it means |
| -- | -- |
| `CC 0 · 100 · FADER 1` | factory scene, bound, working |
| `CC 18 · 90 · KNOB 3 · unbound` | a control nothing is pointed at yet |
| `CC 12 · 84 · NOT ON THIS SURFACE · unbound` | the unit is not on the factory scene — that is the real number, correct `nanoKONTROL2.ts` |
| `NOTE ON 41 · 127 · not a Control Change` | the unit is in DAW/Mackie mode: buttons send notes, faders send pitch bend. Put it back in CC mode with the KORG Kontrol Editor. |
| nothing, while `CONNECTED` | messages are not reaching the page |

## Things that are accepted, not bugs

- **A fader is the truth, always.** Takeover is absolute and stateless: the moment you touch
  a fader the row jumps to where the fader is. After RESET, a preset load, or a mouse drag
  on the same row, the first detent re-asserts the fader. There is no latch to get stuck.
- **MARKER SET is RESET.** It restores every slider while the faders keep their positions,
  so they disagree until the next touch. Self-healing by the rule above.
- **A view preset moves the camera out from under knobs 1–2.** Turning a knob mid-ease
  cancels the ease rather than fighting it.
- **RESET leaves the primitive alone**: `PrimitiveSection` has no store slice.
- **TRACK ◀ ▶ step from the shape most recently *asked for***, not the one on screen, so
  fast presses accumulate across the 1250ms transition.
- **`customFrameRateFps` is deliberately not bindable.** Its chip commits on blur or Enter
  and never per keystroke; a fader would re-cap the render loop on every message.
- **Buttons switched to Toggle mode** in the Kontrol Editor send 127 and 0 on alternate
  presses, so every action fires on half of them. Not detectable from here.

## Files

| file | role |
| -- | -- |
| `midiBindings.ts` | **the mapping** — edit this |
| `nanoKONTROL2.ts` | the datasheet — CC numbers and case labels |
| `midiScaling.ts` | the two pure curves: byte → position, position → value |
| `MIDIBindingRouter.ts` | bytes in, registry calls out; coalescing, flush-before-act, bind-time checks |
| `MIDIAccessGate.ts` | the only file touching a platform API: permission, attach, hot-plug |
| `../../ui/ControlRegistry.ts` | the continuous half of `ActionRegistry`; every slider row registers here |
| `../../ui/MIDIPanel.ts` | the section: state, hint, device, traffic, the binding list |
| `__tests__/` | scaling, router ordering, the table's invariants — all in node, no DOM |
