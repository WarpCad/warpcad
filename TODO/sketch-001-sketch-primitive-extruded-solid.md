---
title: Replace free-standing Sketch mode with a Sketch primitive that always extrudes to a solid, with photo tracing to scale
category: sketch
kind: feature
priority: high
model: opus
milestone: M8
depends: []
status: open
---

## Goal

Today a sketch is its own kind of document object. `TODO/done/ui-020` added a
**Sketch** toggle in the nav chrome. It draws loose `sketch.line` records that
`src/core/document.js` routes *around* the kernel into a parallel `sketchEntities` map.
They are never solids: they can't be booleaned, exported, moved with the gizmo or
listed as bodies, and nothing ever turns them into geometry. That is the wrong model
for this app. **A sketch is a way of defining a primitive, the same way a hexagon is a
6-sided profile extruded to a height** (`primitive.hexagon` in
`src/core/kernel/registry.js`). A sketch must always end up as a 3D solid.

This task removes the free-standing Sketch mode and replaces it with a **Sketch
primitive** (`primitive.sketch`) in the Library's Primitives section. It is a body like
any other primitive: dropped by drag-to-place, selectable, movable/rotatable with the
gizmo, usable as a boolean operand, exportable, persisted. It is defined by:

1. **An array of one or more sketches ("slices")**, each a set of closed 2D profiles on
   a plane at its own offset along the body's local Z axis. One slice is the common
   case. Several slices are how you build a lofted shape, e.g. the ribs of an airplane
   wing, where each rib is a slice and the solid is skinned through them.
2. **A Solid / Hole role on every closed profile.** Two concentric circles with the
   inner one marked Hole, linearly extruded, make a tube. Per slice, the 2D region is
   `union(solid profiles) − union(hole profiles)`, computed before extrusion.
3. **One extrusion method** chosen from what `@jscad/modeling` 2.13's `extrusions`
   module offers (see the method table under Proposed fix): Linear, Revolve, Helical,
   Outline (rectangular), and Loft (from slices).

The workflow the user described, and what "done" looks like:

> Drag **Sketch** from the Library into the viewport → the sketch editor opens on the
> new body's plane → draw two concentric circles with the sketch tools → tap the inner
> one and mark it **Hole** → choose **Linear**, height 30 mm → **Done**. A tube 30 mm
> tall is now in the scene. Clicking it selects it like any body: the gizmo attaches,
> the Inspector shows its extrusion parameters plus an **Edit sketch** button, and it
> can be subtracted from a cube.

And for the multi-slice case: add three slices at Z = 0, 100 and 200 mm, draw a
differently sized airfoil outline on each, choose **Loft**, **Done**. The result is a
single solid skinned through all three ribs.

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

The old Sketch toggle, the loose `sketch.line` record type and its parallel
document-side plumbing are gone when this is done, not left alongside.

## Interaction model

