// The composition root: it owns the collaborators, wires them to one another,
// and owns the render path they all feed.
//
// What is left here is what genuinely crosses widget boundaries. A shape change
// repaints four surfaces that must change together; a pipeline change writes
// three readouts that must agree; the frame publishes two numbers that must
// describe the same frame. Everything that belonged to one widget has gone to
// that widget.

import SceneryFade from "@animations/SceneryFade";
import ShapeTransitionMachine from "@animations/shapeTransitionMachine";
import CameraController, { DEFAULT_ZOOM_SLIDER_VALUE } from "@app/CameraController";
import FPSMeter from "@app/FPSMeter";
import RenderLoop from "@app/RenderLoop";
import ShapeSwitcher from "@app/ShapeSwitcher";
import CameraRig from "@camera/CameraRig";
import data from "@data/data";
import moleculeInfo from "@data/moleculeInfo";
import shapeInfo from "@data/shapeInfo";
import PointerOrbit from "@input/PointerOrbit";
import MeshFactory from "@primitives/MeshFactory";
import RenderTarget from "@primitives/RenderTarget";
import Surface3D from "@primitives/Surface3D";
import AffineTextureMapper from "@rendering/AffineTextureMapper";
import { CLOCK_RESOLUTION_THRESHOLD_MS, probeClockResolutionMs } from "@rendering/clockResolution";
import { diagnosticInk } from "@rendering/diagnosticInk";
import Fog from "@rendering/Fog";
import Lighting from "@rendering/Lighting";
import { DEFAULT_MESH_MATERIAL } from "@rendering/material";
import { dprEffectiveFor } from "@rendering/pixelBudget";
import RenderStats from "@rendering/RenderStats";
import { impliesWireframe } from "@rendering/shadingMode";
import ShapeRig from "@scene/ShapeRig";
import ProceduralTextures from "@textures/ProceduralTextures";
import TextureRegistry from "@textures/TextureRegistry";
import imageTextures from "@textures/textureKeys";
import ActionRegistry from "@ui/ActionRegistry";
import {
  DEFAULT_CAM_AZIM_DEGREES,
  DEFAULT_CAM_ELEV_DEGREES,
  DEFAULT_CAM_ROLL_DEGREES,
} from "@ui/inspector/CameraSection";
import {
  DEFAULT_FLOOR,
  DEFAULT_FOG,
  DEFAULT_GRID,
  DEFAULT_GRID_STEP,
  DEFAULT_SHADOW,
  DEFAULT_SKY,
} from "@ui/inspector/EnvironmentSection";
import { DEFAULT_AMBIENT, DEFAULT_AZIMUTH, DEFAULT_ELEVATION, DEFAULT_SPECULAR } from "@ui/inspector/LightingSection";
import { DEFAULT_DITHER, DEFAULT_EDGE_AA, DEFAULT_ZBUFFER } from "@ui/inspector/PipelineSection";
import RenderTab from "@ui/inspector/RenderTab";
import { DEFAULT_SHADING_MODE } from "@ui/inspector/ShadingSection";
import ShapeTab from "@ui/inspector/ShapeTab";
import ShapeThumbnails from "@ui/inspector/ShapeThumbnails";
import WorldTab from "@ui/inspector/WorldTab";
import KeyboardShortcuts from "@ui/KeyboardShortcuts";
import MaterialSummary from "@ui/MaterialSummary";
import OrbitInvertToggles from "@ui/OrbitInvertToggles";
import QuickToggles from "@ui/QuickToggles";
import RenderPipelinePanel from "@ui/RenderPipelinePanel";
import SessionActions from "@ui/SessionActions";
import ShapeInfoPanel from "@ui/ShapeInfoPanel";
import ShapeStoryPanel from "@ui/ShapeStoryPanel";
import StatusBar from "@ui/StatusBar";
import SceneGraphPanel from "@ui/scene/SceneGraphPanel";
import { MESH_ROW_ID } from "@ui/scene/sceneRows";
import TransportBar from "@ui/TransportBar";
import CameraWidget from "@ui/telemetry/CameraWidget";
import FramerateWidget from "@ui/telemetry/FramerateWidget";
import FrameTimeWidget from "@ui/telemetry/FrameTimeWidget";
import GeometryWidget from "@ui/telemetry/GeometryWidget";
import SystemWidget from "@ui/telemetry/SystemWidget";
import ZBufferWidget from "@ui/telemetry/ZBufferWidget";
import UIStateStore from "@ui/UIStateStore";
import ViewportExpander from "@ui/ViewportExpander";
import ViewportHUD from "@ui/ViewportHUD";

import type { SceneryLayers } from "@animations/SceneryFade";
import type { ShapeTransitionState } from "@animations/shapeTransition/types";
import type { BootContext } from "@app/Bootstrapper";
import type { CameraAngles } from "@camera/CameraRig";
import type { ViewPresetKey } from "@camera/viewPresets";
import type { Data3D } from "@data/data";
import type { ProjectionMode } from "@primitives/Camera";
import type Mesh from "@primitives/Mesh";
import type { MeshRenderRequest } from "@primitives/Surface3D";
import type BackgroundRenderer from "@rendering/BackgroundRenderer";
import type { LightingValues } from "@rendering/Lighting";
import type { MeshMaterial } from "@rendering/material";
import type { ShadingMode } from "@rendering/shadingMode";
import type { ShapePose } from "@scene/ShapeRig";
import type FieldWriter from "@ui/FieldWriter";
import type { SceneSnapshot } from "@ui/scenePreset";

const TRANSITION_DURATION_MS = 1250;
// The longest gap the rig is told about. A backgrounded tab can hand back a
// timestamp seconds later, and spinning the shape by the whole absence is a jump
// rather than the continuation it looks like from the user's side.
const MAX_FRAME_DELTA_MS = 100;
const MILLISECONDS_PER_SECOND = 1000;

// What one press of STEP advances the synthetic clock by (E8a). A nominal 60Hz
// frame rather than the display's real interval: the loop is stopped, so there
// is no real interval to read, and the point of stepping is a reproducible unit
// of travel rather than a faithful imitation of this monitor.
const FRAME_STEP_MS = MILLISECONDS_PER_SECOND / 60;

