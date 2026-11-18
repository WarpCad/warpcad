---
title: Place split-face connector markers with the true camera projection, not the plane's centre-point affine map
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-15 from the testing-031 tap, timing and reach drive
depends: []
status: done
---

> **Shipped:** `updateCutPlaneAnnotation` now fits the exact face-to-screen perspective map (a homography from the four projected plane corners, stored as `homography`), and `faceToScreen`/`screenToFace` use it (affine fallback when a corner is behind the camera). The dimmed-fit field is drawn as projected polygons, since an SVG `matrix` cannot express perspective. Unit test at a 90 mm oblique camera: within 0.5 px and round-trips. The existing zoomed-in `print-prep` e2e specs (webkit-phone + firefox-tablet pair) cover placement; no new e2e spec was added.

## Problem

Found measuring `TODO/VERIFY.md` `ui-067` #3 (2026-11-15). `src/render/cutPlane.js` `faceToScreen` places a connector marker with the plane's affine map taken at the plane's centre, so a marker's position drifts from the true perspective projection as the point moves away from the centre. This is a model of that documented map against a pinhole camera (vertical field of view 45 degrees, a 390x791 px viewport), not a pixel read from the app: the worst error at a face corner is about **3.6 px when the camera is 8 face-widths away, 16 px at 4, 45 px at 2.5 and 160 px at 1.5**, and it barely changes with the elevation (20 to 70 degrees). The app's default framing of a 100x40x30 mm bar puts the camera at 349 mm, about 8.7 times the 40 mm cut face, so a fresh split reads about 3 px off at the corners. A user who zooms in to place a connector precisely, so the face fills the phone's width (about 2.7 face-widths), sees a marker about 38 px from where the click lands, which `screenToFace` then inverts with the same approximation (the placement lands where the marker is drawn, not where the finger pressed).

## Affected files

- `src/render/cutPlane.js` (`faceToScreen`, `screenToFace`)
- `src/components/viewport/ConnectorMarker.vue`

## Proposed fix

Project each marker and invert each click through the camera (a ray-plane intersection, as `src/render/` does for the working plane), keeping the affine map only for the cut-plane handle's drag direction. Add a numerical test with a close camera: the marker for a face corner projects within 0.5 px of the true projection.

## Effort

M.

## Testing

- Unit test (`cutPlane.spec.js`) with a close, oblique camera and explicit tolerances; an e2e spec at `/` that places a connector on a zoomed-in face at the three viewports.
- Re-run the `TODO/VERIFY.md` row named in Problem and the closed findings it touches.

## Interaction model

Precondition: a body split, the connector sheet open. Trigger: tap on the cut face. Feedback: the marker appears under the finger and the Inspector shows its position.

## Documentation

- **Page**: n/a (no visible control changes).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
