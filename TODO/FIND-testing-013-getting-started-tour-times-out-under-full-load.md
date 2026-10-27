---
title: The getting-started docs tour times out at 30 s in the full e2e matrix, and passes alone
category: testing
kind: finding
priority: medium
model: sonnet
depends: []
status: open
---

## Problem

In the full headless e2e run on 2026-10-27 (for core-075 stage 1, 4304 passed, 1 failed, 1313 skipped),
`e2e/docs/getting-started.docs.js` test `docs media: getting started tour › tour` failed with
`Test timeout of 30000ms exceeded`. The stall is reported at `getting-started.docs.js:203`
(`page.waitForTimeout(700)`, the dwell before the export download), called from line 256. A 700 ms
wait cannot take 30 s on its own, so the test was stuck somewhere else for most of its budget, or the
page stopped responding while the matrix was loaded.

Run alone, the same test passes on `docs-laptop` in two consecutive runs (6 passed, 12 skipped; the
tour spec is laptop-only, line 19). That is the same pattern as `testing-008` (print-prep under load),
and it has not been root-caused. Until it is, it counts as red under `/test` Step 3.

## Affected files

- `e2e/docs/getting-started.docs.js` (the `tour` helper at ~`:180`–`:210`, the test at `:251`)
- `test-report-for-coding-agents/docs-media-getting-started-tour-tour-5483/report.md` (the failing run's report, from 2026-10-27)

## Proposed fix

1. Re-run the full matrix once and check whether the same test fails again. Record whether it is the
   same project and the same stall line.
2. If it reproduces, find what the page is waiting on at the stall. Add a trace or a `data-*` settled
   signal before the step that hangs, rather than a longer timeout. Do not raise the 30 s budget to
   hide it.
3. If it does not reproduce, log the run count in this file and close it as load-only with the evidence.

## Effort

S to find, M if the stall is in the app.

## Testing

- The full e2e matrix run twice in a row, with no failures in `getting-started.docs.js`.
- Engines: the tour is laptop-only, so Chromium and WebKit laptop projects first, Firefox after.
- Acceptance scenarios: none (docs media, not a user flow).
- Closed-finding regression: none.

## Documentation

None; no user-visible control changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