class Main {
  // The console's only store, constructed here rather than exported beside its
  // class. A module-scope instance is one every future importer shares by
  // accident, and its slices are already registered before anything decides
  // they should be — which is what made the panel's registerSlice call an
  // import-time side effect until it moved into the panel's own constructor.
  private readonly uiState: UIStateStore;
  // FPS and the drawn-triangle count do not resolve a node here: both appear in
  // more than one place in the DOM (toolbar, mobile header, telemetry card), so
  // they go through the writer, which touches every [data-field] node at once.
  // boot() owns the instance because it writes the build labels before Main
  // exists.
  private readonly fields: FieldWriter;
  private readonly statusBar: StatusBar;
  private readonly viewportHud: ViewportHUD;
  // Boot-time and self-contained, like PointerOrbit: it resolves its own DOM
  // node and owns its own listeners, so Main only needs the handle to release
  // them again in dispose().
  private readonly viewportExpander: ViewportExpander;
  // The ResizeObserver target (E9b/COS-250) — the picture's own box, not the
  // card, for the reason ViewportHUD anchors to it rather than to .viewport:
  // observing the card would fire on every theatre-mode fold as well as on a
  // genuine resize.
  private readonly viewportStage: HTMLElement;
  // Null until init() constructs it (below), and disconnected in dispose() —
  // one per page load, the same lifecycle as every other collaborator here
  // that owns a live browser listener.
  private resizeObserver: ResizeObserver | null;
  // Coalesces the observer to one resize per animation frame: it fires on
  // every intermediate layout during a drag, and each resize reallocates the
  // backing store and repaints the whole background.
  private pendingResizeRaf: number | null;
  // The transition machine's state as last written onto the stage, so the
  // attribute is touched on the frames it changes and on no other.
  private lastTransitionState: ShapeTransitionState | null;
  private readonly sceneGraph: SceneGraphPanel;
  // The molecule rule's own state (HAL-174): how much of the sky and the floor
  // are still standing, and what the pair was before a molecule took them.
  private readonly scenery: SceneryFade;
  private readonly shapeInfo: ShapeInfoPanel;
  private readonly shapeStory: ShapeStoryPanel;
  private readonly pipeline: RenderPipelinePanel;
  private readonly renderTab: RenderTab;
  private readonly worldTab: WorldTab;
  private readonly quickToggles: QuickToggles;
  private readonly transport: TransportBar;
  private readonly actions: ActionRegistry;
  // The four file-and-clipboard actions (E8b). It registers its own handlers
  // rather than being called from registerActions below, because unlike every
  // other action in the console none of them touches the engine — what they
  // need is the scene as data, which is the one thing this class can hand over
  // without handing over itself.
  private readonly session: SessionActions;
  private readonly keyboard: KeyboardShortcuts;
  private readonly shapeTab: ShapeTab;
  // Held as well as handed to Surface3D: the WORLD tab's SKY and FLOOR rows and
  // the viewport's quick toggles both switch layers on it at runtime, and this
  // class is the one place that reads the store and pushes the pair.
  private readonly background: BackgroundRenderer;
  private readonly framerate: FramerateWidget;
  private readonly frameTime: FrameTimeWidget;
  private readonly geometry: GeometryWidget;
  private readonly zBuffer: ZBufferWidget;
  private readonly cameraStats: CameraWidget;
  private readonly system: SystemWidget;
  private readonly fpsMeter: FPSMeter;
  private readonly loop: RenderLoop;
  private readonly objects3D: Data3D;
  private readonly stage: CanvasRenderingContext2D;
  private readonly surface3D: Surface3D;
  private readonly renderTarget: RenderTarget;
  // Constructed here rather than by Surface3D (E6/COS-239): Main has to call
  // beginFrame() before the rig's own matrix pass, which runs before
  // surface3D.render is ever reached, so the shared accumulator has to exist
  // before Surface3D's constructor sees it.
  private readonly renderStats: RenderStats;
  private readonly meshFactory: MeshFactory;
  private readonly textures: TextureRegistry;
  private readonly camera: CameraController;
  private readonly rig: CameraRig;
  private readonly shapeRig: ShapeRig;
  // One material for the whole scene, mutated in place rather than replaced.
  // The binding is readonly and the object is not, which is the honest shape:
  // there is exactly one material and every control writes into it, while
  // buildMesh and the two change handlers below are the only things that push
  // it at a mesh.
  private readonly material: MeshMaterial;
  // One light for the whole scene, and the same ownership shape as the material
  // above: every control writes into it and nothing else holds one. Unlike the
  // material it is also written per frame — it is world-fixed, so the eye-space
  // direction has to follow the camera — which is why paint() pushes the view
  // matrix at it rather than the light holding a rig reference of its own.
  private readonly lighting: Lighting;
  // One fog for the whole scene, for the reason there is one light: it describes
  // the air, so the mesh and the ground it stands on must read the same object
  // rather than two that agree by hand. It is written per frame as well, from
  // Surface3D — the near edge of the fog is the near edge of the subject, and
  // only the render pass has folded the scene radius by then.
  private readonly fog: Fog;
  // The two textures the console paints for itself, and the class that fills
  // with them. They are one field apart in this list and one line apart in
  // changeMaterial for a reason: the mapper caches a CanvasPattern per texture
  // and createPattern copies its source, so a repaint that did not invalidate
  // would leave the checker painting the previous swatch forever.
  private readonly procedural: ProceduralTextures;
  private readonly mapper: AffineTextureMapper;
  private readonly pointerOrbit: PointerOrbit;
  private readonly orbitInvertToggles: OrbitInvertToggles;
  private readonly shapes: ShapeSwitcher;
  private readonly unsubscribe: () => void;
  // A change detector, not a second copy of the state: this class publishes the
  // drawn count through the same store it subscribes to, so an unguarded
  // subscriber would re-enter renderPausedFrame on its own notification.
  private meshHidden: boolean;
  private lightHidden: boolean;
  private renderedTriangles: number;
  // The frame clock, kept here because this is where the timestamp arrives, and
  // read once per frame for both rigs. The shape accumulates its spin against
  // real elapsed time rather than per frame, which is what makes a revolution
  // take the same wall-clock time uncapped as it does under the RENDER tab's
  // 30fps cap.
  private lastFrameTimestamp: number;
  // STEP's own clock, advanced a frame at a time while the loop is stopped. Only
  // meaningful between a pause and the resume that rebases off it.
  private pausedClock: number;

