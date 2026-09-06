---
title: Selection → inspector + dimension lines + gizmo (display, not yet interactive)
category: ui
kind: feature
priority: high
model: opus
milestone: M1
depends: [ui-010]
status: done
---

## Goal

Clicking a placed body currently only highlights it (`ui-010`'s click-to-select via
`src/stores/selection.js` + `Viewport.vue`'s raycast picker — read that code first,
it's the foundation this task builds on, not something to re-derive). This task adds
the actual **selection response** `CLAUDE.md` requires: a transform gizmo visually
attached to the selected body, three on-canvas dimension lines (always all three at
once, one per axis), and an Inspector panel showing the body's own param schema plus a
standing Transform section (position/rotation).

This is `docs/decisions/interaction-model-qa.md`'s **control 3**, already fully
answered by `ui-001` — transcribe its Q10-17 answers into code, don't re-derive the
interaction design.

**Explicitly out of scope, deferred to `ui-012`** (per the roadmap's own split and
control 4's answers): the gizmo's handles are visual only in this task, not draggable;
the Inspector's Transform fields display the body's current position/rotation but
don't yet write back to the mesh on edit. Building interactive drag-to-transform or
live field-sync here would duplicate `ui-012`'s own scope — this task only needs to
get the gizmo and fields to *exist and show correct values* so `ui-012` has something
real to wire interactivity onto, the same boundary `ui-010` drew around deferring this
task's own gizmo/inspector work.

**Done when**: with the app running at `/`, clicking a placed body shows (a) a gizmo
rendered at the body's origin with recognizable translate/rotate handles, (b) three
dimension lines — one per axis, each with an extension line, arrowheads, and a
numeric millimetre label — oriented per the camera's current view of that axis, (c)
the Inspector panel open (persistent column at laptop/tablet, auto-opening bottom
sheet at phone) showing the body's own params (e.g. Cuboid → `size [x,y,z]`; Cylinder
→ `diameter, height`) plus a Transform section with position X/Y/Z and rotation X/Y/Z
fields reflecting its actual current values. Clicking empty viewport space clears the
selection and closes/collapses the above. Selecting a second body updates all of the
above to the new body, never showing two bodies' gizmos/dimensions at once.

## Interaction model

(Transcribed from `docs/decisions/interaction-model-qa.md` control 3, Q10-17.)

- **Precondition**: at least one placed item exists in the scene (already true after
  `ui-010`).
- **Trigger**: pointer-down/tap directly on an item's mesh in the viewport — this
  already exists (`Viewport.vue`'s `pickAt`); this task reacts to the resulting
  selection-store change, it does not rebuild picking.
- **Feedback**: gizmo attaches; three dimension lines drawn (always all three at once,
  never a single collapsed number); Inspector populates with the item's param schema.
- **Selection count**: exactly 1 item selected activates this full contract. 0 selected
  → Inspector's empty state (`"(nothing selected)"`). **2+ selected** (not yet grouped,
  `ui-014`/`ui-015` territory): Inspector shows no per-item fields — there is no single
  object to describe — but this task must not crash or show stale fields from the
  previous single selection; a plain "2 selected" state is enough, no boolean-toolbar
  behavior belongs here.
- **Small-screen behavior**: the Inspector **auto-opens as a bottom sheet on
  selection, with no extra tap required** — selection is itself a trigger with an
  inspector-feedback contract, "the same as any other trigger," so requiring a second
  tap at phone width would make selection behave differently by form factor. The sheet
  is dismissible by swiping down or tapping empty viewport space, which also clears
  the selection (same gesture, same meaning).

## Documentation

- **Page**: `docs/selection-and-inspector.md` (new) + sidebar entry.
- **Example**: "Click any placed shape in the 3D view to select it. A gizmo appears at
  its origin, three dimension lines show its size along each axis in millimetres, and
  the Inspector panel (right-hand column, or swipe up from the bottom on a phone)
  shows its parameters — for example a Cylinder's diameter and height. Click empty
  space in the viewport, or swipe the Inspector back down on a phone, to deselect."

## Affected files

- `src/components/inspector/Inspector.vue` (new — param-schema fields + Transform
  section + empty/multi-select states)
- `src/components/viewport/Gizmo.vue` (new — visual-only translate/rotate handles at
  the selected body's origin; reuse `src/render/pick.js`'s camera/projection helpers
  where they generalize)
- `src/components/viewport/DimensionLines.vue` (new — camera-projected extension
  lines + arrowheads + mm labels per axis; read `Grid.vue`/`NavigationChrome.vue` from
  `render-001` first for the established screen-space-overlay pattern before adding a
  third one)
- `src/components/viewport/Viewport.vue` (edit — mount `Gizmo`/`DimensionLines`,
  driven by the existing `selection` store; no changes to picking itself)
- `src/views/AppView.vue` (edit — mount `Inspector`, wire the phone-width
  auto-opening-sheet behavior alongside the existing Library-panel sheet)
- `src/core/kernel/registry.js` (read-only — confirm each `primitive.*` entry's
  `params` shape so the Inspector can render the right fields per op; do not change
  registry behavior in this task)
- `e2e/selection-inspector.e2e.js` (new)
- `docs/selection-and-inspector.md` (new) + docs sidebar config

## Proposed fix

Drive everything off the existing `useSelectionStore()` (`ids`, `count`, `onlyId`) —
this task adds *reactions* to selection state, it does not touch how selection is set.
Look up the selected body's op/params from the document store
(`src/stores/document.js` / `src/core/document.js`) by id to know which param schema
to render generically (read the record's `op` and dispatch to a small per-op field
descriptor, not one hardcoded form per primitive type — the same registry-driven
principle `ui-010`'s Library panel already established for rows).

Dimension lines: for the selected body's bounding box (compute via
`@jscad/modeling`'s `measurements.measureBoundingBox`, already used elsewhere in the
registry per `ui-010`'s triangle entry), project each axis extent's endpoints through
the camera to screen space and draw an SVG or Canvas2D overlay (match whichever
approach `render-001`'s existing overlays already use — don't introduce a second
overlay technology). No per-frame allocation in whatever render/update loop this
hooks into, per `CLAUDE.md`'s Performance section.

Gizmo: visual handles only — three arrows (translate) and three rings (rotate) at the
body's origin, using the same mesh/material conventions `src/render/mesh.js`
established. Do not wire pointer interactivity onto the handles; that's `ui-012`.

## Effort

L (multi-session) — dimension-line camera projection and gizmo rendering are both
non-trivial rendering work, even display-only.

## Testing

`e2e/selection-inspector.e2e.js`, navigating to `/`: place a body (reuse `ui-010`'s
placement), click it, confirm gizmo + dimension lines + Inspector all appear with
correct values; click a second, different body and confirm the display fully retargets
(no stale gizmo/lines/fields from the first); click empty viewport space and confirm
everything clears; select 2 bodies (however multi-select is reachable — check whether
`ui-010` or picking already supports shift-click, or add the minimal multi-select
needed to exercise this state without building `ui-014`'s toolbar) and confirm the
Inspector shows its no-per-item-fields state without crashing.

Runs at all three reference viewports (phone/tablet/laptop) with a snapshot at each —
the Inspector's auto-opening sheet behavior is explicitly not "same as desktop." Runs
against all three engines (Chromium/Firefox/WebKit) — dimension-line camera projection
and gizmo rendering are exactly the WebGL-sensitive surface `CLAUDE.md`'s Browser
Support section defaults to full coverage for.

**`TODO/ACCEPTANCE.md` scenarios this could plausibly affect**: underlies scenario 2
("Hardware property edit" — the Inspector-opens-and-shows-fields half of that
scenario, not the property-edit half, which needs `ui-012`'s live sync to actually
change anything) and scenario 6 ("Group vs. sub-part selection" — this task is the
single-item selection contract that scenario builds on, though the group/sub-part
behavior itself is `ui-015`/`ui-016`'s job). Re-drive both by hand once this task's
code exists, reporting explicitly which half of each scenario is and isn't drivable
yet. No closed findings exist against this subsystem yet to re-check.
