// An N-column grid of chips, with one active at a time.
//
// Shared by all three inspector tabs — the shape picker, the texture picker,
// the shading modes, the view presets — because they are the same control with
// different labels and a different column count. It emits classes and manages
// `.is-active`; every colour, size and hover state is chip.css's.
//
// Chips are <button type="button"> rather than divs with a click handler: that
// is what makes them tab-reachable, space/enter-activatable and announced as
// controls, for free and without a roving-tabindex implementation.

import DOMScope from "@ui/DOMScope";

export interface ChipDescriptor {
  id: string;
  label: string;
  // The second line, e.g. a triangle count. Omitted for single-line chips.
  meta?: string;
}

export interface ChipGridOptions {
  selector: string;
  // The chip.css modifier this grid's chips wear — `chip--shape`, `chip--tex`.
  modifier: string;
  columns: number;
  onPick: (id: string) => void;
  // Marks every chip as unwired: the grid still works and still stores its
  // choice, it simply drives nothing yet.
  placeholder?: { title: string; describedBy: string };
  // Momentary chips fire and are done: they are actions, not a selection, so
  // none of them ever lights and setActive is inert. The WORLD tab's five view
  // presets are the case — a preset moves the camera somewhere, it does not put
  // the camera into a mode that stays true afterwards, and the design draws them
  // unlit unconditionally. They also drop aria-pressed, because a button with
  // no pressed state announcing one is worse than a plain button.
  momentary?: boolean;
  // A data-testid stamped on every chip of this grid, for the demo harness
  // (HAL-192). Per grid rather than per chip because data-chip-id already says
  // which chip a button is; what it cannot say is which of the five grids the
  // id belongs to, and "WIRE" means one thing here and nothing elsewhere.
  testId?: string;
}

class ChipGrid {
  private readonly root: HTMLElement;
  private readonly modifier: string;
  private readonly onPick: (id: string) => void;
  private readonly placeholder: { title: string; describedBy: string } | null;
  private readonly momentary: boolean;
  private readonly testId: string | null;
  private readonly chips: Map<string, HTMLButtonElement>;

  constructor(options: ChipGridOptions) {
    const scope = new DOMScope(document);

    this.root = scope.require<HTMLElement>(options.selector, "Inspector chip grid is missing.");
    this.modifier = options.modifier;
    this.onPick = options.onPick;
    this.placeholder = options.placeholder ?? null;
    this.momentary = options.momentary ?? false;
    this.testId = options.testId ?? null;
    this.chips = new Map();
    // A custom property rather than a class per count: the column count is a
    // number the grid is given, and chip.css already reads --chip-cols.
    this.root.style.setProperty("--chip-cols", String(options.columns));
  }

  public setChips(descriptors: ChipDescriptor[]) {
    const fragment = document.createDocumentFragment();

    this.chips.clear();
    descriptors.forEach((descriptor) => {
      const chip = this.buildChip(descriptor);
      this.chips.set(descriptor.id, chip);
      fragment.appendChild(chip);
    });

    this.root.replaceChildren(fragment);
  }

  // Idempotent, and it has to be: the active shape is republished on every
  // transition tick, so this runs far more often than the user clicks.
  public setActive(id: string | null) {
    if (this.momentary) {
      return;
    }

    this.chips.forEach((chip, chipId) => {
      const active = chipId === id;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", String(active));
    });
  }

  private buildChip(descriptor: ChipDescriptor): HTMLButtonElement {
    const chip = document.createElement("button");

    chip.type = "button";
    chip.className = `chip ${this.modifier}`;
    chip.dataset.chipId = descriptor.id;

    if (this.testId !== null) {
      chip.dataset.testid = this.testId;
    }

    if (!this.momentary) {
      chip.setAttribute("aria-pressed", "false");
    }

    const label = document.createElement("span");
    label.className = "chip__label";
    label.textContent = descriptor.label;
    chip.appendChild(label);

    if (descriptor.meta !== undefined) {
      const meta = document.createElement("span");
      meta.className = "chip__meta";
      meta.textContent = descriptor.meta;
      chip.appendChild(meta);
    }

    if (this.placeholder) {
      chip.dataset.placeholder = "true";
      chip.title = this.placeholder.title;
      chip.setAttribute("aria-describedby", this.placeholder.describedBy);
    }

    chip.addEventListener("click", () => this.onPick(descriptor.id));

    return chip;
  }
}

export default ChipGrid;
