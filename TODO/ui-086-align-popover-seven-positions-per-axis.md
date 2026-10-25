---
title: Replace the Align popover's min/ctr/max grid and Snap row with one five-position row per axis (outside −, inside −, center, inside +, outside +)
category: ui
kind: feature
priority: medium
model: sonnet
depends: []
status: open
---

## Goal

Requested by the user on 2026-10-25, after using `ui-060`'s combined popover:

> *"The combined align/snap dialog is an improvement, but I think it can be better. Instead of
> having an align section and a snap section, there could be one set for each axis (XYZ) that
> has outside-, inside- (which is the same as the align min, right?), center, inside+,
> outside+."*

Today `AlignPopover.vue` (`ui-060`) has **two** button grids against a second body:

- The **Align** grid has `⊢ min | ◇ ctr | ⊣ max` per axis. Only `ctr` is live against a second
  body. `min` and `max` are disabled with a hint pointing at the Snap row.
- The **Snap** row has a **Relation** dropdown (`Outside` / `Inside` / `Center`) and a
  `− | +` pair per axis whose labels change with the Relation.

So the user has to pick a mode in a dropdown and then decode a button. The user's answer to
"is inside − the same as align min?" is **yes**: `group.js`'s `SNAP_SIDES` has `inside-` as
`[0, 0]` (the moving body's min face on the target's min face) and `inside+` as `[1, 1]`. The
disabled `min`/`max` buttons and the Inside Snap buttons are the same thing, shown twice.

"Done" is **one row per axis with five buttons, in axis order**. Each button names where the
moving body ends up along that axis:

| `− ` side ← | | | | → `+` side |
|---|---|---|---|---|
| **outside −**: fully beyond the target's − face | **inside −**: − faces flush | **center**: centres coincide | **inside +**: + faces flush | **outside +**: fully beyond the target's + face |

There is no Relation dropdown, no second grid, and no disabled buttons against a second body.

## Interaction model

- **Precondition**: unchanged from `ui-060`. **1 or 2** bodies selected, with the same
  `previewing` and inactive-selection disablers and the same `Select 1 or 2 solids` hint at
  0 or 3+. Sub-part addressing on both sides (`ui-035`, `ui-063`) is unchanged.
- **Trigger**: unchanged. The **⇔ Align** button on the Operations toolbar.
- **The popover**, top to bottom:
  1. **Top line** naming the operands (unchanged).
  2. **Target** select (`align-target`, unchanged, hidden with 1 selected).
  3. **Measure from** select (`align-reference`, unchanged).
  4. **Center on origin, sit on grid** shortcut (`align-drop`, unchanged, World origin only).
     It is the same record as tapping X **center**, Y **center** and Z **outside +**, in one
     step.
  5. **The position grid**: X / Y / Z rows, each with five buttons in this order:
     `outside −`, `inside −`, `center`, `inside +`, `outside +`. Testids are
     `align-{x|y|z}-{outside-minus|inside-minus|center|inside-plus|outside-plus}`. Note that
     `align-{axis}-center` keeps its current testid. Each button is ≥44×44 px. A tap
     **commits immediately**, appends one step, and leaves the popover open, as today.
  6. **Offset (mm)** (`align-offset`), shown for Second selected only, applied to the next tap
     (unchanged).
  7. The error slot (`align-error`, unchanged).
- **Removed**: the **Relation** select (`align-relation`), the Snap grid
  (`align-{axis}-snap-{minus|plus}`), and the `align-{axis}-min` / `align-{axis}-max`
  buttons. `alignReference.relation` goes too: the popover is its only consumer.
- **Button faces**: five buttons have to fit a 390 px phone with an axis label, so the labels
  are short. **Recommended**: a small inline SVG pictogram per button that shows the target
  as an outline and the moving body as a filled block in that position, plus a text
  `aria-label` and `title` with the full sentence. An example `title` is *"X outside +: your
  − face meets the target's + face, so you end up beside it on its + side"*. The fallback,
  if the pictograms do not read at 44 px, is text labels `out −` / `in −` / `ctr` / `in +` /
  `out +`. Settle this in Step 2 with a phone screenshot, and do not ship glyph-only buttons
  without a text label (see `ui-027`'s icon-legibility VERIFY row).
- **Feedback**: unchanged. The body moves, the gizmo, dimension lines and Position fields
  follow, one timeline step per tap (labels `Snap`, `Align` and `Align to origin` stay), and a
  World origin no-op appends nothing.
- **Selection response**: unchanged. A tap never changes the selection, and the
  amber/teal role colours and `originOnly` behave as today.
- **Selection count**: 1 or 2, unchanged.
- **Small-screen behaviour**: not "same as desktop". The popover is still the phone's
  bottom-anchored `.ops__popover`. The five-column grid must fit 390 px without horizontal
  scroll at ≥44 px targets: 5 × 44 + gaps + the axis label is about 260 px, so it fits, but
  check it with real labels. The popover gets **shorter** than today's (one grid and no
  Relation select instead of two grids and a select), so the shortcut and grid stay above the
  fold on phone.

