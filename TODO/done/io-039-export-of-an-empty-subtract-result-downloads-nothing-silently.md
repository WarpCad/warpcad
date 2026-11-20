---
title: Exporting a body whose Subtract left nothing downloads nothing and says nothing
category: io
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-18 from the io-032 acceptance drive
depends: []
status: done
---

> **What shipped (2026-11-20).** The silence did not reproduce at current `HEAD`: with a 32,320-triangle scan (and a 12-triangle box) imported as mm, a Cuboid dropped on it and **Subtract**, `exportBodies`, the export worker and the popover already refuse with *Cannot export "Subtract 1": it has no triangles* and download nothing, on all nine projects (the kernel's swallowed result is `polygons: []`, which `solidsForExport` has refused since `io-003`). So the unit specs for the refusal and the e2e of the refusal landed as regression cover and passed immediately. What was missing is the other half of the finding's "either": the popover now says so **before** the press. A new `emptyNote` in `stores/exportDialog.js` (a body in scope whose `volumeMm3` is 0) shows an amber line, *"Subtract 1" is empty — nothing is left of it, so it cannot be exported*, on opening **File ▾ → Export…**. `docs/export.md` has the new row and an example. Logged as owner question Q114 (assumed note plus refusal; the original silent case may have come from a path this drive did not hit).

## Problem

Import an STL drawn in inches without switching **Units** (so it reads as about 3 mm), drop the default Cuboid on it and
**Subtract**. The cuboid swallows the scan; one body named *Subtract 1* remains in Objects, but it has no volume. **File ▾ →
Export…** shows *Exports Subtract 1 as subtract-1.stl*, **Export** is enabled, and pressing it produces no download, no error
line and no console message (Chromium laptop, 90 s wait; identical at plain `HEAD` 883a9202, so it predates `io-032`).

Expected: either an *empty result* note on the body, or an export refusal in words (`ExportError`), as other refusals already
give.

## Affected files

- `src/stores/exportDialog.js` and `src/core/export.js` (the empty-solid case), `src/components/storage/ExportPopover.vue`

## Proposed fix

Find where the empty solid leaves the worker (`src/core/exportClient.js`) and map it to an `ExportError` with the body's name,
shown in the popover. Cover it with a unit spec and an app-level `*.e2e.js` at `/` that drives the steps above.

## Effort

S.

## Testing

- Unit: `exportBodies` / the store on a body with no polygons: a refusal naming the body.
- E2E at `/` (`e2e/export-ui.e2e.js`): the steps above; the popover shows the refusal and no download starts.
- `TODO/ACCEPTANCE.md` scenarios 11 and 26 re-driven.

## Interaction model

Precondition: a body whose evaluated solid is empty is selected or in scope. Trigger: File ▾ → Export… → Export. Feedback: a
line in the popover saying the body is empty.

## Documentation

- **Page**: `docs/export.md`, a line under the list of refusals.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
