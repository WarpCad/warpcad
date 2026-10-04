---
title: Sketch reference image — load a photo onto a slice, set its scale from a ruler, sanitize it as untrusted input
category: sketch
kind: feature
priority: high
model: opus
milestone: M8
depends: [sketch-001]
status: done
---

> **What actually shipped (2026-10-04, `/run-todos` isolated agent).** The reference photo on a
> slice, its sanitization and Set scale — everything this file assigns to step 5 — with the
> hostile-input specs in the same commit as the first image load. Auto-trace (`sketch-004`)
> is **not** offered at all (no disabled button); vertex editing had already shipped
> (`sketch-002`). Where reality differed from the spec below:
>
> - **Record shape:** `{ id: "img-<24 hex of SHA-256>", op: "asset.image", params: { mime,
>   widthPx, heightPx, dataBase64 } }` — the id is the record's own top-level `id` (every
>   record has one; the document's duplicate/undo bookkeeping keys on it), not `params.id`.
>   Any other field, on the record or in `params`, is a refusal.
> - **Validator** `src/sketch/imageAsset.js` (never throws; header dims read without
>   decoding; PNG / JPEG SOFn / WebP VP8, VP8L, VP8X; 8192 px side, 40 MP, 1.5 MB caps).
>   Import re-encode, decode and hashing are in `src/sketch/imageJob.js` + `image.worker.js` +
>   `imageClient.js` (supersede-not-queue, a per-asset bitmap cache freed when the editor
>   closes, main-thread fallback). Calibration math is `calibration.js`; the pure draft edits
>   (set/remove image, apply calibration, rescale outlines about the first mark) are a new
>   `referenceImage.js`.
> - **Load-time degrade** is a second deliberate exception in `src/core/project.js`
>   (`unsafeImageReason`, beside `RETIRED_OPS`): a bad `asset.image` is dropped with a
>   `LoadWarning` naming its id and reason and the file still opens. `replay.js` skips and
>   reports one; `document.js` refuses one loudly on a local append and never folds or
>   lineage-indexes an asset; `assets()` lists the folded ones.
> - **One undo step on Edit sketch** needed a core change: `reviseRecords(changes, tx,
>   { append })` puts the new photo into the log in the same revision (inserted at the
>   rollback marker), and its inverse takes it back out. A new sketch uses `appendAll([asset,
>   sketch])`.
> - **History:** an asset row reads *Reference image W × H px* and is **not** editable
>   (`stepParamEditability` refuses it — the form would have offered raw base64). A photo
>   whose row is suppressed or rolled back reads *switched off in History*, not "unsafe".
> - **Set scale's length entry** is in the top banner at every size (the spec put it "next to
>   the line on desktop"); the banner takes the Sketch toolbar's slot while armed. The
>   corner badge sits **under the photo's bottom-left** corner (the top edge runs under the
>   toolbar once a photo is rescaled). On a narrow viewport the Slices sheet **steps aside
>   entirely** while Set scale is armed rather than folding to its header — the header alone
>   cost the phone 10 points of the reachability grid (67 % measured, 77 % without it).
> - **Found and fixed (not caused here):** the persistence chip's "Opened X, but skipped N
>   steps" report was cleared by the open's own autosave ~1 s later, so a dropped hostile
>   image — or a retired `sketch.line` — was reported for about a second. It is now a separate
>   `loadWarning` that lasts until the next load, File ▸ New or Dismiss.
> - **hostedBackend:** already followed the git blob for files over 1 MB (`io-002`); a spec
>   now round-trips a ~1.9 MB project with a photo through that path. No code change.
> - **Acceptance:** new **scenario 20** (17-19 are reserved by `ai-010` and `testing-002`).
> - **Firefox now launches in this sandbox** (the TROUBLESHOOTING 2026-09-17 entry no longer
>   reproduces); the new e2e ran on all 9 engine × viewport projects.
> - Not checked here: a real iPhone's HEIC → JPEG hand-off and the HEIC refusal wording
>   (`TODO/VERIFY.md`).

