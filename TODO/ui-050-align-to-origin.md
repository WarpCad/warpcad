---
title: Align a single selected body or group to the world origin, per axis, measured from the whole body or one named part
category: ui
kind: feature
priority: high
model: sonnet
milestone: M7
depends: []
status: open
---

## Goal

Requested by the user on 2026-09-27:

> *"When a single object or group is selected, it should be possible to align and snap
> to the origin point. For example, I've added a raspberry pi from the library. I'd like
> to center it in x and y, and snap the bottom of the motherboard to the z origin."*

Today the only ways to put a placed body at a precise spot relative to the origin are:

- **Typing Position fields** in the Inspector. These set the body's *bounding-box
  centre*, so "bottom at Z=0" means reading the body's height, halving it, and typing
  that. A Pi's height depends on which parts it has.
- **Snap/Align** (`ui-026`/`ui-035`). This needs **exactly 2** selected bodies and moves
  one against the other. The origin is not a body, so there's nothing to select as the
  reference.

Neither covers the request. The Pi also shows why a plain "bounding box to origin"
isn't enough. In `raspberrypi.bplus.js` the `microsd` part is snapped `outside+` on Z
under the board, so it hangs 1.5 mm below the PCB. The visible bounding box bottom is
the card's bottom, not the board's. "Snap the bottom of the motherboard to Z=0" has to
be able to measure from the `board` part alone while moving the whole Pi.

"Done" looks like this. Drop a Raspberry Pi anywhere, select it, and in the Inspector's
**Align to origin** row:

1. Set **Reference** to `board`.
2. Tap X **center**, Y **center** and Z **min**.

The whole Pi moves in one step. The board's footprint is centred on the origin in X
and Y, the board's underside sits exactly on Z=0, and the micro-SD card pokes 1.5 mm
below the grid. One Undo puts it back where it was.

## Interaction model

- **Precondition**: **exactly 1** body selected, at body depth. It can be a bare solid,
  a library composite (Pi, Bolt), or a user-made group (`ui-015`). With 0 or 2+ selected
  the row is **absent**, not disabled, like every other single-body Inspector section.
  At **sub-part depth** (`Pi 1 ▸ ethernet`, `ui-016`) the row is also absent, because
  the Transform section is frozen there. Instead, Reference defaults to the part the user
  had drilled into when they step back up (see Selection response).
- **Trigger**: a new **Align to origin** row inside the Inspector's existing
  **Transform** section, directly under Position/Rotation. It is not a toolbar button:
  the Operations toolbar is the multi-operand surface (`ui-014`/`ui-026`), and this
  operates on the one selected body, which the Inspector already owns.
  - **Reference** `<select>` (`data-testid="align-origin-reference"`):
    - `Whole object` (default): the body's visible bounding box, the same box
      `positionOf()` uses.
    - For a body with named parts, one option per **visible** part in group order. Hidden
      parts (`clearance-*`, `hole*`, Bolt `tap`) are excluded, because `boundsOf()`
      already ignores them and nobody means "put the invisible clearance on the floor".
    - A bare solid has only `Whole object`, and the select is hidden rather than showing a
      one-option dropdown.
  - Three axis rows, **X / Y / Z**, each with three buttons: **min**, **center**, **max**
    (`data-testid="align-origin-{x|y|z}-{min|center|max}"`, each at least 44×44 px). Each
    tap commits immediately and moves the body so that the reference's min face, centre
    or max face on that axis lands on 0. There's no popover and no confirm step. It's one
    click to one record, like typing a Position field, and Undo is the escape hatch.
  - An **All: center XY, min Z** shortcut button (`data-testid="align-origin-drop"`),
    labelled **Center on origin, sit on grid**. It does the Pi request in one tap and
    commits **one** record, not three. This is the common case (centre the part on the
    bed, sitting on the floor), so it earns a single control.
- **Feedback**:
  - The body's mesh moves. The gizmo, dimension lines and the Position fields all follow,
    because this is the same `transform.translate` record `ui-012`'s paths produce (see
    Proposed fix).
  - The History panel gets one `Move` step. Its label reads `Align to origin` via
    `timelineLabel.js` if the record carries `params.alignedTo`, otherwise the plain move
    label. Decide at Step 2 and say which.
  - A no-op tap (already aligned within 1e-6 mm) appends **nothing**, so Undo doesn't fill
    up with invisible steps. The button gives brief pressed feedback only.
- **Placement**: n/a. Nothing is created.
- **Selection response**: the selection stays on the body after a tap, so the user can
  chain X then Y then Z. Reference is remembered **per body for the session** (UI-only
  store, not the document), so aligning the Pi's board on X and then Z doesn't mean
  re-picking `board` in between. When the user drills into a part (`ui-016`) and then
  steps back up to the body, Reference preselects that part. "I tapped the board, now
  align from it" works with no dropdown.
