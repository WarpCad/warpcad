---
title: In Pan mode, a touch drag that starts on a selected body's gizmo ring rotates the body instead of panning
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-020 drive of ui-062 #4
depends: []
status: done
---

> **What shipped (2026-11-18):** the first option. `Gizmo.vue` takes a `dragMode` prop; in `pan` the hit targets get `pointer-events: none`, so a press on a ring or arm falls through to the canvas and pans. Orbit and Select keep the handles. Pinned by a case in `e2e/gizmo-transform.e2e.js` (real `elementFromPoint` hit-test and a real mouse drag, rather than synthetic events dispatched at the handle); described in `docs/viewport-navigation.md`.

## Problem

`TODO/VERIFY.md` `ui-062` #4 (first seen on a phone on 2026-10-12, "not merge-related") asked whether a drag that starts on a selected body's
gizmo ring rotates the body while the chrome is in **Pan** mode. `FIND-testing-020` reproduced it on HEAD.

Drive (Chromium, phone 390 × 844, `hasTouch`, trusted CDP `Input.dispatchTouchEvent`, production build with the e2e hooks): a 30 mm Cube at
the origin, selected by a tap, Inspector sheet collapsed, navigation chrome expanded, **Pan** pressed (`aria-pressed` true, the button
primary-styled).

| Drag (touch, 18 moves over about 400 ms) | Gizmo hub (`data-origin`) | Document `version` | Cube bounds / Inspector rotation Z |
|---|---|---|---|
| Empty canvas, (60, 300) by (+50, +40) | 195,369 to 246.9,410.5 (**the view panned**) | 1 to 1 | unchanged, 0° |
| Started on `gizmo-grab-ring-z` at (303.7, 436.1), 70 px tangential | 246.9,410.5 to 246.9,410.5 (**no pan**) | 1 to 2 | ±15 to ±18.18 mm half-extent, **-14°** |
| Started on `gizmo-grab-ring-z` again at (311.0, 432.6), 70 px tangential | unchanged (**no pan**) | 2 to 3 | ±20.06 mm half-extent, **-26°** |

So in Pan mode the ring wins the press: the body rotates (one document step per drag) and the camera does not move. The `hit` test at each
start point returned the ring itself (`document.elementFromPoint(x, y) === gizmo-grab-ring-z`), so this is the ring's handler, not a stray tap.
Orbit and Select modes were not compared in this drive. A user who chose Pan to move the view can rotate a body by accident when the drag
starts anywhere on a ring (the rings are large on a phone: the Cube's ring sat around 57 px from the hub).

Acceptance 7's navigation-chrome steps (orbit step, Pan then step, zoom in and out, the orientation gizmo's Top and Front) were re-driven at
820 × 1180 in the same session and pass, because they use the chrome's buttons, not a drag from a ring.

## Affected files

- `src/components/viewport/Gizmo.vue` (`onHandleDown` on the ring and arm hit targets, near the `@pointerdown` bindings)
- `src/components/viewport/Viewport.vue` (`onGizmoHandleDown`, `effectiveDragMode`, `dragMode`)

## Proposed fix

Decide the rule first, then pin it with an e2e: either a gizmo handle ignores a press while `dragMode` is `pan` (the press falls through
and pans), or the handle keeps working and the chrome says so. The first reads closer to what the toggle promises. Whichever is chosen,
state it in `docs/` (the navigation page) and keep a body's gizmo usable in Orbit and Select.

## Effort

S.

## Testing

- New `*.e2e.js` (or a case in `e2e/gizmo-transform.e2e.js`): with Pan pressed and a body selected, a trusted-touch drag that starts on a
  ring moves `data-camera-target` and adds no document step. Chromium phone and tablet (trusted touch), WebKit phone, all three engines.
- Re-run `ui-064`'s reproduction (a touch drag on a rotate ring does not orbit the camera) and `ui-065`'s (a drag on a translate arm does not
  orbit), since they live in the same handler.
- Acceptance scenario 7 (touch-only navigation) re-driven.

## Interaction model

Precondition: one body selected, chrome mode Pan. Trigger: a one-finger drag that starts on a gizmo ring. Feedback: the view pans (or the
body rotates, if that is the decided rule) and the chrome's mode reads accordingly.

## Documentation

- **Page**: the navigation page under `docs/`, a line on what a drag that starts on the gizmo does in each mode.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
