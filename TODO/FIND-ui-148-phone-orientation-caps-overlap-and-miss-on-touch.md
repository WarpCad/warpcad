---
title: Make the phone orientation dial caps tappable without overlap
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, split from ui-134 on 2026-11-18
depends: []
status: open
---

## Problem

`ui-134` enlarged the orientation dial to 190px with 44px caps at touch widths of 600px and up (tablet), and
made a pointer tap resolve to the nearest cap centre at every width. On the 390px phone the dial is still 96px
with 30px caps, so neighbouring caps overlap: before `ui-134` a different cap fired on 22-35 % of scattered taps
(sigma 3.5 mm, `bench/tap-scatter.mjs`). Nearest-centre resolution helps but cannot fix caps 23px apart under
13px of finger scatter. The 190px dial does not fit on a phone: with its 200px footprint the Operations toolbar
(needs about 182px for its 4-column layout) shrinks to 3 columns, grows 40px taller, collides with the
navigation chrome (`phone-toolbar-chrome-fit.e2e.js`, `ui-043`) and leaves 16px to the dial where
`selection-inspector.e2e.js` (`ui-045`) needs over 20px. Measured 2026-11-18 on the `ui-134` working tree.

## Affected files

- `src/components/viewport/OrientationGizmo.vue` (dial and cap size at phone width)
- `src/components/viewport/OperationsToolbar.vue`, `src/stores/panelLayout.js` (the gizmo reserve)
- `e2e/orientation-tap.e2e.js` (extend from tablet to phone), `e2e/phone-toolbar-chrome-fit.e2e.js`, `e2e/selection-inspector.e2e.js`

## Proposed fix

Pick one: a collapsed dial that opens to a large six-face picker on tap; a two-row layout of the six faces in
the dial's footprint; or a phone layout that moves the toolbar and navigation chrome so a 190px dial fits.
Aim for at most 6 % of scattered taps on a different cap (the tablet measurement), 2 % if the layout allows.

## Effort

M.

## Testing

- e2e at `/` on the phone projects, tapping through the scatter as `e2e/orientation-tap.e2e.js` does.
- Re-run `ui-134`'s repro, `ui-043`, `ui-045`, and `TODO/ACCEPTANCE.md` scenario 7.

## Interaction model

Precondition: none. Trigger: tap a cap on the orientation dial. Feedback: the camera snaps to that view and the
label names it.

## Documentation

- **Page**: the `docs/` navigation page, if the dial's layout changes visibly.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
