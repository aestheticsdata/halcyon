// CAMERA: five view presets, the projection pair and two sliders, and every one
// of them now moves the renderer.
//
// FOV, ZOOM and the projection pair all reach the shared Camera record through
// CameraController. The two slider defaults are imported from it rather than
// restated here, because the controller seeds itself with the same two numbers
// for the frames before syncFromStore() runs — two constants that have to agree
// is how the opening frame ends up describing a camera the sliders do not.
//
// FOV covers its whole 15..120 range. It used to be clamped in the renderer
// above roughly 102°, because a short focal put the near cap of a large mesh
// behind the eye where it projected mirrored; the camera's near plane clips that
// away instead, so the clamp is gone and the slider means what it says at every
// position.
//
// The view presets became real with the camera rig: a chip eases the rig to an
// absolute pitch/yaw/roll over 350ms. They stay momentary and unlit, which is
// not a leftover from when they were inert — the design never draws one
// selected, because a preset is a one-shot write and not a mode the camera stays
// in. The first drag after one leaves the viewpoint somewhere no chip names.
//
// ELEV / AZIM / ROLL joined them with COS-434, and the naming is deliberate. The
// rows name what the user does — elevation above the horizon, azimuth around it
// — and the engine goes on calling all three Euler angles, because that is what
// they are: EulerDegrees, cam.rot, CameraWidget and the preset table are all
// untouched, and the translation happens here and nowhere else. Do not "fix" the
// inconsistency by renaming EulerDegrees. The shape has its own PITCH / YAW /
// ROLL one tab over, and two identically-labelled trios is the thing this
// avoids.

import { DEFAULT_FOV, DEFAULT_ZOOM_SLIDER_VALUE } from "@app/CameraController";
import viewPresets from "@camera/viewPresets";
import DOMScope from "@ui/DOMScope";
import ChipGrid from "@ui/inspector/controls/ChipGrid";
import SliderRow from "@ui/inspector/controls/SliderRow";

import type { EulerDegrees } from "@camera/CameraRig";
import type { ViewPresetKey } from "@camera/viewPresets";
import type { ProjectionMode } from "@primitives/Camera";
import type UIStateStore from "@ui/UIStateStore";

export const DEFAULT_PROJECTION: ProjectionMode = "PERSPECTIVE";

// ISO's own angles, so a shape arrives at a three-quarter view and RESET lands
// on a preset the user can leave and click straight back to.
//
// Zero was tried first and is wrong. The per-frame rates these replaced (pitch
// 400, yaw 400, roll 200 in engine space) were off-centre on all three axes
// precisely so the shape would never be seen flat, and a turntable on azimuth
// alone does not reproduce that: elevation and roll would sit at zero for the
// whole session, so the eye stays in the object's equatorial plane and a cube is
// a square at the moment it arrives.
//
// It is forced as well as chosen. BackgroundRenderer draws the ground through
// the same view matrix, so a camera resting at elevation 0 would put the floor
// edge-on.
//
// Roll stays at zero. It is the one axis with no second source: elevation has
// the presets behind it and azimuth has them too, so a canted horizon here would
// be a permanent tilt nothing else in the console ever expresses.
export const DEFAULT_CAM_ELEV_DEGREES = 30;
export const DEFAULT_CAM_AZIM_DEGREES = 45;
export const DEFAULT_CAM_ROLL_DEGREES = 0;

// Elevation stops short of the pole because the rig is a turntable: roll is its
// own axis, so there is nothing a ±90 offers except a flip.
const ELEV_LIMIT = 89;
const AZIM_LIMIT = 180;
const CAM_ROLL_LIMIT = 180;
const FOV_MIN = 15;
const FOV_MAX = 120;
const ZOOM_MIN = 0;
const ZOOM_MAX = 100;

// Off the preset table rather than a second list of five labels here: the chip
// order is the table's declaration order, so adding a view is one edit.
const VIEW_PRESETS = Object.keys(viewPresets) as ViewPresetKey[];
const PROJECTIONS: ProjectionMode[] = ["PERSPECTIVE", "ORTHOGRAPHIC"];

