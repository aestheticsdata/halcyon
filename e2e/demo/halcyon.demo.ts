import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@e2e/demo/fixture";

import type { Point } from "@e2e/demo/fixture";
import type { Locator, Page } from "@playwright/test";

/**
 * Halcyon, end to end — one continuous take, ten chapters, one screen.
 *
 * This file is the storyboard and nothing else: no pointer paths, no video, no timing arithmetic.
 * Those live in `cursor.ts`, `fixture.ts` and `pacing.ts`, so what is left here reads as a shot
 * list and can be reordered by moving blocks around.
 *
 * Four things it never breaks.
 *
 * IT DRIVES THE CONSOLE'S OWN CONTRACT. The toolbar names its buttons with `data-action`, the
 * play/pause mounts carry `data-transport`, every readout is a `data-field`, the tabs a
 * `data-tab-id`, the viewport pills a `data-quick-toggle`, the chips a `data-chip-id`, the swatches
 * an `aria-label`; the expand toggle, the opacity slider and the preset file input have ids.
 * `data-testid` was added only where a beat had nothing to hold — the stage, the primitive picker,
 * the shading chips, the slider rows, the shortcut chips (HAL-192). Never a class, never a label.
 *
 * THE CAMERA LEAVES THE DIAGONAL FIRST. The console opens on ISO, which puts the checker floor's
 * diagonal straight at the viewer and reads as a symmetric diagram. The first gesture swings the
 * camera off it, every orbit after is sized to land oblique again, and every still is framed from
 * the same view — see OBLIQUE.
 *
 * EVERY ANIMATION FINISHES BEFORE THE NEXT BEAT. A shape switch is 1250ms of two meshes crossing,
 * and the stage says when it is over: `Main` writes the transition machine's state onto it as
 * `data-transition`, so `settled()` below is an assertion rather than a sleep tuned to a constant.
 * The same attribute is what every still waits on before the shutter. The render loop is what
 * drives that machine, so nothing is ever picked while the console is paused.
 *
 * IT WRITES ONE FILE, INTO `out/`. SAVE PRESET downloads the scene as JSON, LOAD reads the same
 * file back through the picker the button raises. Nothing else leaves the browser, and RESET
 * restores what the console registered — there is no account and no server to put anything back.
 */

/**
 * The shapes the take walks through. The ball is the boot shape and is never picked: it carries the
 * materials and the first pause, because a checker on a sphere shows a mapping the way no cube can.
 * The donut for the faders — a checkered torus, so a pose change reads as the hole turning and the
 * checker sliding, and the one surface the picker lists. Two molecules, because picking one withdraws
 * the sky and the floor and turns the story card into MOLECULE PROPERTIES, and because a molecule is
 * what the full frame and a close zoom are for. Then the mathematics: two of the polyhedra of *The
 * Symmetries of Things*, one of its infinite ones, the Menger sponge, two torus knots — the (3,4)
 * knot last, since its 8 008 triangles read as a lattice in WIRE. The truncated icosidodecahedron
 * for the panels, and the trefoil for the last two chapters, so the closing minute is not spent on
 * the shape the panels were shown on. Not the cube, whose bitmaps say nothing about the rasteriser,
 * and not the pyramid, the least of the thirty-two.
 */
const SHAPES = {
  simple: "donut",
  closing: "torusKnot",
  molecule: "caffeine",
  secondMolecule: "aspirin",
  tour: ["rhombicTriacontahedron", "kisRhombicTriacontahedron", "mucube", "menger", "torusKnot25"],
  knot: "torusKnot34",
  polyhedron: "truncatedIcosidodecahedron",
} as const;

/**
 * Three portraits for the page that wants pictures: the mathematics the picker holds that no beat
 * of the film can hold still for — the sponge, the mucube and the kis rhombic triacontahedron, each
 * on its floor with its story card beside it. Each at its own distance, the one that fills the
 * picture without touching its edge: the sponge is a big shape and sits further off than the
 * working distance, the other two closer.
 */
const PORTRAITS = [
  { id: "menger", name: "menger-sponge", zoom: 60 },
  { id: "mucube", name: "mucube", zoom: 80 },
  { id: "kisRhombicTriacontahedron", name: "kis-rhombic-triacontahedron", zoom: 75 },
] as const;

