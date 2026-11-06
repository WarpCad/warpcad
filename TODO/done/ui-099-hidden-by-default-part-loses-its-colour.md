---
title: A part coloured while shown goes back to its recipe colour once it is ticked Hidden by default
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-06 from the owner's screenshot report
depends: []
status: resolved
---

## Resolution

Closed 2026-11-06. The fix is `ui-098` (commit `e0309ea`). The regression case is in `e2e/part-default-hidden.e2e.js`. It fails with the pre-`ui-098` paint rule on all nine projects (0 extra green pixels) and passes with the fix (at least 35). The docs sentence is in `docs/selection-and-inspector.md`.

## Problem

**The report.** On `app.warpcad.com` (header reads `v1.11.0 · 32ffff6`), the owner drilled into the
`esp8266 feather` group, selected its part **USB clearance cutter** and set its colour to `#ff0000`.
The box drew red. They then ticked **Hidden by default** on the same part. The box is still drawn
(translucent, as a shown hidden part is), but in **dark blue**, the part's original colour, not red.
The Inspector still reads `#ff0000` with **Reset** offered, so the colour is stored. It just isn't drawn.

**Screenshots, side by side.** Same selection, same Inspector values (Size 7.6 × 10.8 × 5, Position
X −29.14, Y 2.91, Z 2.87):

| | Hidden by default | USB cutter box | Battery-Connector cutter box |
|---|---|---|---|
| Before | unticked | opaque red-orange (`#ff0000` with lighting) | dark translucent red |
| After | ticked | dark translucent **blue** | dark translucent red (unchanged) |

