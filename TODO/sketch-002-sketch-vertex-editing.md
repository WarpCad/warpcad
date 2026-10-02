---
title: Sketch vertex editing — move, add and delete points, Simplify, Convert to outline
category: sketch
kind: feature
priority: medium
model: opus
milestone: M8
depends: [sketch-001]
status: open
---

> **Split out of `TODO/sketch-001` (2026-10-02).** sketch-001's own Effort section said
> "If the first run finishes steps 1-3, split steps 4-6 into their own TODO rather than
> stretching this one", and the unattended `/run-todos` run did exactly that. Everything
> below the line marked *verbatim* is copied word for word from sketch-001's spec (as
> committed in `be36d6d`); the retired file is `TODO/done/sketch-001-sketch-primitive-extruded-solid.md`.
> Read its "What actually shipped" note first: a few things the spec assumed changed while
> steps 1-3 were built, and the ones that bear on this task are listed under "What changed
> since this was written" below.

## Goal

Step 4 of sketch-001's "Suggested order inside the task": **vertex editing (move, add,
delete, Simplify, Convert to outline). This is useful without images and is a
prerequisite for cleaning up a trace.** Today an outline's points can only be set through
the shape-level numbers in the Inspector (a circle's radius, a rectangle's width); a Line
outline's points can't be moved at all once drawn, and a mistake means Delete outline and
redraw.

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

## Interaction model (verbatim from sketch-001 — the vertex-editing bullets)

From sketch-001's "Reference image, scale calibration, vertex editing and auto-trace"
section ("These are drafted from the user's use case above. Every item not quoted from it
is *(default — confirm)*."):

- **Precondition**:
  - *Vertex editing*: exactly one `polyline` profile selected. Rectangle, Circle and
    Polygon profiles have no free vertices. A **Convert to outline** button turns the
    selected one into an equivalent closed polyline so its vertices can be edited.
  - *Delete vertex*: a vertex is selected and the polyline has more than 3 vertices.
    Otherwise the button is disabled with the reason "An outline needs at least 3
    points".
- **Trigger**:
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
  - The vertex under the pointer highlights. A selected vertex shows its X/Y (mm) in the
    profile panel as editable fields.
- **Selection count**: Set scale, Auto-trace and the image controls act on the active
  slice. Vertex tools need exactly one selected polyline.
- **Small-screen behavior**: […] Vertex handles are 44 px touch targets drawn as smaller dots.
  Midpoint handles hide on segments shorter than 2 × 44 px on screen, so a dense traced
  outline doesn't become a wall of handles. The fix there is zooming in or Simplify.

Also from sketch-001's main Interaction model, the selection-response line this extends:

  - Inside the editor, clicking a profile selects it (start/end/length for a segment,
    centre/radius for a circle, width/height for a rectangle, plus the Solid/Hole role),
    with ui-020's endpoint and handle dragging and **no** 3D gizmo.

## Documentation

Not specified by sketch-001 for this step on its own (its Example 3 covers vertex cleanup
as part of tracing — see `TODO/sketch-004`). Proposed for this task: add an **Editing an
outline's points** section to `docs/sketch-mode.md`, replacing that page's "Not available
yet" line about points, with a concrete example — "Draw a rectangle, select it, tap
**Convert to outline**; drag the top-right corner's handle up 10 mm; drag the midpoint
dot of the top edge to add a peak; tap the bottom-left corner and **Delete vertex**; the
Extrude preview follows each change."

## Affected files (verbatim from sketch-001)

  - `src/sketch/simplify.js`: Ramer–Douglas–Peucker with a tolerance in mm. The profile
    panel's Simplify uses it too.
  - […] `src/components/sketch/VertexHandles.vue` (vertex and midpoint handles; extend
    `SketchStrokes.vue` instead if that ends up smaller).

And `src/sketch/profile.js` (vertex insert / delete / move / convert-to-outline, pure, next
to the existing draft edits), `src/sketch/entity.js` (`lengthOf`/`isDegenerate`, kept for
this), `src/stores/sketchEditor.js` (a selected-vertex index), the Inspector's
`SketchProfileFields.vue` (vertex X/Y fields, Delete vertex, Simplify, Convert to outline).

## Proposed fix (verbatim from sketch-001)

From "Suggested order inside the task":

4. Vertex editing (move, add, delete, Simplify, Convert to outline). This is useful
   without images and is a prerequisite for cleaning up a trace.

## Effort

M. The handles are a second pointer-capturing overlay on the canvas — re-run ui-020
finding #1 (the dead strip) against it, since that defect was exactly a hit target over the
canvas swallowing the draw gesture.

## Testing (verbatim from sketch-001)

  - `src/sketch/simplify.spec.js` covers:
    - Collinear points collapse.
    - Tolerance 0 is the identity.
    - A closed ring stays closed.
    - Fewer than 3 points out is rejected rather than returned.
  - Vertex editing in `profile.spec.js`:
    - Insert at a midpoint.
    - Delete down to 3 points; the 4th → 3rd delete succeeds and 3 → 2 is refused.
    - Convert to outline of a rect/circle/polygon preserves area within tolerance.

- **E2E**: extend `e2e/sketch-primitive.e2e.js` with real `page.mouse` drags of a vertex
  handle and a midpoint handle, and a Delete vertex refused at 3 points, at all three
  viewports; and a press on an outline's stroke **between** handles must still draw (ui-020
  finding #1).
- **Acceptance**: re-drive scenario 9 (the sketch scenario) and scenario 1.
