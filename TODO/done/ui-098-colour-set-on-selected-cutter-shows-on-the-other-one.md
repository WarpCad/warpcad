---
title: Colouring "Battery-Connector clearance cutter" turned the USB clearance cutter red, and the Battery-Connector cutter stayed blue; the selection the Inspector shows doesn't match the object the user clicked
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-06 from a screenshot report
depends: []
status: done
---

> **What shipped (2026-11-06).** Picking was correct, so no pick or selection change was made. The
> defect was in the renderer: a hidden part shown with Show hidden parts was painted from its recipe
> colour only, so a colour set on it was recorded but never drawn. `src/render/mesh.js` now paints a
> shown hidden part with its own sub-part override, else its recipe colour, and a live picker preview
> for that part shows too. A whole-body colour still does not repaint a hidden part. The regression
> spec is `e2e/colour-selected-cutter.e2e.js` (fixture `e2e/fixtures/cutter-colour-selected.ndjson`,
> the full owner project), which failed before the fix and passes on all nine engine-viewport
> projects. `mesh.spec.js` gained two cases. `docs/selection-and-inspector.md` gained a paragraph on
> colouring a hidden part. Acceptance scenario 6 was driven by hand at laptop Chromium and passes.
>
> The owner's expectation is that both translucent cutters can end up red once coloured. The spec
> checks the Battery-Connector case: colouring it turns its box green while USB stays red.

## Problem

**The report.** On `app.warpcad.com` (v1.10.0, `934656a`), the user selected the
**Battery-Connector clearance cutter** in the viewport, set its colour to `#ff0000`, and the cutter
still renders blue.

**What the screenshot shows.** The Inspector header reads **USB clearance cutter**, its colour is
`#ff0000`, its Position is X −29.14, and its note says *"This colours only USB clearance cutter."*
The viewport shows a red translucent box on the left (the USB cutter) and a blue translucent box at
the front right (the Battery-Connector cutter). **Correction (2026-11-06, from the owner):** the red
on the USB cutter is not the defect. Both translucent cutters are meant to be red once the user
colours them. The defect is that colouring the Battery-Connector cutter did not turn its box red.
The Inspector's header named the object the user had selected, so the red-on-USB result is not the
selection being wrong; it is a rendering problem. **Reported 2026-11-06:** the user selected the
cutter by clicking the blue box in the viewport, not from the Objects list.

Two explanations fit the screenshot. Neither is confirmed:

1. **Picking or selection.** The click on the blue box selected the USB cutter, probably because
   the two cutters overlap on screen and the ray hit the other one, or a stale selection from an
   earlier click remained. The colour then went to the object the Inspector names, which is
   correct for that selection. The viewport gave no signal that a different object was selected.
   No selection outline was visible on either box in the screenshot.