  // The canvas arrives resolved. Main used to repeat the Bootstrapper's own
  // querySelector and instanceof guard, so a missing canvas threw from whichever
  // of the two ran first.
  constructor(context: BootContext) {
    const { canvas, backgroundRenderer, fields } = context;

    const stage = canvas.getContext("2d");
    if (!stage) {
      throw new Error("2D canvas context is not available.");
    }

    // First, and in the constructor body rather than a field initialiser:
    // `useDefineForClassFields` runs initialisers before this body, so anything
    // built here that subscribes would be reaching for a store that does not
    // exist yet.
    this.uiState = new UIStateStore();
    this.fields = fields;
    this.statusBar = new StatusBar(this.fields);
    this.viewportHud = new ViewportHUD(canvas, this.fields);
    this.viewportExpander = new ViewportExpander();

    const viewportStage = canvas.closest<HTMLElement>(".viewport-stage");

    if (!viewportStage) {
      throw new Error("Viewport stage is missing.");
    }

    this.viewportStage = viewportStage;
    this.resizeObserver = null;
    this.pendingResizeRaf = null;
    this.lastTransitionState = null;
    this.sceneGraph = new SceneGraphPanel(this.uiState);
    this.meshHidden = this.sceneGraph.isMeshHidden();
    this.lightHidden = this.sceneGraph.isLightHidden();
    this.stage = stage;
    this.background = backgroundRenderer;
    this.camera = new CameraController(canvas);
    // The render target, resolved once from the canvas the Bootstrapper already
    // handed over, and the camera record the controller owns — both shared by
    // every point of every mesh built here. Every mesh in the console therefore
    // projects through one render target and one camera, and the sliders write
    // to the camera rather than to the vertices. Moved ahead of Surface3D
    // (COS-246): the background renderer's ground projection needs both, and
    // Surface3D is what carries them to it on every frame.
    this.renderTarget = new RenderTarget({ width: canvas.width, height: canvas.height });
    this.assertSeedFraming();
    this.renderStats = new RenderStats();
    this.surface3D = new Surface3D({
      container: this.stage,
      camera: this.camera.projection,
      renderTarget: this.renderTarget,
      backgroundRenderer,
      stats: this.renderStats,
    });
    // Before every widget that reads it. The WORLD tab's rows and presets write
    // to it, the CAMERA card and the HUD read from it, and the render path
    // applies its matrix — so it is one of the few collaborators whose
    // construction order is load-bearing rather than incidental. The shape's own
    // rig has no reader outside the render path and only sits here to be
    // constructed alongside it.
    this.rig = new CameraRig();
    this.shapeRig = new ShapeRig();
    // Spread, not aliased: DEFAULT_MESH_MATERIAL is frozen and shared, and this
    // one is written into on every swatch click.
    this.material = { ...DEFAULT_MESH_MATERIAL };
    // Seeded through the same reader the sliders push through, so the opening
    // light and a dragged one come off one code path. The LIGHTING slice is not
    // registered yet — RenderTab builds the section further down — which is what
    // the fallbacks in lightingValues() are for.
    this.lighting = new Lighting(this.lightingValues());
    // At the shipped defaults, and both are read again by the first
    // syncWorldLayers() call before a frame is ever painted — the ENVIRONMENT
    // slice is registered further down, so this is the seed rather than the
    // value the console opens on.
    this.fog = new Fog({ amount: DEFAULT_FOG, skyEnabled: DEFAULT_SKY });
    this.lastFrameTimestamp = performance.now();
    this.pausedClock = this.lastFrameTimestamp;
    this.meshFactory = new MeshFactory(this.renderTarget, this.camera.projection);
    this.textures = new TextureRegistry();
    // Adopted here rather than in init(), where the bitmaps are loaded: there is
    // nothing to decode, so CHECKER and UV GRID resolve from the first frame
    // while dog and galaxy are still in flight.
    this.procedural = new ProceduralTextures(this.material.baseColor);
    this.textures.adopt(this.procedural.sources);
    this.mapper = new AffineTextureMapper();
    this.objects3D = data;
    this.renderedTriangles = 0;
    this.shapeInfo = new ShapeInfoPanel();
    this.shapeStory = new ShapeStoryPanel();
    // Before the pipeline panel, and that order is load-bearing: this tab
    // creates #opacitySlider, and RenderPipelinePanel resolves it in its own
    // constructor to own the disabled state and the tooltip.
    this.shapeTab = new ShapeTab({
      objects3D: this.objects3D,
      store: this.uiState,
      // Lit from the click, not from the transition: a pick made while one is
      // animating is parked in the switcher's queue and does not reach
      // onTransitionStart for up to 1250ms, which would leave the chip the user
      // just pressed dark for the whole animation.
      onPick: (primitive) => {
        this.shapeTab.setActivePrimitive(primitive);
        this.shapes.request(primitive);
      },
      onPitch: (degrees) => this.changeShape({ pitch: degrees }),
      onYaw: (degrees) => this.changeShape({ yaw: degrees }),
      onRoll: (degrees) => this.changeShape({ roll: degrees }),
      onSpin: (degreesPerSecond) => this.changeShape({ spinRate: degreesPerSecond }),
      onScale: (factor) => this.changeShape({ scale: factor }),
      onTexture: (mode) => this.changeMaterial({ mode }),
      onBaseColor: (css) => this.changeMaterial({ baseColor: css }),
      onUvScale: (factor) => this.changeMaterial({ uvScale: factor }),
      onOpacity: (value) => this.pipeline.setOpacityFromSlider(value),
    });
    this.pipeline = new RenderPipelinePanel();
    this.renderTab = new RenderTab({
      store: this.uiState,
      wireframe: this.pipeline.wireframe,
      cullBackfaces: this.pipeline.cullBackfaces,
      onShadingSelect: (mode) => this.pipeline.setWireframe(impliesWireframe(mode)),
      onWireframeToggle: (next) => this.pipeline.setWireframe(next),
      onCullToggle: (next) => this.pipeline.setCullBackfaces(next),
      onFrameRateCap: (fps) => this.applyFrameRateCap(fps),
      onLightingChange: () => this.applyLighting(),
    });
    this.worldTab = new WorldTab({
      store: this.uiState,
      onFov: (degrees) => this.changeFov(degrees),
      onZoom: (value) => this.changeZoom(value),
      onProjection: (mode) => this.changeProjection(mode),
      onViewPreset: (key) => this.applyViewPreset(key),
      onElev: (degrees) => this.changeCamera({ pitch: degrees }),
      onAzim: (degrees) => this.changeCamera({ yaw: degrees }),
      onCamRoll: (degrees) => this.changeCamera({ roll: degrees }),
      onLayersChange: () => this.syncWorldLayers(),
    });
    // After the WORLD tab because that is the order they read in, not because
    // the store forces it: the pills fall back to the same exported defaults
    // EnvironmentSection registers, so an empty store still paints them right.
    // What genuinely has to follow is syncPipelineReadouts() below — that call
    // is the only thing that seeds the WIRE and CULL pills.
    this.quickToggles = new QuickToggles({
      mounts: [".quick-toggle-band", ".quick-toggles"],
      store: this.uiState,
      wireframe: this.pipeline.wireframe,
      cullBackfaces: this.pipeline.cullBackfaces,
      onLayersChange: () => this.syncWorldLayers(),
      onWireframeToggle: (next) => this.pipeline.setWireframe(next),
      onCullToggle: (next) => this.pipeline.setCullBackfaces(next),
    });
    this.transport = new TransportBar();
    this.actions = new ActionRegistry();
    this.keyboard = new KeyboardShortcuts(this.actions);
    this.pointerOrbit = new PointerOrbit({
      canvas,
      getAngles: () => this.rig.angles(),
      getZoom: () => this.uiState.getState().zoom ?? DEFAULT_ZOOM_SLIDER_VALUE,
      onOrbit: (pitch, yaw) => this.applyPointerOrbit(pitch, yaw),
      onZoom: (value) => this.applyPointerZoom(value),
      onReset: () => this.applyPointerReset(),
    });
    this.orbitInvertToggles = new OrbitInvertToggles({
      onPitchInvertChange: (inverted) => this.pointerOrbit.setInvertPitch(inverted),
      onYawInvertChange: (inverted) => this.pointerOrbit.setInvertYaw(inverted),
    });
    // On the shape transition's own duration, so the world and the object settle
    // on the same beat rather than 1250ms apart.
    this.scenery = new SceneryFade(TRANSITION_DURATION_MS);
    this.shapes = new ShapeSwitcher({
      objects3D: this.objects3D,
      transitionMachine: new ShapeTransitionMachine({
        width: this.stage.canvas.width,
        height: this.stage.canvas.height,
        duration: TRANSITION_DURATION_MS,
      }),
      buildMesh: (primitive) => this.buildMesh(primitive),
      now: () => this.now(),
      onTransitionStart: (primitive) => {
        // Selection returns to the mesh row on every shape change (D11):
        // otherwise picking a new primitive leaves KEY_LIGHT highlighted while
        // the object the row describes changes underneath it.
        this.uiState.setState({ sceneSelection: MESH_ROW_ID });
        this.shapeTab.setActivePrimitive(primitive);

        // At the START of the transition, not the end: SKY DOME, CHECKER FLOOR
        // and the viewport's two pills read the new intent immediately while
        // the picture takes 1250ms to agree with them. A toggle that stays lit
        // for a second and a quarter over a sky that is visibly leaving is
        // worse than one that is briefly ahead of its layer.
        if (this.applySceneryRule(primitive)) {
          this.syncWorldLayers();
        }

        this.animateShapeInfoPanel(primitive);
      },
    });
    // After the switcher, whose primitive list it validates a loaded file
    // against, and before registerActions() below — an action named in the
    // markup that nothing has registered by the time bindDomActions runs is a
    // boot failure, which is the guarantee that makes the four buttons safe to
    // un-placeholder in the same change.
    this.session = new SessionActions({
      canvas,
      actions: this.actions,
      scene: () => this.sceneSnapshot(),
      primitives: this.shapes.names,
      onApply: (scene) => this.applyScene(scene),
    });
    this.framerate = new FramerateWidget();
    // Probed once, at boot: whether this page's performance.now() can
    // actually resolve the four-stage split FRAME TIME draws (E6/COS-239).
    // Reprobing per frame would be the exact per-frame cost the sampling gate
    // elsewhere in this ticket exists to avoid, for an answer that only
    // changes if cross-origin isolation itself changes mid-session, which it
    // does not.
    const hasFineClockResolution = probeClockResolutionMs() < CLOCK_RESOLUTION_THRESHOLD_MS;
    this.frameTime = new FrameTimeWidget(this.fields, hasFineClockResolution);
    this.geometry = new GeometryWidget(this.fields);
    this.zBuffer = new ZBufferWidget();
    this.cameraStats = new CameraWidget({ fields: this.fields, camera: this.camera, rig: this.rig });
    this.system = new SystemWidget({
      fields: this.fields,
      canvas,
      onDprChange: () => this.handleDprChange(),
    });
    this.fpsMeter = new FPSMeter(() => performance.now());
    this.loop = new RenderLoop({
      onFrame: (timestamp) => {
        this.renderFrame(timestamp);
        this.publishFrameStats();
      },
      // Both clocks rebase on resume, off one reading so they cannot disagree
      // about when the pause ended. The transition clock is what stops a shape
      // change paused mid-flight from jumping; the frame clock is what stops the
      // rig from spinning the shape by the entire paused duration.
      onStart: () => {
        const now = performance.now();

        this.shapes.syncClock(now);
        this.lastFrameTimestamp = now;
      },
      onStop: () => {
        this.fpsMeter.reset();
        this.renderedTriangles = 0;
        this.fields.write("fps", 0);
        this.publishDrawnTriangles(0);
        // The frame-time ticket's own zeroing (E6/COS-239): a paused console
        // must show no stale stage split, fill rate or draw-call count.
        this.renderStats.zero();
        this.frameTime.reset();
        this.frameTime.render();
        this.geometry.zeroDrawCalls();
        this.geometry.render();
      },
    });

    this.pipeline.bind(this.syncPipelineReadouts);
    this.transport.bindToggle(this.togglePause);
    this.registerActions();
    this.syncPipelineReadouts();

    // Hiding the mesh or the key light has to repaint immediately when the loop
    // is not running; while it is, the next frame already picks it up. Both rows
    // ride one detector because both end in the same repaint, and because the
    // detector is what stops this subscriber re-entering on the drawn count it
    // publishes through the store it is subscribed to.
    this.unsubscribe = this.uiState.subscribe(() => {
      const meshHidden = this.sceneGraph.isMeshHidden();
      const lightHidden = this.sceneGraph.isLightHidden();

      if (meshHidden === this.meshHidden && lightHidden === this.lightHidden) {
        return;
      }

      this.meshHidden = meshHidden;
      this.lightHidden = lightHidden;
      // applyLighting rather than a bare repaint: the light has to be told
      // before the frame is drawn, and pushing it costs one trig pair even when
      // it was the mesh row that moved.
      this.applyLighting();
    });
  }

  // Every action the console can perform, wired once. Both dispatch paths run
  // through here — the toolbar's [data-action] buttons and every key in
  // SHORTCUTS — which is what makes a chip and a button incapable of disagreeing
  // about what a name means.
  //
  // The two toggles read their own current value back before flipping it rather
  // than tracking one here: RenderPipelinePanel owns those booleans and pushes
  // them out to every surface through syncPipelineReadouts, so a second copy in
  // this class would be a second truth to keep in step.
  private registerActions() {
    this.actions.register("togglePause", this.togglePause);
    this.actions.register("resetControls", this.resetControls);
    this.actions.register("stepFrame", () => this.stepFrame());
    this.actions.register("toggleWireframe", () => this.pipeline.setWireframe(!this.pipeline.wireframe));
    this.actions.register("toggleBackfaceCulling", () => this.pipeline.setCullBackfaces(!this.pipeline.cullBackfaces));
    this.actions.register("toggleSky", () => this.toggleWorldLayer("sky", DEFAULT_SKY));
    this.actions.register("toggleFloor", () => this.toggleWorldLayer("floor", DEFAULT_FLOOR));
    this.actions.register("toggleGrid", () => this.toggleWorldLayer("grid", DEFAULT_GRID));
    this.actions.register("selectPrimitive", (index) => this.selectPrimitiveByIndex(index));

    this.actions.bindDomActions();
    this.keyboard.listen();
  }