This supersedes `docs/decisions/interaction-model-qa.md` section 7 (ui-020's Q&A). **The
first step of this task is to rewrite section 7 against the answers below and confirm
them with the user.** Everything below is drafted from the user's own description
(2026-09-27). Items marked *(default — confirm)* were filled in by the scoping session
and have not been confirmed by the user yet.

- **Precondition**:
  - *Creating* a sketch primitive: nothing. It is a creation row, like Cube.
  - *Editing* one: exactly one `primitive.sketch` body selected.
  - *Choosing Loft*: the sketch has ≥ 2 slices, each with a closed Solid profile.
  - *Choosing any other method*: exactly 1 slice. Otherwise the method button is
    disabled, with the printed reason ("Loft needs two or more slices" / "Linear uses
    one slice — remove the others or pick Loft").
- **Trigger**:
  - A **Sketch** row in the Library's *Primitives* section, ordered after `Tube` in
    `ROW_ORDER` (`src/core/library.js`). Dragging it into the viewport places the new
    body's origin and sketch plane at the drop point, using the same `ui-010` placement
    ghost every primitive uses; the ghost is a square plane outline, since there is no
    geometry yet. Releasing it **opens the sketch editor** on that plane.
  - To re-open the editor later: an **Edit sketch** button in the Inspector
    (`data-testid="inspector-edit-sketch"`) when a sketch body is selected.
    Double-clicking or double-tapping the body is a shortcut *(default — confirm)*.
  - Inside the editor, a **Sketch toolbar** in the viewport's top-left toolbar slot.
    ui-020 already claims that slot and makes the Operations toolbar yield it, so reuse
    that arrangement. Toolbar contents:
    - Drawing tools: **Line** (a chained polyline that closes when you finish on its
      start point, which snaps), **Rectangle**, **Circle** and **Polygon** (regular
      N-gon; this is what makes `primitive.hexagon` expressible as a sketch).
    - **Solid / Hole** toggle, acting on the selected profile.
    - **Slices** control: the active slice's name and Z offset, **＋ Slice**, **Delete
      slice**, and a picker to switch between slices.
    - **Extrude ▾**, the method picker with each method's own fields (see table).
    - **Done** and **Cancel**.
  - Drawing gestures are ui-020's, unchanged: pointer-down, drag, pointer-up, no
    modifier key on any pointer type, and orbit suspended while editing.
- **Feedback**:
  - Profiles render as the existing thin bright stroke (`SketchStrokes.vue` styling).
    Hole profiles render **dashed**, with a small "hole" badge on selection, so the two
    roles are distinguishable without colour alone.
  - Open (unclosed) chains render in a warning colour, with the note "Open outline —
    not part of the solid".
  - Inactive slices draw ghosted at their offsets, so the wing-rib stack is visible
    while you draw one rib.
  - Revolve and Helical draw the revolve axis (the sketch's local Y axis, x = 0) as a
    dashed line. A profile crossing that axis gets an inline warning.
  - While the editor is open, a translucent **extrusion preview** of the current
    method/params is evaluated in the worker (never on the main thread) and shown
    behind the strokes. It is superseded, not queued, when params change.
  - **Done** commits and closes the editor; the body is shaded like any other solid and
    becomes the selection. **Cancel** discards every change made since the editor
    opened. For a brand-new sketch, Cancel leaves no body at all.
  - A method the current region can't be extruded with (Done with zero closed solid
    profiles, a self-intersecting profile, a Revolve profile crossing the axis) keeps
    **Done** disabled, with the reason printed. The document never holds a body the
    kernel can't build.
- **Placement**: drag-to-place, per CLAUDE.md's non-negotiable rule. The drop point
  becomes the body's origin; the sketch is drawn in the body's *local* XY plane, so
  moving or rotating the body later moves every slice with it. The editor's camera
  snaps straight-on to the active slice's plane *in the body's frame*. For an
  unrotated body at a Z offset of 0 this is today's `camera.snapTo('top')`. For a
  rotated body it needs a new `snapToPlane(frameMatrix)` in `src/render/camera.js`.
- **Selection response**:
  - Outside the editor, a sketch body behaves exactly like a Cube: the gizmo attaches,
    the Inspector shows transform fields, then the extrusion method and its numeric
    params, editable in place through `paramEdit.js`'s existing supersede path (ui-029),
    then **Edit sketch**.
  - Inside the editor, clicking a profile selects it (start/end/length for a segment,
    centre/radius for a circle, width/height for a rectangle, plus the Solid/Hole role),
    with ui-020's endpoint and handle dragging and **no** 3D gizmo.
  - As in ui-020, a freshly drawn profile is **not** auto-selected. That fixed the phone
    bottom-sheet covering the line just drawn.
- **Selection count**:
  - Edit sketch: exactly 1 sketch body.
  - The finished body counts as an ordinary operand for Union/Subtract/Intersect/Mirror.
    This is the capability the old `selection.sketchId` design deliberately withheld,
    and removing that separate id is part of this task.
  - Inside the editor: single-profile selection only.
  - Method gating by slice count, as described under Precondition.
- **Small-screen behavior**:
  - At phone width (390 px) the Sketch toolbar shows the tool icons, Solid/Hole and
    Done in the slot. Slices and Extrude open as a bottom sheet rather than a dropdown,
    reusing the Inspector sheet's pattern, and the sheet must not cover the active
    slice's drawing area. ui-020's finding #3 measured this: reachable canvas must stay
    at ≥ 69%, via the same 10×10 hit-test grid.
  - The editor keeps ui-046's rule: nav chrome folds while a sheet is open, and Done /
    Cancel stay visible.
  - Tablet width is the same as phone, since the viewport is 390 px there too (ui-020
    finding #2). Laptop is the same as desktop.

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

## Documentation

- **Page**: rewrite `docs/sketch-mode.md` as **Sketch primitives**. Keep the file name so
  existing links still resolve, retitle it, and update its `docs/README.md` sidebar
  entry. It covers: placing a sketch, the four tools, Solid vs Hole, slices, each
  extrusion method with a one-line picture of what it makes, and editing a finished
  sketch. Update `docs/selection-and-inspector.md` (Edit sketch button, extrusion
  fields) and `docs/viewport-navigation.md` (the nav-chrome Sketch toggle is gone).
- **Example 1 (tube)**: "Open the Library and drag **Sketch** from Primitives into the
  viewport, then release. The view turns to look straight down at a flat grid and the
  Sketch toolbar appears. Pick **Circle**, press at the grid's centre and drag out to
  20 mm. Draw a second circle from the same centre out to 15 mm. Tap the smaller circle,
  then tap **Hole**: its outline turns dashed. Open **Extrude ▾**, choose **Linear**
  and type 30 in Height (millimetres). A see-through preview of a tube appears. Tap
  **Done**. You now have a 30 mm tall tube with a 30 mm bore, which you can move with
  the gizmo or subtract from another solid."
- **Example 2 (loft)**: "With a sketch open, tap **＋ Slice** twice and set the new
  slices' Z offsets to 100 and 200 mm. On each slice, draw one closed outline with
  **Line**, finishing on the first point to close it. Open **Extrude ▾** and choose
  **Loft**. Tap **Done**, and the solid is skinned through all three outlines in
  order."
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

## Affected files

**Removed or gutted: the free-standing sketch path from ui-020**

- `src/components/viewport/NavigationChrome.vue`: remove the **Sketch** toggle. The
  editor is entered from the Library drop or from Edit sketch, never from nav chrome.
- `src/core/document.js`: remove the `SKETCH_OP_PREFIX` fold branch (≈ lines 1008-1080),
  `sketchRootOrder`, `sketchEntities()` (≈ 2359-2385), the `SketchEntityRecord`
  typedef, and the "Draw …" label branch (≈ 1414-1421). A sketch body is a
  `primitive.*` op through the ordinary kernel fold, so none of this is needed. Also
  remove the module-doc section "Sketch records: in the log, past the kernel"
  (≈ 100-125).
- `src/core/timelineLabel.js`: remove its own `SKETCH_OP_PREFIX` / "drawn" branch
  (≈ 95, 218). The label becomes "Place Sketch", like any primitive.
- `src/stores/selection.js`: remove `sketchId` and `selectSketch`. Selection *inside*
  the editor is editor-local state (see `sketchEditor` below), not a second document
  selection that has to be kept mutually exclusive with body selection.
- `src/stores/sketchMode.js`: replace with `src/stores/sketchEditor.js` (see New).
  Update its readers to use `sketchEditor.active`: `src/stores/objectList.js:47,86,104` (renamed from `objectsPanel.js` by `ui-049`)
  and `OrientationGizmo.vue`'s camera lock.
- `src/stores/sketchPreview.js`, `src/composables/useSketchCommands.js`: replace. They
  appended `sketch.line` records one at a time. The editor instead edits a draft and
  appends **one** record on Done (see Proposed fix).
- `src/components/storage/FileMenu.vue:64,81,138`: its "a sketch drag is in flight"
  guard reads `sketchPreview`. Repoint it at `sketchEditor.active`.
- `src/components/inspector/Inspector.vue`: remove the loose-line branch. Add the
  sketch-body fields (method + params, Edit sketch) and the editor's profile fields.
- `src/sketch/entity.js`: replace the `LineEntity` / `SKETCH_LINE_OP` model with the
  profile model (see New). Keep `lengthOf`, `moveEndpoint` and `isDegenerate`, since the
  Line tool still needs them.
- `e2e/sketch-line-entity.e2e.js`: delete. Its real-mouse hit-testing coverage
  (ui-020 finding #1) moves into the new spec.
- `e2e/phone-toolbar-chrome-fit.e2e.js`: update its Sketch-toggle steps.
- Specs that assert the old model: `src/core/document.spec.js`,
  `src/core/historyRestore.spec.js`, `src/core/timelineLabel.spec.js`,
  `src/stores/selection.spec.js`, `src/stores/objectList.spec.js`,
  `src/components/inspector/ObjectList.spec.js` (both moved/renamed by `ui-049`),
  `src/render/annotate.spec.js`.

**New**

- `src/sketch/profile.js`: the framework-free profile model, in the same pure-functions-
  over-plain-values style as the current `entity.js`. It holds:
  - Profile kinds: `polyline` (closed flag), `rect`, `circle`, `polygon`. Each has
    `{ id, kind, role: 'solid' | 'hole', …Mm fields }`.
  - `isClosed`, `selfIntersects`, `toPointsMm(profile, segments)`.
  - `regionOf(slice)`, which returns the solid profiles and hole profiles as point
    lists. It returns point lists, *not* a geom2: the kernel boundary stays in
    `src/core/kernel/`.
- `src/sketch/resample.js`: arc-length resampling of a closed outline to N points, with
  a consistent winding and a consistent start vertex. Loft needs this (see Proposed fix,
  "Loft numerics").
- `src/core/kernel/registry.js`: a `primitive.sketch` entry (`native(0, …)`,
  `label: 'Sketch'`). It builds each slice's geom2 via `primitives.polygon` /
  `circle` / `rectangle` and 2D `booleans.union` / `subtract`, then dispatches on
  `params.extrusion.method`. This is the only file that turns sketch data into jscad
  geometry.
- `src/core/library.js`: add `'primitive.sketch'` to `ROW_ORDER` after
  `'primitive.tube'`.
- `src/stores/sketchEditor.js`: UI state for the open editor. It holds `active`,
  `bodyId` (`null` for a brand-new sketch), a **draft** copy of the params, the active
  slice index, the selected profile id and the active tool. Per CLAUDE.md, the draft is
  UI state rather than document state, and it lives only until Done or Cancel.
- `src/composables/useSketchEditorCommands.js`: turns a draft into exactly one append on
  Done. That is a creation record for a new sketch, or a `paramEdit.js` supersede record
  plus the existing pose re-application for an edited one.
- `src/components/viewport/SketchToolbar.vue`: rework the existing file (tools,
  Solid/Hole, Slices, Extrude ▾, Done, Cancel).
- `src/components/sketch/SlicePanel.vue` and `src/components/sketch/ExtrudePanel.vue`:
  extracted per the ~30-template-line rule. CLAUDE.md's `sketch/` component category
  finally gets its first residents.
- `src/components/viewport/SketchStrokes.vue`: keep and extend (hole dashing, ghosted
  inactive slices, the revolve axis). It is re-read by the editor, not by the document.
- `src/render/camera.js`: `snapToPlane(frame)` for rotated bodies.
- `e2e/sketch-primitive.e2e.js`: see Testing.
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
- `docs/sketch-mode.md` (rewritten), `docs/selection-and-inspector.md`,
  `docs/viewport-navigation.md`, `docs/decisions/interaction-model-qa.md` section 7.
- `TODO/ACCEPTANCE.md` scenario 9: rewritten, see Testing.

## Proposed fix

### The record shape: one ordinary primitive, params are plain JSON

```json
{
  "op": "primitive.sketch",
  "params": {
    "center": [0, 0, 0],
    "slices": [
      {
        "id": "s1",
        "zMm": 0,
        "profiles": [
          { "id": "p1", "kind": "circle", "role": "solid", "centerMm": [0, 0], "radiusMm": 20 },
          { "id": "p2", "kind": "circle", "role": "hole",  "centerMm": [0, 0], "radiusMm": 15 }
        ]
      }
    ],
    "extrusion": { "method": "linear", "heightMm": 30, "twistDeg": 0, "twistSteps": 1 }
  }
}
```

Making the sketch a `primitive.*` op, rather than keeping ui-020's parallel
`sketch.*` fold branch, is the whole reason this is a simplification. It gets the
following for free, from code that already works and is already tested for every other
primitive:

- the kernel fold and the worker (off main thread),
- the trial fold that rejects a record the kernel can't build,
- `bodies()`, picking, the gizmo, booleans, Mirror, export, Objects list, History,
  undo/redo and origin tagging,
- NDJSON persistence (params are plain JSON),
- param editing via supersede (`paramEdit.js`, ui-029).

`paramEdit.js`'s read-only guard applies unchanged. A sketch body that has since been
booleaned or filleted can't be rebuilt from new params without silently dropping that
work, so **Edit sketch** is disabled with the guard's existing reason. That is the same
trap ui-029 exists to catch.

Angles are **degrees** in params and the UI, and radians only inside the registry entry.
The one conversion is named `degToRad` at that boundary, per CLAUDE.md's
"a raw number never crosses a module edge without its space being obvious".

### Why the editor edits a draft and commits once

ui-020 appended one record per stroke. That was fine for loose lines, but for a solid it
would mean every intermediate state (one circle, an open polyline, zero solid profiles)
had to be a buildable body, or the trial fold would reject it. It would also mean one
undo step per stroke. Instead, the editor works on a draft in `sketchEditor`, and Done
appends a single record, so **one editing session is one undo step** and the document
never holds a half-drawn sketch. The extrusion preview while editing runs the same
registry builder in the worker against the draft. It is superseded rather than queued
(CLAUDE.md Performance), and it is never appended.

### Extrusion methods (`@jscad/modeling` 2.13 `extrusions`)

| UI name | jscad call | Slices | Params (UI units) | Notes |
|---|---|---|---|---|
| **Linear** | `extrudeLinear` | exactly 1 | height mm, twist °, twist steps | The tube case. Extrudes along local +Z from the slice's `zMm`. |
| **Revolve** | `extrudeRotate` | exactly 1 | angle ° (default 360), start angle °, segments | Sketch X is the radius, sketch Y the height, and the axis is local Z. The editor draws the axis. Profiles with x < 0 are blocked with a reason rather than silently using `overflow: 'cap'`. |
| **Helical** | `extrudeHelical` | exactly 1 | pitch mm, turns (→ angle), end offset mm, segments/turn | Springs and threads. Same axis convention as Revolve. |
| **Outline** | `extrudeRectangular` | exactly 1 | wall size mm, height mm | Thickens the profile *outlines* into walls, which makes a hollow shell with no fill. Solid/Hole roles are ignored, with a note saying so. |
| **Loft** | `extrudeFromSlices` | ≥ 2 | resolution (points per slice) | The wing-rib case. See Loft numerics. |

Two parts of the `extrusions` / `hulls` API are deliberately left out, so nobody has to
re-derive why:

- `project` goes 3D → 2D, the opposite direction.
- `hullChain` only makes convex solids, so it would silently fill in any concave rib.
  It could be a later "Hull through slices" method if convex lofts turn out to be
  common.

### Loft numerics (the one genuinely new geometry)

`extrudeFromSlices` walls slice *n* to slice *n+1* **by vertex index**. It needs every
slice to have the same vertex count, a consistent winding, and corresponding start
points. `src/core/kernel/fillet.js:254-335` already hit this: see its "cannot wall two
rings of different lengths" comment. For each slice's outer outline, `resample.js`
must:

1. Normalize the winding to CCW.
2. Rotate the vertex list so it starts at the vertex nearest the ray from the outline's
   centroid along +X. This stops the skin from twisting.
3. Resample by arc length to N points, where N = the resolution param (default
   max(vertex counts), capped at 256).

Slices are sorted by `zMm`. Two slices at the same Z are rejected with a reason.

**v1 scope limit, stated rather than discovered**: each Loft slice must have exactly
**one Solid profile and no Holes**. Matching holes across slices is ambiguous (which
hole connects to which?), and wing ribs' lightening holes are better made afterwards
with Subtract anyway. The Extrude panel says this when Loft is picked with holes
present. Lofting holes is a follow-up TODO if real use asks for it.

### Loading older documents

A saved project may contain `sketch.line` records. Once the registry and fold no longer
know that op, `src/core/replay.js` skips it with its existing per-record warning, which
names the id, the op and the reason ("sketch lines are no longer supported — redraw
them in a Sketch primitive"). No crash, and every other record still replays. This is
exactly the path ACCEPTANCE scenario 8 (remote-load safety) covers. **Do not** write an automatic
line → polyline migration. A loose line has no role or extrusion, so there is nothing
correct to migrate it to.

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

### Suggested order inside the task

This is `Effort: L`. If `/fix-todo` judges it too big for one run, split along these
seams, and each piece must still pass the reachability gate:

1. Registry `primitive.sketch`, profile model and Linear only. Library row, editor with
   Circle/Rectangle, Solid/Hole, Done/Cancel. Remove the old path.
2. Line (closed polyline) and Polygon tools; Revolve, Helical and Outline.
3. Slices and Loft.
4. Vertex editing (move, add, delete, Simplify, Convert to outline). This is useful
   without images and is a prerequisite for cleaning up a trace.
5. Reference image: `asset.image`, sanitization, rendering, Set scale. **The
   sanitization and its hostile-input specs ship in the same step as the first image
   load. They are never a follow-up.**
6. Auto-trace.

## Effort

L (multi-session). It combines a removal across ~20 files, a new primitive, a new
editor lifecycle and one new numerical algorithm (loft resampling). The reference-image
work adds a second new record kind with an untrusted-input validator, and a second
algorithm (tracing). Steps 5-6 above are close to **XL** on their own. If the first run
finishes steps 1-3, split steps 4-6 into their own TODO rather than stretching this one.

## Testing

- **Unit (Vitest, next to source)**:
  - `src/sketch/profile.spec.js` covers closure detection, self-intersection and
    `regionOf` on these degenerate cases: a zero-length segment, a zero-radius circle,
    coincident polyline points, a hole outside every solid (no effect, no throw), a
    hole equal to its solid (empty region → Done disabled), and nested
    solid-in-hole-in-solid.
  - `src/sketch/resample.spec.js` covers:
    - CW input comes out CCW.
    - The start vertex is stable under a rotated vertex list.
    - A square resampled to 64 points keeps its perimeter within `toBeCloseTo(…, 6)`.
    - N smaller than the vertex count still keeps corners within 0.01 mm.
    - Degenerate inputs are rejected: collinear points, two slices at the same Z.
  - `src/core/kernel/registry.spec.js` gets one case per method, asserting measured
    volume/bounds with explicit tolerances:
    - Linear tube r20/r15 × 30 has volume π(20² − 15²)·30 ≈ 16493.4 mm³, within 1%
      because of circle segmentation.
    - A 360° Revolve of a 10×10 square at x = 10..20 has volume π(20² − 10²)·10.
    - A Loft of two identical squares equals a Linear of the same height.
    - Watertightness via the existing `watertight.js` for every method.
    - Revolve across the axis and Loft with holes both throw with a message.
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
  - `src/sketch/trace.spec.js` works on synthetic bitmaps:
    - A filled 100 × 60 px rectangle traces to 4 vertices after RDP, with corners within
      1 px.
    - A filled disc's traced area is within 1% of πr².
    - A rectangle with two holes yields 1 Solid + 2 Holes.
    - The seed on the background, or a region touching the border, yields nothing plus a
      reason.
    - A light-on-dark input traces the same as dark-on-light.
    - A 1-px speckle is ignored.
  - `src/sketch/simplify.spec.js` covers:
    - Collinear points collapse.
    - Tolerance 0 is the identity.
    - A closed ring stays closed.
    - Fewer than 3 points out is rejected rather than returned.
  - Vertex editing in `profile.spec.js`:
    - Insert at a midpoint.
    - Delete down to 3 points; the 4th → 3rd delete succeeds and 3 → 2 is refused.
    - Convert to outline of a rect/circle/polygon preserves area within tolerance.
  - `document.spec.js`:
    - An `asset.image` record never reaches the kernel (a call count, as ui-020 did).
    - The sketch record plus its asset append as **one** undo step.
    - A slice referencing a missing asset still builds.
  - Update or delete the old-model specs listed under Affected files. Add a
    `document.spec.js` case asserting **no** `sketch.` fold branch remains: a
    `sketch.line` record is rejected at append as an unknown op.
- **E2E: `e2e/sketch-primitive.e2e.js`** navigates to `/` and uses real mouse input via
  `page.mouse`, not synthetic `PointerEvent`s dispatched at the canvas. ui-020 finding
  #1 was invisible to synthetic events. The flow:
  1. Drag Sketch from the Library into the viewport.
  2. Draw two concentric circles and mark the inner one Hole.
  3. Choose Linear, 30 mm, then Done.
  4. Assert one body with a bore: the body count goes up by 1, and the Inspector shows
     the method.
  5. Select it, Subtract it from a Cube, and assert the result is one body.
  6. Edit sketch → Cancel leaves the document unchanged.
  7. Edit sketch → change the height → Done appends exactly one undo step.
  8. A three-slice Loft.
  9. The nav chrome no longer has a Sketch toggle.
  10. **Trace to scale**:
      1. `setInputFiles` loads `e2e/fixtures/trace-bracket.jpg`.
      2. Set scale along 100 mm of the fixture's ruler.
      3. Auto-trace by tapping inside the bracket; assert 1 Solid + 2 Hole outlines.
      4. Delete one vertex and drag one.
      5. Choose Linear at 5 mm, then Done.
      6. Assert the body's bounds match the fixture's true bracket size within 1 mm.
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
- **Acceptance scenarios**:
  - **Rewrite scenario 9** ("Open sketch mode and draw one entity"). The capability it
    describes no longer exists. Replace it with **"Place a Sketch primitive, draw a
    solid and a hole, extrude it, and use it."** Steps: the tube example above, then
    Subtract it from a cube, reload, and confirm it survived. Hand-drive it with a real
    mouse and with touch on a phone viewport, and report PASS/FAIL.
  - **Re-drive**:
    - 1, Two independent primitives: a sketch body plus a cube, both stay visible, and
      the new Library row drag-places.
    - 4, Boolean gating: a sketch body must now count as an operand.
    - 7, Touch-only viewport navigation: the nav chrome loses its Sketch button.
    - 8, Remote-load safety: a file with old `sketch.line` records loads with warnings
      and doesn't halt.
    - 10, Save/reload: the new params shape round-trips through NDJSON.
    - 11, Export: a sketch body exports as a watertight solid.
    - 12, Edit a history step: an Edit sketch mid-history replays downstream records.
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
- **Closed findings to re-run** (this task extends the exact surfaces they were filed
  against):
  - ui-020's three drive-found defects, recorded in ACCEPTANCE scenario 9's Last run:
    (1) the dead pointer strip over a drawn stroke, (2) the Sketch toolbar colliding
    with the orientation gizmo at tablet/phone, (3) the phone Inspector sheet covering a
    fresh stroke (reachable canvas ≥ 69%, same 10×10 grid).
  - `ui-043` (phone toolbar chrome overlap) and `ui-046` (nav chrome folding while a
    sheet is open; Done/Cancel must stay visible).
  - `ui-029`'s silent-data-loss repro: fillet or boolean a sketch body, then confirm
    Edit sketch is disabled with the guard's reason.
