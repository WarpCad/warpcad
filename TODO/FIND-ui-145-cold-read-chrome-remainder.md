---
title: Finish the cold-read chrome fixes ui-128 did not take (Edit variable highlight, clearance chip, connector kind caption, Align strips, Align/Split glyphs)
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, split from ui-128 on 2026-11-18
depends: []
status: open
---

## Problem

`ui-128` bundled nine cold-read fixes. It shipped items 1, 2, 3 and 5 (Share near the top of File, the folded navigation toggle's
word, the Size bind buttons' axis letters and fixed columns, the mixed eye's glyph and count). These five remain, as the cold-read
panel (`FIND-testing-029`) described them, with the proposed fixes from the `ui-128` file:

4. **Edit variable gives no highlight** (`ui-059` #4). It switches the tab and scrolls the row, but the row has no outline or flash; the
   chip's menu is also clipped by the sheet edge on a phone. Proposed: a 1.5 s accent border on the target row and an *Editing w* header.
6. **A shown clearance stays on a deselected bolt with no cue** (`ui-047` #1). Both readers took the translucent red body for a stray
   object; the Objects list says nothing, and **Show hidden parts** is only visible while the bolt is selected. Proposed: a *clearance
   on* chip on the bolt's row and a persistent toggle.
7. **Connector kind row** (`core-075` stage 3 #3). Of seven icon-only buttons, the ring (Screw boss) and ring with dot (Dowel) were
   swapped by one reader and called unguessable by the other, and the half disc (Magnet) is loose. Proposed: a caption under the row
   naming the pressed kind.
8. **Align strips** (`ui-086` #1). *half −* and *inside −* differ only by a few pixels of the orange sliver. Proposed: draw the moving
   body at full width so overlap shows.
9. **Align ⇔ and Split ⫽ glyphs** (`ui-027` #1, `ui-039` #1): weak; Mirror ⇋ sits one row below Align ⇔ as a near-duplicate. The buttons
   are 38 px, under the 44 px tap size. Proposed: distinct glyphs for Align and Split; 44 px targets.

The butterfly that could not be placed on the 390 px cut plane is its own finding, `ui-143`.

## Affected files

`src/components/inspector/` (variable bind row, Objects list), `src/components/features/` (print-prep split and its connector row), the
Align popover, the Operations toolbar.

## Proposed fix

One change per item above. The folded-toggle lesson from `ui-128` applies to item 9: the phone toolbar and the sketch editor's reachable
canvas are budgeted to the pixel (`selection-inspector.e2e.js` ui-046 collapsed width ≤ 60 px; `sketch-primitive.e2e.js` ≥ 69%), so a
larger target has to find its room elsewhere.

## Effort

M.

## Testing

- App-level `*.e2e.js` for each changed control at phone, tablet and laptop; the rotating pair `npm run test:e2e:headless`.
- Re-run the `ui-059`, `ui-086`, `ui-047` reproductions, and re-run the cold read with a fresh pair.
- Re-check the `TODO/VERIFY.md` rows `core-075` stage 3 #3 and `ui-039` #1.

## Interaction model

Each item keeps its precondition and trigger; the change is the label, glyph or cue that confirms it.

## Documentation

`docs/variables.md`, `docs/snap-align.md`, `docs/print-prep.md`, `docs/selection-and-inspector.md`: update any text or picture that shows
the changed controls.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
