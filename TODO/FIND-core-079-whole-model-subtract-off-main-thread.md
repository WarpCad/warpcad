---
title: Subtract with a whole multi-part model as the cutter blocks the main thread for 624 ms
category: core
kind: perf
priority: low
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-11-04 from io-024's measurements)
depends: [io-024]
status: open
---

## Goal

**In user terms:** Import the Adafruit Feather as a 3MF (`io-024`), click once to select the whole board, and
**Subtract** it from a plate. Today the app freezes for about 624 ms on the main thread before the result appears.
The same cut with Adafruit's one-shell STL takes 179 ms. The owner should get the same snappy result either way.

Done means: subtracting or aligning against a whole multi-part model keeps the main thread under the 16 ms frame
budget (`CLAUDE.md` Performance), or the cut moves off the main thread with a visible progress state.

## Measured (io-024, Chromium, dev server, the owner's `esp8266 feather.3mf`, 2026-11-04)

- Whole-model Subtract: **624 ms** main thread. The cutter is the union of the 29 part solids, built on the main thread.
- Cutting part by part was slower: **1,082 ms**.
- Adafruit's one-shell STL, same plate: **179 ms**.
- Selecting the whole model, dropping it, and exporting it do not stall (6 ms script, 121 ms and 172 ms for the drop).
- Volume of the whole model in the worker: **2.0 s**, no main-thread gap.

## Why it is not in io-024

`io-024`'s own spec said to measure this case and record it, not to set a number. The task shipped with the number
recorded as a known limitation in `docs/decisions/mesh-import.md`. The owner chose to commit now and file this.

## Affected files (expected, to confirm when started)

- `src/core/kernel/group.js` and `src/core/kernel/index.js`: where a composite cutter is unioned before a boolean
- `src/core/kernel/recipes/importMesh.js`: the union of many part solids
- `src/core/kernel/` worker RPC: whether the union can run in the worker that already runs the other kernel work

## Proposed fix (direction, not decided)

1. Measure first, with the same drive as `io-024`'s perf profile, to confirm the 624 ms is the union and not the boolean.
2. Move the composite-cutter union into the kernel worker, so the main thread only sends the operands and receives the
   result, as every other kernel op already does.
3. Failing that, union the part solids in one pass, not pairwise, and check whether the result can be reused between
   repeated cuts with the same cutter.

## Testing

- **Unit**: a 29-part cutter gives the same volume and triangle count before and after the change (`toBeCloseTo`).
- **Perf**: the before and after numbers from the same machine, recorded in `docs/decisions/mesh-import.md`.
- **E2e**: `e2e/import-3mf.e2e.js` gets a whole-model Subtract step that asserts the main-thread long task is under 50 ms.
- **Acceptance scenarios to re-drive**: 31 (the Feather, subtract step), 5 (boolean with one part), 3 (renders complete).
- **Closed findings to re-run**: `core-053` (export refold), `io-006` (STL export open edges).

## Documentation

- `docs/booleans.md`: a note only if the cut's behaviour changes. Otherwise none.

## Effort

M.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
