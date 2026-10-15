---
title: A stale hosted save merges instead of asking Overwrite / Load / Cancel
category: io
kind: feature
priority: medium
model: sonnet
milestone: M16
depends: [ui-062]
status: open
---

## Goal

The hosted git backend detects that the repository's copy moved on (a stale `sha`) and raises a
three-button dialog whose every answer discards something (`io-002`, `ConflictDialog.vue`). With
M15's merge the common case, the same project edited on two devices, needs no answer: fetch the
remote copy, merge it in, push the result.

"Done": edit a hosted project on a laptop and on a phone, save on both; the second save merges
the first device's changes, pushes, and shows what came in. Auto-push keeps working instead of
pausing.

## Interaction model

- **Precondition** — a repository is connected (**File ▾ → Connect repository…**) and the
  project has been saved to or loaded from it this session.
- **Trigger** — unchanged: **File ▾ → Save to …** (`hosted-save`), **Load from …**
  (`hosted-load`), or an auto-push tick. The user does nothing new.
- **Feedback** —
  - Save, remote moved on, same project: `ui-062`'s toast or banner
    (`Merged 3 steps from <owner>/<repo>`), then the File-button dot returns to in-sync once the
    merged project is pushed. **Undo merge** is offered; pressing it makes the project differ
    from the repository again, so the dot shows unsaved, as after any edit.
  - Auto-push, remote moved on: the same, with no dialog; auto-push is **not** paused.
  - **Load from …** with local changes: today it replaces the project. It now merges, with the
    same toast. The explicit "take theirs" stays available as the dialog's **Load** in the case
    below.
  - Remote holds a **different project**, or the **first** Save into a repository whose file
    this session never loaded and which is not a copy of this project: the existing dialog,
    unchanged, with its three buttons. Merging two unrelated projects is never automatic.
  - The push after a merge is itself refused as stale (someone saved again): fetch, merge and
    push again, at most three times, then the existing dialog with the message
    `The repository keeps changing. Try again in a moment.`
- **Placement / Selection response / Selection count** — n/a.
- **Small-screen behavior** — same controls as today; the toast and banner are `ui-062`'s. The
  conflict dialog remains deferred while a drag is in progress (§11 rule 5).

## Documentation

- **Page** — `docs/save-load.md` ("Hosted storage": replace the conflict paragraph) and
  `docs/merging.md`.
- **Example** — "1. On your laptop, **File ▾ → Save to my-parts/bracket**. 2. On your phone,
  **File ▾ → Load from my-parts/bracket**, add a cylinder, **Save**. 3. On the laptop, move the
  cube and **Save**. WarpCad says *Merged 1 step from my-parts/bracket*: the cylinder from your
  phone is now on the laptop too, and the repository has both changes."
- **Media** — `e2e/docs/save-load.docs.js`: replace the hosted-conflict shot with
  `hosted-merged.png`; keep one shot of the dialog for the different-project case.

## Affected files

- `src/stores/hosted.js` — the save path, `resolveConflict`, `divergent`, auto-push status
- `src/storage/autoPush.js` — a stale result is "merge then retry", not "pause"
- `src/storage/hostedBackend.js` — only if it lacks a "read current text and sha" call
- `src/components/storage/ConflictDialog.vue` — text for the two remaining cases
- `src/stores/hosted.spec.js`, `src/storage/autoPush.spec.js`, `e2e/hosted-persistence.e2e.js`
- `docs/save-load.md`, `docs/merging.md`, `docs/decisions/persistence-export.md` (pointer)

## Proposed fix

On a stale `sha`: read the remote text and its `sha`, `parseProject`, and check relatedness. If
the copies are the same project, call `ui-062`'s `mergeIn`, serialise, and push against the
`sha` just read. Bound the loop at three. Everything else in the store stays: the credential
rules, the allow-listed origin, no server text echoed into a message.

Two rules from `io-002` are kept and restated in the code: the first Save into an existing file
this session never loaded still goes down the dialog path unless relatedness says `same`; and
**Cancel** in the dialog still leaves the dot at `!`.

`Load from …` merges only when relatedness is `same` or `legacy-same`; otherwise it keeps its
replace-confirm.

## Effort

M

## Testing

- Unit (`hosted.spec.js`, mocked `fetch`): stale save merges and pushes with the new `sha`;
  three stale pushes in a row end in the dialog with the stated message; a different project
  opens the dialog and merges nothing; first-Save-into-unseen-file rule; Cancel leaves `!`;
  **no token and no server error text appears in any message or in the merge toast** (the
  existing scan, extended).
- Unit (`autoPush.spec.js`, fake timers): a stale tick merges, pushes, and the scheduler keeps
  running; a different-project tick pauses, as today.
- App-level `e2e/hosted-persistence.e2e.js` (navigates to `/`, mocked `api.github.com`): two
  contexts share one mocked repository; both edit, both save; assert the second sees the toast,
  both changes in viewport and History, and the mock's stored file holds both. A conflict case
  asserts the banner. A different-project case asserts the dialog.
- Acceptance scenarios to re-drive: **10** (hosted half), **22**. Against a **real** scratch
  repository this stays NOT DRIVEABLE without a token and a human; record that, do not claim it,
  and add it to `TODO/VERIFY.md` as the one manual item.
- Closed findings to re-run: `io-002` (credential boundary; the >1 MB blob path must feed the
  merge the full text, never the Contents API's empty content), `ui-033` (after Cancel the
  auto-push item must not promise a retry; a stale error must not hide a later success).
- Engines: **all three** (persistence and `fetch`).
- Viewports: all three for the toast and dialog cases, snapshot at each.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
