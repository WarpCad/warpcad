---
title: The deployed build fetches the Sentry SDK (144 kB gzip) before the app is usable
category: perf
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-15 by `perf-005`
depends: []
status: open
---

## Problem

`perf-005` ran the bundle-load bench against `https://app.warpcad.com/`. The deploy's cold load fetches
`esm-C4pqlg3y.js`, the Sentry SDK 11.8.0 (429 kB raw, 144.0 kB gzip), before the app is usable. The Pages
workflow gives the build `VITE_SENTRY_DSN`, so Sentry initialises during boot. `perf-003` deferred
Sentry, but every local measurement ran without a DSN, where the chunk is emitted and never fetched, so
the deferral's real effect with a DSN was never measured. Measured: deployed cold boot JS 803.3 kB
gzip over 4 JS requests; the same code with no DSN 681 kB over 3 (`bench/results/2026-11-15-perf-005.md`).
At the bench's 200 kB/s link, 144 kB is about 720 ms; on the deploy it is in the cold path.

## Affected files

- `src/core/errorReporting.js` (`initErrorReporting`, the dynamic `import('@sentry/vue')` near line 253) and its call in `src/main.js`
- `bench/bundle-load.mjs` (a way to build and serve a variant with a dummy DSN, to measure this locally)
- `docs/decisions/error-reporting.md`

## Proposed fix

1. Reproduce locally: build with `VITE_SENTRY_DSN=https://k@o.invalid/1`, run the bench, confirm the chunk is
   on the cold JS list and how much `usable` moves.
2. Start Sentry after the first frame (`requestIdleCallback` or after `usable`), keeping errors from the
   boot window by queuing them (Sentry's global handlers can be installed late, or a tiny early
   handler can buffer), and say in the decision record what boot-time errors are lost, if any.
3. Re-run the bench against the dummy-DSN build and, after a deploy, against `--url https://app.warpcad.com/`.

## Effort

S–M.

## Testing

- A unit spec that Sentry's init is not called before the first frame callback, and that an error thrown
  during boot is still reported once Sentry starts (buffered).
- `bench/bundle-load.mjs --url` on the deploy: the `esm-*.js` file is gone from the cold JS list.
- Engines: Chromium for the bench; the production-build specs on the rotating pair.
- Acceptance scenarios: 1. Closed-finding regression: `build-004` (Sentry inert without a DSN, scrubbed) and `perf-003`.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: n/a (`docs/decisions/error-reporting.md` records the boot-window trade-off).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
