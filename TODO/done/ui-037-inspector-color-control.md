---
title: Inspector color control — swatch/picker for the selected body or sub-part
category: ui
kind: feature
priority: medium
model: opus
milestone: M7
depends: [data-005, ui-011]
status: done
---

> **What shipped (2026-09-25).** The control as specified, plus the two design answers
> `data-005` left open, plus one change made during the Step 6 drive.
>
> **Trigger (the Step 2 decision):** a separate **Color** section, the *first* one in the
> Inspector, directly under the name/op line and above Parameters. It is one row: a
> 44x44 native `<input type=color>` swatch, a `#rrggbb`/`Default` readout, and a 44px-tall
> **Reset** button. It goes first because it is a single row, so at 390 px it is on screen
> the moment the sheet opens, with no scrolling past Parameters. It is enabled for exactly
> one body, **including a drilled-in sub-part**. Transform and Parameters are frozen in
> that state because nothing can address "just this part", but `style.recolor`'s `subPart`
> can.
>
> **Preview and commit, one Undo step per pick.** `input` goes to a new UI-only
> `stores/colorPreview.js` (three scalar refs, the `transformPreview` pattern), which the
> viewport paints onto one **reused** preview material mutated in place, so no record and
> no allocation per event. `change` goes to `useColorCommands.setColor`, which writes one
> `style.recolor` through a new store entry point (`documentStore.setColorOverride`,
> carrying the same selection-before `meta` and `refresh()` as every other mutation). A
> second pick on the same body **supersedes the first pick's record**, chaining on the
> lineage terminal; the spec asserts `second.supersedes === first.id`, one record per pick,
> and that one Undo returns exactly the previous pick. Re-picking the colour in force
> is a no-op, and an existing `colorAlpha` survives a hue re-pick. A preview is dropped
> when the selection (body or part) changes. `ui-044`'s `batch` was not needed: a colour
> pick is one record, never three.
>
> **The two design questions `data-005` left in VERIFY.md, decided:** (1) precedence, in
> the new framework-free `src/core/colorOverride.js`: a part's own override wins,
> otherwise the whole-body one applies, otherwise the theme palette. So "whole board red,
> USB-C blue" reads as that one part being different. (2) **Clearing**, which was cheap and
> consistent, so it was built: `document.clearColorOverride(id, { subPart? }, tx)` appends
> a `style.recolor` with `colorOverride: null`, and `colorOverridesOf` drops only that key.
> That makes reset a visible, undoable History step rather than a deleted record. Both
> were driven and the VERIFY rows are closed `OK`.
>
> **`src/render/mesh.js`, as recommended but keyed by colour rather than by body.**
> `createColorMaterialCache` holds one `MeshStandardMaterial` per `colour x alpha x
> selection role`, so bodies sharing a colour share a material, and a body with no
> override allocates **nothing** and keeps the three shared palette materials (the
> regression guard asserts the very same instances). Materials are created at commit or
> selection-change rate, never per frame, and are disposed in `endPass()` once no body
> uses them. `paintBodyObject` replaces `Viewport.vue`'s inline material loop and applies
> the precedence per part mesh. **Selected recoloured bodies keep their colour** and add
> the selection colour as emissive (`OVERRIDE_HIGHLIGHT_INTENSITY`). Swapping to amber
> would hide the pick, and the control is only reachable *while* the body is selected.
> The tint shipped at **0.2, not the first-cut 0.35**: the Step 6 drive showed a picked
> pure red reading visibly orange at 0.35 (217/78/24).
>
> **Scope grew past Affected files, each for a stated reason:**
> - `core/document.js`: `clearColorOverride`, the `null` reset in `colorOverridesOf`, and
>   Undo labels `Recolor X` / `Reset color of X` (it previously said `Edit X`).
> - `core/timelineLabel.js`: History rows `Color #ff0000 on Cube 1`, `Color usbc #0000ff
>   on Board`, `Reset color on Cube 1` (it previously said `— edited`).
> - `kernel/registry.js`: typedef only.
> - `stores/document.js`: the two entry points, plus `colorOverrides` on `BodySummary`.
> - `Viewport.vue`: the scene list's `data-body-color` / `data-body-part-colors`.
>
> **Deliberately not done, and filed:** rendering composite recipes' *own* baked-in
> `Group.colors` (`core-026`). That is a separate precedence tier with its own
> transparency question on the Pi boards, now `TODO/render-003`. Bodies still draw recipe
> parts in the palette until a user overrides them.
>
> **Verified:** RED first for every new unit case, then GREEN. The new e2e was proven to
> bite by sabotaging the render path, and that exposed a too-weak "selected cube is red"
> assertion, which was tightened. Full non-Firefox matrix: 1269 passed, 202 skipped,
> 0 failed. Scenario 13 (first drive) and scenario 1 were driven at laptop Chromium and
> phone WebKit touch, both PASS. `core-020`'s repro, re-run on bolt and washer after
> sub-part and whole-body recolours and a reset: part lists, bounds and the plate are
> unchanged, and the subtract matches the batch path. Firefox is environment-blocked
> (TROUBLESHOOTING.md 2026-09-17), as for every task since `ui-028`.

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

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
