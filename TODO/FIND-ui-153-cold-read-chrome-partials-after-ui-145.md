---
title: Four cold-read items ui-145 improved but a fresh reader still rates partial (viewport clearance label, Split caption under Apply, Align strip size, Align and Split at a glance)
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-20 from ui-145's cold read
depends: []
status: open
---

## Problem

`ui-145`'s cold read (one fresh agent shown only phone screenshots and the five item descriptions) rated the Edit variable
highlight **clear** and four others **partial**:

1. **Clearance (`ui-047` #1).** The Objects row now says *clearance on · tap to hide*, but the translucent red body in the 3D view
   carries no label, so the reader had to look down at the sheet to connect the two. "Clearance" is also jargon.
2. **Connector kind caption (`core-075` stage 3 #3).** On a phone the caption (*Dowel · a hole for a bought dowel*) sits at the foot
   of the scrolling Split sheet and the second hint line goes partly behind the sticky Cancel/Apply bar.
3. **Align strips (`ui-086` #1).** The heavy contact bar helps, but the icons are about 20 px inside 44 px cells, so *in* and *half*
   still read as near twins at a glance; the `−` and `+` rule ends and *half* are unexplained.
4. **Align and Split (`ui-039` #1).** The glyphs are distinct now (`⇤`, `◫`, Mirror `⇋`), but the reader still rated the toolbar
   as icon-only with no text and the two buttons as looking no bigger than their neighbours (they are 44 px with a -3px block
   margin so the row height holds; the glyph box is the same size).

## Affected files

`src/components/inspector/ObjectList.vue`, `src/render/` (a label on a shown clearance body), `src/components/features/SplitSheet.vue`,
`src/components/viewport/AlignPositionIcon.vue`, `src/components/viewport/OperationsToolbar.vue`.

## Proposed fix

Label the shown clearance body in the view (a small tag such as "clearance, not a part"); keep the Split kind caption above the
scroll fold (pin it to the kind row); draw the Align icon in a larger box (the cell has room) with the block wider; give Align
and Split a visible 44 px footprint (a border or fill that shows the larger box) without growing the row.

## Effort

M.

## Testing

- App-level `*.e2e.js` for each, at phone, tablet and laptop; the rotating pair.
- Re-run `selection-inspector.e2e.js` (ui-046 collapsed width <= 60 px), `sketch-primitive.e2e.js` (>= 69 % canvas) and
  `phone-toolbar-chrome-fit.e2e.js`.
- Re-run the cold read with a fresh pair. Acceptance scenarios 4 and 5; closed findings `ui-047`, `ui-086`, `ui-145`.

## Interaction model

Each item keeps its precondition and trigger; only the label, size or glyph that confirms it changes.

## Documentation

`docs/selection-and-inspector.md`, `docs/print-prep.md`, `docs/snap-align.md`: update any text or picture that shows them.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
