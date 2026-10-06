---
title: Port the full jscad-hardware 5.0.0 bolt, nut and screw tables (Spec list has only three bolts; no m2/m2.5)
category: core
kind: finding
priority: medium
model: sonnet
depends: []
status: done
---


> **What actually shipped (2026-10-06).** Tables are generated from `jscad-hardware@5.0.0`
> by `scripts/generate-hardware-tables.mjs` into `hardware-tables.generated.js` (static,
> no V1 parser at runtime); `bolt-specs.js`/`nut-specs.js`/`washer-specs.js` merge those
> with the pinned original rows and sort them numerically, metric first. **Shipped set is
> narrower than "everything in 5.0.0"**: metric socket `m1.6`..`m20`, hex `m10`..`m20`,
> imperial socket `#0`..`1` (no `#5`: V1 has no `#5` nut) and hex `1/4`..`1`, 45 bolts in
> all. That is exactly where V1's tap table, washer table and nut table end, so no shipped
> row hits the fit fallback (the spec asserts the generator's fallback list is empty) and
> every bolt has a nut. `m100 hex` is dropped (V1's row gives it a 90 mm body). Deviations
> from V1's parser, both bugs there: imperial `#0`..`#10` sockets looked up the bare `'0'`
> key, missed, and used the *head* diameter as every fit; fallbacks now use the body
> diameter. The three original rows are byte-identical (their `m10`/`m12` numbers differ
> slightly from 5.0.0's). **Metric nuts have no 5.0.0 source** (only `m4`), so the rest are
> transcribed from ISO 4032, as washers were from ISO 7089 — the TODO said to leave gaps,
> but the user needs m2/m2.5 nuts and the test requires a nut per bolt. Washers: `m1.6`,
> `m2`, `m2.5`, `m14`, `m16`, `m20` added from 5.0.0 (the old `washer-specs.js` claim that
> 5.0.0 has no metric washers was false). No metric screws added: 5.0.0's `MetricScrews`
> is still `m4` only. Dropdown is one flat list of 45, ordered; no `<optgroup>` yet.

## Problem

Reported by the user on 2026-10-06: *"When I place a bolt down, and go to its parameters,
it only has 3 values, M10 hex, M12 hex, and 1/4 socket. Where are the rest of the types?"*
Their own V1 projects mostly use **m2 and m2.5** bolts (Raspberry Pi work) and never m10/m12.

The Inspector's **Spec** dropdown is built from `keyOptions(tables.boltSpecs)`
(`src/core/kernel/registry.js:1666`), so it lists exactly the keys of `boltSpecs` in
`src/core/kernel/tables/bolt-specs.js`. The UI is fine; the table is thin.

**Root cause: `core-009` ported the wrong version of `jscad-hardware`.** `package.json:45`
pins `jscad-hardware@1.1.0`, the old published package, whose `metric.jscad` hand-typed only
`m10 hex` and `m12 hex`. The library's current source (`~/src/jscad/jscad-hardware`, v5.0.0,
what the user's projects actually ran) generates its tables from published standards instead:

| 5.0.0 source | What it holds |
|---|---|
| `src/metric.js` `MetricHexBoltDimensions` | `m10`..`m100` hex (no hex below m10) |
| `src/metric.js` `SocketCapScrewDimensions` (ISO 4762) | `m1.6, m2, m2.5, m3, m4, m5, m6, m8, m10, m12, m14, m16, m20, m24, m30, m36, m42` socket |
| `src/metric.js` `ScrewTapSizes` | per-size tap / close / loose hole diameters, `m1.5`..`m20` |
| `src/metric.js` `MetricWashers` | `M1` and up (rows already partly ported in `washer-specs.js`) |
| `src/imperial.js` `HexBoltDimensions` / `SocketCapScrewDimensions` | imperial hex from `1/4`, socket from `#0` |
| `src/imperial.js` `ImperialNuts` | `#0`..`1` hex, from boltdepot.com |

So the sizes the user reaches for (`m2 socket`, `m2.5 socket`, `m3 socket`) exist in V1 5.0.0
and are absent here. Note there is no `m2.5 hex` even in 5.0.0: ISO 4017 starts at m10 in that
table, so small sizes are socket-cap only, which matches how Pi projects use them.

Two corrections to claims already in the repo, found while checking this:

- The module doc in `bolt-specs.js` says V1 "only ever shipped" those three bolts, and that
  `m2.5 socket` "was never in `jscad-hardware`'s tables". Both are **false for 5.0.0**, and the
  second was wrong in spirit even for 1.1.0's reach. The comment must be rewritten, because it
  tells the next reader there is nothing to port.
- Even 1.1.0 had **`1/4 hex` and `5/16 hex`** in `imperial.jscad`. The port dropped both, so
  it was lossy against the version it claimed to mirror.

The same gap exists across the family. Nuts have `m4` and `1/4 hex`; metric screws only `m4`.
Washers are the closest to complete (`m3`-`m12`, three imperial). A user wanting an `m2.5`
bolt, nut and washer can get none of the three today.

## Affected files

- `src/core/kernel/tables/bolt-specs.js`: add rows, and fix the module doc (above).
- `src/core/kernel/tables/nut-specs.js`: nut rows to match every bolt size added.
- `src/core/kernel/tables/screw-specs.js`: metric screw rows beyond `m4`, if 5.0.0 supports them.
- `src/core/kernel/tables/washer-specs.js`: only where a new bolt size lacks a washer.
- `src/core/kernel/recipes/hardware.bolt.spec.js`, nut spec, and a new table-consistency spec.
- `docs/hardware-library.md`: the Bolt row's spec list and the "There is no M3 bolt" note.
- `package.json`: see step 1; the pin may or may not change.

## Proposed fix

1. **Source the numbers from `jscad-hardware@5.0.0`, not from fresh research.** It is the
   author's own work with the standards already cited in its comments (ISO 4762 via
   fastenal.com, atlrod.com for hex, aftfasteners.com for imperial socket). Decide whether to
   (a) copy the data tables into `src/core/kernel/tables/` as static JS, or (b) bump the
   dependency to 5.0.0. **Recommended: (a).** The 5.0.0 tables are built at import time by
   splitting tab/space-separated strings (`.split('\n').reduce(...)`) and depend on
   `@jwc/jscad-utils`, and `core/` is framework-free and uses no V1 runtime. Generate a
   static, frozen table with a one-off script under `scripts/` (like the existing
   `generate-v1-*-fixture.cjs`) and commit the output, so the app never runs the string parser.
2. **Size set.** Everything 5.0.0 has for socket cap screws (`m1.6`..`m42`, imperial `#0`..),
   plus its hex bolts (`m10`..`m100`, imperial `1/4`..). The user may prefer a smaller shipped
   set to keep the dropdown short (step 5); the generator makes that a filter, not a rewrite.
   Keep the three existing keys byte-for-byte so saved documents still resolve, and restore
   `1/4 hex` and `5/16 hex`.
3. **Key format stays `"<size> <head>"`** (`m2.5 socket`, `1/4 hex`).
4. **Fit diameters.** 5.0.0 supplies `tap`/`close`/`loose` from `ScrewTapSizes` for
   `m1.5`..`m20`; sizes outside that table fall back to `E` for all three fits (a hole exactly
   the bolt diameter). The generator must reproduce both behaviours *and flag* each size that
   hit the fallback so a human can decide whether that is acceptable. Do not silently emit
   `tap === close === loose` rows.
5. **Dropdown order and length.** About 35 metric socket + hex entries is long for a native
   `<select>`. Sort by system then numeric size (`m1.6`, `m2`, `m2.5`, `m3`... not
   lexicographic, which puts `m10` before `m2`), and decide whether `ui-052`'s enum needs
   grouping (`<optgroup>` metric / imperial) or a head-type filter. State the decision in the PR.
6. **Matching nuts and washers** for every shipped bolt size, from 5.0.0's `MetricNuts`,
   `ImperialNuts` and `MetricWashers`. Where 5.0.0 has no row, leave it out and say so.
7. **Do not touch the recipe.** `hardware.bolt.js` reads any `tables.boltSpecs[spec]`.
   `HexHeadScrew` and `PanHeadScrew` cover every row above.

## ## Effort

M (a few hours). Mostly careful data entry and source-checking; no new code paths.

## Testing

- **Table-consistency spec** (new, Vitest, `src/core/kernel/tables/`): for every bolt spec,
  assert `tap <= close <= loose`, `tap < bodyDiameterMm` except for rows the generator flagged as
  fallbacks (step 4), which are listed explicitly in the test rather than exempted by a rule, and `headDiameterMm > bodyDiameterMm`
  (with `toBeCloseTo` where an `inchToMm` value is compared), and for every bolt spec
  assert a nut exists for the same size, so the "bolt but no nut" mismatch cannot return.
  Degenerate cases: a key with no head type word, and a duplicate key after
  case-folding.
- **Recipe smoke spec**: evaluate `hardware.bolt` for each new row at length 20 and assert a
  watertight, non-empty solid whose bounding box width matches `headDiameterMm`. Mock the
  worker boundary per `CLAUDE.md`; the recipe itself is pure JS and runs in Node.
- **e2e**: no new control, so no new `*.e2e.js` is required for reachability. Extend
  `e2e/hardware-library-placement.e2e.js` to place a Bolt, open the Inspector's Spec list
  and assert it now offers `m2 socket` (a size that did not exist before) and `m2.5 socket`, then select `m2.5 socket` and
  assert the BOM line reads `Bolt M2.5 socket × <length> mm`. Chromium only: this is a table
  and DOM change with no WebGL, canvas or touch path of its own.
- **ACCEPTANCE.md scenarios to re-drive:** **2 (Hardware property edit)**, because it edits
  a bolt's Spec through the Inspector and this changes that dropdown's contents, and
  **5 (Hidden-part boolean, bolt tap-clearance)**, because the `tap` fit diameters feed it.
  Report PASS/FAIL for each.
- **Closed findings to re-run:** `render-004` (bolt tap-clearance visibility) against a new
  size, since it was filed against this same recipe and the `tap` envelope for a new row is
  new data going through the same path.

## Documentation

- **Page:** `docs/hardware-library.md`. Update the Bolt row's spec list and delete the
  "There is no M3 bolt" sentence. Update `docs/bill-of-materials.md` only if its example
  names a size that changes.
- **Example:** drag **Bolt** into the 3D view; in the Inspector set **Spec** to `m2.5 socket`,
  **Length** to `8` (mm), then drag **Nut** in and set its **Spec** to `m2.5` to get a matching
  pair. The BOM shows `Bolt M2.5 socket × 8 mm × 1` and `Nut M2.5 × 1`.
- **Media:** none new. If `hardware-library.docs.js` already captures the Library or
  Inspector, `npm run docs:media` regenerates it. Do not hand-capture.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
