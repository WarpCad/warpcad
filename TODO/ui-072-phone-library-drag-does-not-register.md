---
title: Phone (390 px): the second Library drag does not register, so save-load-ui fails on all three phone projects
category: ui
kind: finding
priority: high
model: sonnet
depends: []
status: open
---

## Problem

`e2e/save-load-ui.e2e.js` fails on `chromium-phone`, `firefox-phone` and `webkit-phone`
at the New-then-place test (about line 182) and at the download / Open round trip. The
second Library drag at 390 px never registers, so the second body is not placed. The
failure is present at `HEAD` and at `6869eb5`, `931b685` and `b7f9f08`, so it predates
the recent Repeat and merge work. Fast mode skips the phone projects, so nothing has
flagged it since it appeared.

Reported by the TODO loop on 2026-10-17 (`TODO/BUDGET.md`, the `core-061` row). Filed
after the user chose to file regressions (2026-10-17, question 3 of the decision list).

## Affected files

- `e2e/save-load-ui.e2e.js:182` (the failing New-then-place test; the round trip follows)
- `src/components/layout/LibraryPanel.vue` (the phone Library sheet drag source)
- `src/components/layout/AppView.vue` (phone sheet stacking; `ui-070` and `ui-071` touched it)

## Proposed fix

Find out why the drag starts but the drop does not register at 390 px. Start by checking
whether the phone Library sheet is covering the drop target after the first placement, as
`ui-070` found for the Inspector tab. Fix the cause, not the test. Do not weaken the
assertion.

## Effort

M (a few hours). The cause may be a layout or z-order fault, or a touch-pointer fault in
the drag handler.

## Testing

- Make `e2e/save-load-ui.e2e.js` green on `chromium-phone`, `firefox-phone` and
  `webkit-phone`, and keep it green on laptop and tablet.
- Re-run the Library placement specs at all three viewports (`e2e/phone-library.e2e.js`,
  `e2e/hardware-library-placement.e2e.js`).
- Acceptance scenarios that could break: scenario 1 (place two solids), scenario 13
  (file round trip). Re-drive both on laptop and phone Chromium.
- Closed-finding regression: `ui-070` (phone Inspector tab covering the open Library sheet),
  re-run its repro.
- Engines: all three (touch drag and layout are engine-sensitive).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
