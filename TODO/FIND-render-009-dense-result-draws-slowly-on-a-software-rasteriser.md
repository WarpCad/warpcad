---
title: The landing of a dense whole-model cut is still about 110 ms headless, because the result mesh is non-indexed
category: render
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-19 from TODO/core-085
depends: []
status: open
---

## Problem

`core-085` took the main-thread gaps of a whole-model Subtract of two copies of the `5036 RGB Matrix 2.5mm` 3MF
(25 parts, 219,540 triangles each) from 210 ms to a median 20 ms at the click and from 244 ms to a median 137-147 ms
at the landing, headless Chromium 1440x900 (`bench/results/2026-11-19-core-085.md`). The landing target is 50 ms. It
is met on a real GPU (`--headed`: median 47 ms, worst 48, no Long Task) and **not met headless**.

What is left at the landing, from a CPU profile: about 30 ms is the app's own work (fold, mesh, normals, bounding
sphere) and about 110 ms is native frame time. The result is a non-indexed mesh, 660 k vertices for 220 k triangles,
and SwiftShader draws that at roughly 80 ms a frame (the headless idle floor with two dense models on screen is 18-19 ms
a frame; the redraw is the cost, not the cut).

## Affected files

- `src/render/` mesh bridge (how a body's solid becomes a `BufferGeometry`)
- `bench/whole-model-cut.mjs` (the two-copy case that shows it; `--headed` is the control)

## Proposed fix

Build the result as indexed geometry (shared vertices, 220 k triangles on about 110 k vertices) with a flat-shading
material, so the rasteriser transforms 3 to 6 times fewer vertices, and measure with
`node bench/evaluation-mainthread.mjs --only whole-model-cut --mesh "<file>" --rates 1 --runs 3` before and after.
Check first that flat shading by derivative (or per-face normals in a second attribute) keeps the look of the existing
bodies, and that picking, edges and the hover highlight still read the geometry. Target: headless landing under 50
ms, or an honest note that the rasteriser is the floor. Real-GPU landing already passes, so this is low priority.

## Effort

M.

## Testing

- The bench above, headless and `--headed`; record both.
- Existing viewport and picking e2e specs on all three engines (WebGL is involved), laptop, tablet and phone.
- Acceptance scenarios: 1 (two primitives stay visible), 26 and 31. Closed finding to re-run: `core-085`.

## Interaction model

Not UI-touching (rendering cost only; no control changes).

## Documentation

n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
