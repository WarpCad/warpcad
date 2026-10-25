---
title: Stop the Library sheet scrolling sideways in Safari
category: ui
kind: finding
priority: medium
model: sonnet
depends: []
status: open
---

## Problem

In desktop Safari the Library column (the labels tier, laptop width) scrolls sideways by a few
pixels. A trackpad swipe, or a vertical scroll with a slight sideways drift, moves the whole list
left. The first letters of the section headings are then cut off ("RIMITIVES", "ARDWARE",
"IT PARTS", "ASPBERRY PI"), the row icons and the hint text ("place it.") are clipped at the left
edge, and a horizontal scrollbar shows along the bottom of the column. Chrome on the same build
does not do this. Reported 2026-10-25 by the owner on `app.warpcad.com` v1.0.0 (`acdda3c`),
Safari desktop, with a screenshot.

This is not cosmetic. The Library is where every placement starts (scenario 1). A list that slides
sideways under a drag gesture looks broken, and on a trackpad it shifts while the person is aiming
at a row.

**Two things in `src/components/layout/LibraryPanel.vue` combine to produce it (likely cause, not
yet measured):**

1. **`.library__sheet` sets only `overflow-y: auto`** (`LibraryPanel.vue`, the `.library__sheet`
   rule, about line 469). Per CSS, when one axis is not `visible` the other `visible` axis
   computes to `auto`. So the sheet is a horizontal scroller too, and any inline overflow, even
   1 px, can be scrolled.
2. **The hint row's Help button overhangs to the right on purpose.** `.library__help` has
   `margin: -14px -8px -14px 0` (`TODO/ui-061`: "the 44px target overhangs the hint's line
   instead of growing the row"). The `-8px` inline-end margin pushes the button's border box
   8 px past the sheet's content edge, into its 12 px right padding. Chromium measures scrollable
   overflow from the child's *margin* box, which still ends at the content edge, so nothing
   overflows. WebKit appears to count the *border* box and then add the scroller's inline-end
   padding after it, which yields about 8 px of horizontal overflow. That fits the amount the
   screenshot shows clipped.

**Other suspects to rule out while measuring** (any of these could add to the overflow, or be the
real cause if (2) turns out not to be):

- The variant `<select>`s under Bolt / screw, Phone and Raspberry Pi. `TODO/ui-031` gave
  `.library__item` a `minmax(0, 1fr)` track so a long option shrinks to the panel. WebKit gives a
  native `<select>` its own intrinsic minimum width, which a grid track may not be able to shrink.
- WebKit's classic, always-shown scrollbar (macOS "Show scroll bars: Always", or a mouse
  attached) takes about 15 px off the sheet's width. Chrome's overlay scrollbar takes none. A
  layout that fits exactly in Chrome can be a few pixels too wide in Safari.
- The same `overflow-y`-only pattern in the other Library scrollers: `LibrarySectionPopout.vue`
  (pop-out tier) and `LibraryRail.vue` (icon rail).

The existing width guard does not catch this. `e2e/panel-tiers.e2e.js` asserts
`document.documentElement.scrollWidth > window.innerWidth` is false, but that checks only the
*page*. This overflow is inside the sheet's own scroller, so the page check passes on every engine.

## Interaction model

Not a new surface. This fixes the layout of an existing one. No trigger, precondition or feedback
changes.

- **Precondition**: n/a.
- **Trigger**: n/a. The defect shows on any horizontal wheel or trackpad delta over the Library
  sheet, and on keyboard focus moving into a clipped control.
- **Feedback**: after the fix, the sheet cannot move sideways. Headings, icons and the hint stay
  fully visible, and there is no horizontal scrollbar.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: the phone bottom sheet (`@media (max-width: 640px)`) uses the same
  `.library__sheet` element, so the fix applies there too and must be checked there. The 44 px
  Help target from `ui-061` must keep its size and must not grow the hint row at any width.

## Documentation

No control or behaviour changes, so there are no docs page changes. `docs/hardware-library.md` and
`docs/user-library.md` already describe the Library correctly. No `e2e/docs/` shots or movies are
added or changed. If a docs shot of the Library sheet changes by more than its threshold after
the fix, that is a regression to look at, not a re-baseline.

## Affected files

- `src/components/layout/LibraryPanel.vue`: `.library__sheet` (about line 469) and `.library__help`
  (about line 490)
- `src/components/layout/LibraryRow.vue`: `.library__item` / `.library__choice` (the variant
  selects), only if measurement implicates them
