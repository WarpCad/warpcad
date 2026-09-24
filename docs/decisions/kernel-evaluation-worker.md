# Kernel evaluation off the main thread: one RPC, and the fold made cheap in three slices

Status: **Decided** (`TODO/core-029`, 2026-09-24). Slice 1 shipped with this record.
Slice 2 (`TODO/core-030`, 2026-09-24) measured its two candidates and shipped **restore,
don't re-fold** for Undo/Redo (see "Slice 2"). Slice 3 (`TODO/core-031`, 2026-09-24)
measured the asynchronous fold for what was left and landed a **fold cache** instead
(see "Slice 3" at the end). What is still genuinely new work on the main thread, a cold
Open and an edit at the root of a long dependent lineage, is `TODO/core-032`.

`CLAUDE.md`'s Architecture section: *"All kernel work happens off the main thread (a Web
Worker, regardless of which geometry library ends up inside it). The main thread must
never block on geometry evaluation."* `perf-001` built the first worker, for export only.
`core-029` was filed to decide how the rest gets there, between two shapes, **with
measurements rather than taste**. The measurements are in
`bench/results/2026-09-24-core-029.md`; this records what they decided.

## What was measured first: where the time actually goes

Before comparing boundaries, `bench/fold-benchmark.mjs` split every interaction's
main-thread cost into the fold itself, the per-body summary the store computes afterwards,
and the cost of shipping bodies across a worker boundary. On `perf-001`'s 24-body scene
(12 Pi boards + 12 bolts) and `data-004`'s 200-record fillet scene, M4 Pro, medians:

| | fillet-50 (200 records) | 24-bodies |
|---|---|---|
| append-type mutation, fold | 0.0-0.4 ms | 0.0-4.2 ms |
| **store summary after any mutation** | ~1 ms | **97-144 ms** |
| **full re-fold (Undo, row edit)** | **70-78 ms** | **157-163 ms** |
| pack + clone + unpack every body | 5 ms | 9-10 ms |
| most expensive single op alone (median) | `boolean.subtract` 3.5 ms | |

Two findings drove the decision:

1. **No single op is expensive.** The priciest median is 3.5 ms. The cost is *aggregate*:
   many cheap ops re-run (the re-fold), or cheap-looking reads that each hide a union.
2. **The biggest block was not evaluation.** `summarizeBody` called `boundsOf` and
   `volumeOf`, each of which ran `toGeom3` — a full `booleans.union` of every composite's
   parts — for **every body on every refresh**, changed or not. The same `boundsOf`
   union also ran over every body at each placement drag's start, on each marquee, and
   on each selection.

## Options compared

