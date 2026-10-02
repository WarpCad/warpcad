---
title: A fillet on a hexagonal rim exports with open edges (12 of them), primitive or sketch
category: io
kind: finding
priority: medium
model: opus
milestone: M8
depends: []
status: open
---

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
