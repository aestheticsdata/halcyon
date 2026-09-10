// The two tables, checked against each other and against themselves.
//
// Most of what could go wrong here is already a compile error — a control name
// the datasheet does not have, a value target on a button, a step of 7, a
// misspelled preset key. What the compiler cannot see is the arithmetic: two
// rows of the datasheet claiming one CC, or two bindings pointing different
// physical controls at the same parameter, which is two faders fighting over one
// row with the last message winning.
//
// This is also the gate that stands in for a type-check on the way to
// production. deploy-halcyon.sh runs `pnpm build` and esbuild does not
// type-check, so `pnpm test` is the last thing between a bad table and a
// deployed console.

import viewPresets from "@camera/viewPresets";
import midiBindings from "@input/midi/midiBindings";
import nanoKONTROL2, { buttonControls, continuousControls } from "@input/midi/nanoKONTROL2";
import { describe, expect, it } from "vitest";

import type { MIDITarget } from "@input/midi/midiBindings";

const entries = Object.entries(midiBindings) as [string, MIDITarget][];

describe("the nanoKONTROL2 datasheet", () => {
  it("gives every control a distinct CC, so no two can collide in the router", () => {
    const numbers = nanoKONTROL2.map((spec) => spec.cc);

    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("gives every control a distinct id, so a binding cannot be ambiguous", () => {
    const ids = nanoKONTROL2.map((spec) => spec.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every CC inside the seven bits a Control Change carries", () => {
    for (const spec of nanoKONTROL2) {
      expect(spec.cc).toBeGreaterThanOrEqual(0);
      expect(spec.cc).toBeLessThanOrEqual(127);
    }
  });

  it("splits the surface exhaustively into the two kinds", () => {
    expect(continuousControls.length + buttonControls.length).toBe(nanoKONTROL2.length);
  });
});

describe("the binding table", () => {
  it("names only controls the datasheet has", () => {
    const known = new Set(nanoKONTROL2.map((spec) => spec.id));

    for (const [name] of entries) {
      expect(known.has(name)).toBe(true);
    }
  });

  // A fader and a knob pointed at one row would fight, and which of them won
  // would depend on message order rather than on anything a reader could see.
  it("points at most one physical control at any one parameter", () => {
    const targeted = entries
      .filter(([, target]) => target.kind === "control")
      .map(([, target]) => (target.kind === "control" ? target.id : ""));

    expect(new Set(targeted).size).toBe(targeted.length);
  });

  it("only puts value targets on faders and knobs", () => {
    const continuous = new Set(continuousControls.map((spec) => spec.id));

    for (const [name, target] of entries) {
      expect(target.kind === "control").toBe(continuous.has(name));
    }
  });

  it("names only view presets the preset table has", () => {
    const known = Object.keys(viewPresets);

    for (const [, target] of entries) {
      if (target.kind === "viewPreset") {
        expect(known).toContain(target.key);
      }
    }
  });

  it("steps by exactly one in either direction, never by a jump", () => {
    for (const [, target] of entries) {
      if (target.kind === "step") {
        expect(Math.abs(target.by)).toBe(1);
      }
    }
  });

  // Both directions of a stepper have to exist or the walk is one-way, which is
  // a binding that looks finished and is half there.
  it("binds both directions of every stepper it uses", () => {
    const steps = entries.flatMap(([, target]) => (target.kind === "step" ? [target] : []));

    for (const step of steps) {
      expect(
        steps
          .filter((other) => other.id === step.id)
          .map((other) => other.by)
          .sort(),
      ).toEqual([-1, 1]);
    }
  });
});