export interface CameraSectionOptions {
  viewGridSelector: string;
  projectionGridSelector: string;
  rowsSelector: string;
  store: UIStateStore;
  onFov: (degrees: number) => void;
  onZoom: (sliderValue: number) => void;
  onProjection: (mode: ProjectionMode) => void;
  onViewPreset: (key: ViewPresetKey) => void;
  onElev: (degrees: number) => void;
  onAzim: (degrees: number) => void;
  onCamRoll: (degrees: number) => void;
}

class CameraSection {
  private readonly store: UIStateStore;
  private readonly apply: CameraSectionOptions;
  private readonly projectionGrid: ChipGrid;
  private readonly elev: SliderRow;
  private readonly azim: SliderRow;
  private readonly camRoll: SliderRow;
  private readonly fov: SliderRow;
  private readonly zoom: SliderRow;

  constructor(options: CameraSectionOptions) {
    const scope = new DOMScope(document);
    const rows = scope.require<HTMLElement>(options.rowsSelector, "CAMERA section is missing.");

    this.store = options.store;
    this.apply = options;
    this.store.registerSlice({
      fov: DEFAULT_FOV,
      zoom: DEFAULT_ZOOM_SLIDER_VALUE,
      projection: DEFAULT_PROJECTION,
      camElev: DEFAULT_CAM_ELEV_DEGREES,
      camAzim: DEFAULT_CAM_AZIM_DEGREES,
      camRoll: DEFAULT_CAM_ROLL_DEGREES,
    });

    const viewGrid = new ChipGrid({
      selector: options.viewGridSelector,
      modifier: "chip--view",
      columns: VIEW_PRESETS.length,
      momentary: true,
      // Nothing is stored: a preset is a jump, and the three angles it writes
      // are already RESET-covered as the TRANSFORM tab's own slices. Remembering
      // which chip was last pressed would be remembering a mode the camera is
      // not in the moment anything else moves it.
      onPick: (id) => options.onViewPreset(id as ViewPresetKey),
    });
    viewGrid.setChips(VIEW_PRESETS.map((key) => ({ id: key, label: key })));

    this.projectionGrid = new ChipGrid({
      selector: options.projectionGridSelector,
      modifier: "chip--proj",
      columns: PROJECTIONS.length,
      onPick: (id) => this.pickProjection(id as ProjectionMode),
    });
    this.projectionGrid.setChips(PROJECTIONS.map((key) => ({ id: key, label: key })));
    this.projectionGrid.setActive(DEFAULT_PROJECTION);

    this.elev = this.buildAngle("ELEV", "camera-elev", ELEV_LIMIT, DEFAULT_CAM_ELEV_DEGREES, (value) => {
      this.store.setState({ camElev: value });
      options.onElev(value);
    });
    this.azim = this.buildAngle("AZIM", "camera-azim", AZIM_LIMIT, DEFAULT_CAM_AZIM_DEGREES, (value) => {
      this.store.setState({ camAzim: value });
      options.onAzim(value);
    });
    this.camRoll = this.buildAngle("ROLL", "camera-roll", CAM_ROLL_LIMIT, DEFAULT_CAM_ROLL_DEGREES, (value) => {
      this.store.setState({ camRoll: value });
      options.onCamRoll(value);
    });

    this.fov = new SliderRow({
      label: "FOV",
      testId: "camera-fov",
      min: FOV_MIN,
      max: FOV_MAX,
      value: DEFAULT_FOV,
      format: (value) => `${value}°`,
      onInput: (value) => {
        this.store.setState({ fov: value });
        options.onFov(value);
      },
    });

    this.zoom = new SliderRow({
      label: "ZOOM",
      testId: "camera-zoom",
      min: ZOOM_MIN,
      max: ZOOM_MAX,
      value: DEFAULT_ZOOM_SLIDER_VALUE,
      format: (value) => `${value}%`,
      onInput: (value) => {
        this.store.setState({ zoom: value });
        options.onZoom(value);
      },
    });

    // Orientation above the lens: where the camera is pointing is the thing a
    // preset chip just changed, and the two rows that describe the lens do not
    // move when one is pressed.
    rows.append(this.elev.element, this.azim.element, this.camRoll.element, this.fov.element, this.zoom.element);
  }