## Documentation

- **Page**: `docs/snap-align.md`. Rewrite **One tap, one step**, **Aligning to the origin**
  and **The popover's fields** around the five positions. Draw the five positions once as a
  diagram, using the same pictograms as the buttons. Drop every mention of the Relation
  dropdown and the Snap row. Rewrite both worked examples (the lug against a plate, and the
  cube on the cylinder) as five-position taps. Grep `docs/` for `Relation`, `Snap row`,
  `⊢ min` and `− side` and fix every hit.
- **Example**: *"Drop a Cube and a Cylinder. Click the Cube, then Shift-click the Cylinder,
  and press **⇔ Align**. The top line reads `Aligning Cube 1 to Cylinder 1`. Tap **X center**
  and **Y center** to centre the cube over the cylinder. Then tap **Z outside +** to stand
  the cube on top of it, its bottom face on the cylinder's top face. Tap **Z inside +**
  instead and the cube's top face lines up with the cylinder's top, the cube sunk into it.
  Switch **Target** to `World origin` and tap **Z outside +** to sit the cube on the grid."*
  Name the conventions: millimetres, Z-up, and **−** is the smaller coordinate.
- **Media**: re-record every popover shot in `e2e/docs/snap-align.docs.js`
  (`snap-popover.png`, `snap-operation.gif`, `align-operation.gif`,
  `align-to-origin-popover.gif`, `snap-subpart-operand.gif`, `snap-subpart-both-sides.gif`)
  and fix the Relation steps in `e2e/docs/help.docs.js`. Add one still, `align-positions.png`,
  of the grid for the docs diagram, and register it in `docs/media/manifest.json`.

## Affected files

- `src/components/viewport/AlignPopover.vue`: replace `SNAP_BUTTONS`, `RELATIONS`,
  `gridColumns`, `snapColumns`, `onGridTap` and `onSnapTap` with one `POSITIONS` table (below)
  and one tap handler. Remove the Snap `<template>` block and the second `<AlignGrid>`. Update
  the module doc's "The Snap row names where the body ends up" section to describe the
  positions.
- `src/components/viewport/AlignGrid.vue`: already takes N columns. Add a pictogram slot or an
  `icon` field per column if the Step 2 answer is pictograms, and drop the "the Snap row's
  `− | +` pair" sentence from its doc.
- `src/stores/alignReference.js`: remove `relation`. Grep first. Today the popover is its only
  reader.
- `src/components/viewport/AlignPopover.spec.js`: rewrite the Relation/Snap cases. See
  Testing.
- `e2e/snap-align-operation.e2e.js`, `e2e/snap-align-both-subparts.e2e.js`,
  `e2e/align-to-origin.e2e.js`, `e2e/repeat-placement.e2e.js`,
  `e2e/composite-param-edit.e2e.js`, `e2e/help.e2e.js`: every one that clicks
  `align-*-min`/`-max`, `align-*-snap-*` or `align-relation`. `help.e2e.js` uses the Relation
  select to prove popover state survives opening Help. Switch it to **Target** and **Offset**.
- `e2e/docs/snap-align.docs.js`, `e2e/docs/help.docs.js`, `docs/snap-align.md`,
  `docs/media/manifest.json`.
- **Not touched**: `src/core/kernel/group.js`, `src/core/transform.js`,
  `src/ai/tools/operate.js`, and any record shape. See Proposed fix.

## Proposed fix

**One table, two engines, no record changes.** Every button maps onto a record kind the popover
already writes. Second selected stays parametric (`group.snap` / `group.align`). World origin
stays baked (`alignToOriginRecord`). That is `ui-060`'s "one popover, two engines" rule, kept.

