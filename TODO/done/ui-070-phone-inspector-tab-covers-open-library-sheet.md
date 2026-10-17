---
title: At phone width, dock the Inspector's collapsed tab below an open Library sheet instead of over its rows
category: ui
kind: finding
priority: high
model: sonnet
milestone: M17
depends: []
status: done
---

> **Retirement note (2026-10-17):** shipped as proposed. `AppView.vue` sets `data-library-sheet` and, for Library open + Inspector tab, `--inspector-bottom: 0px` and `--library-bottom: var(--inspector-tab-height)`; the Inspector and Library phone `bottom` read them. Also removed the older unscoped `padding-bottom` workaround in `LibraryPanel.vue` (rows scrolling clear of the tab), which the lift makes redundant. The spec measures the Library *panel* box, not `library-rows` (an inner list taller than the clipped sheet), and asserts every visible row's centre via `elementFromPoint`. New docs shot `mobile-library-with-selection.png`; the three mobile movies were regenerated because their spec file changed.

## Problem

Reported by the user on 2026-10-16 while hand-checking `core-058` on a phone. With a body
selected (a **PiTFT 2.2 1** just dropped) and the Library sheet open, the Inspector's
collapsed tab, a 44 px bar reading **PiTFT 2.2 1**, is drawn **on top of** the Library
sheet's rows. In the user's screenshot it covers **Active Cooling Fan** and the top of
**Raspberry Pi Screen**, so those rows can't be read or tapped where the bar sits.

The cause is two fixed positions that assume the Library is always collapsed:

- `src/components/inspector/Inspector.vue:1345-1356`: at `max-width: 640px` the Inspector is
  `position: absolute; bottom: var(--library-tab-height, 52px); z-index: 11`. Its comment
  says it stacks "directly above the Library sheet's collapsed tab rather than on top of it".
  That is true only while the Library is *collapsed*.
- `src/components/layout/LibraryPanel.vue:1071-1117`: the phone Library is
  `position: absolute; bottom: 0; z-index: 10`. When open, its tab and a `max-height: 46vh`
  sheet of rows grow upwards from the bottom edge.

So with the Library open, its rows fill the band starting 52 px above the bottom edge, and
the Inspector tab (z 11 over z 10) sits right across them. `AppView.vue:102-116` arbitrates
the one bottom-sheet slot: the Inspector "declines to auto-open" while the Library is up.
That stops the Inspector **sheet** from opening over the Library, but the Inspector **tab**
still renders, and nothing moves it out of the way.

This is the same tab-covers-a-control defect class already found and fixed three times for
other sheets, each found by hand rather than by a spec:
- `ui-010`: the Library tab over the nav chrome.
- `ui-011`: two sheets stacking into unreadable mush.
- `ui-032`/scenario 12: the Inspector tab over the History sheet's last row, fixed with
  `--bottom-panel-bottom` in `AppView.vue:445-463`.

The History fix is the precedent: it lifts the History sheet clear of whichever tabs are
showing. The Library never got the same treatment.

It shows up in normal use. Scenario 1 places several shapes in a row from an open Library,
and every drop leaves the new body selected, so the Inspector tab appears over the sheet
after the very first drop.

## Affected files

- `src/views/AppView.vue`: add a `data-library-sheet` attribute (`open` / `closed`, from
  `libraryOpen`) next to `data-inspector-sheet` (`:267`), plus phone-width rules setting two
  new custom properties for the Library-open + Inspector-tab state (see Proposed fix).
- `src/components/inspector/Inspector.vue:1350`: the phone `bottom` reads a property
  (`var(--inspector-bottom, var(--library-tab-height, 52px))`) instead of always the
  Library tab height.
- `src/components/layout/LibraryPanel.vue:1074-1076`: the phone `bottom` reads
  `var(--library-bottom, 0px)` instead of `0`.
- `e2e/phone-sheet-stacking.e2e.js` (new): see Testing.

## Proposed fix

