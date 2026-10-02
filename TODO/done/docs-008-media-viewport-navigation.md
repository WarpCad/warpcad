---
title: Docs media — app overview, viewport navigation, orientation gizmo and grid
category: docs
kind: feature
priority: high
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007]
status: done
---

---

> **What shipped:** all 11 inventory items, Chromium/laptop. Differences from the spec: the fixture is `two-solids.ndjson` (the File ▸ Open loader reads NDJSON, not `.json`); `endMovie` and `scripts/docs-gifs.mjs` gained optional per-movie `fps`/`width` so the orbit and pan movies fit the 1.5 MB GIF budget (640 px, 12 fps). Each movie asserts a real camera attribute changed. `ui-018` repro (Shift-drag and right-drag pan) is exercised and asserted in `nav-pan`; `ui-046` is a phone-width overlap, so it is not reachable at laptop and is left to `docs-018`. No `src/` change, so no acceptance scenario could be affected and none was driven.

## Goal

Capture every shot and movie for the "what am I looking at, and how do I move around it"
surface and embed them in `docs/viewport-navigation.md` and `docs/README.md`. The
second attempt's stop note — *"clicking dragging in the 3D viewport just rotates the base
grid"* — is a navigation-discoverability failure; a GIF of orbit **and** pan **and** zoom
shows a new user all three exist.

## Interaction model

n/a — adds no control; documents existing ones.

## Documentation

- **Page** — `docs/viewport-navigation.md` (update), `docs/README.md` (overview image).
- **Example** — the page's existing walkthrough, now illustrated: "drag to orbit; hold
  Shift or use the right mouse button to pan; scroll to zoom; click the orientation gizmo's
  Top face to snap to top view."

## Media inventory

Spec: `e2e/docs/viewport-navigation.docs.js`. Scene: one placed cube + cylinder fixture so
orbit/pan are visibly doing something (an empty grid hides pan).

| Name | Kind | Shows | Viewport |
|---|---|---|---|
| `app-overview` | still | Whole app, empty scene: Library, viewport, nav chrome, orientation gizmo, toolbar. Becomes the README hero base. | laptop |
| `app-overview-with-model` | still | Same with the fixture scene selected — Inspector open. | laptop |
| `nav-orbit` | movie | Left-drag orbiting ~90°, ease in/out. | laptop |
| `nav-pan` | movie | Shift-drag (and a second beat with right-drag) panning the scene. | laptop |
| `nav-zoom` | movie | Scroll-wheel zoom in then out. | laptop |
| `nav-chrome` | still | The on-screen orbit/pan/zoom buttons (the no-keyboard path), cropped to the chrome. | laptop |
| `nav-chrome-buttons` | movie | Pressing the chrome's pan and zoom buttons — proves touch parity. | laptop |
| `orientation-gizmo` | still | The view-cube/axis triad, cropped, labels legible (`ui-025`). | laptop |
| `orientation-gizmo-snap` | movie | Click the gizmo's Top, Front, Right faces; camera snaps each time. | laptop |
| `grid-major-minor` | still | Grid with minor/major lines and the dimension readout, cropped. | laptop |
| `nav-mouse-mapping` | still | The configurable mouse-mapping control (`ui-019`) open. | laptop |

Phone-width variants of `app-overview` and `nav-chrome` belong to `docs-018`.

## Affected files

- `e2e/docs/viewport-navigation.docs.js`, `e2e/docs/fixtures/two-solids.json` (shared),
  `docs/viewport-navigation.md`, `docs/README.md`, `docs/screenshots/*`, `docs/media/*`.

## Proposed fix

Orbit/pan/zoom movies use `humanDrag` + the injected cursor from `docs-006`; zoom uses
`page.mouse.wheel` in small increments. Read the real control names from
`NavigationChrome.vue` / `OrientationGizmo.vue` rather than guessing — the nav chrome folds
behind `nav-expand-toggle` at phone width, which is `docs-018`'s problem, not this one.

## Effort

M

## Testing

- `npm run docs:screenshots` passes twice back-to-back; every movie ends by asserting a
  camera-state attribute on the viewport changed (orbit/pan/zoom each move something real),
  not merely that it ran.
- Engines: Chromium only (docs pictures). Viewports: laptop.
- `TODO/ACCEPTANCE.md`: the navigation-by-touch scenario is *consulted* for control names
  but not changed. Closed findings: re-run `ui-018` (shift/right-drag pan) and `ui-046`
  (nav chrome overlap) repro steps while recording — a regression visible in a movie is
  better caught here than by a reader.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