  // The three switchable scenery layers, which unlike the pipeline's two really
  // do live in the store — so the flip is a write plus the one sync that pushes
  // it to the renderer, the WORLD tab's own row and the viewport's quick toggle
  // together. Reading the default here rather than assuming false: a slice the
  // user has never touched is absent, not off.
  private toggleWorldLayer(layer: "sky" | "floor" | "grid", fallback: boolean) {
    const current = this.uiState.getState()[layer] ?? fallback;

    this.uiState.setState({ [layer]: !current });
    this.syncWorldLayers();
  }

  // The digit keys, resolved against the registry's own order — the same order
  // the SHAPE tab's picker lists. Out of range is ignored rather than clamped: 9
  // on a registry of six primitives means nothing, and landing on the last one
  // would be an answer the user did not ask for.
  private selectPrimitiveByIndex(index?: number) {
    if (index === undefined) {
      return;
    }

    const primitive = this.shapes.names[index];

    if (!primitive) {
      return;
    }

    // Through the same pair the picker's own click runs, so a key and a chip
    // leave the tab's lit state identical.
    this.shapeTab.setActivePrimitive(primitive);
    this.shapes.request(primitive);
  }

  // The store is the one holder (E3c/COS-243), the same arrangement the Z-BUFFER
  // toggle already has: ShadingSection registers the default and writes every
  // pick, and this reads it back for the frame's render options and for the
  // three readouts. Private because nothing outside this class needs it — the
  // readouts are pushed from here rather than pulled.
  private get shadingMode(): ShadingMode {
    return this.uiState.getState().shadingMode ?? DEFAULT_SHADING_MODE;
  }

  // The boot primitive is a defaulted parameter rather than a constant: the
  // registry's first key is the shape the console opens on, and the entry module
  // has no business knowing which one that is.
  public async init(primitive: string = this.shapes.names[0]) {
    // The declared table rather than a literal spelled here: the same record is
    // what classifies a triangle's fourth slot, so a texture cannot be loadable
    // without being recognisable.
    await this.textures.load(imageTextures);

    // Resolution is written once; it is the only thing left in the HUD that
    // never changes while the console is open. FOV left this list in COS-231 and
    // the three camera readouts left it with the rig. The histogram's 28 bars
    // are the same kind of write — built once, then only their heights change.
    this.viewportHud.seed();
    this.zBuffer.mount();
    this.cameraStats.seed();
    this.system.seed();
    // After the textures resolve: the option thumbnails go through the real
    // rasteriser, so the cube needs its galaxy face to exist first.
    this.shapeTab.paintPrimitiveOptions(new ShapeThumbnails(this.objects3D, this.textures));
    this.shapeTab.syncFromStore();
    // The camera already opens at these values — CameraController seeds itself
    // through the same two mappings — so this is not what puts the first frame
    // at 94°. What it buys is the readouts: the HUD's fov, zoom and dist are
    // written by the push, and nothing else writes them before the first drag.
    this.worldTab.syncFromStore();
    this.syncWorldLayers();
    // Once, before the loop starts. The camera readouts ride a 90ms gate from
    // here on, and without this the HUD and the CAMERA card would open on an em
    // dash for the first tenth of a second.
    this.publishCameraReadouts();
    this.repaintForPrimitive(primitive);
    // Pushed explicitly rather than relying on the markup's seed, so the bar and
    // the transport have one source of truth from the first paint.
    this.syncRunState();
    this.pipeline.syncOpacityAvailability();
    this.shapes.request(primitive);

    // Constructed here rather than in the constructor (E9b/COS-250): observing
    // fires once immediately with the stage's current size, and by this point
    // there is a painted frame for that first call to repaint rather than an
    // empty console still mid-boot.
    this.resizeObserver = new ResizeObserver(this.onStageResize);
    this.resizeObserver.observe(this.viewportStage);

    this.loop.start();
  }

  // Nothing calls this today — there is one Main per page load and the page
  // outlives it. It exists because a subscription with no teardown is a leak the
  // moment anything reconstructs collaborators, and the handle has to be kept
  // for the teardown to be possible at all.
  public dispose() {
    this.unsubscribe();
    this.keyboard.dispose();
    this.actions.dispose();
    this.session.dispose();
    // The one collaborator holding a timer and a media-query listener: every
    // other widget is pure DOM writes and has nothing to release.
    this.system.dispose();
    this.pointerOrbit.dispose();
    this.orbitInvertToggles.dispose();
    this.viewportExpander.dispose();
    this.resizeObserver?.disconnect();

    if (this.pendingResizeRaf !== null) {
      cancelAnimationFrame(this.pendingResizeRaf);
    }
  }

  // The whole point of this class existing: at the seed 1024x640 canvas, scale
  // is exactly 1 and the centre is exactly what Viewport always gave — so
  // introducing a render target moved nothing on the day it landed, and
  // resize() above is the call site that later gave it somewhere to go
  // (E9b/COS-250). Thrown rather than logged, because a silent drift here
  // would move every vertex on screen and the console would look wrong
  // without printing why.
  private assertSeedFraming() {
    const { scale, centerX, centerY } = this.renderTarget;

    if (scale !== 1 || centerX !== 512 || centerY !== 320) {
      throw new Error(`RenderTarget seed framing drifted: scale=${scale} centerX=${centerX} centerY=${centerY}.`);
    }
  }

  // The HUD's `dist` is the camera distance, which is fl/k: positive at every
  // reachable combination of the two sliders, and the same number the rig turns
  // into an eye position.
  //
  // Nothing is pushed into the meshes. The projection is one record every vertex
  // already holds, so the write above IS the change — all that is left is the
  // repaint a stopped loop would not otherwise do.
  //
  // A plain method, not an arrow property: nothing hands it to a listener, and
  // R9 spends the bound-this form only where something does.
  private changeZoom(sliderValue: number) {
    this.camera.setZoomFromSlider(sliderValue);
    this.viewportHud.setZoom(sliderValue, this.camera.distance);
    this.renderPausedFrame();
  }

  // Mirrors changeZoom, and has to: the eye distance is fl/k, so a focal change
  // moves the distance readout exactly as a zoom change does — which is why the
  // zoom readout is rewritten here from the slice rather than left to go stale
  // against a distance that just moved under it.
  //
  // What does NOT move is the shape's size at its own centre plane: the
  // magnification is left alone, so this is a dolly zoom rather than a second
  // zoom control.
  private changeFov(degrees: number) {
    this.camera.setFovDegrees(degrees);
    this.viewportHud.setFov(this.camera.fieldOfViewDegrees);
    this.viewportHud.setZoom(this.uiState.getState().zoom ?? DEFAULT_ZOOM_SLIDER_VALUE, this.camera.distance);
    this.renderPausedFrame();
  }

  // Three surfaces print the mode — the HUD chip, the status bar and the CAMERA
  // card's header note — and all three are one FieldWriter write, exactly as the
  // shading label is. What is pushed is the camera's own mode rather than the
  // chip that was clicked, so the console cannot end up describing a projection
  // the renderer is not using.
  private changeProjection(mode: ProjectionMode) {
    this.camera.setProjection(mode);
    this.statusBar.setProjection(this.camera.projectionMode);
    this.renderPausedFrame();
  }

  // The tail every camera angle row shares. A patch rather than three methods,
  // because a slider moves exactly one of the rig's three numbers and the other
  // two must be left alone rather than restated at each call site.
  private changeCamera(angles: Partial<CameraAngles>) {
    this.rig.setAngles(angles);
    this.renderPausedFrame();
  }

  // The same, for the shape's five.
  private changeShape(pose: Partial<ShapePose>) {
    this.shapeRig.setPose(pose);
    this.renderPausedFrame();
  }

