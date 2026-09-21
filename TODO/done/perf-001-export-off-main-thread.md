---
title: Export serializes on the main thread, and io-004's repair roughly doubled what it costs
category: perf
kind: finding
priority: medium
model: opus
depends: [io-003, io-004, ui-034]
status: done
---

## Problem

Pressing **File ▾ → Export…** → **Export** does all of its work synchronously on the main
thread: `exportBodies` combines each body, repairs it (`io-004`), serializes it, and hands
the bytes to the downloader, with no yield anywhere. CLAUDE.md's Architecture section says
the opposite — "all kernel work happens off the main thread ... the main thread must never
block on geometry evaluation" — and `io-003` built the serializer without a worker because
nothing then measured how long it took.

`io-004` measured it, before and after its own change (MacBook, Node 24, same machine and
run for both columns):

| what is exported | before `io-004` | after `io-004` | added |
|---|---|---|---|
| one `raspberrypi.bplus` (778 → 802 triangles) | 1.9 ms | 8.4 ms | +6.5 ms |
| 24 bodies (12 Pi boards + 12 bolts, 11.6k triangles) | 22.9 ms | 48.1 ms | +25.2 ms |
| one large single solid (sphere `segments: 96` ∪ a cube, 9k triangles) | 11.5 ms | 40.4 ms | +28.9 ms |

So the repair is roughly a 2-3.5× on a path that already blocked, and the cost is
super-linear in a *single body's* polygon count (the repair scans every welded corner against
each open edge), not just in body count. 48 ms on a development laptop is a 150-250 ms
freeze on a phone — the reference form factor, per Responsive Layout — during which the
viewport cannot paint and the Export button cannot show progress. Nothing today surfaces
that: the popover closes immediately and the chip only appears once the bytes exist.

This is recorded rather than hidden because `io-004`'s own brief asked for it: the repair is
worth its cost (the alternative is a file a strict slicer rejects), but "we made the blocking
path twice as slow and said nothing" is exactly the kind of silence this project's
retrospectives are about.

**Update, 2026-09-21 (`io-005`) — glTF now pays the same cost, on the same thread.** `io-005`
put `makeWatertight` on `exportGltf`'s path too (`docs/decisions/persistence-export.md`
sub-decision 4 for why), so the third format is no longer the cheap one. Measured the same
way, same machine, five runs, a 24-body scene (24 unions, 6,480 triangles out):

| what is exported | before `io-005` | after `io-005` | added |
|---|---|---|---|
| 24 bodies as one `.glb` | 1.6 ms | 13.7 ms | **+12.1 ms** (median; range +11.8 to +13.8) |
| one body as a `.glb` | — | 0.5-12.6 ms depending on size | 0.7-3.4 ms of it the repair |

The written file also grows ~15% (416,200 → 478,408 B for those 24 bodies) from the inserted
vertices. This is **added to this finding rather than filed as a second one**: it is the same
defect (a synchronous, unbounded kernel pass on the main thread during export), now on all
three formats, and the fix — move export into the worker — closes it for all three at once.
Note the shape of it differs from STL's: glTF's own serialization was nearly free (1.6 ms),
so here the repair is essentially the *whole* blocking cost rather than a doubling of it.

## Affected files

- `src/core/export.js` — `exportBodies`, synchronous
- `src/core/kernel/watertight.js` — `makeWatertight`, the added cost
- `src/render/export.js` — `exportGltf`, already `async` but only for the lazy import
- `src/stores/` / `src/components/layout/` — whatever presses Export and shows the chip

## Proposed fix

Two separable pieces; measure before choosing how far to go.

1. **Move the work off the main thread.** There is no kernel worker in this repo yet —
   CLAUDE.md names one as the architecture but `src/core/kernel/` is called synchronously
   everywhere today, so this task would either build the first worker RPC (and then it is an
   `L`, and probably belongs to a `core` task that owns the RPC for evaluation too, not to
   export alone) or wrap just the export call in a worker of its own. Say which, with the
   reason, rather than assuming the bigger one.
