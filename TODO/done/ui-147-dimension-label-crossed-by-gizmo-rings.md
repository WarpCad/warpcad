---
title: Keep a dimension label's digits clear of the gizmo rings and arrowheads that cross them
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, split from ui-130 on 2026-11-18
depends: []
status: done
---

> **What shipped (2026-11-20):** `updateDimensionAnnotation` takes the gizmo as an optional last argument (`overlaySync.js` passes it). A label whose `ui-130` spot is clear does not move; otherwise it tries, in order, the line's outward side, the solid's side, further out, each slid along the line, then 5 rings of 12 positions (20 to 84 px) around the line's midpoint, and takes the first that keeps 4 px clear of every ring (56-segment polyline) and arm; with none free it takes the spot touching the fewest segments. The label was not drawn above the gizmo layer. Everything is scalars and typed arrays; the per-frame label string and edge-pair destructuring allocations were removed too. A ring bigger than the viewport (a body filling the screen) can still cross a label.

## Problem

`ui-130` held dimension labels inside the viewport but not off the gizmo's rotate rings. On a cylinder tipped 60° both panel readers saw a ring,
arrowhead or dashed guide run through the digits of the *50 mm* and *40 mm* labels at phone width, and less clearly at laptop. The label has a
halo, which helps, but a ring drawn above it still cuts the number.

## Affected files

`src/render/annotate.js` (`updateDimensionAnnotation`, and the gizmo ring geometry it would need), `src/components/viewport/DimensionLines.vue`,
`src/components/viewport/Gizmo.vue`.

## Proposed fix

Give the label placer the ring's screen path (an ellipse per axis) and try the label's two outward positions and a slide along the line, taking
the first that does not meet a ring; or draw the label above the gizmo layer. Keep the per-frame cost allocation-free (`CLAUDE.md`, Performance).

## Effort

M.

## Testing

- Unit tests over an orbit sweep on a 390 px viewport: no label box meets a ring ellipse, and a label already clear does not move.
- An app-level `*.e2e.js` at `/` at all three viewports; re-run `ui-130`'s label sweep and `ui-023`'s tipped-cylinder drive.

## Interaction model

Precondition: a body is selected, so its dimensions and rings show. Feedback: every label's digits are readable.

## Documentation

None unless the label position is described in `docs/selection-and-inspector.md`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
