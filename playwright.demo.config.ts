import { defineConfig, devices } from "@playwright/test";

// The one encode knob this harness sets for itself. The recorder's CRF 16 is right for the consoles
// the other five film, whose picture is still between gestures and costs x264 almost nothing; here
// a shape turns and a checker floor slides under it on every frame, and the same CRF came out at
// 1.9 Mbit/s — 70 MB for five minutes, three times Zeus's take at the same 1920×1080 and 60 fps. 26
// lands the film in the same band as the others, at a quality the flat-shaded picture does not
// miss. Set here rather than in `video:generate` so an explicit DEMO_CRF still wins, and read by
// the recorder in the worker, which inherits this process's environment.
process.env.DEMO_CRF ??= "26";

/**
 * The portfolio demo run — a filming job, not a test one. There is no E2E suite beside it in this
 * repo: `vitest` covers the pure modules and never opens a browser, so this is the only Playwright
 * config here and the only thing under `e2e/`.
 *
 * One worker, no retries (half a retried take is worse than no take), a long timeout because the
 * run deliberately spends most of its time waiting, and video at the exact viewport size, so no
 * scaling ever touches the picture.
 *
 * One project where PFA has two: the console has no account, so there is nothing a setup project
 * would have to put back before a take. The browser is cold on every run and the take opens on `/`.
 */

/** 1080p by default: native, 16:9, and nothing upscales on the way to a landing page. */
const viewport = {
  width: Number(process.env.DEMO_WIDTH ?? 1920),
  height: Number(process.env.DEMO_HEIGHT ?? 1080),
};

/**
 * Renders at twice the resolution and lets the encoder downsample into the same
 * frame. Supersampling: visibly crisper text, for CPU. It is the default
 * because `pnpm video:generate` should produce the best picture it can without
 * being asked — `DEMO_SCALE=1` is the way out if a slow machine drops frames.
 */
const deviceScaleFactor = Number(process.env.DEMO_SCALE ?? 2);

const chrome = {
  ...devices["Desktop Chrome"],
  viewport,
  deviceScaleFactor,
  // The console is English-only and formats its own readouts, so nothing on screen reads the
  // locale. Pinned anyway, so a take is the same film on whichever machine shoots it.
  locale: "en-US",
  launchOptions: {
    headless: process.env.DEMO_HEADED !== "1",
    args: ["--force-color-profile=srgb", "--hide-scrollbars"],
  },
};

export default defineConfig({
  testDir: "./e2e/demo",
  // Checks the dev server is actually up before a browser is launched, so a
  // shut-down server is reported as a shut-down server rather than as a
  // navigation failure inside the fixture.
  globalSetup: "./e2e/demo/preflight.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Fifteen minutes where PFA has eight: the take itself runs about five, and the encode that follows
  // in the fixture's teardown runs nearly as long again on the frames a turning shape produces —
  // both count against this one timeout.
  timeout: 15 * 60_000,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "off",
    // Off unless asked for: the CDP recorder in `e2e/demo/recorder.ts` captures
    // the same screencast without the 25fps ceiling, and running both at once
    // would have two clients acking the same frames.
    video: process.env.DEMO_RECORDER === "playwright" ? { mode: "on" as const, size: viewport } : ("off" as const),
  },
  projects: [{ name: "demo", testMatch: /.*\.demo\.ts/, use: chrome }],
});
