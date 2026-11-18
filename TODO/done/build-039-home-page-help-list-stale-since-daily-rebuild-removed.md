---
title: The warpcad.com home page has not followed the app's Help since its daily rebuild was removed
category: build
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-15 from the testing-024 drive of build-022 #10
depends: []
status: done
---

> **What shipped (2026-11-18):** option 3, which keeps your manual deploys (`b3c72b6`). In `warpcad.github.io`: `native-apps` filed under **Start here**, `import` under **History and files**, and the README's deploy paragraph corrected. In this repo: `docs/decisions/release.md` says a release does not rebuild the home page and that running its `pages` workflow is the last release step. The live page does not change until the owner pushes the home repo and runs that workflow (`TODO/OWNER.md` K0); the choice of option is `Q95`. Nothing was pushed or dispatched.

## Problem

`FIND-testing-024` row `build-022` #10 asks that every page in the app's live `help/index.json` is linked from
`https://warpcad.com/`. On 2026-11-15 it is not. The live index (version 1.17.0, commit `cf08c20`) lists 35 pages; the home page links 33.
**Missing: `native-apps` and `import`** (the home page links are `https://app.warpcad.com/#/help/<slug>`).

Cause. `scripts/help-groups.mjs` in `~/src/@WarpCad/warpcad.github.io` says an ungrouped index page goes under **More** "so a new docs
page appears on the next daily rebuild". But commit `b3c72b6` (2026-11-06 07:44 -06:00) made the `pages` workflow manual-only and
removed `schedule: cron '17 5 * * *'`. The last scheduled run was `42221730899` (2026-11-06 12:58 UTC, success), and the live home page's
`last-modified` is `Fri, 06 Nov 2026 13:02:21 GMT`. Nothing has rebuilt it since, so:

- `native-apps` (added in the app by `72ec131`, 2026-11-08) and `import` (added by `e376b5d`, 2026-11-10) have no link.
- `7219a05` (2026-11-09, `FIND-docs-032`, the agent prompting guide grouped under **The AI partner**) is also not live: the page still
  has a **More** section and no rebuild has picked the grouping up.

Every Release of the app can add Help pages, so the gap grows with each release. The owner chose manual deploys for the home page
(`b3c72b6`), so this is a decision as much as a fix.

## Affected files

- `~/src/@WarpCad/warpcad.github.io/.github/workflows/pages.yml` (the trigger)
- `~/src/@WarpCad/warpcad.github.io/docs-groups.json` (group `native-apps` and `import`)
- `~/src/@WarpCad/warpcad.github.io/README.md` (line 23 still says "on a daily schedule")
- `TODO/VERIFY.md` (`build-022` #10 note)

## Proposed fix

Pick one, then dispatch the home page's `pages` workflow once so the live page catches up:

1. Restore a `schedule` trigger (the cheapest: the workflow now runs no tests, so a daily run costs only the build).
2. Have the app's Release workflow dispatch the home page's `pages` workflow after its own deploy (needs a token with access to
   the other repository; not available to `GITHUB_TOKEN`).
3. Keep manual deploys and add "run the home page's `pages` workflow" to the release checklist (`docs/decisions/release.md`).

Either way: file `native-apps` and `import` into `docs-groups.json`, and correct the README line.

## Effort

S.

## Testing

- Re-run the `build-022` #10 comparison: every slug in the live `help/index.json` appears as an `app.warpcad.com/#/help/<slug>`
  link on `https://warpcad.com/`.
- `node --test scripts/help-groups.test.mjs` in the home repository.
- Engines: none (static page). Acceptance scenarios: none re-driven. Closed-finding regression: none.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: n/a (`README.md` of the home repository, and `docs/decisions/release.md` if option 3).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
