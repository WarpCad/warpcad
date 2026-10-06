---
title: A fillet on a hexagonal rim exports with open edges (12 of them), primitive or sketch
category: io
kind: finding
priority: medium
model: opus
milestone: M8
depends: []
status: done
---

> **Shipped 2026-10-06 (`io-006`) — neither of the two causes this file guessed, and wider
> than a hexagon.** Dumping the 12 unmatched edges showed four tiny **sliver holes**, one at
> each hexagon corner off the X axis, all on the cut plane: two distinct corners ~1e-4 mm
> apart (`(12.5, 21.650635)` from the remainder, `(12.500032, 21.650543)` from the loft).
> Not a T-junction, so `watertight.js` was right to leave it (the edge between them is
> shorter than its weld radius, and it never moves a coordinate by design), and not the
> ring walling either: `extrusions.project`, which `sectionAt` reads the cross-section
> with, hands back off-axis corners displaced ~1e-4 mm (and even a cube's corners 6e-5 mm
> outward). The loft starts from that drifted section; the remainder below the cut keeps
> the true corner. Fix in `src/core/kernel/fillet.js`: `snapSectionToSolid` puts each
> section vertex within `SECTION_EPSILON_MM` (1e-3) of one of the remainder's own corners
> on the cut plane back onto those exact coordinates, side by side so holes keep their
> topology. **Measured beyond the file's three rows**: a filleted Ø40 cylinder exported
> **32 open edges at Normal and 119 at Print** before (0 after), an off-origin chamfered
> one 52/85 (0 after) — every curved rim leaked, not only hexagons. The drift also made
> every fillet keep ~0.013 mm³ too much on a 20 mm cube (the sweep converged to 7855.854
> instead of the exact 7855.841); it now converges onto the hand value from below, so two
> `fillet.spec.js` volume checks moved from 128 to 512 slices (128 had matched only by
> cancellation), and three `tessellation-legacy-golden.json` digests whose geometry
> changed on purpose were refreshed (`modify.filletRim:cube`, `raspberrypi.miniPiTFT`,
> `raspberrypi.piTFT24`; every other key unchanged). **Overlap with `core-051`**: same
> `sweepRim`, different defect — a cube minus a bore plus a fillet still exports open
> (160 → 118 at Normal) because the loft walls a multi-loop outline by flat index; that
> stays `core-051`'s, and the side-wise snap composes with whatever it does.

## Problem

Found while hand-driving `TODO/sketch-001`'s Step 6 (ACCEPTANCE scenario 11): a sketch
hexagon (Polygon tool, r 25 mm, Linear 20 mm) with a 2 mm **Fillet** on its top rim
exported an STL with **8 open edges** at the design resolution. Isolated in Node through
the real export path (`runExportJob`, design resolution `normal`):

| body | triangles | open edges |
|---|---|---|
| sketch hexagon, no fillet | 20 | 0 |
| sketch hexagon + top fillet r 2 | 88 | 12 |
| `primitive.hexagon` (d 50, h 20) + top fillet r 2 | 88 | 12 |

So it is **not** the sketch primitive: the long-standing `primitive.hexagon` fails
identically. It is the rim op (`src/core/kernel/fillet.js`) on a rim whose edges are not
axis-aligned, and/or `src/core/kernel/watertight.js`'s T-junction repair not catching the
seams that rim op leaves — the same class `io-004` fixed for unions and the bolt's hex head.
`io-004`/`io-005` measured fillets only on axis-aligned rims.

## Proposed fix

Reproduce with the three rows above as a failing `exportJob.spec.js` case (the existing
`openEdges` helper), then decide where the seam comes from: dump the unmatched edges and
check whether they are T-junctions (`watertight.js` should catch them — find why not) or
genuinely open seams from `fillet.js`'s ring walling (then fix the walling).

## Testing

- `src/core/exportJob.spec.js`: 0 open edges for `primitive.hexagon` + fillet, a sketch
  polygon + fillet, and a chamfer on each, at `normal` and `print`.
- Re-run io-004's and io-005's shapes (all still 0).
- Acceptance: re-drive scenario 11 with a filleted hexagon.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
