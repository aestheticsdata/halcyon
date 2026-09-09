// MATERIAL: how the surface is painted.
//
// All four controls are real. OPACITY reaches the rasteriser through
// TriangleRenderOptions and has been live since before the refonte; the five
// swatches and two of the four texture chips became live with E4a, and E4b
// generated the two textures behind CHECKER and UV GRID and gave UV SCALE
// something to tile.
//
// UV SCALE does nothing in AUTHORED or SOLID, and that is resolved in
// resolveMaterial rather than disabled here. The row ships at 8, so a scale that
// applied to the cube's two bitmap faces would open the console on a wall of
// dogs — and greying the row out in two of four modes would say the control was
// unfinished, which is the opposite of what this ticket did to it.
//
// The structural reason textures could not be swapped at runtime is gone rather
// than worked around. Materials are still baked per triangle in
// src/data/shapes/* — rgba() strings plus the `dog` and `galaxy` keys on the
// cube — and that is deliberate, because it is what makes the registry worth
// reading. E4a classifies that authored slot once and resolves it against a
// mesh-wide material, so AUTHORED still draws exactly what the shape files say
// while SOLID overrides all of it.
//
// The swatch row is where the palette turns into a colour the engine can use.
// The names are the store's — RESET and the store stay readable — and what
// leaves here is whatever --color-swatch-* resolved to, so colors.css remains
// the one place the palette is written down.
//
// The OPACITY input keeps the id #opacitySlider. RenderPipelinePanel resolves
// that element to own its `disabled` state and the follow-cursor tooltip, so
// this section must build it before that class is constructed.

import ChipGrid from "@ui/inspector/controls/ChipGrid";
import SliderRow from "@ui/inspector/controls/SliderRow";

import type { TextureMode } from "@rendering/material";
import type UIStateStore from "@ui/UIStateStore";

// AUTHORED and white, because the default state has to be the frame the renderer
// already draws: AUTHORED is the mode that defers to the shape files, and white
// is the identity of the multiply the base colour performs. The mockup opens on
// CHECKER and red, which would have made the console's first frame a shape
// nothing in the registry describes.
export const DEFAULT_TEXTURE: TextureMode = "authored";
export const DEFAULT_BASE_COLOR = "white";
export const DEFAULT_UV_SCALE = 8;
export const DEFAULT_OPACITY_UI = 100;

// Exported because RenderPipelinePanel resolves the same element to own its
// `disabled` state and the follow-cursor tooltip. One place spells the id, and
// it is the place that creates it.
export const OPACITY_SLIDER = "#opacitySlider";

const OPACITY_MIN = 0;
const OPACITY_MAX = 100;
const UV_MIN = 1;
const UV_MAX = 16;

// The design's fourth chip is NO TEXTURE, which in an engine whose shapes ship
// their own materials would either be a synonym for SOLID or the only state in
// which the cube's dog and galaxy faces are visible. AUTHORED names what it
// actually does. Renamed in place, so the two-column grid does not move.
//
// The ids are TextureMode's own values rather than a second vocabulary mapped
// onto it: one union behind the chip and the branch in resolveMaterial, so
// neither end can grow a value the other does not have. Since E4b the two
// procedural ids are also the keys their textures are registered under.
const TEXTURES: { id: TextureMode; label: string }[] = [
  { id: "checker", label: "CHECKER" },
  { id: "solid", label: "SOLID" },
  { id: "uvGrid", label: "UV GRID" },
  { id: "authored", label: "AUTHORED" },
];

// The design's palette, in its order. Each name keys a --color-swatch-* token;
// the hex lives in colors.css and never here.
const BASE_COLORS = ["red", "yellow", "green", "blue", "white"];

export interface MaterialSectionOptions {
  root: HTMLElement;
  textureGridSelector: string;
  swatchRowSelector: string;
  store: UIStateStore;
  onTexture: (mode: TextureMode) => void;
  onBaseColor: (css: string) => void;
  onUvScale: (factor: number) => void;
  onOpacity: (sliderValue: number) => void;
}

class MaterialSection {
  private readonly store: UIStateStore;
  private readonly apply: MaterialSectionOptions;
  private readonly textures: ChipGrid;
  private readonly swatches: Map<string, HTMLButtonElement>;
  private readonly opacity: SliderRow;
  private readonly uvScale: SliderRow;

  constructor(options: MaterialSectionOptions) {
    this.store = options.store;
    this.apply = options;
    this.swatches = new Map();
    this.store.registerSlice({
      texture: DEFAULT_TEXTURE,
      baseColor: DEFAULT_BASE_COLOR,
      uvScale: DEFAULT_UV_SCALE,
    });

    this.textures = new ChipGrid({
      selector: options.textureGridSelector,
      modifier: "chip--tex",
      columns: 2,
      onPick: (id) => this.pickTexture(id as TextureMode),
    });
    this.textures.setChips(TEXTURES);
    this.textures.setActive(DEFAULT_TEXTURE);

    this.buildSwatches(options.swatchRowSelector);

    this.opacity = new SliderRow({
      label: "OPACITY",
      min: OPACITY_MIN,
      max: OPACITY_MAX,
      value: DEFAULT_OPACITY_UI,
      format: (value) => `${value}%`,
      onInput: options.onOpacity,
      inputId: "opacitySlider",
    });

    this.uvScale = new SliderRow({
      label: "UV SCALE",
      testId: "material-uv-scale",
      min: UV_MIN,
      max: UV_MAX,
      value: DEFAULT_UV_SCALE,
      format: (value) => `${value}×`,
      onInput: (value) => this.pickUvScale(value),
    });

    options.root.append(this.opacity.element, this.uvScale.element);
  }

