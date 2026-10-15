---
title: measure.spec.js lens-volume test times out under the full unit run
category: testing
kind: finding
priority: medium
model: sonnet
depends: []
status: open
---

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
