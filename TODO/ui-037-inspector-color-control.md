---
title: Inspector color control — swatch/picker for the selected body or sub-part
category: ui
kind: feature
priority: medium
model: opus
milestone: M7
depends: [data-005, ui-011]
status: open
---

## Goal

`data-005` builds the document-model color-override field. This task is the control:
a swatch/picker in the Inspector for the selected body (or drilled-in sub-part, if
`data-005` adopted per-part addressing), gated on exactly 1 selection like `ui-027`/
`ui-028`'s rim-op controls, writing through `data-005`'s field. "Done" looks like:
select a body, open its color control, pick a visibly different color, and the mesh
updates immediately — closing `TODO/ACCEPTANCE.md` scenario 13 exactly as written.

## Interaction model

- **Precondition** — exactly 1 body selected (or exactly 1 sub-part drilled in, if
  `data-005` supports per-part), mirroring `ui-029`'s existing Parameters-section
  precondition pattern rather than inventing a new one.
- **Trigger** — a new control in the Inspector's existing panel — likely its own small
  section (per `Inspector.vue`'s existing `inspector__section` pattern at `:668`/`:754`
  for Parameters/Transform) or a swatch added to the Geometry section header
  (`Inspector.vue:568-572`) — decide and state which at Step 2, since both are
  reasonable and no existing precedent picks for you.
- **Feedback** — the mesh visibly changes color immediately on pick (a live preview
  while a color picker is open, if the chosen picker control supports one, mirrors the
  live-drag-tracking precedent `ui-012`'s gizmo/field sync already established for
  "don't wait for commit to show the effect").
- **Placement** — n/a; operates on existing geometry.
- **Selection response** — this control *is* part of "selecting an object shows that
  object's controls," the same class of task `ui-029` was for numeric params.
- **Selection count** — exactly 1, unchanged from every other exactly-1 Inspector
  control.
- **Small-screen behavior** — same as desktop: lives in the already phone/tablet-
  reachable Inspector sheet since `ui-011`; no new layout surface, confirm the swatch/
  picker control itself (native `<input type=color>` or a custom swatch grid) has a
  large enough tap target at 390px.

## Documentation

- **Page** — `docs/selection-and-inspector.md`, extending its existing Parameters/
  Transform walkthrough with a Color section.
- **Example**: "With a body selected, click its color swatch in the Inspector and
  choose a new color — the mesh updates immediately. The color persists across
  deselecting and reselecting the body."

## Affected files

- `src/components/inspector/Inspector.vue` — new color control, wired to `data-005`'s
  override field via a new composable (see below), following the existing
  `commitTransformField`/param-commit pattern rather than a bespoke mechanism.
- `src/composables/useColorCommands.js` (new, or folded into `useParamCommands.js` if
  Step 2 finds the shapes are similar enough) — builds and appends the color-override
  record.
- `src/render/mesh.js` — **the real architectural change**: `createBodyMaterial()`
  (`:119`) is currently called three times total, from `Viewport.vue:1806-1808`, each
  producing one of three *shared* materials (body/selected/secondary) applied uniformly
  regardless of body identity. A per-body color override requires **per-body materials**
  instead of three shared ones — this is a real change to the render path's material-
  management shape, not just a new call site, and needs its own investigation into
  memory/perf implications (`CLAUDE.md`'s "no per-frame allocation" rule — creating a
  fresh `MeshStandardMaterial` per body is a one-time cost per body, not per frame, but
  confirm materials are cached/reused across re-renders of the same body rather than
  recreated every frame).
- `docs/selection-and-inspector.md`.

## Proposed fix

The Inspector-side wiring mirrors `ui-029`'s existing param-edit pattern closely
(read current value, commit on change, append a `supersedes` record via `data-005`'s
field). **The real work is `src/render/mesh.js`'s shift from three shared materials to
per-body materials** — investigate at Step 2 whether every body needs its own
`MeshStandardMaterial` instance (simplest, some memory cost) or whether an override can
be expressed as a per-mesh material *property* override on a shared base material
(three.js supports per-instance color via `InstancedMesh` or vertex colors, but this
project doesn't use instancing and retrofitting it here is out of scope) — recommend
per-body material instances as the straightforward option unless a real body-count
performance problem is measured, per `CLAUDE.md`'s "measure before optimizing" rule.

## Effort

L — the Inspector control itself mirrors an established pattern (S/M), but the
`src/render/mesh.js` material-management change is real architectural surface with no
existing per-body-material precedent in this codebase to copy (every prior material use
is shared/theme-driven). `model: opus` per `TODO/README.md`'s guidance on rendering
algorithms and real architectural ambiguity with no existing pattern.

## Testing

- New `useColorCommands.spec.js`: a color commit appends the correct override record;
  a second edit on the same body supersedes the first rather than appending a third,
  independent history entry (mirrors `ui-029`'s own "chained edits" regression guard
  for exactly the class of bug that task found and fixed mid-flight).
- `mesh.spec.js`: a body with a color override renders with a material matching that
  color, not the shared theme palette; a body without one still uses the shared
  palette material unchanged (regression guard for every existing body).
- New `e2e/inspector-color-control.e2e.js` (required, new reachable control) — place a
  cube and a cylinder, select the cube, set its color, confirm the mesh visibly changes
  and the cylinder doesn't; deselect and reselect the cube, confirm the color persisted.
  Runs at all three reference viewports and all three engines (touches the rendered
  mesh/material path directly, per `CLAUDE.md`'s Browser Support rule).
- **`TODO/ACCEPTANCE.md` scenario 13** by name, in full, per its own Steps — this
  control is the scenario's exact trigger; this is also the scenario's **first drive**,
  since it's a new capability class with no prior partial coverage. **Scenario 1** —
  re-drive, since this is a new `supersedes`-based record kind on the shared document
  fold.
- **Closed-finding regression surface**: `core-020`'s repro, re-run after a color edit
  on a composite body, confirming the override doesn't disturb the composite's own part
  list.
