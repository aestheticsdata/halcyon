// A Control Change becomes a console call.
//
// Everything upstream of this class is bytes and everything downstream is the
// two registries, which is why this is the only file that knows both. It holds
// no state about the console and asks it no questions: a fader's position is
// applied as it arrives, so there is no latch to get stuck and nothing to go
// stale when a mouse moves the same row. The one thing remembered is the last
// byte each continuous control sent, which filters the hardware repeating itself
// and nothing else.
//
// Bind time is when a mistake is reported, which is ActionRegistry's contract
// applied to a table that arrives from a peripheral rather than from markup. It
// is deliberately NOT called at boot: deploy-halcyon.sh runs `pnpm build` alone
// and esbuild does not type-check, so a throw wired into the opening frame would
// take the whole console down for every visitor who has never seen a controller.
// The gate calls this once a device has actually attached, so a bad table is loud
// for the one person holding the hardware and invisible to everyone else. The
// binding suite is what catches it before either.
//
// Two ordering rules are load-bearing and easy to tidy into a bug. Continuous
// messages coalesce to the latest value per control and flush once a frame,
// because every continuous onInput in this console terminates in
// renderPausedFrame() and a two-handed sweep across five faders would otherwise
// force five full repaints per frame. Buttons flush that queue BEFORE they act,
// which is what stops a fader message that arrived in the same frame as MARKER
// SET landing after the reset and silently undoing it.

import viewPresets from "@camera/viewPresets";
import { midiToNormalised } from "@input/midi/midiScaling";
import nanoKONTROL2 from "@input/midi/nanoKONTROL2";

import type { ViewPresetKey } from "@camera/viewPresets";
import type { MIDIBindingTable, MIDITarget } from "@input/midi/midiBindings";
import type ActionRegistry from "@ui/ActionRegistry";
import type ControlRegistry from "@ui/ControlRegistry";
import type { ControlId } from "@ui/ControlRegistry";

// The high nibble of a Control Change status byte. The low nibble is the
// channel, which is deliberately not matched: the surface is already narrowed to
// one device's input port, and a unit sending on channel 2 is a scene setting
// rather than a different instrument.
const CONTROL_CHANGE = 0xb0;
const STATUS_KIND_MASK = 0xf0;

// Every status nibble named, not just the one this router acts on. The reason is
// diagnostic rather than functional: a nanoKONTROL2 switched into its DAW/Mackie
// mode sends Note On/Off from the buttons and Pitch Bend from the faders, and a
// reading that said nothing for those would be indistinguishable from a device
// that is not plugged in. Naming them is what lets the panel say "the unit is
// talking, just not in the language this table is written in".
const STATUS_NAMES: Record<number, string> = {
  128: "NOTE OFF",
  144: "NOTE ON",
  160: "AFTERTOUCH",
  176: "CC",
  192: "PROGRAM",
  208: "PRESSURE",
  224: "PITCH BEND",
  240: "SYSTEM",
};

// A button press. The device sends 127 down and 0 up; the threshold rather than
// an equality keeps the edge well-defined without assuming a fixed velocity.
const PRESS_THRESHOLD = 64;

// The preset order the table's keys resolve against, and the same expression
// CameraSection uses to build its chip row — so the button, the chip and the
// action all agree on which index is TOP.
const VIEW_PRESETS = Object.keys(viewPresets) as ViewPresetKey[];

export interface MIDIBindingRouterOptions {
  controls: ControlRegistry;
  actions: ActionRegistry;
  bindings: MIDIBindingTable;
  // How a coalesced flush gets scheduled. Injected rather than reaching for
  // requestAnimationFrame directly, which is what keeps this class in the node
  // suite: the whole of its ordering behaviour is assertable with a scheduler
  // that runs on demand.
  schedule: (flush: () => void) => number;
  cancel: (handle: number) => void;
  // Every Control Change that arrives, bound or not. The panel prints it, which
  // turns "the KORG does nothing" from a guess into a reading: silence means the
  // device is not reaching the page at all, and a number no binding claims means
  // the unit is not on the factory scene this datasheet describes. Optional,
  // because the router's own behaviour does not depend on it.
  onTraffic?: (traffic: MIDITraffic) => void;
}

interface BoundControl {
  label: string;
  target: MIDITarget;
}

export interface MIDITraffic {
  // What kind of message it was. Anything but "CC" means this router ignored it.
  kind: string;
  cc: number;
  value: number;
  // What the datasheet calls this CC, or null when the number is not on the
  // surface at all — which is itself the answer when a fader reports one.
  control: string | null;
  bound: boolean;
}

class MIDIBindingRouter {
  private readonly controls: ControlRegistry;
  private readonly actions: ActionRegistry;
  private readonly bindings: MIDIBindingTable;
  private readonly schedule: (flush: () => void) => number;
  private readonly cancel: (handle: number) => void;
  private readonly routes: Map<number, BoundControl>;
  private readonly lastByte: Map<number, number>;
  private readonly pending: Map<ControlId, number>;
  private readonly onTraffic: ((traffic: MIDITraffic) => void) | null;
  private scheduled: number | null;

