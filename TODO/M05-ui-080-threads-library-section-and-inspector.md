---
title: Threads section in the Library, drag-to-place, and an Inspector with pitch/hand/clearance fields
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M5
depends: [core-074, ui-052]
status: open
---

## Goal

`core-074` can build a real helical thread, but nobody can reach it. "Done": a **Threads**
section in the Library lists the thread parts; dragging one into the 3D view places it;
selecting a placed thread shows its diameter, pitch, length, starts, hand, profile and
clearance in the Inspector and rebuilds the solid as they are edited. A person can make a
threaded rod, a threaded hole cutter, a nut, or a matching lid and jar neck — not just a bolt
or screw — and subtract the cutter from their own body.

## Interaction model

- **Precondition**: nothing for placing (creation, `operandCount: 0`). Editing needs exactly
  one thread part selected; with a non-thread or several selected the thread fields are
  absent, not disabled-and-empty. Subtracting the hole cutter is the existing Subtract tool
  (exactly two solids selected) — this task adds no new operation.
- **Trigger**: the Library panel gets a **Threads** section via `SECTION_DEFINITIONS`
  (`src/core/library.js` is the one place; no component names a thread kind). Rows:
  *Threaded rod, Thread hole (cutter), Threaded nut, Rod + hole pair*. Dragging a row arms
  placement mode: the ghost follows the pointer (mouse or touch) and commits on release as for
  every other Library row (`ui-030`/`ui-031`) — never a fixed-origin insert.
- **Feedback**: the part appears under the pointer, axis up, flat on the grid; it becomes the
  selection; History reads `Threaded rod M6×1 · 20 mm`; the Inspector opens. The hole cutter
  renders as a translucent `tap`-style solid so it reads as "tool", not "body".
- **Selection response**: Inspector fields `Size` (a Type/Size picker: M3…M24 coarse/fine and
  UNC/UNF, plus *Custom*), `Major Ø`, `Pitch`, `Length`, `Starts`, `Hand` (right/left),
  `Profile` (ISO / Acme / Square / Buttress), `Clearance` (shown only on the hole and the
  pair), `Lead-in chamfer`. Read-only derived numbers from `core-074`'s maths, never recomputed
  in the component: minor Ø, lead (pitch × starts), thread depth. A **facet-count readout** with
  a warning past a stated threshold, because a fine thread is heavy. Edits go through `ui-052`'s
  composite-params path so dependants are repaired, not orphaned. The move/rotate gizmo
  attaches as for any body.
- **Selection count**: n/a for creation; editing is exactly one selected.
- **Small-screen behavior**: Threads is a collapsible group in the phone Library sheet; the
  Inspector is the existing bottom sheet; every row and field has a 44 px tap target; `Starts`
  is a stepper; the Size picker is a native select at phone width.
- Row `data-testid`s follow the registry (`library-row-thread.rod`, …); each field carries
  `data-testid="thread-<param>"`.

## Documentation

- **Page**: new `docs/threads.md` (+ sidebar entry per `.claude/commands/docs.md` Step 4), and
  a one-line pointer from the fasteners page saying when to use a real thread rather than a
  bolt's placeholder.
- **Example** (verbatim steps, millimetres): "Open the Library, expand **Threads**, drag
  **Threaded rod** into the view and release. In the Inspector pick **M8 coarse** (pitch
  1.25 mm), set **Length** to 25 mm. Drag **Thread hole (cutter)** next to it, set the same size
  and **Clearance** 0.2 mm, then select a block and the cutter and press **Subtract**. Print
  both: the rod screws into the hole." Include the print-tolerance note and why Clearance only
  applies to the internal side.
- **Media**: `e2e/docs/threads.docs.js` — a still of the Inspector for a placed rod
  (`docs/screenshots/threads-inspector.png`) and a short movie of the drag-in
  (`docs/media/threads-place.gif`), both embedded in `docs/threads.md`.

## Affected files

- `src/core/library.js` (`SECTION_DEFINITIONS`, `ROW_ORDER`), `src/components/inspector/
  ThreadParams.vue` (new; the view carries layout only), `src/components/inspector/
  InspectorPanel.vue` (mount), `src/components/viewport/` (ghost size from the registry's
  `ui.defaults`), `docs/threads.md`, `e2e/threads.e2e.js`, `e2e/docs/threads.docs.js`.

## Effort

L.

## Testing

- **A real `e2e/threads.e2e.js` that navigates to `/`**: drag *Threaded rod* in, assert it renders
  and is selected, change Pitch and Length and assert the derived Lead and the bounding box agree
  to 0.01 mm, place a *second* thread part and confirm **both remain** (the "adding one overwrote
  the previous" failure `SECOND-ATTEMPT.md` records), then subtract a hole cutter from a block
  and confirm the result.
- Runs at **phone, tablet and laptop** with a snapshot at each, and on **Chromium, Firefox and
  WebKit** — it touches the WebGL viewport, the kernel worker and persistence (a save/reload
  round-trip with a thread in the project).
- **Acceptance scenarios to re-drive**: 1 (two bodies remain), 2 (subtract), 3 (library drag),
  7 (touch-only navigation with a thread in the scene), 10 (save and reload). **Closed findings
  re-run**: `ui-053`'s repro (first library drag after Escape is ignored) on a *Threads* row,
  `ui-072`'s repro (the second phone Library drag) at 390 px, and `core-064`'s repro.
- Unit spec for the section ordering in `library.js`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
