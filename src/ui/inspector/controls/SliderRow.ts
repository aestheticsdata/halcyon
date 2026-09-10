// One labelled range input with a formatted read-out.
//
// One markup shape serves both branches: a head line carrying the label and the
// value, then the input. On desktop slider.css lays that out as a row — label
// column, track, value column — and on mobile it restacks the head above a
// full-width track. Neither arrangement needs a second DOM, which is why the
// head element exists on desktop too even though it looks like a wrapper doing
// nothing there.
//
// The row owns its formatting because the number beside a slider is part of the
// control, not telemetry: SPIN reads `1.0/s`, SCALE reads `1.00x`, the rates
// read a bare signed integer. Callers pass a format hook rather than a unit
// string, since two of the five divide before they print.

import type ControlRegistry from "@ui/ControlRegistry";
import type { ControlId } from "@ui/ControlRegistry";

export interface SliderRowOptions {
  label: string;
  min: number;
  max: number;
  value: number;
  format: (value: number) => string;
  onInput: (value: number) => void;
  // The registry a hardware surface reaches this row through, and the name it
  // knows the row by. Both or neither.
  //
  // The registration is assembled HERE rather than by the section, and that is
  // the point of it being an option at all: an entry has to move the thumb and
  // then run what onInput runs, and setValue() deliberately does not fire
  // onInput. A section writing the pair by hand writes the second half and the
  // engine moves while the track stays where it was. This row is also the only
  // object that holds the label, the bounds and the callback at once, so it is
  // the only one that can fill an entry without a second copy of any of them.
  controls?: ControlRegistry;
  controlId?: ControlId;
  // Set when the control has no engine behind it. The row still moves and still
  // stores its value; it simply changes nothing on the canvas.
  placeholder?: { title: string; describedBy: string };
  // The opacity row hands its own id over, because RenderPipelinePanel resolves
  // that element by id to own `disabled` and the follow-cursor tooltip.
  inputId?: string;
  // A data-testid on the range input, for the demo harness (HAL-192). The rows
  // are otherwise told apart only by the label they print, and a take that
  // aimed at a word would break on the first rewording.
  testId?: string;
}

class SliderRow {
  private readonly root: HTMLLabelElement;
  private readonly input: HTMLInputElement;
  private readonly valueNode: HTMLElement;
  private readonly labelNode: HTMLElement;
  private readonly format: (value: number) => string;
  // Held as numbers as well as written onto the element, so setValue can clamp
  // in the same space its caller reads back rather than parsing the attribute
  // again on every write.
  private readonly min: number;
  private readonly max: number;

  constructor(options: SliderRowOptions) {
    this.format = options.format;
    this.min = options.min;
    this.max = options.max;

    this.root = document.createElement("label");
    this.root.className = "slider-row";

    const head = document.createElement("span");
    head.className = "slider-row__head";

    this.labelNode = document.createElement("span");
    this.labelNode.className = "slider-row__label";
    this.labelNode.textContent = options.label;

    this.valueNode = document.createElement("span");
    this.valueNode.className = "slider-row__value";

    this.input = document.createElement("input");
    this.input.type = "range";
    this.input.min = String(options.min);
    this.input.max = String(options.max);
    this.input.value = String(options.value);

    if (options.inputId) {
      this.input.id = options.inputId;
      this.root.htmlFor = options.inputId;
    }

    if (options.testId) {
      this.input.dataset.testid = options.testId;
    }

    if (options.placeholder) {
      this.input.dataset.placeholder = "true";
      this.input.title = options.placeholder.title;
      this.input.setAttribute("aria-describedby", options.placeholder.describedBy);
    }

    head.append(this.labelNode, this.valueNode);
    this.root.append(head, this.input);

    // `input`, not `change`: a range fires `change` only on release, which would
    // make the read-out lag the thumb by the length of the drag.
    this.input.addEventListener("input", () => {
      const value = Number.parseInt(this.input.value, 10);
      this.writeValue(value);
      options.onInput(value);
    });

    this.writeValue(options.value);

    if (options.controls && options.controlId) {
      options.controls.register(options.controlId, {
        label: options.label,
        min: options.min,
        max: options.max,
        // The row's opening value IS its default — the sections seed both from
        // the same constant — and it is what a fader's midpoint resolves to.
        defaultValue: options.value,
        apply: (value) => {
          // The row's answer rather than the caller's, for the reason setValue
          // itself gives: this is the one place that knows the range, so it is
          // the one place that can say which number survived it.
          options.onInput(this.setValue(value));
        },
      });
    }
  }

  public get element(): HTMLElement {
    return this.root;
  }

  public get inputElement(): HTMLInputElement {
    return this.input;
  }

  // Used by RESET, which writes the store's defaults back through the rows
  // rather than rebuilding them, and by preset load (E8b), which writes numbers
  // that came off disk.
  //
  // Returns what was actually applied, and clamps to get there. The element
  // sanitises an out-of-range assignment on its own, so without this the thumb,
  // the printed value and the engine would disagree about the same write: the
  // track would sit at its end, the read-out would print 99999, and the caller
  // would hand 99999 to the rig. This row is the one place that knows the range,
  // so it is the one place that can answer with the number that survived it.
  public setValue(value: number): number {
    const applied = Math.min(this.max, Math.max(this.min, value));

    this.input.value = String(applied);
    this.writeValue(applied);

    return applied;
  }

  // slider.css already paints the disabled track and thumb. What it cannot
  // reach is the row's own label and value, which otherwise stay at full
  // contrast beside a control that cannot be moved.
  public setDisabled(disabled: boolean) {
    this.input.disabled = disabled;
    this.input.setAttribute("aria-disabled", String(disabled));
    this.root.classList.toggle("is-disabled", disabled);
  }

  private writeValue(value: number) {
    this.valueNode.textContent = this.format(value);
  }
}

export default SliderRow;
