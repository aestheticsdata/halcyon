// The WORLD tab: camera and environment. Two sections and no logic of its own —
// same shape as ShapeTab and RenderTab, which this is composed alongside in
// Main's constructor.
//
// The desktop order is CAMERA then ENVIRONMENT and the mobile order is the
// reverse, which is a CSS `order` flip rather than a second DOM: on a phone the
// environment toggles are the cheaper, more tappable controls and belong above
// the fold. Nothing here knows which branch is showing.

import CameraSection from "@ui/inspector/CameraSection";
import EnvironmentSection from "@ui/inspector/EnvironmentSection";

import type { EulerDegrees } from "@camera/CameraRig";
import type { ViewPresetKey } from "@camera/viewPresets";
import type { ProjectionMode } from "@primitives/Camera";
import type ControlRegistry from "@ui/ControlRegistry";
import type UIStateStore from "@ui/UIStateStore";

export interface WorldTabOptions {
  store: UIStateStore;
  controls: ControlRegistry;
  onFov: (degrees: number) => void;
  onZoom: (sliderValue: number) => void;
  onProjection: (mode: ProjectionMode) => void;
  onViewPreset: (key: ViewPresetKey) => void;
  onElev: (degrees: number) => void;
  onAzim: (degrees: number) => void;
  onCamRoll: (degrees: number) => void;
  onLayersChange: () => void;
}

class WorldTab {
  private readonly camera: CameraSection;
  private readonly environment: EnvironmentSection;

  constructor(options: WorldTabOptions) {
    this.camera = new CameraSection({
      viewGridSelector: "#viewPresetChips",
      projectionGridSelector: "#projectionChips",
      rowsSelector: "#cameraRows",
      store: options.store,
      controls: options.controls,
      onFov: options.onFov,
      onZoom: options.onZoom,
      onProjection: options.onProjection,
      onViewPreset: options.onViewPreset,
      onElev: options.onElev,
      onAzim: options.onAzim,
      onCamRoll: options.onCamRoll,
    });

    this.environment = new EnvironmentSection({
      controls: options.controls,
      togglesSelector: "#environmentToggles",
      rowsSelector: "#environmentRows",
      store: options.store,
      onLayersChange: options.onLayersChange,
    });
  }

  // Called after the store's defaults are restored, mirroring the other two
  // tabs — every section reads back from one place. CAMERA's half also re-applies
  // its three values to the renderer, because all three are live.
  public syncFromStore() {
    this.camera.syncFromStore();
    this.environment.syncFromStore();
  }

  // The environment half alone, for the case the other surface moved: a quick
  // toggle writes SKY, FLOOR or GRID and this tab's rows have to follow in the
  // same frame without the camera being re-pushed.
  public syncEnvironmentUi() {
    this.environment.syncFromStore();
  }

  // The CAMERA half alone, for wheel/pinch/double-tap zoom (E1b): those already
  // apply their own value to the camera before reaching Main, so only the ZOOM
  // row and the store need to follow.
  public setZoomUi(value: number) {
    this.camera.setZoomUi(value);
  }

  // The three orientation rows alone, for a drag, a preset or a double-tap: each
  // already applied its own angles to the rig before reaching Main, so only the
  // rows and the store need to follow.
  public setCameraUi(angles: EulerDegrees) {
    this.camera.setCameraUi(angles);
  }
}

export default WorldTab;
