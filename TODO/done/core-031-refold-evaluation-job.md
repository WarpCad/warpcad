---
title: The re-fold that is left after core-030 — row actions, Open and the Undo fallback as an evaluation job
category: core
kind: feature
priority: medium
model: opus
depends: [core-030]
status: done
---

> **What shipped (2026-09-24): not option 1. A fold cache, measured first, with no contract
> change.** The measurement this file asked for came first. Option 1's own main-thread
> return cost (packing the whole `scene.byId` back) is 10-30 ms per row action, before any
> pending state, and it would make every refusal late. Meanwhile a row action changes one
> row, so almost every record's inputs are unchanged. So the re-fold stayed synchronous
> and became incremental by construction. `evaluate` takes a per-document `FoldCache`,
> keyed by the record object, checked against its JSON, the identical operand values, the
> registry and the tables, which reuses every unchanged build. It also keeps each
> composite's `combine()`d scene part: a profile showed that union, not the build, was ~95 %
> of a cached 24-body re-fold. `createDocument` shares the cache with its tail shadow check
> and, through `document.foldCache`, with the History preview. Node: row actions 72-74 →
> 0.7-2.1 ms (fillet-50) and 118-158 → 0.1-6.5 ms (24 bodies); the Undo fallback 73 / 131 →
> 0.9 / 0.1 ms. Browser, 4× CPU, worst frame gap: row action 284 → 30 ms and 458 → 20 ms;
> row select 168 → 19 and 232 → 18 ms. Every refusal is still synchronous, named and
> atomic, and no caller changed. What the cache cannot make cheap is genuinely new work: a
> cold Open (70 / 127 / 196 ms) and an edit at the root of one long dependent lineage
> (chain-40, 202 ms). That is filed as `TODO/core-032`, with option 1 or a pending indicator
> as its candidates. The Testing section's cancellation bullets (a superseded fold never
> landing, queued row actions) apply only to an asynchronous fold, so they move to
> `core-032` with it. See `docs/decisions/kernel-evaluation-worker.md` slice 3 and
> `bench/results/2026-09-24-core-031.md`. Found by the acceptance re-drive, pre-existing
> and filed: `TODO/ui-045`.

## Problem

`core-030` compared its two candidates by measurement and landed **option 2**. Undo and Redo
now **restore** the derived state captured with the step instead of re-folding the log,
whenever nothing has been written since (`src/core/document.js`, "Restore, don't re-fold").
That covered **every Undo/Redo press** in the scripted sessions `bench/fold-benchmark.mjs`
now runs. Scenario 12's edit, suppress, roll-back, insert and move sequence went from 3 of 3
re-folding to 3 of 3 restored, and a 10-step build-then-backtrack session went from 20 of 20 to
20 of 20 restored. Node, medians, 200-record `fillet-50` / 24-body scene:
Undo went from 73.8 / 141.7 ms to **0.1 / 0.0 ms**. See `bench/results/2026-09-24-core-030.md`.

What still runs the **full synchronous fold on the main thread**, unchanged, is:

| path | fillet-50 | 24-bodies |
|---|---|---|
| a timeline **row action** itself: Edit, Suppress, Move, Roll back, Roll forward, insert while rolled back | 74.0 ms | 157.2 ms |
| **Undo after a non-local write**: an MCP or remote record landed after the step | 73.8 ms | 150.4 ms |
| Undo of a step older than `restorableSteps` (50) | same as a full fold | same |
| **Open**, autosave restore, hosted Load (`loadEntries`) | same as a full fold | same |

These are the costs `core-030`'s option 1 was about: the fold as an evaluation job in
`src/core/kernel/evaluation.worker.js`. It was **not** landed with option 2, for a measured
reason. Option 2 removed the path users hit most often (Undo/Redo) at O(1) with **no
contract change**. Option 1 is what changes the contract: every refusal listed below becomes
late, and every caller gets a pending state. Landing that half-wired would be worse than
landing it next.

## Why this is its own task

This is `core-030`'s own contract question, now on a smaller surface. The synchronous
refusals that become asynchronous under option 1 are:

- `replaceRecord`, `setSuppressed`, `moveStep`, `rollBackTo`, `rollForward` and `insertAt`
  throw a `ReplayRejection` that names the row, and `ui-032`'s timeline marks it `broken`.
- `loadEntries` (Open, autosave restore, hosted load) is atomic: on refusal nothing changes.
- The fallback `undo`/`redo`: a step that no longer applies is refused by name.

`append`/`appendAll` on the fast path is **not** on this list. It never re-folds, measuring
0.0-0.4 ms for a placement, move or boolean. It can stay synchronous.

## Affected files

- `src/core/document.js`: `rebuildFrom` and its callers (row actions, `loadEntries`, the
  undo/redo fallback)
- `src/core/kernel/evaluationJob.js`: a `fold` job kind beside `measure`
- `src/core/kernel/transport.js`: carry the folded scene back. `scene.byId` holds every
  record's value, and a later incremental `append` resolves operands against it, so whether
  the whole map must cross (and at what size) has to be measured. The transport measured for
  terminal bodies alone was 5-10 ms per scene.
- `src/stores/document.js`, `src/stores/timeline.js`, `src/composables/useTimelineCommands.js`,
  `src/components/layout/HistoryControls.vue`, the persistence stores: every synchronous
  refusal reader of the paths above
- every `*.spec.js` covering the above

## Proposed fix

Option 1 from `core-030`, scoped to the paths above. The worker folds the next entry list
with the same `createDocument`/`ingest` code (one implementation) and answers either a
`BrokenStep` refusal or the folded state. The main thread commits on arrival and keeps the
previous scene on screen meanwhile. Commands queue behind a pending fold, and a superseded
fold never lands after the one that replaced it (the client's existing generation rule).
`core-030`'s restore path must keep working on top of it: a fold that lands is a new state
token, and the step it belongs to records the state from before it.

Measure first whether row actions are frequent enough to justify the contract change. A row
action is a deliberate History-panel gesture, not a per-frame one. If it is rare, a pending
indicator on a synchronous fold may be the honest answer, and that decision should be
recorded rather than assumed.

## Effort

**L.** Most of it is the contract design.

## Testing

- Benchmark, before and after, with `bench/fold-benchmark.mjs` and
  `bench/evaluation-mainthread.mjs`. Add a row-edit interaction to the browser bench, which
  today measures only Undo.
- Unit: results identical to the synchronous fold. Reuse `src/core/historyRestore.spec.js`'s
  differential harness (an always-fold twin plus a fresh fold, compared after every action),
  and mock at the worker boundary the way `src/core/kernel/evaluationClient.spec.js` does.
- Cancellation: a superseded fold never lands after the one that replaced it, and two queued
  row actions end where two synchronous ones would.
- Refusals: every refusal above still names its step, still leaves the document unchanged, and
  still reaches the same UI surface, now after a pending state.
- `TODO/ACCEPTANCE.md`: **scenario 12** above all, then scenario 10 (Open/restore), 1 and 4.
- Closed findings whose repro steps get re-run: `data-003`, `data-004`, `core-020`, `ui-032`,
  `core-029`'s `e2e/evaluation-worker.e2e.js`, and `core-030`'s own restore path (Undo/Redo
  with zero kernel lookups).
- Cross-engine: Chromium **and** WebKit, production build. Firefox cannot launch in this
  sandbox (`TROUBLESHOOTING.md`).