  // Writes the store's values into the rows AND pushes them to the camera. Both
  // halves matter: this is the RESET path, and a reset that moved the sliders
  // without moving the camera would leave the two disagreeing until the next
  // drag. The projection pair joined that second half when it stopped being
  // decoration — RESET has to put the renderer back into PERSPECTIVE, not only
  // the chip.
  public syncFromStore() {
    const state = this.store.getState();
    // Checked against the grid's own vocabulary rather than trusted: the store
    // types this as ProjectionMode, but TypeScript stops at the edge of the
    // process and a preset file (E8b) is outside it. An unrecognised mode would
    // light no chip while the camera quietly fell through to perspective.
    const stored = state.projection ?? DEFAULT_PROJECTION;
    const projection = PROJECTIONS.includes(stored) ? stored : DEFAULT_PROJECTION;

    // The rows' answers rather than the store's, for the reason
    // TransformSection's own sync gives. FOV is the one with teeth: the focal
    // length is halfHeight / tan(fov/2), so a stored 0 is an infinite focal and
    // every vertex in the frame projects to NaN.
    const fov = this.fov.setValue(state.fov ?? DEFAULT_FOV);
    const zoom = this.zoom.setValue(state.zoom ?? DEFAULT_ZOOM_SLIDER_VALUE);
    const elev = this.elev.setValue(state.camElev ?? DEFAULT_CAM_ELEV_DEGREES);
    const azim = this.azim.setValue(state.camAzim ?? DEFAULT_CAM_AZIM_DEGREES);
    const roll = this.camRoll.setValue(state.camRoll ?? DEFAULT_CAM_ROLL_DEGREES);

    this.projectionGrid.setActive(projection);

    // Corrections go back into the store, for the reason TransformSection's own
    // sync gives: a value the rows refused has to stop existing, or SAVE PRESET
    // writes it back out and the console vouches for a number it never used.
    if (
      fov !== state.fov ||
      zoom !== state.zoom ||
      elev !== state.camElev ||
      azim !== state.camAzim ||
      roll !== state.camRoll ||
      projection !== state.projection
    ) {
      this.store.setState({ fov, zoom, camElev: elev, camAzim: azim, camRoll: roll, projection });
    }

    this.apply.onFov(fov);
    this.apply.onZoom(zoom);
    this.apply.onProjection(projection);
    this.apply.onElev(elev);
    this.apply.onAzim(azim);
    this.apply.onCamRoll(roll);
  }

  // Writes the row and the store but deliberately does not call options.onZoom —
  // a pointer gesture already applied its own value to the camera before
  // reaching here, and a second call would fight it exactly the way setCameraUi
  // below would fight an ease it called back into.
  public setZoomUi(value: number) {
    const rounded = Math.round(value);

    this.zoom.setValue(rounded);
    this.store.setState({ zoom: rounded });
  }

  // The other direction: the rig moved on its own — a preset, a drag, a
  // double-tap — and the three rows follow it. Same contract as setZoomUi in the
  // half that matters: it deliberately does not call back into the rig, which
  // already holds these values. A round trip here is how a preset ends up
  // fighting the ease that is writing it.
  //
  // Rounded because the rows are integer-stepped: the thumb would snap while the
  // read-out printed the raw float, which is two surfaces disagreeing about one
  // number in a space of about four pixels.
  public setCameraUi(angles: EulerDegrees) {
    const elev = Math.round(angles.pitch);
    const azim = Math.round(angles.yaw);
    const roll = Math.round(angles.roll);

    this.elev.setValue(elev);
    this.azim.setValue(azim);
    this.camRoll.setValue(roll);
    this.store.setState({ camElev: elev, camAzim: azim, camRoll: roll });
  }

  private pickProjection(mode: ProjectionMode) {
    this.projectionGrid.setActive(mode);
    this.store.setState({ projection: mode });
    this.apply.onProjection(mode);
  }

  // Symmetric about zero, which is what a range input can express.
  private buildAngle(
    label: string,
    testId: string,
    limit: number,
    value: number,
    onInput: (value: number) => void,
  ): SliderRow {
    return new SliderRow({
      label,
      testId,
      min: -limit,
      max: limit,
      value,
      format: (degrees) => `${degrees}°`,
      onInput,
    });
  }
}

export default CameraSection;