| | 1. One evaluation RPC for the whole fold | 2. "Expensive ops only" boundary |
|---|---|---|
| What moves | the fold, every derived read the UI needs, cancellation by generation | booleans, fillets, composite `combine()` above a measured cost threshold |
| API shape | one `request(job)` per channel; results land by generation | the kernel API split in two: sync for cheap ops, async for expensive ones |
| Cancellation | natural: generation per channel, the worker drops overtaken requests unrun | needed per op, across a fold that is half sync and half async |
| Against the measurements | moves the re-fold (70-163 ms) and the summary (97-144 ms) — the two costs that exist | **moves almost nothing**: no op clears any sensible threshold (max median 3.5 ms); the summary's unions are not "ops" at all |
| Correctness risk | one implementation, reused on both sides (`perf-001`'s rule) | two call paths per op, where a threshold decides which one runs |
| Transport cost | 5-10 ms per full scene, measured | per op, smaller, but paid mid-fold |

## Decision

**Option 1: one evaluation RPC, `src/core/kernel/evaluation.worker.js`**, entered through
`src/core/kernel/evaluationClient.js`, with a `kind`-dispatched job function
(`evaluationJob.js`) so every piece of kernel work that moves shares one worker, one
protocol and one cancellation rule.

- **Channels and generations.** Each independent stream (the live scene, a timeline
  preview) is a channel. Every request gets the next generation; an answer lands only if
  its generation is newer than the last that landed. So answers arriving in order all
  land (the newest known state shows while newer work runs), an answer arriving after a
  newer one has landed is dropped, and the worker's latest-only queue answers overtaken
  requests `superseded` without running them.
- **Previous result retained.** Nothing is cleared while work is in flight: the store
  keeps showing what it knows, and a not-yet-measured value is `null`, never a guess.
- **Fallback is the old path.** No worker (Node, a blocked module worker, a worker that
  dies) runs the same job function on the main thread — slower, never failing.
- **One implementation.** The worker runs `measureGeometry` — the same function the
  fallback runs. `evaluationJob.spec.js` and `e2e/evaluation-worker.e2e.js` assert the
  answers are identical, not close.

### Landed in two slices, because the fold is a contract change

Moving the *fold* makes every document mutation asynchronous: `append`, `undo`,
`replaceRecord` and `loadEntries` all refuse synchronously today (a `ReplayRejection`
naming the step, a toolbar message, an atomic Open), and about a dozen components,
composables and their specs rely on that. That is a different, larger change from moving
a measurement, and it deserves its own task, measurements and acceptance re-drive.

- **Slice 1 (`core-029`, shipped):** the RPC, its client and worker, and the largest
  measured block — the summary's unions. Bounds need no union at all (the box of a union
  is the box of its parts' boxes, exact to 7e-15 mm on every library composite), so
  `boundsOf` stopped unioning, which also removed the union from snap neighbours,
  marquee, Inspector and transform reads. Volume does need the union, so it is the first
  job the worker runs, cached per geometry object so an unchanged body is never measured
  twice.
- **Slice 2 (`TODO/core-030`):** the fold itself behind the same RPC — Undo/Redo, row
  edits, suppress/move/rollback and Open — with async refusal semantics designed rather
  than retrofitted. It also has to weigh a measured non-worker alternative for the most
  common case: undoing the *most recent* step can restore the derived state captured
  before it, with no re-fold at all.

## Rejection table

| Rejected | Specific reason |
|---|---|
| Option 2, "expensive ops only" | Its premise — a few ops cost most of the time — is false on this codebase: the most expensive op alone is 3.5 ms (median). The measured costs are the re-fold (many cheap ops) and derived reads that hide a union, neither of which a per-op threshold catches. It would also split the kernel API into sync and async halves with a threshold choosing between two call paths per op — the two-implementations drift `io-004`/`io-005` were about. |
| Moving the whole fold in one task | Measured and not rejected on merit — deferred. It changes the command layer's synchronous refusal contract (append, undo, row edits, Open) and every caller of it at once; landing that half-done is worse than landing it next. Filed as `TODO/core-030` with its numbers (70-78 ms / 157-163 ms re-fold). |
| Main-thread memoization of `combine()` alone | Cheaper for an *unchanged* body, but a changed or re-folded body (every Undo) still pays the union on the main thread — 50-68 ms cold on the 24-body scene. The cache is kept; it just is not sufficient on its own. |
| Sending bounds to the worker as well as volume | Unnecessary: a hole-free group's bounds need no union, and synchronous exact bounds keep every consumer (framing, snap, Objects list) free of an async edge. Groups with holes still take the exact union on the main thread; nothing in the app builds one today. |

## Consequences

- `BodySummary.volumeMm3` is `number | null`; the scene list omits `data-body-volume`
  until it lands, and e2e helpers that read it wait for the attribute.
- `boundsOf` of a hole-free group can differ from the old union-measured value by a few
  ulps (≤ 7e-15 mm) and in the sign of a zero; `restingOffsetMm` negates with `0 - z` so
  no `-0` reaches a record.
- The production build emits `assets/evaluation.worker-*.js` (161.5 kB), precached by
  the service worker. Verified running in Chromium and WebKit; Firefox cannot launch in
  this sandbox (`TROUBLESHOOTING.md`).

## Slice 2 (`TODO/core-030`): Undo/Redo restore instead of re-folding

`core-030` had to choose between two measured candidates for the fold that `core-029` left on
the main thread (70-78 ms on the 200-record `fillet-50` scene, 124-163 ms on 24 bodies,
per press of Undo):

1. **The fold as an evaluation job.** The worker re-folds and the main thread commits on
   arrival. Every refusal (`ReplayRejection`, an atomic Open, a refused Undo) becomes late,
   and every caller gets a pending state.
2. **No fold for the common Undo.** The fold is deterministic. When nothing has been written
   since a step, the derived state from just before the step is exactly what re-folding the
   log without it would produce, so it can be put back.

### Measured first: how much real use does option 2 cover?

Counted at the registry boundary: a `Proxy` over the real registry counts op lookups, so a
press with zero lookups did no kernel work. This is `bench/fold-benchmark.mjs`'s coverage
section; the numbers are in `bench/results/2026-09-24-core-030.md`.

| session | restored / re-folded |
|---|---|
| scenario 12's edit, suppress, roll back, insert and move, with their Undo/Redo | 3 / 0 |
| build 10 steps, Undo ×10, Redo ×5, Undo ×5 | 20 / 0 |
| an MCP write between two local steps, then Undo ×2, Redo ×2 | 3 / 1 |

Every Undo/Redo press in a single-user session is covered. The single re-fold is the one
that has to reach behind someone else's write, where restoring would delete it.

### Decision: option 2 now; option 1 only for what still re-folds

- **Mechanism** (`src/core/document.js`, "Restore, don't re-fold").
  - Every change to entries, the rollback marker or derived state gets a fresh integer
    **state token**.
  - Each local undoable step keeps the state from before it (captured with `rebuildFrom`'s
    prior state or `appendAll`'s pre-ingest copy) together with the token of the state it
    produced.
  - Undo restores only when the document's token still equals that token. Anything else
    re-folds exactly as before, refusals included. Redo is the mirror.
  - A fold-path Undo still captures the state it replaced, so the Redo after it is a
    restore.
- **Exact by construction.** Scenes and groups are immutable values. `applyAction` returns a
  new scene and `evaluate` copies `byId`, so a captured scene is the scene. One subtlety was
  found by the differential spec: jscad applies a geom3's lazy `transforms` **in place**
  (and caches `plane`) the first time anything reads its polygons. A restored object can
  therefore be *normalised* where a fresh fold's is still lazy. They are the same solid, and
  the spec compares geometry as `toPolygons` vertices, exactly. The render layer rebuilds
  its BufferGeometry from `recordId`, never from a geometry object's identity, so a restored
  object is always drawn fresh.
- **Bounded.** `restorableSteps` defaults to 50. Each kept step holds O(records) shallow
  map copies. Geometry is shared, not copied. A step older than that re-folds.
- **No contract change.** `undo()`/`redo()` stay synchronous and keep every refusal. No
  caller changed. That was the reason to land option 2 alone: it takes the path users hit
  most, at **0.0-0.1 ms** instead of 74-142 ms in Node, and **18.5 / 22.0 ms** instead of
  **474 / 296 ms** worst frame gap at 4× CPU in the browser, without making a dozen
  synchronous refusal readers asynchronous.

### Rejection table (slice 2)

| Rejected | Specific reason |
|---|---|
| Option 1 now, for everything | It changes the refusal contract of every row action, Open and Undo at once. Option 2 already covers every Undo/Redo press in single-user use, at no contract change. What option 1 would add is the **row action itself** (74 / 157 ms) and Open. That is a deliberate History-panel gesture rather than a per-frame one, so whether it justifies an asynchronous contract is its own measured question: `TODO/core-031`. |
| Option 2 keyed on "is this step the log's tail" | Too weak. A remote write *after* the step, or a batch that failed half-way, still leaves the step at a position from which restoring would drop someone else's record. The whole-state token catches every such case with one comparison, and `historyRestore.spec.js` asserts each one. |
| Storing the snapshot on the `HistoryStep` itself | Steps are handed to the store (`pendingUndo()` for the button label). A `WeakMap` keyed by step keeps a whole document snapshot out of what a label reader holds. |
| Unbounded restore history | A long session on a large document would grow memory with no limit. After 50 presses of Undo in a row, one re-fold is the least of the waits. |

## Slice 3 (`TODO/core-031`): row actions, the Undo fallback and the preview — a fold cache, not a worker fold

`core-031` was filed to move the re-fold that `core-030` left behind into the evaluation
worker (option 1): a timeline **row action** itself (edit, suppress, move, roll back, roll
forward, insert while rolled back), **Undo after a non-local write**, a step older than
`restorableSteps`, and **Open**. Its own instruction was to *measure first* whether row
actions justify making every refusal asynchronous, and to record the answer rather than
assume it.

### Measured first

Node, M4 Pro, medians, `bench/fold-benchmark.mjs` (extended with every row action, Open, a
single-lineage `chain-40` scene and option 1's true return cost). Full numbers:
`bench/results/2026-09-24-core-031.md`.

1. **Where a row action's time went.** On `fillet-50` it was the builds: 200 records
   rebuilt when one lineage of four changed. On the 24-body scene it was mostly *not* the
   builds. `evaluate`'s scene-group `add` `combine()`s (a real union) every named
   Group-valued record, on every fold. A CPU profile of a cached suppress showed 0 builds
   and ~95 ms in `add → combine → union`.
2. **What option 1 would still cost on the main thread.** A worker fold has to hand back
   `scene.byId`, every record's value, not just the terminal bodies. A later synchronous
   `append` resolves operands against it. Pack + structuredClone + unpack of the whole map
   is **10.3 / 18.9 / 30.3 ms** (fillet-50 / 24-bodies / chain-40). That is one to two
   frames on the main thread on every row action, plus a pending state for every caller
   and late refusals for `ui-032`, the stores and Open.
3. **How often the work is really new.** A row action changes one row. On every measured
   scene except a single long lineage, almost every record's inputs are unchanged.

In the production build (Chromium, worst frame gap, 4× CPU as the phone stand-in), the
row action measured 284 ms (fillet-50, Edit) and 458 ms (24-bodies, Suppress). Selecting
the row first, which previews it by folding the prefix, cost another 168 / 232 ms.

### Options compared

| | 1. Fold as a worker job | 2. Pending indicator on the sync fold | 3. **Fold cache** (landed) |
|---|---|---|---|
| Row action, fillet-50 (Node) | ~10 ms transport left on main | 72-74 ms, announced | **0.7-2.1 ms** |
| Row action, 24-bodies (Node) | ~19 ms transport left on main | 118-158 ms, announced | **0.1-6.5 ms** |
| Undo behind an MCP write | as above | 73 / 131 ms | **0.9 / 0.1 ms** |
| History preview (row click) | a second job | unchanged | cache hits (one line: share the live cache) |
| chain-40, edit at the root | moved off-thread (~30 ms transport) | 202 ms, announced | 202 ms, unchanged |
| Open (cold records) | moved off-thread | announced | unchanged (70 / 127 / 196 ms) |
| Refusal contract | every refusal late; every caller pending | unchanged | **unchanged** |
| Correctness risk | a second copy of state across a boundary | none | a cache that must never serve stale — keyed on record identity **and** JSON, identical operand objects, registry and tables; failures never cached; differential-tested against `foldCache: null` |

### Decision: option 3 now; option 1 only for what is genuinely new work

- **Mechanism.** `evaluate` takes an optional `cache` (`FoldCache`, a `WeakMap` keyed by the
  record object). A record's build is reused when the cached entry has the same JSON, the
  **identical** resolved operand objects and `pieces`, and the same registry and tables.
  Otherwise it builds and caches. Operand resolution runs first, so a missing reference
  throws exactly as before. A throw is never cached. A Group value's `combine()`d scene
  part is kept on the same entry, so the scene group is not re-unioned either.
  `createDocument` owns one cache per document, shares it with its tail shadow check, and
  exposes it as `document.foldCache` for the History preview (`stores/timeline.js`,
  through `toRaw`, because Pinia hands `raw` back as a reactive proxy). `foldCache: null`
  is the uncached fold.
- **Exact by construction.** Geometry values are immutable and builds are pure. A record
  downstream of a changed one sees a new operand object and rebuilds. The one known
  in-place mutation, jscad applying a lazy transform, is the same solid, as slice 2
  already established. `historyRestore.spec.js`'s differential now runs its twin and its
  fresh fold uncached, so every real-kernel script compares cached against uncached after
  every action, including new ones over dependency chains, composites and sub-part
  operands. In the app, a reload (a cold autosave-restore fold) reproduces the warm
  document's volumes and bounds byte for byte.
- **Measured after** (`bench/results/2026-09-24-core-031.md`). Browser, 4× CPU:
  row action **284 → 30 ms** (fillet-50) and **458 → 20 ms** (24-bodies); row select
  **168 → 19 ms** and **232 → 18 ms**. Node row actions are 0.1-6.5 ms, except chain-40's
  root edit. Drag-place, boolean, Inspector and Undo are unchanged.
- **No contract change.** `replaceRecord`, `setSuppressed`, `moveStep`, `rollBackTo`,
  `rollForward`, `insertAt`, `loadEntries` and the fallback `undo`/`redo` are still
  synchronous and still refuse by name, atomically. No caller changed.

### Rejection table (slice 3)

| Rejected | Specific reason |
|---|---|
| Option 1 for row actions | Measured: the cache takes every measured row action to at most one frame of Node work, which is less than option 1's own main-thread return cost (10-30 ms of `byId` transport). And option 1 would make every refusal late. It still wins for genuinely new work (cold Open, a long dependent lineage's root edit), which is filed as `TODO/core-032` with these numbers. |
| A pending indicator alone | It announces a 280-430 ms block at 4-6× CPU instead of removing it. It would also need a painted frame before the fold, which makes the call asynchronous anyway. It stays a candidate for Open in `core-032`. |
| Caching by record JSON alone (content-addressed) | It would also hit for a freshly parsed Open of the same document. But it needs a strongly held, bounded map, and a new object with equal JSON is exactly the case where "is this the same record" deserves a second look. Identity plus a JSON check is cheaper and cannot leak. |
| Caching only builds, not the scene-group part | The profile showed the 24-body re-fold was ~95 % `combine()` in `add`, so a build-only cache moved it from 150 to 125 ms. Keeping the combined part took it to 0.1-6.5 ms. |
| A module-global cache | The differential spec's "fresh fold" twin must share nothing, and documents on different registries must never share entries. So the cache is per document, and shared only on purpose. |
