---
title: pwa-update's "Reload asks first while a drag is in progress" timed out in its hook during one full-matrix run
category: testing
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-17 from the ui-108 close-out full-matrix run
depends: []
status: open
---

## Problem

During `npm run test:e2e:full` at the close of `ui-108` (tree `4a3099bf59b6`, 7963 tests, 7 workers, 29 min 17 s) one test
failed and 5,929 passed:

`App update (production build, two deploys) › Reload asks first while a drag is in progress; Later hides the banner`
(`e2e/pwa-update.e2e.js`, project not shown in the log). The error was *Test timeout of 180000ms exceeded while running
"afterEach" hook*, with the code location at `serveDeploys(...)` in the describe's `beforeEach` (line 196).

Re-run alone on all nine engine-viewport projects, the whole spec passed 36 of 36 in 31 s. So it did not reproduce, and the
mechanism is **not established**. The hook starts a local server for two stamped builds, not anything in the viewport, and
the change under test (`ui-108`, Viewport.vue extractions) touches none of it, but that is a reading of the code, not a
proof. Do not call it flaky until the cause is found (`/test` Step 3).

## Affected files

- `e2e/pwa-update.e2e.js` (the `beforeEach` at line 192, `afterEach` at line 199)
- the `serveDeploys` helper it imports

## Proposed fix

1. Find which project failed (the Playwright JSON or the `test-report-for-coding-agents/` report names it; the console log
   did not).
2. Reproduce under load: run the spec with 7 workers alongside a busy matrix, and look at whether `serveDeploys` can hang
   on a port, a temp directory or a closing server.
3. Fix the cause, or if it is a hook with no timeout of its own, give `serveDeploys` and `site.close()` bounded waits so a
   stuck server fails fast with a message, not after 180 s.

## Effort

S.

## Testing

- The spec stays green on all nine projects (36 of 36 as of 2026-11-17).
- A repro or a stated reason it cannot be reproduced; no assertion loosened.
- No acceptance scenario touched.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
