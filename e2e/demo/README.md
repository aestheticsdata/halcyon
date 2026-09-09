# Demo films

One Playwright run that drives the console the way a hand would, records it as a single continuous
video, and writes the chapter list beside it. No editing: the take *is* the video, and the chapter
file is what goes in the description.

```bash
pnpm video:generate
```

Output lands in `e2e/demo/out/` (gitignored):

- `halcyon-demo.mp4` — the take, h264, at the exact viewport size, no scaling, with the chapters
  written into the file itself
- `chapters.txt` — `0:00 Title` per line, for a human to read
- `chapters.vtt` — WebVTT, for `<track kind="chapters">` on the portfolio's own `<video>`
- `chapters.ffmeta` — ffmpeg metadata; already applied to the mp4, kept so a re-encode can reapply it
- `chapters.json` — the same marks with millisecond precision
- `shots/01-console.png` and seven more — stills at 3840×2160, for a page that wants pictures too
- `upload/preset.json` — the preset chapter 10 saves and loads back, written by the console itself

This is a port of PFA's harness, which is a port of Trekker's, which is a port of Zeus's, which is
a port of Spira's. `pacing.ts`, `recorder.ts`, `chapters.ts` and `cursor.ts` are byte-identical to
PFA's; `fixture.ts` is PFA's — `Demo.glide` included — plus one method (`Demo.drag`, below);
`preflight.ts` and `playwright.demo.config.ts` are the same files with the PFA-specific parts
removed rather than changed: no API to probe, no credentials, no setup project. The full write-up
of how it works and why — the CDP screencast, the drawn pointer, the encode, and every trap found
building it — is `front/e2e/demo/HOW-TO-FILM-A-DEMO.md` in the Spira repo, and Zeus's
`e2e/demo/README.md` carries the traps that console found. Only `halcyon.demo.ts` knows what
Halcyon is.

## What it needs before it will record

`preflight.ts` refuses to launch a browser until the first is true, and says so. The rest it
cannot check.

1. **The dev server on `localhost:5173`** — `pnpm dev`, in a shell of your own: the take films the
   console and never starts it. Vite prints the port it took; if it was not 5173, `E2E_BASE_URL`
   names the one it did. A production build has nothing the dev one lacks on camera — Vite floats
   no badge and no devtools logo over the page, which is why `hideDevChrome()` in `fixture.ts` is
   a no-op here — so the takes are filmed on `pnpm dev`.
2. **ffmpeg on `PATH`** with libx264, the mp4 muxer and the `concat` demuxer — `brew install ffmpeg`,
   or `DEMO_FFMPEG` pointing at one.
3. **The network, once.** The two faces — Space Grotesk and JetBrains Mono — arrive from
   `fonts.googleapis.com`, and `settle()` in `fixture.ts` refuses to film until every stylesheet
   the document asked for has loaded and `document.fonts.ready` has resolved. Of the six harnesses
   this is the one where that check is live rather than kept: a take filmed offline would open on
   the browser's fallback serif, and nothing else would notice.
4. **Disk, several gigabytes of it.** The screencast spools every frame as a JPEG under `out/frames/`
   before the encode, and a console whose shape is always turning repaints on every frame of its
   render loop — Chromium delivers frames as fast as it can ack them, far more than a mostly-still
   UI produces. The spool is deleted once the mp4 is written.

## The take

Ten chapters, one per beat, at the default `DEMO_SPEED=1`. The picture never cuts: every
animation — the 1250ms shape switch and the scenery withdrawal that rides its clock, the 350ms
camera presets, the 240ms theatre fold — finishes before the next beat begins. The camera leaves
the console's opening diagonal in the first chapter and never returns to it except for the two
seconds RESET puts it back there. Twelve of the console's thirty-two shapes are on screen at some
point, and none of them for long: not the cube, the one shape with bitmap textures, and not the
pyramid.