/**
 * The first gesture of the take, and the one every still repeats. The console opens at elevation
 * 30° and azimuth 45°, the floor's diagonal pointing at the viewer; PointerOrbit turns 0.4° per
 * pixel, so this drag lands the camera near 25° / 67°, where the checker runs obliquely and the
 * shape sits in a floor rather than on a grid.
 */
const OBLIQUE = { dx: -55, dy: -12 };

/** The take's one file: the preset SAVE PRESET downloads and LOAD reads back, gitignored with `out/`. */
const PRESET_DIR = join(__dirname, "out", "upload");
const PRESET = join(PRESET_DIR, "preset.json");

/**
 * The wheel. PointerOrbit maps twenty CSS pixels of wheel to one point of the ZOOM row and rounds
 * the row after every event, so an event under ten pixels moves nothing, and an eased flick — whose
 * per-frame deltas are mostly under that — lands wherever the rounding leaves it. And the wire is
 * not the page: Chromium's CDP wheel takes its deltas in device pixels, so at this take's device
 * scale factor of 2 every delta reaches the page halved. So the film turns the wheel the way a hand
 * does, in notches — `NOTCH_POINTS` of the row per event, sized in device pixels from the page's own
 * devicePixelRatio, each waited on the HUD's zoom chip before the next — and every zoom below lands
 * on the figure asked.
 *
 * `ZOOM_NEAR` is the opening move and the working distance for every shape on its floor.
 * `ZOOM_CLOSE` is the molecule's: at 100 the row's maximum puts the camera inside caffeine's methyl
 * groups and the frame is atoms, so the close-up stops at 90. The stills reach the same two figures
 * in one event each.
 */
const ZOOM_NEAR = 65;
const ZOOM_CLOSE = 90;
const CSS_PIXELS_PER_POINT = 20;
const NOTCH_POINTS = 5;
const NOTCH_GAP = 90;

/** What the faders are dragged to. Degrees, degrees per second, percent. */
const POSE = { pitch: 35, yaw: -40, roll: 25 };
const SPIN_SLOW = 60;
const SCALE_UP = 130;
const SCALE_HOME = 100;
const UV_COARSE = 3;
const OPACITY_DOWN = 45;
const LIGHT_AZIMUTH = 250;
const CAMERA_AZIM = -120;
const CAMERA_ELEV = 28;
const FOV_WIDE = 118;
const FOV_HOME = 94;
const FOG_UP = 55;

/** How many frames STEP advances the paused loop by, one press each. */
const STEPS = 3;

/**
 * The picture at rest: nothing arriving, nothing leaving. Read off the stage rather than timed —
 * see the header. Fifteen seconds is the whole of a shape switch several times over, so a wait
 * that runs out is a switch that never started.
 */
const settledOn = (target: Page) =>
  expect(target.getByTestId("viewport")).toHaveAttribute("data-transition", "idle", { timeout: 15_000 });

