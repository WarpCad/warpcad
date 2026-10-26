---
title: "JSCAD V3 switch: full suite on three engines, acceptance re-drive, decision doc, merge"
category: core
kind: feature
priority: low
model: sonnet
milestone: deferred — JSCAD V3 switch, not on the current roadmap
depends: [core-066, core-067, core-068, core-069, core-070, core-071, core-072]
status: deferred
---

**Deferred 2026-10-17** with its umbrella, `core-066`.

## Goal

Close the switch: prove the `core-066` branch is green end to end, correct the records that
call 2.13.0 "V3", and merge. Done means everything in Testing passes, the docs below say which
version is installed, and the branch is merged to `main`.

## Current behaviour

`docs/decisions/geometry-kernel.md` is titled "`@jscad/modeling` (JSCAD V3)" and its addendum
table (lines 101-106) is headed "V3 (`@jscad/modeling` 2.13.0)", while 2.13.0 is JSCAD's V2.
`CLAUDE.md`'s Stack row says "`@jscad/modeling` (JSCAD V3)" and Browser Support says "The
committed geometry kernel, `@jscad/modeling`". `docs/decisions/rendering.md:107` and
`docs/decisions/persistence-export.md:468, 487` name 2.13.0 as the pinned version.
`src/components/sketch/ExtrudePanel.vue:6` says "One button per `@jscad/modeling` 2.13
extrusion".

## Expected outcome

Those records name the installed 3.x version, with a dated note in the decision doc: what the
switch changed (the child tasks' findings, one line each) and what V3 now offers that 2.x did not
(path3, `minkowskiSum` for geom3, Martinez 2D booleans, `offset`'s `expandHoles`). The
Library-decisions health check from `core-066` step 3 is recorded in the decision doc.

## Proposed fix

1. Run everything in Testing on the branch.
2. Edit `docs/decisions/geometry-kernel.md`: fix the title and the addendum table header to the
   real version; add the dated "Switched to V3" section. Do not rewrite the history above it.
3. Edit `CLAUDE.md`'s Stack row to name the version; edit `ExtrudePanel.vue:6`'s comment and the
   two other decision docs' version mentions.
4. Add `ROADMAP.md` Completion Log rows for `core-066` to `core-073`, then merge the branch.

## Affected files

- `docs/decisions/geometry-kernel.md`, `docs/decisions/rendering.md:107`,
  `docs/decisions/persistence-export.md:468, 487`, `CLAUDE.md` (Stack table)
- `src/components/sketch/ExtrudePanel.vue:6` (comment only)
- `TODO/ROADMAP.md`

## Effort

M (mostly test time and the acceptance drive).

## Interaction model

n/a — no control changes.

## Documentation

No end-user page changes (no visible change). Decision docs and `CLAUDE.md` as above.

## Testing

- `npm test`, `npm run typecheck`, `npm run spdx`, `npm run licenses`, and the full Playwright
  suite on **Chromium, Firefox and WebKit** at phone, tablet and laptop (kernel results reach the
  viewport, export and persistence, so all three engines matter per `CLAUDE.md` Browser Support).
- `npm run docs:media`: regenerated screenshots must show no visible change (diff them); any
  change is a parity failure to trace back to its child task.
- Re-run every benchmark the child tasks touched and compare with the last 2.x results in
  `bench/results/`.
- **Acceptance scenarios to re-drive** (driven, not scripted, per `CLAUDE.md` Verification):
  **1** (two primitives), **2** (hardware property edit), **3** (kit snap placement),
  **4** (boolean gating, with Fillet/Chamfer), **5** (hidden-part boolean), **9** (sketch,
  extrude: Linear, Outline and Loft), **10** (save, reload, nothing changed), **11** (export and
  open elsewhere), **12** (edit a mid-history step, replay), **17** (airfoil and wing),
  **26** (import an STL, subtract a primitive). Report PASS/FAIL for each.
- **Closed-finding repros**: `core-051`, `io-004`, `io-005`, `io-006`, `core-034`, `core-020`,
  `sketch-005` (the union of the children's lists).
- **Saved projects**: open a project file saved under 2.13.0 (from `e2e/` fixtures or a real
  saved file) and confirm every body evaluates and measures the same. Geometry is derived from
  the timeline, never stored, so this should hold; prove it.
- **Five-minute free-form human pass** at phone, tablet and laptop before merging, per
  `CLAUDE.md` Verification (a kernel swap is milestone-sized).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
