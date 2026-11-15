---
title: Graduate the hand-checked Show hidden parts overlay and move-arrow colour checks into a three-engine e2e spec
category: testing
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from testing-017
depends: []
status: done
---

> **Shipped 2026-11-15.** `e2e/gizmo-overlay-pixels.e2e.js` (new) holds both parts. Part 1 runs on all nine projects: the toggle-off comparison for the canvas and for the visible viewport with overlays on screen, and Subtract with the bolt's `tap` against a one-pixel resize and back. Part 2 runs at laptop width on all three engines in both colour schemes: red/green/blue dominance at the centre of each shaft and cone and a lit-versus-dark luminance spread across each. `snapshotCanvas` and `changedPixels` moved to `e2e/support/canvasSnapshot.js` (with a new `snapshotVisibleViewport`) and the three specs that carried a copy import it; `object-visibility` now also switches off overlay filters while it photographs, as the other two always did. Mutation checks: a toggle-off that keeps the overlay, an X shaft painted with Y's gradient, and flat (unshaded) gradients each turned the spec red. The Bolt is consumed by the Subtract, so its toggle disappears; the spec asserts that.

## Problem

`CLAUDE.md` (Browser Support) says a hand-verified WebGL or engine-specific check that has been driven more than once
becomes a `*.e2e.js` spec on all three engines. Two `TODO/VERIFY.md` rows have now been driven twice (the original
task's hand drive, then `FIND-testing-017` on 2026-11-14), and both are still only covered in part by a spec:

1. **`render-007`: Show hidden parts, off again, leaves nothing behind.** `e2e/inspector-hidden-parts.e2e.js`
   asserts the *canvas alone* goes back to under 40 changed pixels, with the gizmo and every overlay hidden
   (`visibility:hidden` plus `filter:none`). Nobody asserts what a person sees: the same comparison **with the
   overlays on screen**, and the **Subtract-with-the-bolt's-`tap`** path (turn the toggle on, pick the `tap` as the second
   operand, Subtract). `testing-017` measured both by hand: 0 changed pixels (threshold 24 summed RGB difference) after
   toggling off, canvas-only and with the overlays, on Chromium, WebKit and Firefox at phone and tablet; and 0 changed
   pixels between the post-Subtract view and the same view after a one-pixel resize (a forced full redraw).
2. **`ui-048` #4: the move arrows keep a lit and a dark flank, and X, Y and Z stay red, green and blue.** Only the arrow
   *sizes and positions* are asserted today. `testing-017` sampled pixels across each shaft and each cone in Firefox at
   1440 × 900, dark and light: centre pixel dominant channel R / G / B for X / Y / Z, shaft lit-versus-dark luminance
   difference 21 to 72, cone 26 to 122 (dark theme: X 205,109,109; Y 117,175,92; Z 89,166,226).

## Goal

One spec (name suggestion `e2e/gizmo-overlay-pixels.e2e.js`), app-level at `/`, all three engines and all three
viewports for part 1, laptop only for part 2 but both colour schemes (`colorScheme` per test):

- Part 1: drop a Bolt over a Cube; toggle Show hidden parts on and off; assert fewer than 40 changed pixels in the canvas
  *and* in the part of the viewport above the Inspector sheet with overlays visible; then the Subtract-with-`tap` run
  and the after-resize comparison.
- Part 2: select a Cube, sample across each `gizmo-arm-*` and `gizmo-head-*` (through `getScreenCTM`, as the drive did)
  and assert the dominant channel and a non-zero lit-versus-dark difference.

`e2e/support/humanInput.js` has the pointer and drag helpers. `snapshotCanvas` is already copied into three specs (`inspector-hidden-parts`, `object-visibility`, `part-default-hidden`); lift it into `e2e/support/` rather than copy it a fourth time.

## Affected files

- `e2e/gizmo-overlay-pixels.e2e.js` (new), `e2e/support/` (a shared canvas-snapshot helper)
- `TODO/VERIFY.md` (`render-007` #1 and #2 and `ui-048` #4 already read `OK` with the manual numbers; note the spec once it exists)

## Effort

S to M.

## Testing

- New spec green on `npm run test:e2e:headless`'s rotating pair; run it once on the full matrix (`npm run test:e2e:full`) before closing.
- Closed findings re-run: `render-007` (toggle-off remnant) and `ui-021` / `ui-048` (arrow shading).

## Interaction model

Not UI-touching (test only).

## Documentation

- **Page**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
