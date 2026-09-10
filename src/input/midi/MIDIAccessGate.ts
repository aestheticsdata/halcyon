// Everything between the browser's MIDI permission and a stream of bytes.
//
// This is the only class in the feature that touches a platform API, which is
// why it holds no routing logic at all: it grants, attaches, watches and reports,
// and hands every message straight on. The half worth asserting lives in
// MIDIBindingRouter, in the node suite, behind a seam this class never crosses.
//
// Access is requested from a press and never at boot. Chrome prompts for Web MIDI
// and remembers a refusal per origin, so a request fired from the opening frame
// is one the user dismisses by accident and can then never be asked again —
// there would be nothing left to click. It also means a visitor who has never
// seen a controller is never prompted by a portfolio page.
//
// The device attaching AFTER the page is the normal case, not an edge case: the
// console is open, the KORG gets plugged in, and without onstatechange that
// produces nothing, silently, for the rest of the session. Every input is
// listened to rather than one matched by name, so any class-compliant surface
// works and no string has to track how an OS spells a product.

export type MIDIConnectionState =
  // No Web MIDI in this browser at all — Safari, as of writing.
  | "unsupported"
  // Nothing has been asked for yet.
  | "idle"
  | "requesting"
  // The prompt was refused, or the origin remembers a refusal.
  | "denied"
  // Access granted, no input attached. The overwhelmingly common cause is a
  // controller that is not plugged in yet, which onstatechange will catch.
  | "waiting"
  | "connected";

export interface MIDIStatus {
  state: MIDIConnectionState;
  // Every attached input, in the order the browser reports them. Empty unless
  // the state is "connected".
  devices: readonly string[];
}

export interface MIDIAccessGateOptions {
  onMessage: (data: Uint8Array) => void;
  onStatus: (status: MIDIStatus) => void;
}

class MIDIAccessGate {
  private readonly onMessage: (data: Uint8Array) => void;
  private readonly onStatus: (status: MIDIStatus) => void;
  private readonly attached: MIDIInput[];
  private access: MIDIAccess | null;
  private state: MIDIConnectionState;

  constructor(options: MIDIAccessGateOptions) {
    this.onMessage = options.onMessage;
    this.onStatus = options.onStatus;
    this.attached = [];
    this.access = null;
    this.state = MIDIAccessGate.supported() ? "idle" : "unsupported";
  }

  // Read before offering the control at all, so a browser without Web MIDI shows
  // a reason rather than a button that can only fail.
  public static supported(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
  }

  public get status(): MIDIStatus {
    return { state: this.state, devices: this.attached.map((input) => input.name ?? "MIDI INPUT") };
  }

  // What this origin has already been told, read without asking. Chrome keeps
  // its answer per origin, and a refused origin presents exactly like one that
  // was never asked — right up to the press that silently fails. The API has no
  // other way to see the difference, and the person holding the hardware had no
  // way to see it at all: "nothing happens" was the whole report.
  //
  // Read at boot so the card says BLOCKED before anything is pressed. And when
  // the answer is already yes, connect on the spot: that is the one case where
  // connecting without a press shows nobody a prompt, so the rule that access
  // is never requested automatically still holds — nothing is being requested.
  public async probe() {
    if (this.state === "unsupported") {
      return;
    }

    let outcome: PermissionState;

    try {
      // "midi" is not in TypeScript's PermissionName union; it is what Chrome
      // answers to, and a browser that does not know it throws, which is the
      // idle state anyway.
      outcome = (await navigator.permissions.query({ name: "midi" as PermissionName })).state;
    } catch {
      return;
    }

    if (outcome === "granted") {
      await this.connect();
    } else if (outcome === "denied") {
      this.publish("denied");
    }
  }

  // Safe to call again: a second press while already connected re-attaches
  // rather than doubling the listeners, and a press after a refusal re-prompts,
  // which is the whole reason this is a button.
  public async connect() {
    if (this.state === "unsupported") {
      this.publish("unsupported");

      return;
    }

    if (this.access) {
      this.reattach();

      return;
    }

    this.publish("requesting");

    try {
      // Without sysex: nothing here reads or sends a system-exclusive message,
      // and asking for it widens the permission the user is shown for nothing.
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch {
      this.publish("denied");

      return;
    }

    this.access.onstatechange = this.onStateChange;
    this.reattach();
  }

  public dispose() {
    this.detach();

    if (this.access) {
      this.access.onstatechange = null;
      this.access = null;
    }
  }

  // An arrow property, R9's sanctioned case: it is assigned to onstatechange as
  // a value and needs its own `this` back.
  private onStateChange = () => {
    this.reattach();
  };

  private reattach() {
    this.detach();

    if (!this.access) {
      return;
    }

    this.access.inputs.forEach((input) => {
      input.onmidimessage = this.onMIDIMessage;
      this.attached.push(input);
    });

    this.publish(this.attached.length > 0 ? "connected" : "waiting");
  }

  private detach() {
    for (const input of this.attached) {
      input.onmidimessage = null;
    }

    this.attached.length = 0;
  }

  private onMIDIMessage = (event: MIDIMessageEvent) => {
    if (event.data) {
      this.onMessage(event.data);
    }
  };

  private publish(state: MIDIConnectionState) {
    this.state = state;
    this.onStatus(this.status);
  }
}

export default MIDIAccessGate;