- `src/components/layout/LibrarySectionPopout.vue`, `src/components/layout/LibraryRail.vue`: same
  check on their scrollers
- `e2e/panel-tiers.e2e.js`, or a new `e2e/library-sheet-overflow.e2e.js`

## Proposed fix

1. **Measure first, in WebKit.** At 1440×900 on `webkit-laptop`, read
   `#library-sheet`'s `scrollWidth` and `clientWidth`. Then walk its descendants and log any
   element whose `getBoundingClientRect().right` is past the sheet's content edge
   (`sheet.getBoundingClientRect().right - paddingRight - scrollbarWidth`). Record the offenders
   and the pixel count in this file before changing anything. Do the same on `chromium-laptop`
   for comparison.
2. **Remove the overflow at its source.** If it is the Help button, keep `ui-061`'s intent (a
   44 px target that does not grow the row) without a negative inline-end margin. For example,
   keep the negative block margins, drop the `-8px` right margin and let the hint text take the
   space (`flex: 1; min-width: 0` on `.library__hint`). Or reach the 44 px with an `::after` hit
   area that stays inside the content box. If it is the variant selects, give them `min-width: 0;
   width: 100%` (or `max-width: 100%`) so WebKit's intrinsic select width cannot set the track.
3. **Then make the sheet a vertical-only scroller:** `overflow-x: hidden` beside `overflow-y: auto`
   on `.library__sheet`. Apply the same to the pop-out and rail scrollers if step 1 found them
   affected. `overflow-x: clip` is not an option, because it computes to `hidden` next to a
   scrolling axis anyway. Do this *after* step 2, not instead of it. On its own, `hidden` would
   leave the overflowing content clipped (a Help button with its right edge or focus ring shaved
   off), and the test below still measures `scrollWidth`, so it would keep failing.
4. Check that the Help button's focus ring (`outline-offset`) is not clipped by the new
   `overflow-x: hidden`. If it is, move the ring inward (`outline-offset: -2px`) rather than
   bringing back the overhang.

## Effort

S (< 1hr)

## Testing

- **App-level e2e, real interaction:** extend `e2e/panel-tiers.e2e.js`, or add
  `e2e/library-sheet-overflow.e2e.js`, navigating to `/`. At the labels tier (laptop 1440×900)
  and at phone 390×844 with the Library sheet open:
  - assert `#library-sheet` `scrollWidth <= clientWidth`;
  - hover the sheet, send `page.mouse.wheel(60, 0)` (a sideways trackpad delta), and assert the
    sheet's `scrollLeft` is still `0` and the `PRIMITIVES` heading's left edge has not moved;
  - assert the Help button (`.library__help`, beside `data-testid="library-hint"`) still has a 44×44 px box
    and the hint row's height is unchanged from before the fix (the `ui-061` contract).
  - At the pop-out tier (760×900), open one section pop-out and run the same `scrollWidth` and
    wheel checks on its scroller.
- **Engines: all three, WebKit required.** The bug is WebKit-only by report, so a
  Chromium-only spec would pass before and after the fix and prove nothing. Confirm the new
  assertions **fail on `webkit-laptop` before the fix** (the RED step) and pass on Chromium,
  Firefox and WebKit after it.
- **Viewports:** laptop and phone, as above, plus tablet as a no-change check (the icon rail
  has its own scroller). Snapshots at all three are not needed for this finding, because the
  existing `panel-tiers` snapshots already cover the layout and should not change.
- **Acceptance scenarios to re-drive:** scenario 1 (two independent primitives, dragged from the
  Library). Drive it by hand at laptop width on WebKit and Chromium, with real `page.mouse` drags
  from the rows, after a sideways wheel over the sheet. Scenario 3 (kit assembly from the Library)
  if the variant selects were changed.
- **Closed findings whose repro to re-run:** `ui-061` (the Help target overhangs instead of
  growing the row: re-check the hint row height and the 44 px target) and `ui-031` (a long
  variant option shrinks to the panel instead of widening the row: choose "Galaxy S25 Ultra" and
  check the row width), because this fix changes both rules.
- **Manual, one-off (`TODO/VERIFY.md`):** the owner checks real desktop Safari with a trackpad on
  the deployed build. A sideways two-finger swipe over the Library does nothing. Check both with
  "Show scroll bars" on Automatic and on Always, since the classic-scrollbar case is one of the
  suspects above.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
