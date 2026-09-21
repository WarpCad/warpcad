---
title: Kernel evaluation still runs on the main thread — the general worker RPC CLAUDE.md names
category: core
kind: feature
priority: medium
model: opus
depends: [perf-001, data-004]
status: open
---

## Problem

`CLAUDE.md`'s Architecture section says, without qualification:

> **All kernel work happens off the main thread** (a Web Worker, regardless of which
> geometry library ends up inside it). The main thread must never block on geometry
> evaluation.

`perf-001` built the **first** worker in this repo, but deliberately scoped it to export
alone (`src/core/export.worker.js`, entered only from `File ▾ → Export…`). Everything
else that touches the kernel still runs synchronously on the main thread: `evaluate()`
in `src/core/kernel/index.js`, the document fold behind `rebuildFrom`, every drag-place,
every boolean, every Inspector parameter edit, every undo and redo.

This is filed with numbers rather than as a restatement of the rule, because `perf-001`
measured the thing that makes it concrete. Exporting a 24-body scene (12
`raspberrypi.bplus` boards and 12 `hardware.bolt`s) breaks down like this on an Apple M4
Pro, median of 20 runs (`bench/results/2026-09-21-perf-001.md`):

| phase | cost | on which thread, today |
|---|---|---|
| `toGeom3` — combining 24 composite bodies (real kernel booleans) | **43.4 ms** | worker, since `perf-001` |
| `makeWatertight` | 4.8 ms | worker, since `perf-001` |
| STL serialization | 8.7 ms | worker, since `perf-001` |

The 43.4 ms row is the point. That is not serialization — it is **kernel boolean
evaluation**, the same kind of work `evaluate()` does on every placement and every
boolean, and it was 76% of the export's remaining cost. `perf-001` got it off the main
thread only because it happens to sit inside the export path; the identical work
performed by a drag-place or a boolean button still blocks.

`data-004` measured the related number from the other direction and drew the opposite
conclusion for good reason at the time: a full re-fold of 200 fillet-heavy records took
**67 ms**, linear and kernel-dominated, which it recorded as acceptable and used to
justify *not* building an incremental rebuild. 67 ms on this laptop is 270-400 ms at the
4-6× CPU throttling `perf-001` used to stand in for a phone — over the 16 ms frame
budget by more than an order of magnitude, on a path a user hits by pressing Undo.

## What `perf-001` already proved, so this task need not re-derive it

- **The transport is affordable.** `src/core/kernel/transport.js` packs `Geom3`/`Group`
  for `postMessage`; measured at 0.18 ms to pack and 6.5 ms to `structuredClone` a
  24-body scene, against ~57 ms of work relocated. The clone does not eat the win.
- **A module worker bundles and runs in both engines.** `new Worker(new URL(…), { type:
  'module' })` was verified in the **production build** in Chromium *and* WebKit, with a
  real download and no console errors. Firefox could not be launched in the sandbox.
- **A mockable boundary works.** `setExportWorkerFactory` lets unit tests drive a fake
  worker that runs the real job function, per `CLAUDE.md`'s "mock at the boundary".
- **The residual cost is the clone, not the compute.** After the worker, the 24-body
  export's worst frame gap was 27 ms at 4× throttling, of which ~6.5 ms is the clone.

## Why this is bigger than `perf-001`, and was correctly not folded into it

Export is a **one-shot, fire-and-forget** action: one request, one answer, and a
half-second of latency is acceptable because the user asked for a file. Evaluation is
none of those things:

- **Every `evaluate()` caller becomes async**, including the document fold. That is
  `src/core/kernel/index.js`, `src/core/document.js`'s `rebuildFrom`, and every store
  and component that reads a body's geometry synchronously today.
- **Superseded work must be cancelled, not awaited** (`CLAUDE.md`, Performance: "a
  superseded rebuild is cancelled rather than awaited"). Dragging a slider issues a
  rebuild per frame; the export worker has no cancellation because it never needed one.
- **The viewport needs something to draw meanwhile.** A rebuild that takes 200 ms cannot
  leave the scene empty; it needs the previous geometry held until the new one lands.
- **Undo/redo and the transaction origin** must still behave, with results arriving out
  of order.

## Affected files

- `src/core/kernel/index.js` — `evaluate`, `evaluateOp`, `expand`
- `src/core/document.js` — the fold / `rebuildFrom`
- `src/core/kernel/transport.js` — extend to carry action records and results
- a new `src/core/kernel/*.worker.js` and its client, modelled on
  `src/core/export.worker.js` / `src/core/exportClient.js`
- `src/stores/document.js`, `src/render/` mesh bridge — whoever reads geometry
- every `*.spec.js` covering the above

## Proposed fix

Not decided — that is most of this task. Two shapes worth comparing **with measurements
rather than taste**, and the decision recorded in `docs/decisions/`:

1. **One evaluation RPC the whole document fold goes through**, with cancellation by
   generation token and the previous geometry retained until the new fold lands.
2. **A narrower "expensive ops only" boundary** — booleans, fillets and composite
   `combine()` in the worker, cheap primitives staying synchronous — which keeps most
   callers synchronous but splits the kernel's API in two, and needs a measured
   threshold rather than a guessed one.

Whichever is chosen, reuse `src/core/kernel/transport.js` rather than inventing a second
packing format, and keep one implementation of each kernel operation — `perf-001`'s
export job calls the *same* `solidsForExport` and `makeWatertight` the main thread would,
specifically so there is no second implementation to drift, which is the failure mode
`io-004` and `io-005` were both about.

## Effort

**L**, and genuinely so — this is the task `perf-001` was told not to turn into.

## Testing

- A benchmark per `.claude/prompts/perf-benchmark.md`, before and after, reusing
  `bench/export-mainthread.mjs`'s frame-gap method: worst frame gap during a drag-place,
  a boolean, an Inspector parameter edit and an Undo, at 1× / 4× / 6× CPU throttling.
  `data-004`'s 200-record re-fold (67 ms) is the headline number to move.
- Unit: mock at the worker boundary, as `src/core/exportClient.spec.js` does. Results
  must be **identical** to the synchronous path's — assert on geometry, not on "it ran".
- A cancellation test: a superseded rebuild must not land after the one that replaced it.
- `TODO/ACCEPTANCE.md`: **scenario 1** above all (a worker boundary between the document
  and the kernel is exactly what its Testing note flags), plus 3, 4, 5 and 12.
- Closed findings whose repro steps get re-run: `io-004` and `io-005` (open-edge counts
  on the eight/five shapes), `ui-012` and `core-020`, and `perf-001`'s own 24-body
  frame-gap number — this task extends the same evaluation pipeline all of them touch.
- Cross-engine: Chromium **and** WebKit, in the production build, per `perf-001`'s
  finding that module workers are a real bundling-and-engine surface. Firefox cannot be
  launched in this sandbox (`TROUBLESHOOTING.md`).
