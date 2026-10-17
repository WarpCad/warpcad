---
title: Wood-screw hole table: cite ASME B18.6.1 instead of Albany County Fasteners' copyrighted chart
category: core
kind: finding
priority: high
model: sonnet
milestone: M18 — Launch: publish, app.warpcad.com, Sentry and GA
depends: []
status: open
---

## Problem

`src/core/kernel/tables/wood-screw-holes.js` ports three columns (softwood pilot, hardwood
pilot, clearance) for gauges `#2`–`#10`, `#12` and `#14` from Albany County Fasteners' *Wood
Screw Pilot Hole Guide*, a PDF marked © 2025. Only numbers were ported, with the source cited,
so the risk is low, but the supplier's chart is the one place in the repository where a
third party's published chart is the data source. The pre-publish licence review (2026-10-17)
flagged it, and the user chose on 2026-10-17 to cite ASME instead.

**An unverified premise, to settle first.** ASME B18.6.1, *Wood Screws (Inch Series)*, is a
dimensional standard for the screws themselves. This file's author does not know whether it
prints pilot-hole or clearance-hole sizes, and the standard is behind a paywall, so nothing
here may be assumed. Step 1 below finds out before any value changes.

## Affected files

- `src/core/kernel/tables/wood-screw-holes.js` (header "Source" and "Why this chart" sections;
  the `CHART_INCHES` values if they change)
- `src/core/kernel/tables/wood-screw-holes.spec.js` (header line 7 and the cells it re-types
  "from the source")
- `docs/hardware-library.md:141` (the sentence naming Albany County Fasteners)
- `TODO/VERIFY.md` and `TODO/BUDGET.md` mention the chart choice (the `core-060` rows); leave
  history as written and add a dated line only if a value changes.

## Proposed fix

1. **Find out what B18.6.1 provides**, column by column: softwood pilot, hardwood pilot,
   clearance. Write the finding at the top of the table's header comment. Do not copy any
   prose from the standard. Cite it by number and title only.
2. **If B18.6.1 supplies a column**, source that column from it, keep the inch fractions the
   table already uses, and drop the Albany citation for that column.
3. **If it does not supply a column** (most likely the pilot columns), **stop and ask the
   user**. Offer these options, with the trade-off for each, and take no step until answered:
   - derive the column from the standard's nominal shank and thread diameters by a stated,
     documented rule (a derived value, labelled as derived, never as published);
   - drop the column, so a gauge with no source for it has no Fit class for it (the table
     already hides a Fit rather than guessing: see "Not interpolated or invented");
   - keep a supplier chart for that column only, and say so in the notice file
     (`build-011`).
4. Update the citation in the module header, the spec header and `docs/hardware-library.md`.
   Remove the Engineering ToolBox cross-check note if the column it compared no longer exists.
5. Keep every gauge's behaviour the same unless step 3 changed it. A gauge without a source for a
   column has no Fit field for it, as today.

## Effort

M (a few hours), or S if B18.6.1 covers all three columns. Most of the time is step 1 and the
user's answer in step 3.

## Testing

- Unit: `wood-screw-holes.spec.js` re-types the table's cells from the new source, with an
  explicit tolerance (`toBeCloseTo`, 1e-6 mm) for the inch-to-millimetre conversion. Cover the
  gauges with no row (`#11`, `#13`, `#15`, `#16`): no Fit field, no `tap` part.
- E2E: re-run `e2e/hardware-library-placement.e2e.js` and `e2e/fastener-types.e2e.js` at laptop
  Chromium and phone WebKit, since the Fit options come from this table.
- Acceptance scenarios: 2, 3, 5 (including the flat-head case) and 10 and 15, as `core-060`'s
  retirement note lists. Re-drive them at laptop width.
- Closed-finding regression: `core-050` and `ui-052`, re-run their repros.
- Engines: Chromium and WebKit for the e2e; the table itself is plain data.

## Documentation

- **Page**: `docs/hardware-library.md` (the Wood screws paragraph).
- **Example**: unchanged in shape. Pick **Bolt / screw**, set Type to *Wood screw, pan head*,
  Size `#8`, and read the Fit options; the wording of the source changes, the steps do not.
- **Media**: none changes unless a value shown in a screenshot changes. If it does, regenerate
  with `npm run docs:media`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
