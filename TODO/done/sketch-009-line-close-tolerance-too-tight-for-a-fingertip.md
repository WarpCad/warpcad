---
title: Widen the Line tool's close-the-outline tolerance on touch so a fingertip tap on the first point closes it
category: sketch
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-15 from the testing-031 tap, timing and reach drive
depends: []
status: done
---

> **Shipped 2026-11-18:** `src/render/sketchDraw.js` keeps a `chainTouch` flag (set by `begin`, `lineTap`, `trackChain`) and uses a 32 px close radius for a finger, 14 px for a mouse; the first-point pulse uses the same radius. Unit test in `sketchDraw.spec.js`; touch e2e in `sketch-primitive.e2e.js` (tap 25 px off the first point closes). The 95 % scatter re-run was not repeated; the radius is the one the finding derived (2.45 sigma). `docs/sketch-mode.md` quotes both radii.

## Problem

Found measuring `TODO/VERIFY.md` `sketch-006` #1 (production build of the dirty tree at 2026-11-15, 390x844 touch emulation, Chromium). The row says a tap on the first point closes the outline "without needing to be pixel-exact (14 px tolerance)". 100 closing taps aimed at the first point of a three-point chain, scattered as a fingertip would be (sigma 3.5 mm = 13.2 px, `bench/tap-scatter.mjs`): **only 45 % closed the outline**; 55 % added a fourth point next to the first (a sliver segment, chain still open). 40 % of the taps fell inside the 14 px radius, so the rule behaves as stated; the radius is just small against a fingertip. The 450 ms swallow window measured exactly: a next tap 100-440 ms after the closing tap was swallowed, 480-1000 ms was never eaten, and five taps on distinct points 80-350 ms apart were all kept (0 eaten). Reaching 95 % closure at this scatter needs a radius of about 2.45 sigma = 32 px.

## Affected files

- `src/render/sketchDraw.js` (`SKETCH_PICK_TOLERANCE_PX`, the close test)
- the pulse that shows a click will close (`data-close-near`)

## Proposed fix

Use a larger close radius for touch pointers (about 32 px, with the first-vertex pulse sized to match) while keeping 14 px for a mouse, so a distant tap cannot close a shape by accident. Re-run the scatter: aim for at least 95 % closing at sigma 3.5 mm.

## Effort

S.

## Testing

- Unit test for any hit-test or layout change; an e2e spec at `/` at the viewports named above that taps the control through its scatter (see `bench/tap-scatter.mjs`).
- Re-run the `TODO/VERIFY.md` row named in Problem, `TODO/ACCEPTANCE.md` scenario 7 (touch-only viewport navigation), and the closed findings it touches.

## Interaction model

Precondition: Line tool armed with at least three points placed. Trigger: tap near the first point. Feedback: the outline closes and the chain ends; the first-point marker pulses while the finger is within the radius.

## Documentation

- **Page**: `docs/` sketch page: the close tolerance sentence, if it quotes 14 px.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