  constructor(options: MIDIBindingRouterOptions) {
    this.controls = options.controls;
    this.actions = options.actions;
    this.bindings = options.bindings;
    this.schedule = options.schedule;
    this.cancel = options.cancel;
    this.routes = new Map();
    this.lastByte = new Map();
    this.pending = new Map();
    this.onTraffic = options.onTraffic ?? null;
    this.scheduled = null;
  }

  // Resolves every binding against the datasheet and both registries, and throws
  // on the first thing that does not exist. Safe to call again — a device that is
  // unplugged and plugged back in re-binds rather than accumulating routes.
  public bind() {
    this.routes.clear();

    for (const spec of nanoKONTROL2) {
      const target = (this.bindings as Record<string, MIDITarget | undefined>)[spec.id];

      if (!target) {
        continue;
      }

      if (this.routes.has(spec.cc)) {
        throw new Error(`Two controls in the nanoKONTROL2 datasheet claim CC ${spec.cc}.`);
      }

      this.requireTarget(spec.id, target);
      this.routes.set(spec.cc, { label: spec.label, target });
    }
  }

  public receive(data: Uint8Array | readonly number[]) {
    if (data.length < 3) {
      return;
    }

    const [status, controller, value] = data;
    const kind = status & STATUS_KIND_MASK;
    const route = kind === CONTROL_CHANGE ? this.routes.get(controller) : undefined;

    // Reported before any of the three early returns below, and for every kind
    // of message rather than only the one acted on. Each thing it can say is a
    // different fault: a kind other than CC is a unit in DAW mode, a CC the
    // datasheet does not name is a unit whose scene has been rewritten, and an
    // unbound one is simply a control nothing has been pointed at yet. Silence
    // means the messages are not arriving at all, which is the one answer the
    // console could not otherwise give.
    if (this.onTraffic) {
      const spec = kind === CONTROL_CHANGE ? nanoKONTROL2.find((candidate) => candidate.cc === controller) : undefined;

      this.onTraffic({
        kind: STATUS_NAMES[kind] ?? `0x${kind.toString(16)}`,
        cc: controller,
        value,
        control: spec?.label ?? null,
        bound: Boolean(route),
      });
    }

    if (kind !== CONTROL_CHANGE) {
      return;
    }

    if (!route) {
      return;
    }

    if (route.target.kind === "control") {
      this.receiveControl(controller, route.target.id, value);

      return;
    }

    this.receiveButton(route.target, value);
  }

  // The console moved a value on its own — a RESET, a preset load — so whatever
  // a fader said a moment ago is stale and must not land on top of it.
  public clearPending() {
    this.pending.clear();
    this.lastByte.clear();

    if (this.scheduled !== null) {
      this.cancel(this.scheduled);
      this.scheduled = null;
    }
  }

  public dispose() {
    this.clearPending();
    this.routes.clear();
  }

  private receiveControl(controller: number, id: ControlId, value: number) {
    if (this.lastByte.get(controller) === value) {
      return;
    }

    this.lastByte.set(controller, value);
    this.pending.set(id, midiToNormalised(value));

    if (this.scheduled === null) {
      this.scheduled = this.schedule(this.flush);
    }
  }

  private receiveButton(target: MIDITarget, value: number) {
    if (value < PRESS_THRESHOLD) {
      return;
    }

    // Before the action, never after: a press and a fader message can arrive in
    // the same frame, and MARKER SET is a reset.
    this.flush();

    if (target.kind === "action") {
      this.actions.run(target.id);

      return;
    }

    if (target.kind === "step") {
      this.actions.run(target.id, target.by);

      return;
    }

    if (target.kind === "viewPreset") {
      this.actions.run("applyViewPreset", VIEW_PRESETS.indexOf(target.key));
    }
  }

  // An arrow property, and R9's sanctioned case in its second form: it is handed
  // to the injected scheduler as a value and needs its own `this` back.
  private flush = () => {
    if (this.scheduled !== null) {
      this.cancel(this.scheduled);
      this.scheduled = null;
    }

    if (this.pending.size === 0) {
      return;
    }

    // Drained before applying, because an apply can reach back here: a preset
    // load runs through the same registries and calls clearPending().
    const values = [...this.pending];
    this.pending.clear();

    for (const [id, normalised] of values) {
      this.controls.set(id, normalised);
    }
  };

  private requireTarget(name: string, target: MIDITarget) {
    if (target.kind === "control") {
      if (!this.controls.has(target.id)) {
        throw new Error(`"${name}" is bound to the control "${target.id}", which nothing registered.`);
      }

      return;
    }

    const action = target.kind === "viewPreset" ? "applyViewPreset" : target.id;

    if (!this.actions.has(action)) {
      throw new Error(`"${name}" is bound to the action "${action}", which nothing registered.`);
    }

    if (target.kind === "viewPreset" && !VIEW_PRESETS.includes(target.key)) {
      throw new Error(`"${name}" names the view preset "${target.key}", which the preset table does not have.`);
    }
  }
}

export default MIDIBindingRouter;