- **Selection count**: exactly 1, per Precondition. Aligning **several** selected bodies
  to the origin as one unit (their combined box) is **out of scope**. Say so in the docs.
  The user can Group them (`ui-015`) and align the group.
- **Small-screen behaviour**: not "same as desktop". The row lives in the phone Inspector
  sheet, which is already scroll-constrained:
  - The 3×3 button grid plus the X/Y/Z labels must fit 390 px without horizontal
    scroll, at ≥44 px tap targets. Use icon-plus-short-label buttons (`⊢ min`, `⊣ max`,
    `◇ ctr`) in a CSS grid, not a text row.
  - The **Center on origin, sit on grid** shortcut goes first, full width, above the grid.
    On a phone it's the one most people will use.
  - Tapping a button must not collapse or scroll-jump the sheet. The selection doesn't
    change, so the sheet's auto-open/dismiss logic must not fire.

## Documentation

- **Page**: `docs/selection-and-inspector.md`. Add an **Align to origin** subsection
  under its Transform material, and a one-line cross-reference from `docs/snap-align.md`
  ("to align one object to the origin rather than to another object, see …"), because
  that's where a user who already knows Snap/Align will look.
- **Example**: *"Drag a Raspberry Pi from the Library and drop it anywhere. Tap it so
  the Inspector shows **Raspberry Pi 1**. Under **Transform ▸ Align to origin**, set
  **Reference** to `board`. Tap **X ctr**, **Y ctr** and **Z min**. The board is now
  centred on the origin, and its underside sits exactly on the grid (Position Z reads
  the board's half-thickness, not 0, because Position is the whole Pi's box centre and
  the micro-SD card hangs 1.5 mm below). Press **Undo** three times to go back, or next
  time tap **Center on origin, sit on grid** instead: with Reference on `board`, it does
  all three in one step."*
  Name the convention on the page: millimetres, Z-up, and **min** means the face with the
  smaller coordinate (the underside on Z).

## Affected files

- `src/core/transform.js`: new `alignToOriginRecord(document, bodyId, spec)`, where
  `spec = { x?, y?, z?: 'min' | 'center' | 'max', partName?: string }`. It returns a
  `translateRecord` built from the reference bounds, or `null` when every requested axis
  is already aligned. Framework-free and JSDoc'd, next to `moveToRecord`, which it
  closely mirrors.
- `src/core/transform.spec.js`: cases below.
- `src/core/inspector.js`: `describeBody` exposes the list of **visible** part names in
  group order for the Reference dropdown. If `ui-049` has landed, reuse its
  `parts: { name, hidden }[]` and filter. Don't add a parallel list.
- `src/components/inspector/AlignToOrigin.vue` (new): the row, extracted per "views
  must be thin". `Inspector.vue` is already ~1,500 lines.
- `src/components/inspector/Inspector.vue`: mount it inside the Transform section,
  1-selected, body depth only.
- `src/composables/useTransformCommands.js`: an `alignToOrigin(bodyId, spec)` command
  that appends through the command layer with the same origin as the gizmo and typed
  paths, so it's one local Undo step.
- `src/stores/alignReference.js` (new, UI-only): `Map<bodyId, partName | null>` for the
  session, plus the "last drilled part" hand-off from `selection.drillInto`.
- `src/core/timelineLabel.js`: only if Step 2 chooses the `Align to origin` label.
- `e2e/align-to-origin.e2e.js` (new).
- `docs/selection-and-inspector.md`, `docs/snap-align.md`.

## Proposed fix

**Bake a translate record, don't add a new op.** The delta for each requested axis is:

| mode | delta on axis *i* |
|---|---|
| `min` | `-refMin[i]` |
| `center` | `-(refMin[i] + refMax[i]) / 2` |
| `max` | `-refMax[i]` |

Unrequested axes get 0. Here `[refMin, refMax]` is `boundsOf(body.geometry)` for
`Whole object`, or `boundsOf(body.geometry.parts[partName])` for a named part. The part
lookup must use the body's **current evaluated** group, which `ui-035`/`core-024`
guarantee keeps its named parts through transforms. Hand the vector to
`translateRecord()`. The record is then indistinguishable from a gizmo drag or a typed
Position, so:

