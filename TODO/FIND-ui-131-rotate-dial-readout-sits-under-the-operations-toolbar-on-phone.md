---
title: Keep the rotate dial's readout clear of the operations toolbar at phone width
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-030 real-GPU drive
depends: []
status: open
---

## Problem

Found driving `TODO/VERIFY.md` `ui-064` #2 in headed Chrome on the Apple M4 Pro (390x844 touch emulation, production build of HEAD). While a rotate ring is dragged, the dial's readout pill ("+40.1°" over "fine 0.1°", box 139,153.5 112x50 px) overlaps the operations toolbar (box 8,61 182x180 px) by 51 of its 112 px, so the left 46% of the pill, including the word "fine", is covered. Both panel agents saw only "0.1°" on the phone and said the readout was clipped. At laptop width the pill is clear (readable at 14.1:1 dark, 16.4:1 light). The "270" label sat partly under the cube at laptop width in both panel readings; that one is less certain (the crop is tight) and is left for whoever fixes this to re-check. Evidence: scratchpad `shots/H1-phone-dark-dial-crop.png`, `H1-phone-light-dial-crop.png`.

## Affected files

- `src/components/viewport/RotateDial.vue` (readout placement)
- `src/components/viewport/Gizmo.vue`, `src/components/layout/OperationsToolbar.vue` (stacking and reserved space)

## Proposed fix

Place the readout where the toolbar is not: flip it to the side of the ring away from the toolbar, or clamp it to the free part of the viewport. Check the tablet width as well.

## Effort

S.

## Testing

- Unit test for any placement or hit-test change; an e2e spec at `/` at the viewports named above.
- Re-run the `TODO/VERIFY.md` row named in Problem and the closed findings it touches.

## Interaction model

Precondition: one body selected, a rotate ring dragged. Trigger: the ring drag. Feedback: the whole readout is visible while the finger is down.

## Documentation

- **Page**: only if behaviour a user can see changes (`docs/`).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
