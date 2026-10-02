---
title: Snap/Align operation — precise computed reposition of one item against another
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M3
depends: [core-013]
status: done
---

> **What actually shipped, where it differs from the proposal below.** Two
> deliberate narrowings, both stated here rather than silently done:
>
> 1. **The appended record omits `name`.** The record shape sketched in
>    Affected files below (`{ id, op, name, target, operands, supersedes,
>    params }`) includes `name`, but `document.js`'s own module doc states that
>    `Body.name`/`op`/`params` are read from a lineage's **root** record, never
>    a superseding one — so a `name` here would be silently unused. Omitting it
>    matches the established precedent for a `supersedes`-shaped record,
>    `src/core/transform.js`'s `translateRecord`/`rotateRecord` (the gizmo
>    drag's own commit), which carry no `name` either, rather than copying the
>    `consumes`-based booleans' shape where a name is genuinely needed (they
>    are their own new lineage root).
> 2. **The Offset field is one scalar for both ops, not a per-axis vector for
>    Align.** `group.js`'s `calcSnap` (which `group.snap` calls) only ever adds
>    its `deltaMm` as a single scalar across every checked axis — its own
>    signature has no vector form. Offering a per-axis vector in the popover
>    for *Align* only (where `calcCenterWith` does accept one) while Snap stays
>    scalar-only would need two different field shapes depending on which
>    button opened the popover, for a case neither this file's Interaction
>    model nor its Testing section actually exercises. A single scalar field,
>    applied uniformly to both ops, avoids ever handing `calcSnap` an array
>    where it expects a number (silent `NaN`, no thrown error) and is what
>    shipped; a true per-axis Align offset is left for a later task.
>
> Also found and fixed during this task, not proposed by it: the popover's
> first design (anchored below the button row, like `ui-019`'s gear popover)
> broke two ways at phone width — a `<Teleport to="body">` was needed, both to
> escape `.ops`'s `backdrop-filter` (which Chromium treats as the containing
> block for `position: fixed` descendants) and to clear `NavigationChrome`
> after the Inspector's bottom sheet relocates it. See
> `src/components/viewport/OperationsToolbar.vue`'s own `.ops__popover` CSS
> comment for the full account — this was caught by this task's own e2e spec,
> not designed up front.

## Goal

`core-013` ported and registered `group.snap`/`group.align` but built no way to
reach them — its own retirement note flags this gap explicitly and names this task as
the fix. Add a UI surface: with exactly two solids selected, a numeric-parameter
operation moves the first-selected item to a precise computed position against the
second (snap: flush against a named side, with an offset; align: centred on one or
more axes) — distinct from `ui-013`'s drag-time visual snap guides, which only ever
run while a *new* item is being dropped, never against two already-placed bodies.
"Done" looks like: select a Cube then a Cylinder, open Align, pick axis Z and
orientation "outside+", commit — the Cube moves to sit flush on top of the Cylinder,
the Cylinder never moves, and both remain two independent, separately selectable
bodies afterward (this is not a Group or a boolean — nothing is combined or consumed).

## Interaction model

- **Precondition** — **exactly 2** solids selected, not "2 or more" like the
  existing Union/Subtract/Intersect/Group buttons on the same toolbar. Selecting a
  third solid disables Snap/Align the same way selecting only one does — CLAUDE.md's
  "gated on selection count" rule applied literally, since this op's registry entry
  (`requireTwoOperands`, `core-013`) throws on anything but 2 operands.
