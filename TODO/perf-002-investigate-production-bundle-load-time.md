---
title: Measure whether the production bundle warning affects load time
category: perf
kind: finding
priority: medium
model: opus
depends: []
status: open
---

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