Stack, don't overlap: **while the Library sheet is open and the Inspector is a tab, dock the
Inspector tab on the bottom edge and lift the whole Library panel above it.** This is the
same move `--bottom-panel-bottom` makes for History.

```css
@media (max-width: 640px) {
  .app__body[data-library-sheet='open'][data-inspector-sheet='tab'] {
    --inspector-bottom: 0px;
    --library-bottom: var(--inspector-tab-height);
  }
}
```

Everything else stays where it is:
- With the Library collapsed, the Inspector keeps sitting on the Library tab, as now.
- The Inspector **sheet** still never opens over an open Library. Tapping the Inspector tab
  still claims the slot and collapses the Library (`libraryCollapse`, unchanged), so the
  `open` state needs no new rule.
- The viewport's `--viewport-bottom-inset` rules are unchanged: an open Library sheet
  already covers the bottom of the canvas by design.

**Considered and rejected: hiding the Inspector tab while the Library is open.** It is
simpler (one `v-show`), but it hides the only on-screen sign of what is selected (the tab
names it), and the one-tap way back to its controls. After a drop, the user has just made
that selection and may want to adjust it.

Keep the Library's `max-height: 46vh` as is. Lifting the panel 44 px still leaves the
toolbar and nav chrome clear at 390×844. Measure this rather than assume it, the way
`--bottom-panel-height` was sized (`AppView.vue:398-411`).

## Effort

S. Two custom properties, one attribute, one rule, one spec.

## Testing

- **E2E** (`e2e/phone-sheet-stacking.e2e.js`, navigates to `/`, phone and tablet projects,
  real pointer drag from the Library):
  1. Open the Library sheet.
  2. Drag a part in, so a body is selected and the Inspector shows its tab.
  3. Assert the Inspector tab's bounding box does not intersect the Library sheet's
     (`library-rows-*`) box.
  4. Assert every row in the open Library is clickable at its centre: `elementFromPoint` at
     each row's centre returns that row or a descendant, never the Inspector tab.
  5. Scroll the sheet to the end and check the last row (`raspberrypi.screen`'s choice
     select) the same way.
  6. Tap the Inspector tab: the Library collapses and the Inspector opens (the slot
     arbitration still holds).
  7. Snapshot at each viewport.

  Laptop: no sheets, so assert the layout is unchanged (Library column, Inspector column).
  The phone bottom sheets are where this has broken before on WebKit (scenario 12's
  original find), so run **all three engines** at phone and tablet. Firefox runs locally only.
- **Unit**: none; this is layout only.
- **Acceptance scenarios to re-drive by hand**:
  - **1** (two independent primitives, at phone width: the drops happen with the Library
    open, which is exactly this state).
  - **6** (group vs. sub-part selection, at phone width: selection drives the Inspector tab).
  - **12** (History at phone width: `--bottom-panel-bottom` must still clear both tabs).
- **Closed findings whose repro gets re-run**: `ui-010` (Library tab vs. nav chrome),
  `ui-011` (two sheets never overlap), `ui-032`'s scenario-12 find (the Inspector tab over
  the History sheet's last row) and `ui-046` (raised nav chrome). Each touched the same
  phone bottom-slot layout this changes.

## Documentation

- **Page**: `docs/mobile.md` (phone layout). Add one sentence: with the Library open and
  something selected, the Inspector's tab sits along the bottom edge under the Library, and
  tapping it switches to the Inspector.
- **Example**: "On a phone, open **Library**, drag a **Cube** onto the grid. The Library
  stays open, and the Cube's tab (**Cube 1**) waits along the bottom edge below it. Tap
  **Cube 1** to close the Library and see the Cube's controls."
- **Media**: if `e2e/docs/mobile.docs.js` shows the Library sheet with a selection, re-run
  `npm run docs:screenshots:update` for that shot and look at it. If no shot shows this
  state, add one (`mobile-library-with-selection.png`, embedded in `docs/mobile.md`).

## Notes

Found during the `core-058` VERIFY check (`TODO/VERIFY.md`, 2026-10-16). Both of that
task's checks passed; this is what the user saw while doing them.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
