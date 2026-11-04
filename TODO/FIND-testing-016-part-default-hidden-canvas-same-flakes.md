---
title: Canvas "same" checks in part-default-hidden.e2e.js flake under the full suite and in isolation
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-04 while landing core-078 Part 2
depends: []
status: open
---

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

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
