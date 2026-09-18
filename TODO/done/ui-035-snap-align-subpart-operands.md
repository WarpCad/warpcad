---
title: Sub-part-addressed operands for the Snap/Align popover
category: ui
kind: feature
priority: medium
model: opus
milestone: M5
depends: [ui-016, core-013]
status: done
---

> **Retirement note.** Shipped as scoped, with the file's own open design question
> answered the way it recommended and three things it did not anticipate.
>
> **The asymmetric-operand decision: allow it, explicitly.** A commit may carry a
> sub-part-addressed operand on one side and a whole-body operand on the other, in
> either direction. Two reasons beyond the realistic-case argument the file already
> made. First, the kernel resolves each operand independently (`index.js`'s
> `normalizeRef`, `registry.js`'s `referenceOf`), so there is no arithmetic reason
> for the two sides to agree — requiring symmetry would have been a UI rule with
> nothing under it. Second, and decisive: `selection.subPart` is a **single** depth
> for the whole selection, and `drillInto` is a no-op unless exactly one body is
> selected, so *at most one* of the two operands can be drilled in at a time.
> Symmetric addressing is not merely undesirable here, it is unrepresentable.
> Asymmetry is therefore the natural shape rather than a special case.
>
> **Which side gets the part is reachable both ways, and the useful one is the
> reverse of the obvious one.** Drill in, then Shift-click the second body, and the
> drilled body is `ids[0]` — the *moving* operand. Shift-click the drilled body off
> and back on and it lands at the end, becoming the *reference* while its depth
> survives (`toggle` is the one selection path that deliberately does not prune it).
> That second path is the realistic assembly — "snap this Cube to that board's
> Ethernet jack" — and both were driven live in Step 6.
>
> **Two things the file did not scope, both added because this change made them
> real.** (1) A kernel-error display for this pair of buttons: before this task a
> Snap/Align commit could not be rejected by the fold, and a `pieces` naming a part
> the group does not have now can be, so `opError` and a `snap-align-error` element
> follow Fillet/Chamfer's established path rather than letting a throw vanish into
> the console mid-click. (2) The operand-name line the Interaction model asked for
> is shown **always**, not only when drilled in — it doubles as the moving/reference
> order made legible, which `ui-026`'s note only described in the abstract.
>
> **A limitation the drive found, outside this task's reach.** The Goal's literal
> example — "a specific **hole** on a Pi board" — still cannot be performed, because
> a mounting hole passes *through* the PCB and the raycast hits `mb` in front of it.
> A 289-point pointer sweep over a real Pi 5 reached only `mb`, `ethernet`, `usb1`
> and `usb2`. The operand mechanism is complete and proven against real parts; the
> *selection* of an occluded sub-part is a `ui-016` picking limitation, logged in
> `TODO/VERIFY.md`. `docs/snap-align.md` was corrected to use the Ethernet jack (a
> part actually reachable) rather than a hole, instead of documenting something a
> user cannot do.

## Goal

`core-013` proved `group.snap`/`group.align` accept a sub-part-addressed operand
(`{ id, pieces }`) at the kernel level, driven directly in the browser. `ui-026` built
the Snap/Align popover on top of it but only ever sends whole-object operands
(`selection.ids`) — never a drilled-in sub-part. `core-016`'s own retirement note names
this exact gap ("Whole-object snap/align only — sub-part addressing isn't available
yet"), and its `TODO/VERIFY.md` entry explicitly asks for it to become its own `ui-*`
task rather than be logged again. This is that task.

"Done" looks like: select a whole body and a **drilled-in sub-part** of another (or of
the same composite), open Snap or Align, and the popover commits a record whose operand
correctly names the sub-part — e.g. snapping a screen's mounting pad flush against a
specific hole on a Pi board, not just the whole board's bounding box.

## Interaction model

- **Precondition** — exactly 2 objects selected (unchanged from `ui-026`), but now
  either or both may be a **drilled-in sub-part** (`ui-016`'s pick-depth selection
  state, `body.subPart` set) rather than only a whole-body selection.
- **Trigger** — the existing Snap/Align buttons and popover (`OperationsToolbar.vue`,
  gated on selection count exactly 2, per `ui-026`) — no new trigger. The popover's
  existing axis/orientation/offset fields are unchanged; what changes is what the
  **operand** resolves to when committed.
- **Feedback** — identical to `ui-026`: the popover closes, the affected body's position
  updates. **New feedback need**: since a sub-part-addressed snap can look identical
  on-screen to a whole-object snap (moving the whole body either way), the popover
  should show which sub-part is being addressed by name (e.g. "Snapping Cylinder 1 to
  Cube 1 › hole") so the user can confirm they selected the right depth before
  committing — a real gap, since `ui-016`'s breadcrumb only shows in the Inspector, not
  inside this popover.
- **Selection response** — unchanged; this task doesn't touch selection display, only
  what Snap/Align does with an existing drilled-in selection.
- **Selection count** — exactly 2, unchanged.
- **Small-screen behavior** — same as desktop: the popover's existing phone/tablet
  teleport-to-`<body>` mechanism (`ui-026`) needs no change; only its content (the new
  operand-name line) needs to fit at 390px — confirm by driving, don't assume.

## Documentation

- **Page** — `docs/snap-align.md`, extending its existing worked example with a
  sub-part case: "Drill into a Group's named part (see
  [Selecting sub-parts](selection-and-inspector.md)), then select a second object and
  open Snap — the popover addresses the drilled-in part specifically, not the whole
  group."
- **Example**: concrete step-by-step per the page's own existing two-example structure
  (per `ui-036`'s later precedent of adding a third example to an existing page rather
  than a new one).

## Affected files

- `src/components/viewport/OperationsToolbar.vue` — wherever `ui-026`'s
  Snap/Align commit builds its operand from `selection.ids`; needs to instead read each
  selected item's `subPart` (if drilled in) and build `{ id, pieces: subPart }` per
  `core-013`'s already-proven shape, falling back to a whole-id operand when not
  drilled in.
- `src/core/kernel/group.js` — no change expected; `core-013`'s `calcSnap`/`calcAlign`
  resolution already accepts this shape.
- `docs/snap-align.md`.
- `e2e/snap-align-operation.e2e.js` — extend, see Testing.

## Proposed fix

The kernel side is already proven (`core-013`), so this is UI-layer wiring: read
`useSelectedBody`'s (or equivalent) per-selected-item `subPart` state at commit time
instead of assuming a whole-object id, mirroring the read `ui-016`'s Inspector
breadcrumb already does for display. The one real design question: **when a whole
Group (not drilled in) is one operand and a drilled-in sub-part is the other**, does the
non-drilled operand snap as a whole, or does the popover require symmetric drill-depth?
Recommend allowing asymmetric addressing (whole-object vs. sub-part in the same
commit), since that's the realistic case named in the Goal (a screen's whole body
against one specific hole on a Pi board) — state this decision explicitly in the
retirement note rather than leave it implicit.

## Effort

M — the kernel-side mechanism is fully proven and this is UI wiring against it, but the
asymmetric-operand question above is a real judgment call with no existing precedent in
this codebase (every prior 2-operand control treats both sides identically). `model:
opus` for that reason, per `TODO/README.md`'s guidance on real ambiguity with no exact
pattern to mirror.

## Testing

- Extend `e2e/snap-align-operation.e2e.js`: drill into a Group's sub-part (a two-cube
  `group.assemble` result, per `ui-016`'s existing test fixtures), select a second whole
  body, run Align — assert via `document.js`'s state that the resulting record's operand
  carries `{ id, pieces }`, not a bare id, and that the moved position matches
  `calcAlign`'s own arithmetic against the sub-part's bounds specifically (not the whole
  group's).
- **`TODO/ACCEPTANCE.md` scenario 3** (kit assembly) — re-drive, since this is the
  mechanism that makes precise sub-part attachment (a screen's pad against a Pi's hole)
  possible for the first time; if `ui-031` has landed by the time this task runs, use
  real parts rather than the Cube/Cylinder stand-in. **Scenario 1** — re-drive, since
  this changes what operand shape the toolbar's commit path can produce.
- **Closed-finding regression surface**: `ui-026`'s own e2e spec (18 cases, all three
  reference viewports) re-run unchanged as the regression baseline, the same precedent
  `ui-027` set when it added a third commit path to the same toolbar.
