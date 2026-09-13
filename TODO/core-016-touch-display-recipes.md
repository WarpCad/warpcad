---
title: "Touch Display composite recipes: 7-inch, TouchScreen2 — standalone, board parameter dropped"
category: core
kind: feature
priority: medium
model: opus
milestone: M4
depends: [core-014]
status: open
---

## Goal

Two composite recipes reproducing `jscad-raspberrypi@62a8e3b`'s `TouchDisplay_7inch
(rpi)` and `TouchScreen2(rpi)` (`touch-display-7inch.js:16-156`,
`touch-screen2.js:16-196`). Both are named in
`docs/decisions/composite-recipe-geometry.md`'s Family B table as taking a **required**
external board parameter — this task is where that decision's requirement actually
bites, not `core-014`/`015`: **drop the `rpi` parameter and expand each screen
standalone**, dimensioned relative to its own `lens`/`backPlate`, with the
board-relative placement step (`align('piMountingPad1'/'piMountingPost1', rpi.parts.
hole1, 'xy')` + `snap(..., rpi.parts.mb, 'z', 'outside+')`) becoming the user's own
top-level `group.align`/`group.snap` record (`ui-026`) between two independently
placed bodies, exactly as that decision doc's "Requirements" section specifies.

This task also owns the one call site the decision doc could not decompose:
`touch-screen2.js:184-193`'s hidden `noGoPower` clearance marker, which mixes frames
(one piece of the accessory positioned against the *board's* GPIO while the rest of
the accessory stays in its own frame). See Proposed fix for how it's handled without
reopening that decision.

## Interaction model

n/a — no Library row exists for any composite op yet. Feeds a future Hardware/Kit
Library section; the board-attachment step this task produces (a `group.align`/`group.
snap` pair) is exactly `ui-026`'s already-shipped Snap/Align control, so no *new*
interaction surface is needed for attachment either — placing the screen and attaching
it to a Pi are two ordinary drag-and-Snap/Align actions once both bodies exist in the
document.

## Documentation

n/a — no control exists yet.

## Affected files

- `src/core/kernel/recipes/raspberrypi.touchDisplay7inch.js` (new)
- `src/core/kernel/recipes/raspberrypi.touchScreen2.js` (new)
- `src/core/kernel/recipes/raspberrypi.touchDisplay7inch.spec.js`,
  `raspberrypi.touchScreen2.spec.js` (new)
- `src/core/kernel/registry.js` (register both, `composite(0, ...)`)

Real V1 source: `~/src/jscad/jscad-raspberrypi/src/touch-display-7inch.js:16-156`,
`touch-screen2.js:16-196` (commit `62a8e3b`).

## Proposed fix

**Drop the `rpi` parameter; every remaining reference is internal.** Once `rpi` is
gone, `TouchDisplay_7inch` builds `lens` → `backPlate` (snapped/translated against
`lens`) → four `screenMountingPad`s (one built via probe-and-bake, three more as
`.clone().translate(...)`, `:75-91`) → four `piMountingPad`s (same clone-and-translate
shape, `:111-132`) → the `noGoPower` clearance box against `backPlate` (`:138-148`,
ordinary, not the hidden-frame case). `TouchScreen2` is the same shape at more parts:
`lens` → `backPlate`/`overHang`/`backPlateCover` → four `screenMountingPad`s (two plain
clones, two additionally `.rotate('hole', 'z', 90)` before translating — `:96-103,107`,
port as a `transform.rotate` record on the cloned hole part before its own translate)
→ four `piMountingPost`s (clone-and-translate again).

**Both `dimCheck` groups are dropped**, same call and same reasoning as `core-014`'s:
hidden (`screen.add(dimCheck, 'dimCheck', true, ...)`, `touch-display-7inch.js:134`;
`touch-screen2.js:175`), purely visual development rulers, referenced by nothing else
in either function.

**The `piMountingPad1`/`piMountingPost1` attachment step becomes two top-level records
the caller appends after both bodies exist**: a `group.align` on `xy` against the
Pi's `hole1`, then a `group.snap` on `z` `outside+` against the Pi's `mb` — literally
`ui-026`'s Snap/Align control, sub-part-addressed (`{ id, pieces: 'piMountingPad1' }` /
`'piMountingPost1'`) exactly as `core-013`'s `{ id, pieces }` shape already supports.
This recipe does **not** emit that step — it is the assembly action the user (or a
future kit-assembly helper) takes once both bodies are placed, per the decision doc's
own "the port is a decomposition, not a redesign" framing.

**`touch-screen2.js:184-193`'s `noGoPower` marker — the one call the decision doc
flagged rather than decomposed.** It positions one hidden box against `rpi.parts.gpio`
(inside-, outside-) and against the screen's own `backPlate` (outside-) — a genuine
two-frame reference the recipe cannot resolve on its own once `rpi` is dropped, since
`gpio` belongs to a sibling body this recipe doesn't build. Per the decision doc's own
resolution path ("try recipe nesting first; two-phase expansion remains the last
resort" — but recipe nesting is itself deferred and not being built here), and given
this marker is **hidden geometry with no visible consequence** (`add`'s `hidden`
argument, confirmed at `~/src/jscad/jscad-utils/src/group.js:83-95`) whose only stated
purpose is downstream enclosure-design clearance: compute its position from `Gpio`'s
own analytic dimensions (`rpi-parts.js`'s `Gpio` factory, ported in `core-014`'s
`tables/rpi-parts.js`) and this recipe's own `gpio`-relative offset **as a constant
derived at expansion time from the screen's own geometry alone**, matching the marker's
`x`/`y` size (`{x:10, y:3, z:1}`) and its `backPlate`-relative Z-snap, but position it
at a fixed offset from `backPlate`'s own corner rather than from a `gpio` this recipe
doesn't have — i.e. treat it as "some hidden clearance box near this known corner of
the accessory" rather than reproducing the exact GPIO-relative X/Y to the millimetre.
**State this narrowing explicitly in the retirement note** (it is a real, small
divergence from V1, not an oversight) rather than silently matching or silently
dropping the marker. If a future task needs the marker positioned exactly against a
real GPIO header, that is exactly the "revival condition" #2 in
`docs/decisions/composite-recipe-geometry.md` and should reopen recipe nesting there,
not be re-solved ad hoc here.

**Sub-part addressing matters for every named pad/post.** Per the decision doc's own
closing requirement: `ui-016`'s Group-selection pick-depth must be able to reach
`piMountingPad1`..`4` / `piMountingPost1`..`4` individually (the attachment step
addresses one of them by name), so each pad/post must land as its own named part in
the recipe's output group — not folded into one combined solid.

## Effort

M — the geometry itself (mostly boxes and one clone-and-translate pattern repeated
four times per screen) is simpler than `core-014`, but the board-parameter-drop
redesign and the `noGoPower` frame-mixing exception are real design decisions this
task has to make correctly, not just port.

## Testing

Vitest, one `.spec.js` per recipe, plain Node. No V1 execution fixture. Geometric-
relation assertions: `lens`/`backPlate`/`overHang`/`backPlateCover` sizes match the
source constants; each mounting pad/post's centre matches its stated clone-translate
offset from pad/post 1; the rotated pads (`screenMountingPad1` in the 7-inch case,
`3`/`4` in the TouchScreen2 case) have their hole rotated 90° relative to the unrotated
ones, confirmed by measuring the hole's own bounding box, not by trusting the rotate
call (`ui-022`'s and `core-014a`'s own "verify by measurement" precedent). Degenerate
case: n/a (no size params, both are fixed-dimension real-world parts — no
zero/negative-input case exists to test, stated explicitly per this project's numeric-
test convention rather than invented).

No `*.e2e.js` — no UI surface exists yet.

Acceptance scenarios: none directly pass/fail on this task alone. **This task extends
`ui-026`'s subsystem** (a new pair of sub-part-addressable bodies the Snap/Align
control will be asked to attach) — `ui-026`'s own closed acceptance re-drive (scenario
3, Cube/Cylinder stand-in) should be re-run once a real screen+board pair exists to
confirm Snap/Align still resolves correctly against composite-recipe output with this
many named parts, not just against the two-primitive case it originally proved.
