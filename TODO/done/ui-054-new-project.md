---
title: Add File ▸ New to start an empty project
category: ui
kind: feature
priority: high
model: sonnet
milestone: M7
depends: []
status: done
---

> **What shipped.** As scoped. Decisions: (1) Save target — `persistence.newProject()` calls the existing `files.forgetHandle()` (already present, previously untested; now covered). (2) Hosted — new `autoPusher.pause(message)` plus `hosted.detachForNewProject()`: drops `lastSha`/hash/adopted, pauses auto-push with a visible "Auto-push paused — new project" label, keeps the connection and token; an explicit Save then goes down the existing conflict path rather than overwriting. (3) Undo/autosave — matched Open (`documentStore.load`: history cleared, no undo of New); the confirm copy says the browser's own copy is replaced too. Also added `alignReference.reset()` (ids like `pi-1` are reused by a new project, so a stale remembered reference could apply to an unrelated body). Shortcut is Ctrl/Cmd+Alt+N, matched on `event.code` because Alt+N types `˜` on a Mac. The FileMenu "This device" group order assertion changed to put `file-new` first. Acceptance: scenarios 1, 10 (local autosave/reload half) and 12 (undo half) hand-driven, PASS. This task had no row in `TODO/ROADMAP.md`, so only the Completion Log was written.

## Goal

The File ▾ menu has Save, Save As…, Open…, Export… and the hosted Load/Connect items, but
nothing that starts a **new** project. The only way to get an empty document today is to
select every body and delete it by hand, which leaves the old Save target, the old
timeline's undo history and (if connected) the hosted file's `sha` attached to the "new"
work. "Done" looks like: choose **New** from the File menu, confirm if there is anything to
lose, and the app is exactly what a first-time visitor sees — empty scene, empty timeline,
no selection, default resolution — and the next Save asks *where to save*, rather than
overwriting the file the previous project came from.

## Interaction model

- **Precondition** — nothing. Always available (it is the escape hatch from a project the
  user no longer wants), except while a load is still being announced and folded
  (`persistence.loading`), where it is disabled exactly as Open… is.
- **Trigger** — a **New** item at the top of the File ▾ menu (`FileMenu.vue`, above Save,
  `data-testid="file-new"`), plus the Ctrl/Cmd+Alt+N shortcut registered beside the
  existing Ctrl/Cmd+O one. (Plain Ctrl/Cmd+N is reserved by browsers and cannot be
  intercepted reliably — say so in the docs rather than binding it and having it
  silently open a browser window.) Add `requestNew()` to `stores/fileMenu.js`, modelled
  on `requestOpen()`.
- **Feedback** — the viewport empties, the Inspector returns to its 0-selected state, the
  History strip is empty, the status chip shows `New project · <clock>` for the usual
  notice duration, and the title/Save target no longer names the old file. If there was
  content, a replace-confirm appears first (below).
- **Confirm** — reuse the existing `confirm` ref (`'new'` alongside `'open'`/`'load'`):
  a non-empty project (`hasContent()`: any step in the log, not the body count) raises
  the same replace dialog before anything is touched; an empty one skips straight through.
  Wording must name the consequence — "Start a new project? The current project stays
  saved in this browser until you make a change, and in its file if you've saved one" is
  **only true if the autosave decision below is implemented that way**; write the copy
  after deciding, not before.
- **Placement** — n/a (creates no geometry).
- **Selection response** — selection is cleared (`document.load` already does this);
  confirm the gizmo and dimension lines detach with it.
- **Selection count** — n/a.
- **Small-screen behavior** — same File menu and replace dialog as Open…, which already
  work at phone width. The shortcut has no phone equivalent; the menu item is the whole
  touch path.

## Documentation

- **Page** — `docs/save-load.md`, a new "Starting a new project" section after "Try it".
  Not a new page: it is the third half of the same save/open/new story.
- **Example** — "1. Drag a Cube into the 3D view. 2. Open **File ▾** and choose **New**.
  3. A dialog asks whether to replace the current project; choose **Replace**. 4. The
  view is empty. 5. Choose **File ▾ ▸ Save** — a file picker appears (rather than
  silently saving over the project you just left). Press Ctrl/Cmd+Z: the cube comes
  back." — **delete the last sentence if the undo decision below goes the other way.**

## Affected files

