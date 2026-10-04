---
title: Fillet and chamfer produce wrong geometry (material added, not removed) on any rim that has a hole
category: core
kind: finding
priority: high
model: opus
depends: []
status: open
---

## Problem

Reported by the user on 2026-10-04, with a saved project, `examples/chamfer error.ndjson`:
a sketch with a rectangular hole (a 215.1 × 127.5 mm solid rect with a 120.4 × 65.8 mm hole
rect, `primitive.sketch`, linear extrusion 10 mm), then `modify.chamferRim` radius 5,
orientation `z+`. *"It does not look correct."*

Reproduced in plain Node against `chamferRim`/`filletRim` in `src/core/kernel/fillet.js`.
The same plate built with `primitives.cuboid` and `booleans.subtract`, so it is **not** the
sketch primitive. Volume removed by a top-rim chamfer, against `r² / 2 × perimeter`
(corner effects are small):

| solid | op, r | removed (mm³) | expected (≈) |
|---|---|---|---|
| the user's plate with hole | chamfer 1 | **−832** (adds material) | +529 |
| the user's plate with hole | chamfer 2 | **−687** (adds material) | +2116 |
| the user's plate with hole | chamfer 5 | 5616 | 13223 |
| 40² × 10 plate, 20² square hole | chamfer 2 | 1720 | 480 |
| 40² × 10 plate, 20² square hole | fillet 2 | **−496** | 206 |
| 40² × 10 plate, r 10 round hole | chamfer 2 | 104 | 445 |
| 40² × 10 plate, r 10 round hole | fillet 2 | 365 | 191 |
| 40² × 10 plate, **no hole** | chamfer 2 / fillet 2 | 309 / 135 | 320 / 137 |

The no-hole control is right. **Every shape with a hole is wrong**, in both ops, with the
sign of the error changing with the geometry: it adds, removes too little, or removes too
much. The chamfer in the report is the visible case of that, not a one-off.

### Root cause (confirmed by reading the cross-section)

`sweepRim` (`fillet.js:318-361`) lofts the cross-section at the cut plane up to an inset copy
of itself with `extrudeFromSlices`, which walls slice *n* to slice *n+1* **by vertex index**.
`alignVertices` (`fillet.js:277-307`) exists to keep index *i* meaning the same corner in
both slices. It does that by trying every **cyclic shift of one flat list** of points
(`geom2.toPoints`) and keeping the cheapest. That is only valid for a single closed outline.

A section with a hole has two contours, and `geom2.toPoints` returns their sides in the
kernel's internal order, with the contours **interleaved**. For the user's plate, the base
section's points come back as outer, outer, outer, *hole*, *hole*, *hole*, *hole*, outer, and
the inset copy's come back in a different interleaving (outer ×3, hole ×3, outer, hole). No
cyclic shift can line those up. The best-shift search returns a shift, the loft walls
corners to the wrong neighbours, and the result is twisted. That fits the numbers above,
including the sign flips.

Nothing catches it. `assertPrismaticBand` compares areas and `assertRadiusFits` samples
inset areas. Neither checks that the two slices **correspond**. And `alignVertices` only
throws when the *vertex counts* differ (here 8 and 8), so it gets through. This is the
failure class the module header promises it refuses: *"a plausible-looking but wrong solid,
no error"*.

The spec doesn't cover it. `fillet.spec.js` has no solid with a hole; the one `drilled`
case (line 264) only counts unmatched edges for the edge-fillet decision and never runs a
rim op.

## Affected files

- `src/core/kernel/fillet.js:277-307`  (`alignVertices`, single-contour assumption)
- `src/core/kernel/fillet.js:318-361`  (`sweepRim`, builds the slices)
- `src/core/kernel/fillet.spec.js`     (no hole coverage today)
- `src/core/kernel/registry.js:1177-1195` (`modify.filletRim`, `modify.chamferRim`; only to
  confirm they inherit the fix)
- `docs/fillet-chamfer.md`             ("Not yet supported" section, if any limitation stays)

## Proposed fix

Do **not** just patch the shift search. The right unit is the contour, and two designs are
credible; pick one in Step 2 and say why.

