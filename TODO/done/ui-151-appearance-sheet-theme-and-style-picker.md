---
title: Pick the theme or style from File ▾ → Appearance…, reachable whether or not Help loads
category: ui
kind: feature
priority: high
model: sonnet
milestone: none — Findings table, requested by the owner 2026-11-19 and scheduled first
depends: []
status: done
---

> **What shipped (2026-11-19):** as filed. Two small additions: the File menu's last group is now headed **App** (it holds Appearance… and Help and documentation), and `ThemePicker` takes a `phoneColumns` prop so only the new sheet shows two tile columns at phone width and Help's layout and baselines stay as they were. Help's Contents gained the Appearance page, which moved six docs stills and the Help sheet baselines. The old `help-theme-control` still was retired with its Help picture.

## Goal

A user can choose how WarpCad looks (one of the three modes **System · Dark · Light**, or one of the
six styles **Kids · Glass · Art Deco · Minimal · Blueprint · Pixel**) from a control that is easy to
find and is always there. Today the picker exists but is hard to reach:

- It sits at the **bottom of the Help sheet**, under the page content and the licence footer
  (`src/components/layout/HelpSheet.vue:361-396`). A user has to know to open Help and scroll past a
  docs page to change the look of the app.
- It is rendered only when `state === 'ready'`, meaning only after the Help page itself has loaded
  (`HelpSheet.vue:362`, `:378`). Offline before Help is cached, on a fetch error, or on the native
  app with no network (Help loads from the web there, `ui-119`), **there is no theme control
  anywhere in the app**.
- No `*.e2e.js` spec picks a style. `e2e/theme-switch.e2e.js` covers only the three modes, so by
  `CLAUDE.md`'s "A control is not done until it is reachable" rule the six styles were never closed
  out as a user-facing capability.

Done means:

1. **File ▾** has an **Appearance…** item that opens an Appearance sheet with the Theme modes and the
   Style tiles, and it works offline and with Help failing to load.
2. The Help sheet's copy of the picker stays and is the **same component**, but it is no longer
   gated on the Help page loading.
3. One e2e spec picks a mode and a style from `/` on every engine and viewport, and checks that the
   panels and the 3D view both repaint and that the choice survives a reload.

No new theme, token or skin CSS is in scope. `useTheme` (`src/composables/useTheme.js`) and the
settings preference (`src/stores/settings.js`, `warpcad.theme`) already do the work. This task
gives them a front door.

## Interaction model

- **Precondition**: none. Available with no project, an empty project, or mid-edit. Not disabled by
  any selection.
- **Trigger**: **File ▾ → Appearance…** (`data-testid="file-appearance"`), a `menuitem` in the
  File menu's app-level group, directly above **Help and documentation**
  (`src/components/storage/FileMenu.vue:749`). It is not under **Project settings…**, because the
  theme belongs to the device and is not saved in the project (`ui-113`). The Help sheet keeps its
  picker as a second route to the same control.