> **Split out of `TODO/sketch-001` (2026-10-02).** sketch-001's own Effort section said
> "If the first run finishes steps 1-3, split steps 4-6 into their own TODO rather than
> stretching this one", and the unattended `/run-todos` run did exactly that. Everything
> below the line marked *verbatim* is copied word for word from sketch-001's spec (as
> committed in `be36d6d`); the retired file is `TODO/done/sketch-001-sketch-primitive-extruded-solid.md`.
> Read its "What actually shipped" note first: a few things the spec assumed changed while
> steps 1-3 were built, and the ones that bear on this task are listed under "What changed
> since this was written" below.

## Goal (verbatim from sketch-001)

A slice can also carry a **reference image**: a photo you trace over. The user's case
(2026-09-27):

> A part broke and I want to 3D-print a replacement. It's an odd shape but a constant
> thickness. I lay it on a table next to a ruler and photograph it with my phone. I add
> a Sketch, load the photo as its background, draw a line along the ruler in the photo
> and type "5 in" so the image is at real scale, then trace around the part. **Auto-trace**
> gives me a first outline. I clean it up by moving, adding and removing vertices, then
> extrude it to the part's thickness, and it prints the right size.

The image is saved inside the project. Projects can be loaded from untrusted sources
(`#/gist/<id>`, ACCEPTANCE scenario 8), so **the embedded image is an untrusted input**
and gets sanitized. See "Reference images: storage and sanitization" under Proposed fix.

This task is step 5 of sketch-001's suggested order — **"Reference image: `asset.image`,
sanitization, rendering, Set scale. The sanitization and its hostile-input specs ship in
the same step as the first image load. They are never a follow-up."** Vertex cleanup is
`TODO/sketch-002`; Auto-trace is `TODO/sketch-004`.

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

## Interaction model (verbatim from sketch-001)

The whole of sketch-001's combined section is kept here, unedited, so nothing is lost. The
**vertex editing** bullets belong to `TODO/sketch-002` and the **Auto-trace** bullets to
`TODO/sketch-004`; they are left in place for context.

### Reference image, scale calibration, vertex editing and auto-trace

These are drafted from the user's use case above. Every item not quoted from it is
*(default — confirm)*.

- **Precondition**:
  - *Add image*: the editor is open. The image belongs to the **active slice**, so each
    wing rib can be traced from its own photo. At most one image per slice.
  - *Set scale*, *Auto-trace*, *image opacity/position*, *Remove image*: the active
    slice has an image.
  - *Vertex editing*: exactly one `polyline` profile selected. Rectangle, Circle and
    Polygon profiles have no free vertices. A **Convert to outline** button turns the
    selected one into an equivalent closed polyline so its vertices can be edited.
  - *Delete vertex*: a vertex is selected and the polyline has more than 3 vertices.
    Otherwise the button is disabled with the reason "An outline needs at least 3
    points".
- **Trigger**:
  - A **Reference image** group in the Slices panel (the bottom sheet at phone width). It
    is not in the toolbar slot, which is already full at 390 px (ui-043). The group holds:
    - **Add image…**, which opens `<input type="file" accept="image/png,image/jpeg,image/webp">`.
      On a phone this offers the camera as well as the photo library. There is no
      `capture` attribute, so choosing an existing photo still works. It becomes
      **Replace image…** once the slice has an image.
    - **Opacity** slider (default 50%).
    - Image **X / Y offset** (mm) and **Rotation** (°) fields, for lining the photo up
      with the sketch axes.
    - **Set scale**, **Auto-trace** and **Remove image**.
  - **Set scale** arms a two-point tool. Press on one ruler mark and drag to another, or
    tap twice. Mouse and touch behave the same, and no modifier key is used. A length
    field with a **unit picker (mm / cm / in)** then opens, next to the line on desktop
    and in the sheet on phone. Pressing **Apply** commits the scale.
  - **Auto-trace** arms a tap tool: "Tap inside the part". A **Tolerance** slider
    (mm, default 0.5) sets how closely the outline follows the pixels. The **Threshold**
    is automatic (Otsu), with a manual override slider.
  - Vertex editing on a selected polyline:
    - **Move**: drag a vertex handle. This is ui-020's endpoint dragging, extended to
      every vertex.
    - **Add**: each segment shows a smaller midpoint handle. Dragging it inserts a vertex
      there. This works with no modifier on touch.
    - **Remove**: tap a vertex to select it, then **Delete vertex** in the profile panel.
      Delete/Backspace does the same on a keyboard.
    - **Simplify**: a tolerance field (mm) plus an **Apply** button on the profile panel.
      It runs the same Ramer–Douglas–Peucker pass auto-trace uses, so a 400-point traced
      outline can be thinned to something hand-editable.