  // The same again, for the surface. A chip moves the mode and a swatch moves
  // the colour, and neither restates the other.
  //
  // Pushed at the meshes rather than read from them, which is what keeps the
  // render path free of any resolution at all: the cost of a material change is
  // one walk of the triangles, here, on the click. getActiveMeshes rather than
  // getRenderables for the reason applyRigToActiveMeshes gives — mid-transition
  // the renderables list can hold one mesh twice.
  private changeMaterial(patch: Partial<MeshMaterial>) {
    Object.assign(this.material, patch);

    // A swatch, and only a swatch: the two procedural textures are drawn in the
    // base colour, so they are repainted here and the pattern cache is dropped
    // in the same breath. Neither half is optional — a repaint without the
    // invalidate leaves the previous colour on screen for good, and an
    // invalidate without the repaint costs one rebuild for nothing.
    if (patch.baseColor !== undefined) {
      this.procedural.redraw(this.material.baseColor);
      this.mapper.invalidate();
      this.surface3D.invalidateTextures();
    }

    this.shapes.getActiveMeshes().forEach((mesh) => {
      mesh.setMaterial(this.material);
    });
    this.repaintForMaterial();
    this.renderPausedFrame();
  }

  // Assigning canvas.width/height clears the backing store, which is why this
  // always ends in renderPausedFrame(): a running loop repaints on its own
  // next frame regardless, but a paused console would otherwise show a blank
  // canvas until something moved it again (E9b/COS-250).
  //
  // The early return compares against the canvas's own current size rather
  // than tracking "did the CSS size change" separately: it is what makes a
  // DPR-only change (same CSS box, new devicePixelRatio) fall through and
  // repaint, since dprEffective alone already changes the candidate width and
  // height.
  private resize(cssWidth: number, cssHeight: number) {
    const dprEffective = dprEffectiveFor(cssWidth, cssHeight, window.devicePixelRatio);
    const width = Math.round(cssWidth * dprEffective);
    const height = Math.round(cssHeight * dprEffective);

    if (width === this.stage.canvas.width && height === this.stage.canvas.height) {
      return;
    }

    this.stage.canvas.width = width;
    this.stage.canvas.height = height;
    this.renderTarget.setSize(width, height);
    this.background.resize(width, height);
    this.shapes.resize(width, height);
    this.camera.resize(width, height);
    this.viewportHud.setResolution(width, height);
    this.system.setBuffer(width, height);
    this.renderPausedFrame();
  }

  // Handed to ResizeObserver in init() and needs a bound this (R9). Coalesced
  // to one resize per animation frame: the observer fires on every
  // intermediate layout during a drag, and each resize below reallocates the
  // backing store and repaints the whole background.
  private onStageResize = (entries: ResizeObserverEntry[]) => {
    const entry = entries[0];

    if (!entry) {
      return;
    }

    // CSS pixels, not device pixels: resize() derives its own dprEffective
    // from these against the live devicePixelRatio, so both branches have to
    // land in the same space contentRect's fallback is already in.
    const box = entry.contentBoxSize?.[0];
    const cssWidth = box ? box.inlineSize : entry.contentRect.width;
    const cssHeight = box ? box.blockSize : entry.contentRect.height;

    if (this.pendingResizeRaf !== null) {
      cancelAnimationFrame(this.pendingResizeRaf);
    }

    this.pendingResizeRaf = requestAnimationFrame(() => {
      this.pendingResizeRaf = null;
      this.resize(cssWidth, cssHeight);
    });
  };

  // SystemWidget's own matchMedia listener calls this (E9b/COS-250) rather
  // than a second one arming here: dragging the window to a display with a
  // different devicePixelRatio does not reliably fire ResizeObserver, and the
  // CSS box has not changed, so the current size is read fresh rather than
  // waiting on an event that will not come.
  private handleDprChange() {
    const rect = this.viewportStage.getBoundingClientRect();

    this.resize(rect.width, rect.height);
  }

  // Mirrors changeCamera, but a drag has no SliderRow of its own already showing
  // the new angle the way an ELEV or AZIM input does — the rows have to be
  // pushed the numbers PointerOrbit computed, the same way applyViewPreset
  // pushes them mid-ease.
  private applyPointerOrbit(pitch: number, yaw: number) {
    this.rig.setAngles({ pitch, yaw });
    this.worldTab.setCameraUi(this.rig.angles());
    this.renderPausedFrame();
  }

  // changeZoom alone leaves the ZOOM row and the store exactly where a slider
  // drag would have moved them first — CameraSection.setZoomUi (via WorldTab)
  // is the write-back half a pointer gesture has to supply for itself.
  private applyPointerZoom(sliderValue: number) {
    this.changeZoom(sliderValue);
    this.worldTab.setZoomUi(sliderValue);
  }

  // A camera gesture, so it moves the camera and nothing else — which it now
  // genuinely does rather than nearly does. It leaves the shape's pose and its
  // turntable exactly where they were: resetting those would read as the shape
  // jerking for a gesture the user aimed at the viewpoint, and until COS-434 the
  // three angles it writes were the shape's own rows. Zoom goes through
  // applyPointerZoom rather than changeZoom so its own row follows. Deliberately
  // not resetControls() either: a stray double-tap must not touch shading,
  // materials or toggles — the toolbar RESET stays the only path for those.
  private applyPointerReset() {
    // The shared defaults rather than three literal zeros: the toolbar RESET
    // restores them through the store, and a double-tap that landed somewhere
    // else would be the one path in the console disagreeing about where home is.
    this.rig.setAngles({
      pitch: DEFAULT_CAM_ELEV_DEGREES,
      yaw: DEFAULT_CAM_AZIM_DEGREES,
      roll: DEFAULT_CAM_ROLL_DEGREES,
    });
    this.worldTab.setCameraUi(this.rig.angles());
    this.applyPointerZoom(DEFAULT_ZOOM_SLIDER_VALUE);
  }

  // A preset while paused has to repaint, or the chip appears to do nothing —
  // renderPausedFrame is that repaint, and it already returns early while the
  // loop is running, where the next frame picks the change up anyway. The run
  // state goes to the rig as well, which is what decides whether there are
  // frames for the 350ms ease to happen across.
  private applyViewPreset(key: ViewPresetKey) {
    this.rig.applyPreset(key, this.loop.isPlaying);
    // The paused case, where the rig lands immediately and there is no frame to
    // carry the write-back. While the loop runs, renderFrame pushes the rows
    // through the whole ease instead, so the thumbs travel with the camera.
    this.worldTab.setCameraUi(this.rig.angles());
    this.renderPausedFrame();
  }

  // SKY, FLOOR and GRID are single booleans with two surfaces — this tab's rows
  // and the viewport's quick toggles — so neither surface applies anything
  // itself. Both write the store and raise this, which re-reads the store once
  // and pushes the result to the renderer and back out to both. That is what
  // makes a flip from either end land on the other in the same frame.
  //
  // GRID STEP raises the same callback (COS-246) even though it has no second
  // surface to reconcile: it still has to reach setWorld, and one sync path
  // reading the whole store is simpler than a second one for a single slider.
  //
  // GROUND SHADOW and FOG joined it with COS-247 for the same reason, and FOG
  // has a second argument for joining it rather than getting a handler of its
  // own: what the fog fades toward is SKY DOME's answer, so the amount and the
  // sky flag have to be read in the same pass or a toggle can leave the colour
  // describing the previous frame.
  private syncWorldLayers() {
    // Every flip made by hand lands here — the WORLD tab's rows, the viewport's
    // pills and the keyboard actions all write the store and raise this one
    // callback — and every one of them is instant (HAL-174). Only the molecule
    // rule animates; making every SKY press a 1250ms dissolve is a change to a
    // control nobody asked to slow down. snapTo compares against the pair it is
    // already animating toward, so the rule's own write passes through it
    // untouched, and so do FOG and GRID STEP, which share this callback and
    // must not cut a withdrawal short.
    this.scenery.snapTo(this.sceneryLayers());
    this.pushWorldLayers();
    this.worldTab.syncEnvironmentUi();
    this.quickToggles.syncFromStore();
    this.renderPausedFrame();
  }

  // The renderer half of the sync above, on its own because the withdrawal calls
  // it on every frame it moves and the two UI surfaces have nothing to re-read:
  // the booleans they draw flipped once, at the start of the fade.
  //
  // That per-frame call is also what carries a moving reveal into Surface3D's
  // background-snapshot signature, through the layersVersion bump setLayers
  // already makes. The price is a full-canvas getImageData per frame for the
  // length of the transition — roughly 75 readbacks over 1250ms at 1024x640 —
  // and it is accepted: it is bounded, the cache serves hits again the moment
  // the sweep settles, and it lands inside the one window where the console is
  // already drawing two meshes for exactly the same 1250ms.
  private pushWorldLayers() {
    const state = this.uiState.getState();
    const sky = state.sky ?? DEFAULT_SKY;

    this.background.setLayers({
      sky,
      floor: state.floor ?? DEFAULT_FLOOR,
      grid: state.grid ?? DEFAULT_GRID,
      shadow: state.shadow ?? DEFAULT_SHADOW,
      skyReveal: this.scenery.skyReveal,
      floorReveal: this.scenery.floorReveal,
    });
    this.background.setWorld({ gridStepMetres: state.gridStep ?? DEFAULT_GRID_STEP });
    this.fog.setValues({ amount: state.fog ?? DEFAULT_FOG, skyEnabled: sky });
  }

