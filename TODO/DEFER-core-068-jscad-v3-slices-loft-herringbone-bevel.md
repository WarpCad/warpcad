---
title: "JSCAD V3 switch: slices moved and changed shape — sketch loft, herringbone gear, bevel gear"
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

The three places in `registry.js` that build solids from slices produce the same solids under
V3: the sketch **Loft** extrusion, the **herringbone** gear, and the **bevel** gear (with and
without a hub). Done means their specs pass on the `core-066` branch at their existing
tolerances, and every such solid is still closed (no open edges) at export.

(`fillet.js` also uses slices; that is `core-069`. `bench/ai-007-analysis.mjs:68-70` uses the
same API and is updated here, since it is a copy of the loft path.)

## Current behaviour (2.13.0)

Slices live under `extrusions.slice` and are `{ edges: [[v0, v1], ...] }` with 3D vertices.

- `src/core/kernel/registry.js:772-777` (Loft): `extrusions.slice.fromPoints(points3d)` per ring,
  then `extrusions.extrudeFromSlices({ numberOfSlices, capStart, capEnd, callback }, sections[0])`.
- `src/core/kernel/registry.js:1116-1135` (herringbone): `extrusions.slice.fromSides(sides)` from
  `geom2.toSides(profile)`, then `extrudeFromSlices` whose callback transforms the base slice with
  `extrusions.slice.transform(matrix, slice)`. The comment at `:1123` relies on `repair: true`
  being upstream's default.
- `src/core/kernel/registry.js:1228-1230` (`sliceAtMm`): `extrusions.slice.create(edges)` from
  explicit side pairs, so two slices built from the same sides share vertices bit for bit.
- `src/core/kernel/registry.js:1295-1319` (bevel): two `sliceAtMm` slices lofted by
  `extrudeFromSlices`; for a hub, a second loft plus `extrusions.slice.toPolygons(...)` for the
  ring cap, joined with `geom3.create([...])` **without a boolean** — correct only because the
  pieces share vertices exactly.
- `bench/ai-007-analysis.mjs:68-70`: `extrusions.slice.fromPoints` + `extrudeFromSlices`.

## Expected V3 behaviour

Verified (3.0.7-alpha.0 source, 2026-10-17):

- **`extrusions.slice` is `undefined` at runtime.** The compat layer in `src/index.js` sets
  `extrusions.slice = geometries.slice`, but its own `geometries` object has no `slice` key, so
  every `extrusions.slice.*` call above throws a TypeError. Slices are the top-level `slice`
  export (also `geometries.slice` in the typings only).
- A slice is now `{ contours: [[v0, v1, ...], ...] }` (`geometries/slice/create.js`), not edges.
  `slice.create(contours)`, `slice.fromVertices(vertices)` (one contour; 2D points are lifted
  to z = 0), `slice.fromOutlines(outlines)` (2D outlines → contours at z = 0),
  `slice.transform(matrix, slice)`, `slice.toEdges`, `slice.toPolygons`, `slice.reverse`. There is
  **no `fromPoints` and no `fromSides`**.
- `extrudeFromSlices` no longer has a `repair` option: 2.x ran `repairSlice(base)` by default;
  3.0.7-alpha.0 destructures only `numberOfSlices, capStart, capEnd, close, callback`, although
  its JSDoc still documents `repair`. It now rejects a slice with no contours
  ("must return slices with one or more contours").
- `extrudeWalls` still pairs slice *n*'s edges with slice *n + 1*'s by index (repartitioning when
  counts differ), so the "walled vertex for vertex" assumption in `src/sketch/resample.js:5`
  holds, provided the contours keep their order and start points.
- `slice.toPolygons` triangulates caps through earcut with a polygon hierarchy (outer contour +
  holes).

Unverified:

- Whether V3 cap triangulation and wall order produce the same polygon count as 2.x (counts are
  asserted in some specs, for example `gear.spur.helical.spec.js:269`).