- `src/stores/fileMenu.js` — `requestNew()`, `'new'` in `confirm`, `confirmReplace()`
  handling it.
- `src/stores/persistence.js` — a `newProject()` that loads an empty entry list through
  the same `documentStore.load([])` path Open uses, and **forgets the Save target**.
  `deps.files.adopt(picked)` exists for setting it; check `storage/fileSystem.js` for a
  matching way to clear it, and add one if absent (with a `fileSystem.spec.js` case).
- `src/stores/hosted.js` — see the hosted decision below.
- `src/components/storage/FileMenu.vue` — the item and the shortcut hint.
- A shortcut composable beside whichever one owns Ctrl/Cmd+O.
- `docs/save-load.md`.

## Proposed fix

Three decisions to make explicitly in Step 2 and record in the retirement note, because
each one is a way for "New" to silently destroy work or silently reuse the wrong target:

1. **Save target.** After New, Save must behave as if the file had never been saved: the
   remembered file handle is dropped so the next Save opens the picker. Getting this
   wrong means New → build something → Ctrl+S overwrites the *previous* project's file.
   This is the highest-risk part of the task and needs its own test.
2. **Hosted connection.** If a repository is connected with auto-push on, the new empty
   document would push over the remote file on the next edit. Recommended: New leaves the
   connection alone but **drops `lastSha` and pauses auto-push** (the `paused` dot state
   already exists) with a visible note, so the user opts back in. Do not disconnect —
   losing the token is a bigger surprise than a paused push. Verify `hosted.js`'s actual
   states before committing to this.
3. **Undo and autosave.** Two defensible shapes. (a) New is one undo step: Ctrl+Z
   restores the previous project, which makes the confirm nearly redundant but is the
   most forgiving; it needs the document layer to treat "replace everything" as one
   transaction (see how `appendAll` batches). (b) New resets history, like Open does
   today, and the confirm is the only safety net. Check what Open does now and **match
   it** unless (a) is cheap — consistency with Open matters more than being clever here.
   Either way, the next autosave overwrites the stored project with the empty one, so the
   confirm copy must not promise the old project is still stored in the browser.

Also clear: the resolution back to Normal (`TODO/core-035` — an empty file means Normal),
the per-session UI stores that hold ids of bodies that no longer exist
(`alignReference`, `hoverHighlight`, the object-list expansion state), and any open
popover or dialog (`exportDialog`, `resolutionDialog`), as `requestOpen()` already does.

## Effort

M — the document-replace path, confirm dialog, menu item and status notice all exist for
Open…; the new work is the Save-target and hosted-state resets, and the shortcut.

## Testing

- `fileMenu.spec.js`: `requestNew` on an empty project loads immediately; on a non-empty
  one raises `confirm === 'new'` and touches nothing until `confirmReplace()`; cancel
  leaves the project intact; a suppressed-everything project still counts as non-empty;
  disabled while `persistence.loading`.
- `persistence.spec.js` / `fileSystem.spec.js`: after `newProject()`, the next
  `saveFile()` is treated as Save As (picker invoked, previous handle not written to).
- `hosted.spec.js`: after New with a connected repo, `lastSha` is dropped and auto-push is
  paused, per decision 2.
- **Real app-level spec**: extend `e2e/save-load-ui.e2e.js` (navigates to `/`): place a
  box → File ▸ New → Replace → body count 0, History empty, Inspector at its empty state
  → File ▸ Save invokes the (mocked) picker rather than writing in place. Also the
  empty-project path (no dialog) and cancel path. Engines: **all three** — it touches
  persistence and the viewport clearing; viewports: all three, since the menu and dialog
  are layout-sensitive, with a snapshot at each.
- **Acceptance scenarios to re-drive**: 1 (place a box and a sphere, both remain visible —
  *after* a New, to prove the scene still accepts placement, since a stale
  placement/selection store is the likely regression), 10 (file save/open), and 12 if it
  covers undo. Say PASS/FAIL for each in the retirement note.
- **Closed findings in this subsystem — re-run their original repros**: `ui-033` (save/load
  UI), `io-001` (local persistence), `io-002` (hosted backend), `ui-012`/`ui-044` (undo
  coherence), and `ui-053` (Escape/popover dismissal before the next Library drag: after
  New, the first Library drag must start on the first try).
