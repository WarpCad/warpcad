---
title: Real-mouse Shift-held marquee does not add to the selection
category: ui
kind: finding
priority: high
model: sonnet
depends: []
status: done
---

## Problem

With a real mouse, a Shift-held marquee drag around two bodies does not add them to the
selection. The viewport's `data-selected-count` stays at 1 when it should reach 2, so Union and
Subtract stay disabled after a marquee-select. A human who selects by marquee cannot reach the
boolean flow.

Found 2026-10-21 while driving `TODO/ACCEPTANCE.md` scenario 4. The original report also said that
a real-mouse Shift-click replaces the selection. That did **not** reproduce on 2026-10-23 (laptop
1440×900 and a 720 px window, dev server, real mouse): Shift-click on a second cube gave
`data-selected-count` 2 with Union enabled at laptop width. The Shift-click symptom is dropped from
this finding.

Reproduced by `e2e/shift-select.e2e.js` (added with this finding, chromium-laptop), in its first
form. That form held Shift alone and dragged from the top-left corner (fx 0.05, fy 0.05), which is
under the Union button, so it pressed the button and panned. See "What is established" for why it
was the spec, not the app.

1. Drop two overlapping cubes with real drags.
2. Hold Shift, drag a marquee from an empty corner to enclose both bodies, release, release Shift.
3. `data-selected-count` stayed 1; the test expected 2.

What is established (2026-10-24, real mouse, chromium-laptop, probes since removed):

- **The app's marquee works.** From an empty canvas corner, a Ctrl+Shift drag, a Select-mode
  Shift drag and a plain Ctrl drag each enclose both cubes (`enclosed=2`).
- **The failing spec used a gesture the design does not make a marquee.** Shift alone is the
  pan override (`ui-018`, `effectiveDragMode()` in `Viewport.vue`). The documented additive
  marquee is Ctrl/Cmd+Shift from empty canvas, or the Select toggle with Shift
  (`docs/selection-and-inspector.md`, "Dragging a selection box"; `docs/decisions/interaction-model-qa.md`
  marquee addendum).
- **The spec's start corner was under the Operations toolbar.** At laptop width the top-left of
  the canvas is covered by the Union button (`operation-union`), so a press there never reaches the
  viewport.
- The Shift-click cases in `e2e/shift-select.e2e.js` pass on chromium-laptop. They guard against a
  regression and are not the bug.

## Goal

A Shift-held marquee around two bodies, drawn with real mouse input, adds both to the selection.
After this, `TODO/ACCEPTANCE.md` scenario 4 can be driven by hand from a marquee select to Subtract.

## Interaction model

Not a new surface. This restores an existing trigger.

- **Precondition**: zero or one body selected.
- **Trigger**: Ctrl (or Cmd) held with Shift, then a left-drag marquee from empty canvas around the
  bodies. The Select toggle with Shift held is the other route. Shift alone pans and is not changed.
- **Feedback**: `data-selected-count` on `[data-testid="viewport"]` reaches the number enclosed;
  the toolbar reads `N selected`; Union/Subtract enable at 2.

## Documentation

Not a new user-visible control, so no new page. If the fix changes how the marquee's Shift-additive
behaviour is described, `docs/selection-and-inspector.md` gets a one-line correction. Otherwise this
section does not apply.

## Affected files

- `src/components/viewport/Viewport.vue`: `pointerdown` (sets `pressShiftKey`, `marqueeAdditive`),
  `pointerup` and `finishMarquee` (near line 3419), and `selection.selectMany`'s additive handling in
  `src/stores/` (the store, to be confirmed).
- `e2e/shift-select.e2e.js` (new, untracked): the marquee test is the RED case.

## Proposed fix

1. **Cause found (2026-10-24):** the spec, not the app. Rewrite the marquee case in
   `e2e/shift-select.e2e.js` to the documented gesture: Ctrl+Shift from the bottom-right corner
   (fx 0.95, fy 0.95) to the top-left corner (fx 0.05, fy 0.05). That corner is on the canvas and
   encloses both cubes.
2. No change to `Viewport.vue` or the selection store. Shift-only stays the pan override.
3. Keep the Shift-click guards. Keep the marquee case as the regression for real input.

## Effort

S, pending step 1. If the flag is lost in the shared pointer path, widen the fix to the click path
too and re-run the Shift-click guards.

## Testing

- **`e2e/shift-select.e2e.js`**, real `page.mouse` and `page.keyboard` only, no `dispatchEvent`.
  The marquee case is RED on current code and must go green. The two Shift-click cases stay as
  guards.
- **Engines**: all three (Chromium, Firefox, WebKit). Shift and pointer routing differ by engine.
- **Viewports**: laptop 1440×900. Shift is a desktop modifier, so tablet and phone do not apply.
- **Existing specs to re-run in full**: `boolean-operations`, `selection-inspector`,
  `inspector-object-list`.
- **Acceptance scenarios to re-drive** (`TODO/ACCEPTANCE.md`): **4** (boolean gating) at laptop, with
  the two bodies selected by marquee instead of Shift-click, through Subtract, result checked. Also
  **1** at laptop.
- **Closed findings whose repro steps must be re-run**: none. `ui-067`'s Shift-click baseline is
  not affected, because the Shift-click symptom did not reproduce.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