- **Trigger** — Two new buttons, **Snap** and **Align**, appended to
  `OperationsToolbar.vue`'s existing `OPERATIONS`-driven row (currently Union/
  Subtract/Intersect/Group). Clicking either while enabled opens a small popover
  anchored to the button (same mechanism `ui-019`'s mouse-nav settings gear already
  uses) rather than committing immediately — unlike the other four buttons, this op
  needs parameters (axis, orientation, offset) a stateless click cannot supply.
  Popover contents: axis checkboxes (X/Y/Z, any combination — the registry's `axes`
  param accepts a multi-axis string like `"xz"`); for **Snap only**, an orientation
  dropdown exposing the 6 canonical `SNAP_SIDES` keys (`outside+`/`outside-`/
  `inside+`/`inside-`/`center+`/`center-` — the other 4 registered keys,
  `above-*`/`below-*`, are literal aliases of these six per `group.js`'s own
  `SNAP_SIDES` table, so the UI exposes one name per distinct behavior rather than
  10 names for 6 behaviors); a numeric offset field (mm, defaults to 0, per-axis if
  more than one axis is checked — `deltaMm` accepts a scalar or vector). Align has
  no orientation control (V1's own signature difference — always centres). A
  "Snap"/"Align" commit button inside the popover appends the record; closing the
  popover without committing changes nothing.
- **Feedback** — On commit, the first-selected solid's mesh moves to the computed
  position; the popover closes; the moved solid stays selected (same UX as every
  other operation's post-commit selection). **Unlike every other button on this
  toolbar, both operands remain as two separate bodies afterward** — say this
  explicitly in the popover's own copy ("moves the first selection; nothing is
  combined"), since a user's only precedent on this toolbar (Union/Subtract/
  Intersect/Group) is "the operands disappear into one result," and Snap/Align
  breaks that pattern on purpose.
- **Placement** — n/a; acts on existing geometry, creates nothing at a transform.
- **Selection response** — Same base/secondary-highlight visual indicator
  `ui-014` already built for Subtract's base/subtrahend order (`Viewport.vue`'s
  three-way selection-material split: first-selected id gets one highlight, the
  rest get another) — reused verbatim, not reinvented, and relabelled in the
  popover's own copy as "moving" (first-selected) and "reference" (second-selected)
  rather than Subtract's "base"/"subtrahend" wording, since the relationship here is
  different (nothing is removed). This isn't a new mechanism to design: `core-013`'s
  registry entries already destructure `[moving, reference] = requireTwoOperands(...)`
  where `inputs[0]` is `target` (first-selected, by the fold's existing input order —
  the same fact `ui-014`'s own module doc already states) and `inputs[1]` is the
  first `operand` (second-selected) — the UI's existing order convention already
  produces exactly the right operand order with zero new logic.
- **Selection count** — Exactly 2, per Precondition above. State this as a genuine
  divergence from the other four buttons' "2 or more," not an oversight.
- **Small-screen behavior** — Same auto-wrapping toolbar row `ui-014`/`ui-015`
  already handle at phone width; the new popover needs its own check that it stays
  on-screen and reachable by touch at 390px width (it may need to anchor
  differently than `ui-019`'s gear popover, which opens from a corner control, not a
  row of equal-weight buttons — check for edge-of-viewport clipping at phone width
  specifically, since a 6-row popover (axis + orientation + offset + commit) is
  taller than the settings popover it borrows the mechanism from).

## Documentation

- **Page**: `docs/snap-align.md` (new) — distinct from `docs/booleans.md` and
  `docs/groups.md` since neither combines nor removes geometry; cross-reference from
  both existing pages' toolbar descriptions, matching the pattern `ui-015` set when
  it added Group to `docs/booleans.md`'s toolbar description.
- **Example**: "Drag a Cube and a Cylinder into the viewport so they don't overlap.
  Click the Cube, then Shift-click the Cylinder — the Cube is now the 'moving' item,
  the Cylinder the 'reference'. Click Align, check the Z axis, click Align in the
  popover: the Cube moves to sit centred on the Cylinder along Z, while X and Y stay
  as they were. Both solids remain separately selectable — nothing was combined."

## Affected files

- `src/components/viewport/OperationsToolbar.vue` — two new `OPERATIONS`-shaped
  entries with a `params: true` (or similar) flag distinguishing "needs a popover"
  from the existing stateless-click ops; a new popover component (or inline template
  block) for axis/orientation/offset entry; `run()` needs a second path alongside the
  existing `consumes`-based one — Snap/Align commit `{ id, op, name, target: base,
  operands: rest, supersedes: base, params: { axes, orientation, deltaMm } }`, with
  **`supersedes`, not `consumes`** (see Proposed fix for why getting this backward
  would be a real bug, not a style choice), and gate `disabled` for these two
  specifically on `selection.count !== 2` rather than the shared `< MINIMUM_OPERANDS`.
- `src/components/viewport/OperationsToolbar.spec.js` (if it exists — `ui-015`'s own
  note found it does not; confirm fresh at Step 2) — new cases for the two-button
  exact-count gating and the popover's param collection.
- `docs/snap-align.md` (new), `docs/booleans.md`/`docs/groups.md` (one
  cross-reference line each).
- `e2e/snap-align-operation.e2e.js` (new) — see Testing.

## Proposed fix

**The record must `supersedes`, not `consumes` — this is the one place getting it
backward would ship a real bug.** Every existing button on this toolbar (Union/
Subtract/Intersect/Group) reduces its operands into a *new* body and marks every
input `consumes`-ed (retired, no longer independently selectable — see
`OperationsToolbar.vue`'s own module doc on why `document.js`'s lineage bookkeeping
needs that). `group.snap`/`group.align`'s registry entries do the opposite: they
return the *moved* geometry for the **first operand alone** — the reference operand's
own value is read, never written. Semantically this is a transform, not a
combination: the moving body's identity continues (same object, new position), the
reference body is untouched and must remain exactly as selectable afterward as it was
before. `document.js`'s `supersedes` field (already used by every `transform.*`
record, `ui-012`) is the correct mechanism — reusing `consumes` here would silently
retire the reference body from `bodies()` even though its geometry never changed,
which is exactly the class of "looks fine until you check the body count" bug
`OperationsToolbar.vue`'s own existing module doc already warns about for a
different case (stale operand ids after a move).

