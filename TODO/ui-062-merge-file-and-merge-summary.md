---
title: File ▾ → Merge file…, the merge summary banner, conflict chips and Undo merge
category: ui
kind: feature
priority: high
model: opus
milestone: M15
depends: [data-011]
status: open
---

## Goal

The first place a person can reach a merge by hand, on every engine and every form factor: pick
a saved copy of the open project and have its changes merged in. It also builds the three shared
pieces every later M15 task reuses instead of inventing its own: the **merge summary** (what
came in), the **conflict chip** on a row that lost, and **Undo merge**.

"Done": save a project, change it in two different ways in two tabs (or on a laptop and a
phone), download one, choose **Merge file…** in the other, and both sets of changes are in the
viewport and the History; a row that could not survive is chipped with why; **Undo merge** takes
the incoming changes back out and touches nothing the user did.

## Interaction model

- **Precondition** — a project with at least one step is open; no AI turn is landing; the
  History is not previewing an earlier step. Otherwise the item is dimmed with its reason
  printed under it (`Nothing to merge into` / `Return to the latest step to merge`), the pattern
  **Export…** already uses.
- **Trigger** — **File ▾ → Merge file…** (`file-merge`), directly under **Open…** in the "this
  device" group. It opens the same file picker Open uses (native picker where File System
  Access exists, `<input type=file>` everywhere else). There is no replace-confirm: nothing is
  replaced.
- **Feedback** —
  - Success: a toast, `Merged 4 steps from bracket-copy.warpcad` (`merge-toast`) with an
    **Undo merge** button (`merge-undo`). The new rows appear in the History with their own
    origin chips; the viewport updates.
  - Nothing new: `bracket-copy.warpcad has nothing this project doesn't already have`.
  - Conflicts: instead of the toast, a banner that stays until dismissed (`merge-banner`):
    `Merged 4 steps from bracket-copy.warpcad — 2 steps conflicted` with **Show**
    (`merge-banner-show`, opens the History and selects the first conflicted row) and **Undo
    merge**. Each conflicted row carries the existing broken chip (`chip-broken`) and the
    reason `conflicts with step 6 (Move Cube 1, you)`.
  - A different project: refused, nothing changes: `bracket-v2.warpcad is a different project.
    Merge only works between copies of the same project.`
  - A file this build cannot read: the same sentence Open shows, and nothing changes.
- **Undo merge** — one step, available from the toast or banner until the next merge, the next
  Open or a reload (in memory, like Undo AI turn). It removes the rows the merge added, restores
  the rows and settings it changed, and brings back rows it removed. It is **not** on the header
  **Undo** stack and never removes a local step (`CLAUDE.md`: remote edits never land in the
  local undo stack). If a later local step builds on a merged row, it refuses by name, exactly
  as Undo AI turn does.
- **Fixing a conflicted row** — no new control. The row's existing actions apply: **Edit**,
  **Suppress**, or delete the body. Fixing it clears the chip because the row then builds.
- **Placement** — n/a (no geometry is created by a gesture).
- **Selection response** — n/a. A merged-in body selects and shows its Inspector like any other.
- **Selection count** — n/a.
- **Small-screen behavior** — the menu item is in the same File sheet as Open. The toast and
  banner sit at the top of the viewport under the header, full width at ≤ 640 px, and must not
  cover the Operations toolbar or the nav chrome (`ui-043`'s measured gap). **Show** opens the
  History bottom sheet.

## Documentation

- **Page** — new `docs/merging.md` (with a sidebar entry), linked from `docs/save-load.md` and
  `docs/timeline.md`.
- **Example** — "1. Open your project on your laptop and choose **File ▾ → Download copy**.
  2. Send the file to your phone and open it there. Add a cylinder. 3. Back on the laptop, move
  the cube. 4. On the phone, **File ▾ → Download copy**, and send that file to the laptop.
  5. On the laptop choose **File ▾ → Merge file…** and pick it. The cylinder appears and the
  cube stays where you moved it. 6. If a step shows a red chip reading *conflicts with step 6*,
  open it in History and either edit it or suppress it." Then a short "what a conflict is"
  paragraph with the move-versus-fillet case.
- **Media** — `e2e/docs/merging.docs.js`: `merging-toast.png` (the toast with Undo merge) and
  `merging-conflict.png` (the banner plus a chipped row), both embedded in `docs/merging.md`.

## Affected files

- `src/stores/merge.js` (new) — `mergeIn(state, sourceName)`, the last merge's inverse,
  `undoMerge()`, banner and toast state; `src/stores/merge.spec.js`
- `src/stores/document.js` — exposes `mergeFrom` through the store, refreshing derived state
- `src/stores/persistence.js` — `mergeFile()`: pick, read, `parseProject`, hand to the store
- `src/components/storage/FileMenu.vue` (the item), `src/components/display/MergeToast.vue`,
  `src/components/display/MergeBanner.vue` (new)
- `src/components/timeline/TimelineRow.vue` — nothing new if the reason already renders in
  `chip-broken`'s title; confirm at phone width where there is no hover
- `e2e/merge-file.e2e.js`, `e2e/docs/merging.docs.js`, `docs/merging.md`, `docs/save-load.md`
- `TODO/ACCEPTANCE.md` — a new scenario (below)

## Proposed fix

Thin wiring over `data-010`. `mergeIn` calls `document.mergeFrom`, keeps the returned `change`
as the inverse for **Undo merge**, and derives the toast or banner text from `change` and
`conflicts`. Undo merge applies the inverse as ordinary stamped writes with origin `merge`
inside one `document.batch`, so it converges with the other copy later instead of fighting it
(the removed rows become tombstones newer than the rows).

The counts in the message are of History rows, in the user's terms: added, changed, removed.
A merge that only moved the rollback marker or changed a setting says so (`Merged a rollback
point from …`), never "0 steps".

Reuse `ModalShell` for nothing here: there is no dialog. The toast follows the existing status
surface (`useStatusSurface.js`) if it fits; do not build a second toast system.

## Effort

L

## Testing

- Unit (`merge.spec.js`): message text for added / changed / removed / marker-only / nothing
  new; Undo merge restores the exact prior serialised rows and leaves the local undo stack
  length unchanged; Undo merge refuses by name when a local step builds on a merged row; a
  different-project file changes nothing.
- App-level `e2e/merge-file.e2e.js` (navigates to `/`): build a project, capture its file, make
  change A in the app and change B in a second context, merge B's file through the real menu and
  picker; assert both changes in the viewport and History, the toast, and Undo merge. A second
  case forces the move-versus-fillet conflict and asserts the banner, **Show**, the chip and
  its reason, then fixes the row by Suppress and asserts the chip is gone. A third merges a
  different project and asserts the refusal and an unchanged History.
- Viewports: **all three**, with a snapshot of the toast and of the banner at each.
- Engines: **all three** (file reading, IndexedDB autosave after the merge, WebGL result).
- **New `TODO/ACCEPTANCE.md` scenario 22, "Merge a copy of the project"**: the Documentation
  example above, driven by hand with a real second device or a second browser profile,
  including one deliberate conflict and one Undo merge. Driven, not scripted.
- Acceptance scenarios to re-drive: **10** (save and reload after a merge), **12** (History
  editing on a merged document), **14**, **7** (the banner must not block touch navigation).
- Closed findings to re-run: `ui-043` (phone toolbar and nav-chrome overlap, with the banner
  showing), `ui-033` (a cancelled picker changes nothing; a stale error never hides a later
  success), `ui-052` (a left-broken row is visible, selectable and fixable), `ai-006`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
