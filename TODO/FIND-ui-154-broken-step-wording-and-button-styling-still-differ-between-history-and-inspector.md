---
title: A broken step's wording and button styling still differ between History and the Inspector (cold read of ui-146 rated one name and colour PARTIAL)
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-20 from ui-146's cold read
depends: []
status: open
---

## Problem

`ui-146` gave a broken History step the amber treatment and a **Re-link** button on the row (visible without scrolling), and renamed
the Inspector's **Resolve…** to **Re-link…**. One fresh agent shown only the two phone screenshots rated the repair button's
visibility **clear** and the "one name, one colour" complaint **partial**:

- the row says *broken* and *This step can't be built…*; the Inspector box says *1 item built on Cube 1 no longer builds*, and never
  says *broken*;
- the row's **Re-link** is a solid blue primary button and the Inspector's **Re-link…** is an outlined one;
- the Inspector box does not say which item is broken (the chamfer, step 3), and sits among unrelated controls;
- the reason says *a move made after you rolled back* while the move shown is step 2, above the rollback marker (the marker sits
  below the move because the move landed at the marker);
- on a phone, with the Inspector sheet scrolled to its end, the box lies under the sticky Delete button (the reader noted Delete
  overlapping Color).

## Affected files

`src/components/inspector/DependentsBanner.vue`, `src/components/timeline/TimelineRow.vue`, `src/core/userReason.js`,
`src/components/inspector/Inspector.vue` (the sticky Delete footer over the end of the scroll), `docs/timeline.md`.

## Proposed fix

Say the same words in both: *broken* in the box (*1 step built on Cube 1 is broken: Chamfer Top (+Z)…*), the same button variant
(primary) in both, the broken step named in the box, and the reason reworded so it does not claim the move came after the rollback
when it is above the marker. Give the Inspector's scroll area bottom padding equal to the sticky footer so nothing sits under Delete.

## Effort

S.

## Testing

- App-level `*.e2e.js` (`e2e/timeline-panel.e2e.js`) at phone, tablet and laptop; the rotating pair.
- Re-run `ui-146`'s reproduction (`data-006` roll back, move, break) and the cold read with a fresh agent.
- Acceptance scenarios 12 and 15.

## Interaction model

Precondition: a rolled-back timeline with a body moved after the roll-back, so a later step breaks. Trigger: **Re-link** on the row,
or **Re-link…** in the Inspector. Feedback: the step builds again, as one Undo step.

## Documentation

`docs/timeline.md` (the Re-link section; regenerate the picture only if the row or box changes).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
