---
title: "JSCAD V3 switch: fillet and chamfer rim — offset holes, project outlines, slices, and the spec's 2.x probes"
category: core
kind: feature
priority: low
model: opus
milestone: deferred — JSCAD V3 switch, not on the current roadmap
depends: [core-066, core-067, core-071]
status: deferred
---

**Deferred 2026-10-17** with its umbrella, `core-066`.

## Goal

`modify.filletRim` and `modify.chamferRim` (`src/core/kernel/fillet.js`) produce the same solids
under V3: the V1 parity fixture still passes, shapes with holes still lose material (the
`core-051` bug stays fixed), and a fillet on a hexagon still exports closed (the `io-006` fix
holds). `fillet.spec.js`'s executable record of what the kernel can and cannot do (the
`docs/decisions/geometry-kernel.md` addendum) is updated to V3 facts.

## Current behaviour (2.13.0)

- `fillet.js:131` `sectionAt`: `extrusions.project({ axis: [0, 0, 1] }, booleans.intersect(solid,
  slab))` gives the cross-section as a `geom2`.
- `fillet.js:157-188` `snapSectionToSolid`: snaps each side's endpoints to the solid's corners,
  then rebuilds with `geometries.geom2.create(geom2.toSides(section).map(...))` (sides in, sides
  stored).
- `fillet.js:253` and `:773`: `expansions.offset({ delta: -inset, corners: 'edge' }, base)` — in
  2.x, `offsetGeom2` decides per outline whether it is a hole (by nesting) and flips the delta, so
  a negative inset shrinks the outer outline **and grows each hole**.
- `fillet.js:428`, `:766`: `geom2.toOutlines` to get contours; `alignInsetContours` throws if the
  inset changes any contour's vertex count.
- `fillet.js:714` `sidesInBaseOrder`: maps `geom2.toSides(base)` back to (contour, index) pairs.
- `fillet.js:792-803`: `extrusions.extrudeFromSlices({ numberOfSlices, callback }, base)` with
  `extrusions.slice.fromSides(...)` and `extrusions.slice.transform(...)` in the callback.
- `src/core/kernel/fillet.spec.js:13` destructures `expansions`, `minkowski`, `modifiers` from the
  default import; `:478, 509-510` use `geom2.create(sides)`; `:485, 499, 529` `expansions.offset`;
  `:521` expects `expansions.expand({ delta: -3, corners: 'round' }, cube)` to throw
  `/radius must be positive/`; `:538` `minkowski.minkowskiSum`; `:544` `expansions.expand` with
  `delta: 3`; `:25, 562` `modifiers.generalize`.

## Expected V3 behaviour

Verified by running both versions side by side in Node (2.13.0 from `node_modules`,
3.0.7-alpha.0 from its tarball, 2026-10-17):

