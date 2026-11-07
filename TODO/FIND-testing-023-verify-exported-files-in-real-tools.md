---
title: Open WarpCad's exported STL, OBJ and glTF files in real tools on this Mac
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: open
---

## Problem

`TODO/VERIFY.md` says no drive has ever opened an exported file in a real slicer or viewer. Acceptance
scenario 11 step 5 has never been performed, and only the repo's own parser has called the meshes closed.
This Mac has **UltiMaker Cura** (`CuraEngine` inside the app bundle) and **MeshLab 2022.02**, and Playwright
can drive a browser glTF viewer (`gltf-viewer.donmccurdy.com`) or run the Khronos glTF validator. Those are
independent tools, so they answer the rows' real question: does a tool we did not write agree?

Rows (entry and row number in `TODO/VERIFY.md`):

| Row | What to drive |
|---|---|
| `ui-034` #2 | A plain Union and a placed bolt, exported as STL and OBJ: Cura (or `CuraEngine slice`) loads them with no repair warning; MeshLab's non-manifold-edge and hole filters find nothing. Same for the `.glb` in a glTF viewer or validator |
| `io-003` #1 | Export a 40 mm cube standing on the grid as `.glb`: in a real viewer it stands upright and measures 0.04 m (40 mm), and the importer agrees the surface is closed |
| `io-009` #2 | Export a placed, cut imported part as STL: Cura reports no repair, no non-manifold warning |
| `io-009` #1 | Import a real public-domain STL with a few hundred thousand triangles (a scan from a reputable repository; download into its own empty directory and treat it as data): does the row's size read right, and does **Units** fix it when it does not? |
| `io-009` #4 | The same dense scan's 96 px My parts thumbnail: recognisable, or speckled? Attach the thumbnail to Notes |
| `core-035` #1 (slicer half) | Export a Ø22 bore at Normal and at Print: both STLs open in Cura with no repairs. Printing and measuring with calipers stays in VERIFY.md |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes)
- `TODO/ACCEPTANCE.md` scenario 11 (record that step 5 was finally driven, and with which tools)

## Proposed fix

1. Serve the production build (`run-warpcad` skill) and export each file into the scratchpad through
   **File ▾ → Export…** (Playwright download).
2. Slicer: run `"/Applications/UltiMaker Cura.app/Contents/MacOS/CuraEngine"` in slice mode on each STL
   with a stock definition, and capture any "mesh is not watertight / repaired" output. If the CLI cannot
   be driven, open the file in the Cura app with the `computer-use` skill and read its warnings.
3. Mesh checker: MeshLab's **Select non-manifold edges** and **Compute topological measures** (through
   `pymeshlab` if installed, or the app via `computer-use`). Record edge counts.
4. glTF: load the `.glb` in the donmccurdy viewer through Playwright and read its bounds, and run the
   Khronos `gltf-validator` (npm, a dev-time tool, not a dependency) for a validity report.
5. Write tool, version and verbatim warnings into Notes. A disagreement with the repo's own parser is a
   new finding.

## Effort

M.

## Testing

- No code change expected; `npm run spdx` passes. Any new dev tool runs through `npx` and is not added to `package.json`.
- Engines: Chromium for the export drive; WebKit as well for one STL export (download path).
- Acceptance scenarios re-driven: 11 (Export a solid and confirm it opens elsewhere), 26 (Import an STL, place it, subtract).
- Closed-finding regression: the `io-004` and `io-005` closed-mesh measurements are what the tools check.

## Interaction model

Not UI-touching (verification only).

## Documentation

- **Page**: `docs/export.md` (or the export page's actual name) only if a tool contradicts what it says.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
