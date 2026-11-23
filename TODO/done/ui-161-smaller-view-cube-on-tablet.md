---
title: Make the view cube smaller on a tablet, now that Views reaches every face
category: ui
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, requested by the owner 2026-11-23
depends: []
status: done
---

> **Shipped 2026-11-23:** as proposed (64 px side, 111 px box). Home and Views stay in a row under the box at the full tap height (the box's empty corners were not used). The landscape case is in `e2e/orientation-tap.e2e.js`. Scattered-tap wrong-face rate measured 11.3 % (chromium-tablet) and 9.3 % (webkit-tablet).

## Problem

The owner, 2026-11-23, on an iPad in Safari (landscape, about 1194×834 CSS px, v1.25.0 `9fcb8b3`): "on my ipad, the cube takes up
a LOT of room. … It would be nice to make it smaller (especially now that it has the views popup)."

`ui-158` sized the cube for a fingertip. On a coarse pointer at 600 px and wider, `OrientationGizmo.vue` sets
`--layout-cube-side: 96px` in a `--layout-cube-box: 168px` box (the `@media (pointer: coarse) and (min-width: 600px)` block), so a
scattered tap at a face's centre lands on that face 99 times in 100. Add **Home**, **Views** and the `az · el` caption and the whole
block in the owner's screenshot is about 165×225 CSS px. That is the biggest single piece of chrome over the 3D view, larger than the
model it is orienting.

The 99-in-100 target made sense when the cube was the only way to snap. It isn't any more: **Views** opens the six-view grid at
every width, with 68×64 px cells and no gaps, so it is an exact path to any face. The phone already relies on this. Its 55 px cube
misfires about 12 % of scattered taps (`orientation-tap.e2e.js`, against a 20 % bound), and `ui-158` accepted that because Views is
there. The owner is asking for the same trade on the tablet.

## Interaction model

- **Precondition** — nothing (unchanged from `ui-158`).
- **Trigger** — unchanged: a face of the cube, **Home**, **Views**.
- **Feedback** — unchanged. The only change is the footprint.
- **Placement** — n/a.
- **Selection response** — n/a.
- **Selection count** — n/a.
- **Small-screen behavior** — this task *is* the small-screen behaviour. Target sizes below. Laptop (fine pointer) and phone are
  unchanged at 55 px.

## Documentation

- **Page** — `docs/viewport-navigation.md`, the "In a narrow window…" paragraph and the view cube steps, and `docs/mobile.md`
  where it describes the tablet cube. Say that a face is a quick target and **Views** is the exact one.
- **Example** — "On an iPad, tap the cube's white top face to look straight down. If your tap lands on the neighbouring face, tap
  **Views** under the cube and choose **Top** from the grid. The grid's buttons are large and never miss."
- **Media** — refresh `docs/screenshots/viewport-chrome-compact.png` (and `.dark`), `app-overview-tablet`, and
  `operations-toolbar-tablet`, plus any other still that frames the tablet's top-right corner. Use a scoped run of the
  `e2e/docs/*.docs.js` files that produce them. `docs:gifs` rewrites every GIF, so never use it for this.

## Affected files

- `src/components/viewport/OrientationGizmo.vue` — the coarse-pointer ≥ 600 px block (`--layout-cube-side`, `--layout-cube-box`,
  `--layout-gizmo-btn-height`), and the doc comment above it that gives the 99-in-100 reasoning.
- `e2e/orientation-tap.e2e.js` — the tablet scattered-tap bound.
- `e2e/panel-tiers.e2e.js` — the gizmo-size assertions `ui-158` moved.
- Screenshot baselines that frame the tablet's top-right corner.

## Proposed fix

1. **Side 64 px, box 111 px** (√3 × 64) on a coarse pointer at 600 px and wider, down from 96 / 168. That is about 44 % less area.
   A corner-on face's short diagonal is 0.816 × 64 ≈ 52 px, still above the 44 px tap floor. This is a reversible default taken
   while writing the task. If the owner wants it smaller still, 55 px (the phone's size) is the floor that keeps 45 px.
2. **Tighten the block around the cube.** Look at the owner's screenshot. Home and Views sit under the box, and the caption sits
   under them. Check whether the box's empty corners (the box is sized for the cube's widest silhouette, and at the Home view the
   silhouette is a hexagon, so its corners are empty) can take Home and Views without overlapping a face at any orientation. If they
   can't, leave the row under the box but keep the buttons at `--tap` height on coarse pointers.
3. **Tablet scattered-tap bound.** Change it from 3 % to the phone's 20 % and record the measured rate on chromium-tablet and
   webkit-tablet in the commit. The spec's comment should say Views is the exact path, as the phone's does.
4. **Landscape iPad.** The owner uses the iPad in landscape. The reference tablet project is 820×1180 portrait. In the tablet
   project, add one `setViewportSize({ width: 1180, height: 820 })` case to `orientation-tap.e2e.js` (or `panel-tiers`) that
   asserts the gizmo block's bounding box is at most 130×180 px and doesn't meet the Operations toolbar.
5. Keep `ui-150`'s Sketch-toolbar clearance and `ui-158`'s Operations-toolbar clearance. The block only shrinks, so both should
   hold, but the specs that check them must stay green.

## Testing

- **E2E**: `e2e/orientation-tap.e2e.js` and `e2e/panel-tiers.e2e.js` on all three engines at tablet (WebKit is the iPad's
  engine). Phone and laptop must not change, so their baselines stay as they are.
- **Re-run closed findings**: `ui-158` (every face snaps, Views reaches hidden faces, face-on escape), `ui-134` and `ui-148` (the
  tap-accuracy measurements this task relaxes), `ui-150` (the Sketch toolbar doesn't meet the gizmo).
- **Acceptance**: re-drive scenario 7 (touch-only navigation) at 820×1180 and at landscape 1180×820 with touch input only.

## Effort

S

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
