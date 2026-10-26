---
title: Make the Align popover's "in" and "half" icons distinguishable at the current button size
category: ui
kind: finding
priority: medium
model: sonnet
depends: []
status: done
---

> **Shipped as specified** (option B). Not taken: nothing. The point-target case drops the target rect and draws the centre line solid, as proposed. Step 6 (hand-driving acceptance scenarios 1 and 3) was not done before commit.

## Problem

Reported by the user on 2026-10-26 while testing Align/Snap (screenshot: Cylinder 1 aligned to
Cube 1 at laptop width). **In the seven-position rows, the two "in" buttons and the two "half"
buttons are nearly the same picture**, so the user cannot tell from the icon which one does what
and has to hover for the tooltip or just try them. The buttons must not get bigger; the icon has to
carry the meaning inside the same ~88 × 44 px cell.

Why it happens, all in `src/components/viewport/AlignPositionIcon.vue` (`ui-086`):

- The 24-unit viewBox draws the target box as x 7–17 (10 wide) and the moving block as 6 wide.
  A 6-wide block is *more than half* of a 10-wide target, so the two positions that are meant to
  differ by "flush with the edge" versus "touching the centre" land one unit apart:
  - **inside −** — block min face on the target's − edge: block spans **7–13**.
  - **half −** — block max face on the target's centre (12): block spans **6–12**.
  - **inside +** and **half +** are the mirror image, also one unit apart.
  One unit of 24, rendered at roughly 26 px, is about one pixel. The block also pokes a pixel past
  the target's edge in the "half" case, which reads as a rendering glitch rather than a meaning.
- Nothing in the drawing marks the target's **centre**, which is the one thing "half" is defined
  against ("your + face sits on the target's centre"). The eye has no landmark to compare to, so
  the only cue is a sub-pixel offset.
- The block and the box use the same hue family in the dark theme at this size (amber block, teal
  outline), and the block has no outline, so its edge position is hard to read against the box's
  stroke.

The same icon is used for the World-origin target, where the seven positions legitimately collapse
to three pictures; that case must keep working.

## Affected files

- `src/components/viewport/AlignPositionIcon.vue` — the geometry constants, `ANCHORS`, the SVG
- `src/components/viewport/AlignPositionIcon.spec.js` — the geometry assertions
- `src/components/viewport/AlignPopover.vue` — only if the tooltip/`aria-label` text needs to match
  the new picture (the column headers `in` / `half` are the existing labels)
- `docs/snap-align.md` — the legend of the seven icons, if the page shows one
- `e2e/docs/` — the Align shot that includes the grid, regenerated

## Proposed fix

**Chosen by the user on 2026-10-26 from rendered mockups: option B, a narrow block plus a dashed
centre line.** The cell size stays the same; only the drawing changes.

1. **Narrow block, wider target.** In the 24-unit viewBox the target box is x **4–20** (16 wide,
   centre 12) and the moving block is **4 wide** (a quarter of the target). Block x-origin per
   position, in button order:

   | Position | outside − | inside − | half − | center | half + | inside + | outside + |
   |---|---|---|---|---|---|---|---|
   | Block x | 0 | 4 | 8 | 10 | 12 | 16 | 20 |

   Adjacent positions are now at least 2 units apart, and `inside −` vs `half −` (and `inside +`
   vs `half +`) are 4 apart, against 1 today. `ANCHORS` and its comments change to match; the
   block spans 8–12 for `half −` (its + face on the centre) and 12–16 for `half +`.
2. **Dashed centre line.** A 1 px vertical rule at x = 12 from y = 2 to y = 22 (2 units past the
   box top and bottom), `stroke-dasharray="2 1.5"`, in `--role-target`. It is the landmark "half"
   is measured against, and it makes "center" read as "on the line". Against the World-origin point
   target the line *is* the target, so it is drawn solid and the zero-width rect is dropped, not
   doubled.
3. Colours stay on the existing role tokens (`--role-target`, `--role-moving`); nothing hardcoded.

Not taken, from the same mockup sheet: a 1 px block outline (option C, barely visible at real
size) and shading the covered half for the "half" positions (option D, faint at real size and adds
clutter). Revisit D only if the phone-width snapshot still reads poorly. Also not proposed:
relabelling the `in` / `half` column headers; the icon should do the work and a longer header will
not fit the cell.

## Interaction model

- **Precondition** — unchanged: the Align popover is open (1 or 2 selected solids).
- **Trigger** — unchanged: the position buttons in each axis row.
- **Feedback** — this task *is* the feedback: before pressing a button the user can read from its
  icon where the moving body will end up relative to the target, in particular that "in" means flush
  with the target's edge and "half" means up to the target's centre line.
- **Placement** — n/a (no geometry is created).
- **Selection response** — unchanged.
- **Selection count** — unchanged from the existing Align/Snap rules.
- **Small-screen behavior** — unchanged cell size at 390 px. The icon must still read at the phone
  button size, so the snapshot at phone width is part of the acceptance.

## Documentation

- **Page** — `docs/snap-align.md` (update): the seven-position legend shows the new icons, with a
  line each for **in** and **half** that names the centre line.
- **Example** — "Select Cube 1 and then Cylinder 1 and tap **Align**. In the **X** row, the second
  button from the left has the block against the box's left edge; the third has the block touching
  the dashed centre line. Tap the third and the cylinder's right face lands on the cube's centre,
  covering its left half."
- **Media** — update the existing Align grid shot under `e2e/docs/` (the one that embeds the
  seven-position grid), regenerate with `npm run docs:media`. No new file unless the existing shot
  does not contain the grid; if so, add `e2e/docs/align-icons.docs.js` and embed it.

## Effort

S. One component, one spec, a regenerated screenshot.

## Testing

- **Unit** — `AlignPositionIcon.spec.js`: for each of the seven positions (box target and point
  target) assert the block's x-extent with `toBeCloseTo`, and assert **a minimum spacing between
  neighbouring positions** (at least 2 units for every adjacent pair, and `inside −` vs `half −`
  and `inside +` vs `half +` at least 3) so a future constant change cannot silently bring the
  collapse back. Assert the block never extends past the target's edge in an inside or half
  position, that the centre-line element is present, and the point-target case still reports
  three distinct pictures.
- **E2E** — extend `e2e/snap-align-operation.e2e.js` (navigates to `/`): open Align, assert the
  `in` and `half` buttons' icon `<svg>` markup differs (not just their `aria-label`), and capture a
  snapshot of the position grid at **all three viewports**. Cross-engine: Chromium only is enough
  for the assertion; the snapshot runs at all three engines because stroke dash rendering and
  sub-pixel positions of SVG strokes differ in WebKit.
- **Acceptance scenarios to re-drive, by hand** — 1 (two independent primitives) and 3
  (snap-placement of a kit assembly): after choosing "half −" from the icon alone, confirm the
  result is what the icon showed.
- **Closed findings to re-run** — `ui-086` (one seven-position row per axis; the icon direction rule
  that −/left and +/right hold on Z too must survive) and `ui-060` (the crossed outside/half
  orientations: half − still uses `center+`/`max`).

## Open questions

- None blocking. If the real-device check shows the dashes shimmer at 26 px in WebKit, fall back
  to a solid 1 px line at reduced opacity; the meaning does not depend on the dashes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
