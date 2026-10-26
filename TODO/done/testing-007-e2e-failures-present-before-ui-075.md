---
title: Triage the e2e specs that fail on a clean tree (colour control, selection, sketch operand, help footer)
category: testing
kind: finding
priority: high
model: sonnet
depends: []
status: done
---

## Resolution (2026-10-18, closed 2026-10-26)

Driven by hand with a debug spec at the phone viewport: the app is right and the specs were wrong.
Once a body exists, the phone Library sheet sits higher (the scene-list bar docks under it,
`ui-070`), so its handle is at about y=367. The specs' second drop at `fy: 0.4` (y about 369) landed
on the sheet and was ignored, which is why `data-body-count` stayed at `1`.

- `inspector-color-control`, `selection-inspector` (`:515`, `:807`) and `sketch-primitive`
  (`:215`, `:463`): second drops moved to `fy: 0.3`. Green on chromium, firefox and webkit phone,
  and chromium laptop.
- `help.e2e.js` footer: the firefox/webkit laptop and phone baselines predated `build-011`'s
  notices link; regenerated after looking at the image.
- Not in this list, found in the same run: `ai-mcp-agent-pairing.e2e.js` asserted the transient
  "enabled until" text when an attached client takes the bridge straight to `connected`; it now
  asserts `data-state`. The `print-prep` still is `testing-008`.

Closed 2026-10-26: the changed-scope run (the five specs above, all nine engine-viewport projects)
found one more stale baseline, `help-from-align.png` (the Align popover rows changed in `ui-086`/`ui-088`);
regenerated for all nine projects after checking that everything around the masked images was right.
Result: 529 passed, 0 failed, 94 skipped. Scenarios 1 and 4 and the `ui-072` phone repro were re-driven
by hand (see `TODO/ACCEPTANCE.md`); scenario 4's two bodies did not overlap, so material removal was not
re-checked.

## Problem

The full e2e run on 2026-10-18 was red, and the same specs fail with `ui-075`'s `AppView.vue`
change stashed, so they were failing before it. They reproduce when run alone, so they are not
load flakes (`TODO/testing-003` and `testing-004` cover that class).

- `e2e/inspector-color-control.e2e.js:249, :298, :331, :351`: after dragging a cylinder in,
  `data-body-count` stays at `1` (expected `2`).
- `e2e/selection-inspector.e2e.js:515` (trusted touch tap; `cylinder` is undefined in
  `sceneBodies`) and `:807` (Shift marquee; expected 2 selected, got 1).
- `e2e/sketch-primitive.e2e.js:215` and `:463` (a sketch body as a boolean operand; Delete in
  the editor): a viewport attribute expected `true`, got `false`, with `data-body-count="1"`.
- `e2e/help.e2e.js:270`: the `help-footer.png` snapshot differs by 1070 pixels
  (`build-011`'s notices link).

The common thread in the first four is a second body that never lands after a drag, which is
`ACCEPTANCE.md`'s "place a box and a sphere, confirm both remain visible" class of failure:
find out whether it is the specs or the app.

## Affected files

- the four specs above; `docs/screenshots/` or the `help.e2e.js` baseline for the footer

## Proposed fix

Drive the failing flow by hand with the `run` skill first (drag a cube, then a cylinder, at
laptop and phone). If the app drops the second drag, that is a regression: find the commit with
`git bisect` over the specs and fix the app. If the app is fine, fix the specs' drag helper.
Update the `help-footer` baseline only after looking at the new image.

## Effort

M (a few hours).

## Testing

- The listed specs pass on all engines.
- Acceptance scenarios: the multi-body scenarios in `TODO/ACCEPTANCE.md` (place two solids,
  boolean operands), driven by hand.
- Closed-finding regression: `ui-072` (phone Library drag does not register), since it is the
  same drag path.
- Engines: all three.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
