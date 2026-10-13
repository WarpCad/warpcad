---
title: Snap/Align measures a Pi's hole against a screen's post, and the board against the post's top, instead of the whole Pi's centre and underside
category: ui
kind: finding
priority: high
model: opus
milestone: M13
depends: []
status: done
---

> **What shipped (2026-10-13).** Per-body addresses replace the single `subPart` slot in
> `src/stores/selection.js`; the single-body `subPart` is a derived view, so the breadcrumb,
> gizmo and `describeSelection` are unchanged. `selectedOperands` moved out of
> `OperationsToolbar.vue` into `useSelectedBody.js` as a pure `selectedOperandsOf`. Three
> departures from the text below: (1) a body toggled out of the selection keeps its address,
> inert, rather than dropping it, so `ui-040`'s documented "Shift-click out, add the base,
> Shift-click back in" route still works; (2) the Z step uses `outside-`, not `outside+`
> (`SNAP_SIDES['outside-']` puts the moving part's min on the reference's max); (3) `hole2`
> sits on `piMountingPost3` and `hole3` on `piMountingPost2`, not by number. `hole1` is taller
> than `mb`, so `mb` is the right Z operand with no special case.

## Problem

Reported by the user on 2026-10-12, after dragging a **Raspberry Pi 5** and a **touchScreen2**
out of the Library and mounting the board on the screen's posts:

> *"I selected the RPI hole and the pi mounting post on the screen. Aligning in x/y aligns the
> Pi on the center of the whole pi, and not on the hole selected. In the z when snapping the mb
> to the top of the pi mounting post on the screen, it is snapping to the bottom of the entire pi
> (with the sd card) and not just the mb. After snapping and aligning the pi's holes should be
> centered on the mounting posts and the mb should be resting on the top of the posts with no
> gap."*

Both symptoms have one cause: **the moving operand is silently measured as the whole Pi, even
though the user visibly selected a part of it.**

- **XY.** `group.align` is handed the whole board as the moving operand, so `calcCenterWith`
  centres the Pi's *overall* bounding box on the post, not `hole1`'s axis.
- **Z.** `group.snap` with the whole board as moving operand puts the bounding box's lowest
  face on the post's top. On a Pi 5 that face is the underside of the microSD socket and the
  other through-board components, which sit *below* `mb`, so `mb` ends up floating above the
  posts by the height of the lowest component.

**Why it happens, in the code.** `selection.js` has exactly one pick-depth slot,
`subPart: { bodyId, partName } | null`. `selectPart(bodyId, partName, additive)` documents it:
*"There is one depth slot: addressing a part on a second body moves it rather than holding
two."* So when the user addresses `hole1` on the Pi and then addresses `piMountingPost1` on
the screen, the second pick **overwrites** the first, `selectedOperands` builds `{ id, pieces:
'piMountingPost1' }` for the screen and a bare id for the Pi, and the Pi is measured whole.

`TODO/done/ui-035` knew about this and made it a rule, not a bug: *"Addressing is asymmetric on
purpose… at most one of the two operands can be drilled in at a time… Symmetric addressing is
not merely undesirable here, it is unrepresentable."* `docs/snap-align.md` repeats it as
**"You can drill into one side only."** That reasoning was about the *storage*, one slot; it
was never an argument that a user doesn't want both. The assembly step V1's own
`raspberrypi.touchScreen2` closing comment describes, `align('piMountingPad1',
rpi.parts.hole1, 'xy')` plus `snap(…, rpi.parts.mb, 'z', 'outside+')`, is **exactly** the
both-sides case: a named part of the board against a named part of the screen.

It is also silent. The popover's top line does say which operand is drilled, but nothing tells
the user that the Pi side they just ticked in the Objects list was **dropped**, and the result
looks like a plausible snap. The kernel has no arithmetic reason for the asymmetry:
`normalizeRef` and `referenceOf` resolve each operand independently (`ui-035`'s own first
reason).

## Affected files

- `src/stores/selection.js`: `subPart` (single slot), `selectPart`, `pruneSubPart`,
  `drillInto`, the "moves rather than holding two" comment. The single-body breadcrumb /
  gizmo contract (`describeSelection`) must be preserved byte-for-byte.
- `src/composables/useSelectedBody.js`: `selectedOperands`, the operand-building path
  `OperationsToolbar` already shares between the group ops (`ui-040`).
