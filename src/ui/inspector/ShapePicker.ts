// The primitive picker: a dropdown, not a grid.
//
// It went out once as a grid of chips and came back — fourteen tiles is a wall,
// and it pushed TRANSFORM and MATERIAL off the bottom of the inspector. This is
// the shape the console had before the refonte, a closed control that opens a
// list, with the two things the old <select> could not carry: the registry
// triangle count, and a real rendered picture of the solid.
//
// Not a native <select>. An <option> may contain text and nothing else — no
// canvas, no second line — which is the whole reason this is hand-built. The
// cost is the keyboard and the dismiss behaviour, both of which are here:
// Escape closes and returns focus, an outside pointerdown closes, and every
// option is a real button so Tab and Enter work without a roving tabindex.

import DOMScope from "@ui/DOMScope";

export interface ShapeOption {
  id: string;
  label: string;
  count: string;
  thumbnail: HTMLCanvasElement;
}

// One section of the list. The picker takes groups rather than a flat array
// because twenty names in one column is already a wall to scan, and half of them
// are COS-201 polyhedra with near-identical spellings. What it does NOT take is
// a family: which sections exist and what order they come in is the caller's
// business, and this class only knows it was handed a heading and some options.
export interface ShapeOptionGroup {
  label: string;
  options: ShapeOption[];
}

export interface ShapePickerOptions {
  selector: string;
  onPick: (id: string) => void;
}

class ShapePicker {
  private readonly root: HTMLElement;
  private readonly trigger: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly onPick: (id: string) => void;
  private readonly options: Map<string, HTMLButtonElement>;
  private readonly faces: Map<string, ShapeOption>;
  private readonly faceThumb: HTMLCanvasElement;
  private readonly faceLabel: HTMLElement;
  private readonly faceCount: HTMLElement;
  private activeId: string | null;

  constructor(options: ShapePickerOptions) {
    const scope = new DOMScope(document);

    this.root = scope.require<HTMLElement>(options.selector, "PRIMITIVE picker is missing.");
    this.onPick = options.onPick;
    this.options = new Map();
    this.faces = new Map();
    this.activeId = null;

    this.trigger = document.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "shape-picker__trigger";
    this.trigger.setAttribute("aria-haspopup", "listbox");
    this.trigger.setAttribute("aria-expanded", "false");
    // Marks for the demo harness (HAL-192): the closed control and, below, each
    // row with the shape it stands for. data-chip-id on the rows is ChipGrid's
    // vocabulary, borrowed for the styling the two share, and is not the pair.
    this.trigger.dataset.testid = "shape-picker";
    this.trigger.addEventListener("click", this.toggle);

    // The closed control owns its own three nodes rather than cloning the
    // chosen option's. cloneNode copies a <canvas> element but not its bitmap,
    // so a cloned face renders blank — the picture has to be blitted across
    // with drawImage, which needs a canvas of our own to blit into.
    this.faceThumb = document.createElement("canvas");
    this.faceThumb.className = "shape-picker__thumb";
    this.faceThumb.setAttribute("aria-hidden", "true");
    this.faceLabel = document.createElement("span");
    this.faceLabel.className = "shape-picker__label";
    this.faceCount = document.createElement("span");
    this.faceCount.className = "shape-picker__count";
    this.trigger.append(this.faceThumb, this.faceLabel, this.faceCount, this.buildChevron());

    this.list = document.createElement("div");
    this.list.className = "shape-picker__list";
    this.list.setAttribute("role", "listbox");
    this.list.hidden = true;

    this.root.append(this.trigger, this.list);
    document.addEventListener("pointerdown", this.onDocumentPointerDown);
    document.addEventListener("keydown", this.onKeyDown);
  }

  // The internals stay flat. `options` and `faces` are keyed by shape id with no
  // notion of a section, which is what leaves setActive, the closed face and the
  // Escape path untouched by the grouping.
  public setOptions(groups: ShapeOptionGroup[]) {
    const fragment = document.createDocumentFragment();

    this.options.clear();
    this.faces.clear();
    groups.forEach((group) => {
      fragment.appendChild(this.buildGroup(group));
    });

    this.list.replaceChildren(fragment);
    // The options arrive after the first setActive, so the closed face has to
    // be filled in once they exist.
    this.setActive(this.activeId);
  }

  // Idempotent: the active shape is republished on every transition tick, so
  // this runs far more often than anyone clicks.
  public setActive(id: string | null) {
    this.activeId = id;

    this.options.forEach((option, optionId) => {
      const active = optionId === id;
      option.classList.toggle("is-active", active);
      option.setAttribute("aria-selected", String(active));
    });

    const source = id === null ? null : this.faces.get(id);

    if (!source) {
      return;
    }

    // Mirrors the chosen option rather than keeping a second copy of the text:
    // one source, and no way for the closed control to disagree with the list.
    this.faceLabel.textContent = source.label;
    this.faceCount.textContent = source.count;
    this.faceThumb.width = source.thumbnail.width;
    this.faceThumb.height = source.thumbnail.height;
    this.faceThumb.getContext("2d")?.drawImage(source.thumbnail, 0, 0);
  }