| | | |
|---|---|---|
| 0:00 | The viewport | the console as a visitor first sees it — the ball turning on its floor — then the first gesture: the camera swung off the ISO diagonal to an oblique view, where every later beat and every still stays; the wheel in, three notches, to 65% |
| 0:08 | The ball | all four materials on the sphere the console boots on: CHECKER with UV SCALE coarsened, UV GRID, SOLID through the red and blue swatches, AUTHORED back — the ball's own red and white, tinted by the swatch still active, then white; PAUSE, the camera walked round the frozen ball, three STEPs, RESUME |
| 0:45 | The faders | the donut, and its pose one axis at a time: PITCH, YAW and ROLL dragged under the turning turntable; SPIN brought to a stop and restarted slower, which it stays; SCALE up and back |
| 1:13 | Molecules | caffeine — the sky and the floor withdraw with the switch and the story card becomes MOLECULE PROPERTIES; the console folded away to the full frame; PAUSE, the wheel in to 90% and two long drags round the frozen molecule, RESUME, a few seconds alone, the console back; aspirin at the same distance, the full frame again and the camera walked round it, the console back; the wheel back out to 65% |
| 2:00 | Polyhedra and knots | the picker six times through the mathematics: the rhombic triacontahedron and its kis, the mucube — the camera walked round it — the Menger sponge, the (2,5) knot, the (3,4) knot |
| 2:48 | Wireframe | the RENDER tab: WIRE on the knot, and an orbit while it is a lattice; POINTS, NORMALS, GOURAUD, FLAT, each confirmed on the HUD's mode chip; the key light swung round from the LIGHTING rows |
| 3:20 | Opacity | the truncated icosidodecahedron; CULL switched off from the viewport pill so the OPACITY row wakes up, the row dragged to 45%, CULL back on and the console putting the row back to 100% itself |
| 3:38 | The panels | SHAPE STORY read at a scrolling pace; the framerate chart, the depth histogram and the camera card visited; the WORLD tab: TOP, then the scene turned from the AZIM and ELEV rows, a wider lens and back, the fog rolled in and out |
| 4:16 | Shortcuts | the trefoil knot picked for the closing minute; the strip at the foot of the inspector, then G, S, S, F and F pressed for real, the viewport pills confirming each |
| 4:39 | Presets | SAVE PRESET, RESET — the pose, the spin, the zoom, the camera, the light and the grid all gone, the shape kept — and LOAD through the picker the button raises, the scene back exactly as saved |

## What this run actually measured

The take shipped to the landing page, filmed on 2026-09-10 at `DEMO_SPEED=1`, 1920×1080 at a device
scale factor of 2:

- 4:54 of film — 293.7s, ten chapters at the marks in the table above. The screencast delivered
  15 714 frames at 53.5 fps; the encode holds each on the 60 fps timeline and the mp4 is 27.8 MB at
  CRF 26, 0.76 Mbit/s — the band the other consoles' takes sit in. At the recorder's own CRF 16 the
  same take was 70.5 MB, 1.9 Mbit/s, three times Zeus's: see the trap below.
- 7.9 minutes end to end: the take, then the encode and the stills in the fixture's teardown,
  inside the config's fifteen-minute timeout with room to spare.
- Eight stills at 3840×2160, 0.5–1.6 MB each as lossless PNG. The three portraits were added after
  the take and shot on their own, through the same `prepare` the next full run will use.
- The only dark frames are the console's own: the 240ms theatre fold in and out, and the four
  seconds the full frame holds a molecule at 65% before the wheel closes in — a small ball-and-stick
  in the dark reads as black to a detector, not to a viewer.
- The speed knob is not linear. Every `mouse.move` and every wheel event is a CDP round trip that
  waits on the renderer's main thread, and a software rasteriser holds that thread for a frame at a
  time, so the gestures run at the same pace whatever `DEMO_SPEED` says: the same storyboard was
  146s at `DEMO_SPEED=4`, not 73.
