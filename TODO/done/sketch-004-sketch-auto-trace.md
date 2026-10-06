---
title: Sketch auto-trace — tap inside a photographed part to get its outline (and holes) to scale
category: sketch
kind: feature
priority: medium
model: opus
milestone: M8
depends: [sketch-002, sketch-003]
status: done
---

> **What actually shipped (2026-10-04, `/run-todos` isolated agent).** Auto-trace as specified,
> hand-written with no new dependency (no `docs/decisions/image-trace.md` needed). Pure pipeline
> `src/sketch/trace.js`: luma grayscale (transparency reads as table), Otsu (manual override
> 0..255), a 4-connected flood fill from the tap that stops the moment it reaches the border
> (refused: *That region runs off the edge of the photo — tap inside the part*), one 3 × 3
> close + open on the region's bounding box (pinholes, cracks and specks under 3 px), marching
> squares with saddles resolved for a 4-connected region / 8-connected background (so a
> boundary never crosses itself), outer ring → **Solid**, rings round enclosed gaps wider than
> twice the tolerance → **Hole**, then `simplify.js`'s RDP at Tolerance ÷ `mmPerPx` plus a
> collinear pass (RDP keeps its anchors, often mid-edge). A ring is capped at 2000 points and a
> simplification that would cross itself is retried finer. The worker (`image.worker.js`
> `kind: 'trace'`, `imageJob.traceAsset`) decodes a photo once and keeps its grayscale and Otsu
> for the next tap; `imageClient.traceImage` supersedes, never queues. Px → mm is
> `referenceImage.tracedProfiles` through the slice's placement (rotation and offset included),
> wound counter-clockwise; `addTracedOutlines` swaps a re-trace's outlines in place.
> **Where reality differed from the spec:**
>
> - **No scale yet** is not refused and not guessed silently: the banner says *Not to scale
>   yet — outlines will use 1 px = 0.1 mm until you Set scale* before the first tap, and the
>   result line ends *Not to scale yet — Set scale, then answer Yes to resize them* (Set scale's
>   existing rescale confirm then fixes them). Tracing first and measuring second is a flow
>   sketch-003 already supports.
> - **The spinner is in the banner**, not on the Auto-trace button: while an image tool is armed
>   the sheet folds to its header at every size (and steps aside on a narrow viewport — the
>   sketch-003 pattern, needed again for the ≥ 69 % reachable canvas), so the button is not on
>   screen while a trace runs. The button carries `aria-busy`.
> - **Tolerance and Threshold live in the banner** behind **Adjust** — open by default at
>   ≥ 900 px, folded on a phone (open, they would cost the phone its reachable canvas). Moving
>   either **re-traces the last tap in place**, replacing its outlines, rather than only
>   affecting the next tap (otherwise the sliders had no visible feedback). Threshold is an
>   **Auto** toggle plus a 1..254 slider; on Auto the readout shows the Otsu value used.
> - **Cancel** reads **Finish** once a tap traced something; Finish (or Esc) arms **Select**
>   with the traced Solid picked, so its points show for clean-up straight away.
> - A press that wobbles past the tap slop while armed moves nothing and still traces at the
>   press point; two fingers still pan and zoom.
> - **Acceptance:** no new scenario — scenario **20** (added by sketch-003 and reserved for this
>   task's extension) gained Auto-trace, clean-up, the saved photo's EXIF/GPS check and the gist
>   round-trip. The gist round-trip and a real phone photo were not driven here (`TODO/VERIFY.md`).
>
> **Close-out review (2026-10-06, `/fix-todo` isolated agent).** One gap fixed against the spec's
> *supersede, not queue*: the worker yielded with `await Promise.resolve()` before checking whether
> a newer tap had arrived, but queued `message` events are tasks, so a microtask yield never let
> them in — every queued tap still ran in full and only the client discarded the stale answers.
> It now yields a whole task (`setTimeout(…, 0)`). Everything else matched the spec as written
> above; acceptance was re-driven by hand (scenario 20 on three engines and phone touch, with the
> saved photo's EXIF/GPS checked; 1, 8, 9 and the closed-finding repros), all PASS.

> **Split out of `TODO/sketch-001` (2026-10-02).** sketch-001's own Effort section said
> "If the first run finishes steps 1-3, split steps 4-6 into their own TODO rather than
> stretching this one", and the unattended `/run-todos` run did exactly that. Everything
> below the line marked *verbatim* is copied word for word from sketch-001's spec (as
> committed in `be36d6d`); the retired file is `TODO/done/sketch-001-sketch-primitive-extruded-solid.md`.
> Read its "What actually shipped" note first: a few things the spec assumed changed while
> steps 1-3 were built, and the ones that bear on this task are listed under "What changed
> since this was written" below.

## Goal

Step 6 of sketch-001's suggested order: **Auto-trace**. The user's own use case (verbatim
from sketch-001, 2026-09-27):

> A part broke and I want to 3D-print a replacement. It's an odd shape but a constant
> thickness. I lay it on a table next to a ruler and photograph it with my phone. I add
> a Sketch, load the photo as its background, draw a line along the ruler in the photo
> and type "5 in" so the image is at real scale, then trace around the part. **Auto-trace**
> gives me a first outline. I clean it up by moving, adding and removing vertices, then
> extrude it to the part's thickness, and it prints the right size.

## What changed since this was written (read first)

- **The profile model, editor and registry entry exist.** `src/sketch/profile.js` (kinds
  `circle` / `rect` / `polygon` / `polyline`, `regionOf`, `profileAtPoint`, pure draft
  edits), `src/stores/sketchEditor.js` (the draft, active slice, selected outline, tool,
  open panel), `src/composables/useSketchEditorCommands.js` (Done = one append or one
  in-place revise), `src/components/viewport/SketchToolbar.vue`,
  `src/components/viewport/SketchStrokes.vue` (SVG, pointer-transparent),
  `src/components/sketch/{SlicePanel,ExtrudePanel,SketchPanelSheet,SketchProfileFields}.vue`
  and `primitive.sketch` in `src/core/kernel/registry.js`. Build on them; don't re-derive.
- **There is no `paramEdit.js` read-only guard any more.** `TODO/data-007` moved every
  primitive's param edit onto the in-place *replace* path, so an Edit sketch → Done on a
  filleted body re-runs the fillet (or refuses, naming it) rather than being frozen. Any
  sentence below that says "the guard's reason" means `useSketchEditorCommands.canEdit`'s
  reason now.
- **Loading an unknown op refuses the whole file**, it does not skip-and-warn, in the app's
  real load path (`src/core/project.js` → `document.loadEntries`). Only `src/core/replay.js`
  skips. sketch-001 added a narrow, explicit exception (`RETIRED_OPS` in `project.js`, with a
  per-record `LoadWarning` the status chip shows). A record kind that must *degrade* on load
  rather than refuse (a hostile `asset.image`) needs the same deliberate treatment — "replay
  warning" in the text below does not happen by itself.
- **ACCEPTANCE scenario 14 is already taken** ("Delete a body, bring it back, reload"). The
  photo-trace scenario the text below calls "scenario 14" needs the next free number.
- **The editor's camera, frame and plane projection** are `camera.snapToPlane(frame, zMm)`,
  `src/core/kernel/sketchFrame.js`'s `sketchFrameOf`/`frameAtOrigin`, and
  `src/render/pick.js`'s `projectToSketchPlane` — image placement in "the slice's local 2D
  frame" goes through the same frame.

## Interaction model (verbatim from sketch-001 — the Auto-trace bullets)

The full combined section (image, scale, vertex editing and auto-trace) is kept verbatim in
`TODO/sketch-003`; the Auto-trace bullets are:

- **Precondition**:
  - *Set scale*, *Auto-trace*, *image opacity/position*, *Remove image*: the active
    slice has an image.
- **Trigger**:
  - **Auto-trace** arms a tap tool: "Tap inside the part". A **Tolerance** slider
    (mm, default 0.5) sets how closely the outline follows the pixels. The **Threshold**
    is automatic (Otsu), with a manual override slider.
- **Feedback**:
  - Auto-trace adds the outer boundary it finds as a **Solid** polyline. Any enclosed
    inner boundaries (bolt holes in a bracket) become **Hole** polylines. It prints how
    many outlines and vertices it created. A tap on the background, or on a region that
    touches the image edge, adds nothing and prints why: "That region runs off the
    edge of the photo — tap inside the part".
  - Tracing runs in a worker. A spinner shows on the Auto-trace button while it runs, and
    tapping again supersedes the previous run.
- **Selection count**: Set scale, Auto-trace and the image controls act on the active
  slice. Vertex tools need exactly one selected polyline.
- **Small-screen behavior**: while Set scale or Auto-trace is armed on a phone, the
  Slices sheet **collapses to its header**. That leaves the photo tappable, and the
  reachable-canvas ≥ 69% rule applies. A top banner shows the instruction and a
  **Cancel** button. […]

## Documentation (verbatim from sketch-001)

- **Example 3 (replacement part from a photo)**: "Put the broken part flat on a table
  with a ruler beside it. Photograph it from straight above, filling the frame. Drag
  **Sketch** into the viewport. In the Slices panel tap **Add image…** and choose the
  photo. It appears under the grid with a *Not to scale* badge. Tap **Set scale**, press
  on the ruler's 0 mark and drag to its 5-inch mark, type **5**, pick **in**, then tap
  **Apply**. The badge now reads the image's real scale. Tap **Auto-trace**, then tap
  anywhere inside the part. An outline appears around it, with any bolt holes as dashed
  Hole outlines. Drag stray vertices back onto the edge. Tap one that shouldn't be there
  and tap **Delete vertex**. Drag a segment's midpoint dot to add a vertex where a corner
  was cut off. Open **Extrude ▾**, choose **Linear**, enter the part's thickness in
  Height, then tap **Done**."

## Affected files (verbatim from sketch-001)

  - `src/sketch/trace.js`: pure functions over
    `{ width, height, data: Uint8ClampedArray }`. They cover grayscale conversion, the
    Otsu threshold, flood fill from a seed pixel, boundary extraction (marching
    squares), and outer/inner contour classification.
  - `src/sketch/simplify.js`: Ramer–Douglas–Peucker with a tolerance in mm. The profile
    panel's Simplify uses it too.
  - `src/sketch/image.worker.js` + `src/sketch/imageClient.js`: import re-encoding and
    tracing, off the main thread, with supersede-not-queue.
  - `e2e/fixtures/trace-bracket.jpg`, a **generated** fixture: a dark L-bracket with two
    round holes and a ruler with 10 mm ticks on a light background, at a known px/mm.
    It is generated so the test knows the true dimensions. Also
    `e2e/fixtures/hostile-images.ndjson` (see Testing).

## Proposed fix (verbatim from sketch-001)

### Auto-trace pipeline

This runs in `image.worker.js` on the decoded, downscaled bitmap. The steps are pure
functions in `trace.js` and `simplify.js`, so they can be unit-tested in Node:

1. Grayscale (luma), then a threshold. Otsu is the default. The user's tap decides which
   side of the threshold counts as "part", because a dark part on a light table and a
   light part on a dark mat are both normal.
2. **Flood fill from the tapped pixel.** Tracing only the connected region the user
   tapped is what keeps the ruler, shadows and table texture out of the result. A
   global "trace everything" pass would pick all of them up. A region touching the
   image border is rejected with a reason.
3. One or two morphological open/close passes to remove speckle, then boundary
   extraction by marching squares. The outer boundary becomes Solid. Boundaries of
   enclosed background regions larger than the tolerance become Holes.
4. Ramer–Douglas–Peucker at the Tolerance slider's value, converted to px through
   `mmPerPx`. Then `imagePxToSketchMm` for each vertex, with winding normalized so the
   result feeds `profile.js` and Loft's `resample.js` unchanged.

**Library decision.** The default is to hand-write this: about 300 lines across
threshold, flood fill, marching squares and RDP, all well-known and easy to test.
opencv.js is roughly 8 MB of WASM for the same result. Potrace ports produce Bézier
curves, which the polyline profile model doesn't have. If `/fix-todo` wants a library
anyway, write `docs/decisions/image-trace.md` first, following CLAUDE.md's Library
decisions process.

## Effort

L. sketch-001: "Steps 5-6 above are close to **XL** on their own."

## Testing (verbatim from sketch-001)

  - `src/sketch/trace.spec.js` works on synthetic bitmaps:
    - A filled 100 × 60 px rectangle traces to 4 vertices after RDP, with corners within
      1 px.
    - A filled disc's traced area is within 1% of πr².
    - A rectangle with two holes yields 1 Solid + 2 Holes.
    - The seed on the background, or a region touching the border, yields nothing plus a
      reason.
    - A light-on-dark input traces the same as dark-on-light.
    - A 1-px speckle is ignored.
  10. **Trace to scale**:
      1. `setInputFiles` loads `e2e/fixtures/trace-bracket.jpg`.
      2. Set scale along 100 mm of the fixture's ruler.
      3. Auto-trace by tapping inside the bracket; assert 1 Solid + 2 Hole outlines.
      4. Delete one vertex and drag one.
      5. Choose Linear at 5 mm, then Done.
      6. Assert the body's bounds match the fixture's true bracket size within 1 mm.
  It runs at **all three reference viewports** with a snapshot at each, since
  small-screen behaviour isn't "same as desktop". It runs against **all three engines**
  (Chromium/Firefox/WebKit), since it touches the canvas, touch drawing, kernel results
  and persistence. Add a **touch-only** drawing pass at the phone viewport.
  - **Add scenario 14, "Trace a photographed part to scale and print it"**. This is the
    user's own use case, and it is kept as a scenario of its own rather than folded
    into 9.
    - **Steps**:
      1. With a real phone (not only the fixture), photograph an object next to a ruler.
      2. Load the photo, set the scale from the ruler, auto-trace, and clean up at least
         one vertex.
      3. Extrude to the object's thickness and Done.
      4. Measure the body's width in the Inspector against the real object.
      5. Share the project via gist, then load it in a second browser.
    - **Expect**:
      - Width within 1 mm on a ~100 mm part shot straight down.
      - The image and scale survive the round-trip.
      - The downloaded NDJSON contains no EXIF/GPS block, checked with `exiftool` on the
        decoded `dataBase64`.

    Scenario 8 is re-driven with the hostile fixture as its step 3's "malformed
    document".

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
