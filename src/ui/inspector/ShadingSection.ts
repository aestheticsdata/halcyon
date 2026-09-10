// SHADING MODE: the six-chip grid that picks how faces are shaded.
//
// All six are backed by a real branch since E3c/COS-243 — POINTS and WIRE draw
// no surface at all, FLAT and GOURAUD light one, DEPTH and NORMALS encode a
// channel instead of a colour — so the placeholder affordance this section
// carried on four of them is gone rather than reworded. The chips read their
// labels off SHADING_MODES rather than restating the six words, which is what
// keeps them agreeing with the status bar, the viewport HUD and SHAPE INFO.
//
// WIRE and the PIPELINE WIREFRAME toggle are two views of one boolean
// (RenderPipelinePanel owns it). syncFromWireframe() is the echo back from
// that boolean. Picking a non-WIRE chip also clears wireframe, and that
// change echoes back synchronously — so the guard compares the incoming
// boolean against what the current mode implies (impliesWireframe) and
// returns early when they already agree, which is what stops a GOURAUD pick
// from being overwritten back to FLAT by its own echo.

import { impliesWireframe, SHADING_MODES } from "@rendering/shadingMode";
import ChipGrid from "@ui/inspector/controls/ChipGrid";

import type { ShadingMode } from "@rendering/shadingMode";
import type { ChipDescriptor } from "@ui/inspector/controls/ChipGrid";
import type UIStateStore from "@ui/UIStateStore";

// Exported because Main reads the slice off the store to build the frame's
// render options and needs the same fallback this section registers, the way
// PipelineSection already exports DEFAULT_ZBUFFER for the Z-BUFFER toggle.
export const DEFAULT_SHADING_MODE: ShadingMode = "FLAT";

const CHIPS: ChipDescriptor[] = SHADING_MODES.map((mode) => ({ id: mode, label: mode }));

export interface ShadingSectionOptions {
  chipGridSelector: string;
  store: UIStateStore;
  onSelect: (mode: ShadingMode) => void;
}

class ShadingSection {
  private readonly store: UIStateStore;
  private readonly chips: ChipGrid;
  private readonly onSelect: (mode: ShadingMode) => void;
  private currentMode: ShadingMode;

  constructor(options: ShadingSectionOptions) {
    this.store = options.store;
    this.onSelect = options.onSelect;
    this.currentMode = DEFAULT_SHADING_MODE;
    this.store.registerSlice({ shadingMode: DEFAULT_SHADING_MODE });

    this.chips = new ChipGrid({
      selector: options.chipGridSelector,
      modifier: "chip--mode",
      columns: 3,
      testId: "shading-chip",
      onPick: this.pick,
    });
    this.chips.setChips(CHIPS);
    this.chips.setActive(DEFAULT_SHADING_MODE);
  }

  public syncFromWireframe(wireframeEnabled: boolean) {
    const impliesWire = impliesWireframe(this.currentMode);
    if (wireframeEnabled === impliesWire) {
      return;
    }
    this.setMode(wireframeEnabled ? "WIRE" : DEFAULT_SHADING_MODE);
  }

  // Checked against the engine's own vocabulary rather than trusted. The store
  // types this as ShadingMode, but a preset file (E8b) comes from outside the
  // process where that type holds — and setMode writes whatever it is given
  // straight back into the store, so an unrecognised mode would light no chip,
  // reach the render options, and then be saved by the next preset as though the
  // console had chosen it.
  public syncFromStore() {
    const stored = this.store.getState().shadingMode ?? DEFAULT_SHADING_MODE;

    this.setMode(SHADING_MODES.includes(stored) ? stored : DEFAULT_SHADING_MODE);
  }

  // The same pair a chip click runs, for an input that has no chip to click —
  // the MIDI surface steps this vocabulary from a button (HAL-194). Public
  // rather than reached through the chip grid, because ChipGrid.setActive
  // relights without firing onPick and would leave the renderer behind.
  public selectMode(mode: ShadingMode) {
    this.setMode(mode);
    this.onSelect(mode);
  }

  private pick = (id: string) => {
    this.selectMode(id as ShadingMode);
  };

  private setMode(mode: ShadingMode) {
    this.currentMode = mode;
    this.chips.setActive(mode);
    this.store.setState({ shadingMode: mode });
  }
}

export default ShadingSection;
