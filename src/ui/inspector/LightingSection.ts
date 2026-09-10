// LIGHTING: the four sliders behind the key light.
//
// All four are real since E3a (COS-241). AZIMUTH and ELEVATION place one
// directional light in the WORLD — around the vertical and above the ground
// plane E5a built, not across the screen — AMBIENT is the floor the unlit side
// of a shape falls to, and SPECULAR is the strength of a Blinn-Phong highlight
// at a fixed shininess of 32. The scene graph's KEY_LIGHT row reads the same
// light, and hiding it leaves ambient alone.
//
// The section pushes a bare notification rather than the four values, and that
// is deliberate: `enabled` belongs to the scene graph, so a LightingValues
// assembled here would be missing a field or guessing at one. Main reads all
// five off the store in one place instead.

import DOMScope from "@ui/DOMScope";
import SliderRow from "@ui/inspector/controls/SliderRow";

import type ControlRegistry from "@ui/ControlRegistry";
import type UIStateStore from "@ui/UIStateStore";
import type { UIState } from "@ui/UIStateStore";

export const DEFAULT_AZIMUTH = 135;
export const DEFAULT_ELEVATION = 42;
export const DEFAULT_AMBIENT = 30;
export const DEFAULT_SPECULAR = 55;

export interface LightingSectionOptions {
  root: string;
  store: UIStateStore;
  controls: ControlRegistry;
  onChange: () => void;
}

class LightingSection {
  private readonly store: UIStateStore;
  private readonly controls: ControlRegistry;
  private readonly apply: () => void;
  private readonly azimuth: SliderRow;
  private readonly elevation: SliderRow;
  private readonly ambient: SliderRow;
  private readonly specular: SliderRow;

  constructor(options: LightingSectionOptions) {
    const root = new DOMScope(document).require<HTMLElement>(options.root, "LIGHTING section is missing.");

    this.store = options.store;
    this.controls = options.controls;
    this.apply = options.onChange;
    // Four flat fields, not the nested lighting.{azimuth,…} object the ticket
    // asked for: registerSlice and resetAll both Object.assign the slice
    // (UIStateStore.ts), which is a shallow copy — a nested object would be
    // shared by reference between defaults and state, so the first slider drag
    // would mutate the defaults in place and RESET would restore the dragged
    // value instead of undoing it.
    this.store.registerSlice({
      lightAzimuth: DEFAULT_AZIMUTH,
      lightElevation: DEFAULT_ELEVATION,
      lightAmbient: DEFAULT_AMBIENT,
      lightSpecular: DEFAULT_SPECULAR,
    });

    this.azimuth = new SliderRow({
      label: "AZIMUTH",
      testId: "lighting-azimuth",
      controls: this.controls,
      controlId: "lightAzimuth",
      min: 0,
      max: 360,
      value: DEFAULT_AZIMUTH,
      format: (value) => `${value}°`,
      onInput: (value) => this.push({ lightAzimuth: value }),
    });
    this.elevation = new SliderRow({
      label: "ELEVATION",
      controls: this.controls,
      controlId: "lightElevation",
      min: 0,
      max: 90,
      value: DEFAULT_ELEVATION,
      format: (value) => `${value}°`,
      onInput: (value) => this.push({ lightElevation: value }),
    });
    this.ambient = new SliderRow({
      label: "AMBIENT",
      controls: this.controls,
      controlId: "lightAmbient",
      min: 0,
      max: 100,
      value: DEFAULT_AMBIENT,
      format: (value) => `${value}%`,
      onInput: (value) => this.push({ lightAmbient: value }),
    });
    this.specular = new SliderRow({
      label: "SPECULAR",
      controls: this.controls,
      controlId: "lightSpecular",
      min: 0,
      max: 100,
      value: DEFAULT_SPECULAR,
      format: (value) => `${value}%`,
      onInput: (value) => this.push({ lightSpecular: value }),
    });

    root.append(this.azimuth.element, this.elevation.element, this.ambient.element, this.specular.element);
  }

  // Writes the store's values into the rows AND pushes them at the light, the
  // same two halves TransformSection's own sync carries: this is the RESET path,
  // and a reset that moved the sliders without moving the light would leave the
  // frame lit by the values the user had dragged to.
  public syncFromStore() {
    const state = this.store.getState();

    const lightAzimuth = this.azimuth.setValue(state.lightAzimuth ?? DEFAULT_AZIMUTH);
    const lightElevation = this.elevation.setValue(state.lightElevation ?? DEFAULT_ELEVATION);
    const lightAmbient = this.ambient.setValue(state.lightAmbient ?? DEFAULT_AMBIENT);
    const lightSpecular = this.specular.setValue(state.lightSpecular ?? DEFAULT_SPECULAR);

    // The store is what Main assembles LightingValues from, not these rows, so
    // the clamped numbers have to go back into it or a preset file (E8b) could
    // light the scene with values no slider can reach — an ambient of 1000 is a
    // white frame with a control that says 100. Written only when the clamp
    // moved something, so the drag path is untouched.
    if (
      lightAzimuth !== state.lightAzimuth ||
      lightElevation !== state.lightElevation ||
      lightAmbient !== state.lightAmbient ||
      lightSpecular !== state.lightSpecular
    ) {
      this.store.setState({ lightAzimuth, lightElevation, lightAmbient, lightSpecular });
    }

    this.apply();
  }

  private push(patch: Partial<UIState>) {
    this.store.setState(patch);
    this.apply();
  }
}

export default LightingSection;