- Filmed from the production build. No dev server was up, so `pnpm run build` was served into the
  same URL through request interception by a throwaway copy of the storyboard — no process on any
  port — and everything above was measured on `dist/`. A `pnpm dev` take shows the same picture with
  Vite's module graph behind it.
- Four rehearsals at `DEMO_SPEED=4` and two throwaway probe runs went before it, and every one of
  them found something: the picker that is not on the RENDER tab, the wheel deltas that arrive
  halved, the zoom that crops a molecule at 100. Rehearse first.

## The stills

`demo.shot("name", prepare)` marks eight screens. It takes no picture at the time — it writes down
the URL, and the pictures are taken at the very end, once the recorder has stopped and the mp4 is
closed, by sending the same page back to each URL. They come out at 3840×2160, lossless PNG,
animations frozen, caret hidden, the harness's overlays painted out.

The console has one URL and keeps no state in it, so every still says how to get back to what it
shows. `frame` in the storyboard is the shared half: the console settled, the camera swung off the
diagonal with a plain drag, the shape picked — or the boot shape kept — and its switch waited out
on `data-transition`, the wheel in once. The still's own step follows — a tab clicked, a chip
pressed, the expand toggle, a second turn of the wheel.

| | |
|---|---|
| `01-console.png` | the ball on its floor, the SHAPE tab — the landing page's card thumbnail |
| `02-molecule.png` | caffeine alone in the dark, close, the story card as MOLECULE PROPERTIES |
| `03-theatre-mode.png` | aspirin at the same distance, every pane folded away |
| `04-menger-sponge.png` | the sponge on its floor with its story card, a little further off than the film keeps it |
| `05-mucube.png` | Petrie's mucube, closer |
| `06-kis-rhombic-triacontahedron.png` | the kis rhombic triacontahedron, closer |
| `07-render-tab.png` | the (3,4) torus knot in WIRE, the RENDER tab open |
| `08-world-tab.png` | the truncated icosidodecahedron, the WORLD tab open |

Three of the eight are portraits — `PORTRAITS` in the storyboard — of mathematics the film shows
only in passing: the same `frame`, then the wheel to a distance chosen per shape, so the sponge
does not touch the edge of the picture and the two smaller solids fill it.

## Running it again

The take writes nothing outside `out/`. The console has no account and no server, a fresh page
load is the default scene, and RESET restores every slice the store registered. The one file the
take makes — the preset — is overwritten on the next take. Your own tab on `localhost:5173` is not
touched: the take is another browser, and nothing it does reaches yours.

## Halcyon-specific traps

**The console opens on a diagram.** ISO puts the checker floor's diagonal straight at the viewer
and the picture reads as symmetric; it is the console's default and the film cannot open anywhere
else. The first gesture is therefore the camera swung to about 25° / 67° — `OBLIQUE` in the
storyboard, 0.4° per pixel of drag — and every later orbit is sized to land somewhere oblique
again rather than back on 45°, 90° or 0°. The stills repeat the same drag before the shutter.

**The entrance is over before the film starts.** The sphere drops in over 1250ms from the first
frame; `Demo.open` starts the film only once the page has settled, which takes longer. The first
chapter is therefore the console at rest with the shape turning, not the drop — by design, the same
design that keeps every other take from opening on a half-painted page.

**Nothing on this page has a URL.** Tabs, shapes, theatre mode and every slider live in memory, so
a still cannot be addressed by where it was: each one carries a `prepare` that rebuilds its state
on the revisited page. `frame` is the shared half of that.

**The take waits on the stage, not on the clock.** `Main` writes the transition machine's state
onto the stage as `data-transition` — `entering`, `switching`, `idle`. After a pick the storyboard
asserts `switching` and then `idle`, in that order: asserting `idle` alone would pass on the idle
the stage was already showing if the click had never reached the switcher. A molecule's scenery
withdrawal rides the same clock, so the same wait covers it.

