---
title: Move Viewport.vue's interaction logic into render controllers and composables
category: ui
kind: finding
priority: medium
model: opus
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: []
status: open
---

> **Progress (partial, still open).** Slice 3: `onSketchChainKey` (the Line chain's Esc, Enter and Backspace rules, and the Esc that stands down Set scale and Auto-trace) moved to `src/render/sketchChainKeys.js` with 7 unit tests; the text-entry test is injected. Slice 2: `syncSketchPaths` and its nine change-detection keys moved to `src/render/sketchPathSync.js` (7 unit tests); `Viewport.vue` keeps a one-line forwarding wrapper. Re-measure line counts before the next slice, then drop `syncSketchPaths` from the list below. Slice 1: overlay and annotation sync (`syncOverlay`'s camera mirror,
> `syncAnnotations`, `syncCutPlane`) moved to `src/render/overlaySync.js`, uncommitted until the
> commit that adds it. Hand checks still open are in `TODO/VERIFY.md` under ui-108 slice 1.
> Steps 1–5a shipped in earlier commits, and step 5b plus part of
> step 6 ship in the commit that adds `src/render/pointerGestures.js` and `src/render/sketchPreview.js`.
> `Viewport.vue` is 1,712 lines, with 1,415 script lines (target under 600), and it no longer imports
> three.js. Still to extract, each a separate no-behaviour-change commit: `dropTarget`, `frameLoadedContent`, the
> context-lost and restore handling, the watchers (move into a `useViewport*`
> composable), and the reactive overlay declarations. `pointerGestures.js` (938 lines) is over the
> ~600-line guide; picking and the marquee are the natural split. Re-run acceptance 1, 4, 6, 7 and 9
> and closed findings ui-012, ui-013, sketch-006, ui-049 before the final step.

## Problem

`src/components/viewport/Viewport.vue` is 4,198 lines: a 191-line template, an 89-line style block
and a **3,912-line `<script setup>`** holding 107 functions. It is the only component that imports
three.js directly (`Viewport.vue:29`: `Euler, Group, Mesh, Raycaster, Vector2, Vector3`). The script
is at least seven separate responsibilities sharing one closure:

| Lines (approx.) | Responsibility |
|---|---|
| 797–950 | frame scheduling, overlay, cut-plane and annotation sync |
| 952–1050 | scale and trace tool taps |
| 1051–1900 | the sketch editor: paths, vertex handles, vertex drag, snapping, the Line chain, profile hover and pick, preview |
| 1928–2290 | body sync, selection and hover materials, repeat outlines, theme materials |
| 2289–2640 | gizmo drag: preview transform, rotate dial, translate ruler, speed steps, stall |
| 2639–2830 | placement ghost, snap neighbours, drop-point resolution |
| 2966–3620 | pointer gestures, raycast picking, marquee, wheel, navigation |

Why it costs something:

- **It breaks two `CLAUDE.md` conventions at once.** "Geometry logic lives in `src/core/`, not in
  components" and "a component doing coordinate math beyond laying out its own pixels is a bug":
  the raycasts, plane projections and snap resolution are driven from the component.
- **None of it has a unit test.** There is no `Viewport.spec.js`. Everything in the table is covered
  only through E2E, which is the slow path and the flaky one (`testing-009`, `testing-016`).
- **Every viewport change edits the same file.** Sketch, gizmo, placement and picking changes all
  collide in one 3,900-line closure with shared mutable locals, which is where regressions between
  unrelated tools come from.
- **`render-006` (WebGL context restore) has to rebuild this state**, and today that state is
  spread across dozens of module-level `let`s that only this file can reach.

`componentize-audit.md` covers template extraction from views. This is not that: the template is
small. The problem is logic.

## Affected files

- `src/components/viewport/Viewport.vue:240-3900` (the script)
- `src/render/` (new controllers beside `scene.js`, `pick.js`, `camera.js`)
- `src/composables/` (new `useViewport*` composables that bind a controller to the stores)

## Proposed fix

Extract by responsibility, one commit each, with no behaviour change. Each controller is
framework-free (three.js allowed, since it lives in `src/render/`), takes its dependencies as
arguments, and gets a `.spec.js` with a mocked WebGL boundary as `scene.spec.js` already does.

1. `src/render/bodyMeshes.js`: body sync, selection, hover and repeat-outline materials,
   `applyMaterialTheme`. This is the piece `render-008` (renderer theme bridge) and `render-006`
   both need, so do it first.
2. `src/render/gizmoDrag.js`: preview transform, dial and ruler steps, stall detection.
3. `src/render/placementGhost.js`: ghost geometry, snap neighbours, drop-point resolution.
4. `src/render/sketchSession.js`: sketch paths, handles, vertex drag, snapping and the Line chain.
   The largest piece. Split further if it passes about 600 lines.
5. `src/render/pointerGestures.js`: gesture-kind decision, drag application, picking and marquee.
6. `Viewport.vue` keeps the canvas, the overlays, mount and unmount, and the wiring between the
   controllers and the stores. Target: under 600 script lines, no three.js import.

Follow `/refactor-ui` for the mechanics of each extraction. Do not combine this with any behaviour
fix: a moved function is reviewed by diffing it against the original.

## Effort

L (multi-session; six extractions).

**Decided 2026-11-13:** keep parked and run by hand later, as its own session after the theme chain, starting with extraction 1 (`src/render/bodyMeshes.js`). Re-measure `Viewport.vue` first: it was 2,528 lines on this date, not the 4,198 quoted above. No reason beyond the recommendation was given.

## Testing

- A `.spec.js` beside each new controller, covering the cases the component could never unit-test:
  drop-point resolution with and without snap neighbours, gizmo step sizes at the speed thresholds,
  the Line chain's Esc/Enter/Backspace rules, gesture-kind decision for one and two pointers.
  Numeric cases use explicit tolerances (`toBeCloseTo`) and cover the degenerate ones: a zero-length
  drag, a ray parallel to the working plane, coincident sketch points.
- No new E2E spec: the behaviour must not change. The full existing suite is the regression net.
  Run `npm run test:e2e:full` on the last extraction, all three viewports and all three engines,
  because every step touches WebGL, canvas and touch input.
- Acceptance scenarios to re-drive after each extraction: 1 (placement), 7 (touch navigation),
  9 (sketch), 4 and 6 (selection); after the last one, also 3, 16 and 26.
- Closed findings whose reproductions re-run: `ui-012` (gizmo drag), `ui-013` (snap guides),
  `sketch-006` (Line chain keys), `ui-049` (hover highlight).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