  // The two switches the molecule rule animates, read through the same defaults
  // every other reader of them uses. A slice the user has never touched is
  // absent, not off.
  private sceneryLayers(): SceneryLayers {
    const state = this.uiState.getState();

    return { sky: state.sky ?? DEFAULT_SKY, floor: state.floor ?? DEFAULT_FLOOR };
  }

  // A molecule is not standing in a landscape: it is a structure held in
  // nothing, and the checker floor and the photographed sky are the two layers
  // that give a SOLID its sense of ground and scale. Selecting one withdraws
  // both; leaving one hands back whatever they were before it was picked, which
  // is not the same as forcing them on — a floor already switched off before the
  // molecule must stay off after it.
  //
  // Molecule-ness comes off moleculeInfo rather than a list of its own: it is
  // defined for exactly the keys whose shapeInfo entry declares family
  // "MOLECULES", and repaintForPrimitive already branches on the same table for
  // the story card. One more read of it, not a second list that can drift.
  //
  // Returns whether the pair moved, so a solid-to-solid switch — every one of
  // which reaches here — costs nothing beyond the lookup.
  private applySceneryRule(primitive: string | null): boolean {
    if (!primitive) {
      return false;
    }

    if (moleculeInfo[primitive]) {
      this.scenery.enter(this.sceneryLayers(), this.now());
      this.uiState.setState({ sky: false, floor: false });

      return true;
    }

    const restored = this.scenery.leave(this.now());

    if (!restored) {
      return false;
    }

    this.uiState.setState({ sky: restored.sky, floor: restored.floor });

    return true;
  }

  // Every pipeline change lands on the same three readouts and the same repaint,
  // so one handler replaces the three near-identical tails the two toggles and
  // the opacity slider each carried. The writes are idempotent — a wireframe
  // toggle rewrites the opacity row with the value it already had.
  private syncPipelineReadouts = () => {
    // Two writes, three surfaces: FieldWriter's own shadingMode field reaches
    // the status bar's segment and the viewport HUD's chip together, and SHAPE
    // INFO's SHADING row is the third. All of them print the store's slice
    // directly since E3c (COS-243) — the boolean they used to take could only
    // say WIRE or FLAT, which is why the HUD also carried a data-shading-mode
    // attribute nobody ever read.
    this.statusBar.setMode(this.shadingMode);
    this.shapeInfo.setShading(this.shadingMode);
    this.shapeInfo.setOpacity(this.pipeline.opacity);
    // The pipeline owns the opacity value and its availability — culling being
    // switched on resets it to fully opaque and disables the control — so the
    // row follows it rather than holding a second copy.
    this.shapeTab.setOpacityUi(Math.round(this.pipeline.opacity * 100));
    this.shapeTab.setOpacityDisabled(this.pipeline.getRenderOptions().cullBackfaces);
    // Same reasoning as opacity above, for the RENDER tab's own two real
    // controls: RenderPipelinePanel owns the booleans, this is the one place
    // that pushes them out to whichever surface needs to agree with them.
    this.renderTab.syncPipeline(this.pipeline.wireframe, this.pipeline.cullBackfaces);
    // The viewport's WIRE and CULL pills are the second surface on those same
    // two booleans, so they are pushed from here rather than reading the panel
    // themselves — a flip from either end lands on the other in this frame.
    this.quickToggles.syncPipeline(this.pipeline.wireframe, this.pipeline.cullBackfaces);
    this.renderPausedFrame();
  };

  // Everything a shape change repaints, in one callback. SHAPE INFO's fade
  // wraps this, so the two cards, the scene-graph row and the status bar all
  // change inside the same 180ms boundary rather than 180ms apart.
  private repaintForPrimitive(primitive: string) {
    const object3D = this.objects3D[primitive];
    // Derived once, here — the panel needs the key list, the MATERIAL row and
    // the status bar need the two-value label, and the three must not disagree.
    // Built on primitive change, never on the render path.
    const material = new MaterialSummary(object3D, this.material);

    this.sceneGraph.setMeshId(primitive);
    this.statusBar.setSelected(primitive);
    this.statusBar.setTexture(material);
    this.shapeInfo.show(primitive, object3D, material);
    this.shapeInfo.setOpacity(this.pipeline.opacity);
    // The third argument is undefined for the twenty solids, and its presence is
    // the whole of the mode switch — no flag and no branch here.
    this.shapeStory.show(primitive, shapeInfo[primitive], moleculeInfo[primitive]);
  }

  // The surface-describing half of the above, for when the material moved rather
  // than the shape: SHAPE INFO's MATERIAL and TEXTURES rows, and the one
  // texLabel write behind both the HUD chip and the status bar segment. The
  // name, the counts and the story are deliberately left alone — none of them
  // changed, and rebuilding the story panel's links on every swatch click would
  // drop one the keyboard was in.
  // One push behind the four LIGHTING rows and the KEY_LIGHT toggle, for the
  // reason changeMaterial is one push behind the swatches: the five values
  // describe one light, and a per-control handler would let two of them reach it
  // in an order that mattered.
  private applyLighting() {
    this.lighting.setValues(this.lightingValues());
    this.renderPausedFrame();
  }

  // Read off the store rather than handed in by the section, because `enabled`
  // is the scene graph's and the other four are the inspector's — this is the
  // one place both are in scope, and assembling the record anywhere else would
  // mean one of the two owners guessing at the other's value.
  private lightingValues(): LightingValues {
    const state = this.uiState.getState();

    return {
      azimuth: state.lightAzimuth ?? DEFAULT_AZIMUTH,
      elevation: state.lightElevation ?? DEFAULT_ELEVATION,
      ambient: state.lightAmbient ?? DEFAULT_AMBIENT,
      specular: state.lightSpecular ?? DEFAULT_SPECULAR,
      enabled: !this.sceneGraph.isLightHidden(),
    };
  }

  private repaintForMaterial() {
    const primitive = this.shapes.current;

    if (!primitive) {
      return;
    }

    const object3D = this.objects3D[primitive];
    const summary = new MaterialSummary(object3D, this.material);

    this.statusBar.setTexture(summary);
    this.shapeInfo.show(primitive, object3D, summary);
  }

  private animateShapeInfoPanel(primitive: string) {
    const repaint = () => this.repaintForPrimitive(primitive);

    if (!this.shapes.current) {
      this.shapeInfo.showImmediately(repaint);
      return;
    }

    this.shapeInfo.crossFade(repaint);
  }

  // The rate and the drawn count publish on the same tick, so the two numbers
  // on screen always describe the same frame.
  //
  // The framerate widget's history push is unconditional and runs every call:
  // its 90-sample buffer is 90 rendered frames, not 90 publishes, which is
  // what keeps the header's "90 frames" literal true. Its render() — the DOM
  // writes and the canvas repaint — rides the same throttle as fps below.
  private publishFrameStats() {
    const rate = this.fpsMeter.sample();
    this.framerate.pushSample(this.fpsMeter.rawFps);

    if (rate === null) {
      return;
    }

    this.fields.write("fps", rate);
    this.framerate.render();
    this.frameTime.render();
    this.geometry.render();
    this.zBuffer.render();
    this.publishCameraReadouts();
    this.system.render();
    this.publishDrawnTriangles(this.renderedTriangles);
  }

  // The cap reaches the loop and the framerate card on the same call. The card's
  // DROPPED threshold is a ratio of the target, so a cap the card did not know
  // about would have it counting every frame under the old absolute 40fps floor
  // as dropped — which at a 30fps cap is all of them.
  //
  // Safe to reach this.loop from a RenderTab callback even though the tab is
  // constructed first: nothing calls it until a chip is clicked, and both fields
  // are assigned by the time the constructor returns.
  private applyFrameRateCap(fps: number | null) {
    this.loop.setFrameRateCap(fps);
    this.framerate.setTargetFps(fps);
  }

  // The drawn count reaches the readouts, the telemetry card and the scene
  // graph row through here and nowhere else, so the three cannot disagree.
  private publishDrawnTriangles(count: number) {
    this.fields.write("trisDrawn", count);
    this.uiState.setState({ drawnTriangles: count });
  }

  // The machine's state, on the stage as data-transition (HAL-192). It is the
  // one fact about the picture nothing else exposes: whether a shape is still
  // arriving. The demo harness waits on it rather than on a sleep tuned to
  // TRANSITION_DURATION_MS, and every still it cuts is shot on a settled mesh
  // because of it. Written only when the state moves — an attribute write per
  // frame would be the cost the readouts' 90ms gate exists to avoid.
  private publishTransitionState() {
    const state = this.shapes.transitionState;

    if (state === this.lastTransitionState) {
      return;
    }

    this.lastTransitionState = state;
    this.viewportStage.dataset.transition = state;
  }

