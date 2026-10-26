---
title: Replace the Align popover's min/ctr/max grid and Snap row with one seven-position row per axis, from outside − to outside +
category: ui
kind: feature
priority: medium
model: sonnet
depends: []
status: done
---

> **What shipped (2026-10-26).** As specified, with both open questions taken at their recommended
> answers: **(a)** all seven buttons stay live against World origin (they give three results, which
> the icons and `docs/snap-align.md` say), and **(b)** buttons stay at 44 px (a 352 px popover, 328 px
> of row), so `CLAUDE.md` needed no exception. Beyond the file's list: `AlignGrid.vue` gained a
> `describe(axis, key)` prop (aria-label, title) and a `preview` event so the caption follows hover and
> focus. The full e2e matrix could not finish under load on this machine, so verification was typecheck
> + the full unit run + the changed-scope e2e (six edited specs on all nine projects) + `guards`; two
> load-induced hangs were rerun alone and passed on all nine. Unrelated docs-media churn from the
> generator was reverted.

## Goal

Requested by the user on 2026-10-25, after using `ui-060`'s combined popover:

> *"The combined align/snap dialog is an improvement, but I think it can be better. Instead of
> having an align section and a snap section, there could be one set for each axis (XYZ) that
> has outside-, inside- (which is the same as the align min, right?), center, inside+,
> outside+."*

and, the same day, adding the half-overlap snaps:

> *"There is another alignment snap that is possible so it should be (from negative to
> positive) outside, inside, positive side to center, center to center, neg side to center,
> inside, outside."*

Today `AlignPopover.vue` (`ui-060`) has **two** button grids against a second body:

- The **Align** grid has `⊢ min | ◇ ctr | ⊣ max` per axis. Only `ctr` is live against a second
  body. `min` and `max` are disabled with a hint pointing at the Snap row.
- The **Snap** row has a **Relation** dropdown (`Outside` / `Inside` / `Center`) and a
  `− | +` pair per axis whose labels change with the Relation.

So the user has to pick a mode in a dropdown and then decode a button. The user's answer to
"is inside − the same as align min?" is **yes**: `group.js`'s `SNAP_SIDES` has `inside-` as
`[0, 0]` (the moving body's min face on the target's min face) and `inside+` as `[1, 1]`. The
disabled `min`/`max` buttons and the Inside Snap buttons are the same thing, shown twice.

"Done" is **one row per axis with seven buttons, ordered from − to +**. Each button names where
the moving body ends up along that axis, relative to the target:

| # | button | the moving body ends up | which faces meet |
|---|---|---|---|
| 1 | **outside −** | fully beyond the target's − face | your + face on its − face |
| 2 | **inside −** | inside, − faces flush | your − face on its − face |
| 3 | **half −** | over the target's − half | your + face on its centre |
| 4 | **center** | centred on it | your centre on its centre |
| 5 | **half +** | over the target's + half | your − face on its centre |
| 6 | **inside +** | inside, + faces flush | your + face on its + face |
| 7 | **outside +** | fully beyond the target's + face | your − face on its + face |

Seven positions cover every orientation the popover offers today: all six Snap
orientations plus Align's centre. So the 2026-10-04 decision that all six stay reachable
(`ui-060`, open question b) still holds. There is no Relation dropdown, no second grid, and no
disabled buttons against a second body.

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
  5. **The position grid**: X / Y / Z rows, each with the seven buttons in the Goal table's
     order. Testids are
     `align-{x|y|z}-{outside-minus|inside-minus|half-minus|center|half-plus|inside-plus|outside-plus}`.
     `align-{axis}-center` keeps its current testid. Each button is ≥44×44 px and shows an
     **icon only**. The words live outside the buttons (Labels and icons, below). A tap
     **commits immediately**, appends one step, and leaves the popover open, as today.
  6. **Caption** (`align-caption`, `aria-live="polite"`), one line under the grid, giving the
     full sentence for the button last tapped, focused or hovered (Labels and icons, below).
  7. **Offset (mm)** (`align-offset`), shown for Second selected only, applied to the next tap
     (unchanged).
  8. The error slot (`align-error`, unchanged).
- **Removed**: the **Relation** select (`align-relation`), the Snap grid
  (`align-{axis}-snap-{minus|plus}`), and the `align-{axis}-min` / `align-{axis}-max`
  buttons. `alignReference.relation` goes too: the popover is its only consumer.
