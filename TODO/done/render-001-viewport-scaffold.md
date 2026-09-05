---
title: App shell + viewport scaffold (grid, orientation gizmo, nav chrome)
category: render
kind: feature
priority: high
model: opus
milestone: M1
depends: [build-001]
status: done
---

> **Shipped note (2026-09-05).** Two things landed beyond the scope written below,
> both recorded in the commit and the final report rather than absorbed silently.
> First, `docs/decisions/rendering.md`: `CLAUDE.md` lists Rendering as a
> *default to reconsider*, and this is the task that pulled a renderer in as a real
> dependency, which is exactly the trigger its Library-decisions rule names — three.js
> was compared against Babylon.js and PlayCanvas on real health metrics and confirmed,
> and the Stack row is now **Committed**. Second, the hand-driven acceptance pass found
> that the 3D scene was hardcoded dark while the DOM chrome followed
> `prefers-color-scheme`; the scene palette is now theme-aware, with unit and e2e
> coverage. Also: an orientation **triad** ships rather than a view cube (`CLAUDE.md`
> allows either), and `docs/README.md` was added as the documentation index, since no
> docs-site tool has been chosen yet.

## Goal

Mount the app's actual root view — the first thing `CLAUDE.md`'s reachability rule can
be checked against. Concretely: a dark-mode-primary 3D viewport rendering a grid with
major/minor lines and dimension labeling (an axis ruler or scale readout, per
`CLAUDE.md`'s grid rule), a clickable orientation gizmo (view cube or axis triad) that
snaps the camera to standard views, and orbit/pan/zoom navigation chrome reachable
without a keyboard (on-screen buttons/icons, not mouse-drag-only). This is `Initial
design.md` §8 step 8 and §10's explicit call-out that this ships with the **first**
`*.e2e.js` spec, at all three responsive viewports and all three browser engines,
"because it's WebGL from line one."

No geometry exists yet in this task — that starts with the first primitive-creation
feature seeded by `docs-003`'s roadmap. This task is the empty stage those features get
built on.

Done when: navigating to `/` shows the grid, orientation gizmo, and nav chrome at all
three reference viewports (phone/tablet/laptop), the orientation gizmo snaps the camera
on click, and the on-screen orbit/pan/zoom controls work via both mouse and touch.

## Interaction model

- **Precondition**: none — this is the app's root view, always present on load.
- **Trigger**: navigating to `/` (`CLAUDE.md`'s no-router, single-screen rule — no
  route to trigger, the view mounts directly).
- **Feedback**: a dark 3D scene renders immediately with a visible grid, an orientation
  gizmo in a fixed screen-space corner, and orbit/pan/zoom chrome; clicking a gizmo face
  animates the camera to that standard view (e.g. clicking "Top" looks straight down
  the Z axis, per `CLAUDE.md`'s Z-up convention).
- **Placement**: n/a — no geometry is created by this task.
- **Selection response**: n/a — nothing is selectable yet.
- **Selection count**: n/a.
- **Small-screen behavior**: grid, gizmo, and nav chrome all render and stay tappable
  at phone width (390px) — nav chrome as on-screen buttons, not relying on drag
  gestures alone, per `CLAUDE.md`'s Responsive Layout section. This is the exact rule
  the second attempt's own stop note names as a hard failure when skipped ("clicking
  dragging in the 3D viewport just rotates the base grid" — orbit-only, no independent
  pan/zoom chrome).

## Documentation

- **Page**: `docs/viewport-navigation.md` (new) + sidebar entry.
- **Example**: "Click and drag anywhere in the 3D view to orbit the camera. Use the
  +/− buttons in the bottom-left to zoom, or tap the pan icon to switch drag mode to
  panning. Click any face of the orientation cube in the top-right corner to snap the
  camera to that standard view — e.g. click 'Top' to look straight down the Z axis.
  Each minor grid line represents 10mm; each bold major line represents 50mm" (naming
  the mm convention per `CLAUDE.md`'s units rule, since this is the first place a user
  sees a number on screen).

## Affected files

- `src/views/AppView.vue` (new — the single root view)
- `src/components/viewport/Viewport.vue`, `Grid.vue`, `OrientationGizmo.vue`,
  `NavigationChrome.vue` (new)
- `src/render/scene.js`, `src/render/camera.js` (new — rendering glue per
  `CLAUDE.md`'s Project Structure)
- `e2e/viewport-scaffold.e2e.js` (new)
- `docs/viewport-navigation.md` (new) + docs sidebar config

## Proposed fix

Grid: draw minor lines at a fixed base spacing and major lines every 5th/10th, plus a
ruler or on-hover readout — per `CLAUDE.md`, this must be readable without opening any
inspector. Orientation gizmo and nav chrome render as fixed screen-space overlays
(`viewport/` per `CLAUDE.md`'s component categories), not objects in world space. Nav
chrome buttons should drive the same camera-control functions touch/mouse drag does, so
there's one source of truth for camera state, not two parallel input paths.

## Effort

L (multi-session / needs design discussion)

## Testing

`e2e/viewport-scaffold.e2e.js` navigating to `/`, run at all three reference viewports
(phone/tablet/laptop, per `CLAUDE.md`'s Responsive Layout table) with a visual snapshot
captured at each, and against all three browser engines (Chromium/Firefox/WebKit, per
`CLAUDE.md`'s Browser Support table) — this is a WebGL/canvas surface from line one, so
the "defaults to all three engines" rule applies directly, not the Chromium-only
exception.

Acceptance scenarios: this task is the direct prerequisite for `Initial design.md` §9
scenario 7 ("Touch-only viewport navigation") — once `docs-004` has written
`TODO/ACCEPTANCE.md`, that scenario should be re-driven against this task's code by
hand on the iPad reference viewport (orbit/pan/zoom + orientation-gizmo snap, no
keyboard or mouse). No closed findings exist yet in this project to re-check.
