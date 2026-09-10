// ENVIRONMENT: what the scene is made of around the shape.
//
// All six controls are real, and the last two became so with COS-247 (E5b).
// SKY DOME, CHECKER FLOOR and GRID OVERLAY gate layers BackgroundRenderer
// paints, and they are the controls in the console with a second surface
// showing the same switch — the viewport's quick toggles carry SKY, FLOOR and
// GRID as well. That is why all of them write the store and none keeps a
// private boolean: the owner re-reads the store and pushes the result back to
// every surface, so the two can never drift. GRID STEP is real alongside GRID
// OVERLAY, through the same onLayersChange callback — it sizes both the grid's
// own spacing and the floor's checker cell.
//
// GROUND SHADOW and FOG raise that callback too, for the same reason and not
// because they have a second surface: the fog's colour is SKY DOME's answer, so
// the two have to be read in one pass, and one sync path over the whole slice is
// simpler than a handler per control.

import DOMScope from "@ui/DOMScope";
import SliderRow from "@ui/inspector/controls/SliderRow";
import ToggleRow from "@ui/inspector/controls/ToggleRow";

import type ControlRegistry from "@ui/ControlRegistry";
import type UIStateStore from "@ui/UIStateStore";

// Sky and floor default on because both ran unconditionally before they were
// switchable; grid and shadow default off, because the console's opening frame
// is the one the renderer already drew and neither layer was in it.
//
// FOG ships at 0 rather than at the mockup's 18, and that is the same rule
// rather than an exception to it: fog is a second fill over every drawn
// triangle, and opening on a frame that costs more than the one this ticket
// inherited — while looking different from it — is what the de-mock epic
// refuses. The console's defaults mirror the renderer, never the design.
export const DEFAULT_SKY = true;
export const DEFAULT_FLOOR = true;
export const DEFAULT_GRID = false;
export const DEFAULT_SHADOW = false;
export const DEFAULT_FOG = 0;
export const DEFAULT_GRID_STEP = 4;

const FOG_MIN = 0;
const FOG_MAX = 100;
const GRID_STEP_MIN = 1;
const GRID_STEP_MAX = 20;

export interface EnvironmentSectionOptions {
  togglesSelector: string;
  rowsSelector: string;
  store: UIStateStore;
  controls: ControlRegistry;
  // Raised after a layer boolean is written, so the owner can re-read the store
  // and push the result to the renderer and to the quick toggles at once.
  onLayersChange: () => void;
}

class EnvironmentSection {
  private readonly store: UIStateStore;
  private readonly controls: ControlRegistry;
  private readonly skyRow: ToggleRow;
  private readonly floorRow: ToggleRow;
  private readonly gridRow: ToggleRow;
  private readonly shadowRow: ToggleRow;
  private readonly fog: SliderRow;
  private readonly gridStep: SliderRow;

  constructor(options: EnvironmentSectionOptions) {
    const scope = new DOMScope(document);
    const toggles = scope.require<HTMLElement>(options.togglesSelector, "ENVIRONMENT toggles are missing.");
    const rows = scope.require<HTMLElement>(options.rowsSelector, "ENVIRONMENT rows are missing.");

    this.store = options.store;
    this.controls = options.controls;
    this.store.registerSlice({
      sky: DEFAULT_SKY,
      floor: DEFAULT_FLOOR,
      grid: DEFAULT_GRID,
      shadow: DEFAULT_SHADOW,
      fog: DEFAULT_FOG,
      gridStep: DEFAULT_GRID_STEP,
    });

    this.skyRow = new ToggleRow({
      label: "SKY DOME",
      on: DEFAULT_SKY,
      onToggle: (next) => {
        this.store.setState({ sky: next });
        options.onLayersChange();
      },
    });
    this.floorRow = new ToggleRow({
      label: "CHECKER FLOOR",
      on: DEFAULT_FLOOR,
      onToggle: (next) => {
        this.store.setState({ floor: next });
        options.onLayersChange();
      },
    });
    this.gridRow = new ToggleRow({
      label: "GRID OVERLAY",
      on: DEFAULT_GRID,
      onToggle: (next) => {
        this.store.setState({ grid: next });
        options.onLayersChange();
      },
    });
    this.shadowRow = new ToggleRow({
      label: "GROUND SHADOW",
      on: DEFAULT_SHADOW,
      onToggle: (next) => {
        this.store.setState({ shadow: next });
        options.onLayersChange();
      },
    });

    this.fog = new SliderRow({
      label: "FOG",
      testId: "environment-fog",
      controls: this.controls,
      controlId: "fog",
      min: FOG_MIN,
      max: FOG_MAX,
      value: DEFAULT_FOG,
      format: (value) => `${value}%`,
      onInput: (value) => {
        this.store.setState({ fog: value });
        options.onLayersChange();
      },
    });
    // Raises onLayersChange, same as the toggles above: the value it writes
    // feeds BackgroundRenderer.setWorld, which sizes both the grid's spacing
    // and the floor's checker cell.
    this.gridStep = new SliderRow({
      label: "GRID STEP",
      controls: this.controls,
      controlId: "gridStep",
      min: GRID_STEP_MIN,
      max: GRID_STEP_MAX,
      value: DEFAULT_GRID_STEP,
      format: (value) => `${value}m`,
      onInput: (value) => {
        this.store.setState({ gridStep: value });
        options.onLayersChange();
      },
    });

    // Applied here rather than asked for in SliderRow's options: it is a
    // mobile-only padding correction for the one place a slider follows a
    // bottom-ruled toggle row, not a property of the control.
    this.fog.element.classList.add("slider-row--tight-bottom");
    this.gridStep.element.classList.add("slider-row--tight-bottom");

    toggles.append(this.skyRow.element, this.floorRow.element, this.gridRow.element, this.shadowRow.element);
    rows.append(this.fog.element, this.gridStep.element);
  }

  public syncFromStore() {
    const state = this.store.getState();

    this.skyRow.setOn(state.sky ?? DEFAULT_SKY);
    this.floorRow.setOn(state.floor ?? DEFAULT_FLOOR);
    this.gridRow.setOn(state.grid ?? DEFAULT_GRID);
    this.shadowRow.setOn(state.shadow ?? DEFAULT_SHADOW);

    const fog = this.fog.setValue(state.fog ?? DEFAULT_FOG);
    const gridStep = this.gridStep.setValue(state.gridStep ?? DEFAULT_GRID_STEP);

    // Unlike every other slider in the inspector, these two reach the engine
    // from the STORE rather than through the apply callback beside the row —
    // Main reads both in syncWorldLayers — so clamping the track is not enough
    // and the corrected value has to go back. Only a preset file (E8b) can put
    // an out-of-range number there, and GRID STEP is the one that has to be
    // caught: GroundGrid derives its line count as reach / step, so a step of 0
    // makes that Infinity and the frame loop never returns.
    //
    // Written only when the clamp actually moved something, so a drag and a
    // RESET still cost no extra notification.
    if (fog !== state.fog || gridStep !== state.gridStep) {
      this.store.setState({ fog, gridStep });
    }
  }
}

export default EnvironmentSection;
