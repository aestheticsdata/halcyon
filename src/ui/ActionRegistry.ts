// The one place a console action is named, and the one place a click or a key
// turns into a call.
//
// Before this there were two dispatch paths that could not see each other: the
// toolbar bound its buttons directly, and shortcuts.ts described eight keys that
// nothing listened for. A chip could therefore print a key no handler bound, and
// a button could do something no chip documented. Both paths now end here, which
// is what makes that drift unrepresentable rather than merely discouraged.
//
// A miss throws, and it throws at BIND time as well as at call time: markup
// carrying data-action="stpeFrame" fails the boot it ships in rather than doing
// nothing the first time somebody presses it. A registry whose misses are silent
// is a registry that lets a typo reach production looking exactly like a
// disabled control.

// Every action the console can perform. The last four joined with E8b and are
// SessionActions' rather than Main's — the only four registered by something
// other than the composition root, because they are the only four whose whole
// implementation is file and clipboard plumbing with no engine in it.
export type ActionId =
  | "togglePause"
  | "resumeLoop"
  | "pauseLoop"
  | "stepFrame"
  | "resetControls"
  | "toggleWireframe"
  | "toggleBackfaceCulling"
  | "toggleSky"
  | "toggleFloor"
  | "toggleGrid"
  | "toggleTheatre"
  | "selectPrimitive"
  | "stepPrimitive"
  | "stepShadingMode"
  | "applyViewPreset"
  | "capturePng"
  | "savePreset"
  | "loadPreset"
  | "copyCode";

// The four that mean nothing without one. Declared as a union of its own so the
// two below can be derived from it rather than restated: a fifth indexed action
// is one edit here and both derived vocabularies follow.
//
// resumeLoop and pauseLoop are NOT among them and are not togglePause either.
// A hardware transport has two buttons where the console has one, and a PLAY that
// paused a running scene because it happened to be a toggle is the surprise this
// separation exists to prevent. All three end in the same private setter.
type IndexedActionId = "selectPrimitive" | "stepPrimitive" | "stepShadingMode" | "applyViewPreset";

// What a binding table may name without supplying anything else. Derived rather
// than listed, so a table cannot go on offering an action the union has since
// given an argument to.
export type PlainActionId = Exclude<ActionId, IndexedActionId>;

// The two that walk a list. Extracted rather than spelled again for the same
// reason, and narrow on purpose: `by` is ±1, so an id that took an absolute index
// would be a step binding that silently jumped.
export type StepActionId = Extract<ActionId, "stepPrimitive" | "stepShadingMode">;

// Only the indexed actions carry an argument, so it is optional rather than a
// parameter the other handlers would each have to ignore.
//
// Deliberately still `number` and not `number | string`, though the MIDI table
// names view presets by their key. Widening it breaks the inference at Main's
// selectPrimitive registration (TS2345), and would make `argument` a channel with
// no correlation to the id at all — every wrong argument becoming a dead button
// rather than a compile error. The binding table carries the typed ViewPresetKey
// and the router resolves it to the index this signature wants, so the conversion
// lives in one place instead of in the type system's blind spot.
type ActionHandler = (argument?: number) => void;

interface BoundAction {
  node: HTMLElement;
  listener: () => void;
}

class ActionRegistry {
  private readonly handlers: Map<ActionId, ActionHandler>;
  private readonly bound: BoundAction[];

  constructor() {
    this.handlers = new Map();
    this.bound = [];
  }

  public register(id: ActionId, handler: ActionHandler) {
    this.handlers.set(id, handler);
  }

  // So a table naming actions can be checked before anything presses one. The
  // DOM path does this inline in bindDomActions below; a binding table arriving
  // from a peripheral needs the same question asked from outside.
  public has(id: ActionId): boolean {
    return this.handlers.has(id);
  }

  public run(id: ActionId, argument?: number) {
    const handler = this.handlers.get(id);

    if (!handler) {
      throw new Error(`No handler is registered for action "${id}".`);
    }

    handler(argument);
  }

  // One listener per [data-action] node, which reaches both toolbar mounts at
  // once — the same "one selector, every mount" shape TransportBar and
  // FieldWriter already use, and the reason no caller has to know the toolbar
  // exists twice in the DOM.
  //
  // Deliberately not a single delegated listener on the app root, which is the
  // obvious alternative and is wrong here: the transport still binds its own
  // toggle mounts directly, so a delegated listener would fire alongside that
  // binding on any node carrying both and every RESET would run twice.
  //
  // Must run after every register() call, since an unregistered id is a boot
  // failure rather than a warning.
  public bindDomActions() {
    for (const node of document.querySelectorAll<HTMLElement>("[data-action]")) {
      const id = node.dataset.action as ActionId;

      if (!this.handlers.has(id)) {
        throw new Error(`Markup names the action "${id}", which nothing registered.`);
      }

      const listener = () => this.run(id);

      node.addEventListener("click", listener);
      this.bound.push({ node, listener });
    }
  }

  // Vite's HMR re-executes the module without tearing the old one down, so
  // without this every button would gain a second listener on each edit and
  // start firing twice.
  public dispose() {
    for (const entry of this.bound) {
      entry.node.removeEventListener("click", entry.listener);
    }

    this.bound.length = 0;
  }
}

export default ActionRegistry;
