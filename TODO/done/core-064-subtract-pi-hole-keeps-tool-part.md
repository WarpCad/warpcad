---
title: Subtract with a Pi's hole1 keeps the tool part, so one Pi can drill several holes
category: core
kind: finding
priority: medium
model: opus
depends: []
status: done
---

> **Retirement note (2026-10-17):** shipped, with these deviations.
>
> **The rule.** `src/core/booleanConsumes.js` (`consumesOf`, `keepsToolBody`) is the one place that decides
> a boolean's `consumes`; the Operations toolbar's `run()` and the AI `operate` tool's `booleanSpec` both
> call it. A cutting operand (never the base) of a `boolean.subtract` survives when it is a sub-part
> address naming **only** drill parts of its body's lineage-root recipe. Drill parts are declared per recipe
> (`BPLUS_DRILL_PARTS` in `raspberrypi.bplus.js`: `hole1`-`hole4`, `fan1hole`, `fan2hole`) and read through
> `drillPartsOf` in `kernel/registry.js`. No persisted record shape changed, so an old file whose Subtract
> lists the Pi in `consumes` still means that. The model-facing Subtract description says so (its schema hash
> changed, so `npm run ai:stamp` re-stamped three recorded AI transcripts; their calls are unchanged).
>
> **The narrow reading.** HAT, camera and screen holes, Union, Intersect and Group, a mixed `hole1,usb1`, any
> `clearance-*` keep-out and a fastener's `tap` (acceptance scenario 5: the bolt must still leave the Objects
> list) all still consume. Whether HAT/camera/screen holes should keep their part too is an owner call, in
> `TODO/VERIFY.md`.
>
> **Beyond the spec: one new Repeat refusal** (`src/core/repeat.js`, `checkRepeat`). With the Pi kept, a cut plate
> can now be a Repeat's source with the Pi as the seed, and core-061's member re-runs every step from the first
> one that mentions the seed, which here is the whole cut: one extra *plate* per hole. So `checkRepeat` refuses
> when any step from the seed's first mention onward has `consumes`, with a message that says to Subtract the other
> parts one at a time. Before this task a boolean always retired the seed, so the seed check already refused that
> path; nothing previously accepted is refused. It is not reachable from the UI (Repeat starts from a drilled-into
> part of a body that has parts), so it is covered by `src/core/repeat.spec.js` only.
>
> **The e2e premise was replaced.** The spec asked for a case in `e2e/repeat-placement.e2e.js` ("the repeat is the
> natural way to drill four holes"). That does not hold: Repeat copies the source once per target, so it cannot
> drill one plate four times. The app-level spec is `e2e/pi-hole-subtract.e2e.js` instead (plate + one Pi,
> Subtract `hole1`, `hole2`, `hole3` in turn: the Pi row stays, the plate loses about 25 mm3 each time, the BOM
> says one Pi), on all nine projects. Docs: `docs/hardware-library.md` (the example now drills with one Pi, and says
> a later move of the Pi does not move holes already drilled while an edit to the Pi does re-fold them),
> `docs/booleans.md`, `docs/snap-align.md`. Media: `rpi-mounting-holes.gif` now shows a second hole with the same
> Pi (regenerated, with `hardware-drag-bolt.gif`, which was stale against the same docs script).

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
