---
title: "JSCAD V3 switch: geom2 is stored as outlines, not sides, and 2D booleans use Martinez"
category: core
kind: feature
priority: low
model: opus
milestone: deferred — JSCAD V3 switch, not on the current roadmap
depends: [core-066, core-067]
status: deferred
---

**Deferred 2026-10-17** with its umbrella, `core-066`.

## Goal

Every 2D profile the kernel builds (gear, ring, rack, worm and bevel sections, sketch regions,
rounded-rectangle frames, primitive profiles) has the same outline, area, vertex count and hole
structure under V3 as under 2.13.0, and the code that walks a `geom2` by sides or points still
reads it in an order it can rely on. Done means the gear and sketch parity specs below pass on the
`core-066` branch with their existing tolerances.

## Current behaviour (2.13.0)

A `geom2` is `{ sides: [[a, b], ...], transforms }`. `geom2.toSides` returns the stored sides;
`geom2.toOutlines` *computes* closed outlines from them; `geom2.toPoints` returns each side's
start point, rotated so that `toPoints(fromPoints(P))` equals `P`; `geom2.create(sides)` stores
sides as given. 2D booleans run the same BSP code path as 3D.

Call sites that depend on this:

- `src/core/kernel/registry.js:692-696` — a sketch region is built by `booleans.union` /
  `booleans.subtract` of `primitives.polygon` outlines, then refused if
  `geometries.geom2.toSides(shape).length === 0`.
- `src/core/kernel/registry.js:957, 961, 1009, 1029` — gear, rack, worm and bevel sections via
  `geometries.geom2.fromPoints(outline)`.
- `src/core/kernel/registry.js:985-992` — the ring gear: `geom2.toPoints(primitives.circle(...))`
  for the rim, hand-built sides for rim and reversed hole, then `geometries.geom2.create(sides)`.
- `src/core/kernel/registry.js:1083, 1169, 1281` — `geom2.toSides(profile)` to find the profile's
  outer radius and to count vertices against `TWIST_VERTEX_BUDGET`; `:1281` also feeds the bevel
  loft (`core-068`).
- `src/core/kernel/registry.js:1207` — `circleSidesMm` turns `geom2.toPoints(primitives.circle())`
  into sides, relying on point order.
- `src/core/kernel/registry.js:1761-1770` — `boolean.union/subtract/intersect` also run on 2D
  profiles (the gear bore is a 2D subtract: `src/core/kernel/recipes/gear.spur.js:13`; the board
  frame subtracts two rectangles: `src/core/kernel/recipes/kit.boardFrame.js:38`).
- `src/core/kernel/recipes/rpi-recipe-kit.js:401-410` — 2D `booleans.subtract` of two
  `primitives.roundedRectangle`s.
- `src/core/kernel/__fixtures__/tessellationCases.js:161` — serialises a 2D case with
  `geom2.toSides`.
- Specs that compare outlines point by point: `src/core/kernel/recipes/gear.spur.spec.js:220,
  312, 331`, `gear.rack.spec.js:136`, `gear.bevel.spec.js:99`.

## Expected V3 behaviour

Verified (3.0.7-alpha.0 source, 2026-10-17):

