---
title: Replace the axis-triad orientation gizmo with the shaded view cube from the second attempt
category: ui
kind: feature
priority: high
model: opus
milestone: none — Findings table, requested by the owner 2026-11-22
depends: []
status: done
---


> **What shipped (2026-11-22).** The triad is gone; the orientation gizmo is the shaded view cube, as six flat DOM faces (not `preserve-3d`)
> placed by `src/render/viewCube.js`, with a `snap` event and props unchanged, so `Viewport.vue` did not change. A face turned away or
> edge-on (depth at or below 1e-9) is hidden, takes no pointer and leaves the accessibility tree; **Views** beside **Home** opens the
> six-view grid at every width. The cube is 55 px a side in a 96 px box (96 px a side in a 168 px box on a coarse pointer 600 px and wider).
> **Differs from the file:** the face and edge colours are `--view-cube-*` tokens in `themes/dark.css` and `light.css` over six
> `--pebble-*` greys in `base.css` (no `tokens.css` exists), and the phone's scattered-fingertip bound is 20 %, not 3 %: a 55 px side
> beside the Operations toolbar cannot reach 3 % (measured 12.0 % chromium-phone, 12.7 % webkit-phone; tablet 2.7 % chromium and 0.7 %
> webkit). `orientationHit.js` is deleted; nine specs moved to `e2e/support/snapViaGizmo.js`. The `ui-148` phone tap-to-open-Views
> behaviour is not kept (owner questions `Q118` to `Q123`, quick check `M27` in `TODO/OWNER.md`).

## Goal

The owner asked for this on 2026-11-22: "In the previous attempt at warpcad, I really like the position cube that one made. Write a
to do to switch to that one."

"The previous attempt" here is the **second** attempt, `~/src/WarpCad1` (shelved 2026-09-05; `SECOND-ATTEMPT.md`). The first
attempt, `~/src/cad`, had no orientation gizmo. WarpCad1's cube is in:

- `~/src/WarpCad1/src/render/orientationGizmo.js`: the scene, face hit test, camera tween, and the `render-008` orientation fix.
- `~/src/WarpCad1/src/components/viewport/OrientationGizmo.vue`: the canvas, its rAF loop, and the click handler.
- `~/src/WarpCad1/e2e/app-shell.e2e.js-snapshots/app-shell-laptop-laptop-darwin.png`: how it looked (top right of the viewport).
- `~/src/WarpCad1/TODO/done/render-003-orientation-gizmo.md` and `render-008-orientation-gizmo-does-not-track-orbit.md`.

**What the owner liked, and what this task must reproduce:** a solid, unlabelled cube about 96 px across, sitting bare in the
viewport's top-right corner with no card around it. It is drawn orthographically and seen corner-on at the home view, so three
faces show. Each face has a fixed grey shade, a "lit from above" set from white on top to dark underneath (`DEFAULT_FACE_COLORS`:
right `#d0d4da`, left `#9aa0a8`, back `#b8bcc2`, front `#e6e8eb`, top `#ffffff`, bottom `#6b7078`), with dark edge lines. The cube
turns against the camera as the view orbits, so it always shows the world the way the main view does. Clicking or tapping a face
snaps the camera to that face's standard view.

**What it replaces:** today's `src/components/viewport/OrientationGizmo.vue` (583 lines), an SVG axis triad with six round cap
buttons (X, −X, Y, −Y, Z, −Z) in a glass card. It also carries a Home button, an `az · el` caption, the touch-sized tablet dial
(`ui-134`) and the phone touch picker (`ui-148`).

**Done means** the triad is gone from the app. In its place is the shaded cube, which turns as the camera orbits (and stays put when it
pans) at every engine and viewport. Tapping any visible face snaps to that view. Every one of the six views and Home stays reachable without a keyboard
in any camera orientation, including face-on views. Snapping stays disabled while sketching.

## Interaction model

- **Precondition** — nothing. The cube is always shown in the 3D view. While the sketch editor is open it keeps tracking the
  camera, but its faces, the Views button and Home are disabled. That is the current `disabled` prop, and the reasons in the
  current file's doc comment (from `ui-020` and `sketch-001`) still hold.
- **Trigger** —
  - **A face of the cube** (top-right of the viewport, where the triad is now). A click or tap snaps to that face's view: Top
    looks down −Z, Front sits on −Y, Right on +X, and so on, using the same `navigation.snapView(view)` → `orbit.snapTo(view)`
    path the triad emits today.
  - **Home** stays as a button under the cube (`gizmo-view-home`).
  - **Views**, a new small button beside Home, opens the six-face grid (today's `ui-148` phone picker, reused at every width
    as a popover). This is how to reach the three faces turned away from the camera. It is also how to leave a face-on view:
    after snapping to Front, the Top and Right faces are edge-on (zero area) and cannot be tapped. WarpCad1 had the same gap.
    The AutoCAD-style fix (small arrows around a face-on cube that step to the adjacent face) is out of scope and could be
    filed as a follow-up.