| button | Second selected | World origin (`alignToOrigin` spec) |
|---|---|---|
| `outside −` | `group.snap`, `orientation: 'outside+'` (`[0, 1]`: your max on the target's min) | `max` (your max face to 0) |
| `inside −` | `group.snap`, `orientation: 'inside-'` (`[0, 0]`) | `min` |
| `center` | `group.align` (bounding-box centre on centre) | `center` |
| `inside +` | `group.snap`, `orientation: 'inside+'` (`[1, 1]`) | `max` |
| `outside +` | `group.snap`, `orientation: 'outside-'` (`[1, 0]`: your min on the target's max) | `min` (your min face to 0: "sit on") |

Every row keeps `axes: <axis>` and `deltaMm` from the Offset field, in exactly the
`{ axes, orientation, deltaMm }` shape `ui-060` writes, so `snapAlignReplay.spec.js` stays
green with no edit.

**The `outside` rows are crossed on purpose.** `SNAP_SIDES`' sign names the moving body's
face that touches, so `outside+` puts the body on the target's **−** side. `ui-060`'s Step 2
answer (b) found this, and `ai-022` was the same mistake in the AI tool text. Pin it with a
unit test per row (see Testing), and keep a one-line comment on the table saying the crossing
is intended.

**Open questions, to be answered in Step 2 of `/fix-todo` before code:**

a. **`center+` / `center−` (half-overlap) go away from the popover. Confirm with the user.**
   The five positions do not include "your face on the target's centre". On 2026-10-04 the
   user resolved, for `ui-060`, that *all six* Snap orientations stay reachable. This request
   lists five, which reverses that, so ask rather than assume. The options are:
   (1) **Drop them from the popover (recommended, and what the request says).** Old records
   with `center±` still load, replay and show as `Snap` in the timeline. The AI tools keep
   offering them (`operate.js` names the op, not the button). Offset + `inside ±` covers most
   uses. (2) Make it seven positions, with `half −` and `half +` between `inside ±` and
   `center`. That is 7 × 44 px plus gaps, about 350 px. It fits a 390 px phone only just, and
   only with pictograms.
b. **World origin is a point, so two pairs coincide.** Against a zero-size target,
   `inside −` ≡ `outside +` (min to 0) and `inside +` ≡ `outside −` (max to 0). **Recommended:**
   keep all five live. Each does what its label says, the grid has one shape for both
   targets, and the docs say in one sentence why two pairs give the same result here. The
   alternative, disabling `inside ±` with a hint, puts back exactly the disabled-button
   confusion this task removes.
c. **Labels.** Pictograms versus short text (Interaction model, Button faces). Decide from a
   390 px screenshot of both.

## Effort

M. One component's logic shrinks to one table, then six e2e specs and the docs media follow.
There is no `core` work.

## Testing

- **Unit** (`AlignPopover.spec.js`):
  - Each of the five buttons under Second selected appends the exact record in the Proposed
    fix table, on that axis only, with the offset. This is a **table-driven** test whose
    expectations are written out literally, not derived from the component's own table, so a
    flipped `outside` row fails.
  - Each of the five under World origin commits the matching `alignToOrigin` spec.
  - No `align-relation` and no `align-*-snap-*` / `-min` / `-max` testids at 1 or 2
    selected.
  - No button is disabled at either target.
  - The drop shortcut still writes `{ x: 'center', y: 'center', z: 'min' }`.
  - A numeric test that commits through the real fold (two cuboids, sizes 10 and 40), with an
    explicit `toBeCloseTo(…, 6)`, asserting the moving body's resulting min/max on that axis
    for all five positions. Cover the degenerate cases: a moving body **larger** than the
    target under `inside ±` (it overhangs, and must not be refused), bodies **already flush** (an `inside −`
    tap moves by 0 and, being parametric, still appends), and **coincident** bodies under
    `center`.
- **E2E**: rewrite `e2e/snap-align-operation.e2e.js` to drive all five positions on one axis
  through the real popover at `/`. Assert each resulting coordinate and that the **target did
  not move**. Add one World origin run of `outside +` on Z (sits on the grid). Update the
  other specs under Affected files to the new testids. It runs at **all three viewports**
  with a snapshot of the open popover at each (Small-screen behaviour is not "same as
  desktop").
- **Engines**: all three (Chromium, Firefox, WebKit). The specs drive the viewport, selection
  and gizmo-tracked transforms, which `CLAUDE.md`'s Browser Support section lists as
  engine-sensitive.
- **Acceptance scenarios to re-drive by hand** (driven, not scripted, with PASS/FAIL for each):
  **1** (two independent primitives), **3** (snap-placement of a kit assembly), **6** (group
  vs. sub-part selection), **10** (save, reload, nothing changed, including a project saved
  before this change with a `center±` snap), and **12** (edit a step in the middle of the
  history).
- **Closed findings to re-run the repro of**: `ui-026` (Snap/Align), `ui-035` and `ui-063`
  (sub-part operands on one side and on both), `ui-050` (Pi, Measure from `mb`, centred and
  sitting on the grid, now via `outside +`), `ui-060` (the combined popover's own Testing
  flows), `data-007` (a snapped body follows a primitive resize), and `ui-069` (repeat a
  placement across matching parts, which replays a snap). Repeat
  `docs/snap-align.md`'s drilled-in `Raspberry Pi 1 › ethernet` example verbatim.
- **Docs media**: run `npm run docs:media`, then `e2e/docs-media.spec.js` (the `guards`
  project) must pass: no dead link, no orphan, no unclaimed picture.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
