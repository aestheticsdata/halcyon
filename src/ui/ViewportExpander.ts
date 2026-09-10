// Theatre mode: the HUD icon that expands the render surface to the whole
// browser window and folds every other pane away in the same CSS transition
// (COS-445).
//
// One attribute is the entire contract. `data-viewport="expanded"` goes on
// #app, beside the data-tab / data-mtab TabGroup already writes there, and
// every visual consequence — the layout collapse in layout.css, the glyph
// swap in hud.css — is a CSS rule keyed off it. That is the same shape
// TabGroup uses for the desktop/mobile split: one attribute write, no second
// code path, nothing here that reads a breakpoint.
//
// The boolean lives in this class rather than in UIStateStore. The store's
// contract is that RESET restores every registered slice; folding the console
// back out on RESET would make a session control double as a scene control,
// which is not what RESET is for.

import DOMScope from "@ui/DOMScope";

const EXPANDED_ATTRIBUTE = "data-viewport";
const EXPANDED_VALUE = "expanded";
const EXPAND_LABEL = "Expand viewport";
const COLLAPSE_LABEL = "Restore console";

class ViewportExpander {
  private readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private expanded: boolean;

  constructor() {
    const scope = new DOMScope(document);

    this.root = scope.require<HTMLElement>("#app", "App shell is missing.");
    this.button = scope.require<HTMLButtonElement>("#viewportExpandToggle", "Viewport expand toggle is missing.");
    this.expanded = false;

    this.button.addEventListener("click", this.onClick);
  }

  // Theatre mode from something that is not this button — the MIDI surface's REC
  // key (HAL-194). It runs the same setExpanded the click does, so the HUD icon
  // and its aria-pressed follow either way.
  //
  // Reached through an ActionRegistry id rather than by putting data-action on
  // #viewportExpandToggle: this class already binds that button's click, and
  // bindDomActions binds every node carrying the attribute — so the button would
  // gain a second listener and toggle straight back on every press. The same
  // hazard TransportBar's header records about RESET.
  public toggle() {
    this.setExpanded(!this.expanded);
  }

  // Nothing calls this today, for the reason Main.dispose() does not either —
  // one console per page load. It exists because the Escape listener below is
  // armed on document while expanded, and a reconstructed console left mid
  // expansion would otherwise leak a listener pointing at a removed button.
  public dispose() {
    this.button.removeEventListener("click", this.onClick);
    document.removeEventListener("keydown", this.onKeyDown);
  }

  private setExpanded(next: boolean) {
    this.expanded = next;

    if (next) {
      this.root.setAttribute(EXPANDED_ATTRIBUTE, EXPANDED_VALUE);
      document.addEventListener("keydown", this.onKeyDown);
    } else {
      this.root.removeAttribute(EXPANDED_ATTRIBUTE);
      document.removeEventListener("keydown", this.onKeyDown);
    }

    this.button.setAttribute("aria-pressed", String(next));
    this.button.setAttribute("aria-label", next ? COLLAPSE_LABEL : EXPAND_LABEL);
  }

  private onClick = () => {
    this.toggle();
  };

  // Armed only while expanded (R9), rather than left on document for the
  // whole session: Escape has no job to do until there is a console to
  // restore, and a permanent listener would have to re-check `this.expanded`
  // on every keystroke instead of simply not being there.
  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.setExpanded(false);
    }
  };
}

export default ViewportExpander;
