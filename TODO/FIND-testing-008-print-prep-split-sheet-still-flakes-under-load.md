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

**Recurred 2026-10-26** in the full e2e run for the `b81a99b` commit gate (4284/5594 passed, this
was the only failure): `split-sheet-manual-joints.png` differed by 15724 pixels (ratio 0.02), on
`docs-laptop` again. Run alone straight after, `e2e/docs/print-prep.docs.js` passed 5/5 twice. The
`shot()` helper had just been changed to pin the header version label (`b81a99b`), but this shot
is in the viewport, not the header, and it passes alone with that change in place, so the label
pin is not the cause. Still load-dependent and still not root-caused.

**Recurred again 2026-10-27** in the full e2e run for the core-075 stage 1 commit gate (4304 passed,
1 failed, 1313 skipped): the same shot on `docs-laptop`, 14145 pixels (ratio 0.02). That commit
regenerated this baseline (the picker now lists **Dowel**), and the run alone straight after passed
7/7 twice, so the new baseline is right and the load-dependence is unchanged.

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
