---
title: Docs media — History (timeline) panel, rollback, step editing, undo and redo
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007]
status: open
---

## Goal

"History" is the least self-explanatory panel: a list of rows that you can click to go back
in time and edit. It needs motion — click an earlier step and watch the model rewind. Embed
in `docs/timeline.md` and `docs/undo-redo.md`.

## Interaction model

n/a — documents existing controls.

## Documentation

- **Page** — `docs/timeline.md`, `docs/undo-redo.md` (update both).
- **Example** — "Place a cube, then a cylinder, then Subtract. Click the *Cube 1* row in
  History: the model rewinds to just the cube. Edit its size to 30 mm: the cylinder and
  subtract replay on the new size."

## Media inventory

Specs: `e2e/docs/timeline.docs.js`, `e2e/docs/undo-redo.docs.js`.

| Name | Kind | Shows | Page |
|---|---|---|---|
| `timeline-panel` | still | History panel with five rows (place, place, boolean, mirror, colour), open beside the viewport, cropped (`ui-032`). | timeline |
| `timeline-toggle` | still | The toggle that opens/closes the panel, cropped. | timeline |
| `timeline-rewind` | movie | Click an earlier row; the viewport rewinds; click the last row to return. | timeline |
| `timeline-edit-step` | movie | Edit an earlier step's parameter; later steps replay (`data-004`, scenario 12). | timeline |
| `timeline-boolean-row` | still | A boolean row naming both operands (`core-036`). | timeline |
| `timeline-strips` | still | Row strips/badges — whatever `TimelineStrips` shows (read the component before captioning). | timeline |
| `undo-redo-buttons` | still | The history controls, enabled/disabled states, cropped. | undo-redo |
| `undo-redo-roundtrip` | movie | Place → move → undo twice → redo once; viewport follows. | undo-redo |
| `undo-param-edit` | movie | A parameter edit is **one** undo step (`ui-044`). | undo-redo |

## Affected files

- two specs, two docs pages, `docs/screenshots/*`, `docs/media/*`.

## Proposed fix

Do not document a timeline capability (suppress, reorder, reparent) the UI does not have —
`data-006` (timeline tail reparenting) is open. Read `TimelineRow.vue` and caption only what
exists. Keyboard shortcuts for undo/redo (`Cmd/Ctrl+Z`, `Shift+Cmd/Ctrl+Z`) go in the page
text; the movie uses the buttons *and* a keypress beat.

## Effort

M

## Testing

- Movies assert row count and body count at each beat.
- Engines: Chromium only. Viewports: laptop (timeline at phone width is `docs-018`).
- `TODO/ACCEPTANCE.md`: scenario 12 (edit a step mid-history) — drive by hand after
  landing. Closed findings: re-run `data-003` (undo scoped by transaction origin) and
  `ui-044` repros.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
