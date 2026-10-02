---
title: UI surface for angled Bisect
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M5
depends: [core-021, ui-028]
status: done
---

> **Retirement note (2026-09-18).** Shipped as specified: Angle (default `0`, the one field
> here that *should* default to a real value because `0` genuinely is "no tilt"),
> Rotate-axis (only the two axes perpendicular to the cut axis, re-defaulted to the kernel's own
> table whenever the cut axis changes; `DEFAULT_ROTATE_AXIS` is now exported from `group.js` so the
> dropdown and the kernel cannot drift apart) and Rotate-offset (no default; left blank it is
> *omitted* from `params`, not sent as `0`). A falsy Angle commits a record with the exact
> pre-existing shape (`{ axis, offsetMm }`, no other keys), pinned by a `toEqual` unit test. One thing
> the file did not anticipate: **the six-field popover overran into the phone Inspector bottom sheet**
> (z-index 11 above the popover's 10), so the sheet intercepted every pointer event aimed at Commit at
> 390px. Only the e2e fit test extended for this task caught it; the popover and its backdrop now sit
> at z-index 31/30, above the Inspector, SketchToolbar and Library sheets, which is right for a modal.
> The e2e's first draft asserted a *Y* extent for a Z-cut and failed on every engine (a tilt about X
> leaves Y untouched); it now cuts a 40 mm cube at 20 mm mid-height and asserts the halves' Z extent is
> ~31.5 mm (20 + 20*tan 30 deg) instead of a straight cut's 20 mm. `docs/resize-bisect.md` gained the
> third worked example; its stale "Not yet supported: angled cuts" bullet was removed.

## Goal

`ui-028` shipped the Bisect popover for the straight (`axis`/`offset`) cut only.
`core-021` later shipped the angled form at the kernel level (`angleDeg`/`rotateAxis`/
`rotateOffsetMm`, proven via 10 measured-V1 fixture cases and a real 848-test-green
suite) with **no control anywhere that can reach it**. This task adds that control: an
Angle field, a Rotate-axis dropdown, and a Rotate-offset field to the existing Bisect
popover, so a tilted cut is reachable from the app, not just from the kernel/tests.

"Done" looks like: select a body, open Bisect, set an Angle and Rotate-axis (leaving
Rotate-offset at its default), commit — the two resulting parts are separated along a
visibly tilted plane, not the axis-aligned cut the existing straight-only popover
produces.

## Interaction model

`core-021`'s own Interaction-model section already answers every question this task
would otherwise need to ask fresh, per that file's own note — restated here rather than
re-derived:

- **Precondition** — unchanged: exactly 1 body selected, same as every other exactly-1
  op (`OperationsToolbar.vue`'s `isExactOneOp`, `:579`).
- **Trigger** — the existing Bisect popover (`ui-028`), extended with three more
  fields: Angle (number, falsy default — i.e. omitted/zero means "no tilt," collapsing
  to the existing straight cut exactly as `core-021`'s own zero-angle short-circuit
  does), Rotate-axis (a dropdown of the two axes perpendicular to the cut axis, per
  `core-021`'s own axis-pair convention), and Rotate-offset (numeric, **no default**,
  per `ui-028`'s established "don't pre-fill a value that looks safe" convention for
  Bisect's own Offset field).
- **Feedback** — identical to the existing Bisect commit: popover closes, body count
  stays the same (a `supersedes` record, not `consumes`), the two-part group's gizmo and
  dimension lines update to the new (now non-axis-aligned) split.
- **Placement** — n/a, operates on existing geometry.
- **Selection response** — unchanged from every other resize/rim control.
- **Selection count** — exactly 1, unchanged.
- **Small-screen behavior** — same as desktop: three more fields in the same popover
  `ui-026`/`ui-027`/`ui-028` already teleport to `<body>` for phone/tablet; confirm the
  now-6-field popover (axis, offset, angle, rotate-axis, rotate-offset, plus whatever
  else Bisect already has) still fits without scrolling at 390px, don't assume it
  because the straight-only version did.

## Documentation

- **Page** — `docs/resize-bisect.md`, adding a **third** worked example alongside its
  existing two (per that page's own two-example structure, extended rather than
  replaced): a straight-cut cube example already exists; add a tilted cut, e.g. "Bisect
  a cylinder on Z at offset 0 with a 30° angle around X — the cut plane tilts instead of
  staying flat, producing two asymmetric halves."
- **Example**: concrete numbers as above, naming units (degrees for Angle, millimetres
  for the offset fields) per this project's explicit-units convention.

## Affected files

- `src/components/viewport/OperationsToolbar.vue` — Bisect's existing popover markup
  and its commit function; add the three new fields and thread them into the
  `modify.bisect` record's `params` alongside the existing `axis`/`offsetMm`.
- `src/core/kernel/registry.js` — no change expected; `modify.bisect`'s registered
  params already accept `angleDeg`/`rotateAxis`/`rotateOffsetMm` per `core-021`.
- `docs/resize-bisect.md`.
- `e2e/resize-bisect-operation.e2e.js` — extend, see Testing.

## Proposed fix

Near-mechanical, per `core-021`'s own note that this task "starts from an
already-resolved spec rather than a blank one": add the three fields to the existing
popover form, pass them through unchanged to the `modify.bisect` record's `params`
using the exact param names the registry already expects. No new commit path, no new
gating logic — this reuses `ui-028`'s existing exactly-1 `supersedes` commit verbatim.

## Effort

S/M — a near-exact mirror of an already-shipped popover pattern with a pre-resolved
spec and no new kernel work; `model: sonnet` per `TODO/README.md`'s guidance that
wiring closely mirroring an established pattern stays sonnet even at effort M.

## Testing

- Extend `OperationsToolbar.spec.js` (or wherever `ui-028`'s Bisect tests live): the
  three new fields commit into `params.angleDeg`/`rotateAxis`/`rotateOffsetMm`
  correctly; a falsy Angle produces a record identical in shape to the pre-existing
  straight-only commit (regression guard against accidentally always sending an angle
  field now).
- Extend `e2e/resize-bisect-operation.e2e.js`: bisect a cube with a real non-zero angle,
  confirm the resulting two-part group's dimension lines/bounds reflect a tilted split
  (not the axis-aligned bounds a straight cut would produce) — mirrors the existing
  straight-cut case's own volume/bounds assertions.
- **`TODO/ACCEPTANCE.md` scenarios**: none new directly, per this task's own roadmap
  entry — **re-drive scenario 1**, since this is a fourth field-set added to a
  `supersedes`-based popover on the shared `OperationsToolbar.vue` commit path
  (`ui-026`/`ui-027`/`ui-028` each re-checked scenario 1 for the identical reason).
- **Closed-finding regression surface**: `ui-016`'s pick-depth/breadcrumb contract,
  re-run specifically against an **angled**-Bisect-produced group (previously only
  exercised against a straight-Bisect-produced one in `ui-028`'s own drive) — confirm
  drilling into the tilted `negative`/`positive` halves still shows correct dimensions.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