- **Feedback** — the camera moves to the view, and the cube turns so the snapped face faces the viewer square-on. A face under
  the pointer, or focused by keyboard, takes `--accent` as a tint or outline. Each face has a `title` and `aria-label`, such as
  "Top view (looking straight down Z)", reusing today's titles. The `az · el` caption stays (`gizmo-orientation-label`); specs
  and acceptance logs read it.
- **Placement** — n/a (creates no geometry).
- **Selection response** — n/a.
- **Selection count** — n/a.
- **Small-screen behavior** — the cube is about 96 px at laptop and on a phone. On a coarse pointer at 600 px and wider it grows
  enough that each face a corner-on view shows stays at least 44 px across its short diagonal, which gives the same tap floor as
  `ui-134`'s caps. On a phone, the visible faces take taps directly. The six-cap overlap problem `ui-148` solved goes away,
  because three large faces replace six crowded caps. The Views grid stays available, and it is the only path to the hidden
  faces. The whole gizmo block (cube, Home, Views, caption) must not outgrow the current gizmo's box at any chrome tier, so the
  Operations toolbar and Sketch toolbar spacing (`ui-015`, `ui-043`, `ui-150`) still holds.

## Documentation

- **Page** — `docs/viewport-navigation.md` (the orientation gizmo section is rewritten for the cube) and `docs/mobile.md`
  (where it describes the phone picker). Check `docs/help-slugs.json` if any heading anchor changes.
- **Example** — "Click the cube's top face (the white one): the view looks straight down at the grid and the cube shows only its
  top. To get back to a three-quarter view, click **Home**. To look at the part from underneath, click **Views** and choose
  **Bottom**, because the bottom face is hidden whenever the camera is above the grid."
- **Media** — refresh the gizmo shots that `e2e/docs/viewport-navigation.docs.js` and `e2e/docs/mobile.docs.js` produce, and any
  other `e2e/docs/*.docs.js` shot that shows the triad in its frame (`ai-chat`, `print-prep`). Regenerate only those, through a
  scoped run. `docs:gifs` rewrites every GIF, so never use it to refresh one movie.

## Affected files

- `src/components/viewport/OrientationGizmo.vue` — rewritten as the cube; keeps the props (`azimuthDeg`, `elevationDeg`,
  `disabled`) and the `snap` event, so `Viewport.vue:766-771` doesn't change.
- `src/render/viewCube.js` (new, framework-free) + `viewCube.spec.js` — the cube's orientation transform and which faces face
  the camera, from azimuth/elevation.
- `src/render/orientationHit.js` + spec — `nearestCapView` and `CAP_RADIUS_FRACTION` exist only for the triad's caps; retire
  them if nothing else imports them.
- `src/styles/tokens.css` — six face-shade tokens and an edge token, with dark and light values (no hardcoded colours).
- `e2e/orientation-tap.e2e.js` — rewritten for faces (below); `e2e/support/humanInput.js` if it aims at caps.
- Specs that click `gizmo-view-*` or read the dial: `nav-chrome-scale-readout`, `panel-tiers`, `print-prep`, `print-prep-keys`,
  `selection-inspector`, `share-link`, `sketch-primitive`, `viewport-scaffold`, `webgl-depth-translucency`, and screenshot
  baselines that frame the top-right corner.

## Proposed fix

**Mechanism: a CSS 3D cube of six DOM faces, not a second WebGL canvas.** This is a reversible default taken while writing the
task, not an owner decision. If the owner wants WarpCad1's code ported literally, that is the alternative, and the reasons
against it are:

| | CSS 3D faces (chosen) | Port WarpCad1's WebGL mini-scene |
|---|---|---|
| WebGL contexts | none added | a second `WebGLRenderer` per viewport; iOS Safari caps live contexts, and `render-006`'s context-loss restore would need a second path |
| Frame loop | redraws only when `azimuthDeg`/`elevationDeg` change | its own always-on `requestAnimationFrame` loop, against the render-on-demand loop and the 16 ms budget |
| Hit testing | each face is a real `<button>` with `data-testid="gizmo-view-<face>"`, so existing specs keep their selectors and the browser does the picking | raycast plus a dev-only `findGizmoFacePixel` hook to let specs find faces; WarpCad1 needed two bug fixes there (recursive raycast hit the edge lines; an un-updated camera matrix missed everything) |
| Theming | faces and edges are CSS tokens | colours in JS, outside `tokens.css` |
| Look | the same: orthographic, flat per-face shades, edges as borders | the original |

