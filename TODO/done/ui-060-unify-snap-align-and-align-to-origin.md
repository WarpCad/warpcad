---
title: One Align tool for Snap, Align and Align-to-origin, with a Target dropdown, and remove the Inspector's Align to origin row
category: ui
kind: feature
priority: medium
model: opus
milestone: M16
depends: []
status: done
---

> **What shipped (2026-10-15).** One **⇔ Align** button (1 or 2 selected) opens `AlignPopover.vue`
> (with `AlignGrid.vue`): Target, Measure from, the drop shortcut, the min/ctr/max grid and, against
> a second body, the Snap row with a Relation. Each tap commits one record and the popover stays
> open. `min`/`max` against a second body are disabled with a hint (open question a). The Snap
> buttons name where the body ends up, so `⇥ − side` writes `outside+` (open question b); the
> `AlignToOrigin` row and the `snap` help topic are gone. No record shape changed, so old projects
> load unchanged (`src/core/snapAlignReplay.spec.js`). Filed `ai-022` for the backwards `group.snap`
> tool description in `src/ai/tools/operate.js`.

## Goal

Requested by the user on 2026-10-04, after using both:

> *"I'm using the align to origin in the inspector, and I find that its UI is much better
> than the one under the snap or align tools. Write a todo that combines the snap/align
> tools and uses the inspector's align to origin (and removes it from the inspector). You
> may need a dropdown in the tool popup."*

Today there are three ways to place something exactly, with two different UIs:

- **Snap** (`⇥`) and **Align** (`⇔`): two separate Operations-toolbar buttons, each with a
  popover of X/Y/Z checkboxes, a Snap-only orientation `<select>`, an offset field and a
  Cancel/commit pair (`OperationsToolbar.vue`, `snap-align-*` testids). Exactly 2 bodies.
- **Align to origin** (`ui-050`): a row in the Inspector's Transform section
  (`AlignToOrigin.vue`). A Reference `<select>`, a 3×3 grid of per-axis
  `min | ctr | max` buttons that each commit on tap, and a one-tap "Center on origin, sit
  on grid" shortcut. Exactly 1 body.

The user finds the second UI better, and it is: the face you mean is a button (not a
checkbox plus a mode you have to know the meaning of), taps commit with no confirm step,
and Undo is the escape hatch.

"Done" is **one tool**, **Align**, on the Operations toolbar that:

1. Is available with **exactly 1 or exactly 2** bodies selected.
2. Opens a popover in the `AlignToOrigin` style: a **Target** dropdown, a **Reference**
   dropdown, the 3×3 `min | ctr | max` grid, and the drop shortcut.
3. Does what Snap, Align and Align-to-origin each did, all from that one popover.
4. Leaves the Inspector's Transform section **without** an Align to origin row.

## Interaction model

- **Precondition**: **1 or 2** bodies selected (selection *count*, per `CLAUDE.md`).
  - 1 selected: the only available **Target** is `World origin`.
  - 2 selected: **Target** offers `Second selected (<name>)` (default) and `World origin`.
    With `World origin` chosen on a 2-selection, the tool moves the **first-picked** body
    only, exactly as Snap/Align do today. The second is not moved and is not the target.
  - 0, or 3 or more selected: the button is disabled with a hint, `Select 1 or 2 solids`
    (the same disabled-with-hint treatment Snap/Align have now).
  - The existing `previewing` and inactive-selection disablers carry over unchanged.
  - Sub-part drilling (`ui-016`/`ui-035`) carries over: the popover's top line still names
    the exact operands, `Aligning Raspberry Pi 1 › ethernet to Cube 1`, or
    `… to World origin`. Since `ui-063`, **both** sides can carry a `›`
    (`Aligning Raspberry Pi 1 › hole1 to touchScreen2 1 › piMountingPost1`): each selected
    body has its own address (`selection.partOf`), and the operands come from
    `useSelectedOperands` in `src/composables/useSelectedBody.js`.
