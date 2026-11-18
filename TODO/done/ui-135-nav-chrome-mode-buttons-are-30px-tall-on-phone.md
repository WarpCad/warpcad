---
title: Make the Orbit, Pan, Select and settings buttons in the navigation chrome tap size on a phone
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-15 from the testing-031 tap, timing and reach drive
depends: []
status: done
---

## What shipped (2026-11-18, closed as a partial; the rest is `ui-149`)

Taking the buttons to a real 44 px height breaks two other budgets: the Operations toolbar then overlaps the chrome by 12 px at 390x844 with the Objects sheet open (`ui-043`), and the compact pad grows past its 166 px / 196 px budgets (`ui-084`). Width is budgeted the same way: a 44 px gear plus 8 px gaps took the cluster to 223 px against a 196 px cap. What shipped instead (`f10919d1`): the gear is 36 px wide, the mode row gaps are 6 px, and an invisible `::before` on each mode button and the gear reaches 6 px above and below it, so the hit area is 42-44 px tall while the painted button stays 30-32 px. `e2e/viewport-scaffold.e2e.js` asserts it. Scatter (400 taps each, sigma 13.2 px, Chromium 390x844): intended control fires on 76-80 %; a different control fires on 4 % (Orbit), 8 % (Pan), 5.5 % (Select), 1.75 % (gear), so the 2 % aim is **not** met for the three mode buttons. Meeting it needs real height, which means relaxing the `ui-043` and `ui-084` budgets: an owner decision, asked in the session.

## Problem

Found measuring `TODO/VERIFY.md` `ui-024` #2 (production build of the dirty tree at 2026-11-15, 390x844 touch emulation, Chromium). The navigation chrome's mode row at phone width is **Orbit 48.3x30, Pan 48.3x30, Select 48.3x30 and the settings gear 26x30 CSS px**, with 4 px gaps, below the 44 px tap size `CLAUDE.md` asks for. 200 taps per button, scattered as a fingertip would be (sigma 3.5 mm = 13.2 px): the intended button fired on 76 % (Orbit), 79 % (Pan), 76.5 % (Select) and 57.5 % (gear) of taps. **A different control fired on 5 % (Orbit), 7 % (Pan), 8.5 % (Select) and 9.5 % (gear) of taps**: Orbit went to Pan (2 %) or the step-up arrow (3 %), Select went to Pan (4 %), the gear (3.5 %) or Zoom in (1 %), the gear went to Select (9 %). 14-33 % of the taps selected nothing (the chrome's padding or the canvas behind it). The existing e2e only asserts a 36 px bounding box.

## Affected files

- `src/components/viewport/NavigationChrome.vue` (the mode row's button sizes at phone width)
- `e2e/phone-toolbar-chrome-fit.e2e.js` (what it asserts)

## Proposed fix

Give the mode row 44 px tall buttons at touch widths (and at least 8 px gaps, or a 44 px-wide gear), or move the settings gear out of the row. Re-run the scatter with `bench/tap-scatter.mjs`: aim for at most 2 % of taps firing a different control.

## Effort

S.

## Testing

- Unit test for any hit-test or layout change; an e2e spec at `/` at the viewports named above that taps the control through its scatter (see `bench/tap-scatter.mjs`).
- Re-run the `TODO/VERIFY.md` row named in Problem, `TODO/ACCEPTANCE.md` scenario 7 (touch-only viewport navigation), and the closed findings it touches.

## Interaction model

Precondition: the navigation chrome is showing. Trigger: tap Orbit, Pan, Select or the gear. Feedback: the active mode button is filled, as now.

## Documentation

- **Page**: n/a (sizes only).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
