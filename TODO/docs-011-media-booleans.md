---
title: Docs media — Union, Subtract, Intersect and the selection-count gate
category: docs
kind: feature
priority: high
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007]
status: open
---

## Goal

Booleans are the feature people most want to *see work*. Record each operation as a
before → click → after movie, show the disabled-until-two-selected gate as stills, and show
that operand **order** matters for Subtract. Embed in `docs/booleans.md`.

## Interaction model

n/a — documents existing controls.

## Documentation

- **Page** — `docs/booleans.md` (update).
- **Example** — "Place a cube and a cylinder overlapping. Click the cube, then
  Shift-click the cylinder. Press **− Subtract**: the cylinder is removed from the cube,
  leaving a round hole."

## Media inventory

Spec: `e2e/docs/booleans.docs.js`. Fixture: a cube and an overlapping cylinder (and a sphere
for intersect).

| Name | Kind | Shows | Viewport |
|---|---|---|---|
| `operations-toolbar-disabled` | still | Toolbar with nothing selected: ∪ − ∩ dimmed, legend explains why. | laptop |
| `operations-toolbar-one` | still | One solid selected: still dimmed, count readout says 1. | laptop |
| `operations-toolbar-enabled` | still | Two selected: ∪ − ∩ enabled, operand base/rest labelled. | laptop |
| `boolean-union` | movie | Select two → press ∪ → one merged solid; History gains a row. | laptop |
| `boolean-subtract` | movie | Cube minus cylinder → hole. Hold the result frame. | laptop |
| `boolean-subtract-order` | movie | Same two solids, picked in the opposite order → the *other* result (cylinder minus cube). Mirrors the load-bearing order test in `boolean-operations.e2e.js`. | laptop |
| `boolean-intersect` | movie | Cube ∩ sphere → the rounded common volume. | laptop |
| `boolean-result` | still | Final frame of subtract with the hole in an orbited view, so the cut is visible. | laptop |
| `boolean-subpart-operand` | movie | Drill into a composite's named part (a bolt's shaft) as a boolean operand (`ui-040`). | laptop |
| `boolean-bolt-hole` | movie | The classic: subtract a cylinder from a plate to make a mounting hole. Can double as the README tour step. | laptop |

## Affected files

- `e2e/docs/booleans.docs.js`, `docs/booleans.md`, `docs/screenshots/*`, `docs/media/*`.

## Proposed fix

Selection uses real clicks on projected body positions (as the existing spec does) so the
movie shows the selection highlights. Pause a beat after each click and after the result so
a GIF reader can follow. The kernel runs in a worker — wait for the worker-idle signal before
taking the result frame, or the "after" will be the old mesh.

## Effort

M

## Testing

- Each movie asserts the document's body count / History row after the click, and the order
  movie asserts the two results are *different* (compare scene bounding boxes), so it cannot
  pass by recording the same result twice.
- Engines: Chromium only. Viewports: laptop (phone toolbar placement: `docs-018`).
- `TODO/ACCEPTANCE.md`: scenario 4 (Boolean gating) and 5 (hidden-part boolean) — drive by
  hand after landing; the movies are scripted versions of them, not substitutes.
  Closed findings: re-run `core-036` (boolean history row omits base operand) — the History
  row in the union/subtract movies must list *both* operands.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
