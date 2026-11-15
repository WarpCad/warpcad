---
title: A sketch's automatic Twist steps still lose several percent of the volume on a long, thin profile
category: core
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-15 from the core-083 drive
depends: []
status: open
---

## Problem

`core-083` made a sketch's Linear twist take its steps from the resolution, with a ceiling of 3° per step, so a
30 × 16 mm rectangle twisted 90° keeps about 97.9% of its 14 400 mm³ (14 091 mm³ in the unit spec). The ceiling was
fitted to that shape. The loss comes from the flat side faces of each step (about 0.75% per degree of step angle on
the 30 × 16 mm rectangle), not from the vertex chord the resolution's tolerance controls, so it depends on the profile.

Driven on a production build, a Chromium drag drew a 31 × 4.92 mm rectangle (centred on the sketch origin only
approximately): Twist 90 read 4 317 mm³ against 4 577 mm³ untwisted, a **5.7%** loss at the same 30 steps. A 32 × 17 mm
rectangle lost 2.2% (16 035 against 16 387 mm³). So a long thin profile can still read 5-6% light at the default, past
the 3% the finding for the 30 × 16 mm rectangle asked for.

## Affected files

- `src/core/kernel/registry.js` (`SKETCH_TWIST_STEP_DEG`, `twistedExtrude`'s automatic count)

## Proposed fix

Derive the automatic step ceiling from the profile (for example its longest side or its area-weighted extent) so the
volume loss stays within about 3% for any outline, or say in `docs/sketch-mode.md` that Twist steps can be raised for a
thin profile. Measure a 30 × 5, a 60 × 4 and a 20 × 20 mm rectangle at Twist 90 and 360 first.

## Effort

S.

## Testing

- Unit spec in `src/core/kernel/registry.spec.js`: thin rectangles at Twist 90 and 360 within 3% of the prism volume.
- Re-run `core-083`'s 30 × 16 mm case and `FIND-testing-019`'s `core-042` #1 reproduction.
- Engines: Chromium and WebKit. Acceptance scenario 9 re-driven.

## Interaction model

Precondition: a Sketch body selected, or the Sketch editor open. Trigger: the **Twist** field. Feedback: the viewport
shows a twisted prism whose volume stays within 3% of the untwisted one.

## Documentation

- **Page**: `docs/sketch-mode.md`, the Twist steps text.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
