---
title: Point the bundle-load bench at the deployed GitHub Pages build
category: perf
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: open
---

## Problem

`perf-002` measured bundle load only against local `dist/` through `vite preview`. Its `TODO/VERIFY.md`
row `perf-002` #1 asks for the same bench against the real deploy (HTTP/2, real TLS, GitHub's CDN), to see
whether the fragmented builds' request cost shrinks there and whether the ~330 ms defer-boot gain holds.
`bench/bundle-load.mjs` builds and serves its variants itself (`url: http://127.0.0.1:<port>/`), so it
cannot target a URL today.

## Affected files

- `bench/bundle-load.mjs` (add a `--url <origin>` mode that skips the local build and server)
- `bench/results/` (a dated result file)
- `TODO/VERIFY.md` (`perf-002` #1)

## Proposed fix

1. Add a `--url` option: when set, measure only the one deployed build at that origin, with the same
   cold, warm and `repeat-http` passes and the same network pacing. Leave the local-variant mode unchanged.
2. Run it against `https://app.warpcad.com/` with the pacing profiles the bench already uses, and
   compare with the last local result per `.claude/prompts/perf-benchmark.md`.
3. Record the numbers in a new `bench/results/<date>-perf-005.md`. Set `perf-002` #1 to `OK` with the
   file's path, or `Issue` with a new id if the defer-boot gain does not hold.

## Effort

S–M.

## Testing

- The bench's own `--help` and a local run still pass unchanged. A unit spec for the argument parsing, if the bench has a spec file.
- Engines: Chromium (the bench's own browser).
- Acceptance scenarios: none.
- Closed-finding regression: `perf-002`'s and `perf-003`'s local numbers must still reproduce in local mode.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: n/a (`bench/README.md` gets one line on `--url`).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