- **Feedback**: the sheet opens with the current choice shown pressed (`aria-pressed="true"`).
  Tapping a mode or a style tile repaints the whole app, the 3D view included, in the same frame
  (`useTheme`'s sync watcher), and moves the pressed state to that tile. The sheet stays open so the
  user can compare styles. It closes from its × button, Escape, or a tap on the backdrop. The choice
  is remembered across reloads.
- **Placement**: n/a (creates no geometry).
- **Selection response**: n/a. Opening the sheet leaves the selection, the inspector and the gizmo
  as they were.
- **Selection count**: n/a.
- **Small-screen behavior**: at 390×844 the sheet is a full-width bottom sheet. The three modes are
  one segmented row, and the six style tiles fill a 2-column grid (3 columns at tablet and laptop,
  as in the Help sheet today). Every segment and tile is at least 44 px tall. The sheet scrolls
  inside itself if it is taller than the visible area and never scrolls the page sideways. The File
  menu gains one item, so check that it still fits at 390×844 without its last items going behind
  the home indicator (safe areas, `ui-120`).

## Documentation

- **Page**: new `docs/appearance.md` ("Appearance: theme and style"), with a sidebar entry
  (`.claude/commands/docs.md` Step 4). The "Light and dark" and "Styles" sections of `docs/help.md`
  move there. `docs/help.md` keeps a one-line pointer to the new page, so existing `#styles` links
  still land somewhere sensible. Add the new page to the in-app Help contents.
- **Example**:
  1. Tap **File** in the header, then **Appearance…**.
  2. Under **Theme**, tap **Light**. The panels and the 3D view turn light.
  3. Under **Style**, tap **Blueprint**. Buttons, panels, lettering and the grid take the blueprint
     look, and **Theme** no longer shows a mode selected, because a style replaces it.
  4. Close the sheet and reload the page. WarpCad opens in Blueprint.
  5. To follow your device again, open **File → Appearance…** and tap **System**.
- **Media**: a new `e2e/docs/appearance.docs.js` produces the still `appearance-sheet.png` (the sheet
  open with Blueprint chosen, in `docs/screenshots/`) and the movie `appearance-pick-style` (open
  the menu, pick two styles, close; in `docs/media/`), both embedded in `docs/appearance.md`. If
  `docs/help.md` drops its picture, the existing `help-theme-control` still in
  `e2e/docs/help.docs.js` moves to the new page or is retired with its file
  (`e2e/docs-media.spec.js` fails on an orphan). Encode the movie through a scoped `moviesDir`, not
  `npm run docs:gifs`, which re-encodes every GIF.

## Affected files

- `src/components/controls/ThemePicker.vue` (new): the Theme segmented row and the Style tile grid,
  extracted from `HelpSheet.vue:361-396` along with their styles and the `THEME_LABELS` and
  `STYLE_LABELS` maps. A `testidPrefix` prop keeps the Help copy's `help-theme-*` and `help-style`
  test ids as they are and gives the new sheet `appearance-theme-*`.
- `src/components/controls/ThemePicker.spec.js` (new)
- `src/components/layout/AppearanceSheet.vue` (new): built on `BaseSheet`
  (`src/components/layout/BaseSheet.vue`, `ui-116`), with title "Appearance" and the `ThemePicker`
  inside, `data-testid="appearance-sheet"`.
- `src/stores/appearance.js` (new, or a flag on an existing UI store): `open` / `close` / `isOpen`,
  following `src/stores/help.js`.
- `src/components/storage/FileMenu.vue`: the **Appearance…** item and its handler (close the menu,
  open the sheet, like `openHelp()` at `:291`).
- `src/components/layout/HelpSheet.vue`: replace the inline markup with `<ThemePicker
  testid-prefix="help" />`, rendered outside the `state === 'ready'` gate, so it shows in the
  loading, moved and error states too.
- `src/views/AppView.vue`: mount `<AppearanceSheet />` next to `<HelpSheet />` (`:435`).
- `.storybook/ThemeShowcase.stories.js`: optionally add a story for `ThemePicker`.
- `docs/appearance.md` (new), `docs/help.md`, the docs sidebar config, `e2e/docs/appearance.docs.js`
  (new).
- `e2e/appearance.e2e.js` (new).

## Proposed fix

1. **Extract `ThemePicker.vue`.** Move the two groups and their CSS out of `HelpSheet.vue`
   unchanged, so the swatch classes (`theme-swatch--<style>`, drawn by each skin's own file) keep
   working. It calls `useTheme()` itself and takes no theme props, because there is one theme
   singleton and both mounts must agree.
2. **Ungate it in Help.** Mount the picker in Help after the status and content blocks, without
   `v-if="state === 'ready'"`. The licence footer and version row keep their gates.
3. **Appearance sheet and store.** A small store like `help.js`. The sheet traps focus, closes on
   Escape and backdrop, and returns focus to the **File** button on close (BaseSheet's existing
   behaviour). Check that its z-order sits correctly against the Help sheet (50/51) and BaseDialog
   (40/41). Only one should be open at a time, so opening Appearance from inside Help is not
   needed.
4. **File menu item.** Add **Appearance…** above **Help and documentation**. It has no disabled
   state.
5. **Fonts.** The style tiles draw in each style's own lettering, which downloads the first time the
   tiles render (`docs/help.md`, "Styles"). Opening Appearance is now a second place where that
   download starts. Confirm that the tiles still render, in fallback lettering, offline before the
   fonts are cached, and that nothing in the CSP needs to change (fonts come from `'self'`).
6. **Docs** as in Documentation above.

## Effort

M.

## Testing

- **Unit (`ThemePicker.spec.js`)**: renders three mode buttons and six style tiles from
  `THEME_MODES` and `THEME_STYLES` (a seventh style in the list shows a seventh tile with no
  template change). A click calls `setPreference` with that value. `aria-pressed` follows the
  preference. Choosing a style leaves no mode pressed, and choosing a mode leaves no style pressed.
  `testidPrefix` changes the ids. `HelpSheet.spec.js`: the picker is present in the `loading` and
  `error` states.
- **E2E (`e2e/appearance.e2e.js`, navigates to `/`)**:
  1. Open **File ▾ → Appearance…** and assert the sheet is visible and the current mode is pressed.
  2. Tap **Light**: `html[data-theme="light"]`, a panel pixel from a real screenshot is light, and a
     canvas background pixel is light.
  3. Tap **Blueprint**: `html[data-theme="blueprint"]`, the canvas pixel changes from the Light
     value, and no mode is pressed.
  4. Loop the other five styles and assert `data-theme` for each (attribute only, to keep the spec
     short).
  5. Reload and assert the last style stuck. Tap **System** under an emulated dark scheme and
     assert `data-theme="dark"`.
  6. **Help offline**: route-abort the Help page fetch, open Help, assert the error state shows and
     `help-theme-light` is still there and works.
  7. Escape closes the Appearance sheet and focus returns to the File button.
  - **All three viewports with a snapshot of the open sheet at each** (Small-screen behavior is not
    "same as desktop"). At 390×844, assert that no tile is under 44 px tall and that the sheet has no
    horizontal overflow.
  - **All three engines** (Chromium, Firefox, WebKit): the spec reads canvas pixels and
    `localStorage` persistence, and the styles' fonts and `backdrop-filter` (Glass) differ by engine.
- **Existing specs that must stay green**: `e2e/theme-switch.e2e.js` (it drives `help-theme-*`, which
  the `testidPrefix` keeps), `e2e/help-picture-theme.e2e.js`, `e2e/header-width-budget.e2e.js` (the
  header does not change, but confirm), and any File menu spec that counts or orders items.
- **Acceptance scenarios to re-drive**: **1** (Two independent primitives) and **13** (Recolor a
  placed body), once in a light style and once in a dark style, as `ui-113` did for the modes. The
  default body colour and the viewport palette read `scheme`, so a style is a new input to both.
- **Closed findings whose reproductions re-run**: `ui-113` (theme switch: run its spec against the
  extracted component), `docs-030` (docs media in both schemes, since the new docs projects render
  the new still), `ui-121` (the native shell is told `system`, `light` or `dark`: a style must send
  its scheme, which `e2e/theme-switch.e2e.js`'s native-shell block should extend to cover one
  style).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
