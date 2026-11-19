---
title: The main thread blocks for 270 ms when a whole-model Subtract of a dense 3MF lands (and 480 ms when it starts)
category: core
kind: finding
priority: medium
model: opus
milestone: none — Findings table, filed 2026-11-17 from VERIFY.md core-079 #2 (TODO/testing-044)
depends: []
status: done
---

> **What shipped (2026-11-19).** The click and the landing no longer block the main thread for a Long Task. Solids now
> cross to the worker as `{counts: Uint32Array, positions: Float64Array}` and planes as `Float64Array`, so they are
> **transferred, not structured-cloned** (`transferablesOf`, `packGeometryInSlices` with a 4 ms slice budget in
> `src/core/kernel/transport.js`); `evaluationClient.request(job, {transfer, repack})`, `evaluationJob`'s
> `resultTransferables` and the worker's transfer list carry the result back; `src/stores/document.js` packs the
> operands in slices that yield through `afterNextPaint`, with the pending line showing meanwhile. Measured on two
> copies of the owner's RGB Matrix 3MF (`bench/results/2026-11-19-core-085.md`): the click went from 210 ms to a
> median 20 ms headless (frame floor 18-19 ms) and from 208 ms to 14 ms on the GPU (target 16 ms), with no Long Task.
> **The landing meets its 50 ms target on the GPU only** (119 to 47 ms); **headless it is 137-147 ms and the target
> is NOT met**: a software rasteriser draws the 220 k-triangle non-indexed result at about 80 ms a frame, which is
> outside this task's code. Followed up as `render-009` (indexed result geometry) and `core-086` (a worker-side
> geometry cache, a one-off 1 s GC after the pack, two unprofiled gaps). The e2e (`e2e/import-3mf.e2e.js`) uses a
> generated 25-part, 217,800-triangle 3MF and a Cube target, asserting 50 ms at the click and 80 ms at the landing
> (OWNER.md Q108, Q109 record both assumptions). `bench/whole-model-cut.mjs` keeps the two-copy case.

## Problem

`core-079` moved the whole-model Subtract into the evaluation worker so the main thread never blocks for a Long Task
(50 ms) on the Feather-shaped fixture. The frame budget is 16 ms (`CLAUDE.md`, Performance), and VERIFY.md
`core-079` #2 asked whether the commit stays under it on a denser 3MF. It does not.

Driven 2026-11-17 (`testing-044`), production build, headless Chromium 1440x900 on a software rasteriser (so
absolute numbers are pessimistic, the shape is the finding), two copies of the owner's `5036 RGB Matrix 2.5mm` 3MF
(1.9 MB, placed side by side), the whole of one subtracted from the other through the Objects list and the
**Subtract** button. A `setTimeout(0)` gap watcher and a `longtask` observer ran from just before the click:

| Moment | Longest main-thread gap | Long Tasks (`longtask`) |
|---|---|---|
| At the click (the request is built and posted to the worker) | 480 ms | 192, 286 ms (clustered at the click) |
| 8.6 s later, when the worker's result lands and the scene updates | 272 ms | 122, 149 ms |

The two 1.9 MB-class copies are not exotic: the owner's own Adafruit CAD Parts files run to 3.6 MB
(`2926 Terminal Block FeatherWing`). The Feather fixture in `e2e/import-3mf.e2e.js` stays under 50 ms, which is why the
spec passes.

## Affected files

- `src/core/kernel/` (worker RPC: what is posted at the click and what comes back; transfer typed arrays instead of
  structured-cloning them, and avoid rebuilding documents on the main thread)
- `src/render/` mesh bridge (upload of the result mesh)
- `bench/evaluation-mainthread.mjs`, `bench/export-mainthread.mjs` (existing main-thread benches to extend)
- `e2e/import-3mf.e2e.js` (the `watchMainThread` helper)

## Proposed fix

Profile both moments with `bench/evaluation-mainthread.mjs` on the RGB Matrix pair. Likely causes: serialising the
operand meshes for `postMessage` (use transferables), and per-part geometry upload and bounds work for 41-plus
parts when the result lands (batch, and upload off the critical path). Target: no main-thread gap above 16 ms at the
click, and none above 50 ms when the result lands, on this pair; record the numbers before and after.

## Effort

M.

## Testing

- A bench or e2e variant that imports a dense 3MF twice and subtracts, with the `watchMainThread` helper from
  `e2e/import-3mf.e2e.js`; threshold 50 ms for the landing, and the click's gap recorded.
- Engines: Chromium (`longtask`) and the timer-gap fallback on Firefox and WebKit. Viewports: laptop is enough (kernel,
  not layout).
- Re-run VERIFY.md `core-079` #1 and #2 and the existing `import-3mf` spec. Closed finding: `core-079`.
- Acceptance scenarios: 31 (import a 3MF and use one part as a reference) and 26.

## Interaction model

Not UI-touching.

## Documentation

n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
