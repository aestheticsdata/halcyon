// The continuous half of what ActionRegistry does for buttons, and it answers to
// the same contract: a miss throws rather than doing nothing, because a fader
// that silently changes nothing is indistinguishable from a fader nobody wired.
//
// Everything here runs in node. The registry receives a range and a closure and
// never a DOM node, which is the constraint that lets the piece of this feature
// with real arithmetic in it be asserted at all.

import ControlRegistry from "@ui/ControlRegistry";
import { describe, expect, it, vi } from "vitest";

const angleRow = (apply: (value: number) => void) => ({
  label: "PITCH",
  min: -180,
  max: 180,
  defaultValue: 0,
  apply,
});

describe("ControlRegistry", () => {
  it("hands the closure the value the row's own range maps that position to", () => {
    const registry = new ControlRegistry();
    const apply = vi.fn();

    registry.register("pitch", angleRow(apply));
    registry.set("pitch", 1);

    expect(apply).toHaveBeenCalledWith(180);
  });

  // The whole reason the registry takes a normalised position rather than a
  // value: the caller never learns this row is ±180 and that one is 10..300.
  it("resolves the midpoint to the row's default without the caller knowing the range", () => {
    const registry = new ControlRegistry();
    const apply = vi.fn();

    registry.register("scale", { label: "SCALE", min: 10, max: 300, defaultValue: 100, apply });
    registry.set("scale", 0.5);

    expect(apply).toHaveBeenCalledWith(100);
  });

  it("throws rather than doing nothing when a position arrives for an unregistered control", () => {
    const registry = new ControlRegistry();

    expect(() => registry.set("fog", 0.5)).toThrow(/fog/);
  });

  it("reports what has been registered, so a binding table can be checked before it is used", () => {
    const registry = new ControlRegistry();

    registry.register("pitch", angleRow(vi.fn()));

    expect(registry.has("pitch")).toBe(true);
    expect(registry.has("yaw")).toBe(false);
  });

  // The panel prints a control's label and bounds; handing it the closure as well
  // would hand a documentation surface a live write into the console.
  it("describes a control without handing out the closure that moves it", () => {
    const registry = new ControlRegistry();

    registry.register("pitch", angleRow(vi.fn()));

    expect(registry.describe("pitch")).toEqual({ label: "PITCH", min: -180, max: 180, defaultValue: 0 });
    expect(registry.describe("pitch")).not.toHaveProperty("apply");
  });

  it("throws when asked to describe a control nothing registered", () => {
    const registry = new ControlRegistry();

    expect(() => registry.describe("fog")).toThrow(/fog/);
  });

  // Vite's HMR re-executes a module without tearing the old one down, so a
  // section that registers on construction registers again on every edit.
  it("lets a re-registration replace the closure rather than throwing on it", () => {
    const registry = new ControlRegistry();
    const stale = vi.fn();
    const fresh = vi.fn();

    registry.register("pitch", angleRow(stale));
    registry.register("pitch", angleRow(fresh));
    registry.set("pitch", 1);

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledWith(180);
  });
});