- **Feedback**:
  - A loaded image draws on the active slice's plane, **under** the grid lines and
    strokes, at the chosen opacity. It is centred on the sketch origin with a
    provisional scale of 1 px = 0.1 mm. Until Set scale has been applied, a **"Not to
    scale"** badge sits on the slice's row in the Slices panel and on the image's corner.
  - After Apply, the calibration line stays drawn in dimension style, labelled with the
    length as the user typed it ("5 in"), and the badge changes to "1 px = 0.199 mm".
    The image rescales **about the calibration line's first point**, so the ruler stays
    where the user was looking.
  - If the slice already has profiles when the scale changes, a confirm asks "Rescale the
    N outlines on this slice to match the image?" and defaults to **Yes**. The user may
    have traced first and calibrated second. This rescale is part of the editor draft, so
    Cancel still undoes it.
  - Auto-trace adds the outer boundary it finds as a **Solid** polyline. Any enclosed
    inner boundaries (bolt holes in a bracket) become **Hole** polylines. It prints how
    many outlines and vertices it created. A tap on the background, or on a region that
    touches the image edge, adds nothing and prints why: "That region runs off the
    edge of the photo — tap inside the part".
  - Tracing runs in a worker. A spinner shows on the Auto-trace button while it runs, and
    tapping again supersedes the previous run.
  - The vertex under the pointer highlights. A selected vertex shows its X/Y (mm) in the
    profile panel as editable fields.
  - Outside the editor the reference image is **hidden**. It is a tracing aid, not part
    of the solid: it is never rendered in the 3D scene, exported or booleaned.
  - A reference image that failed validation on load is dropped and reported (see
    Proposed fix). The sketch's geometry still loads, and its Slices panel row reads
    "Reference image removed — it couldn't be verified as a safe image".
- **Placement**: the image lives in the slice's local 2D frame, so moving or rotating
  the body moves the photo with it, like the profiles.
- **Selection response**: tapping the image does nothing. It is never a pick target and
  must not intercept pointer events: ui-020 finding #1's dead-strip bug is exactly this
  failure. Draw it inside the WebGL scene, not as a DOM `<img>` over the canvas.
- **Selection count**: Set scale, Auto-trace and the image controls act on the active
  slice. Vertex tools need exactly one selected polyline.
- **Small-screen behavior**: while Set scale or Auto-trace is armed on a phone, the
  Slices sheet **collapses to its header**. That leaves the photo tappable, and the
  reachable-canvas ≥ 69% rule applies. A top banner shows the instruction and a
  **Cancel** button. Vertex handles are 44 px touch targets drawn as smaller dots.
  Midpoint handles hide on segments shorter than 2 × 44 px on screen, so a dense traced
  outline doesn't become a wall of handles. The fix there is zooming in or Simplify.

## Documentation (verbatim from sketch-001)

