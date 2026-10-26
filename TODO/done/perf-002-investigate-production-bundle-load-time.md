---
title: Measure whether the production bundle warning affects load time
category: perf
kind: finding
priority: medium
model: opus
depends: []
status: done
---

> **Shipped (2026-10-17): investigation only, no source change.** The >500 kB warning alone does not
> justify a split: the 1,825 kB entry chunk is ~70 % code the first frame needs (three.js, `src/core`,
> on-screen components, Vue, `@jscad/modeling`), vendor chunks change nothing in Chromium/WebKit, cost
> extra requests and still leave a 1,091 kB chunk, and repeat visits come from the service worker with
> no network. What does pay is not shipping code unused at boot: deferring Sentry, the AI agent, the
> WebMCP registry and a dev-only scripted provider (build **defer-boot**) makes a cold first visit on a
> slow link ~330 ms (~9 %) faster in Chromium, Firefox and WebKit (3,724 to 3,390 / 3,912 to 3,581 /
> 3,777 to 3,436 ms at `slow4g`, medians of 7), with repeat and fast loads within spread; page JS on
> the wire 601.4 to 534.8 kB. Delivered: `bench/bundle-load.mjs`, `bench/bundle-modules.mjs`,
> `bench/results/2026-10-17-perf-002.md`. Filed as `TODO/FIND-perf-003-defer-code-unused-at-boot.md`.
> **Not measured**: a real phone, GPU or network (headless, software GL, throttling emulated in the
> server); HTTP/2 (`vite preview` is HTTP/1.1, GitHub Pages is HTTP/2); builds with a Sentry DSN or GA
> id; an AI turn after deferral; phone and tablet viewports; long tasks after usable. The machine had
> ~1.3 of 14 cores busy with other processes. Acceptance scenario 1 re-driven on the production build:
> PASS. `chunkSizeWarningLimit` left alone.


## Problem

The production build reports an initial JavaScript chunk of 1,812.57 kB (541.04 kB gzipped), well
above Vite's 500 kB warning threshold. The warning alone does not establish that users wait longer
for the app: it may be dominated by code required on first use, or the current static import graph
may contain modules that can be deferred. No production-load measurement currently answers whether
the suggested splitting strategies improve the experience.

## Affected files

- `vite.config.js`: production output and the existing chunk warning.
- `src/`: the static import graph that determines initial JavaScript.
- `bench/` and `bench/results/`: add a repeatable production-load benchmark and record its results.

## Proposed fix

Measure the current production build served by `vite preview`, then compare representative
experimental builds using dynamic imports and Rolldown code-splitting options. Measure actual
time-to-first-usable-app/render, initial transferred JavaScript (compressed and uncompressed), and
request count; distinguish cold-cache from repeat loads and record the browser, machine, throttling,
and build settings. Include medians and spread from repeated runs, not one timing.

Do not raise or suppress `chunkSizeWarningLimit` as a performance fix: that changes the warning,
not the bytes or load time. This task is an investigation only. Record which modules dominate the
initial chunk, whether any candidate split produces a repeatable user-visible improvement, and the
tradeoffs (including extra requests, delayed feature loading, and PWA/offline behavior). If a change
is warranted, file a separate implementation TODO with the measured target; otherwise record that
the warning does not justify a split.

## Effort

M.

## Testing

- Add a reproducible benchmark, for example `bench/bundle-load.mjs`, and a report at
  `bench/results/<ISO-date>-perf-002.md`. Run the built app through `vite preview`; do not use the
  dev server for load-time claims.
- Exercise baseline and candidate builds in Chromium, Firefox, and WebKit because startup and
  deferred module loading can differ across the supported engines. Keep the viewport fixed at the
  laptop reference size; this task changes no layout.
- Confirm the app reaches its first usable/rendered state without console or page errors for each
  candidate, and record whether deferred features and offline/PWA loading remain available.
- **Acceptance scenarios to re-drive**: scenario 1 (two independent primitives), against the
  selected production build, to verify that any evaluated initial-load split does not leave the
  app partially initialized. No source optimization is committed by this investigation.
- **Closed findings to re-run**: none; this task measures startup and does not extend a subsystem
  with a closed finding.

## Notes

Requested in `TODO/NEW-TODO.md` on 2026-10-16. The build warning and sizes above are the values in
the request; record fresh values from the measured build rather than treating them as a baseline
result.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->