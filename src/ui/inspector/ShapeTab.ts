// The SHAPE tab, which is three sections and no logic of its own.
//
// It exists so Main wires one collaborator rather than three, and so the tab
// has a single place to be told which primitive is active and a single place to
// be reset. Each section owns its own controls; this class owns only the fact
// that they are siblings.

import MaterialSection from "@ui/inspector/MaterialSection";
import PrimitiveSection from "@ui/inspector/PrimitiveSection";
import TransformSection from "@ui/inspector/TransformSection";

import type { Data3D } from "@data/types";
import type { TextureMode } from "@rendering/material";
import type ControlRegistry from "@ui/ControlRegistry";
import type SliderRow from "@ui/inspector/controls/SliderRow";
import type ShapeThumbnails from "@ui/inspector/ShapeThumbnails";
import type UIStateStore from "@ui/UIStateStore";

export interface ShapeTabOptions {
  objects3D: Data3D;
  store: UIStateStore;
  controls: ControlRegistry;
  onPick: (primitive: string) => void;
  onPitch: (degrees: number) => void;
  onYaw: (degrees: number) => void;
  onRoll: (degrees: number) => void;
  onSpin: (degreesPerSecond: number) => void;
  onScale: (factor: number) => void;
  onTexture: (mode: TextureMode) => void;
  onBaseColor: (css: string) => void;
  onUvScale: (factor: number) => void;
  onOpacity: (sliderValue: number) => void;
}

class ShapeTab {
  private readonly primitives: PrimitiveSection;
  private readonly transform: TransformSection;
  private readonly material: MaterialSection;

  constructor(options: ShapeTabOptions) {
    this.primitives = new PrimitiveSection({
      pickerSelector: "#primitivePicker",
      countSelector: "#primitiveCount",
      objects3D: options.objects3D,
      onPick: options.onPick,
    });

    this.transform = new TransformSection({
      root: this.require("#transformRows"),
      store: options.store,
      controls: options.controls,
      onPitch: options.onPitch,
      onYaw: options.onYaw,
      onRoll: options.onRoll,
      onSpin: options.onSpin,
      onScale: options.onScale,
    });

    this.material = new MaterialSection({
      controls: options.controls,
      root: this.require("#materialRows"),
      textureGridSelector: "#textureGrid",
      swatchRowSelector: "#baseSwatches",
      store: options.store,
      onTexture: options.onTexture,
      onBaseColor: options.onBaseColor,
      onUvScale: options.onUvScale,
      onOpacity: options.onOpacity,
    });
  }

  // Handed to RenderPipelinePanel so it can dim the row's label and value
  // alongside the track it already disables.
  public get opacityRow(): SliderRow {
    return this.material.opacityRow;
  }

  public setOpacityUi(value: number) {
    this.material.opacityRow.setValue(value);
  }

  public setOpacityDisabled(disabled: boolean) {
    this.material.opacityRow.setDisabled(disabled);
  }

  // Runs from init(), once the texture registry has resolved.
  public paintPrimitiveOptions(thumbnails: ShapeThumbnails) {
    this.primitives.paintOptions(thumbnails);
  }

  public setActivePrimitive(primitive: string | null) {
    this.primitives.setActive(primitive);
  }

  // Called after the store's defaults are restored, so every control reads back
  // from one place rather than each remembering its own default.
  public syncFromStore() {
    this.transform.syncFromStore();
    this.material.syncFromStore();
  }

  private require(selector: string): HTMLElement {
    const node = document.querySelector<HTMLElement>(selector);

    if (!node) {
      throw new Error(`SHAPE tab node is missing — no element matches ${selector}.`);
    }

    return node;
  }
}

export default ShapeTab;