- **Page**: new `docs/sketch-tracing.md`, **Tracing a photo**, linked from
  `docs/sketch-mode.md` and added to the `docs/README.md` sidebar. It covers taking a
  usable photo, loading it, setting scale, auto-trace, vertex cleanup, and what happens
  to the photo when you share the project. The last point says plainly that the photo is
  saved in the project file, is re-encoded, and has its location metadata removed.
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
- **Accuracy tips** on the same page, stated as limits rather than hidden:
  - Scale is uniform, so a photo taken at an angle is stretched and no scale setting
    fixes that. Shoot straight down.
  - Keep the ruler level with the surface you trace. With a thick part, the top outline
    is closer to the lens and looks bigger than the bottom one.
  - Set the scale along the longest stretch of ruler you can.
- Screenshots come from the new e2e spec's snapshots (`.claude/commands/docs.md`
  Step 3).

(The parts of Example 3 that auto-trace and edit vertices land with `TODO/sketch-004` and
`TODO/sketch-002`; this task ships the page with loading, setting scale, the image's
storage and the accuracy tips.)

## Affected files (verbatim from sketch-001)

- Reference-image files:
  - `src/sketch/imageAsset.js` (framework-free): validates an `asset.image` record
    (see "Reference images"). It checks the MIME allowlist, the base64 charset and
    length cap, and that the magic bytes match the declared MIME. It also parses header
    dimensions **without decoding** (PNG `IHDR`, JPEG `SOFn`, WebP `VP8 `/`VP8L`/`VP8X`).
    It returns `{ ok, reason }` and never throws on hostile input.
  - `src/sketch/calibration.js`: computes `mmPerPx` from two image-pixel points plus a
    length and unit, and provides `imagePxToSketchMm` / `sketchMmToImagePx` given the
    slice's image placement. This is the one place image space (px, origin top-left, +y
    **down**) meets sketch space (mm, +y up).
  - `src/sketch/trace.js`: pure functions over
    `{ width, height, data: Uint8ClampedArray }`. They cover grayscale conversion, the
    Otsu threshold, flood fill from a seed pixel, boundary extraction (marching
    squares), and outer/inner contour classification.
  - `src/sketch/simplify.js`: Ramer–Douglas–Peucker with a tolerance in mm. The profile
    panel's Simplify uses it too.
  - `src/sketch/image.worker.js` + `src/sketch/imageClient.js`: import re-encoding and
    tracing, off the main thread, with supersede-not-queue.
  - `src/core/document.js`: an `asset.image` record type and an `assets()` accessor (see
    "Reference images" for why this is a separate record and not a param).
  - `src/core/replay.js`: an asset that fails validation becomes a load warning, as
    scenario 8 already requires for bad records.
  - `src/render/referenceImage.js`: an `ImageBitmap` becomes a `THREE.Texture` on a plane
    in the slice frame. It is non-pickable, `depthWrite: false`, and draws under the
    grid. The texture is disposed when the editor closes.
  - `src/components/sketch/ReferenceImagePanel.vue` (the Slices panel group),
    `src/components/sketch/ScaleTool.vue` (the calibration line and length entry), and
    `src/components/sketch/VertexHandles.vue` (vertex and midpoint handles; extend
    `SketchStrokes.vue` instead if that ends up smaller).
  - `e2e/fixtures/trace-bracket.jpg`, a **generated** fixture: a dark L-bracket with two
    round holes and a ruler with 10 mm ticks on a light background, at a known px/mm.
    It is generated so the test knows the true dimensions. Also
    `e2e/fixtures/hostile-images.ndjson` (see Testing).
  - `src/storage/hostedBackend.js`: **check** that a gist file over 1 MB loads. The
    GitHub API returns such files with `truncated: true` and a `raw_url` rather than
    inline `content`. A project with a photo is the first document likely to cross that
    size. If it isn't handled, fetch `raw_url` and add a spec.