  public get opacityRow(): SliderRow {
    return this.opacity;
  }

  // Writes the store's values into the controls AND pushes them to the renderer,
  // the same two halves CameraSection.syncFromStore carries and for the same
  // reason: this is the RESET path, and a reset that moved the chip without
  // moving the mesh would leave the two disagreeing until the next click.
  public syncFromStore() {
    const state = this.store.getState();
    // Both strings are checked against this section's own vocabularies rather
    // than trusted. The store types them, but a preset file (E8b) arrives from
    // outside the process where that type means nothing.
    //
    // baseColor is the one with a consequence: the store holds the palette NAME,
    // and cssFor would hand an unrecognised one straight to fillStyle, where an
    // unparseable value is silently ignored — leaving the mesh whatever colour it
    // already had while every swatch shows unselected.
    const storedTexture = state.texture ?? DEFAULT_TEXTURE;
    const texture = TEXTURES.some((entry) => entry.id === storedTexture) ? storedTexture : DEFAULT_TEXTURE;
    const storedColor = state.baseColor ?? DEFAULT_BASE_COLOR;
    const baseColor = this.swatches.has(storedColor) ? storedColor : DEFAULT_BASE_COLOR;

    // The row's answer, not the store's: setValue clamps to the range the row
    // owns. UV SCALE tiles a generated texture, so a stored 0 divides the
    // sampler by zero.
    const uvScale = this.uvScale.setValue(state.uvScale ?? DEFAULT_UV_SCALE);

    // Corrections go back into the store, for the reason TransformSection's own
    // sync gives: a value the section refused must not survive to be saved.
    if (texture !== state.texture || baseColor !== state.baseColor || uvScale !== state.uvScale) {
      this.store.setState({ texture, baseColor, uvScale });
    }

    this.textures.setActive(texture);
    this.setActiveSwatch(baseColor);

    this.apply.onTexture(texture);
    this.apply.onBaseColor(this.cssFor(baseColor));
    this.apply.onUvScale(uvScale);
  }

  // Buttons, not divs: a colour is a choice, and a choice has to be reachable
  // from the keyboard. chip.css already paints .swatch and its active ring.
  private buildSwatches(selector: string) {
    const row = document.querySelector<HTMLElement>(selector);

    if (!row) {
      throw new Error(`MATERIAL node is missing — no element matches ${selector}.`);
    }

    const fragment = document.createDocumentFragment();

    BASE_COLORS.forEach((name) => {
      const swatch = document.createElement("button");

      swatch.type = "button";
      // .tap-pad extends the hit area to the touch minimum without changing the
      // 38x32 the design paints on mobile.
      swatch.className = "swatch tap-pad";
      swatch.style.setProperty("--tap-pad", "6px");
      swatch.style.background = `var(--color-swatch-${name})`;
      swatch.setAttribute("aria-label", name);
      swatch.setAttribute("aria-pressed", "false");
      swatch.addEventListener("click", () => this.pickBaseColor(name));

      this.swatches.set(name, swatch);
      fragment.appendChild(swatch);
    });

    row.appendChild(fragment);
    this.setActiveSwatch(DEFAULT_BASE_COLOR);
  }

  private pickTexture(mode: TextureMode) {
    this.textures.setActive(mode);
    this.store.setState({ texture: mode });
    this.apply.onTexture(mode);
  }

  private pickBaseColor(name: string) {
    this.setActiveSwatch(name);
    this.store.setState({ baseColor: name });
    this.apply.onBaseColor(this.cssFor(name));
  }

  // No setActive half, unlike the two above: a SliderRow already shows the value
  // the drag produced, so this only has to store it and push it.
  private pickUvScale(factor: number) {
    this.store.setState({ uvScale: factor });
    this.apply.onUvScale(factor);
  }

  // The palette resolved rather than restated. The swatch already paints
  // var(--color-swatch-<name>), so reading its computed background is what keeps
  // colors.css the one place the five colours are written down — the engine gets
  // a colour, and this section is the only thing that knows a colour called
  // "green" exists.
  //
  // Read when a swatch is picked rather than when it is built, so it cannot
  // depend on whether the stylesheet had resolved by the time this constructor
  // ran.
  private cssFor(name: string): string {
    const swatch = this.swatches.get(name);

    return swatch ? getComputedStyle(swatch).backgroundColor : name;
  }

  private setActiveSwatch(name: string) {
    this.swatches.forEach((swatch, id) => {
      const active = id === name;
      swatch.classList.toggle("is-active", active);
      swatch.setAttribute("aria-pressed", String(active));
    });
  }
}

export default MaterialSection;