- `src/components/viewport/OperationsToolbar.vue`: the operand line (`Aligning A › x to
  B › y`), the `addressable` split, `opError`. If `ui-060` has landed, this is
  `AlignPopover.vue` instead. See Proposed fix.
- `src/components/inspector/`: the Objects list part rows (`ui-042`/`ui-049`), which is how
  a user addresses an occluded part like a hole.
- `docs/snap-align.md` ("A second example", **You can drill into one side only**).
- `e2e/docs/snap-align.docs.js`, `docs/media/manifest.json`.

## Proposed fix

**Let each selected body carry its own addressed part**, so a Snap/Align commit can name a
part on both sides, and make the result visible before it is committed.

1. **Selection state.** Replace the single `subPart` slot with a per-body map for the
   multi-selection case (`{ [bodyId]: partName }`), keeping the existing single-body
   `subPart` as the derived view the breadcrumb, gizmo and `describeSelection` read when
   exactly one body is selected. That keeps `ui-016`'s whole-group gizmo contract and every
   existing single-selection caller unchanged. `selectPart(..., additive)` then *adds* an
   address for that body instead of moving the one slot. Toggling a body out of the
   selection drops its address. Replacing the selection (`select`, empty-space click)
   clears all of them, as `pruneSubPart` does now.
2. **Operands.** `selectedOperands` builds `{ id, pieces }` for every body that has an
   address, in selection order, so `group.snap`/`group.align` receive `pieces` on both the
   moving and the reference operand. Nothing changes in the kernel or the record shape:
   `group.snap` already honours `moving.pieces` (and moves the whole group) and
   `referenceOf(reference)` already honours the reference's. Old documents replay
   unchanged.
3. **No silent whole-body fallback.** The popover's operand line is the confirmation and
   must show **both** sides, e.g. `Aligning Raspberry Pi 1 › hole1 to touchScreen2 1 ›
   piMountingPost1`. If a body in the selection has an address that the commit would not
   use (a path this change must not leave open), say so in `opError` rather than measure
   whole.