2. **Colour rendering.** The colour was written to the Battery-Connector cutter, but the blue box
   is drawn from something else (a cached mesh, the cutter's default material, or a second copy).
   This would contradict the Inspector's own statement, so it is the less likely reading.

**Why it matters.** Cutters are translucent and hidden-by-default, and several overlap around the
same board. A user who can't tell which object they have selected can't colour, move or align the
right one. The selection-count rules and the inspector-panel feedback contract depend on the
Inspector naming the object that is actually selected.

**What the saved project shows.** The user saved the project to
`~/Documents/cutter-color-issue.ndjson` (70 lines, 2026-11-06). It has the two cutters as members of
the `esp8266 feather` group, and the colour records are:

| Record | Op | Target | Colour | Note |
|---|---|---|---|---|
| `group-duolka-971` | `group.merge` | Battery-Connector cutter | `colors["Battery-Connector clearance cutter"] = 16711693` (`#ff000d`) | Battery's colour is keyed by its name in the group's member list |
| `group-duolka-970` | `group.merge` | USB cutter | `colors["USB clearance cutter"] = 29695` (`#0073ff`, blue) | USB's colour, keyed by its name |
| `group-duolka-971-color-duolka-974` | `style.recolor` | `subPart: "USB clearance cutter"` | `colorOverride 16711680` (`#ff0000`) | The user's last colour write: the Inspector's `#ff0000` on USB |

Two things follow from the file, and they are the reason the RED step needs this file:

1. **The last colour write went to the USB cutter.** Record `…-974` is the `#ff0000` the Inspector
   showed, with `subPart: "USB clearance cutter"`. So when the user coloured the cutter they meant,
   the selection (or the write's target) was already USB. That supports explanation 1 (picking or
   selection), not a rendering fault on the write path.
2. **The Battery-Connector cutter renders blue even though its stored colour is red.** Its record
   holds `#ff000d`, but the viewport draws it `#0073ff`-ish blue, which is the value stored for the
   USB cutter. The per-member colour map looks keyed by name, and the render path seems to read the
   wrong member's colour. That is a second defect, separate from the selection bug, and it would
   show up even if picking were correct. Confirm by loading this file in the app and comparing the
   rendered colour of each box with the table.

**Reproduce on this file first:** File ▸ Open `~/Documents/cutter-color-issue.ndjson`. Click the
blue box in the viewport, read the Inspector header, and compare with the table. If the header says
USB, bug 1 is confirmed. Then check whether the blue box is the Battery-Connector cutter, and whether
its colour is the one in its record. If it is blue while its record says red, bug 2 is confirmed.

## Affected files

To confirm during the RED step. Candidates from the codebase's layout, not yet read:

- `src/components/viewport/Viewport.vue` (`pickAt`, the pick-to-selection path): which object a
  click resolves to when two translucent boxes overlap.
- `src/stores/selection.js`: selection state the Inspector reads.
- `src/components/inspector/` (the colour control and the header name): what object the colour
  write targets, and whether it uses the selection or a stale id.
- The viewport's colour-to-material path (in `src/render/` or the viewport component): whether the
  rendered colour follows the document's colour field for that object.

## Proposed fix

Do not fix yet. First reproduce, then choose the fix.

1. **Reproduce on the same project** (the user's document, or a trimmed copy with the two cutters
   and the feather). Click the blue box in the viewport. Read the Inspector header. Set the colour.
   Record which object's `colour` changed in the document, and which box turned red.
2. **If the click selects the wrong object** (explanation 1): fix picking so the object the user
   sees under the pointer is the one selected. Consider whether overlapping translucent objects
   should resolve to the nearer surface, the one whose bounds contain the click, or the most recent
   candidate. Add a visible selection outline so the user can see what is selected.
3. **If the colour lands on the right object but renders on the wrong box** (explanation 2): fix
   the render path so the mesh's material follows the object's colour field, and add a regression
   test that changing one object's colour leaves the other's unchanged.

Whichever branch applies, the Inspector header should match the selected box, and that match is
the contract to test.

## Interaction model

Not applicable. This is a defect in an existing control (selection and colour), not a new control or
gesture. If the fix adds a selection outline, that is a visible change and needs its own spec.

## Documentation

Not applicable unless the fix changes documented selection behaviour. If the outline is added,
`docs/selection-and-inspector.md` gets a sentence describing it.

## Effort

M (a few hours). Picking and rendering are both candidates, and the reproduction decides which.

## Testing

- **RED first:** an app-level `e2e/colour-selected-cutter.e2e.js` that navigates to `/`, loads a
  trimmed copy of `~/Documents/cutter-color-issue.ndjson` as its fixture (the two overlapping cutters
  and the `esp8266 feather` group; copy it into the repo's fixtures, do not reference the home folder), clicks the Battery-Connector cutter in the viewport,
  asserts the Inspector header names that cutter, sets its colour, and asserts that only that
  cutter's rendered colour changes. Fails today, on the screenshot's behaviour.
- **Unit:** the pick resolver (if changed) with two overlapping boxes, asserting the nearer one or
  the one under the pointer is chosen.
- **Engines and viewports:** the picking path is canvas and pointer input, so the spec runs on
  Chromium, Firefox and WebKit, at phone, tablet and laptop viewports, with a snapshot at each.
- **Acceptance scenarios to re-drive:** scenario 6 (group vs. sub-part selection), and any scenario
  that places two overlapping objects and selects one of them.
- **Closed findings whose repro steps get re-run:** none identified yet. If the fix touches
  `pickAt`, re-run the closed picking findings listed in `TODO/done/` (search for "pick" or
  "Shift-click") before closing.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
