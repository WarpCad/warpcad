---
title: hardware.washer composite recipe, dimensionally diffed against V1
category: core
kind: feature
priority: medium
model: sonnet
milestone: M2
depends: [core-001]
status: open
---

## Goal

Add `hardware.washer` as a composite recipe (`Initial design.md` §6), following
`core-001`'s composite-recipe pattern. Confirmed directly against real
`jscad-hardware@1.1.0` source:

```js
// jscad-hardware.jscad:56-79
Washer: function Washer(washer, fit) {
  var w = util.group();
  w.add(Parts.Tube(washer.od, washer.id, washer.thickness).color('gray'), 'washer');
  if (fit) {
    w.add(
      Parts.Cylinder(washer.od + Hardware.Clearances[fit], washer.thickness).color('red'),
      'clearance'
    );
  }
  return w;
}
```

Two-part group: a `washer` part (a Tube: `od`/`id`/`thickness`) always present, and an
optional `clearance` part (a solid cylinder of `od + Hardware.Clearances[fit]` diameter,
same `thickness`) emitted **only when `fit` is truthy** — this is the one real
conditional in the recipe and must be covered by a test, not just the happy path.

**Real table gap, confirmed by reading `metric.jscad`/`imperial.jscad` directly**: there
is **no `MetricWashers` table at all** in the vendored `jscad-hardware@1.1.0` —
`metric.jscad`'s own `/* exported */` header lists only `MetricBolts, MetricScrews,
MetricNuts`, no washer table. Only `ImperialWashers` exists (`imperial.jscad:54-70`):
`'1/4'`, `'1/4 fender'`, `'5/16'`. Also confirmed against the author's own current
`jscad-hardware@5.0.0` source (`~/src/jscad/jscad-hardware/metric.jscad`) and the
`jscad-hardware2` v1 tree — neither ever grew a `MetricWashers` table either, so there
is no V1 source to port from at any version, not just a gap in the vendored 1.1.0.

**Metric sizes are ported from the published ISO 7089 standard instead**, since there's
no V1 table to diff against. Confirmed against two independent sources (Engineer's Edge's
ISO 7089 table, cross-checked directly — an initial aggregated search result gave
slightly different M6/M8/M10 outer diameters that turned out to be bleed-in from the
ISO 7093/DIN 9021 "large washer" variant, not ISO 7089 itself):

| Size | id (mm) | od (mm) | thickness (mm) |
|---|---|---|---|
| m3  | 3.2  | 7  | 0.5 |
| m4  | 4.3  | 9  | 0.8 |
| m5  | 5.3  | 10 | 1.0 |
| m6  | 6.4  | 12 | 1.6 |
| m8  | 8.4  | 16 | 1.6 |
| m10 | 10.5 | 20 | 2.0 |
| m12 | 13   | 24 | 2.5 |

This changes the verification story for the metric half of the table, not just the
data: the imperial sizes still get a numeric-tolerance diff against real
`Hardware.Washer()` V1 output (there's a real function to call). The metric sizes have
no V1 function to call — they're checked by asserting the table's own `idMm`/`odMm`/`thicknessMm`
fields against the ISO 7089 values above, a spec-conformance check, not a V1-diff. State
this split explicitly in the spec file's test descriptions rather than letting one
`toBeCloseTo` block quietly cover two different kinds of claims.

**Divergence to make explicitly, not silently**: V1's `add()` call for `clearance`
doesn't mark it hidden — it's a normal, visible red part. This project's own
`hardware.bolt` port (`core-001`) already diverged from V1 by marking its analogous
`tap-*` clearance parts `hidden: true`, specifically because scenario 5 (hidden-part
boolean) needs a fastener's *real hole size*, not its rendered metal, to drive a
Subtract. A washer's `clearance` part is the same kind of geometry. Propose marking it
`hidden: true` here too — a deliberate, named divergence from V1's literal behavior,
mirroring the precedent already set, not a silent copy of V1's visible-by-default part.

## Interaction model

n/a — lives in `src/core/kernel/`, no UI surface exists yet. Feeds `ui-013`'s Library
panel once that task lands.

## Documentation

n/a for end-user docs — no control exists yet to place a Washer. Documentation lands
with `ui-013`.

## Affected files

- `src/core/kernel/tables/fit-clearances.js` (shared with `core-010` — reuse if it
  already exists; create it here if this task lands first)
- `src/core/kernel/tables/washer-specs.js` (new — `ImperialWashers['1/4']`, `'1/4
  fender'`, `'5/16'` ported from V1 to millimetre-named fields, plus `MetricWashers['m3'
  .. 'm12']` ported from the published ISO 7089 standard table above — same file, two
  provenances, both stated in the file's own header comment)
- `src/core/kernel/recipes/hardware.washer.js` (new)
- `src/core/kernel/recipes/hardware.washer.spec.js` (new)
- `src/core/kernel/recipes/__fixtures__/hardware.washer.v1-reference.json` (new)
- `scripts/generate-v1-washer-fixture.cjs` (new, mirrors `generate-v1-bolt-fixture.cjs`)
- `src/core/kernel/registry.js` (register `'hardware.washer': composite(0, washer)`)

## Proposed fix

Reuse the registry's existing `primitive.tube` op directly for the `washer` part
(outer/inner diameter, thickness) instead of reimplementing outer-minus-inner as a raw
boolean the way V1's own `Parts.Tube` helper did — `primitive.tube` already exists and
is tested. Emit one `primitive.cylinder` record for `clearance`, `hidden: true` per the
divergence above, **only when `params.fit` is provided** — an absent `fit` must produce
a one-record expansion (`washer` alone), not a clearance cylinder built from an
`undefined` lookup. Group the two into a named multi-part expansion the same way
`hardware.bolt.js`'s `tap` union groups its own hidden parts, so the Library/inspector
can address `washer`/`clearance` as named sub-parts consistent with `Group.pick` (§6).

Dimensional diff: `scripts/generate-v1-washer-fixture.cjs` runs the real
`Hardware.Washer(ImperialWashers['1/4'], 'loose')` and `Hardware.Washer(ImperialWashers['1/4'],
undefined)` V1 calls (both branches) and the V3 recipe's output is asserted against both
within tolerance. This only covers the imperial sizes — there's no V1 function call to
generate a fixture from for the metric sizes (see Goal above), so the metric table entries
are instead asserted directly against the ISO 7089 published values at table-definition
time, and separately exercised through the same `primitive.tube`/`primitive.cylinder`
expansion path as the imperial sizes to prove the recipe itself doesn't special-case
metric vs. imperial input.

## Effort

S (< 1hr).

## Testing

Vitest, `src/core/kernel/recipes/hardware.washer.spec.js`, plain Node.
Numeric-tolerance (`toBeCloseTo`) diff against real V1 output for `ImperialWashers['1/4']`
with `fit: 'loose'` **and** with `fit` omitted — both branches, since the conditional
clearance part is the one thing in this recipe that isn't a straight port. Degenerate
cases: unknown `spec` key, unknown `fit` key when `fit` is provided.

Metric coverage (`MetricWashers['m3'..'m12']`, see Goal above): two separate assertions,
since there's no V1 fixture to diff against for these. First, a table-conformance test
asserting each `MetricWashers` entry's `idMm`/`odMm`/`thicknessMm` fields against the ISO
7089 values in the Goal section verbatim. Second, at least one metric size (`'m6'` is a
reasonable pick — mid-table, exercises non-trivial `id`/`od` values) run through the
recipe itself with `fit: 'loose'` and with `fit` omitted, asserting the expansion shape
(`primitive.tube` for `washer`, `primitive.cylinder` + `hidden: true` for `clearance`)
matches the imperial case's shape — proving the recipe treats metric and imperial specs
identically, not proving a metric dimension against a V1 value that doesn't exist.

No `*.e2e.js` — no UI surface exists yet, stated explicitly per `TODO/README.md`'s rule.

Acceptance scenarios: none directly pass/fail on this task alone — feeds scenario 3 once
`ui-013` exists.

No closed finding's subsystem is extended here in a way that needs re-running.
