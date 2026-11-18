---
title: Give a broken History step one name, one amber treatment and a repair button that is visible without scrolling
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, split from ui-129 on 2026-11-18
depends: []
status: open
---

## Problem

`ui-129` made the broken step's message plain (*This step can't be built because a later step already changed the part it works on…*).
The layout half of the `data-006` #1 cold read remains: two fresh readers found

- the row greyed with an *inactive* chip and a red *broken* chip, while the Inspector's box for the same problem is amber and says
  *1 item built on Cube 1 no longer builds*, with **Resolve…**; the History route says **Re-link to the moved step**. Two names, two colours;
- the **Re-link to the moved step** button at the bottom of a roughly 130 px panel, so a phone user has to scroll to find it;
- the Resolve dialog saying *Nothing has changed yet* after the break.

## Affected files

`src/components/timeline/TimelineRow.vue`, `src/components/timeline/TimelineStrips.vue`, the Inspector's repair box
(`src/stores/repairDialog.js` and its component), `docs/timeline.md`.

## Proposed fix

One name for the repair (*Re-link*) in both routes, one amber treatment for a broken step everywhere, and the button on the selected row
itself (above the fold of the 130 px panel). Check the 390 px layout: the History panel's height is budgeted (`TODO/ui-062`).

## Effort

M.

## Testing

- App-level `*.e2e.js` for the row and the Inspector box at phone, tablet and laptop; the rotating pair `npm run test:e2e:headless`
  (`e2e/timeline-panel.e2e.js` already drives the broken row).
- Re-run the `data-006` reproduction and `ui-062`'s phone check; re-run the cold read with a fresh pair.

## Interaction model

Precondition: a rolled-back timeline with a body moved after the roll-back, so a later step breaks. Trigger: the Re-link button on the row, or
**Resolve…** in the Inspector. Feedback: the step builds again, as one Undo step.

## Documentation

`docs/timeline.md` (the Re-link section and its picture).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