  // Called after the frame is painted rather than before it, and that ordering
  // is the whole correctness argument: projectedBounds reads whatever the
  // points currently hold, so it has to run downstream of the pose
  // applyRigToActiveMeshes wrote for this frame (E7c/HAL-123).
  //
  // The extent comes off the shared render target, never a literal — it is the
  // same pair the backing store was resized to, so the fractions the HUD
  // derives hold at any window size and under any pixel budget.
  private publishSelectionBounds() {
    const selected = this.shapes.getSelectedRenderable();

    if (!selected) {
      this.viewportHud.setSelection(null);

      return;
    }

    this.viewportHud.setSelection(
      selected.mesh.projectedBounds({
        offsetX: selected.offsetX ?? 0,
        offsetY: selected.offsetY ?? 0,
        targetWidth: this.renderTarget.width,
        targetHeight: this.renderTarget.height,
      }),
    );
  }

  private buildMesh(primitive: string): Mesh {
    const object3D = this.objects3D[primitive];
    if (!object3D) {
      throw new Error(`Unknown primitive: ${primitive}`);
    }

    const mesh = this.meshFactory.build(object3D);
    // Posed before it is ever drawn. A mesh built mid-transition starts at its
    // authored rest pose, and startTransition runs outside the render path — so
    // without this the incoming shape holds a different attitude from the
    // outgoing one for the first frame of every switch.
    mesh.setTransform(this.rig.meshMatrix(this.shapeRig.matrix()));
    // And surfaced, for exactly the same reason: a shape picked while SOLID is
    // selected must arrive solid rather than authored for one frame.
    mesh.setMaterial(this.material);

    return mesh;
  }

  private renderFrame(timestamp: number) {
    if (!this.loop.isPlaying) {
      return;
    }

    this.advanceAndRender(timestamp);
  }

  // One frame's worth of work, with no opinion about where the clock came from
  // (E8a). Split out of renderFrame so STEP can run exactly this while the loop
  // is stopped — the alternative was a paused repaint that re-poses without
  // advancing, which is renderPausedFrame below and is a different thing.
  private advanceAndRender(timestamp: number) {
    // Once per rendered frame, before anything this frame times — the rig's
    // own matrix pass below included (E6/COS-239).
    const timed = this.renderStats.beginFrame();

    this.shapes.update(timestamp);
    this.shapes.syncQueue(timestamp);
    this.publishTransitionState();

    // The scenery's withdrawal rides the same clock and the same beat as the
    // transition above (HAL-174), so the world and the shape settle together.
    // Pushed only on the frames a reveal actually moved — see pushWorldLayers
    // for what each of those frames costs Surface3D's snapshot cache.
    if (this.scenery.update(timestamp)) {
      this.pushWorldLayers();
    }

    // Read before advance, not after: advance is what clears a finished ease, so
    // a check made afterwards would skip the one frame carrying the angles the
    // preset actually landed on and leave the rows a fraction of a degree short.
    const easingPreset = this.rig.isEasingPreset;

    const elapsedSeconds = this.elapsedSeconds(timestamp);

    // Both, off one reading of the clock: the camera steps an ease and the shape
    // steps its turntable, and two calls to elapsedSeconds would have the second
    // one see a zero gap.
    this.rig.advance(elapsedSeconds);
    this.shapeRig.advance(elapsedSeconds);

    if (easingPreset) {
      this.worldTab.setCameraUi(this.rig.angles());
    }

    // Posed even while hidden, so showing the mesh again resumes the turn where
    // it would have been rather than where it was hidden.
    this.applyRigToActiveMeshes(timed);

    this.paint(this.shapes.getRenderables(), timed);
    // Every frame, not on the 90ms gate the numeric readouts ride: the gizmo is
    // a picture rather than a number, and E1b makes the viewport draggable.
    this.viewportHud.setGizmo(this.rig.axisScreenDirections());
    this.publishSelectionBounds();
  }

  private renderPausedFrame() {
    if (this.loop.isPlaying) {
      return;
    }

    const timed = this.renderStats.beginFrame();

    // A paused repaint really does re-pose the mesh now, which is what lets a
    // preset or a slider move the shape while the loop is stopped.
    this.applyRigToActiveMeshes(timed);

    this.paint(this.shapes.getRenderables(), timed);
    this.frameTime.render();
    this.geometry.render();
    this.zBuffer.render();
    this.publishCameraReadouts();
    // The gizmo has no clock of its own while the loop is stopped, so a preset
    // or a slider would leave it pointing at the attitude the shape had before.
    this.viewportHud.setGizmo(this.rig.axisScreenDirections());
    this.publishSelectionBounds();
    this.publishDrawnTriangles(this.renderedTriangles);
  }

  // The console's clock: real time while the loop runs, STEP's synthetic clock
  // while it does not.
  //
  // One reading for the whole app rather than performance.now() at each call
  // site, because the two disagree the moment the loop stops. A shape change
  // requested while paused used to be stamped with real time while the stepper
  // advanced a clock frozen at the pause, so the transition sat at a start
  // moment stepping could not reach until it had burned as many frames as the
  // pause had lasted — a switch that looked simply broken.
  private now(): number {
    return this.loop.isPlaying ? performance.now() : this.pausedClock;
  }

  // One frame, on demand, while the loop is stopped.
  //
  // The synthetic clock is load-bearing rather than tidiness. StateMachine
  // computes a transition's progress as (now - currentStateStartedAt) / duration,
  // so stepping with performance.now() after a thirty-second pause would finish a
  // queued 1250ms shape change in a single step. Advancing a clock of our own by
  // exactly one frame's worth instead makes a step mean a step: ten presses
  // mid-switch are ten frames of travel. On resume, RenderLoop's onStart rebases
  // both clocks off one reading of the real one, and the transition machine picks
  // up from the synthetic value the last step wrote.
  private stepFrame() {
    if (this.loop.isPlaying) {
      return;
    }

    this.pausedClock += FRAME_STEP_MS;
    this.advanceAndRender(this.pausedClock);

    // Everything renderPausedFrame publishes, and deliberately NOT
    // publishFrameStats(): that samples FPSMeter and pushes the FRAMERATE
    // sparkline, and a paused console reads 0 fps on purpose. The sparkline
    // flatlining as you step looks like a bug and is the honest answer — frames
    // arriving from a button have no rate.
    this.frameTime.render();
    this.geometry.render();
    this.zBuffer.render();
    this.publishCameraReadouts();
    this.publishDrawnTriangles(this.renderedTriangles);
  }

  // getActiveMeshes rather than getRenderables, and the difference matters: the
  // renderables list can hold one mesh twice mid-transition, which the old
  // incremental path would have rotated twice. An absolute matrix makes the call
  // idempotent, so that whole class of bug goes away with the de-duplication.
  //
  // Feeds RenderStats.transformMs directly (E6/COS-239) rather than returning
  // a number for the caller to thread through: TRANSFORM is this loop's own
  // cost plus Mesh.renderMesh's projection pass, and the accumulator is the
  // one place both halves can sum without paint() knowing either exists. timed
  // comes from the same beginFrame() call the whole frame answers to — an
  // unsampled frame must make zero performance.now() calls, this one included.
  private applyRigToActiveMeshes(timed: boolean) {
    const startedAt = timed ? performance.now() : 0;
    const matrix = this.rig.meshMatrix(this.shapeRig.matrix());

    this.shapes.getActiveMeshes().forEach((mesh) => {
      mesh.setTransform(matrix);
    });

    if (timed) {
      this.renderStats.addTransformMs(performance.now() - startedAt);
    }
  }

  // Clamped, so a tab that was in the background for a minute resumes rather
  // than jumping a minute's worth of rotation. rAF hands out timestamps on the
  // same clock as performance.now(), which is what lets the loop's onStart
  // rebase this with a reading of its own.
  private elapsedSeconds(timestamp: number): number {
    const elapsedMs = Math.min(MAX_FRAME_DELTA_MS, timestamp - this.lastFrameTimestamp);

    this.lastFrameTimestamp = timestamp;

    return elapsedMs / MILLISECONDS_PER_SECOND;
  }

  // The HUD's three camera rows and the CAMERA card read one rig through one
  // pair of formatters, so the overlay and the telemetry panel cannot print two
  // different cameras.
  private publishCameraReadouts() {
    this.viewportHud.setCamera(this.rig.eyePosition(this.camera.distance), this.rig.angles(), this.rig.target);
    this.cameraStats.render();
  }