2. **Make the repair cheaper**, which helps whether or not it moves. `makeWatertight`
   currently tests every open edge against every welded corner in the solid, which is what
   makes a single large body expensive. A uniform spatial hash over corners, walked along
   each open edge, turns that into a near-linear pass; `io-004` deliberately did not build
   one, because the measured numbers did not justify the code at the sizes reachable today —
   revisit that with a real number, not a hunch.

If the answer to (1) is "not yet", the honest minimum is feedback: a pending state on the
Export button or the chip for an export that takes more than ~100 ms, so a phone user sees
something rather than a dead app.

## Effort

M if the repair is optimised and progress is shown; L if this is where the kernel worker RPC
gets built.

## Testing

- A benchmark, per `.claude/prompts/perf-benchmark.md`, over the three rows in the table
  above — reported before and after, on the same machine, with the numbers written into this
  file's own record rather than described.
- Unit: `src/core/export.spec.js`'s whole `io-004` watertight block must still pass unchanged
  — 0 open edges on all eight shapes, in both formats. A faster repair that stops finding a
  T-junction is a regression, not an optimisation, and that block is the guard.
- If the work moves to a worker: the main-thread API stays the same shape or every caller and
  its spec changes with it; mock at the worker boundary per CLAUDE.md's Conventions.
- If a pending state is added, it is a user-visible control: `e2e/export-ui.e2e.js`, all three
  reference viewports, and a `docs/export.md` line saying what the user sees for a big export.
- `TODO/ACCEPTANCE.md`: scenario 11 (the whole export flow), and scenario 1 if a worker
  boundary appears between the document and the kernel.
- Closed findings whose repro steps get re-run: `io-004` (the eight shapes' open-edge counts
  and volumes) and `ui-034` (the Export popover still downloads STL/OBJ/GLB, scope, refusals
  by name).

## What actually shipped (2026-09-21)

**Both separable pieces, plus the pending state — and the architecture question was decided
by measurement, not by picking the bigger option.** The file asked for one of two things and
said to "say which, with the reason, rather than assuming the bigger one". The measurement
that settled it was not the one this file predicted.

### The finding's own premise was half wrong, and measuring it is what redirected the work

This file is written as though the repair were the dominant cost of a slow export. On a
single large solid it is. On the **multi-body scene**, it is not — breaking the 24-body export
into phases (`bench/export-benchmark.mjs`) gives:

| phase | before | after |
|---|---|---|
| `toGeom3` — combining 24 composite bodies, i.e. real kernel booleans | 43.4 ms | 43.4 ms |
| `makeWatertight` | 28.0 ms | **4.8 ms** |
| `stlSerializer.serialize` | 8.7 ms | 8.7 ms |

**76% of the remaining cost is the `combine()`, not the repair.** Optimising the repair alone
could never have got this scene under budget — and measured end to end, it barely moved the
*freeze*: the worst animation-frame gap on a 24-body export went 224.1 -> 233.3 ms at 4x CPU
throttling (unchanged within noise) even though the repair itself got 5.6x faster, because the
freeze was never mostly the repair.

### (a) The repair is near-linear, with provably identical output

Two changes, neither of which alters a single byte of any exported file:

- **Integer corner identity** (`CornerIdentity`) instead of a `` `${ix},${iy},${iz}` `` string
  per vertex per pass — the larger win at the sizes actually reachable today.
- **A uniform spatial hash** (`CornerGrid`) walked along each open edge, which is the structure
  this file asked for. It removes the quadratic term (2.38 M candidate tests per pass on a
  16k-polygon solid).

Measured (Apple M4 Pro, Node 24, median of 20 runs; 5 for the huge solid):

