---
title: The print-prep split-sheet docs still differs by 2% of pixels in a full run, and passes alone
category: testing
kind: finding
priority: low
model: sonnet
depends: []
status: open
---

## Problem

In the full e2e run on 2026-10-18, `e2e/docs/print-prep.docs.js:167` (`split-sheet-manual-joints
still`, project `docs-laptop`) failed `toHaveScreenshot` with 19331 pixels (ratio 0.02) different.
Run alone, the same test passes against the same baseline, so the baseline is right and something in
the render is not settled when the shot is taken under load (a frame or the split preview still
animating or tessellating).

## Affected files

- `e2e/docs/print-prep.docs.js` (the `shot` helper and the test at `:167`)
- `docs/screenshots/split-sheet-manual-joints.png`

## Proposed fix

Reproduce it by running the docs project with the rest of the suite's workers. Find what differs
(diff image in the report), then wait on a real "settled" signal (a `data-*` attribute on the
viewport) before the shot, rather than a timeout. Do not raise `maxDiffPixelRatio`.

## Effort

S.

## Testing

- `npm run docs:media` twice in a row, then once with the full e2e suite running, produces no diff.
- Engines: the docs project is Chromium-only; no cross-engine need.
- Acceptance scenarios: none touched.
- Closed-finding regression: none.

## Documentation

None; no user-visible control changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
