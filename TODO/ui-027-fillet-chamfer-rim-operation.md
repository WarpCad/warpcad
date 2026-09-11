---
title: Fillet/Chamfer rim operation — UI surface for modify.filletRim/chamferRim
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M4
depends: [render-001]
status: open
---

## Goal

`core-003` ported and registered `modify.filletRim`/`modify.chamferRim` — rounding or
bevelling the whole rim of one axis-aligned face, the only fillet semantics
`@jscad/modeling` can support (see `docs/decisions/geometry-kernel.md`'s `core-003`
addendum). Nothing reaches them from the UI yet. This task is that control only — the
ops are already built and tested. "Done" looks like: select one solid, click Fillet,
pick a face and a radius, commit — that face's rim rounds off, the body stays selected,
and a second Fillet/Chamfer on a *different* face of the same, now-rounded body works
the same way.

**This is CLAUDE.md's own named example of a single-object tool** ("a fillet on one
edge... stays disabled unless exactly one applicable object is selected") — except it
is a **face**, not an edge, and the control must say so, per this row's own roadmap
note: *"the UI must not present it as edge selection."* `core-003` proved arbitrary
edge-selected fillet is unachievable on this kernel at any adapter cost; this task
must not accidentally imply otherwise through its own labelling.

## Interaction model

