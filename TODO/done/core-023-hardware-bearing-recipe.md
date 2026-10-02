---
title: "hardware.bearing composite recipe — no V1 source, spec table from published standard"
category: core
kind: feature
priority: medium
model: sonnet
milestone: M4
depends: [core-001]
status: done
---

> **What actually shipped.** Exactly the Proposed fix below, with one confirmed
> divergence from its own speculation: the TODO asked to "confirm the real
> wiring mechanism rather than guessing" for how the shared `tables` object
> reaches a composite recipe. It is **not** `registry.js` — that module only
> maps `'hardware.bearing': composite(0, bearing)`, exactly like the other
> three. The actual table-injection point is `src/core/kernel/index.js`'s
> `DEFAULT_TABLES` object, which every composite recipe's `evaluate`/`expand`/
> `evaluateOp` call reads; `bearingSpecs` was added there, alongside
> `boltSpecs`/`nutSpecs`/`washerSpecs`, plus a re-export at the bottom of that
> file. No new mechanism — the existing one, extended by one row, which is why
> no closed finding's repro needed re-running per this file's own Regression
> surface note. The recipe also grew one field beyond the Proposed fix's exact
> code: an optional `params.segments` passthrough (mirroring the precedent
> `hardware.bolt.js` already set, not washer's), added so the volume sanity
> check below could reproduce `core-003`'s spike at its own 64-segment
> tessellation assumption rather than the registry's 32-segment default. A
> pre-existing `registry.spec.js` assertion (`expect(registry['hardware.bearing']).toBeUndefined()`,
> filed under the fillet/chamfer "deliberately absent" test) was removed and
> replaced with a positive registration/dispatch/invisibility block, since that
> line would otherwise now assert something false.

## Goal

Register `hardware.bearing`, beside `hardware.bolt`/`nut`/`washer`, per
`docs/decisions/geometry-kernel.md`'s addendum (Finding 2, `TODO/core-003`'s own spike):
*"Bearing is composite, not native. Its geometry is an ordinary tube... It is
deliberately not registered yet... not infeasibility, but the absence of a real spec
table to verify against... It belongs beside Bolt/Nut/Washer as a composite recipe once
a spec table exists."* This task supplies that table and registers the recipe.

**There is no V1 source for this at any version.** `core-003` confirmed directly against
the vendored `jscad-hardware@1.1.0` source: *"There is no `Bearing` in `jscad-hardware`.
Its only factories are `Bolt`, `Washer` and `Nut`... a case-insensitive search for
'bearing' across the package returns nothing."* So unlike `hardware.nut`/`hardware.washer`
(diffed against real V1 output), this recipe has nothing to diff against — the same
situation `MetricWashers` was already in (`core-011`, no V1 table for metric washers
either), resolved there by transcribing a published standard and cross-checking two
independent sources rather than inventing numbers. This task does the same for bearings.

## The spec table — DIN 625 / ISO 15, cross-checked against two independent sources

Deep-groove ball bearings, three standard series (light-narrow 60xx, light 62xx, medium
63xx), 5 sizes each — the same three series most public bearing catalogs present
together, and the same series `core-003`'s own hand-typed spike case (`608`, ID 8 / OD
22 / thickness 7) already belongs to. That spike's own measured tube volume
(2305.363mm³ at 64 segments against an ideal 2309.071mm³) is a real, already-recorded
sanity check this task's own fixture-equivalent test should reproduce, not just trust.

| Bearing | Bore (mm) | OD (mm) | Width (mm) |
|---|---|---|---|
| 608  | 8  | 22 | 7  |
| 6000 | 10 | 26 | 8  |
| 6001 | 12 | 28 | 8  |
| 6002 | 15 | 32 | 9  |
| 6003 | 17 | 35 | 10 |
| 6004 | 20 | 42 | 12 |
| 6200 | 10 | 30 | 9  |
| 6201 | 12 | 32 | 10 |
| 6202 | 15 | 35 | 11 |
| 6203 | 17 | 40 | 12 |
| 6204 | 20 | 47 | 14 |
| 6300 | 10 | 35 | 11 |
| 6301 | 12 | 37 | 12 |
| 6302 | 15 | 42 | 13 |
| 6303 | 17 | 47 | 14 |
| 6304 | 20 | 52 | 15 |

