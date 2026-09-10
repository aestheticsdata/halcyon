// The console's fourth input-documentation surface, beside the SHORTCUTS strip
// and the GESTURES card: what the MIDI surface is doing, and what every control
// on it is bound to.
//
// It prints from the same two tables MIDIBindingRouter dispatches from, which is
// the contract shortcuts.ts already holds the keyboard to — so this card cannot
// advertise a fader the router does not act on, and the router cannot act on one
// this card does not list. Neither side may hardcode a binding.
//
// The CONNECT button is the whole reason this widget exists rather than a status
// field in the bar. Chrome prompts for Web MIDI and remembers a refusal per
// origin: a permission requested automatically at boot is one that can be
// dismissed once and never asked for again, leaving nothing to press. A device
// that is asleep or on a hub that dropped it needs the same second press.
//
// The labels come from the registries rather than from a third table of words:
// a control prints the row's own label, so this card and the inspector cannot
// disagree about what FADER 1 moves.

import midiBindings from "@input/midi/midiBindings";
import nanoKONTROL2 from "@input/midi/nanoKONTROL2";
import DOMScope from "@ui/DOMScope";

import type { MIDIStatus } from "@input/midi/MIDIAccessGate";
import type { MIDITraffic } from "@input/midi/MIDIBindingRouter";
import type { MIDITarget } from "@input/midi/midiBindings";
import type ControlRegistry from "@ui/ControlRegistry";

// What each state says on the card. Written out rather than derived from the
// state name, because "waiting" has to explain itself: access is granted and
// nothing is plugged in, which reads as a failure unless the card says what to
// do about it.
const STATUS_LABELS: Record<MIDIStatus["state"], string> = {
  unsupported: "NOT IN THIS BROWSER",
  idle: "NOT CONNECTED",
  requesting: "ASKING…",
  denied: "PERMISSION REFUSED",
  waiting: "GRANTED — NO DEVICE",
  connected: "CONNECTED",
};

// What to DO about each state, under the state. A label alone was tested
// against a real unit and failed the person holding it: Chrome remembers a
// refused MIDI permission per origin and never prompts for it again, so
// "PERMISSION REFUSED" with no next step is a dead end that looks like a bug
// in the console. The empty strings are the states that need no help.
const STATUS_HINTS: Record<MIDIStatus["state"], string> = {
  unsupported: "Web MIDI needs Chrome, Edge or Opera.",
  idle: "Press CONNECT and allow Chrome's prompt.",
  requesting: "Allow the prompt Chrome is showing.",
  denied: "Blocked for this site. Lock icon → Site settings → MIDI → Allow, then reload.",
  waiting: "Plug the controller in — it attaches on its own.",
  connected: "",
};

export interface MIDIPanelOptions {
  rootSelector: string;
  controls: ControlRegistry;
  onConnect: () => void;
}

class MIDIPanel {
  private readonly controls: ControlRegistry;
  private readonly statusNode: HTMLElement;
  private readonly deviceNode: HTMLElement;
  private readonly trafficNode: HTMLElement;
  private readonly hintNode: HTMLElement;
  private readonly button: HTMLButtonElement;

  constructor(options: MIDIPanelOptions) {
    const scope = new DOMScope(document);
    const root = scope.require<HTMLElement>(options.rootSelector, "MIDI card body is missing.");

    this.controls = options.controls;

    const status = document.createElement("div");
    status.className = "midi__status";

    this.statusNode = document.createElement("span");
    this.statusNode.className = "midi__state";
    this.statusNode.dataset.field = "midiState";

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "btn btn--secondary midi__connect";
    this.button.textContent = "CONNECT";
    this.button.addEventListener("click", options.onConnect);

    status.append(this.statusNode, this.button);

    this.deviceNode = document.createElement("span");
    this.deviceNode.className = "midi__device";

    // The last message seen, whatever it was. A binding table cannot explain
    // silence and cannot explain a unit whose scene has been rewritten; this
    // line answers both without leaving the console.
    this.trafficNode = document.createElement("span");
    this.trafficNode.className = "midi__traffic";

    this.hintNode = document.createElement("span");
    this.hintNode.className = "midi__hint";

    root.append(status, this.hintNode, this.deviceNode, this.trafficNode, this.buildBindings());
    this.setStatus({ state: "idle", devices: [] });
  }

  public setStatus(status: MIDIStatus) {
    this.statusNode.textContent = STATUS_LABELS[status.state];
    this.statusNode.dataset.state = status.state;
    this.hintNode.textContent = STATUS_HINTS[status.state];
    this.hintNode.hidden = STATUS_HINTS[status.state] === "";
    this.deviceNode.textContent = status.devices.join(" · ");

    // Nothing to press in a browser with no Web MIDI at all, and nothing to wait
    // for while the prompt is open.
    this.button.disabled = status.state === "unsupported" || status.state === "requesting";
    this.button.textContent = status.state === "connected" ? "RECONNECT" : "CONNECT";
  }

  // Prints the CC number first, because that is the field a mismatch shows up
  // in and the one that gets corrected in nanoKONTROL2.ts. An unrecognised
  // number says so in place of a name rather than being dropped.
  public setTraffic(traffic: MIDITraffic) {
    // Anything but a Control Change is the interesting case, so it says so
    // plainly instead of being dressed up as a binding that did not match: the
    // unit is talking, in a language this table is not written in.
    if (traffic.kind !== "CC") {
      this.trafficNode.textContent = `${traffic.kind} ${traffic.cc} · ${traffic.value} · not a Control Change`;

      return;
    }

    const name = traffic.control ?? "NOT ON THIS SURFACE";
    const state = traffic.bound ? "" : " · unbound";

    this.trafficNode.textContent = `CC ${traffic.cc} · ${traffic.value} · ${name}${state}`;
  }

  // Walked in the datasheet's order rather than the binding table's, so the rows
  // read down the case — faders, knobs, then buttons — however the bindings
  // happen to be written.
  private buildBindings(): HTMLElement {
    const list = document.createElement("div");
    list.className = "midi__bindings";

    for (const spec of nanoKONTROL2) {
      const target = (midiBindings as Record<string, MIDITarget | undefined>)[spec.id];

      if (!target) {
        continue;
      }

      list.append(this.buildRow(spec.label, this.describe(target)));
    }

    return list;
  }

  private buildRow(control: string, effect: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "midi__row";

    const left = document.createElement("span");
    left.className = "midi__control";
    left.textContent = control;

    const right = document.createElement("span");
    right.className = "midi__effect";
    right.textContent = effect;

    row.append(left, right);

    return row;
  }

  // A control names the inspector row it moves, in that row's own words. The
  // three button kinds name what they do in the console's vocabulary — a step
  // prints its direction, because that is the only thing telling TRACK ◀ from
  // TRACK ▶ and it lives in the binding rather than in the id.
  private describe(target: MIDITarget): string {
    if (target.kind === "control") {
      return this.controls.describe(target.id).label;
    }

    if (target.kind === "viewPreset") {
      return `VIEW ${target.key}`;
    }

    if (target.kind === "step") {
      const noun = target.id === "stepPrimitive" ? "SHAPE" : "SHADING";

      return `${noun} ${target.by > 0 ? "+1" : "−1"}`;
    }

    return target.id.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
  }
}

export default MIDIPanel;