- A `geom2` is `{ outlines: [[p0, p1, ...], ...], transforms }` (`geometries/geom2/create.js`).
- `geom2.toOutlines` returns the stored outlines (no recomputation).
- `geom2.toSides` is *derived* from the outlines (each outline's consecutive point pairs).
- `geom2.toPoints` concatenates every outline's points in stored order, with **no rotation**.
- `geom2.fromPoints(points)` stores `[points]` (dropping a repeated closing point).
- The compat `geometries.geom2.create(sides)` calls `geom2.fromSides(sides)`, which links sides
  into outlines by shared endpoints (keyed by `point.toString()`). The V3-native
  `geom2.create(outlines)` takes outlines, not sides.
- 2D booleans (`unionGeom2`, `subtractGeom2`, `intersectGeom2`) use a vendored Martinez polygon
  clipper (`operations/booleans/martinez`), new in 3.0.0-alpha.0.
- `primitives.circle`/`roundedRectangle`/`polygon` keep their 2.x option names.

Unverified (must be measured by this task's tests):

- Whether Martinez output for the boolean cases above has the same outline count, winding,
  start point and vertex count as 2.x. Any spec that compares points by index can fail on a
  changed start point even when the shape is identical.
- Whether `geom2.toPoints(primitives.circle(...))` starts at the same angle and winds the same
  way in V3 (`circleSidesMm` and the ring rim depend on it).
- Whether `fromSides` handles a zero-length side (both ends equal) the way 2.x `create` did.

## Proposed fix

1. Replace the compat `geometries.geom2.create(sides)` in `registry.js:992` with the V3-native
   `geom2.create([rimOutline, holeOutline])` (the hole already reversed), so the ring no longer
   depends on side-linking.
2. Where the code needs an outline, read outlines: `circleSidesMm` (`:1207`) and the radius
   scans (`:1083, :1169, :1281`) can use `geom2.toOutlines` directly. Keep `toSides` only where
   sides are the real unit (`registry.js:696`'s emptiness test can become
   `toOutlines(shape).length === 0`).
3. Make the point-by-point spec comparisons start-point-independent where the start point is not
   part of the contract (rotate to the minimum-angle point, or compare as a cyclic sequence),
   and keep them exact where it is (a gear tooth's phase is a contract: `gear.pair` meshing
   depends on it, so assert the phase separately).
4. For each 2D boolean site, assert area and outline/hole count against the 2.x numbers
   recorded before the switch (run the specs on `main` first and save the numbers in the task's
   retirement note).
5. Update `tessellationCases.js:161` to serialise outlines.

## Affected files

- `src/core/kernel/registry.js:692-696, 957-1029, 1083, 1169, 1207, 1281, 1761-1770`
- `src/core/kernel/recipes/rpi-recipe-kit.js:401-410`
- `src/core/kernel/__fixtures__/tessellationCases.js:161`
- `src/core/kernel/recipes/gear.spur.spec.js`, `gear.rack.spec.js`, `gear.bevel.spec.js`,
  `gear.ring.spec.js`, `kit.boardFrame.spec.js`, `src/core/kernel/tessellation.spec.js`

## Effort

M (one session). Most of the time is item 4, measuring Martinez against 2.x.

## Interaction model

n/a — no control changes; a sketch or gear must look and measure the same.

## Documentation

n/a — no user-visible change.

## Testing

- **V1 parity (the reference)**: `src/core/gear/__fixtures__/v1-gears.json` and
  `v1-internal-rack.json` through the existing gear specs (`gear.spur.spec.js`,
  `gear.ring.spec.js`, `gear.rack.spec.js`, `gear.bevel.spec.js`, `gear.worm.spec.js`,
  `src/core/gear/*.spec.js`) at their stated tolerances, unchanged.
- **2.x parity**: for each 2D boolean site, area within 1e-6 mm² relative and the same
  outline and hole count as 2.13.0 (numbers captured on `main` before the switch).
- **Degenerate cases**: a sketch whose holes cover the solid (still refused with the
  `registry.js:697` message); a hole touching the outline; coincident outlines; a ring gear whose
  rim and root circles are close; a profile with a repeated closing point.
- **Recipe parity**: `src/core/kernel/recipes/__fixtures__/raspberrypi.*.v1-reference.json`
  via the `raspberrypi.*.spec.js` files that use `rpi-recipe-kit.js`'s rounded frame.
- E2E: `e2e/sketch-primitive.e2e.js` (a solid with a hole, extruded) on Chromium, Firefox and
  WebKit at laptop and phone, since sketch regions are kernel output that reaches the viewport.
- Acceptance scenarios to re-drive: **9** (sketch solid and hole, extrude, subtract) and **4**
  (boolean gating, for 2D subtract via recipes).
- Closed-finding regression: re-run `sketch-005`'s repro (select, edit, delete an outline) since
  it touches sketch regions.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