4. **The Z step needs the board, not the hole.** XY aligns `hole1` (the hole's axis) to the
   post's axis. Z must rest the **board's `mb`** on the post's top, which is a different
   moving part. The user does these as two commits, and that is fine, but it means the
   popover must make re-addressing the moving side between the two commits quick. Step 2 of
   `/fix-todo` must check `hole1`'s z extent against `mb`'s in
   `raspberrypi.bplus.js`. If the hole cylinder is taller than the board, snapping `hole1`
   to the post top is also wrong, and that is why `mb` is the right Z operand. Do not
   "fix" this by special-casing Z to always use `mb`.
5. **Snap orientation for the Z step.** Confirm against `SNAP_SIDES` in `group.js` which
   orientation (`outside-` or `outside+`) puts the moving part's `min z` on the reference's
   `max z`, and write the unit test against that table, not against a guess in this file.

**Out of scope, and why it is not in this task:**

- Making the hole *pickable in the 3D view* is `ui-016`'s occlusion limitation, logged in
  `TODO/VERIFY.md` by `ui-035`. The user's flow works through the Objects list
  (`ui-042`/`ui-049`), which this task relies on.
- A "mount on all four posts" action is **not needed and must not be added**. Aligning
  one hole to one post is the whole operation: `group.snap`/`group.align` use the named
  part only to compute the offset and then move the *entire* group (V1's
  `Group.prototype.snap`, and the registry's "the whole group still moves" note), so
  `hole2`-`hole4` follow `hole1` and land on posts 2-4 because the board's hole spacing
  matches the screen's post spacing. That is the idiom the user's JSCAD V1 projects use.
  The fix here is only that the named part on the moving side is currently discarded.

**Coordinate with `ui-060`** (one Align tool, open). That file rewrites the popover this
touches, and its Open question (d) says to keep every identifier working. If `ui-060`
lands first, implement 2-3 above in `AlignPopover.vue`. If this lands first, `ui-060`'s
"top line names the operands" bullet must be updated to say both sides can carry a `›`.
Either order is fine because the selection-store and operand-building changes (1 and 2)
are the same in both.

## Effort

M. The selection store and `selectedOperands` are small, but `selection.js` has many
callers that assume one slot (breadcrumb, gizmo, Inspector, Objects list, merge, delete),
so the audit of them is the work. Escalate to L if (4) shows the recipe's hole geometry
needs changing.

## Testing

- **Unit.**
  - `selection.spec.js`: addresses accumulate per body in the multi-selection case, are
    dropped with their body, are cleared by `select`, and the single-body breadcrumb view
    is unchanged.
  - `registry.spec.js` / a new `snap-align-both-subparts.spec.js` using the existing
    `src/core/__fixtures__/piScenes.js` fixtures for a real Pi 5 and a real `touchScreen2`.
    Assert, with `toBeCloseTo(…, 6)` (mm):
    - after `group.align` on `xy` with `hole1` as moving and `piMountingPost1` as
      reference, the hole's axis x/y equals the post's axis x/y;
    - after `group.snap` on `z` with `mb` as moving and the post as reference, `mb`'s
      `min z` equals the post's `max z`: **no gap and no penetration**;
    - **one commit places all four**: after the single `hole1` to `piMountingPost1`
      align, `hole2`, `hole3` and `hole4` each have their axis x/y on the axis of
      `piMountingPost2`, `3` and `4`. This is the user's actual acceptance check, and it
      also pins the board's hole spacing against the screen's post spacing, so a
      recipe drift in either would fail here rather than in someone's printed case;
    - the **whole Pi**'s bounding box is *not* what was measured. Place the SD card
      below `mb` and assert `mb` sits on the post, not the card.
    - degenerate cases: a post addressed on the reference but a bare solid as moving
      (existing asymmetric case still works), a stale `pieces` name (still an error, not
      a silent whole-body fallback), and a rotated moving body.
- **E2E**: a new real `*.e2e.js` that navigates to `/` and drives the user's exact flow:
  drag a Pi 5 and a touchScreen2 in from the Library, tick `hole1` in the Pi's Objects
  list, Shift-select the screen and tick `piMountingPost1`, check the popover's top line
  names **both** parts, Align X and Y, then re-address the Pi to `mb`, Snap Z, and read
  the body positions back through the Inspector. Runs at **all three viewports** (the
  Objects list and popover are bottom-sheet-anchored at phone width) and on **all three
  engines**; the Objects-list ticking and canvas selection are engine-sensitive.
- **Acceptance scenarios to re-drive by hand** (not scripted), PASS/FAIL each:
  **3** (snap-placement of a kit assembly), **6** (group vs. sub-part selection), **5**
  (hidden-part boolean), **10** (save/reload, since the per-body addresses must not leak
  into the document) and **15** (change a part's model under a dependent, because a
  snapped Pi's `pieces` name must survive a model change as `ui-035` ruled).
- **Closed findings whose repro to re-run verbatim**: `ui-035` (Ethernet-jack Align
  example in `docs/snap-align.md`, and the `hole1` screw example), `ui-016`
  (single-body drill-in and gizmo), `ui-040` (sub-part boolean operands share the
  operand path), `ui-042`/`ui-049` (Objects list part rows), `core-013`, and `core-034`
  (the drilled holes: `hole1`-`hole4` must still be addressable parts).

## Documentation

- **Page**: `docs/snap-align.md`: replace **You can drill into one side only** with the
  both-sides rule, extend the second example, and keep the Ethernet-jack example.
- **Example**: *"Drag a Raspberry Pi 5 and a touchScreen2 from the Library. Click the Pi,
  then tick `hole1` in the Inspector's Objects list. Hold Shift and click the screen,
  then tick `piMountingPost1`. Press **Align**: the top line reads `Aligning Raspberry Pi
  1 › hole1 to touchScreen2 1 › piMountingPost1`. Tick X and Y and commit: `hole1`'s axis
  is on post 1's axis, and because the whole board moves with it, the other three holes
  are on their posts too. Now select the Pi's `mb` part in place of `hole1`, press
  **Snap**, tick Z with `Outside +`, and commit. The board's underside rests on the post's
  top, with no gap."* Units are millimetres, Z-up.
- **Media**: re-record `snap-subpart-operand.gif` if its popover top line changes, and add
  `snap-subpart-both-sides.gif` to `e2e/docs/snap-align.docs.js` (embedded in
  `docs/snap-align.md`). `e2e/docs-media.spec.js` must pass.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