Steps:

1. **`src/render/viewCube.js`** builds the cube's `matrix3d` from the same basis the triad uses now (`rightFromSpherical`,
   `upFromSpherical`, `positionFromSpherical` in `src/render/camera.js`). A world direction `v` lands at screen
   `(right·v, −up·v)` with depth `toCamera·v`, so the matrix's columns are those three basis vectors. This reuses camera.js's
   Z-up sign conventions instead of re-deriving them. WarpCad1's `render-008` bug was exactly a sign/inversion slip, turning the
   cube with the camera instead of against it. Also export `facingFaces(az, el)`, which gives each face its depth (`> 0` toward
   the viewer). Write into caller-owned scratch, with no allocation per call.
2. **`OrientationGizmo.vue`**: a `preserve-3d` container with no `perspective` (orthographic, like WarpCad1's camera), six face
   buttons placed with `rotateX`/`rotateY` + `translateZ(half)`, and the container's `transform` bound to the matrix. Give faces
   whose depth is `≤ 0` `pointer-events: none` and `aria-hidden`, instead of trusting `backface-visibility` to stop clicks. Engines
   disagree on hit-testing back-facing `preserve-3d` children, and depth is already known. Keep the face-on edge cases in mind:
   at Top, four side faces have depth exactly 0.
3. Keep Home, the caption, the `disabled` behaviour, the chrome-tier classes and the `data-azimuth`/`data-elevation` attributes.
   Turn the `ui-148` picker into the Views popover at every width. Drop the triad SVG, the caps, `onDialClickCapture` and the
   nearest-cap code.
4. **No tween in this task.** WarpCad1 eased the camera over 300 ms; today `snapTo` is instant, and about 15 specs read az/el
   right after a tap. If the owner wants the glide, file it as its own task against `src/render/camera.js`.
5. Retire `orientationHit.js` if it is now unused; run `/docs` for the two pages; run `node scripts/spdx.mjs --fix` on the new files.

## Effort

L — the component itself is M, but about a dozen e2e specs, their screenshot baselines and two docs pages move with it.

## Testing

- **Unit** — `src/render/viewCube.spec.js`: at Home (az −45, el 35.26) exactly Top, Front and Right face the viewer. At each of
  the six standard views exactly one face has depth `> 0` (tolerance `1e-9`), and it is that view's face. Pin the
  matrix against `camera.spec.js`'s projections at those views (`toBeCloseTo`, 9 digits). Cover the degenerate views: at
  el ±90 with azimuth free, four faces sit at depth 0 and none of them may be marked facing. A component spec checks that
  `disabled` makes the faces, Home and Views inert, and that the `snap` event fires with the face name.
- **E2E (app at `/`)** — `e2e/orientation-tap.e2e.js`, rewritten. At Home, tap each visible face and check az/el. From Front
  (face-on), reach Top through Views. Orbit and check the visible face set changes. Then the `ui-134`/`ui-148` scattered-tap
  measurement against faces instead of caps: seeded, σ 3.5 mm, 150 taps, wrong-face rate ≤ 3 % on chromium-phone, webkit-phone
  and chromium-tablet. Every other spec that clicks a `gizmo-view-*` face that is not visible in its camera state switches to a
  shared `snapViaGizmo(page, view)` helper in `e2e/support/` (taps the face if it faces the viewer, otherwise goes through Views).
- **Responsive** — all three viewports, with a gizmo snapshot at each (Small-screen behaviour is not "same as desktop").
- **Browser Support** — all three engines (Chromium, Firefox, WebKit). CSS 3D `preserve-3d` hit testing and transforms
  differ by engine, so this is not Chromium-only.
- **Acceptance** — re-drive **7 (Touch-only viewport navigation)** by hand with the `run` skill, touch only, at 820×1180 and
  390×844. A spec alone doesn't cover it here, because the control a finger aims at is new. Re-drive **9** (sketch: gizmo disabled
  while sketching, Sketch toolbar clear of it).
- **Closed findings to re-run** — `ui-134` and `ui-148` (tap accuracy, by the rewritten measurement above), `ui-150` and `ui-015`
  (toolbar never meets the gizmo, tablet and laptop), `ui-043` (phone toolbar fit), `ui-084` (compact chrome tier), `ui-020`
  (snapping disabled while sketching).
- **Owner** — the cube is chosen on looks, so add a `TODO/OWNER.md` quick check: open the app at laptop and phone width and
  confirm "this is the cube I liked" against WarpCad1's snapshot above.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
