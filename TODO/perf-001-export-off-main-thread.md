---
title: Export serializes on the main thread, and io-004's repair roughly doubled what it costs
category: perf
kind: finding
priority: medium
model: opus
depends: [io-003, io-004, ui-034]
status: open
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