- Whether dropping `repairSlice` matters for any of these inputs. The herringbone and bevel bases
  come from clean profiles; the loft rings come from `loftRings`' resampling. If 2.x's repair
  was closing tiny gaps, a V3 solid may export with open edges.
- Whether the bevel hub's no-boolean join still closes when the ring cap is triangulated by V3's
  `slice.toPolygons` (it must share every boundary vertex with the two lofts).

## Proposed fix

1. Import `slice` from the V3 API (flat export) in `registry.js` and the bench script.
2. Loft (`:772-777`): `slice.fromVertices(ring.pointsMm.map(([x, y]) => [x, y, ring.zMm]))`.
3. Herringbone (`:1116`): `slice.fromOutlines(geom2.toOutlines(profile))` for the base; keep
   `slice.transform` in the callback. Delete the `repair` comment at `:1123`, and add an explicit
   check (a spec, see Testing) that the base has no gaps instead of relying on a repair pass.
4. `sliceAtMm` (`:1228-1230`): build **contours**, not edges. The callers already know the outer
   loop and the hole loop separately (`[...sides, ...holeSides]`), so pass
   `slice.create([outerContour, holeContour])` with the hole wound the other way, and keep the
   "coordinates copied, never computed" rule so shared vertices stay bit-identical.
5. Bevel hub (`:1318`): `slice.toPolygons(sliceAtMm(...))` for the ring cap; then verify the
   join is closed (Testing). If V3's earcut cap introduces a vertex the lofts lack, fall back to
   building the ring cap as a two-contour slice loft of zero height, or to one `booleans.union`,
   and record the choice.
6. `bench/ai-007-analysis.mjs:68-70`: same change as the loft.

## Affected files

- `src/core/kernel/registry.js:765-777, 1110-1135, 1219-1230, 1275-1319`
- `bench/ai-007-analysis.mjs:30, 68-70`
- specs: `src/core/kernel/registry.spec.js` (loft), `src/core/kernel/recipes/gear.spur.helical.spec.js`,
  `gear.bevel.spec.js`, `gear.bevelPair.spec.js`, `src/core/exportJob.spec.js`

## Effort

M (one session).

## Interaction model

n/a — no control changes; a lofted sketch and both gears must look and measure the same.

## Documentation

n/a — no user-visible change.

## Testing

- **Parity with 2.x** (capture on `main` first): volume within 1e-6 relative, bounding box
  within 1e-9 mm, for a 3-slice loft, a herringbone spur gear (`gear.spur.helical.spec.js`'s
  `BASE` with `herringbone`), a bevel gear with bore, and one with a hub.
- **Closure**: every one of those solids has zero open edges after `makeWatertight`
  (`src/core/kernel/watertight.js`) and in an STL export (`exportJob.spec.js` already asserts 0
  open edges for every extrusion method, including Loft; it must still pass).
- **Bit-identical sharing**: the bevel's small/large slices and the hub's foot slice share vertex
  arrays exactly (`Object.is` on coordinates) where the code says they do.
- **Gear parity**: `gear.bevel.spec.js` and `gear.bevelPair.spec.js` (apex-coincident placement,
  face planes via `poly3.plane`) unchanged; `gear.spur.helical.spec.js:125-136` (herringbone with
  zero twist equals the plain gear) unchanged.
- **Degenerate**: a loft whose rings have different vertex counts (repartitioned walls); a
  slice with one contour of three points; a herringbone at the vertex budget limit.
- E2E: `e2e/sketch-airfoil.e2e.js` (the loft) on Chromium, Firefox and WebKit at laptop and phone.
- Acceptance scenarios to re-drive: **17** (airfoil and wing, the loft) and **11** (export, check
  the loft exports with 0 open edges).
- Closed-finding regression: `io-004` (STL/OBJ open edges) and `io-006` (open edges after a
  fillet on a non-axis-aligned rim) — re-run their repro steps on a lofted sketch and a bevel
  gear export.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
