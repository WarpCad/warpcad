---
title: hardware.nut composite recipe, dimensionally diffed against V1
category: core
kind: feature
priority: medium
model: sonnet
milestone: M2
depends: [core-001]
status: done
---

> **What actually shipped (retirement note, 2026-09-09):** implemented as scoped, one
> single-record `primitive.hexagon` expansion, no group, no translate. The one thing
> this file left unresolved — the V1→V3 centring difference (V1 builds a nut base-at
> `z=0`, matching `Parts.Hexagon`'s convention; V3 centres it, matching every other
> `primitive.*` row `library.js` places, per this file's own "center passed straight
> through" instruction) — meant the dimensional diff compares **size**
> (`bounds[1]-bounds[0]` per axis) and volume against the V1 reference fixture, not raw
> bounding-box position, since the two are deliberately not co-located. Documented in
> `hardware.nut.js`'s own module doc. `fit` was made **required, with no default** —
> V1's own `Hardware.Nut(nut, fit)` has none either (unlike `Bolt`'s `fit = fit ||
> 'loose'`), so an omitted fit throws the same class of error an unknown one does,
> rather than inventing a default V1 never had. The dimensional diff covers three
> cases, not two: `m4`/loose, `1/4 hex`/close (both tables, per this file's own Testing
> section), plus `m4`/tap — the one fit class with a **negative** clearance delta,
> added so the arithmetic's sign is verified against real V1 output rather than just
> asserted. Also confirmed directly (not assumed): `src/core/library.js`'s `buildRows`
> filters registry keys to `op.startsWith('primitive.')`, so `hardware.nut` — like
> `hardware.bolt` before it — stays invisible to the Library panel regardless of `ui`
> metadata until an explicit Hardware Library section is built to read composite ops
> too. That section is still not part of this task, per this file's own Interaction
> model note.

## Goal

Add `hardware.nut` as a composite recipe (`Initial design.md` §6's "Kit part"/Hardware
Creation row), following the exact composite-recipe pattern `core-001` proved with
`hardware.bolt` — expand `params` into plain `primitive.*` op records, replay through
the same fold, no direct `@jscad/modeling` calls in the recipe itself. Confirmed
directly against `jscad-hardware@1.1.0` source (not reconstructed from docs), same
standard `core-001`/`core-003` already set:

```js
// jscad-hardware.jscad:81-83
Nut: function Nut(nut, fit) {
  return Parts.Hexagon(nut[1] + Hardware.Clearances[fit], nut[2]);
}
```

`nut` is a 4-tuple `[F, C, H, D]` — width across flats, width across corners, height,
basic thread diameter — keyed from a size table. Unlike `Bolt`, `Nut` returns one bare
CSG, not a `Group`: no head/thread/tap split, just a single hexagonal prism whose
diameter is the across-corners width (`nut[1]`) plus a **fit clearance delta**, and
whose height is `nut[2]`.

**Real table gap, confirmed by reading `metric.jscad`/`imperial.jscad` directly**
(mirrors `core-001`'s own `"m2.5 socket"` finding — state it the same way, don't
paper over it):

- `MetricNuts` has exactly **one** entry: `'m4': [7, 8.1, 3.2, 4]`. (`metric.jscad`'s
  own `/* exported */` header even lists `MetricNuts` but the object holds only this
  one key.)
- `ImperialNuts` has exactly **one** entry: `'1/4 hex': [11.113, 12.8, 5.56, 6.35]`.

Do not invent additional sizes. Port exactly these two table entries; if more sizes are
needed later, that's a table-only follow-up, not a reason to block this task.

**`Hardware.Clearances` is a shared, size-independent fit table** (`jscad-hardware.jscad:112-116`):
`{ tap: inch(-0.049), close: inch(0.007), loose: inch(0.016) }` — a flat mm delta added
to a diameter, added *once* here for the nut and again by `core-011`'s washer recipe
(which needs the identical table for its own clearance cylinder). This is different in
shape from `hardware.bolt`'s own `fitDiameterMm`, which is a per-spec absolute diameter,
not a shared delta — don't conflate the two tables or reuse `bolt-specs.js`'s shape.

## Interaction model

n/a — this lives entirely in `src/core/kernel/`, no UI surface exists to gate on yet.
Feeds `ui-013`'s Library panel once that task lands (same relationship `core-001`'s
`hardware.bolt` had to `ui-010` before it existed).

## Documentation

n/a for end-user docs — no control exists yet to place a Nut. Documentation lands with
`ui-013`, the same precedent `core-001`'s own Documentation section set for `hardware.bolt`.

## Affected files

- `src/core/kernel/tables/fit-clearances.js` (new — shared `FIT_CLEARANCE_MM` table;
  create it here since this task lands first per dependency order, `core-011` imports it)
- `src/core/kernel/tables/nut-specs.js` (new — `MetricNuts['m4']`, `ImperialNuts['1/4 hex']`
  ported to millimetre-named fields, mirroring `bolt-specs.js`'s renaming convention)
- `src/core/kernel/recipes/hardware.nut.js` (new)
- `src/core/kernel/recipes/hardware.nut.spec.js` (new)
- `src/core/kernel/recipes/__fixtures__/hardware.nut.v1-reference.json` (new)
- `scripts/generate-v1-nut-fixture.cjs` (new, mirrors `generate-v1-bolt-fixture.cjs`)
- `src/core/kernel/registry.js` (register `'hardware.nut': composite(0, nut)`)

## Proposed fix

One-record expansion: `primitive.hexagon` with `diameter = entry.acrossCornersMm +
FIT_CLEARANCE_MM[fit]`, `height = entry.heightMm`, `center` passed straight through
(same "one record, not primitive + translate" shape `library.js`'s `paramsForDrop`
already established for base primitives — a nut needs no offset, so don't add a
translate record it doesn't need). No group, no union — V1 doesn't build one either.

Validate `spec` and `fit` the same way `hardware.bolt.js` does: an unknown key throws a
named error listing the valid keys, not a silent `NaN` diameter.

Dimensional diff: write `scripts/generate-v1-nut-fixture.cjs` to run the real
`Hardware.Nut(MetricNuts['m4'], 'loose')` V1 call and dump its bounding-box/hexagon
diameter, then assert the V3 recipe's output matches within tolerance — same mechanism
`core-001` used for the bolt, not a fresh comparison technique.

## Effort

S (< 1hr) — one shape, no branching, no group; simpler than `hardware.bolt`.

## Testing

Vitest, `src/core/kernel/recipes/hardware.nut.spec.js`, plain Node. Numeric-tolerance
(`toBeCloseTo`) diff against real V1 output for **both** `MetricNuts['m4']` and
`ImperialNuts['1/4 hex']` — covering both tables stands in for the branch coverage a
bolt-style head-type split would otherwise need, since this recipe has no branch of its
own. Degenerate cases: unknown `spec` key, unknown `fit` key — both must throw.

No `*.e2e.js` — no UI surface exists for this task to gate on, stated explicitly per
`TODO/README.md`'s rule, same as `core-001`'s own precedent.

Acceptance scenarios: none directly pass/fail on this task alone — it feeds scenario 3
once `ui-013` exists to place a Nut in the running app. Say so explicitly rather than
naming a scenario this task can't itself move.

No closed finding's subsystem is extended here in a way that needs re-running — this
adds a new recipe file and one registry entry, it doesn't change `group.js` or any
already-tested registry behavior.
