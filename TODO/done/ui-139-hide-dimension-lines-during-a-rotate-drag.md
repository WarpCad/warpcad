---
title: Hide the dimension lines while a rotate-ring drag is in progress
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-17 from OWNER.md Q9 (VERIFY.md ui-012 #1)
depends: []
status: done
---

> **What shipped (2026-11-19):** `createOverlaySync` hides all three dimension annotations while `gizmoDrag.state` is an active, moved rotate drag, so the lines vanish on the first ring movement and return on release at the committed turned bounds; a press that never moves, and every translate drag, keep them. The fix is in `src/render/overlaySync.js` only, because the gizmo-drag state is already visible there; `useSelectedBody.js` is unchanged. Tests: two `e2e/gizmo-transform.e2e.js` cases and an `overlaySync.spec.js` case. Docs sentence in `docs/selection-and-inspector.md`.

## Problem

During a rotate-ring drag the three dimension lines stay on the body's unrotated, axis-aligned box and jump to
the turned bounds only on release (`src/composables/useSelectedBody.js` explains why: true bounds of a partly
turned solid need the kernel per frame, which the drag preview avoids). The numbers are right on release, but
mid-drag the lines annotate a box that is no longer there. Cold readers split (`testing-029`, 2026-11-14): one
found it misleading. The owner chose to hide them while rotating (OWNER.md Q9, 2026-11-17).

## Affected files

- `src/composables/useSelectedBody.js` (the drag-preview bounds)
- `src/render/overlaySync.js` (dimension-line visibility; moved out of `Viewport.vue` by `ui-108` slice 1)

## Proposed fix

While a rotate preview is active, hide the dimension lines. Show them again on release, at the turned bounds.
Translate drags keep their lines (they already track exactly). Do not measure the turned solid per frame.

## Effort

S.

## Testing

- e2e: start a rotate-ring drag on a Cube, assert the dimension lines are hidden mid-drag and visible after
  release with the turned bounds; a translate drag keeps them visible throughout. All three engines (gizmo
  drag math, WebGL). Phone, tablet and laptop projects.
- Re-run VERIFY.md `ui-012` #1; set it `OK`.
- Acceptance scenarios: 4 (gizmo/field sync). Closed finding regression: `ui-012`'s live-update repro
  (Position fields change during a drag).

## Interaction model

No new control. **Feedback** during a rotate drag: no dimension lines until release. Small-screen behaviour:
same as desktop.

## Documentation

- **Page**: the move-and-rotate docs page: one sentence that the size lines hide while rotating and come back
  on release. No new media.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
