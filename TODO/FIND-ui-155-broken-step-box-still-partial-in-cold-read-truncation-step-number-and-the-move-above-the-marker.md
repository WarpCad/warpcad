---
title: The broken-step box and row still read PARTIAL in a cold read (box truncates before the step number, pill against plain text, a move listed above the rollback marker explains a break)
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-20 from ui-154's cold read
depends: []
status: open
---

## Problem

`ui-154` made the Inspector box say *broken*, name the step, use the primary button and stop saying the move came after the rollback.
One fresh agent shown only the two phone screenshots rated visibility **clear** and "one problem, one name, one colour" **partial** again:

1. On a phone the box truncates: *1 step is broken: Chamfer Top (+Z) 5 mm (…*, so the **step number** (3) that the History row shows is cut off.
2. *broken* is an outlined pill on the History row and plain text in the box; the buttons read **Re-link** and **Re-link…** (the ellipsis
   is honest where a dialog can open, and absent where it cannot).
3. The reason says *a move you made while you were rolled back*; the move is listed at step 2, **above** the broken step 3, and the
   marker *New steps insert here* sits right above step 3, so the reader cannot square "inserted while rolled back" with the order.
4. With the broken row selected on a phone the row's Edit / Suppress / Move up buttons are clipped by the stacked Cube 1 and Library peek bars.

## Affected files

`src/components/inspector/DependentsBanner.vue`, `src/components/timeline/TimelineRow.vue`, `src/core/userReason.js`, `src/components/timeline/`
(the actions bar at 390 px), `docs/timeline.md`.

## Proposed fix

Lead the box with the step number (*Step 3 is broken: Chamfer Top (+Z) 5 mm, built on Cube 1.*) so truncation costs only the tail; consider
a `broken` chip in the box; reword the reason to say what Re-link does (*Re-link points this step at the cube's new position*) rather than
where the move happened; make the selected broken row's actions reachable at phone height.

## Effort

S.

## Testing

- App-level `e2e/timeline-panel.e2e.js` at phone, tablet and laptop; the rotating pair.
- Re-run `ui-146` and `ui-154`'s reproduction (`data-006` roll back, move, break) and the cold read with a fresh agent.
- Acceptance scenarios 12 and 15.

## Interaction model

Precondition: a rolled-back timeline with a body moved after the roll-back, so a later step breaks. Trigger: **Re-link** on the row, or
**Re-link…** in the Inspector. Feedback: the step builds again, as one Undo step.

## Documentation

`docs/timeline.md` (the Re-link section; regenerate the picture only if the row or box changes).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