  // Surface3D draws the background before it walks the renderables, so an empty
  // array keeps the sky, floor and vignette and drops only the mesh — and the
  // returned count correctly falls to zero.
  //
  // The registry is merged in here rather than held by the panel: it is the one
  // render option that is not a control, and it is required rather than optional
  // so a missing hand-off is a compile error instead of "dog" painted as a CSS
  // colour.
  private paint(renderables: MeshRenderRequest[], timed: boolean) {
    // The submitted list and the render options are both named rather than
    // inlined because the GEOMETRY card needs them below: it counts what was
    // actually handed to the renderer — a hidden mesh submits nothing — and it
    // reads culling off the same options object the frame was drawn with, so
    // the card cannot describe a different frame than the one on screen.
    const submitted = this.sceneGraph.isMeshHidden() ? [] : renderables;
    // Named because two things read it now. The light is fixed in the world, so
    // its eye-space direction is rebuilt against whatever the camera is doing
    // this frame — off the same matrix the background pass gets, and never off
    // meshMatrix(), which carries the turntable and E4a's scale.
    const cameraTransform = this.rig.viewMatrix();

    this.lighting.setCamera(cameraTransform, this.camera.projection.distance);

    const options = {
      ...this.pipeline.getRenderOptions(),
      textures: this.textures,
      lighting: this.lighting,
      mapper: this.mapper,
      fog: this.fog,
      // Device pixels, not CSS pixels: a hairline stroke at a backing store
      // taller than the 640px reference would otherwise read half as thick on
      // a DPR 2 display or on any resize above the seed size (E9b/COS-250).
      lineWidth: this.renderTarget.scale,
      // Read from the same two reveals pushWorldLayers hands the background
      // (HAL-191), so the ink crosses over on the withdrawal's own clock rather
      // than a frame either side of it: a molecule takes the sky and the floor
      // away, and WIRE and POINTS in near-black on the bare bgApp were drawn,
      // counted and invisible.
      ink: diagnosticInk(this.scenery.skyReveal, this.scenery.floorReveal),
      // A per-triangle paint option, unlike zBufferEnabled below, which picks a
      // backend for the whole frame (E3c/COS-243). wireframe rides alongside
      // rather than being derived from it: the PIPELINE toggle owns that boolean
      // and RenderTab keeps the two in step, so reading it off the mode here
      // would put the derivation in two places.
      shadingMode: this.shadingMode,
    };

    // One read for all three: they are three fields of one store, and reading it
    // once is what guarantees the backend and the two passes it configures come
    // from the same frame's state.
    const pipeline = this.uiState.getState();

    const stats = this.surface3D.render({
      renderables: submitted,
      options,
      timed,
      cameraTransform,
      zBufferEnabled: pipeline.zbuffer ?? DEFAULT_ZBUFFER,
      dither: pipeline.dither ?? DEFAULT_DITHER,
      edgeAA: pipeline.edgeAA ?? DEFAULT_EDGE_AA,
    });

    this.renderedTriangles = stats.drawn;
    // Four phases describing one frame because they come from one shared
    // accumulator: applyRigToActiveMeshes' own contribution to transformMs,
    // and everything Surface3D and Mesh added to the other three while
    // walking submitted (E6/COS-239).
    this.frameTime.pushSample({
      transformMs: stats.transformMs,
      clipCullMs: stats.clipCullMs,
      rasterMs: stats.rasterMs,
      presentMs: stats.presentMs,
      fillPx: stats.fillPx,
    });
    this.geometry.pushFrame({
      renderables: submitted,
      submitted: stats.submitted,
      drawn: stats.drawn,
      drawCalls: stats.drawCalls,
      cullBackfaces: options.cullBackfaces,
    });
    this.zBuffer.pushFrame(stats.depthBins, stats.depthNear, stats.depthFar);
  }

  private togglePause = () => {
    this.loop.toggle();

    // Seeded from the last rendered frame rather than from performance.now(), so
    // the first STEP advances exactly one frame's worth instead of one frame plus
    // however long the pause took to arrive.
    if (!this.loop.isPlaying) {
      this.pausedClock = this.lastFrameTimestamp;
    }

    this.syncRunState();
  };

  private syncRunState() {
    this.statusBar.setRunState(this.loop.isPlaying);
    this.transport.setRunState(this.loop.isPlaying);
  }

  // The whole scene as data, for SAVE PRESET and COPY CODE (E8b).
  //
  // Three owners, which is why this is assembled here and not in SessionActions:
  // the slices belong to the store, the two pipeline booleans and the opacity to
  // RenderPipelinePanel, and the primitive to the switcher. This class is the
  // one place all three are in scope, exactly as lightingValues() is for the
  // five values behind the key light.
  //
  // `target` rather than `current`, and the boot primitive rather than null: the
  // switcher reports no current shape until the opening entrance has finished,
  // and a preset saved in that first second must still name the shape on screen.
  private sceneSnapshot(): SceneSnapshot {
    const pipeline = this.pipeline.getRenderOptions();

    return {
      primitive: this.shapes.target ?? this.shapes.names[0],
      wireframe: pipeline.wireframe,
      backfaceCulling: pipeline.cullBackfaces,
      // Slider space, which is what the row shows and the snippet prints; the
      // panel holds the 0-1 fraction the renderer wants. Rounded through the
      // same expression syncPipelineReadouts writes the row with, so a saved
      // preset and the control it came from cannot read differently.
      opacity: Math.round(pipeline.opacity * 100),
      store: this.uiState.snapshot(),
    };
  }

  // resetControls' body with a file's values in place of the defaults, in the
  // same order and for the same reasons — the ticket asks for exactly that, and
  // any divergence would be a second definition of what "the whole scene" means.
  //
  // Two departures, both forced. pipeline.apply() rather than pipeline.reset(),
  // because the three values it owns are the ones with no slice to hydrate; and
  // a shape request at the end, which RESET has no equivalent for because RESET
  // does not change the primitive. The request is last so the 1250ms transition
  // starts against a console already holding the rest of the scene.
  private applyScene(scene: SceneSnapshot) {
    this.pipeline.apply({
      wireframe: scene.wireframe,
      cullBackfaces: scene.backfaceCulling,
      opacity: scene.opacity / 100,
    });
    // Both rigs, for the reason RESET resets them: the seven angles and the spin
    // RATE come back through the store, but the turntable's accumulated heading
    // and any preset ease still in flight do not — so without this a loaded
    // preset would land at its stored angles plus however far the shape had
    // wound since boot.
    this.rig.reset();
    this.shapeRig.reset();
    this.uiState.hydrate(scene.store);
    this.shapeTab.syncFromStore();
    this.renderTab.syncFromStore();
    this.worldTab.syncFromStore();
    // A preset arrives as a WHOLE scene, so its own sky and floor win outright
    // and become what leaving a molecule restores — there is nothing older left
    // to remember. It needs no special case beyond this: both are registered
    // slices, absent from RESERVED_PRESET_KEYS and TELEMETRY_KEYS alike, so a
    // file saved while a molecule was displayed already carries them off and
    // round-trips on its own.
    this.scenery.adopt(this.sceneryLayers());
    this.syncWorldLayers();
    this.pipeline.syncOpacityAvailability();
    this.syncPipelineReadouts();
    this.framerate.reset();
    this.shapes.request(scene.primitive);
  }

  // One handler behind both RESET mounts.
  //
  // Deliberate departure from the design, whose reset() also sets paused:false
  // (L1306): the transport is a session control, not a scene control, and RESET
  // must not restart a loop the user stopped on purpose.
  //
  // resetAll() restores every slice registered in the store. That is what makes
  // RESET coverage automatic — a later ticket registers its slice with its
  // defaults and is restored here without this function being edited.
  private resetControls = () => {
    this.pipeline.reset();
    // The two values with no slice of their own: any preset ease still in
    // flight, and the spin the turntable has wound up. The seven angles and the
    // spin rate come back through the store below, which is what makes RESET
    // return the shape to the pose it opened on rather than to the same numbers
    // at a random heading.
    this.rig.reset();
    this.shapeRig.reset();
    this.uiState.resetAll();
    // After resetAll, so the rows read the restored defaults — and it re-applies
    // them to the camera, which is what the slider bank's read-back used to do.
    this.shapeTab.syncFromStore();
    this.renderTab.syncFromStore();
    this.worldTab.syncFromStore();
    // RESET hands SKY DOME and CHECKER FLOOR back their registered defaults —
    // both true — and does not change the shape, so on a molecule it would
    // restore exactly the horizon the rule exists to take away. adopt() drops
    // what was remembered from before the molecule was picked, since the
    // defaults are what RESET means by "what they were"; the rule is then
    // re-asserted against them and settled rather than animated, because RESET
    // is not an animated moment anywhere else in the console.
    this.scenery.adopt(this.sceneryLayers());
    this.applySceneryRule(this.shapes.target);
    this.scenery.settle();
    this.syncWorldLayers();
    this.pipeline.syncOpacityAvailability();
    this.syncPipelineReadouts();
    this.framerate.reset();
  };
}

export default Main;