- **Trigger**: one toolbar button, **Align** (glyph `⇔`), replacing the **Snap** and
  **Align** buttons. The toolbar loses one button. This matters at phone width, where
  `e2e/phone-toolbar-chrome-fit.e2e.js` is the guard. The button opens a popover, toggled
  open and closed by the same button, with the same Escape and backdrop-dismiss behaviour
  `openPopover` already gives Snap/Align.
- **The popover**, in this order, top to bottom:
  1. **Top line** naming the operands (above).
  2. **Target** `<select>` (`data-testid="align-target"`): `Second selected (<name>)` and
     `World origin`. Hidden, not a one-option dropdown, when only 1 body is selected,
     because the only choice is `World origin`.
  3. **Measure from** `<select>` (`data-testid="align-reference"`): this is
     `AlignToOrigin`'s Reference dropdown, unchanged: `Whole object` plus one option per
     **visible** part of the **moving** body, hidden parts excluded, hidden entirely for a
     bare solid. It is remembered per body for the session in `alignReference.js`, and
     preselects the part the user had drilled into.
  4. **Shortcut** (`align-drop`), full width and first on phone: **Center on origin, sit
     on grid**. Enabled only when Target is `World origin`. One tap commits one record.
  5. **Axis grid**: X / Y / Z rows, each with `⊢ min`, `◇ ctr`, `⊣ max` buttons
     (`align-{x|y|z}-{min|center|max}`, ≥44×44 px). A tap **commits immediately** for that
     axis, exactly as today's Align to origin does. There is no popover-wide Apply.
     - With Target `World origin`: the moving body's chosen face/centre goes to 0 on that
       axis (today's `alignToOriginRecord`).
     - With Target `Second selected`: the moving body's chosen face/centre goes to the
       **matching** face/centre of the target on that axis. So `ctr` is today's Align,
       `min`/`max` are new and mean "line up the low (high) faces". See **Open
       questions** for what this does to Snap.
  6. **Snap row**, shown only when Target is `Second selected` (never for `World origin`):
     - A **Relation** `<select>` (`data-testid="align-relation"`) with `Outside`, `Inside`
       and `Center`, defaulting to `Outside`. These are Snap's three families, so all six
       of its orientations stay reachable.
     - Under it, X / Y / Z rows with a `− side` and a `+ side` button each
       (`align-{x|y|z}-snap-{minus|plus}`, ≥44×44 px). A tap commits `group.snap` on that
       axis with `orientation: <relation><sign>`, so `Outside` + `+ side` is `outside+`,
       `Inside` + `− side` is `inside-`, and `Center` + `+ side` is `center+`.
     - Button labels follow the Relation, so the user never decodes a mode name:
       `Outside` reads `⇥ − side` / `⇤ + side`, `Inside` reads `⊏ − face` / `⊐ + face`, and
       `Center` reads `◁ − half` / `▷ + half`. Each has a `title` giving the full sentence,
       e.g. *"Inside −: move so your − face is flush with the reference's − face, inside
       it"*. Settle the exact wording in Step 2 against `group.js`'s `SNAP_SIDES` table,
       which defines what each of the six does, and do not guess it here.
     - The Relation is remembered for the session (UI-only, with the Reference), not in the
       document.
  7. **Offset (mm)** field (`align-offset`), applied to the **next** tap. It is a
     persistent field in the popover (not a modal step), so the buttons stay one-tap. It
     applies to `Second selected` taps only; it is hidden for `World origin`, where an
     offset from 0 is just a typed Position and `ui-050` deliberately did not offer it.
  8. A one-line error slot (`align-error`), the same slot `opError` is today, for a kernel
     rejection.
- **Feedback**:
  - The moving body moves. The gizmo, dimension lines and the Position fields follow.
  - Each tap appends **one** timeline step and **the popover stays open**, so X then Y
    then Z can be chained without reopening. This is what Align to origin did, and it is
    a change from Snap/Align, which close on commit. Escape or the backdrop closes it.
  - A no-op tap (already aligned within 1e-6 mm) appends nothing and gives brief pressed
    feedback only.
  - Timeline labels stay as they are: `Align to origin`, `Snap`, `Align`.
- **Placement**: n/a, nothing is created.
- **Selection response**: selection is unchanged by a tap. The first-picked (amber) and
  second-picked (teal) highlight carries over, and with Target `World origin` on a
  2-selection only the first-picked body is amber. The second shows no role colour, to
  make clear it is not involved.
- **Selection count**: 1 or 2, as above. Aligning 2+ bodies **as a unit** to the origin
  stays out of scope, as in `ui-050`. Group them (`ui-015`) and align the group.
- **Small-screen behaviour**: not "same as desktop".
  - The popover is the phone's existing bottom-anchored `.ops__popover`. It already
    diverges from the row-anchored placement, see its CSS comment. The 3×3 grid and the
    Snap row must fit 390 px without horizontal scroll at ≥44 px tap targets.
  - The popover can get tall with Target + Reference + shortcut + grid + Snap row + Offset.
    On a phone it scrolls inside its own max-height. The shortcut, then the grid, stay at
    the top so the common case never needs a scroll.
  - Removing a toolbar button (Snap) can only help `phone-toolbar-chrome-fit`. Re-check it
    anyway.

## Documentation

- **Page**: `docs/snap-align.md`, rewritten around the one tool, and retitled **Precise
  placement: Align**. It keeps the filename so every inbound link survives; add a
  `docs/` redirect note only if the docs tool has no alias for it. Update
  `docs/selection-and-inspector.md`, **removing** the Align to origin subsection and
  leaving a one-line pointer: *"To put an object on the origin, select it and use
  [Align](snap-align.md#aligning-to-the-origin)."* Also update every other page that says
  "Snap" or "Align" is a toolbar button. Find them with `grep -rn "Snap\b" docs/`.
- **Example**: *"Drag a Raspberry Pi from the Library and drop it anywhere. Click it,
  then press **⇔ Align** on the Operations toolbar. The popover's top line reads
  `Aligning Raspberry Pi 1 to World origin`. Set **Measure from** to `mb`, then tap
  **X ◇ ctr**, **Y ◇ ctr** and **Z ⊢ min**. The board is centred on the origin and its
  underside sits on the grid. Or, with **Measure from** on `mb`, tap **Center on origin,
  sit on grid** instead. Now Shift-click a Cube so two are selected, switch **Target** to
  `Second selected (Cube 1)`, and leave **Relation** on `Outside` and tap **X + side** to rest the Pi
  against the cube's +X face."* Name the convention: millimetres, Z-up, **min** is the
  face with the smaller coordinate.
- **Media**: update `e2e/docs/snap-align.docs.js` so its three GIFs (`snap-operation`,
  `align-operation`, `snap-subpart-operand`) and its stills are re-recorded against the
  new popover. Add one new movie, `align-to-origin-popover.gif` (Pi, Measure from `mb`,
  drop shortcut), replacing the one `selection-inspector.docs.js` currently records for the
  Inspector row. Remove that old shot from `selection-inspector.docs.js` and
  `docs/media/manifest.json` in the same change, since `docs-media.spec.js` fails on an
  orphan.

## Affected files

- `src/components/viewport/OperationsToolbar.vue`: merge `SNAP_ALIGN_OPERATIONS` into one
  entry, change `snapAlignDisabled` from `count !== 2` to `count ∉ {1, 2}`, drop the
  commit/Cancel pair for per-tap commits, and add the Target state. This file is already
  huge. The popover body should come out into a new
  `src/components/viewport/AlignPopover.vue` as part of this task ("views must be thin"),
  with `OperationsToolbar` keeping only open/close and the button.
- `src/components/viewport/AlignPopover.vue` (new): the popover described above. It reuses
  `AlignToOrigin.vue`'s grid markup by extracting the button grid into a small shared
  `AlignGrid.vue` rather than copy-pasting it (`AlignToOrigin.vue` itself is then deleted).
- `src/components/inspector/AlignToOrigin.vue` and `AlignToOrigin.spec.js`: **delete**,
  after the grid is extracted.
- `src/components/inspector/Inspector.vue`: remove the `<AlignToOrigin />` mount and its
  import. The `alignReference` hand-off `watch` on `selection.subPart` stays, since the
  store is still read by the popover.
- `src/core/transform.js`: `alignToOriginRecord` stays as it is. It is the `World origin`
  path. Add nothing here unless **Open questions** (b) lands.
- `src/composables/useTransformCommands.js`: `alignToOrigin(bodyId, spec)` stays. The
  popover calls it for `World origin`, and the existing group-op commit path for
  `Second selected`.
- `src/stores/alignReference.js`: unchanged API. Its consumer moves.
- `e2e/align-to-origin.e2e.js`: rewrite to open the toolbar popover instead of the
  Inspector row. Rename it `align-tool.e2e.js` only if every reference is updated.
- `e2e/boolean-operations.e2e.js`, `e2e/inspector-param-edit.e2e.js`,
  `e2e/composite-param-edit.e2e.js`, `e2e/phone-toolbar-chrome-fit.e2e.js`: any of them
  that click `snap-align-*` or the `Snap`/`Align` buttons by testid must be updated.
- `docs/snap-align.md`, `docs/selection-and-inspector.md`, `docs/media/manifest.json`,
  `e2e/docs/snap-align.docs.js`, `e2e/docs/selection-inspector.docs.js`.

## Proposed fix

**One popover, two engines behind it.** The two ways of moving a body are different in kind
and this task should not hide that:

- `World origin` is a **baked** `transform.translate` record (`alignToOriginRecord`,
  `ui-050`). It is a one-shot placement, and a later gizmo drag supersedes it.
- `Second selected` is a **parametric** `group.snap` / `group.align` record (`ui-026`) that
  re-evaluates when the reference changes, and that participates in
  `dependents.js`'s impact check and the broken-reference repair dialog.

Keep both. The popover chooses between them by the Target dropdown, and the timeline label
says which one happened. Do not "unify" them into one record kind: baking the two-body
case would lose the live follow that `docs/snap-align.md` documents, and making the origin
case parametric is the pin-forever surprise `ui-050` weighed and rejected.

**Mapping the new buttons onto the existing ops.** With Target `Second selected`:

| button | op | params |
|---|---|---|
| `◇ ctr` on axis *a* | `group.align` | `axes: [a]`, offset from the field |
| `− side` / `+ side` on axis *a*, Relation `Outside` / `Inside` / `Center` | `group.snap` | `axes: [a]`, `orientation: 'outside-'`/`'outside+'`, `'inside-'`/`'inside+'` or `'center-'`/`'center+'`, offset from the field |

**Per-tap commit and the popover staying open.** Today Snap/Align collect all axes, then
commit once, so chaining X, Y and Z is one timeline step. Per-tap commit is three steps.
That is the same trade `ui-050` made and the user prefers it. Do not add a "batch"
mode. If the user wants one step, **Center on origin, sit on grid** is the one-step form
for the origin case.

**Open questions, to be answered in Step 2 of `/fix-todo` before code:**

a. **`min` / `max` against a second body.** Line up low-with-low and high-with-high faces
   is a useful new capability, and it makes the grid the same three buttons in both
   targets. But `group.js`'s `calcSnap`/`calcAlign` do not have it today, and `group.snap`
   with `inside+`/`inside-` already covers "flush inside the same face". Decide: add
   `min`/`max` as new `group.align` modes (a `core` change, with numeric tests and a
   registry entry), **or** show only `◇ ctr` plus the Snap row against `Second selected`
   and keep `min`/`max` for `World origin` only. The second is smaller and loses nothing
   that exists today, now that `Inside` and `Center` Snap relations are in the popover.
b. **`inside±` and `center±` orientations.** *Resolved by the user on 2026-10-04: all six
   are offered for a second object* (item 6 above, via the Relation dropdown). Nothing is
   cut. What remains for Step 2 is the button wording, and checking that the six
   Relation × sign combinations map one-to-one onto `SNAP_ORIENTATIONS` in
   `OperationsToolbar.vue` (whose comment says the `above-*`/`below-*` aliases are
   deliberately not exposed).
c. **Backward compatibility of saved documents.** Nothing here changes any record shape,
   so old projects load unchanged. Say so in the retirement note, and have a unit test
   prove a project with `group.snap` and `group.align` records from before this change
   still replays to the same geometry.
d. **Keyboard.** If `Snap` or `Align` have a keyboard shortcut or an AI tool name
   (`ai-002`), keep both working. A shortcut must open the new popover, and an AI tool
   name must keep resolving to the same op. Grep before deleting any identifier.

**Step 2 answers (2026-10-15, Opus half of `/run-todos`):**

a. **The smaller option.** Against `Second selected` the grid's `◇ ctr` commits `group.align`
   and the Snap row commits `group.snap`; `⊢ min` / `⊣ max` stay in the grid but are
   **disabled with a hint** (`title`: line faces up with the Snap row's **Inside** buttons)
   rather than hidden, so the grid keeps one shape in both targets and the 390 px layout does
   not jump when Target changes. No new `core` modes, so no `core-NNN` split. (Noted, not
   built: `min`/`max` against a second body *could* commit `group.snap` `inside-`/`inside+`
   with no core change, since those are exactly low-with-low and high-with-high. Left out to
   keep one button per behaviour; a follow-up can turn it on.)
b. **The six buttons name where the moving body ends up, not which of its faces touches.**
   Checked against `group.js`'s `SNAP_SIDES` (`[referenceSide, movingSide]`, `0` min, `1` max,
   `-1` the reference's centroid): `outside+` is `[0, 1]`, the moving body's **max** face on the
   reference's **min** face, so the moving body ends up on the reference's **−** side. The
   TODO's literal mapping (`Outside` + `+ side` = `outside+`) would therefore put the body on
   the *opposite* side from the button's label, and would contradict this TODO's own docs
   example ("tap **X + side** to rest the Pi against the cube's +X face"). The mapping built
   is one-to-one onto the six canonical keys:

   | Relation | `− …` button | `+ …` button |
   |---|---|---|
   | Outside | `⇥ − side` → `outside+` | `⇤ + side` → `outside-` |
   | Inside | `⊏ − face` → `inside-` | `⊐ + face` → `inside+` |
   | Center | `◁ − half` → `center+` | `▷ + half` → `center-` |

   Each button's `title` gives the full sentence (e.g. *"Outside, + side: your − face meets
   the target's + face, so you end up beside it on its + side"*). The `above-*`/`below-*`
   aliases stay unexposed. The record written is byte-for-byte the shape the old popover wrote
   (`params: { axes, orientation, deltaMm }`), so only the *label* changed meaning; the docs
   rewrite must drop the old "the sign names the moving shape's face" sentence. Separately,
   `src/ai/tools/operate.js`'s `group.snap` orientation description says *"outside+ puts the
   first body on the second's + side"*, which is backwards by the same table — out of this
   task's files, reported for its own finding.
c. **Nothing changes a record shape**, so old projects load unchanged.
   `src/core/snapAlignReplay.spec.js` replays NDJSON text with `group.snap` and `group.align`
   lines written in the pre-`ui-060` shape and pins the resulting bounds.
d. **No keyboard shortcut exists** for Snap or Align (grepped `src/composables`, `src/stores`,
   `src/views`). The AI tools (`src/ai/tools/operate.js`) name the ops `group.snap` /
   `group.align` directly, not the UI buttons, so they are untouched and keep resolving.

Further decisions made while building it:

- **No-op suppression is `World origin` only.** A `Second selected` tap always appends,
  even when nothing moves yet: the record is parametric, and appending it is what makes the
  body *follow* the target later (`data-007`). Skipping it would silently drop the link.
- **Measure from vs. a drilled-in moving body.** When the moving body is addressed at a part
  (`selection.partOf`), that address *is* what is measured and the top line's `›` says so;
  the **Measure from** select is hidden then, so the two can never disagree (`ui-063`: an
  addressed part is never quietly dropped). Otherwise **Measure from** applies to both
  targets: `World origin` passes it as `partName`, `Second selected` writes the moving
  operand as `{ id, pieces }`.
- **Selection is unchanged by a tap in either target** (the old commit reselected only the
  moving body; both lineage roots stay valid across a `supersedes` move, so there is nothing
  to reselect, and the popover stays open on both).
- **Relation and Target-is-origin live in `alignReference.js`** (additive: `relation`,
  `originOnly`), UI-only. `Viewport.vue` reads `originOnly` so the second-picked body loses its
  teal role colour while `World origin` is chosen on a 2-selection.

## Effort

M/L. The UI work alone is M, mostly a re-skin. It is L because the popover has to be
extracted from a very large file, two e2e suites and four docs shots change under it, and
Open questions (a) and (b) may add `core` work. Split off the `core` half as its own
`core-NNN` row if (a) goes the "add modes" way.

## Testing

- **Unit** (`.spec.js`): `AlignPopover.spec.js` for the Target dropdown's presence (1 vs
  2 selected), the button grid's enabled state, the Snap row only under `Second selected`,
  the disabled hint at 0 and 3 selected, and the drop shortcut disabled under `Second
  selected`. `OperationsToolbar.spec.js`: one Align button, no Snap button, enabled for
  count 1 and 2. If (a) adds modes: `group.js` cases with an explicit `toBeCloseTo`
  tolerance, covering a zero-extent body, coincident faces, a moving body larger than the reference for `Inside`, a rotated moving body.
- **E2E**: a real `*.e2e.js` that navigates to `/` and covers three flows through the
  toolbar popover. The origin flow is the existing `align-to-origin.e2e.js` scenario (Pi,
  Measure from `mb`, X ctr / Y ctr / Z min, then Undo ×3, then the drop shortcut). More: the
  two-body Align, and a two-body Snap for **each Relation** (`Outside`, `Inside`, `Center`)
  checking the resulting position on one axis, each asserting the **second body
  did not move**. Also assert the Inspector's Transform section has **no**
  `align-origin-*` testid at any selection, as a guard against the old row coming back.
  Runs at **all three viewports** (Small-screen behaviour is not "same as desktop").
- **Engines**: all three (Chromium, Firefox, WebKit). The tests drive the viewport's
  gizmo and canvas, which `CLAUDE.md`'s Browser Support section lists as engine-sensitive.
- **Acceptance scenarios to re-drive by hand** (not scripted): the ones that place and then
  snap or align, which `TODO/ACCEPTANCE.md` will say; at minimum the scenarios covering
  Union/Subtract of two placed solids, the Raspberry Pi placement, and save/reload.
  Report PASS/FAIL for each.
- **Closed findings to re-run the repro of**: `ui-026` (Snap/Align operation), `ui-035`
  (sub-part operands), `ui-050` (align to origin), `data-007` (snapped dependents follow a
  primitive resize), and `ui-053`/`ui-036` if they touch the operations popover. The
  drilled-in `Raspberry Pi 1 › ethernet` Align example in `docs/snap-align.md` is the
  one to repeat verbatim.
- **Docs media**: `npm run docs:media`, then `e2e/docs-media.spec.js` (the `guards`
  project) must pass: no dead link, no orphan, no unclaimed picture.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
