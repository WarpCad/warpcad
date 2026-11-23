---
title: Two Align screenshots fail on main on firefox-laptop and webkit-phone, each about 15 px taller than the baseline (help-from-align, align-popover-seven-positions)
category: testing
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-22 from ui-155's pair run
depends: []
status: done
---

> **What shipped (2026-11-23).** The growth was intended, not a defect: by the time this ran it was 19 px (15 from `ui-153`'s Align caption, about 4 more from `ui-159`'s axis rule, mirrored-half brackets and "the two halves mirror" caption). The diff images on both engines show all of that content whole, nothing clipped or overflowing, the popover still on screen at 390 px. Refreshed the four baselines (`help-from-align` and `align-popover-seven-positions` on firefox-laptop and webkit-phone) through the scoped `-u` run; no `src/` change. Both specs green on the two projects, the rotating pair clean.

## Problem

The rotating pair firefox-laptop + webkit-phone is red on `main` (reproduced with `ui-155`'s files reverted, 4 failures, 43 passed):

- `e2e/help.e2e.js:148` *? in the Align pop-up opens its docs section; closing returns to the pop-up intact*, `help-from-align.png`, 28357 px
  (firefox-laptop) and 18200 px (webkit-phone) differ against the 0.03 ratio.
- `e2e/snap-align-operation.e2e.js:670` *the popover stays on-screen and reachable at 390px width*, `align-popover-seven-positions.png`,
  expected 352x469 received 352x484 (firefox-laptop), expected 352x440 received 352x455 (webkit-phone).

Both are 15 px taller than the baseline, so the Align pop-up grew a line (likely `ui-153`'s Align caption); that is a layout change, not noise.
`testing-042` refreshed the same baselines once before.

## Affected files

`e2e/snap-align-operation.e2e.js-snapshots/`, `e2e/help.e2e.js-snapshots/`; `src/components/viewport/AlignPopover.vue` if the growth is a defect.

## Proposed fix

Look at the diff images. If the extra line is intended (`ui-153`), refresh both baselines on the two engines
(`npx playwright test e2e/help.e2e.js e2e/snap-align-operation.e2e.js --project=firefox-laptop --project=webkit-phone -u`) and run the pair;
if not, fix the popover. `ui-159` also changes Align strips, so do this after it or fold the refresh into it.

## Effort

S.

## Testing

- Both specs green on all nine projects. A clean rotating pair.

## Interaction model

None (a test baseline).

## Documentation

None.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
