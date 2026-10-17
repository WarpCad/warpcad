---
title: Phone (390 px): the second Library drag does not register, so save-load-ui fails on all three phone projects
category: ui
kind: finding
priority: high
model: sonnet
depends: []
status: done
---

> **Retirement note (2026-10-17):** the app was correct; the spec's own drop points were wrong. Root
> cause: `ui-070` lifts the open Library sheet 44 px above the Inspector's collapsed tab (the sheet top
> moved from y=410 to y=366 at 390x844), and `e2e/save-load-ui.e2e.js` dropped at `fy` 0.4 and 0.42 of the
> viewport (y=369 and y=385), which now land on the sheet. `Viewport.vue`'s `dropTarget.contains` hit-tests
> with `elementFromPoint`, so a release over the sheet is rightly not a drop. The first drag in a test passed
> only because the sheet had not yet been lifted; the tab appears once something exists. The "second drag"
> and `ui-054`'s one drag after New both fell in the 366..410 band. Diagnosed by probing
> `elementFromPoint` at the drop point after the first placement (`library-tab` / `library-panel`, not the
> canvas). No app file changed. The spec's drops moved to `fy` 0.3 / 0.3 / 0.2 (clear of the sheet at all three
> widths), and `dragRowIntoViewport` now throws "drop point ... is covered by <testid>" when the point is not
> on the viewport, so a later layout shift fails with its cause rather than a body count that never moves. No
> assertion was weakened. Driven by hand at 390x844 with real CDP touch drags (22-30 jittered steps, 14-34 ms
> apart) and at 1440x900 with the mouse: both drags register when released over the visible canvas.

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
