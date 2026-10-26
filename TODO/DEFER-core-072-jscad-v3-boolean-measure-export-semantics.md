---
title: "JSCAD V3 switch: boolean, measurement and generalize edge cases; polygon and triangle counts; export"
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

The kernel's error paths, its edge cases and its export output behave the same under V3: an
operation that 2.x refused is still refused with a WarpCad message (not a silent `undefined`
downstream), counts that specs pin are re-baselined only where the shape is provably the same,
and STL/OBJ exports stay closed. Done means the specs below pass on the `core-066` branch and the
export benchmarks are re-recorded.

## Current behaviour (2.13.0)

- `booleans.union/subtract/intersect` with no operands throw `wrong number of arguments`; mixed
  types throw `only unions of the same type are supported` (and the subtract/intersect
  equivalents).
- `measurements.measureArea/measureVolume/measureEpsilon/measureBoundingBox` with no arguments
  throw `wrong number of arguments`. `modifiers.generalize` on an unsupported value throws
  `invalid geometry`.
- Call sites that pass a computed list and rely on that:
  - `src/core/kernel/group.js:499-503` `combine`: `booleans.union(solids)` then
    `booleans.subtract(united, ...group.holes)`.
  - `src/core/kernel/measure.js:137-138` `booleans.union(geometries.map(toGeom3))`;
    `:330` `booleans.intersect(toGeom3(a), toGeom3(b))`.
  - `src/core/kernel/split.js:448-451` (pins, holes, sockets; each guarded by a length check).
  - `src/core/kernel/registry.js:1761-1770` `boolean.union/subtract/intersect` on `inputs`.
  - `src/core/kernel/recipes/rpi-recipe-kit.js:576` (guarded by `value.length === 1`, not `0`).
  - `src/core/kernel/transport.js:89-103` `packSolid` catches the throw from `geom3.toPolygons`
    on a malformed solid ("an empty boolean result, say") and packs whatever polygons it has, so
    `solidsForExport` can refuse it by name.
- Export: `src/core/export.js:222-225` refuses a solid with no polygons; `:315-316` serializes
  (`stlSerializer.serialize({ binary: true })`, `objSerializer.serialize({ triangulate: true })`),
  and the serializers run `generalize({ snap: true, triangulate: true })` internally; `:319`
  counts the written triangles (`countWrittenTriangles`, `:264`). `src/core/kernel/watertight.js:146, 259` use
  `measurements.measureEpsilon` to size the T-junction repair (`io-004`).
- Specs that pin exact counts, for example `src/core/kernel/recipes/gear.spur.helical.spec.js:269`
  (`toPolygons(...).length`), and export specs that pin triangle counts.

## Expected V3 behaviour

Verified (3.0.7-alpha.0, source read and run in Node, 2026-10-17):

- Booleans run `coalesce` on their arguments: nested arrays are flattened and **`null` and
  `undefined` operands are silently dropped**; with nothing left they **return `undefined`**
  instead of throwing (ran `union([])`: 2.13.0 throws, V3 returns `undefined`). Messages changed
  to `union arguments must be the same geometry type` and `union unsupported geometry type` (the
  latter throws where 2.x returned the geometry).
- `measureArea`, `measureVolume`, `measureEpsilon` no longer throw on zero arguments, and accept
  `path3` and `slice`. `generalize` returns an unsupported value unchanged instead of throwing.
- `geom3.toPolygons`, `geom3.create`, `poly3.create` keep the 2.x data shape. `poly3.create` no
  longer empties a polygon with fewer than 3 vertices.
- The BSP tree sources (`operations/booleans/trees/*`) differ textually from 2.13.0. On the cases
  run, the 3D results were identical: cube − 32-segment cylinder, 104 polygons and
  6439.277424 mm³ in both; two overlapping cubes, 18 polygons and 1875 mm³ in both; that solid's
  `generalize({ snap: true, triangulate: true })` (what the STL serializer writes) gave 292
  triangles in both.
- The serializers' `serialize` still returns `[ArrayBuffer]` (binary STL) / `[string]` (OBJ).

Unverified:

- Whether any WarpCad path can actually reach a boolean with an empty or `null` operand list.
  `combine` gets its names from `resolvePieces`, which may already refuse an empty selection; not
  traced.
- Whether 3D boolean output is identical on the real catalogue (Pi boards with drilled holes,
  bolts with threads, gears). Only the two simple cases above were run.
- Whether `transport.js`'s catch still sees the same failure on the V3 equivalent of "an empty
  boolean result" (V3 returns `undefined` for no operands, which `toPolygons` also throws on, so
  the outcome is probably the same).

## Proposed fix

1. Add one guard in WarpCad, not at each call site: a small `requireGeometry(result, op)` (or the
   check inside the registry's `native`/`subPartNative` wrapper) that turns an `undefined` kernel
   result into a named WarpCad error, so a dropped operand fails as loudly as it did in 2.x.
   Apply it to `group.js:501-503`, `measure.js:138, 330`, `registry.js:1761-1770`,
   `rpi-recipe-kit.js:576`.
2. Never pass `null` / `undefined` into a boolean on purpose: assert operands before the call in
   the same helper (V3 would drop them silently).
3. Re-check every spec that matches a kernel error message (`grep -rn "toThrow(/" src` for JSCAD
   wording); WarpCad's own messages (`boolean.union`, `fillet ...`) are unaffected.
4. Re-baseline pinned polygon and triangle counts **only** after volume, bounding box and closure
   are shown equal for the same case; record old and new counts in the spec comment.
5. Re-run `bench/export-benchmark.mjs` and `bench/watertight-equivalence.mjs` (`:31` import from
   `core-067`) and add the results under `bench/results/` with the V3 version in the file name.

## Affected files

- `src/core/kernel/group.js:499-503`, `src/core/kernel/measure.js:130-140, 325-335`,
  `src/core/kernel/split.js:445-452`, `src/core/kernel/registry.js:1755-1775`,
  `src/core/kernel/recipes/rpi-recipe-kit.js:570-580`, `src/core/kernel/transport.js:86-104`
- `src/core/export.js:215-230, 305-320`, `src/core/kernel/watertight.js:140-150, 255-262`
- specs with pinned counts (find with `grep -rn "toPolygons(.*).length\|triangleCount" src`)
- `bench/export-benchmark.mjs`, `bench/watertight-equivalence.mjs`, `bench/results/`

## Effort

M (one session).

## Interaction model

n/a — no control changes.

## Documentation

n/a — no user-visible change.

## Testing

- **Edge cases**, one spec each: a boolean whose operand list resolves empty is refused with a
  WarpCad message naming the op; a `null` operand is refused, not dropped; `measure` of no bodies.
- **Recipe parity (the reference)**: every `src/core/kernel/recipes/__fixtures__/*.v1-reference.json`
  through its `*.spec.js` (bolts, nuts, washers, screws, Pi boards, cameras, displays,
  accessories), unchanged tolerances; `src/core/kernel/recipes/raspberrypi.drilled-boards.spec.js`
  (drilled holes are booleans).
- **Export**: `src/core/export.spec.js`, `src/core/exportJob.spec.js` (0 open edges for every
  extrusion method), `src/core/kernel/watertight.spec.js`, `src/core/kernel/transport.spec.js`
  (packing an empty or malformed solid still reaches `solidsForExport`'s named refusal).
- **Counts**: `gear.spur.helical.spec.js:269` and every other pinned count, re-baselined per item 4.
- E2E: `e2e/export-ui.e2e.js`, `e2e/boolean-operations.e2e.js`, `e2e/rpi-mounting-holes.e2e.js`
  on Chromium, Firefox and WebKit (kernel output, export bytes and persistence).
- Acceptance scenarios to re-drive: **4** (boolean gating), **5** (hidden-part boolean, bolt tap
  clearance), **11** (export a solid and open it elsewhere), **26** (import an STL and subtract a
  primitive from it).
- Closed-finding regression: **`io-004`** (STL/OBJ open edges, T-junctions) and **`io-005`**
  (glTF render-mesh open edges) repro steps; **`core-034`** (drilled Pi mounting holes) and
  **`core-020`** (a composite absorbs earlier bodies — a combine/union path).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
