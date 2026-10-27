---
title: Keep the kernel's implementations out of the main-thread bundle (split the op registry's metadata from its code)
category: perf
kind: finding
priority: low
model: opus
depends: []
status: open
---

## Problem

Kernel evaluation runs in `evaluation.worker` (453 kB) and `export.worker` (574 kB), yet the main
bundle also carries `src/core/kernel` (~223 kB) and `@jscad/modeling` (~155 kB): about 380 kB of
geometry code the main thread should not need. Measured 2026-10-27 from the hidden source map of
`dist/assets/index-*.js` (2.14 MB, which also tripped Workbox's 2 MiB precache limit; raised to 4 MiB
in `vite.config.js` as the stopgap).

Cause: `src/core/kernel/registry.js` holds each op's *metadata* (param schemas, operand counts,
aliases) and its *implementation* in one module. About 20 main-thread files import it for metadata
only (`core/inspector.js`, `core/paramEdit.js`, `core/variables.js`, `core/library.js`,
`composables/useParamCommands.js`, `useTimelineCommands.js`, …), which pulls `@jscad/modeling` in.
Separately, `core/repeat.js`, `core/library.js` and `composables/useParamCommands.js` import
`evaluate` / `evaluateOp` directly, which is geometry work on the main thread (CLAUDE.md: "All kernel
work happens off the main thread").

## Affected files

- `src/core/kernel/registry.js` and the op modules it imports
- the main-thread importers listed above; `src/core/printPrep.js`, `export.js`, `repair.js` (import `kernel/group.js`, `watertight.js`)

## Proposed fix

Split the registry into a metadata module the main thread imports (no `@jscad/modeling`) and an
implementation table only the workers import. Route the direct `evaluate` / `evaluateOp` callers
through the worker RPC (`src/core/kernel/transport.js`). Do not add vendor `codeSplitting` groups to
cut the file: `perf-002` section 8 measured many initial chunks as a slow-link regression (a
vendor split makes 5 initial JS files instead of 1). Removing code is the safe direction.

## Effort

L. Touches the architecture rule on kernel/worker boundaries; confirm the metadata/implementation
boundary with the user first.

## Testing

- Unit: registry metadata module imports nothing from `@jscad/modeling` (a spec that checks its
  import graph); every op still has both halves.
- `bench/bundle-load.mjs` before/after; record in `bench/results/<date>-perf-004.md`. Target: main
  chunk ≥ 300 kB smaller, no more initial JS files than today.
- E2E on all three engines (kernel, canvas, persistence). Acceptance scenarios 1, 2, 3 (booleans,
  library part) re-driven; `repeat` and library-part placement are the paths that lose a sync evaluate.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
