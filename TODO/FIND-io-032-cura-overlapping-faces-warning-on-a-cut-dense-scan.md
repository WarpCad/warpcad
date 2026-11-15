---
title: Cura still prints "Mesh has overlapping faces!" for a dense imported scan with a Subtract cut, though the exported STL is closed
category: io
kind: finding
priority: low
model: opus
milestone: none — Findings table, filed 2026-11-15 from the io-031 close
depends: []
status: open
---

## Problem

`io-031` made the exported STL of a cut dense scan a closed surface at the file's precision (0 open edges at 1e-5 mm on the
32k, 96k and 240k cuts of the testing-023 table). CuraEngine 5.13.0 (stock Ultimaker Original definitions) no longer says
`Mesh has disconnected faces!`, but it still prints **`Mesh has overlapping faces!`** for the 32,320-, 96,600- and
240,960-triangle cuts. The uncut scan, the 12-triangle box and the 4,920-triangle cut are clean. Cura slices all of them.

Cause, measured on the 32k file: Cura melds vertices within about 30 micrometres and flags two faces on one edge at an angle of
exactly 0. The cutter's flat bottom face has two 16.6 mm edges 17 micrometres apart with a thin triangle pair between them, and
Cura folds that pair onto one edge, although our file is closed there at 1e-5 mm.

## Affected files

- `src/core/kernel/watertight.js` (`makeWatertight`) or a new pass in `src/core/kernel/` after a mesh-operand boolean
- `docs/export.md` ("Checking a file"): the narrower Cura note `io-031` wrote there is removed when this lands

## Proposed fix

A sub-30-micrometre cleanup inside flat faces after a boolean: re-tessellate a planar face's polygon (or decimate coplanar
slivers) so no two edges of one flat face lie closer than Cura's meld distance. A **global 30 micrometre vertex fuse is wrong
in principle**: the uncut 240k scan has 7 micrometre pole rings Cura accepts, and a global fuse would collapse real detail.

## Effort

M.

## Testing

- Unit: a generated 32,320-triangle scan, a cube cut through it, `exportBodies` STL; no two edges of one planar face closer than
  30 micrometres, closed at 1e-5 mm, volume within 1e-5 of the kernel's.
- Re-run the testing-023 table through `CuraEngine` (`bench/results/2026-11-15-io-031.md` has the invocation): no warnings.
- Closed-finding regression: `io-031` (0 open edges stays), `io-004` and `io-005` (Union and bolt in STL, OBJ, glTF).
- Engines: Chromium and WebKit (kernel and export worker). Acceptance scenarios re-driven: 11 and 26.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: `docs/export.md`. Remove the Cura note about *Mesh has overlapping faces* when the warning is gone.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
