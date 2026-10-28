---
title: Add "Save as gist…" to the File menu, so a project can be created in a gist and saved there
category: io
kind: feature
priority: medium
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-10-28 at the owner's request)
depends: [io-017, io-020]
status: done
---

> **Shipped:** the item is in the save group of File ▾ and reads Save as gist… until the project has a gist, then Save to gist. Its dialog is a bottom sheet at 390 px. Ctrl/Cmd+S stays local, and the decision is in `docs/decisions/gist-storage.md`. Not shipped: the story (no stories exist in the repo yet), and the `e2e/docs/` dialog and chip shots (the three existing File-menu screenshots were refreshed instead).

## Goal

**In user terms:** today a gist is reached only through **Share…**, which reads as sending a link. The owner
wants it as a place to *save*: **File ▾ → Save as gist…** creates the gist from the open project and makes it
the project's save target, so later saves go to the same gist without opening the Share sheet. It sits beside
the existing save items, the way **Save** and **Save as…** do for a local file.

Done means: from an open project, one menu item publishes it (asking only for what a first publish needs: a
name, public or secret, and the token if none is connected), and afterwards **Ctrl/Cmd+S** and the **Saved ·
hh:mm** chip treat the gist as a save target.

## Interaction model

- **Precondition**: a project with at least one body (the same rule as **Publish**, `no-bodies` otherwise).
  The item is dimmed, with its reason, when there are no bodies, and reads **Save to gist** (no ellipsis) once
  the project already has a `gist` field.
- **Trigger**: **File ▾ → Save as gist…** (`file-save-as-gist`), under **Save as…**. A small dialog asks the
  name (pre-filled, `io-020`'s rule), **Secret / Public**, and shows the connect step when there is no token.
  Not a toolbar button, so the phone header gains nothing.
- **Feedback**: the save chip reads `Saved to gist · hh:mm`; a toast names the gist and carries **Copy
  link**. A failure uses the existing gist wording (`src/core/gistMessages.js`) and writes nothing.
- **Ctrl/Cmd+S**: decide and record in `docs/decisions/gist-storage.md` whether it also pushes to the gist.
  `fileMenu.js` states that **Ctrl/Cmd+S never touches the network** (`interaction-model-qa.md` §11). Keep
  that rule: **Ctrl/Cmd+S stays local, and the gist is saved by the menu item**. The chip shows how far
  behind the gist is ("Gist: 2 changes not saved") rather than saving silently.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: the dialog is a bottom sheet at 390 px, the same container the Share sheet uses.

## Documentation

- **Page**: `docs/sharing.md` and `docs/saving.md` (whichever lists File menu items): a **Save as gist**
  section. **Example**: "Open a project, choose **File ▾ → Save as gist…**, keep the name, choose **Secret**,
  tap **Save**. The chip reads *Saved to gist*; choose **Save to gist** after later edits."
- **Media**: `e2e/docs/` shot of the dialog and of the chip, via `npm run docs:media`.

## Affected files

- `src/components/storage/FileMenu.vue`, `src/stores/fileMenu.js` (+ specs): the item and its reason.
- `src/components/storage/SaveAsGistDialog.vue` (new, under 30 template lines of logic) and its story.
- `src/composables/useGistPublish.js`: reuse `publish()` and `update()`; do not fork them.
- `src/stores/persistence.js`: the chip's state for a gist target.
- `e2e/gist-save-as.e2e.js` (new); `docs/sharing.md`; `TODO/ACCEPTANCE.md` (a step in scenario 30).

## Proposed fix

The menu item is a second *entry point* to `useGistPublish`, not a second implementation. First use calls
`publish()`; once `document.gist` exists the same item calls `update()`. Keep the `changed-remotely` refusal
until `io-019` lands. Do not add auto-push: saving stays an explicit action, like the hosted git store.

## Effort

M.

## Testing

- **Unit**: the item's enabled, label and reason states; the dialog's connect-first branch; a failure leaves
  the project's `gist` field unset.
- **E2E (real app, `/`)**: laptop, tablet and phone; fake gist API. Create, edit, **Save to gist**, assert
  the second request is a PATCH. **All three engines** (IndexedDB, `fetch`).
- **Acceptance scenarios**: re-drive 30 and the save-and-reopen scenario. **Closed findings re-run**: any
  `ui-033` File-menu repro, since the menu changes, and `io-017`'s publish repro.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