1. **Per-contour correspondence.** Read the section as contours (`geom2.toOutlines`), do
   the offset on the whole region as now, then pair each base contour with its offset
   contour (nearest centroid, with a containment check so an outer and a hole can never
   swap), run the existing cyclic-shift alignment **per pair**, and rebuild the slice with
   the sides reordered to match base order. Smallest change; keeps one loft.
2. **Sweep each contour separately and combine.** Loft the outer contour inward as now,
   loft each hole contour **outward** (a negative-radius sweep, which `requireRadius`
   already supports), and `subtract` the hole lofts from the outer one. No cross-contour
   correspondence at all, so no interleaving to get wrong. Costs boolean passes and
   reintroduces T-junction seams that `watertight.js` would then have to repair. Check
   `io-004`/`io-006`'s open-edge counts afterwards.

Whichever lands, also close the gap that let this through: **verify correspondence, don't
assume it.** After alignment, assert that every base vertex and its partner are within
`|inset|·√2·(1 + ε)` of each other (an inset moves a vertex by at most that), and throw the
module's usual loud error if not. A wrong pairing must never again return a solid.

**Hole-specific limits to settle explicitly, not by accident:**

- A chamfer of radius *r* **grows** each hole by *r* at the top face. Reject, with a clear
  message, a radius where a hole's growth would reach the outer edge or another hole
  (the ring between them is narrower than *r*). `assertRadiusFits` does not catch this, since
  it samples only the **area** falling monotonically. Test with a thin wall.
- Several holes, a hole near a corner, and nested contours (an island inside a hole) are the
  same code path. Decide whether islands are supported and test or reject them.
- The `z−`, `x±`, `y±` orientations go through `canonicalFrame`. Test at least one that
  is not `z+`.

## Effort

M. The fix is small once the design is picked, and the test matrix and the thin-wall
rejection are most of the work. `model: opus` because it is geometry and numerics.

## Testing

- **Unit** (`fillet.spec.js`), with an explicit tolerance and a volume oracle independent of
  the implementation (`r²/2 × perimeter` for a chamfer and `r²(1 − π/4) × perimeter` for a
  fillet, to within a few percent for corners; or compare against an analytic
  `expand`/`subtract` construction where one is exact):
  - the user's exact solid from `examples/chamfer error.ndjson` (chamfer 1, 2 and 5);
  - a square hole, a round hole, two holes, an off-centre hole, a hole near a corner;
  - a hole **and** a negative (flare) radius, where the hole shrinks instead;
  - a radius that makes the wall too thin: asserts the rejection and its wording;
  - every above shape through `filletRim` as well as `chamferRim`;
  - the no-hole cases still match their old values, so nothing regressed.
- **Open edges**: extend `exportJob.spec.js`'s `openEdges` check (as `io-006` proposes) to a
  holed plate with a chamfer, at `normal` and `print`. Land it with `io-006`'s findings in
  mind: a fix here that changes the seam structure must not add open edges.
- **E2E**: a `*.e2e.js` against `/` that opens `examples/chamfer error.ndjson` (load the
  fixture through the app's Open path; this is also the first consumer of that file), applies
  nothing new, and asserts the loaded body's reported volume or bounding box and Inspector
  size are sane, plus a rendered snapshot. Per `CLAUDE.md`, a rendered WebGL snapshot runs on
  **all three engines**. Because this changes a viewport-visible result, run at the laptop
  viewport; phone and tablet add nothing here.
- **Acceptance scenarios** to re-drive by hand: any that use Fillet/Chamfer, plus the
  sketch-with-a-hole one (scenario 11 per `sketch-001`). Place a sketch with a hole, extrude
  it, chamfer it, and look at it from above and from an angle. Report PASS/FAIL.
- **Closed findings** to re-run: `io-004` and `io-005` (open edges on fillet/chamfer rims),
  and `core-017` (negative-radius flare, which `alignVertices` was written for). This is the
  same function `core-017` changed, so its original flare repro is the most likely
  regression.
- **Documentation**: this changes visible behaviour, so update `docs/fillet-chamfer.md`
  with a short *"Shapes with holes"* section: that the rim of the hole is bevelled too, and
  an example (draw a rectangle with a smaller rectangle hole in Sketch mode, extrude, select
  the body, Chamfer 2 mm on the top face: both the outer edge and the hole's edge are
  bevelled). It must also state the new wall-too-thin error in the user's words. Add or
  update the `e2e/docs/` still in the same change.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
