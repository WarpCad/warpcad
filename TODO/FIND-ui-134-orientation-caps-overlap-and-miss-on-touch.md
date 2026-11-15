---
title: Stop the orientation-triad caps overlapping, so a fingertip lands on the cap it aimed at
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-15 from the testing-031 tap, timing and reach drive
depends: []
status: open
---

## Problem

Found measuring `TODO/VERIFY.md` `render-001` #2 (production build of the dirty tree at 2026-11-15, 390x844 and 820x1180 touch emulation, Chromium and WebKit). The six axis caps are 30x30 px boxes on a 106 px dial, and neighbouring caps overlap (Left at 290.7,85.5 and Front at 290.7,112.5 share 3 px; Top, Left and Back are 23-27 px apart centre to centre). 100-200 taps per cap, scattered as a fingertip would be (Gaussian, sigma 3.5 mm = 13.2 px, `bench/tap-scatter.mjs`): the intended cap fired on only 41-59 % of taps at 390 px (Chromium, n=200: Top 54.5 %, Front 58 %, Right 59 %, Left 50.5 %, Back 49.5 %, Bottom 61 %) and 54-72 % in WebKit (n=100); **a different cap fired on 22-35 % of Chromium taps (Bottom 35 %, Back 33 %)** and 24-46 % in WebKit. At sigma 3 mm the wrong-cap rate is 13-28 %, at 4 mm 28-44 %. At 820 px the numbers are the same (51-60 % right cap, 24-39 % wrong cap, n=100). The rest of the dial rim (not a cap) swallowed 3-19 % and the Home button hit 78-87 %. The wrong cap snaps the camera to the wrong standard view, so the user taps again. The row's own prediction (a bigger dial, not bigger caps in the same space) holds: the caps cannot grow without overlapping more.

## Affected files

- `src/components/viewport/OrientationGizmo.vue` (the cap size and the dial's size at touch widths)

## Proposed fix

At touch widths (phone and tablet) enlarge the dial so six 44 px caps do not overlap (about 190 px across, or a two-row layout of the six faces), or resolve a tap in the overlap to the nearest cap centre instead of the topmost box. Aim for at most 2 % of scattered taps (sigma 3.5 mm) landing on a different cap.

## Effort

M.

## Testing

- Unit test for any hit-test or layout change; an e2e spec at `/` at the viewports named above that taps the control through its scatter (see `bench/tap-scatter.mjs`).
- Re-run the `TODO/VERIFY.md` row named in Problem, `TODO/ACCEPTANCE.md` scenario 7 (touch-only viewport navigation), and the closed findings it touches.

## Interaction model

Precondition: none. Trigger: tap a cap on the orientation dial (top right of the viewport). Feedback: the camera snaps to that standard view and the label under the dial names it.

## Documentation

- **Page**: `docs/` navigation page, only if the dial's size or layout changes visibly.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
