---
title: measure.spec.js lens-volume test times out under the full unit run
category: testing
kind: finding
priority: medium
model: sonnet
depends: []
status: done
---

> **What shipped (2026-10-17):** the cause was not the sphere tessellation and not one test. Seventeen
> kernel, library and MCP specs have a slowest test of 1-4 s on an idle machine (measure lens 1.0 s alone,
> `library` "rest of the catalogue" 1.1 s, `gear.bevelPair` integration 1.0 s, `gear.wormPair` 2.1 s), and a
> loaded machine stretches that 3-4x, so the 5000 ms default has no headroom. Fix: a file-level
> `vi.setConfig({ testTimeout: 30_000 })` in those 17 specs (not the global timeout) and the guard
> `scripts/heavySpecTimeouts.spec.js`, which fails if a listed spec lacks it. The lens test itself is
> unchanged (still the analytic volume within 2%).
> **Numbers (this machine, 14 cores, `vitest run`, 270-271 files):** slowest test alone vs idle full run:
> measure lens 1036 ms vs 3439 ms; library 1121 ms vs 2089 ms; bevelPair 1031 ms vs 2130 ms; wormPair
> 2070 ms vs 4253 ms. Before: 0 timeouts in 3 idle full runs; with two full runs at once (a stand-in for the
> unit run sharing the CPU with e2e) 2-4 timeouts in each of 6 runs (library, bevelPair, gear.pair,
> gear.ring, 5.3-7.7 s each). After: 0 timeouts in 3 idle runs and 0 in 6 doubled runs; wall time idle
> unchanged (17.7-18.6 s before, 18.1-18.5 s after). Typecheck clean; unit 271 files / 6069 tests.

## Problem

During the publish pre-flight (`PUBLISH-CHECKLIST.md` §3), `npm run test:unit -- --run` failed once:

```
FAIL src/core/kernel/measure.spec.js > minimumDistance and overlapVolume — clearance between two bodies
> two overlapping spheres give the analytic lens volume
Error: Test timed out in 5000ms.
```

Run alone, that file passes (22/22), and an immediate second full run passes (227 files, 4825 tests).
So the test is correct but its 5-second default timeout is too tight when the whole suite runs at once
on this machine (about 227 workers, each spawning an environment). This is the same class as
`testing-001` and `testing-003`: a timing assumption that holds in isolation and not under load.

## Proposed fix

1. Measure the test's own duration in isolation and under the full run (`--reporter=verbose` with the
   progress reporter appended, per `CLAUDE.md` Conventions), so the budget is set from data.
2. Give the sphere-lens test an explicit per-test timeout (`test(name, fn, 20_000)`), not a global
   change, unless the measurements show every geometry test is affected.
3. If the cost is the sphere tessellation itself, reduce its segment count in the test rather than
   raising the timeout, as long as the analytic tolerance still holds (`toBeCloseTo`).

## Done means

- The full `npm run test:unit -- --run` passes 3 times in a row on this machine.
- The test still asserts the analytic lens volume with an explicit tolerance.

## Interaction model

n/a — test-only change.

## Documentation

n/a — no user-visible behaviour.

## Acceptance scenarios to re-drive

None. This is a unit-test timing fix; the kernel's behaviour is unchanged.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