**Nothing is picked while the console is paused, and nothing while it is folded.** The render loop is what ticks the transition
machine — `ShapeSwitcher.syncQueue` runs from `renderFrame` — so a switch started on a paused
console stays at `switching` until RESUME, and a take that picked there would wait its fifteen
seconds out and fail. Both pauses in the storyboard end before the next pick; the paused gestures
are drags and the wheel, which the paused-repaint path answers frame by frame. Theatre mode folds
the picker away with the rest of the console, so the molecule chapter picks first and folds second,
and unfolds before it picks again.

**The picker is a SHAPE-tab control.** The primitive picker sits in the SHAPE tab's PRIMITIVE
card, so it is not on screen while RENDER or WORLD is open, and a pick from there waits for a
button that never becomes visible. Every pick in the storyboard happens on the SHAPE tab, and the
opacity chapter, which follows the RENDER tab, clicks the tab back before its pick.

**The wheel is turned in notches, sized in device pixels.** PointerOrbit maps twenty CSS pixels
of wheel to one point of the ZOOM row and rounds the row on each write, so an event under ten pixels
moves nothing and an eased flick lands wherever the rounding leaves it — 59 one run, 65 the next,
and only 75 where 90 was wanted. And Chromium's CDP wheel takes its deltas in device pixels: at the
take's device scale factor of 2, a 400-pixel event reaches the page as 200 and moves the row ten
points, not twenty, which is how two turns of 400 in a still came out at 70. `wheelTo` in the
storyboard therefore sends the wheel the way a hand does, five points of the row per notch, sized
from the page's `devicePixelRatio`, and reads the HUD's zoom chip back between notches, so every
zoom lands on the figure asked. The zoom survives every later pick today, which is the behaviour
HAL-190 (open) wants changed; the stills zoom after the pick so they stay right either way.

**ZOOM 100 is inside the molecule.** The row's maximum puts the camera among caffeine's atoms and
the frame is three spheres and a rod. The close-up stops at 90 — `ZOOM_CLOSE` — where the whole of
caffeine is still in frame; the still reaches the same 90 in two single turns of the wheel.

**Culling gates opacity.** The OPACITY row is disabled while backfaces are culled, and switching
culling back on writes 100% into it. The storyboard turns CULL off from the viewport pill before
the drag and asserts the snap-back after.

**A focused button swallows the shortcuts.** `KeyboardShortcuts` stands down while an `input`,
`select`, `textarea` or `button` has focus — SPACE on the focused PAUSE button would otherwise
toggle the loop twice. Every chip, tab and slider takes focus, so the shortcuts chapter opens with
a click on the picture, which takes none and hands the keyboard back to the page.

**W is not on the shortcuts beat, and the reason is a bug.** Toggling the wireframe from the key,
the WIRE pill or the PIPELINE row leaves the HUD's mode chip and the status bar one toggle behind
the picture — `FLAT` printed over a wireframe knot, then `WIRE` over a flat one (HAL-193, open).
The wireframe is shown from its chip in chapter 6, where the readouts are right, and the shortcut
chapter presses G, S and F instead. Put W back when HAL-193 closes.

**The theatre fold goes dark for a few frames.** Every intermediate size of the 240ms fold is a
resize, and each resize reallocates the backing store and repaints the sky and the floor per pixel
at the new size — more than a frame's worth of work, so the picture is blank for two or three
frames on the way in and again on the way out. It is the console's own behaviour, not the
recorder's, and the stills never show it: theirs is taken once the fold has settled.

**The picker's list scrolls inside itself.** KNOTS, FRACTALS and MOLECULES sit below fourteen
polyhedra, past the fold of the open list. `Cursor.click`'s hit test is what catches it: a row
clipped by its own scroller is inside the window but not painted at its point, so the click scrolls
it into view — eased, on camera — and aims again.

