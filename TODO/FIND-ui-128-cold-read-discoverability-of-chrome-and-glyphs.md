---
title: Fix the chrome two cold users could not read (Share, orbit toggle, bind buttons, Edit variable, mixed eye, clearance, glyph rows)
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-029 cold-read panel
depends: []
status: open
---

## Problem

`FIND-testing-029` gave two independent fresh agents the production build and a goal, at 390x844 touch or 1440x900. Both agreed on each
item below (answers are in `TODO/VERIFY.md`):

1. **Share is hard to find on a phone** (`ui-078` #2). It exists only in **File ▾**, about the 11th of roughly 20 rows, and is greyed with
   *Nothing to share yet* on an empty project. Reachable in 2 taps once a shape exists. Proposed: move Share (and Export) near the
   top of File, or give it a header icon; reword the disabled reason to *Add a shape first*.
2. **The orbit toggle reads as "move"** (`ui-046` #1, cold half). With the Inspector open the navigation pad folds to a bottom-left **✥**
   (title *Show navigation controls*). Both agents found it in 2 taps but said the glyph reads as move or pan, not camera. Proposed: an
   orbit glyph plus a visible word, or keep the pad open. The real-iPhone half of the row stays open in `VERIFY.md`.
3. **The Size X / Y / Z bind buttons reflow** (`ui-059` #3). The three link buttons carry no axis letter, and once X is a chip the other two
   slide left: the Y button sits under the X chip and the Z button under the Y input (measured: `param-bind-size-y` x=12 under
   `chip-size-x` x=12). Proposed: a fixed three-column row with an empty cell for a bound axis, or an X / Y / Z letter on each button.
4. **Edit variable gives no highlight** (`ui-059` #4). It switches the tab and scrolls the row, but the row has no outline or flash; the chip's
   menu is also clipped by the sheet edge on a phone. Proposed: a 1.5 s accent border on the target row and an *Editing w* header.
5. **The mixed eye reads as "shown"** (`ui-089` #1). With one part hidden, the parent row's eye is an open eye with a half-filled pupil, which
   is the same as shown at 1x. Both agents also saw parts marked HIDDEN drawn with an open eye. Proposed: a distinct partial glyph and a
   tooltip *1 of 6 parts hidden*.
6. **A shown clearance stays on a deselected bolt with no cue** (`ui-047` #1). Both agents read the translucent red body as a stray object;
   the Objects list says nothing, and **Show hidden parts** is only visible while the bolt is selected. Proposed: a *clearance on* chip on the
   bolt's row and a persistent toggle.
7. **Connector kind row** (`core-075` stage 3 #3, cold half). Of the seven icon-only buttons, the ring (Screw boss) and ring with dot (Dowel)
   were swapped by one agent and called unguessable by the other, and the half disc (Magnet) is loose. Both asked for the selected kind's name
   to show beside the row. Proposed: a caption under the row naming the pressed kind.
8. **Align strips** (`ui-086` #1, cold half). *half −* and *inside −* differ only by a few pixels of the orange sliver; the column headers are
   what tell them apart. Taps were reliable (21 of 21, no gaps) in emulation. Proposed: draw the moving body at full width so overlap shows.
9. **Fillet, Chamfer and Mirror glyphs** (`ui-027` #1, `ui-039` #1): fillet and chamfer were both guessed right (so those rows' cold half is OK);
   Align ⇔ and Split ⫽ were weak, and Mirror ⇋ sits one row below Align ⇔ as a near-duplicate. The buttons are 38 px, under the 44 px tap size.
   Proposed: distinct glyphs for Align and Split; 44 px targets.

Not answered: a butterfly could not be placed on the 390 px cut plane in either run (`core-075` stage 2 #2). Taps near the edge were
rejected as *outside the cut face* with the message under the fold, and no marker was drawn. If that is real, it is a bug in its own right.

## Affected files

`src/components/layout/` (File menu, header), `src/components/viewport/` (navigation pad), `src/components/inspector/` (variable bind row, Objects
list eye), `src/components/features/` (print-prep split), the Align popover, the Operations toolbar.

## Proposed fix

One change per item above; split into sub-tasks if the owner prefers. Items 1, 2, 3 and 5 first.

## Effort

M.

## Testing

- App-level `*.e2e.js` for each changed control at phone, tablet and laptop; the rotating pair `npm run test:e2e:headless`.
- Re-run the `ui-046`, `ui-059`, `ui-086`, `ui-089` and `ui-047` reproductions, and re-run the cold read with a fresh pair.

## Interaction model

Each item keeps its precondition and trigger; the change is the label, glyph or cue that confirms it.

## Documentation

`docs/selection-and-inspector.md`, `docs/variables.md`, `docs/snap-align.md`, `docs/print-prep.md`: update any text or picture that shows the
changed controls.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
