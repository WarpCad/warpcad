---
title: One 1.4 micrometre edge shared by four triangles remains in the exported STL of a 96k-triangle scan with a Subtract cut
category: io
kind: finding
priority: low
model: opus
milestone: none — Findings table, filed 2026-11-15 from the io-031 close
depends: []
status: done
---

> **What shipped (2026-11-19), and one deviation from the Proposed fix.** `releasePinchedEdges` in `src/core/kernel/watertight.js`
> runs as the last pass of `makeWatertight`. Root cause: the T-junction pass inserted a corner 1.4 micrometres from another into two
> faces on two different lines (it sits exactly on one and 0.78 micrometre, inside the 0.87 micrometre weld, off the other), so one
> side was walked twice each way. The pass takes that corner out of both faces; no coordinate moves, and it does nothing when no side is
> walked twice in one direction. **Design decision (deviation):** the proposed "collapse short edges" was not used, because collapsing
> moves a corner 1.6 snap epsilons, beyond the weld radius, and `io-031` showed that opens a hole. The 96k cut now exports 0 open edges
> at 1e-5 mm and at 1e-3 mm, volume 210,200.55 mm3 (the kernel's); the `io-031` table, `io-004` and `io-005` shapes
> (`bench/watertight-equivalence.mjs`) are unchanged. Hazard met on the way: a line starting with a `/** @type */ (...)` cast after an
> assignment with no semicolon parses as a call of the previous line.

## Problem

After `io-031`, the testing-023 table reads 0 open edges at 1e-5 mm for the 32k and 240k cuts and for every control, but the
96,600-triangle scan with the 25 x 25 x 75 mm cutter still exports **one** edge (1.4 micrometres long) used by four
triangles, two each way (it also shows at 1e-3 mm). The surface is closed everywhere else; volume agrees with the kernel to
about 2e-6 relative. It is not a hole and not a doubled face; it is one pinched seam, and `docs/export.md` says "every edge is
shared by exactly two triangles".

`io-031`'s two repair steps (fuse corners within the snap epsilon, split a face that visits a corner twice) leave this one.

## Affected files

- `src/core/kernel/watertight.js` (`makeWatertight`, `fuseNearCorners`, `splitAtRepeatedCorners`)
- `src/core/kernel/watertightDense.spec.js` (add the 96k case with an exact closed-edge count of zero)

## Proposed fix

A targeted round that collapses short edges that are still open (used by other than two triangles, or twice in one
direction) after the existing passes, bounded by the same epsilon so no real feature is merged. Reproduction: generate the scan
with the `genscan` shape in `TODO/done/io-031-*.md`'s bench note (`bench/results/2026-11-15-io-031.md`, grid 300 x 162),
subtract the cutter, `exportBodies` STL, count edges at 1e-5 mm.

## Effort

S.

## Testing

- Unit: the 96k case, exact closed-edge count 0 at 1e-5 mm and at 1e-3 mm, volume within 1e-5 of the kernel.
- Re-run `io-031`'s table: every row stays 0.
- Closed-finding regression: `io-031`, `io-004`, `io-005`. Acceptance scenarios re-driven: 11 and 26. Engines: Chromium and WebKit.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: none; `docs/export.md` already states the closed-surface claim.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