- **Precondition** — **exactly 1** solid selected. The first exactly-1-gated button
  on `OperationsToolbar.vue`, which today only hosts 2+-gated (Union/Subtract/
  Intersect/Group) and exactly-2-gated (`ui-026`'s Snap/Align) controls — CLAUDE.md's
  own "single-object tool" language for this exact case, applied literally: disabled
  at 0 or 2+ selected, enabled only at exactly 1.
- **Trigger** — Two new buttons, **Fillet** and **Chamfer**, on the same Operations
  toolbar. Clicking either while enabled opens a parameter popover — the same
  mechanism `ui-026`'s Snap/Align just added, reused rather than reinvented a third
  time. Popover contents: a **Face** dropdown listing the six `RIM_ORIENTATIONS`
  (`src/core/kernel/fillet.js`) by a plain-language label — "Top (+Z)", "Bottom
  (−Z)", "Front (+Y)", "Back (−Y)", "Right (+X)", "Left (−X)" — never "edge," and a
  **Radius** numeric field (mm, positive, no default — `core-003`'s registry entry has
  none either). A one-line copy string states the scope explicitly: "Rounds the
  whole rim of the chosen face — not a single edge." Fillet's popover has nothing
  else (`segments` stays at its registry default, not exposed — a graphical
  face-picker cube icon, rather than a plain dropdown, is a nice-to-have explicitly
  deferred to a later polish pass, not this task).
- **Feedback** — On commit, the selected face's rim visibly rounds (fillet) or
  bevels (chamfer) in the viewport; the body stays selected (same body identity,
  new geometry — see Proposed fix on why this supersedes rather than replaces the
  selection); the popover closes. Committing a *second* Fillet/Chamfer against a
  *different* face of the same, already-rounded body must work identically — nothing
  about this control is "one shot per body."
- **Placement** — n/a; operates on existing geometry, creates nothing at a
  transform.
- **Selection response** — Ordinary single-selection contract (`ui-011`/`ui-012`)
  applies unchanged throughout — gizmo attached, dimension lines shown, Inspector
  fields present. This task adds a toolbar control alongside that contract; it does
  not change it (unlike `ui-016`'s sub-part selection, there is no reason to suppress
  the gizmo here — the selected body is a normal whole selection before, during, and
  after this operation, never a display-only sub-part).
- **Selection count** — Exactly 1, stated as this control's own genuine divergence
  from every other button on the same toolbar (2+ for booleans/Group, exactly 2 for
  Snap/Align, exactly 1 here) — CLAUDE.md's per-tool count-gating rule, not a shared
  constant.
- **Small-screen behavior** — Same popover-fits-at-390px check `ui-026`'s own
  Interaction model section already calls for; this popover is smaller (two fields,
  not three), so confirm it fits rather than assume it inherits the same margin.

## Documentation

- **Page**: `docs/fillet-chamfer.md` (new) — the "rim, not edge" scope limit needs
  its own clear explanation up front (a screenshot of a rounded box top makes the
  "whole rim of one face" claim concrete in a way prose alone doesn't), plus a
  forward-reference to `docs/decisions/geometry-kernel.md`'s arbitrary-edge-fillet
  addendum for a reader who came looking for edge-selected rounding and needs to
  understand why it isn't offered rather than assume it's simply missing.
- **Example**: "Drag a Cube into the viewport and select it. Click Fillet, choose
  'Top (+Z)' from the Face dropdown, set Radius to 3mm, click Fillet in the popover —
  the cube's top rim rounds off while the rest of the cube stays sharp-edged. Click
  Chamfer, choose 'Bottom (−Z)', set Radius to 2mm — the bottom rim now bevels at 45°.
  Both faces can be rounded or bevelled independently on the same cube."

## Affected files

- `src/components/viewport/OperationsToolbar.vue` — two new `OPERATIONS`-shaped
  entries (Fillet, Chamfer), each with the popover-needed flag `ui-026` introduces
  (face + radius fields, no axis/orientation-of-snap fields — a *different* popover
  shape from Snap/Align's, reusing the mechanism, not the exact field set); `run()`
  gets a third commit path: `{ id, op: 'modify.filletRim' | 'modify.chamferRim',
  name, target: onlyId, supersedes: onlyId, params: { radius, orientation } }` — no
  `operands` at all (the registry entry is `native(1, ...)`, a single `target`, the
  same shape `transform.translate`/`rotate` already use). Gate this pair's `disabled`
  on `selection.count !== 1`.
- `src/components/viewport/OperationsToolbar.spec.js` (if it exists — check fresh at
  Step 2, per every prior task's own note that this file may not) — new cases for the
  exactly-1 gating and the face/radius popover.
- `docs/fillet-chamfer.md` (new).
- `e2e/fillet-chamfer-operation.e2e.js` (new) — see Testing.

## Proposed fix

**Commit path mirrors `transform.translate`'s `supersedes`, not `ui-026`'s
two-operand shape** — this is a single-operand op (`native(1, ...)`, per `core-003`'s
registry entries, `inputs[0]` only), so there is no "moving vs. reference" pair to
resolve, only `selection.onlyId` (already exposed by `useSelectionStore`) as both
`target` and `supersedes`. No kernel work at all: `modify.filletRim`/`chamferRim`
already validate `radius`/`orientation` and throw on a bad value (`core-003`'s own
registry entries) — the popover just needs to not submit until both fields are
filled, and let the append call's own thrown error surface as whatever error-surface
convention the rest of `OperationsToolbar.vue` already uses (check what that is at
Step 2 — no prior task has needed to display a *runtime* kernel error from a UI
button yet, since booleans/Group/Snap/Align validate only shape, not domain-specific
values like "radius must be positive and less than half the face's own extent";
`filletRim`'s own precondition check, `assertPrismaticBand`, can throw on a
perfectly-well-formed request against the *wrong solid* — a sphere, say — and this
task is the first place a user-facing "this fillet isn't possible on this shape"
message needs to land somewhere visible, not just in the browser console).

## Effort

M — the kernel side is entirely done (`core-003`); the real new surface is the
first-ever user-visible kernel-error display path (see Proposed fix's last
paragraph), which is genuinely new UI, not just a third copy of the popover pattern.
`model: sonnet`: the popover/commit-path mechanics closely mirror `ui-026`'s
just-established pattern; the one open design point (how a kernel validation error
surfaces to the user) is scoped narrowly enough in Testing below not to need opus.

## Testing

Vitest:
- `OperationsToolbar.spec.js` (if it exists) — Fillet/Chamfer disabled at 0 and at
  2+ selected, enabled at exactly 1; popover requires both fields before its own
  commit button activates; commit calls `documentStore.append` with `supersedes`
  set to the single selected id and no `operands`/`consumes` field present.

`*.e2e.js` — required, new controls:
- `e2e/fillet-chamfer-operation.e2e.js` (new): drag-place one Cube, select it, open
  Fillet, choose a face, set a radius, commit — assert the rendered mesh's bounding
  box on the chosen face's axis shrank by roughly the radius (a rounded corner is
  measurably smaller than a sharp one) and the body count is unchanged (still one
  body, same id, per `supersedes`). A second case chamfers a *different* face of the
  *same* body afterward, confirming both operations chain rather than each resetting
  to the original sharp cube. A third case selects 0 or 2 bodies and confirms both
  buttons stay disabled. A fourth case submits a radius that makes
  `assertPrismaticBand` (or an equivalent kernel guard) throw — e.g. a radius larger
  than half the face's own extent — and asserts the error surfaces somewhere visible
  in the UI rather than only to the console, per Proposed fix's note that this is new
  ground.
- Reference viewports: **all three** (phone/tablet/laptop) — new popover, per the
  Interaction model's Small-screen bullet.
- Engines: **all three** (Chromium/Firefox/WebKit) — this is the first UI path that
  triggers `extrudeFromSlices`-based re-lofting (`fillet.js`'s own doc comment) at
  runtime from a live user action rather than only from a unit test; per CLAUDE.md's
  Browser Support section, a WASM/WebGL-adjacent geometry op reaching a real render
  for the first time from the UI needs the full engine matrix, matching the bar
  `ui-013`'s snap-guide picking work and `ui-016`'s mesh-path change both set for the
  same reason.

**Acceptance scenarios**: no `TODO/ACCEPTANCE.md` scenario names this task directly by
number — it wasn't part of `Initial design.md` §9's 8-scenario set. Re-drive
**scenario 1** (two independent primitives) after this lands, since it's the first
task to add a `supersedes`-based commit path to `OperationsToolbar.vue` alongside the
existing `consumes`-based one (`ui-026` added the first; this is the second) —
confirm placing two solids, fillet-ing one, then placing a third unrelated solid
doesn't regress body count or visibility.

**Regression surface**: shares `OperationsToolbar.vue`'s `run()` and popover
machinery with `ui-026` (landing in the same milestone) — re-run `ui-026`'s e2e spec
unchanged as a baseline check that adding a third commit path didn't disturb the
second. Does not touch `document.js`'s `consumes`/`mergedInto` bookkeeping (uses
`supersedes` only), so `core-020`'s fix is not at risk — state this explicitly per the
same convention `ui-026`'s own file used.
