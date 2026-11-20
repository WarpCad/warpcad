---
title: Exporting a body whose Subtract left nothing downloads nothing and says nothing
category: io
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-18 from the io-032 acceptance drive
depends: []
status: open
---

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
