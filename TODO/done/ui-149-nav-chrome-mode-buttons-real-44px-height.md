---
title: Give the navigation chrome's Orbit, Pan, Select and gear buttons real 44 px height
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, split from ui-135 on 2026-11-18
depends: []
status: done
---

## What shipped (2026-11-20)

The mode row is a real 44 px tall (`--tap`) at every width, the invisible `::before` hit extension is gone, and the gaps are 12 px (not 6): at 6 px with real height the middle button still sent 3.75 % and Select 4.75 % of scatter taps onto a neighbour, and 12 px took every control to 1.5 % or less (Orbit 0.5 %, Pan 1.25 %, Select 1.5 %, gear 1 %, 400 taps each, sigma 13.2 px, Chromium 390x844). The 14 px of height `ui-043` needed came from the Operations toolbar rather than the chrome: at 390 px the compact gizmo is 106 px wide, so its reserve is 150 px, not the full tier's 184 px, and the toolbar wraps five buttons to a row (216 px wide, three rows instead of four, 40 px shorter). The `ui-084` limits moved to what is now measured: pad 178 tall (budget 179) and 211 wide (budget 212), the phone toolbar 216 wide. New spec `e2e/nav-chrome-tap.e2e.js` holds the scatter at 2 %; `viewport-scaffold.e2e.js` asserts the painted heights.

## Problem

`ui-135` (closed as a partial, commit `f10919d1`) widened the gear, put 6 px gaps between the mode buttons and gave each mode button and the gear an invisible `::before` hit area reaching 6 px above and below, but the painted buttons are still 30-32 px tall. A scatter of 400 taps per control (sigma 3.5 mm = 13.2 px, Chromium 390x844) put the intended control first on 76-80 % of taps, and a **different control on about 4 % (Orbit), 8 % (Pan), 5.5 % (Select) and 1.75 % (gear)**. The aim is at most 2 %. The hit extension turns "hit nothing" taps into hits but cannot stop taps spilling onto the neighbouring control, so real height is needed.

Real 44 px height costs 14 px of cluster height and was tried and backed out, because two other findings budget that height to the pixel:

- **`ui-043`**: at 390x844 with the Objects sheet open, the Operations toolbar ends at y 241 and the chrome then started at y 229, a 12 px overlap (`e2e/phone-toolbar-chrome-fit.e2e.js`).
- **`ui-084`**: the compact chrome's pad must stay within 166 px tall and 196 px wide (`e2e/panel-tiers.e2e.js`, the `every width from 1440 to 760` and the three-viewport snapshot specs). A 44 px row measured 178 tall, and a 44 px gear with 8 px gaps measured 223 wide.

## Affected files

- `src/components/viewport/NavigationChrome.vue` (button heights, the `::before` extension this replaces)
- `src/components/operations/OperationsToolbar.vue` (its phone block; it needs about 14 px back, or the chrome needs to move)
- `e2e/phone-toolbar-chrome-fit.e2e.js`, `e2e/panel-tiers.e2e.js` (the budgets)

## Proposed fix

Make the mode row 44 px tall at touch widths, then find the 14 px elsewhere rather than shrinking the sheets: for example fold the direction pad's row gap, let the Operations toolbar drop a button row at phone width, or fold the mode row into the pad's expand toggle. Update the `ui-084` limits (166 and 196) to the new measured values in the same commit, with the reason. Re-run the scatter (see `ui-135`'s progress notes): at most 2 % of taps firing a different control.

## Effort

M.

## Testing

- `e2e/phone-toolbar-chrome-fit.e2e.js` and `e2e/panel-tiers.e2e.js` stay green at all three viewports on Chromium and WebKit, with any changed budget stated in the spec.
- An app-level spec at `/` (`e2e/viewport-scaffold.e2e.js`) asserting the painted mode buttons are at least 44 px tall.
- `TODO/ACCEPTANCE.md` scenario 7 (touch-only viewport navigation) re-driven; re-run `ui-043`'s and `ui-135`'s repros.

## Interaction model

Precondition: the navigation chrome is showing. Trigger: tap Orbit, Pan, Select or the gear. Feedback: the active mode button is filled, as now.

## Documentation

- **Page**: n/a (sizes only).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
