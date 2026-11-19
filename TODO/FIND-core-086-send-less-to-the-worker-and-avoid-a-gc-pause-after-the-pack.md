---
title: A whole-model cut still sends every operand triangle each click, and one headless run paused 1 s for a GC after the pack
category: core
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-19 from TODO/core-085
depends: []
status: open
---

## Problem

After `core-085` the click packs the operands as typed arrays in 4 ms slices and transfers them. Two costs remain.

1. **A GC pause.** One of eight headless sliced runs had a 1,022 ms full GC right after the pack: about 48 MB of new
   `ArrayBuffer` at a 400 MB JS heap. The other seven runs had none.
2. **The worker time.** The worker takes 5-6 s on the RGB Matrix pair (headless), most of it rebuilding what the main
   thread already sent for the previous evaluation. A worker-side geometry cache keyed by body id (and revision) would
   let the click send nothing for an operand the worker already holds, which removes the pack, the transfer and the
   GC pressure, and cuts that time.

### To check before treating these as findings

Two observations from the `core-085` drive were not profiled, so they may be nothing:

- **File menu open and close with two dense models in the scene: a 279 ms main-thread gap, headless.** It may be the
  redraw of two dense models on the software rasteriser (the `render-009` cost), not app work.
- **WebKit: 47-86 ms timer gaps 4-16 s into the worker's wait, while the page was idle.** It may be WebKit's own
  scheduling, or the worker's progress messages being read.

Profile each (CDP profile on Chromium; Web Inspector timelines on WebKit) before filing a task for either.

## Affected files

- `src/core/kernel/evaluationClient.js`, `evaluationJob.js`, `evaluation.worker.js` (the cache and what a request carries)
- `src/stores/document.js` (the whole-model cut's operand packing)
- `bench/whole-model-cut.mjs` (reports the heap before the click and the idle floors)

## Proposed fix

Spike the worker cache first: key by body id plus the feature revision the document already tracks, invalidate on any
edit to that body or an operand it consumed, and fall back to sending the operand on a miss. Re-measure with
`node bench/evaluation-mainthread.mjs --only whole-model-cut --mesh "<file>" --rates 1 --runs 8` and look for the 1 s
GC in the eight runs. Mind the trust rules: the worker holds geometry the page produced, never text from a loaded file.

## Effort

M.

## Testing

- Unit specs for the cache (hit, miss, invalidation after an edit, after Undo, after a different document is opened).
- `e2e/import-3mf.e2e.js` on all three engines (kernel and persistence involved); the dense-cut test.
- Acceptance scenarios: 31 and 26. Closed finding to re-run: `core-085`, `core-079`.

## Interaction model

Not UI-touching.

## Documentation

n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