- gizmo and field sync is automatic (CLAUDE.md, "Gizmo drag and numeric-field edits must
  drive the same underlying transform"),
- Undo scoping is already right,
- save/reload and replay already work (scenario 10).

**The parametric alternative, and why it isn't the default.** A new
`transform.alignToOrigin` op evaluated at fold time would re-align the body if an
upstream edit changed its size (say, editing a Cube's height would keep it on the grid).
`ui-026` made Snap/Align parametric (`group.snap` records re-evaluate). The trade-offs:

- It's a new op kind in the fold, and `rotation` still has to be carried through.
- "Aligned once" becomes "pinned forever", which surprises a user who later drags the
  body off the origin: the drag record supersedes it, so the pin silently stops
  applying.

The request reads as a one-shot placement action, so the baked record matches it. If
Step 2 disagrees, it must say how a later gizmo drag interacts with the pin.

**Rotated bodies**: bounds are world-axis-aligned, which is what "sit on Z=0" means for
a tilted part. Measure `boundsOf` on the evaluated (already rotated) geometry, not
`localBoundsOf`. Add a test that proves it.

**Group validation**: if `partName` no longer exists on the body (an undo removed it, or
a param edit changed the part set), fall back to `Whole object` and reset the stored
Reference. Never throw from a button tap.

## Effort

M. The core function is S. Most of the effort is the Inspector row, the phone-sheet
fit, the per-body Reference memory, and the three-engine e2e spec.

## Testing

- **Unit (`src/core/transform.spec.js`)**, tolerance `toBeCloseTo(…, 6)`:
  - A Cube at an arbitrary position, `{ x: 'center', y: 'center', z: 'min' }`: after
    applying, its box is centred on X/Y with min Z = 0.
  - `max` on each axis puts max = 0.
  - Only the requested axes move. `{ z: 'min' }` leaves X/Y exactly unchanged.
  - **The Pi case**: a real `raspberrypi.bplus` body, `partName: 'board'`, `z: 'min'`.
    The `board` part's min Z is 0, and the whole body's min Z is `-1.5` (the micro-SD).
    This one test is the reason the Reference picker exists.
  - A hidden part name (`clearance-ethernet`) is not offered by the `describeBody`
    visible-part list.
  - A rotated body (45° about X) with `z: 'min'`: the evaluated world box's min Z is 0.
  - Degenerate cases:
    - already aligned returns `null`, and no record is appended;
    - an unknown `partName` falls back to the whole body;
    - a zero-thickness box (a flat sketch extrude at 0) returns `null` or a valid record
      without `NaN`;
    - `-0` never leaks into the vector (the `boundsOf` signed-zero note).
- **Unit (`AlignToOrigin` component spec)**:
  - absent at 0, 2+ and sub-part depth;
  - the Reference select is hidden for a bare solid;
  - the shortcut emits one command, not three.
- **New `e2e/align-to-origin.e2e.js`** (navigates to `/`):
  - Drop a Pi, select it, set Reference `board`, tap **Center on origin, sit on grid**.
    Assert the Inspector Position reads centred on X/Y. Assert the board's world min Z is
    0 via the existing test hook the dimension-line specs read. Assert the History panel
    gained exactly one step, and one Undo restores the prior Position.
  - Tap X **max** on a Cube. Only X changes.
  - Drill into the Pi's `usb` part, step back up, and Reference shows `usb`.
  - With 2 bodies selected, the row does not exist in the DOM.
  - After aligning, drag the gizmo. The Position fields and the mesh still agree (gizmo
    and field sync is not broken by a third writer).
  - Runs at **all three viewports** with a snapshot at each (a new Inspector-sheet
    control at phone width), and on **all three engines** (the assertions read rendered
    evaluated geometry and the gizmo path).
- **`TODO/ACCEPTANCE.md` scenarios to re-drive**:
  - **1** (two independent primitives): aligning one must not move or overwrite the
    other.
  - **6** (group vs. sub-part selection): the drill-in hand-off to Reference, and that
    sub-part depth still freezes Transform.
  - **10** (save, reload): an aligned body reloads where it was left.
  - **12** (edit a mid-history step): an upstream param edit after an align replays
    without throwing. The baked delta is expected not to re-align, and the docs say so.
- **Closed-finding regression surface**: this adds a third writer to the transform path
  `ui-012` (gizmo and field sync) and `core-004` (rotation composition) were filed
  against. Re-run `ui-012`'s original repro (drag, then type, then drag, with fields and
  mesh agreeing), and `core-004`'s (an out-of-order rotation history followed by a move
  keeps its Rotation fields) with an align step inserted between.
- **Coordination**: `ui-049` rewrites `Inspector.vue`'s empty state and replaces
  `hiddenParts` with `parts`. Whichever lands second rebases onto the other. They're not
  a hard dependency, but don't run both in the same `/run-todos` batch.