| solid | polygons | before | after |
|---|---|---|---|
| one `raspberrypi.bplus` | 217 | 1.71 ms | **0.39 ms** (4.4x) |
| 24 bodies | 3,492 | 27.01 ms | **4.82 ms** (5.6x) |
| sphere `segments: 96` u cube | 4,107 | 20.18 ms | **3.79 ms** (5.3x) |
| sphere `segments: 192` u cube | 16,275 | 89.92 ms | **20.78 ms** (4.3x) |

**Output equivalence is proven, not assumed** — this file's own Testing section calls a faster
repair that stops finding a T-junction "a regression, not an optimisation".
`bench/watertight-equivalence.mjs` compares, across all ten shapes `io-004`'s and `io-005`'s
spec tables cover: the repaired solid's polygon count, its total vertex count, a SHA-256 over
every vertex coordinate **in order**, and a SHA-256 of the whole written STL, OBJ and GLB.
**All ten identical.** Ordering is preserved deliberately — hits are sorted by distance along
the edge and then by first-walked order, which is exactly what a stable sort over the old
insertion-ordered corner list produced.

### (b) An export-only worker — yes, and here is the number that justified it

The file's condition was a measured multi-hundred-millisecond block at phone-class CPU after
(a). Driving the real app in Chromium with CDP CPU throttling, **after** the repair
optimisation, a 24-body export still froze the main thread for **233 ms at 4x and 346 ms at
6x**. That is the bar, met.

The clone cost, which the runner rightly flagged might eat the win, was measured rather than
assumed: packing the 24-body scene costs **0.18 ms**, `structuredClone` of it **6.5 ms**, and
the finished 618 KB STL comes back in **0.11 ms** (a `Uint8Array` is transferable). About a
ninth of what it relocates. It does not eat the win.

Result, same scene and session, worst animation-frame gap:

| cpu | no worker | with worker |
|---|---|---|
| 1x | 61.1 ms | **17.2 ms** (the 60 Hz vsync floor) |
| 4x | 233.3 ms | **27.3 ms** |
| 6x | 346.1 ms | **39.5 ms** |

**What was deliberately NOT built**: the general kernel-evaluation worker RPC. This worker is
entered from the export path alone; no `evaluate()` caller and no part of the document fold
changed. The 43.4 ms `combine()` above is the evidence that the general RPC is worth doing,
and it is filed as **`TODO/core-029`** with these numbers rather than smuggled in here.

### Rejected, with the reason

- **Optimise the repair and stop** (option (a) alone) — rejected by the frame-gap measurement
  above: 233 ms at 4x CPU is still a dead app on a phone, and a pending state set just before a
  synchronous block **cannot paint at all**, so the file's "honest minimum" fallback would have
  been a spinner nobody ever sees.
- **Put three.js's `GLTFExporter` in the worker too** — rejected by measurement: meshing and
  serializing a `.glb` is ~5 ms of its ~54 ms, and `src/core/` may not import three.js
  (`CLAUDE.md`, Project Structure). The worker does glTF's kernel-shaped half and hands back
  prepared solids; a unit test asserts the resulting file is **byte-identical** to the direct one.
- **Change `exportBodies` to be async** — rejected: it stays synchronous and unchanged, so it
  remains what the worker runs, what the fallback runs, and what every existing spec measures.
  `src/core/exportClient.js` is the new seam, and `stores/exportDialog.js` is its only caller.

### The pending state

`Exporting...` on the button and a `role="status"` line naming the file, after 100 ms. Measured
to appear when it should and not when it should not: **0 of 5** appearances on a one-body export
even at 6x CPU throttling, **5 of 5** on a 24-body one. Covered at all three reference viewports
in `e2e/export-ui.e2e.js`, in Chromium and WebKit, and documented in `docs/export.md`.

One honest caveat: on this laptop at **1x**, a 24-body export lands right at the threshold, so
the line is either absent or a ~10 ms flash. That is the borderline every threshold has; the
case that matters (phone-class CPU) is unambiguous.

