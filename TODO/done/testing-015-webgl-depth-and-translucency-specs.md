---
title: Automate the z-fight, coplanar-hole and overlapping-translucency checks on all three engines
category: testing
kind: finding
priority: low
model: sonnet
depends: [testing-005]
status: done
---

> **What shipped (2026-11-13).** `e2e/webgl-depth-translucency.e2e.js`, test-only (no `src/` change), five scenes
> (Bolt + Anchor, a Pi 5, camera modules v1 + v2, two overlapping Pis) at a top view and a tilted view, captured twice a
> frame apart (A, B) and once after an orbit step (C), on all nine engine-viewport projects, 36/36 green on repeat runs.
> It asserts zero A-to-B difference and a per-engine ceiling on isolated-speckle pixels (chromium 3e-4, firefox and webkit
> 5e-5; the reason is written beside the numbers in the spec). Measured: flicker 0 everywhere; speckle peaks at 1.4e-4 on
> chromium (grid lines seen through a translucent board, dotted by the software rasteriser), at most 1.3e-5 on firefox and
> 7.3e-6 on webkit. Differences from the proposal: the capture hides DOM overlays and clears the selection first, because
> **Firefox's selection move-handles flicker by a few pixels frame to frame** (a 10 x 30 px box beside the selected part,
> 0.00001 to 0.0006 of the canvas, intermittent; seen only while a body was selected). That is not part of this finding's
> question and is left unfiled here, for the owner to decide. "Double-darkening" of two translucent layers is not
> separable from a correct blend by any stability measure, and the real iPhone/iPad GPU look stays manual
> (`FIND-testing-030`, and `core-034` row 2).

## Problem

`testing-005` triage of `TODO/VERIFY.md` found one group of WebGL rendering checks that have been
queued by hand since September and that a pixel assertion can cover: depth-buffer fighting at
coincident faces, coplanar cutter holes, and two translucent surfaces overlapping. They are
engine-sensitive (depth precision and blend sorting differ between Chromium, Firefox and WebKit), so
by `CLAUDE.md` Browser Support they belong in a real `*.e2e.js` spec, not a standing manual click-through.

Rows in this group (all still `Open` in `TODO/VERIFY.md`, marked "Graduating"):
- `ui-016` row 1: a Bolt and an Anchor orbited: no seam or flicker where `tap` meets `head`/`thread`, or `hole` meets `post`.
- `core-034` rows 1-2: a dropped Pi 5 from above: mounting and fan holes read cleanly through the translucent board; the coplanar camera-module v1/v2 holes show no speckle at the walls.
- `render-003` rows 1-2: a Pi's translucent part over an opaque part, and two Pis with overlapping translucent parts: no flicker, double-darkening or z-fighting.

The real-GPU look on a physical iPhone or iPad stays a manual row; this task automates what a
software renderer can still show (a stable, non-speckled pixel region across repeated frames from
two nearby camera angles).

## Affected files

- `e2e/` (a new `*.e2e.js` spec, navigating to `/`)
- `TODO/VERIFY.md` (set the five rows to `OK` or `N/A` once the spec covers the headless part)

## Proposed fix

1. Drop the parts, move the camera to fixed angles near each coincident or overlapping surface, and
   capture the canvas twice a frame apart plus once at a nudged angle.
2. Assert the sampled region is stable between captures (no per-frame flicker) and has no isolated
   speckle pixels against the surrounding surface colour, within a stated tolerance.
3. Run on all three engines; where an engine's headless renderer legitimately differs, record the
   tolerance per engine, not a skip.

## Effort

M.

## Testing

- Engines: chromium, firefox and webkit (WebGL depth precision is engine-specific). Phone, tablet and laptop viewports for the camera-framing assertions.
- Acceptance scenarios to re-drive: 1 (two primitives), 3 (kit assembly snap) and 5 (hidden-part boolean), since they place the same parts.
- Closed-finding regression: none.

## Interaction model

Not UI-touching (test-only).

## Documentation

- **Page**: n/a (test-only; no user-visible control changes).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
