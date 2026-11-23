---
title: Show on a merge banner opens History but leaves the conflicted row, its reason and Suppress below the fold
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-23 from the `testing-043` drive of scenario 22
depends: []
status: open
---

## Problem

Acceptance scenario 22 step 6 says **Show** "opens History on the conflicted row, which has a red broken chip and a reason
readable as text". Driven by hand on 2026-11-23 (`testing-043`, production build, Chromium at laptop 1440x900, a fresh profile):
after the banner `Merged 1 step from b2.warpcad — 1 step conflicted`, **Show** opened the History sheet with the fifth step
(the Fillet) selected, but the sheet's list (`data-testid="timeline-rows"`, `scrollHeight` 299 against `clientHeight` 178) stayed
at `scrollTop` 0. Rows 1 to 4 were on screen. The conflicted row's chip sat at y 915, its reason at y 946 and **Suppress** at y 968
in a 900 px window, so a person had to notice the list scrolls and scroll it before seeing what the banner promised. Playwright's
`click()` scrolls an element into view on its own, which is why `e2e/merge-file.e2e.js` passes (it asserts `toBeVisible`, which is
not "inside the window").

Likely cause: `TimelineRow.vue` (the `watch` on `props.selected`, `TODO/ui-155`) scrolls a row into view only when `selected`
**changes**. **Show** selects the row and opens the panel in the same tick, so the row mounts already selected and the watcher
never fires (it has no `immediate`). Opening History first and then pressing **Show** probably works. The 2026-10-12 first
drive of scenario 22 already noted the History action bar as cramped at 900 px height.

## Affected files

- `src/components/timeline/TimelineRow.vue` (the `props.selected` watcher, around line 120)
- `src/components/timeline/TimelinePanel.vue` (whether the panel should scroll its selected row on mount)
- `e2e/merge-file.e2e.js` (assert the reason and **Suppress** are inside the window, not only visible)
- `docs/timeline.md` or the merge docs page, only if its wording changes

## Proposed fix

Bring the selected row into view when the History panel mounts with a row already selected: an `immediate: true` on that watcher (guarded
so a row selected on mount scrolls once), or a `scrollIntoView({ block: 'nearest' })` from the panel after it mounts with a selection.
Keep `block: 'nearest'` so a row already in view does not move. Check the 390 px sheet, whose list is budgeted (`TODO/ui-062`).

## Effort

S.

## Testing

- Extend the conflict test in `e2e/merge-file.e2e.js` (it already clicks **Show**): after **Show**, the conflicted row, `timeline-broken-reason`
  and `timeline-suppress` have boxes inside `window.innerHeight` (not only Playwright-visible), on all three viewports. RED first.
- Rotating pair `npm run test:e2e:headless`; the panel is touch UI, so include the phone project.
- Acceptance scenarios touched: 22 (step 6) and 23 (step 7, the same banner and **Show**). Re-run `ui-155`'s original reproduction
  (a selected row's reason and action bar in view on a phone) and `ui-062`'s phone check against the new code.

## Interaction model

Precondition: a merge that conflicted, so the banner shows **Show**. Trigger: **Show** on the banner (`merge-banner-show`). Feedback:
History opens with the conflicted row selected and fully in view, its red chip, its reason and **Suppress** on screen.

## Documentation

No new page. If `docs/` describes **Show**, its example already says it opens History on the conflicted row; confirm it still reads true.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
