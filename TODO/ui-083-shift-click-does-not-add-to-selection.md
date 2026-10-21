---
title: Real-mouse Shift-click no longer adds to the selection
category: ui
kind: finding
priority: high
model: sonnet
depends: []
status: open
---

## Problem

With a real mouse, Shift-click on a second body replaces the selection instead of adding to it.
Union and Subtract therefore never enable from a hand drive, so the boolean flow cannot be
reached by a human. Found while driving `TODO/ACCEPTANCE.md` scenario 4 on 2026-10-21 (laptop
1440x900 and a hand-resized 720 px window, dev server):

1. Drop two cubes, one on each side of a point so they overlap.
2. Plain-click the first cube. The toolbar reads `1 selected`.
3. Hold Shift and click the second cube. The toolbar still reads `1 selected`, and only the
   second cube is selected. Union and Subtract stay disabled.

A Shift-held marquee drag around both cubes also leaves `data-selected-count` at 1.

What is established:

- The Shift modifier reaches the canvas `pointerdown` (checked with a probe listener).
- The same steps at HEAD, before `ui-079` stages 1–3, behave identically. The regression is not
  from `ui-079`.
- `TODO/ACCEPTANCE.md` scenario 4's history records a real-mouse Shift-click passing on
  2026-10-15 (`ui-067`). So the regression landed between that date and HEAD. The bisect has not
  been run.
- The project's `e2e/boolean-operations.e2e.js` `selectBothCubes` helper passes because it
  dispatches synthetic `PointerEvent`s with `shiftKey: true`. Real mouse input is not covered by
  any spec, which is why the suite stays green.

## Goal

Shift-click on a body adds it to the selection (and a second Shift-click removes it), with real
mouse input. The additive marquee works the same way. After this, `TODO/ACCEPTANCE.md` scenario 4
can be driven by hand from 0 to Subtract.

## Interaction model

Not a new surface. This restores an existing trigger.

- **Precondition**: one body selected, or none.
- **Trigger**: Shift + click on a body in the 3D view.
- **Feedback**: `data-selected-count` on `[data-testid="viewport"]` increments; the toolbar reads
  `N selected`; both bodies show selection highlights; Union/Subtract enable at 2.

## Documentation

Not a new user-visible control, so no new page. If the fix changes how additive selection is
described, `docs/selection-inspector.md` (or the page that names Shift-click) gets a one-line
correction. Otherwise this section does not apply.

## Affected files

- `src/components/viewport/Viewport.vue`: the additive path. `pickAt(clientXPx, clientYPx,
  additive)` (near line 3377) and the `pressShiftKey` / `marqueeAdditive` handling (near lines
  2905 and 2979).
- Likely the `pointerdown` and `pointerup` handlers that set `pressShiftKey`. The bisect should
  confirm which.

## Proposed fix

1. **Bisect first.** Between 2026-10-15 and HEAD, run a real-mouse probe (two cubes, plain click,
   Shift-click; read `data-selected-count`) at each candidate commit. Use a temporary worktree and
   remove it afterwards. The first bad commit names the cause.
2. Fix the cause at that commit's site, keeping the synthetic helper working.
3. Add the real-input regression described in Testing, so the suite fails if this comes back.

## Effort

S–M, pending the bisect. If the first bad commit is in the shared pointer path, widen the fix to
both the click and the marquee.

## Testing

- **New `e2e/shift-select.e2e.js`** (navigates to `/`): drops two cubes with real `page.mouse`
  drags, plain-clicks one, Shift-clicks the other with `page.keyboard.down('Shift')` held around a
  real `page.mouse.click`, and asserts `data-selected-count` is 2 and Union/Subtract are enabled.
  A second case covers a Shift-held marquee around both bodies. It must not use synthetic
  `dispatchEvent`.
- **Engines**: all three (Chromium, Firefox, WebKit). Shift and pointer routing differ by engine.
- **Viewports**: laptop 1440×900. Shift is a desktop modifier, so tablet and phone do not apply.
- **Existing specs to re-run in full**: `boolean-operations`, `selection-inspector`,
  `inspector-object-list`.
- **Acceptance scenarios to re-drive** (`TODO/ACCEPTANCE.md`): **4** (boolean gating) at laptop and
  at a hand-resized ~720 px window, from two cubes through Subtract, with the result checked. Also
  **1** at laptop.
- **Closed findings whose repro steps must be re-run**: `ui-067` (place connectors on the split
  face). Its scenario 4 pass on 2026-10-15 is the last known-good real-mouse Shift-click
  baseline. Re-run its two-cube Shift-click steps.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