**No kernel change needed.** `core-013` already built and tested `group.snap`/
`group.align`'s full registry entries, including whole-object and named-sub-part
addressing (`{ id, pieces }`) on either side. This task's whole job is: build the
popover, collect `axes`/`orientation`/`deltaMm`, and append a record shaped as above.
Named-sub-part addressing (snapping *by* a specific named piece of a composite, e.g.
"snap this bolt by its head") is **explicitly deferred** — `ui-016`'s pick-depth
selection only supports one drilled-in sub-part at a time on a *single* selection, and
Snap/Align needs two live selections simultaneously, which is a real UI design gap
this task does not attempt to close. State this in the popover's own copy or a
disabled hint, not silently: whole-object snap/align only, for both operands, in this
first cut.

## Effort

M — the kernel side is entirely done (`core-013`); the work is a new popover
component, the `supersedes`-based commit path, and the exact-count gating. `model:
sonnet`: no real architectural ambiguity once the `supersedes`-vs-`consumes`
distinction above is stated (which this file does), and it closely mirrors
`OperationsToolbar.vue`'s existing button/popover patterns (`ui-019`'s settings
popover for the UI shape, `ui-014`'s order-highlight for the visual contract).

## Testing

Vitest:
- `OperationsToolbar.spec.js` (component-level, if it exists) — Snap/Align disabled
  at 1, 2 is enabled, 3 is disabled again (the exact-count divergence from the other
  four buttons); popover collects axis/orientation/offset and calls
  `documentStore.append` with `supersedes: base`, no `consumes` field present at all
  (assert its absence, not just that `supersedes` is present, since a stray
  `consumes` alongside `supersedes` throws in `document.js`'s own validation).

`*.e2e.js` — required, new controls:
- `e2e/snap-align-operation.e2e.js` (new): drag-place two non-overlapping solids,
  select both (order matters — first then second), open Align, check Z, commit —
  assert the first solid's rendered position changed to match `calcCenterWith`'s
  arithmetic for the two real bodies' bounds, the second solid's position is
  byte-identical to before, and **both remain independently selectable**
  (`data-body-count` unchanged, clicking either still opens its own Inspector). A
  second case runs Snap with a real orientation and offset, asserting the exact
  computed position against `calcSnap`'s own arithmetic on the same two bodies
  (not eyeballed). A third case confirms selecting 3 bodies disables both buttons.
- Reference viewports: **all three** (phone/tablet/laptop) — the popover is a new
  element whose fit at 390px needs its own check, per the Interaction model's
  Small-screen bullet.
- Engines: **Chromium only** — same reasoning `ui-015` gave for its own Group
  button: this is DOM/state logic (popover, param collection, record shape), not a
  new WebGL/canvas/touch surface. The moved solid's *position* is asserted via the
  document store's own reported bounds, not a pixel-level render comparison.

**Acceptance scenarios**: no `TODO/ACCEPTANCE.md` scenario names this task directly
by number, but `core-013`'s own roadmap row states this task "feeds §9 scenario 3
(kit assembly placement)" once it exists — re-drive scenario 3 by hand after this
lands, confirming a hand-placed item can be precisely repositioned against another
via this control (standing in for the still-M2-blocked hardware/kit-part case the
same way `ui-013`/`ui-014` stood in Cubes and Cylinders for Bolt). Also re-drive
**scenario 1** (two independent primitives), since Snap/Align is the first operation
on this toolbar whose whole point is that both operands *remain* independently
selectable afterward — confirm placing two solids, snapping one against the other,
then placing a third unrelated solid doesn't regress body count or visibility.

**Regression surface**: this extends `OperationsToolbar.vue`'s `run()` and the
selection-order highlight `ui-014` built — re-run `ui-014`'s and `ui-015`'s existing
e2e specs unchanged as a baseline check that adding a `supersedes`-based path
alongside the existing `consumes`-based one didn't disturb either. Does not touch
`document.js`'s `consumes`/`mergedInto` bookkeeping at all (this task's whole point is
using `supersedes` instead), so `core-020`'s fix is not at risk — state this
explicitly rather than silently skip it, since this task sits in the same
`OperationsToolbar.vue` file `core-020`'s regression was originally found through.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
