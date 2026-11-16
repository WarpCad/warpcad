---
title: Refresh the help-from-align screenshots, stale since the Align docs page gained text
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-16 from the ui-121 and build-034 runs
depends: []
status: open
---

## Problem

`e2e/help.e2e.js` ("? in the Align pop-up opens its docs section; closing returns to the pop-up
intact") compares the Help sheet against `e2e/help.e2e.js-snapshots/help-from-align-<project>.png`.
`docs/snap-align.md` gained text in `e376b5da` (`ui-107`, 2026-11-10), after the baselines were last
regenerated in `e6f95bba` (`testing-007`). The page's text and nav list reflow, so the comparison
fails wherever the reflow passes the 0.03 ratio:

- `firefox-phone`: 9 526 px (0.04), red on `main` on 2026-11-15 in four tasks' pair runs. `build-034`
  refreshed this one baseline (`026dad19`), out of its scope, after checking the cause.
- `firefox-tablet`: 29 466 px (0.04), red in `ui-121`'s pair run on 2026-11-16, and red with that
  task's docs edit reverted.

The other seven projects' baselines are from the same date and have not been checked. A red pair
run does not advance the rotation, so every task's e2e run repeats the failing pair and needs a
`Known-failures:` trailer to push.

## Affected files

- `e2e/help.e2e.js-snapshots/help-from-align-*.png` (nine projects)

## Proposed fix

1. Run the one test on all nine projects with no update, and record which fail and by how much.
2. Look at each failing actual image against `docs/snap-align.md` as it is now. Confirm the
   difference is only the new text's reflow, not a broken layout (clipped text, overlapping nav,
   a missing heading). A layout fault is a separate finding, not a baseline refresh.
3. Refresh only the baselines that fail, with
   `npx playwright test e2e/help.e2e.js -g "Align pop-up" --project=<p> --update-snapshots`, one project
   at a time. Never `docs:gifs`.

## Testing

- The test passes on all nine projects afterwards.
- The next `npm run test:e2e:headless` pair run is green for this test, and the rotation advances.
- No acceptance scenario changes; this is a test baseline.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
