---
title: Replace free-standing Sketch mode with a Sketch primitive that always extrudes to a solid, with photo tracing to scale
category: sketch
kind: feature
priority: high
model: opus
milestone: M8
depends: []
status: done
---

> **What actually shipped (2026-10-02, unattended `/run-todos`)** — steps 1-3 of "Suggested
> order inside the task": `primitive.sketch` (profile model, Linear / Revolve / Helical /
> Outline / Loft, `resample.js`), the editor (Line / Rectangle / Circle / Polygon,
> Solid/Hole, Slices, Extrude ▾, Done/Cancel, worker preview), Edit sketch, and the old
> free-standing path removed. **Steps 4-6 were split out verbatim** into `TODO/sketch-002`
> (vertex editing), `TODO/sketch-003` (reference image, scale, sanitization) and
> `TODO/sketch-004` (auto-trace), as this file's own Effort section asked; the moved text is
> replaced below by pointers. Where reality differed from this spec:
>
> - **Old `sketch.line` records do not reach `replay.js`.** The app's real load path
>   (`parseProject` → `loadEntries`) *refuses the whole file* on an unknown op, so simply
>   deleting the fold branch would have made every autosave holding an old line fail to
>   restore. `src/core/project.js` now has an explicit `RETIRED_OPS` filter: each retired
>   record is dropped with a `LoadWarning`, the state line is kept consistent (suppressed
>   ids, rollback marker), and `persistence.js` shows "Opened X, but skipped N steps (ids):
>   sketch lines are no longer supported — redraw them in a Sketch primitive" on the chip.
> - **No `paramEdit.js` read-only guard exists any more** (`data-007` moved primitives to
>   the replace path). Edit sketch → Done is one `revise` of `slices` + `extrusion` (new
>   `useParamCommands.setParams`), so a later move or fillet is *re-applied*, not frozen —
>   the ui-029 repro now checks "nothing silently dropped" (driven: PASS).
>   `paramEditRecord` learned structured params (deep finite check, deep equality).
> - **Region semantics:** outlines are applied largest-area first (solid unions, hole
>   subtracts) — `union(solids) − union(holes)` for every ordinary case, and a solid drawn
>   inside a hole stays an island (the "nested solid-in-hole-in-solid" test).
> - **Loft resampling keeps every corner**; a requested resolution below a ring's vertex
>   count is raised, never honoured by dropping corners (this file's "N smaller than the
>   vertex count still keeps corners" read that way). Outlines over 256 points are refused.
> - **Outline's "wall" is total thickness**: `extrudeRectangular` grows `size` on *each*
>   side, so the registry passes `wallMm / 2` (measured 2× volume otherwise).
> - **Reachable canvas ≥ 69 %** holds for the editor at rest (phone 76 %, tablet 84 %)
>   by folding the nav chrome to ✥ while editing on a narrow viewport (an extension of
>   ui-046 — UNCONFIRMED). With a Slices/Extrude sheet open the phone measures 47-57 %;
>   what is asserted is that the drawing area round the origin stays 100 % reachable.
> - **Not built (UNCONFIRMED defaults left out):** double-click/double-tap a body to Edit
>   sketch; on-canvas point handles (→ `sketch-002`). The tablet's narrow viewport needed a
>   CSS **container** query (`.viewport` is now `container: viewport / inline-size`), since
>   window media queries see 820 px there.
> - **Extra files:** `src/core/kernel/sketchFrame.js` (lineage → frame matrix),
>   `render/pick.js`'s `projectToSketchPlane`, `annotate.js`'s `updateSketchPath`, a `build`
>   job kind in the evaluation worker, `components/sketch/SketchPanelSheet.vue` +
>   `SketchProfileFields.vue`, `components/inspector/SketchBodyFields.vue`, Undo/Redo
>   disabled while editing (`HistoryControls.vue`), `data-editor` on Library rows, and the
>   `primitive.sketch` digest in the legacy-tessellation golden (render-002's precedent).
> - **Interaction model section 7** was rewritten from this file's answers but **not
>   confirmed with the user** (unattended run); every default is marked UNCONFIRMED there
>   and listed in `TODO/VERIFY.md`.
> - **Found and filed, not caused here:** a fillet on any hexagonal rim exports 12 open
>   edges (`primitive.hexagon` too) → `TODO/io-006`. Firefox cannot launch in this sandbox
>   (TROUBLESHOOTING 2026-09-17), and the user's working-copy `playwright.config.js` comments
>   it out; confirmed by launch failure on this spec and on `primitive-placement.e2e.js`.

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

A slice can also carry a **reference image** to trace over — the user's photograph-a-
broken-part case. **Moved to `TODO/sketch-003`** (reference image, scale, sanitization) and
`TODO/sketch-004` (auto-trace), verbatim; see the note at the top of this file.

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

**Moved, verbatim, to `TODO/sketch-003`** (the whole section), with its vertex-editing
bullets also copied into `TODO/sketch-002` and its auto-trace bullets into
`TODO/sketch-004`.

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
- **Page**: new `docs/sketch-tracing.md`, **Tracing a photo**, and **Example 3** and the
  **Accuracy tips** — **moved, verbatim, to `TODO/sketch-003`** (Example 3 also copied into
  `TODO/sketch-004`).

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
- Reference-image files (`imageAsset.js`, `calibration.js`, `trace.js`, `simplify.js`,
  `image.worker.js` + `imageClient.js`, the `asset.image` record, `replay.js`'s load
  warning, `referenceImage.js`, the three `components/sketch/` image/vertex components,
  the generated fixtures, and the `hostedBackend.js` > 1 MB check) — **moved, verbatim,
  to `TODO/sketch-003`** (with `simplify.js`/`VertexHandles.vue` copied into
  `TODO/sketch-002` and `trace.js`/the tracing worker into `TODO/sketch-004`).
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

### Reference images: storage and sanitization / Auto-trace pipeline

**Moved, verbatim**: the record shape, threat model, engine note and library decision to
`TODO/sketch-003`; the auto-trace pipeline to `TODO/sketch-004`.

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
  - The image, calibration, trace and simplify specs, vertex editing in
    `profile.spec.js`, and the `asset.image` cases in `document.spec.js` — **moved,
    verbatim, to `TODO/sketch-003`** (image, calibration, asset), **`TODO/sketch-002`**
    (simplify, vertex editing) and **`TODO/sketch-004`** (trace).
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
  10. **Trace to scale** and 11. **Hostile project load** — **moved, verbatim, to
      `TODO/sketch-003`** (load, scale, hostile load) and **`TODO/sketch-004`** (the
      whole trace-to-scale case).
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
  - **Scenario 14, "Trace a photographed part to scale and print it"**, and the
    hostile-fixture re-drive of scenario 8 — **moved, verbatim, to `TODO/sketch-004`** and
    **`TODO/sketch-003`**. (14 is already taken by "Delete a body, bring it back, reload";
    it needs the next free number.)
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

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
