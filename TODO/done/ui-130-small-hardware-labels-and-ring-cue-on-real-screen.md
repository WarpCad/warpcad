---
title: Frame small dropped hardware, keep dimension labels clear of lines, and make the ring tube cue show at floor size
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-030 real-GPU drive
depends: []
status: done
---

> **What shipped (2026-11-18):** items 2 and 3, and the question on item 1. (2) `keepLabelInside` in `src/render/annotate.js` pulls each dimension label back inside the viewport after it is placed (the line and arrowheads still sit where they measure); a unit test sweeps 36 orbit views on a 390 px viewport and fails without the clamp. Labels are not nudged off the gizmo rings: that needs the ring geometry from another module, and the label already has a halo. (3) At phone width the ring's wall is 5 px and its core 1.5 px (3 and 1), after the base rules; a screenshot of a selected cube on chromium-phone shows the two strokes apart. (1) A small dropped nut is not reframed: the docs promise the camera stays where it was after a drop, so zooming is a product decision, OWNER.md Q100. `e2e/viewport-legibility.e2e.js` drives labels inside the viewport while orbiting and the phone ring strokes.

## Problem

Three defects found by driving the production build in headed Chrome on this Mac's GPU
(`TODO/VERIFY.md` rows `ui-030` #1, `ui-023` #1, `ui-011` #1, `ui-021` #2):

1. **A dropped Nut or Washer is tiny.** At the default camera an M4 Nut projects to 18×16 px and a
   Washer to 26×17 px at laptop width (canvas 920 px wide), and the nut is about 16 px across at
   390 px. WCAG 2.5.8 asks 24 px for a target, touch asks 44 px. The camera does not reframe what
   was just dropped.
2. **Dimension labels are crossed by lines.** On a cylinder tipped 60° both panel agents saw a
   ring, arrowhead or dashed guide run through the digits of the "50 mm" and "40 mm" labels at phone
   width, and less clearly at laptop. At phone width a label box crosses the viewport edge in 57 of
   72 orbit views (7 of 72 at laptop). No label sat under the orientation card in any of the 72
   views, and the labels never overlapped each other.
3. **The ring "tube" cue does not show at the floor size.** At the 40 px ring floor (390 px, DPR 3)
   the 3 px gradient band over a 1 px core reads as one flat stroke to both panel agents.

Evidence: screenshots under the testing-030 scratchpad (`shots/E-laptop-nut-full.png`,
`C-phone-tipped60.png`, `D-phone-floor-gizmo.png`); numbers in the VERIFY.md rows.

## Affected files

- `src/components/viewport/Viewport.vue` (framing after a drop, `DIMENSION_OFFSET_PX`)
- `src/render/annotate.js`, `src/components/viewport/DimensionLines.vue`, `Gizmo.vue`

## Proposed fix

Decide per item. Reframe or zoom to a small dropped part; clamp labels inside the viewport and
nudge them off ring paths; either widen the core or drop the double stroke at the floor size.

## Effort

M.

## Testing

- Unit tests for any label placement change; an e2e spec at `/` at all three viewports.
- Re-run `ui-030`, `ui-023` and `ui-011`'s drives; acceptance 1 and 4.

## Interaction model

Precondition: a body is selected or just dropped. Feedback: the part is framed, labels are legible.

## Documentation

- **Page**: only if framing behaviour changes (`docs/`).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
