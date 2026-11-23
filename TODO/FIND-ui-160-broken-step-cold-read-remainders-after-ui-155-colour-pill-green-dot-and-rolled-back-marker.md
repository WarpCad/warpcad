---
title: A cold read after ui-155 still rates one-problem-one-colour partial (pill and box tint read as two ambers, a green save dot and a "fits" chip beside the warning) and the rolled-back marker against "inactive" unclear
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-22 from ui-155's cold read
depends: []
status: open
---

## Problem

`ui-155` led the Inspector's box with the step number (*Step 3: Chamfer Top (+Z) 5 mm, built on Cube 1.*), added the History row's own `broken`
chip to it, named its button **Re-link** where it re-links on the spot, reworded the reason to say what Re-link does and brought the selected
row's actions whole into the phone sheet. A fresh agent shown only the two phone screenshots rated visibility, the step number match, the
reason against the row order and the action buttons **clear**, and "one problem, one name, one colour" **partial** again:

1. The colour reads as two ambers: the chip is outlined in amber on an amber-tinted row in History, and on a beige box in the Inspector.
2. A solid **green** dot (the save status, top right) and the green **fits** chip (*build volume*) sit next to a broken warning in the Inspector, and the
   reader took the green for "all fine".
3. *Rolled back to step 2 of 4*, the marker *New steps insert here* above step 3, and step 3 being `broken` but not `inactive` do not obviously
   describe one position.
4. The Inspector's box is cut off before the reason, so *what broken means* is only on the History row; the History reason offers *edit the
   earlier step* and the box does not.

## Affected files

`src/components/inspector/DependentsBanner.vue`, `src/components/timeline/TimelineRow.vue`, `src/components/display/BaseChip.vue`,
`src/components/timeline/TimelinePanel.vue`, `src/components/display/SaveStatus.vue`.

## Proposed fix

Fill the chip (`tone="warn"` solid) in both places so it is one swatch; a one-line "why" under the box's text on tap or on the sheet's wide
layout; make the strip's wording (*Rolled back to step 2 of 4*) and the marker say the same thing (*Steps inserted here come after step 2*).
Judge the green dot and the fits chip on their own: they are not part of the broken step and may need no change.

## Effort

S.

## Testing

- App-level `e2e/timeline-panel.e2e.js` at phone, tablet and laptop; the rotating pair.
- Re-run `ui-146`, `ui-154` and `ui-155`'s reproduction (`data-006` roll back, move, break) and the cold read with a fresh agent.
- Acceptance scenarios 12 and 15.

## Interaction model

Precondition: a rolled-back timeline with a body moved after the roll-back, so a later step breaks. Trigger: **Re-link** on the row or in the
Inspector. Feedback: the step builds again, as one Undo step.

## Documentation

`docs/timeline.md` (the Re-link section; regenerate the picture only if the row or box changes).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
