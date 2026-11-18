---
title: Let a click anywhere in a text label's box select it, not only on its letter strokes
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-030 real-GPU drive
depends: []
status: done
---

> **What shipped:** after the stroke raycast misses, a click inside a `text.label` body's on-screen box (grown by 8 px, `LABEL_PICK_PAD_PX`) selects it. `src/render/pick.js` has the pure `pointInScreenBox`; `pointerGestures.js` `labelBoxHit` projects the body's drawn bounds with the marquee's `updateBoxScreenBounds`. Identified by the body's root op, so no other body's picking changed. Covered by `pick.spec.js` and `e2e/text-label-placement.e2e.js`; documented in `docs/primitive-placement.md`.

## Problem

Found driving `TODO/VERIFY.md` `render-002` #1 (headed Chrome, laptop 1440x900, default zoom). The default `Label` (size 10, stroke 1.5, height 2) projects to about 77x45 px. Clicking 133 points on its letters selected it 132 times; clicking 18 points 0 to 1 px off a letter selected it 11 times; 0 of 355 points 1 px or more from a letter selected it. Clicks on a 12x6 grid across the label's own box hit 27 of 72 (38%), because the gaps between and inside the letters miss. The picking is exact to the stroke and has no tolerance, so on a touch screen a finger will miss most of the time. Panel agents A and B disagreed on whether the label text reads clearly at default zoom (A: not clearly, B: partly), so legibility stays a judgement; the picking is the measured part. Evidence: scratchpad `shots/H3-dark-label.png`.

## Affected files

- `src/render/picking.js` (or the pick path for `text.label` bodies)
- `src/core/` text op if the bounds are exposed there

## Proposed fix

Give `text.label` a pick proxy: a click inside the label's bounding rectangle (or within a few px of a stroke, scaled for touch) selects it. Keep every other body's picking as it is.

## Effort

S.

## Testing

- Unit test for any placement or hit-test change; an e2e spec at `/` at the viewports named above.
- Re-run the `TODO/VERIFY.md` row named in Problem and the closed findings it touches.

## Interaction model

Precondition: a label placed. Trigger: click or tap on or near the label. Feedback: the label is selected and the Inspector shows it.

## Documentation

- **Page**: only if behaviour a user can see changes (`docs/`).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