- **Labels and icons** (requested by the user on 2026-10-25: *"labels are outside the button
  and only an icon is inside"*). The words go in three places outside the buttons. None of
  them is repeated per axis:

  ```
              −  ◀────────────────────────────▶  +        ← direction rule
                out   in   half  ctr  half   in   out     ← column header, once
              ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
            X │ ▮[ ]│ [▮ ]│ [▮| │ [▮] │ |▮] │ [ ▮]│ [ ]▮│
              ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
            Y │  …  │     │     │     │     │     │     │
              ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
            Z │  …  │     │     │     │     │     │     │
              └─────┴─────┴─────┴─────┴─────┴─────┴─────┘
            Z half +: your − face sits on the target's centre   ← caption
  ```

  1. **Direction rule**: one thin line above the header with `−` at its left end and `+` at
     its right, so the header words never need a sign. A column's position tells you its
     side.
  2. **Column header**: `out · in · half · ctr · half · in · out`, at 10 px in `--text-2`.
     It is the **first row of the same CSS grid** as the buttons, not a separate element, so
     each word sits exactly over its column and the two cannot drift apart. It is
     `aria-hidden`, because each button carries its own label (below). `outside` and
     `inside` are spelled short because `outside` at 10 px is about 38 px, too close to 44.
  3. **Caption** (`align-caption`): the full sentence, e.g. *"Z half +: your − face sits on
     the target's centre, so you cover its + half"*. It shows the focused or hovered button
     on desktop. On touch, where there is no hover, it shows the button **just tapped**, so
     the user reads what happened while the body moves, and Undo is right there. It replaces
     `title` tooltips as the explanation (keep `title` for desktop as well, since it costs
     nothing). When nothing has been tapped yet, it reads *"Tap where the moving body should
     end up along each axis."*

  **Icons** are one small SVG component (`AlignPositionIcon.vue`, 24×24 px,
  `position: 0..6`), drawn **horizontally on every row**: − left, + right, matching the rule
  and header, Z included. The target is an outline box drawn identically in all seven. The
  moving body is a filled block placed per column (beside, flush inside, straddling the
  centre, centred). The colours are the selection role colours already on screen: the
  moving block in the first-picked **amber** and the target outline in the second-picked
  **teal**. The icon then matches what the user sees in the viewport. Those colours exist
  today only as hex in `src/render/mesh.js`'s `BODY_COLORS` (`selected`, `secondary`, dark
  and light). So add `--role-moving` and `--role-target` to `src/styles/tokens.css` for both
  schemes, kept in step with `BODY_COLORS` exactly the way `--hover-highlight` already is
  (`mesh.js`'s comment names that pairing). These are new tokens, but no new hue. With Target
  **World origin**, the icon draws the target as a **zero-width line** (the origin plane)
  instead of a box. The seven icons then honestly show three distinct pictures, which
  explains open question (a)'s collapse without any text. Every button keeps a text
  `aria-label` (the caption sentence), so this is never a glyph-only control (`ui-027`'s
  icon-legibility VERIFY row).
- **Width**: seven targets do not fit today's popover. Every `.ops__popover` is
  `min(260px, 100vw − 32px)` wide (`OperationsToolbar.vue`), which leaves about 240 px for
  content. The Align popover gets its own modifier, `ops__popover--align`, at
  `min(352px, 100vw − 32px)`, which the other popovers do not share. Each row is a
  **segmented strip**: seven adjacent buttons with shared borders and no gaps. With
  icon-only faces, a button's width is set by the tap-target floor, not by its text. So:
  - **At the 44 px floor (the default, per `CLAUDE.md`'s tap-target rule):** 16 (axis) + 4 +
    7 × 44 = **328 px**. That fits the 342 px a 390 px phone leaves, with 14 px spare.
  - **At 40 × 44 px (narrower, only if the owner relaxes the rule for this control):**
    16 + 4 + 7 × 40 = **300 px**. That saves 28 px. See open question (b). Do not build this
    width without that answer.

  Check whichever is built with a measured screenshot at 390 px, not with arithmetic alone.
- **Feedback**: unchanged. The body moves, the gizmo, dimension lines and Position fields
  follow, one timeline step per tap (labels `Snap`, `Align` and `Align to origin` stay), and a
  World origin no-op appends nothing.
- **Selection response**: unchanged. A tap never changes the selection, and the
  amber/teal role colours and `originOnly` behave as today.
- **Selection count**: 1 or 2, unchanged.
- **Small-screen behaviour**: not "same as desktop". The popover is wider than its siblings
  (Width above), and at 390 px it is the full width minus 16 px gutters. It gets **shorter**
  than today's: one grid and no Relation select, instead of two grids and a select. So the
  shortcut and the grid stay above the fold on phone. Re-check
  `e2e/phone-toolbar-chrome-fit.e2e.js` and the Inspector bottom-sheet overlap `ui-026`
  found, since the popover's footprint changes.

## Documentation

- **Page**: `docs/snap-align.md`. Rewrite **One tap, one step**, **Aligning to the origin**
  and **The popover's fields** around the seven positions. Draw the seven positions once as a
  diagram, using the screenshot of the grid itself (header, icons, caption), so the page and
  the popover cannot disagree. Add a table that pairs each header word and icon with its
  caption sentence: that table is how a reader learns the icons. Drop every mention of the Relation
  dropdown and the Snap row. Rewrite both worked examples (the lug against a plate, and the
  cube on the cylinder) as position taps. Grep `docs/` for `Relation`, `Snap row`, `⊢ min`,
  `− side` and `− half` and fix every hit.
- **Example**: *"Drop a Cube and a Cylinder. Click the Cube, then Shift-click the Cylinder,
  and press **⇔ Align**. The top line reads `Aligning Cube 1 to Cylinder 1`. Tap **X center**
  and **Y center** to centre the cube over the cylinder. Then tap **Z outside +** to stand
  the cube on top of it, its bottom face on the cylinder's top face. Tap **Z half +** instead
  and the cube's bottom face sits at the cylinder's mid-height. Tap **Z inside +** and the
  cube's top face lines up with the cylinder's top. Switch **Target** to `World origin` and
  tap **Z outside +** to sit the cube on the grid."* Name the conventions: millimetres, Z-up,
  and **−** is the smaller coordinate.
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
- `src/components/viewport/AlignGrid.vue`: already takes N columns. Add a segmented
  (gap-free, shared-border) variant, an optional `header` row rendered as the grid's first
  row, an icon slot per button, and an `aria-label` per column. Drop the "the Snap row's
  `− | +` pair" sentence from its doc.
- `src/components/viewport/AlignPositionIcon.vue` (new): the 24×24 SVG, with props
  `position` (0–6) and `pointTarget` (World origin). It uses only the two new role tokens.
- `src/styles/tokens.css`: add `--role-moving` / `--role-target` (dark and light), matching
  `BODY_COLORS.selected` / `.secondary`. Add one line to `mesh.js`'s `BODY_COLORS` comment
  naming the pair, as it already does for `--hover-highlight`.
- `src/components/viewport/OperationsToolbar.vue`: pass the `ops__popover--align` modifier
  when the Align popover is open, and add its width rule next to `.ops__popover`.
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

| button | Second selected (`SNAP_SIDES` is `[target side, your side]`, −1 = target centre) | World origin (`alignToOrigin` spec) |
|---|---|---|
| `outside −` | `group.snap`, `'outside+'`, `[0, 1]` | `max` |
| `inside −` | `group.snap`, `'inside-'`, `[0, 0]` | `min` |
| `half −` | `group.snap`, `'center+'`, `[-1, 1]` | `max` |
| `center` | `group.align` (bounding-box centre on centre) | `center` |
| `half +` | `group.snap`, `'center-'`, `[-1, 0]` | `min` |
| `inside +` | `group.snap`, `'inside+'`, `[1, 1]` | `max` |
| `outside +` | `group.snap`, `'outside-'`, `[1, 0]` | `min` (sit on) |

Every row keeps `axes: <axis>` and `deltaMm` from the Offset field, in exactly the
`{ axes, orientation, deltaMm }` shape `ui-060` writes, so `snapAlignReplay.spec.js` stays
green with no edit. The `above-*`/`below-*` aliases stay unexposed.

**The `outside` and `half` rows are crossed on purpose.** `SNAP_SIDES`' sign names the moving
body's face that touches, so `outside+` puts the body on the target's **−** side, and
`center+` puts it over the target's **−** half. `ui-060`'s Step 2 answer (b) found this, and
`ai-022` was the same mistake in the AI tool text. Today's `SNAP_BUTTONS` already maps
`◁ − half` to `center+`, so this table carries that mapping over rather than inventing it. Pin
it with a unit test per row (see Testing), and keep a one-line comment on the table saying the
crossing is intended.

**Open questions, to be answered in Step 2 of `/fix-todo` before code:**

a. **World origin is a point, so the seven collapse to three results.** Against a zero-size
   target, `outside −`, `half −` and `inside +` all put your max face at 0, and `inside −`,
   `half +` and `outside +` all put your min face at 0 (table above). **Recommended:** keep all
   seven live. Each does what its label says, the grid keeps one shape for both targets, and
   the docs say in one sentence why groups of buttons give the same result against the
   origin. The alternative, disabling four of them with a hint, puts back exactly the
   disabled-button confusion this task removes.
b. **Button width: 44 px or 40 px.** *Labels are settled (user, 2026-10-25): icon-only
   buttons, with the words in a shared column header and the caption.* What remains is
   whether the buttons go narrower than the 44×44 floor `CLAUDE.md` sets for every tap
   target. 40 px saves 28 px of row width. It is still well above WCAG 2.2's 24 px AA
   minimum, but below Apple's 44 pt and below this project's own rule. Because the strip has
   no gaps, a miss lands on the neighbouring position, and Undo is one tap away. **Recommended:
   stay at 44 px**, since 328 px already fits a 390 px phone. Treat 40 px as a deliberate
   exception to the project rule, recorded in `CLAUDE.md`, not as a quiet local override.

## Effort

M. One component's logic shrinks to one table, the popover gets its own width, then six e2e
specs and the docs media follow. There is no `core` work.

## Testing

- **Unit** (`AlignPopover.spec.js`):
  - Each of the seven buttons under Second selected appends the exact record in the Proposed
    fix table, on that axis only, with the offset. This is a **table-driven** test whose
    expectations are written out literally, not derived from the component's own table, so a
    flipped `outside` or `half` row fails.
  - Each of the seven under World origin commits the matching `alignToOrigin` spec.
  - No `align-relation` and no `align-*-snap-*` / `-min` / `-max` testids at 1 or 2
    selected.
  - No button is disabled at either target.
  - The drop shortcut still writes `{ x: 'center', y: 'center', z: 'min' }`.
  - Every position button has a non-empty `aria-label` naming its axis and position. The
    header row is `aria-hidden`. A tap sets `align-caption` to that button's sentence.
  - `AlignPositionIcon.spec.js`: the moving block's x-extent against the target box is
    correct for each of the seven positions (beside, flush, straddling, centred). With
    `pointTarget`, positions 0/2/5 and 1/4/6 render identical geometry.
  - A numeric test that commits through the real fold (two cuboids, sizes 10 and 40), with an
    explicit `toBeCloseTo(…, 6)`, asserting the moving body's resulting min/max on that axis
    for all seven positions. Cover the degenerate cases: a moving body **larger** than the
    target under `inside ±` and `half ±` (it overhangs, and must not be refused), bodies
    **already flush** (an `inside −` tap moves by 0 and, being parametric, still appends), and
    **coincident** bodies under `center`.
- **E2E**: rewrite `e2e/snap-align-operation.e2e.js` to drive all seven positions on one axis
  through the real popover at `/`. Assert each resulting coordinate and that the **target did
  not move**. Add one World origin run of `outside +` on Z (sits on the grid). Assert that at
  390 px the popover has no horizontal overflow (`scrollWidth <= clientWidth`), every
  position button's box is ≥44×44 px (or the width open question (b) settled on), and each
  header word's centre is within 1 px of its column's button centres. On a touch project,
  tap a position and assert the caption names it. Update the other specs under Affected files to the new
  testids. It runs at **all three viewports** with a snapshot of the open popover at each
  (Small-screen behaviour is not "same as desktop").
- **Engines**: all three (Chromium, Firefox, WebKit). The specs drive the viewport, selection
  and gizmo-tracked transforms, which `CLAUDE.md`'s Browser Support section lists as
  engine-sensitive.
- **Acceptance scenarios to re-drive by hand** (driven, not scripted, with PASS/FAIL for each):
  **1** (two independent primitives), **3** (snap-placement of a kit assembly), **6** (group
  vs. sub-part selection), **10** (save, reload, nothing changed, including a project saved
  before this change with a `center±` snap, which must now show as `half ∓` taps would have
  made it), and **12** (edit a step in the middle of the history).
- **Closed findings to re-run the repro of**: `ui-026` (Snap/Align), `ui-035` and `ui-063`
  (sub-part operands on one side and on both), `ui-050` (Pi, Measure from `mb`, centred and
  sitting on the grid, now via `outside +`), `ui-060` (the combined popover's own Testing
  flows), `data-007` (a snapped body follows a primitive resize), and `ui-069` (repeat a
  placement across matching parts, which replays a snap). Repeat
  `docs/snap-align.md`'s drilled-in `Raspberry Pi 1 › ethernet` example verbatim.
- **Docs media**: run `npm run docs:media`, then `e2e/docs-media.spec.js` (the `guards`
  project) must pass: no dead link, no orphan, no unclaimed picture.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