**Sliders are dragged by their thumb.** Chrome centres a range thumb on its track and lets it
travel the track's width less its own, so `thumbAt` in the storyboard reads the thumb width off the
`--size-range-thumb-w` token and presses exactly where the thumb is. A press anywhere else on the
track jumps the thumb there first, which reads as a glitch. A drag lands within a degree or two of
its target, so chapter 10 compares against the values the rows actually hold, not the ones asked.

**Two mounts for every pill and readout, three for the transport.** The shell renders one DOM tree
for both breakpoints: the quick toggles, RESET and most `data-field`s exist twice, hidden from
each other by CSS, and the play/pause button a third time in the HUD, which theatre mode leaves
standing and which is visible on desktop too. The storyboard addresses them through
`filter({ visible: true }).first()`: for the readouts that is the HUD's copy, the one theatre mode
keeps; for the transport the toolbar's until the console folds, and the HUD's after.

**The picture never stands still, so the recorder's CRF is too generous here.** x264 at CRF 16 —
the setting the six harnesses share — spends almost nothing on a console that is still between
gestures, which is what the other five film. Here a shape turns and a checker floor slides under it
on every frame, and CRF 16 came out at 1.9 Mbit/s, 70 MB for five minutes, at the same 1920×1080
and 60 fps as Zeus's 25 MB. `playwright.demo.config.ts` therefore defaults `DEMO_CRF` to 26 before
the recorder reads it — the worker inherits the runner's environment, checked by reading the
x264 settings back out of a take — which lands the film near 0.8 Mbit/s at a quality the
flat-shaded picture does not miss. An explicit `DEMO_CRF` still wins. The shipped mp4 was
re-encoded from the CRF 16 master with the same filter and preset, chapters carried over.

**The harness sits outside the house style on purpose.** Four of its files are byte-identical
ports carrying `export class`, parameter properties, JSDoc and a module-level `let`, so
`pnpm lint` keeps its `./src` scope; the authored files are run through the repo's formatter by
hand. `pnpm run typecheck` covers `e2e/` through the `@e2e/*` alias in `tsconfig.json` — the one
alias not mirrored in `vite.config.js`, because nothing under `e2e/` is bundled.

## Knobs

The same as PFA's, all environment variables, minus the API one: `DEMO_SPEED`, `DEMO_HEADED=1`,
`DEMO_WIDTH` / `DEMO_HEIGHT`, `DEMO_SCALE=1`, `DEMO_TITLES=on`, `DEMO_CURSOR=off`, `DEMO_FPS`,
`DEMO_CRF` (default 26 here, not the recorder's 16 — see the traps), `DEMO_FFMPEG`,
`DEMO_RECORDER=playwright`, `E2E_BASE_URL` (default `http://localhost:5173`).

## What this ticket changed outside the harness

- `package.json`: `video:generate`, `@playwright/test`, `@types/node`. `tsconfig.json`: `e2e` in
  `include`, the `@e2e/*` alias. `.gitignore`: `e2e/demo/out/`, `test-results/`.
- `data-testid` where a beat had no hook of the app's own — everything else drives `data-action`,
  `data-transport`, `data-field`, `data-tab-id`, `data-quick-toggle`, `data-chip-id`, the
  swatches' `aria-label` and the ids the markup already carries: the stage (`viewport`, in
  `src/index.html`), the primitive picker's trigger (`shape-picker`) and options (`shape-option`,
  with `data-shape`), the shading chips (`shading-chip`, keyed by the grid's `data-chip-id`), the
  slider rows (`transform-pitch` / `-yaw` / `-roll` / `-spin` / `-scale`, `material-uv-scale`,
  `lighting-azimuth`, `environment-fog`, `camera-elev` / `-azim` / `-roll` / `-fov` / `-zoom`) and
  the shortcut chips (`shortcut`, with `data-shortcut` naming the action). `ChipGrid` and
  `SliderRow` take a `testId` option for it; the two `buildAngle` helpers pass one per row.
- `data-transition` on the stage: `ShapeSwitcher.transitionState` exposes the machine's state and
  `Main.publishTransitionState()` writes it on the frames it changes.
