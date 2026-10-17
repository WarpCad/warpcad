---
title: Subtract with a Pi's hole1 keeps the tool part, so one Pi can drill several holes
category: core
kind: finding
priority: medium
model: opus
depends: []
status: open
---

## Problem

Subtract with a Raspberry Pi's `hole1` consumes the Pi along with the plate. The result is one
body, so each extra hole needs another Pi. A user drilling four holes must place four Pis. The
user chose on 2026-10-17 (question 12 of the decision list) that the tool part should survive.

This is boolean semantics, so it is `opus`. Changing which operand survives affects the
evaluation pipeline, the BOM and the repair dialog.

## Affected files

- `src/core/kernel/recipes/` (the Raspberry Pi hole recipe and its Subtract behaviour)
- `src/core/dependents.js` and `src/core/repair.js` (the consumed-operand rule, which
  `core-061` also touched)
- `src/core/inspector.spec.js`, `src/core/repeat.spec.js` (update expectations)

## Proposed fix

When a Subtract uses a hardware tool part's hole, the tool part survives the operation, so
the same Pi can be subtracted again. The plate loses material, the Pi stays in the scene.
Keep the Pi's own hole geometry unchanged. The BOM still counts one Pi.

## Effort

M to L. The consumed-operand rule is shared, so check every caller before changing it.

## Testing

- Unit: one Pi subtracted from a plate at four holes leaves the Pi in place after each step.
- Unit: the BOM counts one Pi, not four.
- Unit: the repair dialog is unchanged for a deleted Pi.
- E2E: a new case in `e2e/repeat-placement.e2e.js` (the repeat is the natural way to drill
  four holes), on all 9 projects.
- Acceptance scenarios: scenario 5 (subtract a fastener) and the Raspberry Pi placement
  scenario, re-driven on laptop and phone Chromium.
- Closed-finding regression: `core-061`'s repeat repro, re-run against the new code.
- Engines: all three (the Subtract is a WebGL-rendered path).

## Interaction model

- **Precondition**: a plate and a Pi are selected, and the Subtract tool is enabled for exactly
  two operands (unchanged).
- **Trigger**: the Subtract control, unchanged.
- **Feedback**: the plate shows the hole, and the Pi stays in the Objects list.
- **Placement**: n/a. **Selection response**: unchanged. **Selection count**: exactly two,
  unchanged.
- **Small-screen behaviour**: same as desktop.

## Documentation

- **Page**: `docs/hardware-library.md` (the Subtract paragraph for a Pi's holes).
- **Example**: place a Pi and a plate, Subtract the Pi's hole1, then Subtract hole2; the Pi is
  still there and the plate has two holes.
- **Media**: update the Pi drilling still in `e2e/docs/`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