(`src/sketch/trace.js` and the tracing half of `image.worker.js` are `TODO/sketch-004`'s;
`simplify.js` and `VertexHandles.vue` are `TODO/sketch-002`'s.)

## Proposed fix (verbatim from sketch-001)

### Reference images: storage and sanitization

**Record shape.** The image is its own record, and the slice refers to it by id:

```json
{ "op": "asset.image", "params": { "id": "img-3f9a…", "mime": "image/jpeg",
  "widthPx": 2048, "heightPx": 1536, "dataBase64": "/9j/4AAQ…" } }
```

```json
"slices": [{ "id": "s1", "zMm": 0, "profiles": [ … ],
  "image": { "assetId": "img-3f9a…", "offsetMm": [0, 0], "rotationDeg": 0,
             "opacity": 0.5, "mmPerPx": 0.199,
             "calibration": { "aPx": [212, 1310], "bPx": [850, 1302],
                              "length": 5, "unit": "in" } } }]
```

The image is kept out of `params` because `paramEdit.js` supersedes by writing a whole
new params object. An embedded photo would then be copied into the log on **every**
height tweak. The id is a content hash (SHA-256 of the sanitized bytes, via
`crypto.subtle`), so re-adding the same photo reuses the existing record. On Done, the
editor appends the `asset.image` record and the sketch record **in one batch/
transaction**, which keeps one editing session as one undo step. `asset.image` is a
data record, not a body: the fold stores it in an asset table and never passes it to the
kernel. The registry's `primitive.sketch` builder ignores `slice.image` completely,
because a photo is never geometry. `calibration` keeps the user's own points and unit so
Set scale can be re-opened and edited. `mmPerPx` is derived from it but stored as well,
so a reader needs no unit logic to use it. Orphaned assets (image removed or replaced)
stay in the log, since it is append-only. Compaction is a separate question and not part
of this task.

**Threat model.** The project is JSON, so no record can execute. An embedded image is
still attacker-controlled bytes handed to a decoder, and that is the risk this section
closes:

| Threat | Mitigation |
|---|---|
| **SVG with script** (SVG is an image format that can contain `<script>`) | Raster allowlist only: `image/png`, `image/jpeg`, `image/webp`. SVG, GIF, HEIC or any other MIME is rejected at import and at load. |
| **Remote reference**: an `http(s):` URL instead of inline data. Loading the project would make the browser fetch it, leaking the viewer's IP (a tracking pixel) or hitting an internal address. | Only an inline `dataBase64` is accepted. There is **no URL field**, and any other key in the record is rejected, not ignored. An e2e asserts **zero** network requests leave the page while a hostile project loads. |
| **Polyglot / metadata payload** (a file that is a valid JPEG and also something else; script or HTML in EXIF/XMP/comments) | **Re-encode at import**: decode with `createImageBitmap(file, { imageOrientation: 'from-image' })` in the worker, draw to an `OffscreenCanvas`, and `convertToBlob` to JPEG (q 0.85) or PNG (if the source had alpha). Only pixels survive. This also removes **EXIF GPS**, so a shared project doesn't reveal where the photo was taken. |
| **Decompression bomb** (a small file that declares 50 000 × 50 000 px) | `imageAsset.js` reads the dimensions from the header **before** decoding. Anything over 8192 px on either side, or over 40 MP, is rejected. Import then downscales to at most 2048 px on the long edge. Stored `dataBase64` is capped at 1.5 MB. |
| **Malformed or lying record** (bad base64, MIME ≠ magic bytes, header dims ≠ declared `widthPx`/`heightPx`) | Rejected by `imageAsset.js` on load. The record is skipped with a replay warning naming its id and reason, and any slice that references it loads without an image. Geometry is untouched. This is scenario 8's contract, extended to a new record kind. |
| **Injection through the render path** | The bytes follow one path: `Uint8Array` → `Blob` with the **allowlisted** MIME → `createImageBitmap` → `THREE.Texture`. They are never put into `innerHTML`, a CSS `url()`, an `<img src>` string or a `data:` URL built by string concatenation. |

Load is validate-then-decode. It does **not** re-encode, because only decoded pixels
are ever used and nothing else in the bytes is interpreted. Import is where the
re-encode happens. Decoding still runs in the worker, so a slow or hostile decode never
blocks the main thread. Browser decoder bugs themselves are the same exposure any web
page with an image has, and are out of scope.

**Engine note.** `createImageBitmap` and `OffscreenCanvas.convertToBlob` in a worker
need Safari 16.4+. The previous attempts' Safari bugs are the reason this needs WebKit
coverage inside the task (see Testing). Also check on a real iPhone that a HEIC photo
arrives through the file input as JPEG, since iOS normally transcodes to the `accept`
list. If it arrives as HEIC, the rejection message must say "Choose a JPEG or PNG — iPhone
HEIC photos can be exported as JPEG" rather than a generic failure.

From "Suggested order inside the task":

5. Reference image: `asset.image`, sanitization, rendering, Set scale. **The
   sanitization and its hostile-input specs ship in the same step as the first image
   load. They are never a follow-up.**

## Effort (verbatim from sketch-001)

L (multi-session). It combines a removal across ~20 files, a new primitive, a new
editor lifecycle and one new numerical algorithm (loft resampling). The reference-image
work adds a second new record kind with an untrusted-input validator, and a second
algorithm (tracing). Steps 5-6 above are close to **XL** on their own. If the first run
finishes steps 1-3, split steps 4-6 into their own TODO rather than stretching this one.

## Testing (verbatim from sketch-001)

- **Unit (Vitest, next to source)**:
  - `src/sketch/imageAsset.spec.js` covers the hostile inputs. Each one is rejected with
    a reason and none throws:
    - An SVG MIME.
    - A GIF MIME.
    - A `url`/`src` key.
    - An unknown extra key.
    - Non-base64 characters.
    - Over the size cap.
    - PNG magic bytes declared as `image/jpeg`.
    - A PNG `IHDR` declaring 50 000 × 50 000.
    - Declared `widthPx` ≠ header width.
    - A truncated header.
    - An empty string.

    Valid minimal PNG, JPEG and WebP fixtures, built as byte arrays in the spec, pass with
    the right dimensions.
  - `src/sketch/calibration.spec.js` covers:
    - 5 in → 127 mm exactly.
    - `mmPerPx` from a known line.
    - Round-trip `imagePxToSketchMm ∘ sketchMmToImagePx` within `toBeCloseTo(…, 9)`
      under offset + rotation.
    - The y-flip (px +y down → mm +y up).
    - A zero-length calibration line and a zero or negative length are rejected.
  - `document.spec.js`:
    - An `asset.image` record never reaches the kernel (a call count, as ui-020 did).
    - The sketch record plus its asset append as **one** undo step.
    - A slice referencing a missing asset still builds.
- **E2E** (from sketch-001's `e2e/sketch-primitive.e2e.js` flow — steps 10.1, 10.2 and
  10.7 of its Trace-to-scale case, and the whole Hostile-project-load case):
  10. **Trace to scale**:
      1. `setInputFiles` loads `e2e/fixtures/trace-bracket.jpg`.
      2. Set scale along 100 mm of the fixture's ruler.
      7. Save, reload, Edit sketch, and assert the image is still shown and the badge
         still shows the calibrated scale.
  11. **Hostile project load**:
      1. Load `e2e/fixtures/hostile-images.ndjson` through the same path a `#/gist/`
         load uses. It holds an SVG-with-script asset, an `https://` reference, a
         mismatched MIME, and a 50 000 px header, each referenced by a sketch body.
      2. Assert one warning per bad asset.
      3. Assert every sketch body still renders.
      4. Assert no `dialog` event fired.
      5. Via `page.on('request')`, assert **no request left the app's own origin**.

  It runs at **all three reference viewports** with a snapshot at each, since
  small-screen behaviour isn't "same as desktop". It runs against **all three engines**
  (Chromium/Firefox/WebKit), since it touches the canvas, touch drawing, kernel results
  and persistence. Add a **touch-only** drawing pass at the phone viewport.
- **Acceptance** (verbatim):
    Scenario 8 is re-driven with the hostile fixture as its step 3's "malformed
    document".

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
