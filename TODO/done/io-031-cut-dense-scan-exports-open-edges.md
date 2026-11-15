---
title: A dense imported scan with a Subtract cut in it exports an STL that is not closed, and Cura says so
category: io
kind: finding
priority: medium
model: opus
milestone: none — Findings table, filed 2026-11-14 from the testing-023 drive of io-009 #2
depends: []
status: done
---

> **What shipped (2026-11-15).** The exported STL of a dense scan with a Subtract cut is now a closed surface at the file's
> precision: 0 open edges at 1e-5 mm on the 32k and 240k cuts (23 and 141 before), STL volume within 4e-6 of the kernel,
> low-poly exports byte-identical (`bench/watertight-equivalence.mjs`). `makeWatertight` (`src/core/kernel/watertight.js`)
> treated a cell of the serializer's snap grid as a corner's identity; it now fuses corners within the snap epsilon before
> the T-junction passes and splits faces that visit one corner twice after them. **The stated target (no Cura warnings) was
> not met**: `Mesh has disconnected faces!` is gone but `Mesh has overlapping faces!` remains on the 32k, 96k and 240k cuts,
> because Cura melds vertices within about 30 micrometres and the cutter's flat face has two edges 17 micrometres apart;
> clearing it needs a flat-face cleanup (`io-032`). The 96k case keeps one 1.4 micrometre four-face edge (`io-033`). That
> scope decision was taken for the owner by the unattended run; review it. The standing dense case is a unit spec
> (`src/core/kernel/watertightDense.spec.js`, generated meshes); an all-engine e2e of the same case was driven but not kept.
> Measurements: `bench/results/2026-11-15-io-031.md`.

## Problem

`FIND-testing-023` opened WarpCad's exported STL files in UltiMaker Cura's own slicing engine (`CuraEngine` 5.13.0, stock
Ultimaker Original definitions). Every low-polygon export was clean: a plain Union, a placed bolt, a block with a Ø22 bore at Normal
and at Print, a 12-triangle imported bracket with a cut. A **cut dense mesh is not**. `docs/export.md` says "every edge is shared by
exactly two triangles" and `docs/import.md` says an imported part "exports as a closed shape"; for this case both are wrong.

Reproduction (production build, Chromium 1440x900, real **File ▾ → Import model…**, real placement click, **Units** inch, a cube
25 x 25 x 75 mm through the middle, **Subtract**, **File ▾ → Export… → STL**). The input is a closed, outward-wound, generated
scan-like blob (a lumpy UV sphere authored in inches, 0 open edges at 1e-6) with the stated number of triangles:

| Imported triangles | Exported triangles | Open edges (not exactly two, opposite) of all edges, at 1e-5 mm | CuraEngine warnings |
|---|---|---|---|
| 12 (box 40 x 20 x 10, cutter 12 mm) | 60 | 0 of 90 | none |
| 4,920 | 5,532 | 0 of 8,298 | none |
| 32,320 | 31,956 | 27 of 47,934 | `Mesh has overlapping faces!` |
| 96,600 | 91,822 | 36 of 137,733 | `Mesh has overlapping faces!` |
| 240,960 | 223,123 | 128 of 334,684 (136 at 1e-3 mm, plus 21 collapsed triangles) | `Mesh has disconnected faces!`, `Mesh has overlapping faces!` |
| 240,960, **not cut** (same placement, exported) | 240,960 | 0 of 361,440 | none |

The open edges sit where the cutter's walls meet the scan (for the 32k case at y = -8.88 and z about 6 to 81, x -32 to -16): a
mix of edges used once (a hole) and edges used twice in the same direction (a doubled face), which is T-junction and sliver
geometry, not a winding flip. Volume still agrees (240k case: STL 210,230.74 mm³, the app's readout 210,230.29 mm³), so the
Inspector will not show it. CuraEngine still slices all of them; its warnings are what Cura's own repair prompt is built on.

This is the `io-004` failure (T-junctions after a boolean) returning at a density `io-004` and `io-005` never measured: their
closed-mesh checks used shapes under 500 triangles.

## Affected files

- `src/core/kernel/watertight.js` (`makeWatertight`, called from `exportBodies`): the repair that `io-004` added
- `src/core/kernel/` boolean path for mesh operands (imported mesh meets a primitive)
- `docs/export.md` ("Checking a file") and `docs/import.md` ("Cleaned up on the way in"): the closed-surface claim

## Proposed fix

1. Reproduce at unit level: a generated 30,000-triangle closed sphere, a cuboid subtracted from it, `exportBodies`, then the
   repo's closed-edge count at 1e-5 (the `e2e/export-ui.e2e.js` `meshStats` logic). Find which edges stay open, and whether the
   repair misses the T-junction, or the boolean makes slivers the repair then collapses (21 collapsed triangles at 1e-3 mm).
2. Fix in the repair or in the boolean's input welding, then re-run the table above, with the 0-warning column as the target.
3. Keep the dense case as a standing spec (a generated sphere, not a downloaded file) so it is checked on every engine.

## Effort

M.

## Testing

- Unit spec in item 1 with `toBeCloseTo` volume and an exact closed-edge count; degenerate cases: a cutter that touches a pole,
  a cutter coplanar with a face, a mesh with a few thousand triangles at the cutter edge.
- Re-run `FIND-testing-023`'s reproduction (table above) against the new code, including `CuraEngine` with no warnings. The
  scratchpad generator is described in the TODO's VERIFY.md notes (`io-009` #1).
- Closed-finding regression: `io-004` and `io-005` (Union and bolt, STL, OBJ, glTF must stay at 0 open edges).
- Engines: Chromium and WebKit (kernel and export worker). Acceptance scenarios re-driven: 11 and 26.

## Interaction model

Not UI-touching.

## Documentation

- **Page**: `docs/export.md` and `docs/import.md`. This task already adds a caveat to `docs/export.md`; remove it when the fix lands.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
