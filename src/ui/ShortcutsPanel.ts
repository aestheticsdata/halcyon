// What the console can be driven by, in the form each branch can act on: a strip
// of keyboard chips pinned to the bottom of the right panel on desktop, and a
// GESTURES card in the SCENE tab on mobile.
//
// The two are not the same content translated. A phone has no keyboard, so
// eight key hints there would be pure noise; what a touch user can act on is
// drag, pinch and double-tap, plus a line pointing at the tabs that hold the
// rest. The mockup has no mobile branch for this widget at all — the card is
// this ticket's own answer to that gap.
//
// Neither branch hardcodes a key or a gesture: both render from shortcuts.ts,
// which KeyboardShortcuts dispatches from as well (E8a). Every chip printed here
// now acts on its key, so the dimmed affordance below has nothing to apply to —
// it is kept, and the hint with it, because the rule outlives the current table:
// a binding added for a feature that does not exist yet still has to say so.

import DOMScope from "@ui/DOMScope";
import { GESTURES, PRIMITIVE_COUNT, SHORTCUTS } from "@ui/shortcuts";

import type { ShortcutBinding } from "@ui/shortcuts";

const HINT_ID = "ph-shortcut-pending";
const HINT_TEXT = "Not built yet.";

// The four bindings with no gesture equivalent, rewritten as a place to go
// rather than a key to press. The count is the registry's, not the digit row's:
// the line is about what the SHAPE tab holds, not about what a keystroke reaches.
const POINTER_LINE = `${PRIMITIVE_COUNT} primitives in the SHAPE tab · sky, floor, grid in the WORLD tab`;

export interface ShortcutsPanelOptions {
  chipsSelector: string;
  gesturesSelector: string;
}

class ShortcutsPanel {
  private readonly chipRoot: HTMLElement;
  private readonly gestureRoot: HTMLElement;

  constructor(options: ShortcutsPanelOptions) {
    const scope = new DOMScope(document);

    this.chipRoot = scope.require<HTMLElement>(options.chipsSelector, "Shortcuts strip is missing.");
    this.gestureRoot = scope.require<HTMLElement>(options.gesturesSelector, "GESTURES card body is missing.");

    this.paintChips();
    this.paintGestures();
  }

  private paintChips() {
    const title = document.createElement("span");
    title.className = "shortcuts__title";
    title.textContent = "SHORTCUTS";

    const row = document.createElement("div");
    row.className = "shortcuts__row";
    row.append(...SHORTCUTS.map((binding) => this.buildChip(binding)));

    this.chipRoot.append(title, row);

    // Only when something points at it. The hint is the target of a chip's
    // aria-describedby, and appending it unconditionally left an orphan line of
    // help text under a strip where every chip works.
    if (SHORTCUTS.some((binding) => binding.status === "pendingFeature")) {
      this.chipRoot.append(this.buildHint());
    }
  }

  // The design writes each chip as a single text node, so the 5px inner gap it
  // declares never renders. Splitting the key from the action is what makes the
  // gap real — and <kbd> is the element that says "this is a key" without a
  // second class doing it in prose.
  private buildChip(binding: ShortcutBinding): HTMLElement {
    const chip = document.createElement("span");
    chip.className = "pill shortcuts__chip";

    const key = document.createElement("kbd");
    key.className = "shortcuts__key";
    key.textContent = binding.keyLabel;

    const action = document.createElement("span");
    action.className = "shortcuts__action";
    action.textContent = binding.action;

    chip.append(key, action);

    // Marks for the demo harness (HAL-192): the chip is the one place a binding
    // is on screen, so the take hovers it before pressing the key it prints. The
    // companion is the action id rather than the key, because that is the name
    // the table and the registry already share.
    chip.dataset.testid = "shortcut";

    if (binding.handler) {
      chip.dataset.shortcut = binding.handler;
    }

    // The affordance says "unbuilt", so it may only ever appear on a binding
    // with nothing behind it. Saying it about a key that works would be the
    // same lie in the other direction.
    if (binding.status === "pendingFeature") {
      chip.dataset.placeholder = "true";
      chip.title = HINT_TEXT;
      chip.setAttribute("aria-describedby", HINT_ID);
    }

    return chip;
  }

  private paintGestures() {
    const rows = GESTURES.map((binding) => {
      const row = document.createElement("div");
      row.className = "gestures__row";

      const gesture = document.createElement("span");
      gesture.className = "gestures__gesture";
      gesture.textContent = binding.gesture;

      const effect = document.createElement("span");
      effect.className = "gestures__effect";
      effect.textContent = binding.effect;

      row.append(gesture, effect);

      return row;
    });

    this.gestureRoot.append(...rows, this.buildNote(POINTER_LINE));
  }

  private buildNote(text: string): HTMLElement {
    const note = document.createElement("span");

    note.className = "gestures__note";
    note.textContent = text;

    return note;
  }

  private buildHint(): HTMLElement {
    const hint = document.createElement("span");

    hint.className = "placeholder-hint";
    hint.id = HINT_ID;
    hint.textContent = HINT_TEXT;

    return hint;
  }
}

export default ShortcutsPanel;
