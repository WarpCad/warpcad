---
title: The header, toolbars and side panels ignore the notch and home-indicator safe areas
category: ui
kind: finding
priority: medium
model: sonnet
milestone: M19
depends: [build-017]
status: done
---

> **What shipped:** the CSS and viewport half of the fix. `viewport-fit=cover` is on, the four
> `--layout-safe-*` variables live in `src/styles/tokens.css`, and the header, the phone tab bar,
> the Library rail, the Inspector and the navigation chrome read them. The 14 direct
> `env(safe-area-inset-bottom)` uses now read `--layout-safe-bottom`. `e2e/safe-area.e2e.js`
> asserts the chrome sits inside faked iPhone 15 insets. The device-level hypothesis (what iOS
> really does with the notch and home indicator) is **not** confirmed; that needs the simulator or
> hardware, and the home-indicator tap-zone item (step 5) has only the tab bar's growth behind it.

## Problem

`../warpcad-native/TODO/M19-build-017-tauri-ios-shell-scaffold.md:66-69` says the native app "must respect the notch
and home-indicator safe areas (`viewport-fit=cover` plus the existing `env(safe-area-inset-*)`
padding)". Two things in the code do not match that sentence:

1. **`viewport-fit=cover` is not set.** `index.html:5` is
   `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`. Without it, the
   `env(safe-area-inset-*)` values are 0 in Safari.
2. **The "existing padding" covers bottom sheets only.** All 14 uses of `env(safe-area-inset-…)` in
   `src/` are `safe-area-inset-bottom`, in eleven sheet or dialog components (`SplitSheet`,
   `SaveToLibrarySheet`, `ShareSheet`, `SharedView`, `UserPartMenu`, `UpdateToast`, `ModalShell`,
   `DependentRepairDialog`, `VariableUsageDialog`, `ParamBindPopover`, `FormulaInsertList`). There
   is **no** `safe-area-inset-top`, `-left` or `-right` anywhere, and nothing in the always-visible
   chrome uses any inset: `src/views/AppView.vue` (the header), `layout/LibraryPanel.vue` and
   `LibraryRail.vue`, `inspector/Inspector.vue`, `viewport/NavigationChrome.vue`,
   `viewport/OperationsToolbar.vue`, `timeline/TimelinePanel.vue`, `ai/ChatPanel.vue`.

**What this is expected to cause (hypothesis, per platform).** It cannot be confirmed without the
shell on a device or simulator, because Playwright's WebKit reports zero insets.

- **iOS and iPadOS app (WKWebView):** a Tauri web view fills the screen. Either the header sits
  under the status bar and Dynamic Island and the bottom toolbar under the home indicator (if the
  web view is edge to edge), or the system insets the web view and paints bars of
  `backgroundColor` above and below (if it is not). Which one happens depends on wry's default for
  `contentInsetAdjustmentBehavior`, which is not set in `src-tauri/`. Landscape on a notched iPhone
  adds left and right insets, where the Library rail and the Inspector sit.
- **Installed PWA on iOS (web, today):** the same question, in Safari's standalone mode.
- **Android app:** edge-to-edge is the default from Android 15; the gesture bar overlaps the
  bottom toolbar the same way.
- **macOS and Windows:** not affected.

## Interaction model

No new control. Layout of existing chrome only.

- **Precondition / Trigger / Placement / Selection response / Selection count**: n/a.
- **Feedback**: on a notched phone no control is under the status bar, the Dynamic Island, the
  rounded corners or the home indicator, in portrait and in landscape; the 3D view still runs edge
  to edge behind them.
- **Small-screen behavior**: this is the small-screen behaviour. Tablet and laptop are unchanged
  where insets are zero.

## Documentation

Does not apply: no control is added or changed. `docs/mobile.md` needs no edit unless the phone
screenshots move, in which case `npm run docs:media` regenerates them.

## Affected files

- `index.html:5`
- `src/styles/` (four layout variables), `src/views/AppView.vue` and the seven chrome components
  named above
- `e2e/fixtures/nativeShell.js` (a way to fake insets)

## Proposed fix

1. Add `viewport-fit=cover` to the viewport meta.
2. Define the insets once, in `src/styles/`:
   `--layout-safe-top: env(safe-area-inset-top, 0px)` and the other three. Components read the
   variables, never `env()` directly, which also lets a test set them.
3. Apply them at the edges, not per control: the app header's `padding-top` and left/right; the
   bottom toolbar and phone tab bar's `padding-bottom`; the Library rail's left; the Inspector's
   right; `NavigationChrome` and the orientation gizmo's offsets. The canvas keeps the full screen.
4. Replace the 14 direct `env(safe-area-inset-bottom)` uses with the variable (`ui-116`'s
   `BaseSheet` then owns it for sheets).
5. Check `--tap` targets still clear the home indicator's swipe zone: a control whose whole tap
   target sits inside the bottom inset is unusable even when visible.

## Effort

S–M for the CSS; the device check is the long part.

## Testing

- `e2e/safe-area.e2e.js` (new, navigates to `/`): sets the four `--layout-safe-*` variables on
  `<html>` to iPhone 15 values (top 59px, bottom 34px; landscape: left and right 59px, bottom 21px)
  and asserts by bounding box that the header, the phone tab bar, the operations toolbar, the
  Library rail and the navigation chrome lie wholly inside the safe rectangle, and that the canvas
  still spans the full viewport. Phone and tablet projects, portrait and landscape, with a snapshot
  at each; laptop asserts nothing moved. Canvas is involved only as a bounding box: Chromium plus
  WebKit.
- **The hypothesis itself needs a device or the simulator.** In the iOS simulator's build of the
  shell (no signing needed), on an iPhone with a Dynamic Island: screenshot portrait and landscape
  before and after, and record which of the two failure shapes above was real. Then the same on the
  owner's iPhone in scenario 28 (`testing-011`), and once in Safari with the PWA added to the home
  screen. `testing-027` already drives iOS safe-area rows in Safari: add these.
- Android: confirm on an emulator when `build-024`'s SDK is installed. Until then, hypothesis only.
- Acceptance scenarios to re-drive: 7 (touch-only viewport navigation) at the phone viewport with
  the fake insets set; 28 on the device.
- Closed findings whose reproductions re-run: `ui-070` (the phone Inspector tab over the Library
  sheet), `ui-085` (Library sheet scrolling sideways in Safari).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
