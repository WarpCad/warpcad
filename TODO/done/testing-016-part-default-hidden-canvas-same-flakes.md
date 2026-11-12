---
title: Canvas "same" checks in part-default-hidden.e2e.js flake under the full suite and in isolation
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-04 while landing core-078 Part 2
depends: []
status: done
---

> **What actually shipped (2026-11-11).** No app change. The steady residual was the selection
> gizmo's Z-arm CSS `drop-shadow` (`src/components/viewport/Gizmo.vue:676`, `.tgizmo__arm`), which
> Firefox keeps painting under the snapshot helper's `visibility:hidden`, the same cause as
> `TODO/done/render-007-hidden-part-toggle-off-leaves-a-remnant.md`. The fix is in
> `e2e/part-default-hidden.e2e.js` `snapshotCanvas`: the hidden overlays also get `filter:none` and
> `backdrop-filter:none`, matching `inspector-hidden-parts.e2e.js`. The 40 px threshold, the poll and
> every assertion are unchanged. Users are not affected: the app hides the gizmo with `v-if`/`v-show`,
> and the WebGL pixels themselves were byte-identical before and after.

## Problem

Two tests in `e2e/part-default-hidden.e2e.js` fail intermittently on a canvas-"same" assertion:

- "hide a Group part by default: gone from the view, Size, History, Undo and Redo, reload, Show all, Export"
- "the last shown part cannot be hidden, and unticking brings the part back"

Both fail in the helper `expectCanvas` (line 133), which polls `changedPixels` against an earlier
snapshot and expects fewer than 40 changed pixels. Observed values: 59, 63, 76, 83, 90.

Evidence, 2026-11-04:

- Committed HEAD (`34a59c5`, Part 1 only, no core-078 Part 2 code): "last shown part" failed alone (63), and
  "hide a Group part" failed alone (59), each in one of three isolated runs.
- Part 2 tree: full e2e run failed both; isolated runs failed "last shown" twice and "hide a Group" once,
  and passed "hide a Group" 9/9 in another run.

So the flake is not specific to any one change. It reproduces on both trees.

## Why it is not a threshold to loosen

The fix must not raise the 40-pixel limit to get green. The check is a human "nothing changed"
claim after Undo, Redo or a hidden-part toggle, and a loose limit would stop it meaning that.

## Proposed fix

1. Read `expectCanvas` and the snapshots it compares. Find which action is not settled when the
   snapshot is taken (the viewport rebuild after Undo, a pending WebGL frame, a camera ease).
2. Wait on the app's own ready signal for that action (for example the `data-webgl` attribute or a
   body-count change), not on a pixel poll that can pass or fail by timing.
3. Re-run the two tests 10 times in isolation on Chromium before and after, and report the failure rate.

## Testing

- Before: 10 isolated runs of each test on Chromium, failure count recorded.
- After: the same 10 runs, zero failures, and the full `e2e` stage green on all three engines.

**More evidence, 2026-11-05 (`ui-094`).** "the last shown part" failed once in the full matrix, on
`firefox-tablet` only. Isolated, `--repeat-each=25` on `firefox-tablet`: committed HEAD (`6f9c805`, a clean
worktree) failed **8 of 25**, the `ui-094` tree **4 of 25** — the same flake, not made worse. Other
projects passed 26 of 27 isolated runs (the one failure was again `firefox-tablet`).

## Mechanism and evidence (2026-11-11)

The test's `both` baseline and its final "same" snapshot are both taken with `Group 1` selected, so
the translate gizmo is mounted over the group each time. `snapshotCanvas` hides every viewport overlay
with `visibility:hidden`, but Firefox still paints the CSS `drop-shadow` of the hidden SVG arms. The
shadow of the vertical Z arm shows as two faint grey bars, about 10 × 30 px, over the group. They are
painted a different length from one snapshot to the next, so the comparison picks up a steady patch
that polling never clears. A reading of 56–57 is that patch at its longest.

A temporary probe spec (deleted) repeated this test's steps 16 times on `firefox-tablet` at 6 workers.
It took the baseline and the final canvas three ways, then compared like with like:

| Variant | Changed pixels per run | Over 40 |
|---|---|---|
| The old helper (`visibility:hidden`) | 0–57; 13 of 16 runs non-zero, always in the box x 246–255, y 261–290 | 4 of 16 (57 each) |
| Plus `filter:none` on the hidden overlays | 0 in all 16 | 0 |
| Overlays `display:none` | 0 in all 16 | 0 |

The camera's azimuth, distance and target, the canvas box, its backing size and the device pixel
ratio were identical between the two captures in every run. Crops of the patch show the two grey
bars at a different length in the baseline and the final snapshot. Nothing settles late: the WebGL
canvas is the same, and only the hidden gizmo's shadow differs. A longer wait could not fix that,
because the residual is steady. The 2026-11-05 note's 8 of 25 failures in isolation fit the same
cause: it needs only Firefox, not load.

## Fix verification (2026-11-11)

- `-g "last shown part"` alone on `firefox-tablet`: 3 of 3 passed.
- The whole spec with `e2e/native-files.e2e.js` on `firefox-tablet` plus `guards`: 3 of 3 runs green
  (10 of 10 tests each).
- Stress, the whole spec at `--repeat-each=16 --workers=7` on `firefox-tablet`: 64 of 64 passed.
  Before the fix, the same load failed this test 4 of 16 times.

Latent case, not changed here: `e2e/object-visibility.e2e.js` uses the same `visibility:hidden`
helper without the filter override, and can hit the same Firefox residual whenever a gizmo is
mounted during its snapshots.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