- **Offset of a section with a hole changes meaning.** For a 20 × 20 square with a 6 × 6 hole,
  `expansions.offset({ delta: -1, corners: 'edge' })`: 2.13.0 area **260** (outer 18 × 18, hole
  grown to 8 × 8); 3.0.7-alpha.0 area **308** (hole *shrunk* to 4 × 4). V3's `offsetGeom2` has a
  new option `expandHoles`, default `false`, which treats every outline as outside. With
  `expandHoles: true` V3 gives **260** again. This is exactly the `core-051` failure (material
  added at a hole's rim instead of removed), reintroduced silently.
- **`project` returns un-simplified outlines.** Projecting a 20 × 20 × 20 cube minus a
  32-segment cylinder through a thin slab: 2.13.0 returns outlines of **[4, 32]** points; V3
  returns **[38, 55]** (Martinez keeps the collinear seam points of every projected polygon).
  Areas: 321.968621 (2.x) vs 321.963871 (V3; the exact 32-gon value is 321.9639, so V3 is the
  more accurate). Extra collinear points change the contour vertex counts that
  `alignInsetContours` and `sidesInBaseOrder` correspond by, and the number of loft walls.
- `extrusions.slice` is `undefined` at runtime, slices are `{ contours }`, there is no
  `slice.fromSides`, and `extrudeFromSlices` has no `repair` pass (details in `core-068`).
- `expansions.expand({ delta: -3, corners: 'round' }, cube)` still throws
  `radius must be positive`; `expand` with `delta: 3, corners: 'round', segments: 16` on a
  20 mm cube gives the same volume (16959.2 mm³) in both. `expansions` exists at runtime as a
  compat alias of V3's `offset` but is missing from the typings (`core-067`).
- `minkowski` is not a runtime namespace in V3; `minkowskiSum` is a flat export (added in
  3.0.4-alpha.0 for geom3). The typings declare a `minkowski` namespace that the runtime lacks.
- 2D booleans and `geom2.toOutlines` change as described in `core-071`.

Unverified:

- Whether V3's `offsetFromPoints` with `corners: 'edge'` keeps one output vertex per input
  vertex (the contract `alignInsetContours` checks) on every section the parity fixture covers.
- Whether the cleanest fix for the collinear points is to simplify the projected section (for
  example `modifiers.generalize({ simplify: true })` on the `geom2`, if V3 supports it for
  geom2, or a local collinear-point pass) before snapping. V3's `generalizeGeom2` was not read.

## Proposed fix

1. Pass `expandHoles: true` to every geom2 `offset` in `fillet.js` (`:253`, `:773`) and in
   `fillet.spec.js` (`:485, 499, 529`). Add a spec that pins the 260 mm² result above, so a future
   version that changes the default again fails loudly.
2. After `project`, remove collinear and duplicate points from each outline (within
   `SECTION_EPSILON_MM`) before `snapSectionToSolid`, so contours have the corner counts 2.x
   gave. Prefer an upstream simplifier if one exists for geom2 in the target version; otherwise
   a small pure function in `fillet.js` with its own numeric spec.
3. `snapSectionToSolid` (`:186`): rebuild with the V3-native `geom2.create(outlines)` from the
   snapped outlines instead of the compat `create(sides)`.
4. Replace `extrusions.slice.fromSides(sidesOf(...))` with `slice.create(contours)` built from
   the inset rings in base order (the rings already are contours; `sidesInBaseOrder` may reduce
   to a check that contour order and start points match). Keep `slice.transform`.
5. `fillet.spec.js`: import `offset` and `minkowskiSum` (flat V3 API) instead of the
   `expansions` / `minkowski` namespaces; rewrite `:478, 509-510` with outlines.
6. Update the "V1 → V3" table in `docs/decisions/geometry-kernel.md` (lines 101-106) to the APIs
   actually used, through `core-073`.

## Affected files

- `src/core/kernel/fillet.js:119-131, 157-188, 245-258, 420-432, 705-720, 760-805`
- `src/core/kernel/fillet.spec.js:13, 25, 478-562`
- `e2e/docs/fillet-chamfer.docs.js:3` (import only, from `core-067`)

## Effort

M (one session); L if item 2 needs its own simplifier with full numeric coverage.

## Interaction model

n/a — no control changes; Fillet and Chamfer must produce the same solids.

## Documentation

n/a — no user-visible change (the decision doc update is `core-073`).

## Testing

- **V1 parity (the reference)**: `src/core/kernel/__fixtures__/modify.v1-reference.json` through
  `fillet.spec.js`, unchanged tolerances.
- **Hole regression**: a 20 × 20 × 10 block with a 6 mm square hole and with a round hole,
  filleted and chamfered on `z+` at r = 1 and r = 2: volume strictly less than the unfilleted
  block, bounding box unchanged (to 1e-9 mm), and the hole's rim cut, not filled.
- **Offset pin**: the 260 mm² case above, `toBeCloseTo(260, 6)`.
- **Section simplification**: a cube minus a 32-segment cylinder gives section outlines of 4 and
  32 points after simplification; degenerate inputs: coincident points, a zero-length side, two
  collinear sides meeting at 180°, a hole touching the outer outline.
- **Closure**: a filleted hexagonal prism exports with 0 open edges (the `io-006` case).
- E2E: `e2e/fillet-chamfer-operation.e2e.js` on Chromium, Firefox and WebKit at laptop and
  phone; regenerate `e2e/docs/fillet-chamfer.docs.js` media and confirm no visible change.
- Acceptance scenarios to re-drive: **4** (Boolean gating — the Operations toolbar's Fillet and
  Chamfer gating is next to it) and **11** (export a filleted part, 0 open edges).
- Closed-finding regression: re-run **`core-051`**'s repro (fillet and chamfer on a shape with a
  hole) and **`io-006`**'s repro (fillet on a hexagon rim, export, count open edges).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