Cross-checked against two independently-sourced tables, which agreed exactly on every
value: [igus's DIN 625 ball-bearing dimensions table](https://www.igus.eu/ball-bearings/wiki/ball-bearings-dimensions-table)
(608, 6000-6004) and [ISK's / Be-cu's 6200/6300-series bearing size charts](https://be-cu.com/blog/6200-6300-r-series-ball-bearing-dimensions-sizes-chart/)
(6200-6204, 6300-6304). This is the same "aggregate, cross-check two independent
sources" discipline `MetricWashers`' own module doc already used for ISO 7089 — follow
that file's own note about a *first* aggregated search giving a wrong nearby standard
(ISO 7093 bled into an ISO 7089 search there); no such bleed-in was found here, but
state that explicitly in the table's own module doc rather than silently, the same way
`washer-specs.js` does.

## Proposed fix

Mirror `hardware.washer.js` almost exactly — it is the closer template than
`hardware.nut.js`, because a bearing is structurally a `primitive.tube` with **no
conditional second part**: there is no V1 `fit`/`Hardware.Clearances` concept to
reproduce (V1 has no `Bearing` factory at all, so there is no `fit` parameter to port),
and `core-003`'s own spike already showed mating needs no dedicated `clearance` part —
`group.js`'s `snap`/`align` work directly against the bearing's own tube bounds
(*"Assembly mating is bounding-box frame arithmetic... verified against a 608 bearing
mated to a Ø8×40 shaft"*). So the recipe is simpler than `washer`, not just structurally
similar to it:

```js
export function bearing(params, tables) {
  const { spec, center } = params
  const entry = tables.bearingSpecs[spec]
  if (!entry) {
    throw new Error(`hardware.bearing: unknown spec "${spec}", expected one of ` +
      Object.keys(tables.bearingSpecs).join(' | '))
  }
  return [{
    id: 'bearing',
    op: 'primitive.tube',
    params: {
      diameter: entry.odMm,
      innerDiameter: entry.boreMm,
      height: entry.widthMm,
      ...(center !== undefined ? { center } : {}),
    },
    name: 'bearing',
  }]
}
```

No `hidden` part, no `fit` param, no second record — a one-record composite, the
simplest of the four `hardware.*` recipes. `tables/bearing-specs.js` holds the table
above as `bearingSpecs` (flat, one series merge, same shape `washerSpecs` presents),
typed with a `BearingSpec` JSDoc typedef (`boreMm`, `odMm`, `widthMm`).

## Affected files

- `src/core/kernel/tables/bearing-specs.js` (new) — the spec table above, with the
  module doc explaining both series naming and the "no V1 source, published standard,
  cross-checked" provenance, per `washer-specs.js`'s own convention for its
  no-V1-source `MetricWashers` half.
- `src/core/kernel/recipes/hardware.bearing.js` (new) — the recipe per Proposed fix.
- `src/core/kernel/recipes/hardware.bearing.spec.js` (new) — see Testing.
- `src/core/kernel/registry.js` — import and register `'hardware.bearing':
  composite(0, bearing)`, alongside the existing three `hardware.*` rows (~line 795-805);
  thread `bearingSpecs` into whatever table-injection mechanism the other three
  recipes already use (check how `nutSpecs`/`washerSpecs`/`FIT_CLEARANCE_MM` are wired
  into their `composite(...)` calls — likely a shared `tables` object passed to every
  composite recipe, confirm and match it exactly rather than inventing a second
  wiring path).
- `src/core/kernel/registry.spec.js` — confirm the new op is registered and dispatches.
- No `library.js`/Library-panel change: `core-010`'s own note already confirmed
  `buildRows` filters registry keys to `op.startsWith('primitive.')`, so
  `hardware.bearing` is invisible to the Library panel exactly like
  `hardware.bolt`/`nut`/`washer` already are, with no new UI task implied by this one.

## Interaction model

n/a — same deferral every other `hardware.*`/`kit.*` composite recipe has used
(`core-010`, `core-011`, `core-012`): no UI surface, not reachable from the Library
panel per the `buildRows` filter above. Reachable only through the command layer
(MCP/scripted document edits) until a future UI task claims it, the same status
`hardware.bolt`/`nut`/`washer` have had since `core-001`.

## Documentation

n/a — no user-visible control exists yet, same reasoning as Interaction model.

## Effort

S. This is the simplest of the four `hardware.*` recipes (one record, no conditional,
no `fit` table) — the real cost is transcribing and cross-checking the spec table
(already done in this file) and wiring one more `composite(0, ...)` entry into a
pattern three prior recipes already established, not new mechanism.

## Testing

`src/core/kernel/recipes/hardware.bearing.spec.js` (Vitest):

- One case per spec-table row (16 total) asserting the expanded `primitive.tube`
  record's `diameter`/`innerDiameter`/`height` match the table exactly.
- **No V1 fixture diff is possible** (no V1 source exists) — instead, a **geometric
  sanity check** reproducing `core-003`'s own spike measurement: build `608` through
  the real fold (not just the record shape) and assert its volume is within tolerance
  of the ideal tube volume `π·((odMm/2)² − (boreMm/2)²)·widthMm`, and specifically
  close to the `2305.363mm³` `core-003`'s spike already measured at 64 segments — if
  this doesn't land close to that already-recorded number, the spec table or the
  tessellation segment count has drifted from what was spiked, and that's worth
  surfacing rather than silently accepting a different volume.
- Degenerate: unknown `spec` throws, naming the valid options.
- `center` param forwarding, mirroring `hardware.washer.spec.js`'s own equivalent case.
- `registry.spec.js`: confirm `hardware.bearing` is registered, dispatches through
  `composite(0, bearing)`, and is *not* visible to `library.js`'s `buildRows` (the same
  assertion `core-010`'s own spec already makes for `hardware.nut`, extended to cover
  this new op too — a regression check on the filter itself, not just this recipe).

No `*.e2e.js` — no UI surface, per Interaction model above, same reason
`hardware.bolt`/`nut`/`washer` shipped without one.

**Acceptance scenarios**: none directly — kernel-only, matching `core-010`/`core-011`'s
own "no acceptance scenario moves on this task alone" reasoning (no UI surface yet).

**Regression surface**: this is a fourth `hardware.*` composite registered through the
same `composite(0, ...)` fold path `core-010`/`core-011`/`core-012` already exercised —
not a new pipeline shape, so no closed finding's repro needs re-running on that ground
alone. If the table-injection wiring step above turns out to need a *new* mechanism
(rather than slotting into the existing one), reconsider this and re-run `ui-010`'s
seven-row Library-panel repro the way `core-010` did, on the same "a new registry
addition is a second chance to trip the panel filter" reasoning.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
