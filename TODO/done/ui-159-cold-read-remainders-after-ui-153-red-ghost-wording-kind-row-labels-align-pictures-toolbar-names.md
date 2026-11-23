---
title: A cold read after ui-153 still rates four chrome items partial (red ghost tag is jargon and floats, Split kind icons unlabelled, Align pictures small and the rule unexplained, Align and Split unnamed in the toolbar)
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-22 from ui-153's cold read
depends: []
status: done
---


> **Shipped 2026-11-23.** All four items, with one default taken: the red tag is still a fixed line (owner Q117, recommended default), now worded *Red area: space kept free around X, not a real part*, with the Objects row *red area on · tap to hide*. Split kind buttons: filled pressed state, short name under each from 641 px up, captions with no printer assumption, the title line pinned above the kind group on the phone sheet. Align: the rule reads *− toward −X −Y −Z … toward +X +Y +Z +* and the two *half* headers are bracketed in the accent colour. Toolbar: Align and Split carry a one-word label in the icons tier. A fresh cold read rated the tag, the Align strips and the toolbar PARTIAL (tag untied to the red shape; strip text small) and the Split row CLEAR. The Split and Align GIFs were not re-made (stills were).

## Problem

`ui-153`'s cold read (one fresh agent shown only the phone screenshots and the four item descriptions) rated all four items
better than before but still **partial** or **unclear**:

1. **Red ghost tag.** The tag *Red ghost: room kept clear around Bolt / screw 1, not a part* explains the red body without
   opening a sheet and "not a part" is plain, but "ghost" and "room kept clear" are loose words, the tag floats mid-screen with no
   tie to the red object, and the ghost can pass for a red solid bolt. The Objects row (*red ghost on · tap to hide*) repeats "ghost".
2. **Connector kind caption.** The caption is now pinned at the top of the sheet and clear of Apply, and the pressed kind is named.
   Still: the pressed icon's state is weak (all seven are outlined, the pressed one only slightly bolder), the other six are
   unlabelled until pressed, and "printed post and hole" assumes 3D printing. The sheet's own title line is clipped behind the
   toolbar when the sheet is scrolled to the kind row.
3. **Align strips.** The pictures are 34 px now, and the idle caption defines out, in and half, but the reader still had to read the
   words to tell *in* from *half*, found *− low side … high side +* unexplained (which axis direction?), and did not see that the two
   *half* columns mirror each other.
4. **Align and Split in the toolbar.** They are full size with a heavier outline, but the reader still could not name them from the
   glyph alone; Split reads as a generic panel icon next to the scissors (Bisect).

## Affected files

`src/components/viewport/ClearanceTag.vue`, `src/components/inspector/ObjectList.vue`, `src/components/features/SplitSheet.vue`,
`src/components/viewport/AlignPositionIcon.vue`, `src/components/viewport/AlignPopover.vue`, `src/components/viewport/OperationsToolbar.vue`.

## Proposed fix

Plain words for the tag (*Red area: space kept free around Bolt, not a real part*) and its Objects row; anchor the tag to the body
(a leader or placing it by the red body's projected centre). A strong pressed state for the kind buttons and a short name under
each on a tablet. Name the Align axis in the rule (*− toward −X … toward +X*) and mark the mirrored *half* columns. A one-word
label under Align and Split in the icons tier if it fits the row, or a first-use hint. Owner Q117 asks whether to do the anchored tag.

## Effort

M.

## Testing

- App-level `*.e2e.js` for each at phone, tablet and laptop; the rotating pair.
- Re-run `selection-inspector.e2e.js`, `sketch-primitive.e2e.js`, `phone-toolbar-chrome-fit.e2e.js`.
- Cold read again with a fresh agent. Acceptance scenarios 4 and 5; closed findings `ui-047`, `ui-086`, `ui-145`, `ui-153`.

## Interaction model

Each item keeps its precondition and trigger; only the label, wording or pressed state that confirms it changes.

## Documentation

`docs/selection-and-inspector.md`, `docs/print-prep.md`, `docs/snap-align.md`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
