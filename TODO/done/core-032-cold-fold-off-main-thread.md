---
title: Cold folds off the main thread — Open/autosave restore, and an edit at the root of a long dependent lineage
category: core
kind: feature
priority: low
model: opus
depends: [core-031]
status: done
---

> **What shipped (2026-09-30):** measured first, then option 2. Open, hosted Load and autosave restore set a `loading` state, paint one frame (`afterNextPaint`, capped at 100 ms for hidden tabs) and then run the same synchronous, atomic `loadEntries`; the File button goes busy with an "Opening…" spinner. A worker fold (option 1) would have left ~80-150 ms at 4x and slowed realistic documents; the lineage-root edit is under one frame up to ~10 dependent subtracts, so option 3 is not taken. Trigger-to-first-feedback fell from 116-676 ms to 6-11 ms; the worst frame gap is unchanged by design. Re-measure the root edit (`bench/fold-benchmark.mjs` lineage section) if repeated-feature ops make long lineages common. See `docs/decisions/kernel-evaluation-worker.md` slice 4 and `bench/results/2026-09-30-core-032.md`.


## Goal

`core-031` measured the asynchronous-fold contract change it was filed for against
keeping the fold synchronous and making it incremental by construction, and landed the
second: a per-document **fold cache** (`src/core/kernel/index.js`, `FoldCache`) serves
every record whose inputs did not change. Every timeline row action, the Undo fallback
behind a non-local write and the History preview became nearly free on the measured
scenes, with **no** change to the synchronous refusal contract. See
`docs/decisions/kernel-evaluation-worker.md`, slice 3, and
`bench/results/2026-09-24-core-031.md`.

Two paths are left that still fold synchronously on the main thread, because what they
fold is genuinely new work that no cache can hold:

| path | fillet-50 (200 records) | 24-bodies | chain-40 (1 plate, 40 subtracts) |
|---|---|---|---|
| **Open**, autosave restore, hosted Load (`loadEntries` of records never built in this session) | 70.2 ms | 127.4 ms | 196.1 ms |
| an **edit at the root of one long dependent lineage** (every later row depends on it) | 2.1 ms (independent lineages) | 6.5 ms | **202.1 ms** |

Node, M4 Pro, medians. At the 4× CPU throttling that stands in for a phone, those are
roughly 300-800 ms of blocked main thread.

Done means both paths either stop blocking the main thread or are shown, with a
measurement, not to need to. Either way the decision gets recorded as slice 4 of the
decision record.

## Why this is its own task, and why it is low priority

- **Open is once per session, and deliberate.** The user has just picked a file. A
  pause there is not the same experience as a pause during a drag. `core-031` did not
  judge that worth changing the atomic-Open contract (a `ReplayRejection` today,
  synchronously, with nothing changed) for.
- **A long single lineage is the worst case, not the common one.** The measured
  fixtures, and scenario 12, are dominated by independent bodies. Before changing
  anything, measure how long a lineage a real session actually builds.
- **Option 1's return cost is a floor.** Shipping the whole `scene.byId` back (a later
  synchronous `append` resolves operands against every record's value, not just the
  terminal bodies) measured **10.3 / 18.9 / 30.3 ms** (pack + structuredClone + unpack).
  A worker fold therefore still costs about one to two frames on the main thread, plus
  a pending state for every caller.

## Affected files

- `src/core/document.js`: `loadEntries`, and `rebuildFrom` if the lineage case is taken on
- `src/core/kernel/evaluationJob.js`, `evaluation.worker.js`, `evaluationClient.js`: a `fold` job kind
- `src/core/kernel/transport.js`: carrying `byId` and the scene group
- `src/stores/document.js`, `src/stores/persistence.js`: Open's refusal reader, and a pending state
- the History panel, if the lineage-root edit becomes asynchronous

## Proposed fix

Measure first, then pick one:

1. **Open as a worker fold.** The worker folds the loaded entries with the same
   `createDocument`/`ingest` code. The main thread keeps the previous document on screen
   and commits on arrival, or reports the `ReplayRejection` from the worker unchanged.
   The main-thread fold cache can be **seeded** from the transported values, so the
   next row action is cached too. Needs a pending indicator on the File menu.
2. **A pending indicator on the synchronous fold.** Paint a "Loading…" state for a frame
   and then fold. The block remains, but it is announced. This is the cheapest answer
   if (1)'s transport cost plus a pending state is judged not worth it.
3. **The lineage-root edit**: only if a measured real session builds lineages long
   enough to matter. Same shape as (1), scoped to `rebuildFrom`.

## Effort

**M** for (1) or (2) on Open alone. **L** if the lineage-root edit is taken on too,
because that is the row-action refusal contract `core-031` deliberately left
synchronous.

## Testing

- Benchmark before and after with `bench/fold-benchmark.mjs` (the Open and chain-40
  rows) and `bench/evaluation-mainthread.mjs`. Add an Open interaction to the browser
  bench, which today uses Open only as setup.
- Unit: the loaded document is identical to a synchronous fold. Reuse
  `src/core/historyRestore.spec.js`'s differential harness, mocking at the worker
  boundary the way `src/core/kernel/evaluationClient.spec.js` does.
- Refusals: an Open that fails still names the row, still changes nothing, and still
  reaches the same toolbar message, now after a pending state.
- `TODO/ACCEPTANCE.md`: scenario 10 (Open/restore) above all, then 12, 1 and 4.
- Closed findings whose repro steps get re-run: `data-003`, `data-004`, `core-020`,
  `ui-032`, `core-029`'s `e2e/evaluation-worker.e2e.js`, `core-030`'s restore path and
  `core-031`'s fold-cache counts (`src/core/foldReuse.spec.js`).
- Cross-engine: Chromium **and** WebKit, production build. Firefox cannot launch in
  this sandbox (`TROUBLESHOOTING.md`).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
