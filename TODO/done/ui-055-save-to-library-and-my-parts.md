---
title: Save a group to the library and place it again — "Save to library" and a My parts section
category: ui
kind: feature
priority: high
model: sonnet
milestone: M9
depends: [core-037, ui-015]
status: done
---

> **What actually shipped (2026-10-10).** As scoped, with these decisions and deviations:
>
> 1. **Toolbar item is a button, not a Group-menu entry.** The Operations toolbar has no Group menu (Group
>    is one button), so **To library** (`op-library-save`, title "Save to library…") sits beside Mirror with
>    the same exactly-1 gate; the Inspector has `library-save` for one body and a disabled copy with a
>    visible reason for a multi-selection.
> 2. **My parts is always rendered** (collapsed by default, expanded by a save), not hidden when empty, so
>    *Import part file…* is reachable before the first part exists. Rows are newest first (by save time).
> 3. **Exposed sizes are editable on a placed part.** `paramOptions`/`hasEditableParams` now fall back to a
>    runtime entry's `paramSchema` (inclusive `min`/`max`), and the `registry[op]?.kind` lookups in
>    `paramEdit.js`, `useParamCommands.js`, `useTimelineCommands.js` and `inspector.js` became
>    `lookupEntry`, so a `user.*` instance edits in place through the existing composite path.
> 4. **Thumbnails** are drawn once at save time from the body's own polygons (`render/partThumbnail.js`) and
>    stored as a small PNG data URL beside the definition in `warpcad-parts` (display-only, validated on the
>    way out). A part with none falls back to a dashed swatch. A part saved from an import carries its own.
> 5. **Delete never touches placed geometry**: the project already holds its own copy of a placed part, so
>    delete only removes the library copy; with instances the dialog's default is "Keep a copy in the
>    project" and the row stays (from the project's copy, with Rename/Delete disabled) until File > New.
> 6. **Part file** is `{ format: 'warpcad-parts', version: 1, parts, thumbnails? }`, validated with the same
>    caps as a project's parts, 64 parts / 8 M characters; an existing name is skipped, never overwritten.
> 7. The **local library is loaded at app start** (`library.start()` in `AppView`), which core-037 left unwired.
>
> **Found by hand-driving, fixed here:** the ⋯ popover opened below the window for a row at the bottom of the
> Library column; at phone width the Inspector's collapsed tab covers the bottom of the open Library sheet, so
> the last rows (My parts) could not be scrolled clear of it; and a visually-hidden file input in the sheet
> grew the page in WebKit and Firefox and shifted every other spec's click points (caught by the full run).
>
> **Known gaps:** `style.recolor`'s `colorOverride` is still not carried into a saved part (core-037's gap,
> unchanged; filed as `core-054`). Saving captures on the main thread (core-037's verify step), and a "newer
> version available" row only shows a tooltip: there is no upgrade control. Rename does not change a
> project's already-placed copy of the name. Open finding `core-053` is untouched.

## Goal

A person selects a group they built, gives it a name, and it appears in the Library next to
the Raspberry Pi and hardware rows, draggable into any project the same way. "Done":
build a group, **Save to library**, start **File ▸ New**, find it under **My parts**, drag it
in, and it renders complete, not partial (scenario 3's lesson), with its sub-parts intact.

## Interaction model

- **Precondition**: *Save to library* needs **exactly one** group or body selected (a
  multi-selection is first combined with `ui-015`'s Combine into group, which the tooltip
  says). It stays disabled with a reason otherwise.
- **Trigger**: **Save to library…** (`data-testid="library-save"`) in the Inspector header
  for a selected group, plus the same item in the operations toolbar's *Group* menu.
  It opens a sheet: **Name**, **Category** (My parts by default), and a list of numeric
  fields of the group that can be **exposed as parameters** (checkboxes). Library rows for
  user parts get a ⋯ menu: **Rename**, **Duplicate**, **Export part file**, **Delete**;
  **Import part file…** sits in the section header.
- **Feedback**: the new row appears at the top of **My parts** with a live thumbnail;
  a toast "Saved *Raspberry Pi 7 board*"; a part used in the project shows a small "in this
  project" dot; deleting a part that placed instances use offers "Keep a copy in the
  project" (default) or cancel — it never deletes placed geometry.
- **Placement**: **drag from the row into the viewport**, preview follows the pointer and
  commits on release — the existing drag-place mechanism, unchanged (`core/library.js`).
- **Selection response**: a placed user part selects as a group; the Inspector shows its
  exposed parameters as numeric fields, and its sub-parts by name.
- **Selection count**: Save exactly 1.
- **Small-screen behavior**: the Library is already a sheet at phone width; *My parts* is a
  collapsible section; the ⋯ menu is a bottom action sheet; drag-to-place uses the touch
  path that built-in rows use. 44 px targets.

## Documentation

New `docs/user-library.md`. Example: "Place a Cube and a Cylinder, select both, tap **Combine
into group**, then **Save to library…**, name it *Standoff*, tap **Save**. Open the Library,
expand **My parts**, and drag *Standoff* into the view."

## Affected files

- new `src/components/layout/SaveToLibrarySheet.vue`, `UserPartMenu.vue`;
  `src/components/layout/LibraryPanel.vue` (My parts section — *via the registry*, no
  hard-coded part); `src/components/inspector/Inspector.vue`; `OperationsToolbar.vue`;
  `src/stores/library.js` (UI state only); `docs/user-library.md`.

## Effort

M.

## Testing

- **Unit**: sheet validation (empty/duplicate/over-long name), enabled-state by selection
  count (0, 1, 2), delete-with-instances copy.
- **E2E** (`e2e/user-library.e2e.js` → `/`): the example above with real mouse and trusted
  touch on phone; assert the dropped part's body count and sub-part names match the
  original, reload and it is still there, **File ▸ New** and it is still there. Three
  viewports; **all three engines** (IndexedDB + canvas + touch).
- **Acceptance**: re-drive 3, 6 and 1 (the dropped part does not replace an existing body);
  re-run `ui-030`, `ui-031`, `ui-053` (first drag after Escape), `ui-054` repros.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
