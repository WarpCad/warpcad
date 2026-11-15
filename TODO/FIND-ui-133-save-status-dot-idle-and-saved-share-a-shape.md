---
title: Give the save-status chip's idle and saved dots different shapes, and its paused and failed dots too
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-030 real-GPU drive
depends: []
status: open
---

## Problem

Found driving `TODO/VERIFY.md` `io-001` #2 (production build of HEAD, 390x844 touch emulation at DPR 3 on the Apple M4 Pro). The chip's dot is 10x10 px in a 20x10 slot. Idle (grey disc) and saved (green disc) are both discs, so they differ only by hue (dE76 46 dark, 39 light). Paused (amber square, 3 px radius) and failed (red square, 2 px radius) are both rounded squares, so they differ only by hue (dE76 51 dark, 45 light). Both panel agents, reading five states, said the same: not all five separate by shape. The row's own aim was shape coding that does not rely on hue. Contrast of each dot against the header ground is 4.1 to 10.1:1 (above 3:1). The File-button badge (`HostedDot`) does separate its five states by shape. Evidence: scratchpad `panel2/chip-dark.png`, `panel2/chip-light.png`.

## Affected files

- `src/components/display/SaveStatus.vue` (the `.save-status__dot` rules)

## Proposed fix

Give each of the five a shape of its own (for example a small dash for idle, a tick or full disc for saved, a triangle or ! for paused, an X or square for failed), as `HostedDot` does.

## Effort

S.

## Testing

- Unit test for any placement or hit-test change; an e2e spec at `/` at the viewports named above.
- Re-run the `TODO/VERIFY.md` row named in Problem and the closed findings it touches.

## Interaction model

Precondition: none. Feedback: the dot's shape names the save state.

## Documentation

- **Page**: only if behaviour a user can see changes (`docs/`).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
