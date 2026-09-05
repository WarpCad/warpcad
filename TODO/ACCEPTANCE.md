# TODO/ACCEPTANCE.md — Fixed Acceptance Scenarios

Written at kickoff (`docs-004`), in the same session as `TODO/ROADMAP.md` and after
the interaction-model walkthrough (`docs/decisions/interaction-model-qa.md`, `ui-001`),
per `CLAUDE.md`'s Verification section. This is a fixed, small set — see "Keep this
list fixed and small" below before adding to it.

## What this file is for

The second attempt shipped an app with passing tests and a clean reachability audit
where adding an item overwrote the previous one, the scene was too dark to see
anything in, sketch mode never opened, and dragging in the viewport only ever rotated
the grid. Every one of those bugs sat underneath green test suites, because a scripted
Playwright spec only proves its own author's click sequence still works — it doesn't
reproduce what happens when a person free-forms the UI.

This file holds a small, fixed set of named end-to-end use cases — 5 to 10 of them —
that get **driven, not scripted**: actually launching the app (the `run` skill) and
interacting with it the way an exploring human would, then reporting PASS/FAIL. Every
`/fix-todo` run re-drives whichever of these scenarios plausibly touch the subsystem it
just changed (see that command's own step on this), and a regression against any one of
them is the loudest signal in the whole process — louder than that task's own green
test suite.

Keep this list fixed and small. It is not a growing backlog — new use cases get added
here only when a whole new capability class lands (e.g. sketch mode, once it exists),
not one per task.

## Writing the scenarios (do this at kickoff)

Model each scenario on the second attempt's own stop note: *"adding a cube and a
sphere and subtracting one from the other."* Concrete, few steps, no scripted
assertions — just what a person would actually do and what they'd expect to see. Cover
at minimum:

- Placing two independent primitives and confirming both remain visible (this exact
  scenario caught a real regression in the second attempt where placing a second body
  silently hid the first).
- A boolean operation between two solids, start to finish.
- Dragging a component/library part in and confirming it renders complete, not partial.
- Opening whatever the 2D-sketch entry point turns out to be, and drawing one entity.
- Navigating the viewport using touch-only input (no keyboard, no mouse) — orbit, pan,
  zoom, and a camera-orientation snap.
- Anything else specific to a capability this project actually commits to that a human
  would try first, in the first five minutes of opening the app.

## Scenario template

```markdown
### <short name>

**Steps**: numbered, concrete, as a human would perform them — not a selector list.
**Expect**: what confirms success, in plain terms a non-developer could judge.
**Last run**: <UTC timestamp> — PASS | FAIL (<note if FAIL>)
```

## Scenarios

Transcribed from `Initial design.md` §9's 8 drafted candidates, per `docs-004`, with
each scenario's Steps rewritten against `docs/decisions/interaction-model-qa.md`'s
confirmed control names/gestures/selection counts (from `ui-001`) rather than §9's
provisional wording. Two scenarios (2 and 4) incorporate the Q&A doc's own flagged
refinements — see each scenario's note.

### 1. Two independent primitives

**Steps**:
1. Open the app to an empty scene.
2. From the Library panel's "Primitives" section, pointer-down on the "Cube" row and
   drag into the viewport; release over the grid to drop it.
3. From the same section, pointer-down on the "Cylinder" row and drag to a different
   point in the viewport; release to drop it.
4. Click empty viewport space to clear selection, then click the cube, then click the
   cylinder.

**Expect**: Both the cube and the cylinder remain visible in the viewport after both
drops (dropping the second body must not hide or replace the first). Clicking each one
individually selects only that item (gizmo and dimension lines attach to whichever was
just clicked, not both at once).

**Last run**: (unset — not yet driveable; `render-001` and `ui-010` don't exist yet)

### 2. Hardware property edit

**Steps**:
1. From the Library panel's "Hardware" section, drag a "Bolt" row into the viewport and
   release to drop it.
2. Click the bolt to select it. Confirm the Inspector panel opens showing the bolt's
   `spec`, `length`, `fit`, and `color` fields alongside the Transform section
   (position X/Y/Z, rotation X/Y/Z).
3. In the Inspector, change `spec` from its default to `M2.5 Socket` and change `fit`
   to `loose`.
4. Confirm the 3D mesh updates to match (visibly different length/diameter).
5. Drag the gizmo's translate handle in the viewport a short distance.
6. While dragging, watch the Inspector's Transform section position fields — confirm
   they update live, in step with the drag, not only after release.
7. Release the drag, then edit one of the Transform section's position fields directly
   (type a new value and press Enter/blur).
8. Confirm the mesh moves to match the typed value.

**Expect**: The mesh visibly changes shape after the spec/fit edit (step 4). The
Inspector's numeric fields track the gizmo drag live during step 6, not just after
release. A direct field edit (step 7) moves the mesh (step 8) — gizmo-drag and
numeric-field edits stay in sync in both directions.

*(Note: steps 5-8 are the gizmo-drag refinement `docs/decisions/interaction-model-qa.md`
control 4 flagged for this scenario — the original §9 draft only checked the
inspector-field-edit direction.)*

**Last run**: (unset — not yet driveable; `ui-013` and `ui-012` don't exist yet)

### 3. Snap-placement of a kit assembly

**Steps**:
1. From the Library panel's "Raspberry Pi" section, drag a "Raspberry Pi 5" board row
   into the viewport and release to drop it.
2. From the same section, drag a "Camera Module V3" row and start dragging it toward
   one of the Pi board's mounting holes.
3. While the drag is still in progress (before release), confirm dashed alignment
   guides appear on the Pi board's faces/edges nearest the camera module's current
   ghost position.
4. Continue the drag until the ghost is within the snap tolerance radius of a mounting
   hole; confirm the ghost visibly snaps to the hole.
5. Release to drop the camera module.

**Expect**: Alignment guides appear on the board during the drag (step 3), the ghost
snaps into place once within tolerance (step 4), and on release the camera module sits
aligned to the board's mounting holes, not at an arbitrary offset position.

**Last run**: (unset — not yet driveable; `ui-013` doesn't exist yet)

### 4. Boolean gating

**Steps**:
1. Drag two solids (e.g. two cubes) into the viewport so they overlap.
2. Click one solid to select it alone. Confirm the Operations toolbar's
   Union/Subtract/Intersect buttons are disabled (dimmed, non-interactive), and confirm
   a tooltip on hover/long-press reads "select 2 or more solids".
3. Shift-click (or platform-equivalent multi-select) the second solid so both are now
   selected. Confirm the toolbar shows a live counter badge (e.g. "2 selected") and the
   Union/Subtract/Intersect buttons become enabled.
4. Confirm the first-selected solid is outlined in the standard selection-highlight
   color and the second-selected solid shows a visually distinct secondary highlight
   (dimmer or differently-hued outline), making the base/subtrahend order visible
   before running Subtract.
5. Click "Subtract".
6. Confirm exactly one resulting solid remains, selected, and the Operations toolbar
   buttons disable again (back to the single-selection state).

**Expect**: Buttons stay disabled at 0/1 selected and enable only at 2+ (step 2-3). The
base/subtrahend visual indicator is visible before Subtract runs (step 4). The result
after Subtract reflects both operands (material removed where the second solid
overlapped the first) and the toolbar disables again once only the result remains
selected (step 6).

*(Note: step 4 is the Subtract base/subtrahend indicator check
`docs/decisions/interaction-model-qa.md` control 5 flagged for this scenario — the
original §9 draft only checked count-gating, not the order indicator.)*

**Last run**: (unset — not yet driveable; `ui-014` doesn't exist yet)

### 5. Hidden-part boolean (bolt tap-clearance)

**Steps**:
1. Drag a case-shell solid into the viewport.
2. Drag a "Bolt" into the viewport, positioned so its hidden `tap` clearance geometry
   overlaps the shell (visually, the bolt's head/thread mesh will appear to just touch
   or slightly penetrate the shell wall).
3. Select both the shell and the bolt (per scenario 4's multi-select gesture).
4. Click "Subtract" (shell selected first/as base, per scenario 4's ordering).

**Expect**: A hole appears in the shell sized to match the bolt's hidden tap-clearance
diameter (the fastener's thread-clearance geometry), not the bolt's visible
head/thread mesh diameter — confirming the hidden geometry, not just the rendered
mesh, drives the boolean result.

**Last run**: (unset — not yet driveable; `ui-014` and a case-shell primitive/composite
don't exist yet)

### 6. Group vs. sub-part selection

**Steps**:
1. Place a Raspberry Pi 5 board, a Camera Module V3 (snapped per scenario 3), and a
   display/screen part in the viewport.
2. Select all three (per scenario 4's multi-select gesture) and click "Combine into
   group" in the Operations toolbar.
3. Click empty viewport space to deselect, then click anywhere on the combined group's
   mesh.
4. Confirm the gizmo and all three dimension lines cover the whole assembly's combined
   bounding box, and the Inspector shows no per-item fields (multi-part group state).
5. With the group still selected, click a second time, now landing specifically on the
   camera module's own mesh within the group.
6. Confirm the gizmo, dimension lines, and Inspector re-target to just the camera
   module's own bounding box and param schema, and the Inspector header shows a
   breadcrumb ("Group ▸ Camera Module").
7. Click the "Group" segment of the breadcrumb.

**Expect**: The first click on an unselected group always selects the whole group
first (step 4), never jumping straight to a sub-part. A second, distinct click on a
member mesh narrows to that sub-part (step 6), with the breadcrumb showing the pick
depth. Clicking the breadcrumb's "Group" segment (step 7) steps back up to whole-group
selection.

**Last run**: (unset — not yet driveable; `ui-015` and `ui-016` don't exist yet)

### 7. Touch-only viewport navigation

**Steps**:
1. Open the app at the iPad reference viewport (820×1180), using touch input only — no
   keyboard, no mouse.
2. Using the viewport's navigation chrome (not a keyboard shortcut), orbit the camera
   around the scene.
3. Using the same chrome, pan the camera.
4. Using the same chrome, zoom in and out.
5. Tap the orientation gizmo (view cube or axis triad) to snap the camera to a
   standard view (e.g. Top or Front).

**Expect**: Orbit, pan, and zoom are all reachable and functional via on-screen chrome
alone, with no dependency on keyboard or mouse input. Tapping the orientation gizmo
snaps the camera to the corresponding standard view.

**Last run**: 2026-09-05 21:08 — PASS (hand-driven against `render-001`'s viewport at
820×1180 in WebKit — the engine an iPad actually runs — touch input only, in both light
and dark colour schemes. Orbit, pan and zoom were each reached through the on-screen
navigation chrome with no keyboard or mouse; tapping the gizmo's `Z` cap snapped to the
top view and `−Y` to front, both preserving zoom and pan position. Beyond the scenario's
own steps: a one-finger diagonal drag, a vertical-only drag (the gesture the previous
attempt's iPad bug swallowed) in both directions, a two-finger pinch, eight rapid taps
with no settle time, and a drag ending on top of the chrome overlay all behaved; the page
never scrolled or overflowed in either axis and the console stayed clean. **The drive
found one real defect the test suite could not see**: the 3D scene was hardcoded dark
while the DOM chrome followed `prefers-color-scheme`, so in light mode the app rendered
light chrome around a dark canvas. Fixed in this task — the scene palette now follows the
colour scheme, with unit and e2e coverage — and re-driven green in both schemes.)

### 8. Remote-load safety

**Steps**:
1. Load a project via a `#/gist/<id>`-style NDJSON URL.
2. Confirm the document replays into the expected scene.
3. Load a second NDJSON document containing one deliberately malformed line (a bogus
   `op` value).
4. Confirm the bad record is skipped and reported (e.g. surfaced as a load warning),
   never executed, and that the rest of the document still replays correctly.

**Expect**: A well-formed remote document loads and renders as expected (step 2). A
malformed record in an otherwise-valid document is skipped and reported rather than
executed or halting the whole replay (step 4).

**Last run**: 2026-09-05 — PASS (already covered by an automated test, not yet
hand-driven through the UI: `core-002`'s `src/core/replay.spec.js`, the test named
"remote-load safety (Initial design.md §9 scenario 8): a bogus op never executes, and
the rest of the document still loads" at line 233, passes against the real
`core-001` kernel registry. Per `TODO/ROADMAP.md`'s own instruction, recorded here as
already-passing rather than left blank — the UI-driven walkthrough above still applies
once a loader UI exists to drive it through, at which point this should be re-run
by hand and this line updated.)
