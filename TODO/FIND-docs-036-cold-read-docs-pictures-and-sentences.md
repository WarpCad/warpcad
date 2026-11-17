---
title: Fix the docs pictures and sentences two cold readers could not follow (tour hole, subtract order, re-link, Align names, Rotation X, kept-Pi holes)
category: docs
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-029 cold-read panel
depends: []
status: open
---

## Problem

`FIND-testing-029` ran two independent fresh agents per row, with no project context, over frames and screenshots of the docs media and
the docs text. Both agents agreed these do not read without help:

1. **`tour.gif`** (`docs-019` #1): each step is on screen about 3 s, which is fine, but neither agent could see the hole in the result at
   640 px, and the Subtract press falls between sampled frames. A stranger cannot tell Subtract did anything.
2. **`timeline-relink.gif`** (`docs-020` #2): at 500 px the amber chip text is about 5 px tall and is on screen for about one sampled
   frame. The text shown is *1 item built on Cube 1 no longer builds* with a **Resolve…** button, not the *broken* chip and **Re-link**
   press that `docs/timeline.md` describes, and no press is visible.
3. **`boolean-subtract-order.gif` and `boolean-subpart-operand.gif`** (`docs-011` #1): the base is named only by small grey text under the
   toolbar (*Cube 1 then Cylinder 1 - first is the base*), the two results are never on screen together, and nothing says which
   solid was cut.
4. **`snap-align.md` "outside +/−"** (`docs-012` #2): the buttons on screen are headed *out, in, half, ctr, half, in, out* with a − and +
   at the ends, while the page and the picture's footer say *outside +* and *X outside −*. A reader has to match by position. Both
   agents found the page's rule ("named for where the moving shape ends up") consistent; the labels, not the rule, are the problem.
5. **`snap-align.md` step 3 of the Repeat example** (`ui-069` #6): *type `180` into Rotation X to turn it head-up* is easy to pass over.
   Both agents wanted it to say Rotation X is in degrees, why the bolt starts head-down, and how to check it worked.
6. **Moving the Pi after bolts or holes exist** (`core-061` #3, `core-064` #2): both agents read "only the Pi moves" and "drilled holes
   stay put" as a bug until they met the sentence, and found `hardware-library.md`'s *Each Subtract reads the Pi as it was at that step*
   dense (jargon: "Subtract", "reads the Pi as it was").

## Affected files

- `docs/media/tour.gif`, `docs/media/timeline-relink.gif`, `docs/media/boolean-subtract-order.gif`, `docs/media/boolean-subpart-operand.gif`
  (regenerate through the docs movie scripts; never run `npm run docs:gifs`, see the memory note: encode through a scoped `moviesDir`)
- `docs/snap-align.md`, `docs/hardware-library.md`, `docs/timeline.md`

## Proposed fix

1. Tour: orbit or zoom onto the part before the result hold, hold the result about 2 s, show the Subtract press.
2. Relink GIF: crop to History and the Inspector's amber box, or render at 640 px, and show the press; make the caption match what the
   panel says (see also `FIND-ui-129`, which unifies the *Resolve…* / *Re-link* names).
3. Boolean GIFs: a label on the canvas naming the base ("Cube is the base: the cylinder is cut out of it") and the two results side by
   side at one camera angle.
4. Name the buttons the way the screen does: *In the X row, tap the rightmost **out** button (the footer then reads X outside +)*.
5. Step 3: *A new bolt starts head-down. In the Inspector, type `180` into **Rotation X** (degrees) to turn it head-up, and check the
   head is on top.*
6. Kept-Pi bullet: *Holes you already drilled stay where they were when you move the Pi. Holes you drill after the move use its new
   place. To move the holes with the Pi, change its model in the Inspector instead.* Add one line on the Pi-move case in Repeat:
   *Bolts you placed on the Pi stay where they were; move each, or Edit an earlier step in History.*

## Effort

S–M (two GIF re-records, four sentences).

**Added 2026-11-17 (owner, /owner, OWNER.md Q13 and Q14):**
- `rpi-keepout.png` (`docs-014` #3): label the red keep-out block in the picture (e.g. *Keep-out: power connector*), show **Show hidden parts** in the frame, and add one sentence on the page saying what the block is for.
- `resize-fit.gif` and the Fit example (`docs-013` #2): state the result in the text (*X 60 → 30 makes Y and Z 40 → 20, because Keep aspect ratio applies the smallest ratio to all three*), and re-record the GIF so Y and Z visibly update. Re-record only that movie through a scoped `moviesDir`, never `npm run docs:gifs` (it rewrites every GIF).

## Testing

- `npm run help:build` (docs text changes), `npm run spdx`, `e2e/docs-media.spec.js` for the pictures.
- Re-run the panel on the changed rows: a fresh pair reads the new frames.

## Interaction model

Not UI-touching.

## Documentation

- **Pages**: the ones named above. No new media beyond the re-recorded GIFs.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
