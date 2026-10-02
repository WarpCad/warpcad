---
title: The document fold behind the evaluation worker — async Undo/Redo, row edits and Open
category: core
kind: feature
priority: medium
model: opus
depends: [core-029]
status: done
---

> **What shipped (2026-09-24): option 2, measured, with option 1's remainder filed as
> `TODO/core-031`.**
>
> - **Mechanism.** Undo and Redo now **restore** the derived state captured with the step
>   instead of re-folding the log, whenever nothing has been written since. A whole-state
>   token decides that, and a bounded window of 50 steps keeps it (`restorableSteps`).
> - **No contract change.** `undo()`/`redo()` stay synchronous with every refusal intact,
>   and no caller changed.
> - **Coverage.** Every Undo/Redo press restored in the scripted single-user sessions,
>   including scenario 12's row actions. Undo after an MCP/remote write, a step older than 50,
>   the row actions themselves, and Open/restore still re-fold. That is option 1's territory,
>   and its contract question is now scoped to those paths alone in `core-031`.
> - **Numbers.** Headline, production build, Chromium, 4× CPU: fillet-50 Undo **296 → 22.0 ms**,
>   24-body Undo **474 → 18.5 ms** worst frame gap. In Node, Undo/Redo went from 74-142 ms to
>   0.0-0.1 ms (`bench/results/2026-09-24-core-030.md`).
> - **Testing section.** Covered by `src/core/historyRestore.spec.js`: zero-kernel-call
>   counts, a differential against an always-fold twin plus a fresh fold after every action,
>   and the fallback and refusal cases. Its **worker-boundary mock and async cancellation**
>   bullets do not apply to option 2, which has no worker and nothing asynchronous. They move
>   to `core-031` verbatim.

## Problem

`core-029` decided the shape of kernel work off the main thread — **one evaluation RPC**
(`src/core/kernel/evaluation.worker.js`, its client and a `kind`-dispatched job function)
— and landed its first slice: the per-body measurement unions that `stores/document.js`
ran on every refresh (97-144 ms per mutation on the 24-body scene, now 0.1 ms on the main
thread). See `docs/decisions/kernel-evaluation-worker.md` for the decision and
`bench/results/2026-09-24-core-029.md` for every number below.

What it deliberately did **not** move is the **fold**: `src/core/document.js`'s
`rebuildFrom`, which re-evaluates the whole log synchronously on Undo, Redo, every
timeline row action (edit, suppress, move, roll back / forward, insert) and on Open /
autosave restore. Measured, production build, Chromium, laptop, median worst frame gap:

| scene | Undo at 1× | 4× | 6× |
|---|---|---|---|
| `fillet-50` (`data-004`'s 200 records, no composites) | **96.8 ms** | **280.4 ms** | **424.9 ms** |
| `24-bodies` (12 Pi + 12 bolts), after `core-029` | **133.2 ms** | **465.9 ms** | **671.6 ms** |

In Node the fold alone is 70-78 ms (fillet-50) and 133-163 ms (24-bodies). This is
`data-004`'s own headline number, and it is on the path a user hits by pressing Undo.

## Why this is its own task

Moving the fold changes the **command layer's contract**, not just where code runs.
Today every one of these refuses synchronously and atomically:

- `append`/`appendAll` — a record that will not fold throws, and `OperationsToolbar`,
  `useTransformCommands`, placement and paramEdit show the message at once;
- `undo`/`redo` — a step that no longer applies is refused by name;
- `replaceRecord`, `setSuppressed`, `moveStep`, `rollBackTo`, `rollForward`,
  `insert` — `ReplayRejection` naming the row, which `ui-032`'s timeline marks `broken`;
- `loadEntries` (Open, autosave restore, hosted load) — atomic, nothing changes on refusal.

Making the fold async means each of those gets a **pending** state and a **late**
refusal, and two presses of Undo in a row have to queue rather than race. That needs
designing once, for all of them, not retrofitted per call site.

## Affected files

- `src/core/document.js` — `rebuildFrom`, `ingest`, `loadEntries`, undo/redo
- `src/core/kernel/evaluationJob.js` — a `fold` job kind beside `measure`
- `src/core/kernel/transport.js` — carry the folded scene back (terminal bodies at least;
  whether every intermediate record's geometry must cross is part of the design)
- `src/stores/document.js`, `src/stores/timeline.js`, `src/composables/useTimelineCommands.js`,
  `src/components/viewport/OperationsToolbar.vue`, `src/components/layout/HistoryControls.vue`,
  the persistence stores — every synchronous refusal reader
- every `*.spec.js` covering the above

## Proposed fix

Not decided. Two measured candidates to compare first, with `bench/fold-benchmark.mjs`
and `bench/evaluation-mainthread.mjs` before and after:

1. **The fold as an evaluation job.** The worker folds the next entry list (same
   `createDocument`/`ingest` code, one implementation) and answers either a refusal
   naming the step or the folded scene; the main thread commits bookkeeping and geometry
   on arrival, holding the previous scene on screen meanwhile, with commands queued
   behind a pending fold. Transport measured at 5-10 ms per full scene of bodies — but a
   later incremental `append` resolves operands against `scene.byId`, which today holds
   every record's value, so whether that map crosses too (and at what size) must be
   measured, not assumed.
2. **No fold at all for the common Undo.** Undoing the most recent step can restore the
   derived state captured when it was appended — the fold is deterministic, so the
   result is identical by construction — at O(1), synchronous, no contract change. Only
   non-tail revisions (a row edit mid-history, a remote step interleaved) would still
   need option 1. Measure how much of real use that covers before choosing.

They may well combine: 2 for the tail undo, 1 for everything that genuinely re-folds.

## Effort

**L.** The contract design is most of it.

## Testing

- Benchmark, before and after, both scripts above. Headline: `fillet-50` Undo's worst
  frame gap at 4× (280 ms) and `24-bodies` Undo at 4× (466 ms).
- Unit: results identical to the synchronous fold — assert geometry and bookkeeping
  (`bodies()`, `rootOf`, `currentIdOf`, undo labels), not "it ran". Mock at the worker
  boundary as `src/core/kernel/evaluationClient.spec.js` does.
- Cancellation: a superseded fold never lands after the one that replaced it; two Undo
  presses in a row end where two synchronous Undos would.
- Refusals: every refusal listed above still names its step, still leaves the document
  unchanged, and still reaches the same UI surface — now after a pending state.
- `TODO/ACCEPTANCE.md`: **scenario 12** above all (undo/redo and every row action),
  scenario 10 (Open/restore), scenario 1, and scenario 4.
- Closed findings whose repro steps get re-run: `data-003` and `data-004` (undo/redo and
  row-action atomicity), `core-020` (incremental append against a prior fold), `ui-032`
  (preview/rollback), and `core-029`'s own `e2e/evaluation-worker.e2e.js`.
- Cross-engine: Chromium **and** WebKit, production build. Firefox cannot launch in this
  sandbox (`TROUBLESHOOTING.md`).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
