# Kernel evaluation off the main thread: one RPC, landed in two slices

Status: **Decided** (`TODO/core-029`, 2026-09-24). Slice 1 shipped with this record;
slice 2 is `TODO/core-030`.

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
