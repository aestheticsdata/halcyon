// The router against fake registries and a scheduler that runs on demand, which
// is the whole reason the scheduler is injected: every ordering rule this class
// has is assertable without a frame ever happening.
//
// Two of them are worth the trouble. Continuous messages coalesce, so a sweep
// costs one apply rather than one per byte. And a button flushes that queue
// before it acts, so a fader message that shared a frame with MARKER SET cannot
// land after the reset — which is a lost update that would look exactly like the
// reset button not working.

import MIDIBindingRouter from "@input/midi/MIDIBindingRouter";
import ActionRegistry from "@ui/ActionRegistry";
import ControlRegistry from "@ui/ControlRegistry";
import { beforeEach, describe, expect, it } from "vitest";

import type { MIDIBindingTable } from "@input/midi/midiBindings";

const CC = 0xb0;

// A scheduler that queues rather than runs, so a test decides when the frame is.
const makeScheduler = () => {
  const queued: (() => void)[] = [];

  return {
    schedule: (flush: () => void) => queued.push(flush),
    cancel: () => {
      queued.length = 0;
    },
    frame: () => {
      const due = [...queued];
      queued.length = 0;
      for (const flush of due) {
        flush();
      }
    },
    get depth() {
      return queued.length;
    },
  };
};

describe("MIDIBindingRouter", () => {
  let controls: ControlRegistry;
  let actions: ActionRegistry;
  let applied: number[];
  let ran: [string, number | undefined][];

  beforeEach(() => {
    controls = new ControlRegistry();
    actions = new ActionRegistry();
    applied = [];
    ran = [];

    controls.register("pitch", { label: "PITCH", min: -180, max: 180, defaultValue: 0, apply: (v) => applied.push(v) });
    controls.register("yaw", { label: "YAW", min: -180, max: 180, defaultValue: 0, apply: (v) => applied.push(v) });

    for (const id of ["resumeLoop", "resetControls", "stepPrimitive", "applyViewPreset"] as const) {
      actions.register(id, (argument) => ran.push([id, argument]));
    }
  });

  const build = (bindings: MIDIBindingTable, scheduler = makeScheduler()) => {
    const router = new MIDIBindingRouter({ controls, actions, bindings, ...scheduler });
    router.bind();

    return { router, scheduler };
  };

  it("applies a fader position through the control it is bound to", () => {
    const { router, scheduler } = build({ fader1: { kind: "control", id: "pitch" } });

    router.receive([CC, 0, 127]);
    scheduler.frame();

    expect(applied).toEqual([180]);
  });

  it("ignores anything that is not a Control Change", () => {
    const { router, scheduler } = build({ fader1: { kind: "control", id: "pitch" } });

    router.receive([0x90, 0, 127]);
    scheduler.frame();

    expect(applied).toEqual([]);
  });

  it("ignores a Control Change nothing is bound to", () => {
    const { router, scheduler } = build({ fader1: { kind: "control", id: "pitch" } });

    router.receive([CC, 23, 127]);
    scheduler.frame();

    expect(applied).toEqual([]);
  });

  it("coalesces a sweep to one apply per frame rather than one per byte", () => {
    const { router, scheduler } = build({ fader1: { kind: "control", id: "pitch" } });

    for (let value = 0; value <= 127; value += 1) {
      router.receive([CC, 0, value]);
    }
    scheduler.frame();

    expect(applied).toEqual([180]);
  });

  it("keeps one pending value per control when two faders move together", () => {
    const { router, scheduler } = build({
      fader1: { kind: "control", id: "pitch" },
      fader2: { kind: "control", id: "yaw" },
    });

    router.receive([CC, 0, 0]);
    router.receive([CC, 1, 127]);
    scheduler.frame();

    expect(applied).toEqual([-180, 180]);
  });

  it("drops a repeated byte, because the fader has not moved", () => {
    const { router, scheduler } = build({ fader1: { kind: "control", id: "pitch" } });

    router.receive([CC, 0, 100]);
    scheduler.frame();
    router.receive([CC, 0, 100]);

    expect(scheduler.depth).toBe(0);
  });

  it("runs a plain action on the press and not again on the release", () => {
    const { router } = build({ play: { kind: "action", id: "resumeLoop" } });

    router.receive([CC, 41, 127]);
    router.receive([CC, 41, 0]);

    expect(ran).toEqual([["resumeLoop", undefined]]);
  });

  it("passes the signed step through, so one binding can walk either way", () => {
    const { router } = build({
      trackPrev: { kind: "step", id: "stepPrimitive", by: -1 },
      trackNext: { kind: "step", id: "stepPrimitive", by: 1 },
    });

    router.receive([CC, 58, 127]);
    router.receive([CC, 59, 127]);

    expect(ran).toEqual([
      ["stepPrimitive", -1],
      ["stepPrimitive", 1],
    ]);
  });

  it("resolves a view preset key to the index the action takes", () => {
    const { router } = build({ solo3: { kind: "viewPreset", key: "TOP" } });

    router.receive([CC, 34, 127]);

    expect(ran).toEqual([["applyViewPreset", 2]]);
  });

  // The lost update. Without the flush-before-act rule the reset runs first and
  // the stale fader value lands a frame later, on top of it.
  it("flushes a pending fader before a button acts, so a reset is not undone by it", () => {
    const { router, scheduler } = build({
      fader1: { kind: "control", id: "pitch" },
      markerSet: { kind: "action", id: "resetControls" },
    });

    router.receive([CC, 0, 127]);
    router.receive([CC, 60, 127]);
    scheduler.frame();

    expect(applied).toEqual([180]);
    expect(ran).toEqual([["resetControls", undefined]]);
  });

  it("drops a pending value when the console says it has moved on its own", () => {
    const { router, scheduler } = build({ fader1: { kind: "control", id: "pitch" } });

    router.receive([CC, 0, 127]);
    router.clearPending();
    scheduler.frame();

    expect(applied).toEqual([]);
  });

  it("throws at bind time when a binding names a control nothing registered", () => {
    const router = new MIDIBindingRouter({
      controls,
      actions,
      bindings: { fader3: { kind: "control", id: "fog" } },
      ...makeScheduler(),
    });

    expect(() => router.bind()).toThrow(/fog/);
  });

  it("throws at bind time when a binding names an action nothing registered", () => {
    const router = new MIDIBindingRouter({
      controls,
      actions,
      bindings: { stop: { kind: "action", id: "pauseLoop" } },
      ...makeScheduler(),
    });

    expect(() => router.bind()).toThrow(/pauseLoop/);
  });

  // The diagnostic. A CC nothing claims still has to be reported, because that
  // is exactly what a unit remapped away from the factory scene looks like.
  it("reports traffic for a bound control and for one nothing claims", () => {
    const seen: unknown[] = [];
    const router = new MIDIBindingRouter({
      controls,
      actions,
      bindings: { fader1: { kind: "control", id: "pitch" } },
      ...makeScheduler(),
      onTraffic: (traffic) => seen.push(traffic),
    });
    router.bind();

    router.receive([CC, 0, 64]);
    router.receive([CC, 18, 90]);

    expect(seen).toEqual([
      { kind: "CC", cc: 0, value: 64, control: "FADER 1", bound: true },
      { kind: "CC", cc: 18, value: 90, control: "KNOB 3", bound: false },
    ]);
  });

  // The reading that tells a unit in DAW/Mackie mode from one that is not
  // plugged in at all. Both are silent to the bindings; only one is silent here.
  it("reports a message that is not a Control Change, and still ignores it", () => {
    const seen: unknown[] = [];
    const router = new MIDIBindingRouter({
      controls,
      actions,
      bindings: { fader1: { kind: "control", id: "pitch" } },
      ...makeScheduler(),
      onTraffic: (traffic) => seen.push(traffic),
    });
    router.bind();

    router.receive([0x90, 41, 127]);
    router.receive([0xe0, 0, 64]);

    expect(seen).toEqual([
      { kind: "NOTE ON", cc: 41, value: 127, control: null, bound: false },
      { kind: "PITCH BEND", cc: 0, value: 64, control: null, bound: false },
    ]);
    expect(applied).toEqual([]);
  });

  it("re-binds cleanly, so a device unplugged and plugged back in does not double up", () => {
    const { router } = build({ play: { kind: "action", id: "resumeLoop" } });

    router.bind();
    router.receive([CC, 41, 127]);

    expect(ran).toHaveLength(1);
  });
});