/** The middle of the picture, in client pixels — where the plain gestures below press. */
const stageCentre = async (target: Page): Promise<Point> => {
  const box = await target.getByTestId("viewport").boundingBox();
  if (!box) throw new Error("demo: the viewport has no box to point at");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** The camera swung off the diagonal, the plain way, for a still. */
const swingCamera = async (target: Page): Promise<void> => {
  const centre = await stageCentre(target);
  await target.mouse.move(centre.x, centre.y);
  await target.mouse.down();
  await target.mouse.move(centre.x + OBLIQUE.dx, centre.y + OBLIQUE.dy, { steps: 12 });
  await target.mouse.up();
};

/** One wheel event's worth of device pixels for `points` of the ZOOM row — see the header on the wheel. */
const wheelPixels = async (target: Page, points: number): Promise<number> =>
  points * CSS_PIXELS_PER_POINT * (await target.evaluate(() => window.devicePixelRatio));

/**
 * The wheel, once, for a still: one event, sized to land the ZOOM row on `zoom` exactly, and the
 * HUD's zoom chip waited on before returning so a second turn cannot overtake the first.
 */
const zoomTo = async (target: Page, zoom: number): Promise<void> => {
  const chip = target.locator('[data-field="zoom"]').filter({ visible: true }).first();
  const current = Number(((await chip.textContent()) ?? "").replace("%", ""));
  if (current === zoom) return;
  const centre = await stageCentre(target);
  await target.mouse.move(centre.x, centre.y);
  await target.mouse.wheel(0, -(await wheelPixels(target, zoom - current)));
  await expect(chip).toHaveText(`${zoom}%`);
};

/**
 * A shape chosen the plain way, for the stills: the picker opened and the option clicked, then the
 * switch waited out. `switching` is asserted before `idle` so a click that never reached the
 * switcher cannot pass on the idle the stage was already showing. The picker is a SHAPE-tab
 * control, and a fresh page opens on that tab.
 */
const showShape = async (target: Page, id: string): Promise<void> => {
  await settledOn(target);
  await target.getByTestId("shape-picker").click();
  const option = target.locator(`[data-testid="shape-option"][data-shape="${id}"]`);
  await option.click();
  await expect(option).toHaveAttribute("aria-selected", "true");
  await expect(target.getByTestId("viewport")).toHaveAttribute("data-transition", "switching");
  await settledOn(target);
};

/**
 * Every still's common ground: the console settled, the camera off the diagonal, the shape on
 * screen — or the boot shape kept, when no id is given — and the wheel in. The zoom comes after
 * the pick so the frame stays right the day a pick returns the zoom home (HAL-190).
 */
const frame = async (target: Page, id?: string): Promise<void> => {
  await settledOn(target);
  await swingCamera(target);
  if (id) await showShape(target, id);
  await zoomTo(target, ZOOM_NEAR);
};

test("halcyon, end to end", async ({ demo }) => {
  const page = demo.page;

  const app = page.locator("#app");
  const viewport = page.getByTestId("viewport");
  /**
   * Readouts and controls the shell mounts more than once — a desktop copy, a mobile one hidden by
   * CSS, and for the transport a third in the HUD that theatre mode leaves standing — addressed by
   * the first copy on screen: for every readout the take reads that is the HUD's, which is also
   * the one copy left standing in theatre mode; for the transport it is the toolbar's until the
   * console folds, and the HUD's after.
   */
  const readout = (field: string) => page.locator(`[data-field="${field}"]`).filter({ visible: true }).first();
  const action = (id: string) => page.locator(`[data-action="${id}"]`).filter({ visible: true }).first();
  const quickToggle = (key: string) => page.locator(`[data-quick-toggle="${key}"]`).filter({ visible: true }).first();
  const transport = page.locator('[data-transport="toggle"]').filter({ visible: true }).first();
  const tab = (id: string) => page.locator(`#inspectorTabs [data-tab-id="${id}"]`);
  const shadingChip = (mode: string) => page.locator(`[data-testid="shading-chip"][data-chip-id="${mode}"]`);
  const textureChip = (id: string) => page.locator(`#textureGrid [data-chip-id="${id}"]`);
  const swatch = (name: string) => page.locator(`#baseSwatches [aria-label="${name}"]`);
  const viewPreset = (key: string) => page.locator(`#viewPresetChips [data-chip-id="${key}"]`);
  const shortcut = (actionId: string) => page.locator(`[data-testid="shortcut"][data-shortcut="${actionId}"]`);
  const row = (testId: string) => page.getByTestId(testId);
  const opacity = page.locator("#opacitySlider");
  const expandToggle = page.locator("#viewportExpandToggle");
  const storyHeader = page.locator("#shapeStoryHeader");

  const settled = () => settledOn(page);

  /** A point on the picture, as fractions of the stage's box. */
  const onStage = async (fx: number, fy: number): Promise<Point> => {
    const box = await viewport.boundingBox();
    if (!box) throw new Error("demo: the viewport has no box to point at");
    return { x: box.x + box.width * fx, y: box.y + box.height * fy };
  };

  /** The camera orbited by hand: a press on the picture, walked by `dx`, `dy` pixels — 0.4° each. */
  const orbit = async (fx: number, fy: number, dx: number, dy: number, hold: number): Promise<void> => {
    const from = await onStage(fx, fy);
    await demo.drag(from, { x: from.x + dx, y: from.y + dy }, { dwell: hold });
  };

  /**
   * Where a range input draws its thumb for a value. Chrome centres a thumb on the track and lets
   * it travel the track's width less its own, so the thumb's width — the `--size-range-thumb-w`
   * token slider.css paints it with — is what the arithmetic needs. Pressing here and walking to
   * the next value's point is exactly what a hand does to a slider; a press elsewhere on the track
   * would jump the thumb first.
   */
  const thumbAt = async (input: Locator, value: number): Promise<Point> => {
    const box = await input.boundingBox();
    if (!box) throw new Error("demo: the slider has no box to point at");
    const { min, max, thumb } = await input.evaluate((node: HTMLInputElement) => ({
      min: Number(node.min),
      max: Number(node.max),
      thumb: Number.parseFloat(getComputedStyle(node).getPropertyValue("--size-range-thumb-w")) || 9,
    }));
    const fraction = (value - min) / (max - min);
    return { x: box.x + thumb / 2 + (box.width - thumb) * fraction, y: box.y + box.height / 2 };
  };

  const dragSlider = async (input: Locator, to: number, hold: number): Promise<void> => {
    const from = Number(await input.inputValue());
    await demo.drag(await thumbAt(input, from), await thumbAt(input, to), { dwell: hold });
  };

  /** The ZOOM readout as a number: `70%` on the HUD chip is `70` here. */
  const zoomPercent = async (): Promise<number> =>
    Number(((await readout("zoom").textContent()) ?? "").replace("%", ""));

  /**
   * The wheel turned to a figure, notch by notch — see NOTCH_POINTS. The pointer is on the picture
   * first, since the wheel goes where the pointer is; the last notch is cut to what is left, and
   * each is read back off the chip rather than assumed, so a notch that landed short is made up by
   * the next.
   */
  const wheelTo = async (target: number): Promise<void> => {
    await demo.moveTo(viewport);
    let current = await zoomPercent();
    while (current !== target) {
      const points = Math.max(-NOTCH_POINTS, Math.min(NOTCH_POINTS, target - current));
      await page.mouse.wheel(0, -(await wheelPixels(page, points)));
      await expect(readout("zoom")).not.toHaveText(`${current}%`);
      current = await zoomPercent();
      await demo.dwell(NOTCH_GAP);
    }
  };

  /**
   * A shape picked on camera: the dropdown opened, the row found — the picker scrolls its own list
   * to it when it sits past the fold — and the switch played to the end before `hold` of looking.
   */
  const pick = async (id: string, hold: number): Promise<void> => {
    await demo.click(page.getByTestId("shape-picker"));
    const option = page.locator(`[data-testid="shape-option"][data-shape="${id}"]`);
    await expect(option).toBeVisible();
    await demo.dwell(700);
    await demo.click(option);
    await expect(option).toHaveAttribute("aria-selected", "true");
    await expect(viewport).toHaveAttribute("data-transition", "switching");
    await settled();
    await demo.dwell(hold);
  };

  /** The loop stopped, and the console saying so on the transport and in the status bar. */
  const pause = async (): Promise<void> => {
    await demo.click(transport);
    await expect(transport).toHaveText("RESUME");
    await expect(readout("statusLabel")).toHaveText("PAUSED");
  };

  const resume = async (): Promise<void> => {
    await demo.click(transport);
    await expect(transport).toHaveText("PAUSE");
    await expect(readout("statusLabel")).toHaveText("RUNNING");
  };

  // ── 1 ── The viewport ────────────────────────────────────────────────────
  // The film starts once the page has painted (`Demo.open`), which is after the ball has dropped
  // in: the entrance is 1250ms and `settle()` is longer. A short look at the console as a visitor
  // first sees it, then the camera off the diagonal — the view every later beat keeps — and the
  // wheel in.
  await demo.open("/");
  await demo.chapter("The viewport");

  await expect(viewport).toBeVisible();
  await settled();
  await expect(readout("trisDrawn")).not.toHaveText("0");
  await demo.dwell(1800);
  const openingRotation = (await readout("camRot").textContent()) ?? "";
  await orbit(0.55, 0.52, OBLIQUE.dx, OBLIQUE.dy, 1400);
  await expect(readout("camRot")).not.toHaveText(openingRotation);
  await wheelTo(ZOOM_NEAR);
  await demo.dwell(1400);
  demo.shot("console", (target) => frame(target));

  // ── 2 ── The ball ────────────────────────────────────────────────────────
  await demo.chapter("The ball");

  // All four materials on the sphere the console boots on. AUTHORED is what the shape file says —
  // the red and white of the ball itself; CHECKER and UV GRID are generated, and UV SCALE coarsens
  // the checker between them; SOLID is the swatch row's colour, red then blue; then AUTHORED back,
  // tinted by the swatch still active, and white again. The HUD's material chip follows the
  // generated two; the authored ball declares no bitmap, so on it AUTHORED reads SOLID.
  await demo.click(textureChip("checker"));
  await expect(readout("texLabel")).toHaveText("CHECKER");
  await demo.dwell(1600);
  await dragSlider(row("material-uv-scale"), UV_COARSE, 1500);
  await demo.click(textureChip("uvGrid"));
  await expect(readout("texLabel")).toHaveText("UV GRID");
  await demo.dwell(1800);
  await demo.click(textureChip("solid"));
  await expect(readout("texLabel")).toHaveText("SOLID");
  await demo.dwell(1000);
  await demo.click(swatch("red"));
  await expect(swatch("red")).toHaveAttribute("aria-pressed", "true");
  await demo.dwell(1200);
  await demo.click(swatch("blue"));
  await demo.dwell(1200);
  await demo.click(textureChip("authored"));
  await expect(textureChip("authored")).toHaveAttribute("aria-pressed", "true");
  await demo.dwell(1600);
  await demo.click(swatch("white"));
  await demo.dwell(1400);

  // The loop stopped, and the picture still answering the hand: a paused repaint re-poses the
  // scene, so a drag walks the camera round the frozen ball one frame per move. Then STEP, three
  // frames of the turntable one press at a time, and RESUME.
  await pause();
  await demo.dwell(1200);
  const frozenRotation = (await readout("camRot").textContent()) ?? "";
  await orbit(0.5, 0.5, 95, 10, 1400);
  await expect(readout("camRot")).not.toHaveText(frozenRotation);
  for (let step = 0; step < STEPS; step += 1) {
    await demo.click(action("stepFrame"), { dwell: 420 });
  }
  await demo.dwell(600);
  await resume();
  await demo.dwell(1000);

  // ── 3 ── The faders ──────────────────────────────────────────────────────
  await demo.chapter("The faders");

  // The donut, whose hole and checker make every axis legible. Its own attitude one axis at a
  // time, under the turntable that keeps spinning it; the turntable brought to a stop and restarted
  // slower — it stays slower for the rest of the take; SCALE up and back.
  await pick(SHAPES.simple, 1400);
  for (const [axis, degrees] of Object.entries(POSE)) {
    await dragSlider(row(`transform-${axis}`), degrees, 1200);
  }
  await dragSlider(row("transform-spin"), 0, 1600);
  await dragSlider(row("transform-spin"), SPIN_SLOW, 1200);
  await dragSlider(row("transform-scale"), SCALE_UP, 1400);
  // What the rows actually read after the drags, not what was asked: a thumb lands within a
  // degree or two of its target.
  expect(Number(await row("transform-pitch").inputValue()), "PITCH did not move").not.toBe(0);
  expect(Number(await row("transform-scale").inputValue()), "SCALE did not move").toBeGreaterThan(110);
  await dragSlider(row("transform-scale"), SCALE_HOME, 1200);
  expect(Number(await row("transform-scale").inputValue()), "SCALE did not come back").toBeLessThan(112);

  // ── 4 ── Molecules ───────────────────────────────────────────────────────
  await demo.chapter("Molecules");

  // A molecule is not standing in a landscape (HAL-174): picking one withdraws the sky and the
  // floor on the transition's own clock, and the story card becomes MOLECULE PROPERTIES. Then the
  // console folded away — one attribute on the shell root, and the picture is the whole screen —
  // the loop stopped, and the camera taken in close on the full frame: the wheel and two long
  // drags, all on a frozen frame, so the ball-and-stick reads atom by atom. The turntable given
  // back, a few seconds of the molecule alone, and the console returned by the same button — the
  // one control standing besides the pills and the transport, which the HUD keeps.
  await pick(SHAPES.molecule, 400);
  await expect(quickToggle("SKY")).toHaveAttribute("aria-pressed", "false");
  await expect(quickToggle("FLOOR")).toHaveAttribute("aria-pressed", "false");
  await expect(storyHeader).toHaveText(/molecule properties/i);
  await demo.dwell(2000);
  await demo.click(expandToggle);
  await expect(app).toHaveAttribute("data-viewport", "expanded");
  await demo.dwell(1000);
  await pause();
  await demo.dwell(600);
  await wheelTo(ZOOM_CLOSE);
  await demo.dwell(1600);
  const rotationBefore = (await readout("camRot").textContent()) ?? "";
  await orbit(0.5, 0.5, -120, -12, 1400);
  await expect(readout("camRot")).not.toHaveText(rotationBefore);
  await orbit(0.4, 0.5, -88, 6, 1800);
  await resume();
  await demo.dwell(2600);
  demo.shot("molecule", async (target) => {
    await frame(target, SHAPES.molecule);
    await zoomTo(target, ZOOM_CLOSE);
  });
  demo.shot("theatre-mode", async (target) => {
    await frame(target, SHAPES.secondMolecule);
    await zoomTo(target, ZOOM_CLOSE);
    await target.locator("#viewportExpandToggle").click();
    await expect(target.locator("#app")).toHaveAttribute("data-viewport", "expanded");
  });
  await demo.click(expandToggle);
  await expect(app).not.toHaveAttribute("data-viewport", "expanded");
  await demo.dwell(1200);

  // A second molecule at the same distance, with the console back around it — and the full frame
  // again, briefly, with the camera walked round it, since a molecule is what the full frame is
  // for. Then the wheel back out for what follows.
  await pick(SHAPES.secondMolecule, 1600);
  await demo.click(expandToggle);
  await expect(app).toHaveAttribute("data-viewport", "expanded");
  await demo.dwell(800);
  await orbit(0.5, 0.5, 110, 8, 1800);
  await demo.dwell(1000);
  await demo.click(expandToggle);
  await expect(app).not.toHaveAttribute("data-viewport", "expanded");
  await demo.dwell(800);
  await wheelTo(ZOOM_NEAR);
  await demo.dwell(1000);

  // ── 5 ── Polyhedra and knots ─────────────────────────────────────────────
  await demo.chapter("Polyhedra and knots");

  // The mathematics in the picker, one after another: two of the polyhedra of *The Symmetries of
  // Things*, then one of its infinite ones — the mucube, which the camera is walked round — the
  // Menger sponge, and two torus knots. The first pick brings the scenery back with it.
  const [triacontahedron, ...rest] = SHAPES.tour;
  await pick(triacontahedron, 400);
  await expect(quickToggle("SKY")).toHaveAttribute("aria-pressed", "true");
  await expect(storyHeader).toHaveText(/shape story/i);
  await demo.dwell(1800);
  for (const id of rest) {
    await pick(id, 2000);
    if (id === "mucube") await orbit(0.45, 0.5, 90, 10, 1600);
  }
  await pick(SHAPES.knot, 2400);
  for (const portrait of PORTRAITS) {
    demo.shot(portrait.name, async (target) => {
      await frame(target, portrait.id);
      await zoomTo(target, portrait.zoom);
    });
  }

  // ── 6 ── Wireframe ───────────────────────────────────────────────────────
  await demo.chapter("Wireframe");

  await demo.click(tab("render"));
  await expect(app).toHaveAttribute("data-tab", "render");
  await demo.dwell(800);

  // The knot as a lattice first, and the camera walked round it while it is one; then the other
  // ways to draw the same mesh, and FLAT again. The HUD's mode chip follows each click, so a chip
  // that missed fails the take rather than filming the wrong mode.
  await demo.click(shadingChip("WIRE"));
  await expect(shadingChip("WIRE")).toHaveAttribute("aria-pressed", "true");
  await expect(readout("shadingMode")).toHaveText("WIRE");
  await demo.dwell(2400);
  await orbit(0.5, 0.5, -105, -15, 2000);
  demo.shot("render-tab", async (target) => {
    await frame(target, SHAPES.knot);
    await target.locator('#inspectorTabs [data-tab-id="render"]').click();
    await target.locator('[data-testid="shading-chip"][data-chip-id="WIRE"]').click();
  });
  for (const mode of ["POINTS", "NORMALS", "GOURAUD", "FLAT"]) {
    await demo.click(shadingChip(mode));
    await expect(shadingChip(mode)).toHaveAttribute("aria-pressed", "true");
    await expect(readout("shadingMode")).toHaveText(mode);
    await demo.dwell(1500);
  }
  // The key light swung round: every face re-shades as it passes.
  await dragSlider(row("lighting-azimuth"), LIGHT_AZIMUTH, 1600);

  // ── 7 ── Opacity ─────────────────────────────────────────────────────────
  await demo.chapter("Opacity");

  // Back to the SHAPE tab for the picker, and the largest of the Archimedean solids, seen through.
  // Culling gates opacity: the row is disabled while backfaces are culled, because a see-through
  // shape with its back half missing is not a see-through shape. Off from the viewport pill, the
  // row wakes up; on again, and the console puts the row back to 100% itself.
  await demo.click(tab("shape"));
  await expect(app).toHaveAttribute("data-tab", "shape");
  await pick(SHAPES.polyhedron, 1200);
  await demo.click(quickToggle("CULL"));
  await expect(quickToggle("CULL")).toHaveAttribute("aria-pressed", "false");
  await expect(opacity).toBeEnabled();
  await dragSlider(opacity, OPACITY_DOWN, 2400);
  await expect(page.locator("#shapeInfoOpacity")).not.toHaveText("100%");
  await demo.click(quickToggle("CULL"));
  await expect(opacity).toHaveValue("100");
  await expect(opacity).toBeDisabled();
  await demo.dwell(1200);

  // ── 8 ── The panels ──────────────────────────────────────────────────────
  await demo.chapter("The panels");

  // SHAPE STORY, the one card that is prose: read at a scrolling pace.
  await demo.moveTo(page.locator("#shapeStoryTitle"), { dwell: 1200 });
  await demo.scroll(page.locator("#shapeStoryDescription"), 220, 1300);
  await demo.dwell(700);

  // The telemetry row: the framerate chart, the depth histogram, the camera card.
  await demo.moveTo(page.locator("#fpsChart"), { dwell: 1300 });
  await demo.moveTo(page.locator("#zbufferBars"), { dwell: 1100 });
  await demo.moveTo(readout("camStatPosition"), { dwell: 900 });

  // The WORLD tab. TOP, the one preset that reads as a different picture; then the whole scene
  // turned from the rows — azimuth first, the camera brought down from the zenith after — which
  // is the other way of orbiting. A wider lens, and back. Then the fog rolled in and out.
  await demo.click(tab("world"));
  await expect(app).toHaveAttribute("data-tab", "world");
  await demo.dwell(1000);
  await demo.click(viewPreset("TOP"));
  await expect(readout("camRot")).toHaveText(/^89\.0°/);
  await demo.dwell(1500);
  await dragSlider(row("camera-azim"), CAMERA_AZIM, 1400);
  await dragSlider(row("camera-elev"), CAMERA_ELEV, 1600);
  await expect(readout("camRot")).not.toHaveText(/^89\.0°/);
  await dragSlider(row("camera-fov"), FOV_WIDE, 1400);
  await expect(readout("fov")).not.toHaveText(`${FOV_HOME}°`);
  await dragSlider(row("camera-fov"), FOV_HOME, 1000);
  await dragSlider(row("environment-fog"), FOG_UP, 1800);
  expect(Number(await row("environment-fog").inputValue()), "FOG did not move").toBeGreaterThan(0);
  await dragSlider(row("environment-fog"), 0, 1200);
  demo.shot("world-tab", async (target) => {
    await frame(target, SHAPES.polyhedron);
    await target.locator('#inspectorTabs [data-tab-id="world"]').click();
  });

  // ── 9 ── Shortcuts ───────────────────────────────────────────────────────
  await demo.chapter("Shortcuts");

  // A new shape for the last two chapters — the trefoil — so the closing minute is not spent on
  // the one the panels were shown on. Then a click on the picture. The pick left a button focused,
  // and the key handler stands down while a control has focus — SPACE on the PAUSE button would
  // otherwise toggle the loop twice. The canvas takes no focus, so this hands the keyboard back to
  // the page.
  //
  await demo.click(tab("shape"));
  await expect(app).toHaveAttribute("data-tab", "shape");
  await pick(SHAPES.closing, 800);
  // G, S, S, F, F — the world layers, whose pills answer the key in the same frame. Not W: the
  // wireframe was shown from its chip in chapter 6, and the W key leaves the HUD's mode chip and
  // the status bar one toggle behind the picture (HAL-193), which a viewer would read as the
  // console contradicting itself.
  await demo.click(viewport);
  await demo.moveTo(shortcut("toggleGrid"), { dwell: 900 });
  await demo.press("g");
  await expect(quickToggle("GRID")).toHaveAttribute("aria-pressed", "true");
  await demo.dwell(1600);
  await demo.moveTo(shortcut("toggleSky"), { dwell: 700 });
  await demo.press("s");
  await expect(quickToggle("SKY")).toHaveAttribute("aria-pressed", "false");
  await demo.dwell(1800);
  await demo.press("s");
  await expect(quickToggle("SKY")).toHaveAttribute("aria-pressed", "true");
  await demo.dwell(1000);
  await demo.moveTo(shortcut("toggleFloor"), { dwell: 700 });
  await demo.press("f");
  await expect(quickToggle("FLOOR")).toHaveAttribute("aria-pressed", "false");
  await demo.dwell(1800);
  await demo.press("f");
  await expect(quickToggle("FLOOR")).toHaveAttribute("aria-pressed", "true");
  await demo.dwell(1000);

  // ── 10 ── Presets ────────────────────────────────────────────────────────
  await demo.chapter("Presets");

  // SAVE PRESET downloads the scene as it stands — the knot, its pose and its slower spin,
  // the zoom, the camera the WORLD rows set, the light, the grid the shortcut switched on. RESET
  // clears all of it but the shape, back to the symmetric console the take opened on; LOAD hands
  // the same file back through the picker the button raises, and the scene returns.
  mkdirSync(PRESET_DIR, { recursive: true });
  // The scene as the console holds it at this moment, which is what the file will carry and what
  // LOAD is checked against.
  const saved = {
    pitch: await row("transform-pitch").inputValue(),
    yaw: await row("transform-yaw").inputValue(),
    roll: await row("transform-roll").inputValue(),
    cameraAzimuth: await row("camera-azim").inputValue(),
  };
  const download = page.waitForEvent("download");
  await demo.click(action("savePreset"));
  await (await download).saveAs(PRESET);
  await demo.dwell(1200);

  await demo.click(action("resetControls"));
  await expect(row("transform-pitch")).toHaveValue("0");
  await expect(quickToggle("GRID")).toHaveAttribute("aria-pressed", "false");
  await expect(readout("zoom")).toHaveText("50%");
  await demo.dwell(2600);

  const chooser = page.waitForEvent("filechooser");
  await demo.click(action("loadPreset"));
  await (await chooser).setFiles(PRESET);
  await expect(row("transform-pitch")).toHaveValue(saved.pitch);
  await expect(row("transform-yaw")).toHaveValue(saved.yaw);
  await expect(row("transform-roll")).toHaveValue(saved.roll);
  await expect(row("camera-azim")).toHaveValue(saved.cameraAzimuth);
  await expect(quickToggle("GRID")).toHaveAttribute("aria-pressed", "true");
  await expect(readout("zoom")).not.toHaveText("50%");
  await demo.dwell(3200);

  // ── At rest ──────────────────────────────────────────────────────────────
  // Off-frame on the same beat, so the pointer's teleport hides under the last hover fading out.
  await demo.park(-40, -40);
  await demo.dwell(2600);
  // One last pointer move, which nobody sees. The screencast emits a frame only when something
  // is drawn and the recorder holds its final frame for a single sixtieth of a second — the
  // shape is still turning here, so frames keep coming, but the closing hold should not depend
  // on it.
  await demo.park(-41, -41);
});