**Most likely cause: the deployed build predates `ui-098`.** `ui-098` (closed 2026-11-06, commit
`7b90ecb`) fixed this exact paint rule. Before it, `hiddenPartMaterial` in `src/render/mesh.js` painted
a shown hidden part from `recipeColorOf(recipeColors, partName)` only, ignoring the user's own
override. The owner's project stores USB's recipe colour as `#0073ff` (blue) in its `group.merge`
record (see `ui-098`'s table), and that is the blue in the second screenshot. But:

- `32ffff6` is the `chore(release): v1.10.0` commit, and `origin/main`'s `v1.11.0` (`560d896`) is a
  version bump on top of it. **Neither contains `7b90ecb`.**
- As of 2026-11-06, local `main` is **ahead 5, behind 2** of `origin/main`. `0031244`, `8a245c1`,
  `bf1709a`, `7b90ecb` (`ui-098`) and `9b75e0f` (`ui-097`) have not been pushed, so the hosted app
  has neither fix.

So the owner probably saw the pre-`ui-098` renderer. But this order of steps is not proven fixed
either. `ui-098`'s regression spec (`e2e/colour-selected-cutter.e2e.js`) colours a part that is
*already* hidden. No spec colours a shown part, ticks **Hidden by default**, and then reads the canvas
while the part is drawn as hidden:

- `e2e/part-default-hidden.e2e.js` checks Size, History, Undo, reload and Export, not colour.
- Acceptance scenario 13's last run (2026-11-03, `ui-093`) recoloured `Cube 2` red, ticked and then
  unticked **Hidden by default**, and compared the canvas only **after unticking**. While the part was
  hidden, Show hidden parts was off, so nothing was drawn to compare.

**Why it matters.** The clearance-cutter workflow (`ui-093`, scenario 32) is: colour the cutters, mark
them hidden by default, and then cut with them. If the colour drops at the hide step, the user can't
tell which translucent box is which. That is the confusion `ui-098` was filed for.

## Affected files

- `src/render/mesh.js:575-600` (`paintBodyObject`'s `hiddenPartMaterial`): the paint rule for a shown
  hidden part. Fixed by `ui-098` on local `main`. Confirm that it is what runs for a part that
  *became* hidden through `group.setPartHidden`, as well as one that was hidden from the start.
- `src/render/mesh.js:701` (`createHoverPartMesh`): the hover-only mesh for a hidden part when Show
  hidden parts is off. It sets `userData.hiddenPart = true`, so it should be painted by the same rule.
  Check that a repaint reaches it, because in the second screenshot the box may be drawn by hover
  rather than by the toggle.
- `src/components/viewport/Viewport.vue:1941-1960` (`shownHiddenNames`, `bodyObjectIsCurrent`): ticking
  **Hidden by default** changes `Group.names`, so the body's mesh is rebuilt. Make sure the rebuilt
  hidden-part mesh is painted with the current `overrides`, not a stale set.
- `src/core/colorOverride.js:135` (`ownOverrideOf`): reads a part's override by `subPart` name. The name
  does not change when the part is hidden, so this should hold. Note it if it doesn't.

## Proposed fix

1. **Reproduce on local `main` first** (it has `ui-098`). Run the app (`run-warpcad` skill), load
   `e2e/fixtures/cutter-colour-selected.ndjson` (the owner's project, from `ui-098`) or two grouped
   Cubes, drill into one part, colour it `#ff0000`, tick **Hidden by default**, then look at the box
   two ways: with **Show hidden parts** on, and by hovering its row with the toggle off.
2. **If it draws red both ways**, the code fix is already in `ui-098`, and this finding is about
   shipping it plus adding the missing test:
   - Add the regression test below (it should pass on `main` and fail on `32ffff6`. Check it fails on
     `32ffff6` before trusting it).
   - The owner reconciles `main` with `origin/main` (`git pull --rebase`, since the two remote commits
     are bot release bumps) and pushes, so Pages deploys `ui-098` and `ui-097`. Pushing is the owner's
     step, and the pre-push gate needs a stored full run for the rebased commit.
   - Confirm on `app.warpcad.com` once the header shows the new commit.
3. **If it still draws blue on `main`**, the hide step goes around `ui-098`'s rule. Likely
   places: the rebuilt mesh is painted before the new `overrides` reach `paintBodyObject`, or the hover
   transient is added after the paint pass and keeps the `bodyMaterial` it was created with. Fix it so
   every hidden-part mesh is painted by `hiddenPartMaterial` with current overrides, and add a
   `mesh.spec.js` case for the path that failed.

Either way, the colour rule stays as `ui-098` set it: a part's **own** override, else its recipe colour.
A whole-body colour still does not repaint a hidden part.

## Interaction model

Not applicable. This is a defect in two existing controls, the Inspector's colour swatch and its
**Hidden by default** checkbox (`ui-093`). It adds no control and changes no trigger.

## Documentation

- **Page:** `docs/selection-and-inspector.md`, the paragraph on colouring a hidden piece (around line
  467). Add one sentence: a colour set on a piece before you tick **Hidden by default** stays with it.
  Example: *drill into `Cube 2`, set its colour to red, tick **Hidden by default**, turn on **Show
  hidden parts**: the translucent box is red.*
- **Media:** none new. The existing shots don't show a coloured hidden part, and a sentence is
  enough.

## Effort

S (< 1 hr) if step 2 applies: one spec, one doc sentence, and the owner's push. M if step 3 applies.

## Testing

- **RED first:** a new test in `e2e/colour-selected-cutter.e2e.js` (it already loads the owner's
  project) or in `e2e/part-default-hidden.e2e.js`. It navigates to `/`, drills into a **shown** part,
  sets its colour to `#ff0000`, ticks **Hidden by default**, turns on **Show hidden parts**, and asserts
  the box's canvas pixels are red, not its recipe colour. Then it turns the toggle off, hovers the
  part's row, and asserts the hover overlay is red too. Last, it unticks **Hidden by default** and
  asserts the part is opaque red. Check that the spec fails against the `32ffff6` renderer before
  closing, or it proves nothing.
- **Unit:** if step 3 applies, a `src/render/mesh.spec.js` case for the path that failed.
- **Engines and viewports:** this reads rendered canvas colour, which is WebGL, so it runs on Chromium,
  Firefox and WebKit. It runs at phone, tablet and laptop as well, as the rest of
  `colour-selected-cutter.e2e.js` does (nine projects).
- **Acceptance scenarios to re-drive:** 13 (recolour a placed body; this time compare the canvas while
  the part is hidden and shown, not only after unticking), 6 (group vs. sub-part selection) and 32
  (merge two groups and cut with a hidden part).
- **Closed findings whose repro steps get re-run:** `ui-098` (colour an already-hidden cutter in the
  owner's project: only that box changes), and `ui-093`'s "Done means" Group steps (Size, History, one
  Undo), since the test drives the same checkbox.
- **Testing debt nearby:** `testing-016` (canvas "same" checks in `part-default-hidden.e2e.js` flake).
  If the new test goes in that file, use a colour-channel threshold, not exact pixel equality.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