  public dispose() {
    document.removeEventListener("pointerdown", this.onDocumentPointerDown);
    document.removeEventListener("keydown", this.onKeyDown);
  }

  // role="group" with an aria-label, wrapping its options — not a heading
  // element dropped between them. A listbox may contain options and groups of
  // options and nothing else, so a bare <span> sibling would be announced as
  // loose text inside the list; the wrapper is what turns the section name into
  // a label the options are announced *under*.
  //
  // The visible heading is therefore the label's second copy, and is hidden from
  // the accessibility tree and left unfocusable: it is a <span>, so it takes no
  // tab stop, and aria-hidden keeps the name from being read twice.
  private buildGroup(group: ShapeOptionGroup): HTMLElement {
    const wrapper = document.createElement("div");

    wrapper.className = "shape-picker__group";
    wrapper.setAttribute("role", "group");
    wrapper.setAttribute("aria-label", group.label);

    const heading = document.createElement("span");
    heading.className = "shape-picker__group-label";
    heading.setAttribute("aria-hidden", "true");
    heading.textContent = group.label;
    wrapper.appendChild(heading);

    group.options.forEach((shape) => {
      const option = this.buildOption(shape);
      this.options.set(shape.id, option);
      this.faces.set(shape.id, shape);
      wrapper.appendChild(option);
    });

    return wrapper;
  }

  private buildOption(shape: ShapeOption): HTMLButtonElement {
    const option = document.createElement("button");

    option.type = "button";
    option.className = "shape-picker__option";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.dataset.chipId = shape.id;
    option.dataset.testid = "shape-option";
    option.dataset.shape = shape.id;

    const label = document.createElement("span");
    label.className = "shape-picker__label";
    label.textContent = shape.label;

    const count = document.createElement("span");
    count.className = "shape-picker__count";
    count.textContent = shape.count;

    option.append(shape.thumbnail, label, count);
    option.addEventListener("click", () => {
      this.close();
      this.onPick(shape.id);
    });

    return option;
  }

  private buildChevron(): HTMLElement {
    const chevron = document.createElement("span");

    chevron.className = "shape-picker__chevron";
    chevron.setAttribute("aria-hidden", "true");

    return chevron;
  }

  private toggle = () => {
    if (this.list.hidden) {
      this.open();
      return;
    }

    this.close();
  };

  private open() {
    this.list.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    this.root.classList.add("is-open");
    this.publishSpaceBelow();

    const active = this.activeId === null ? null : this.options.get(this.activeId);
    active?.focus();
  }

  // How much room the open list actually has under it, which is the one input
  // inspector.css cannot work out for itself: the list is absolutely
  // positioned, so where its top lands depends on where the whole inspector was
  // laid out. Published as a raw measurement — the stylesheet subtracts its own
  // gutter token and clamps against the floor, because a spacing value belongs
  // in the spacing tokens and not in a number computed here.
  //
  // Measured against the box that will CLIP the list, not against the viewport,
  // and the difference is the whole correctness of this. `.inspector__body`
  // scrolls (`overflow: auto`), so a list grown to the bottom of the *window*
  // does not overflow the panel and scroll internally — it lengthens the
  // panel's own scroll content, and the rows past the fold are reached by
  // scrolling the inspector instead of the list. Which is the behaviour this
  // whole change exists to remove.
  //
  // After `hidden = false`, never before: a display:none element measures zero
  // and the list would be pinned to its floor forever. Reading the rect forces
  // the layout that has just been invalidated, which is the cost of measuring
  // at all and is paid once per open rather than per frame.
  //
  // Re-measured on every open rather than cached: the inspector scrolls and the
  // window resizes, so a value taken once at construction is wrong the second
  // time the control is used.
  private publishSpaceBelow() {
    const spaceBelow = this.clipBottom() - this.list.getBoundingClientRect().top;

    this.list.style.setProperty("--size-picker-space-below", `${Math.round(spaceBelow)}px`);
  }

  // The nearest ancestor that would cut the list off, found rather than named.
  // Naming `.inspector__body` here would tie a control that knows only its own
  // root to one panel's markup; asking the DOM which box clips it keeps the
  // question the widget's own. The viewport is the answer when nothing does.
  private clipBottom(): number {
    for (let node = this.root.parentElement; node !== null; node = node.parentElement) {
      const { overflowY } = window.getComputedStyle(node);

      if (overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden") {
        return node.getBoundingClientRect().bottom;
      }
    }

    return window.innerHeight;
  }

  private close() {
    this.list.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    this.root.classList.remove("is-open");
  }

  // pointerdown rather than click: a click that starts inside the list and ends
  // outside it would otherwise close the control mid-interaction.
  private onDocumentPointerDown = (event: PointerEvent) => {
    if (this.list.hidden || this.root.contains(event.target as Node)) {
      return;
    }

    this.close();
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || this.list.hidden) {
      return;
    }

    this.close();
    // Focus goes back to the control that opened the list, or it lands on the
    // body and the next Tab starts from the top of the page.
    this.trigger.focus();
  };
}

export default ShapePicker;
