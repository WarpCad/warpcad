---
title: Merge the gist's newer revision into the open project before updating it, instead of refusing the update
category: io
kind: feature
priority: low
model: opus
milestone: none — Findings table, outside the milestone plan (split off `io-017` Stage 3, 2026-10-28)
depends: [io-017, io-010]
status: done
---


> **What shipped (2026-10-29):** as proposed, with these differences. The merge does not wait for a quiet
> moment (the Share sheet and Save-to-gist dialog count as busy, so waiting would deadlock); it behaves like
> Save. `lastRevision` moves to the merged revision as soon as the merge lands, even with conflicts, so a row
> a person leaves broken does not block every later update. `changed-remotely` is removed; the refusals are
> `different-project`, `merge-conflict`, `merge-unavailable` and `merge-failed`, plus `unreadable`.
> Tapping **Undo merge** after a gist merge makes the next update publish "take mine".

## Goal

**In user terms:** an owner who edits the same published project on two devices and taps **Update gist**
on both should not have to open the gist first and redo work. Today (`io-017` Stage 2) **Update gist**
refuses with the `changed-remotely` message when the gist's latest revision is not the one this project
last published, and writes nothing. This task replaces the refusal with a merge: read the gist,
`mergeIn` its project into the open one (`io-010`, `docs/decisions/document-sync.md`), then publish the
merged result.

## Interaction model

- **Precondition**: a project with a `gist` field, a connected gist token, and a gist whose latest revision
  differs from `gist.lastRevision`.
- **Trigger**: the existing **Update gist** (`share-gist-update`) in the Share sheet. No new control.
- **Feedback**: the merge strip the app already shows for a merge (`Merged N steps from the gist`,
  with **Undo merge**, or the conflict banner), then *Gist updated*. A merge that fails or that a person
  cancels writes nothing to the gist. The gist is only written after the local merge succeeded.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: no new surface; the existing strip and sheet at 390 px.

## Documentation

- **Page**: `docs/sharing.md`, the **Publish a project as a gist** section: replace "Update refuses if the gist
  changed; open it first" with what happens now. **Example**: "Edit the project on your laptop and tap
  **Update gist**. Edit it on your phone, tap **Update gist**: the phone merges the laptop's changes first,
  then updates the gist."
- **Media**: none new (the strip is already pictured in `docs/merge.md`).

## Affected files

- `src/composables/useGistPublish.js` (+ spec): the `changed-remotely` branch of `update()`; use
  `readGist` and `persistence.mergeText` / `mergeIn`.
- `src/core/gistMessages.js` (+ spec): the `changed-remotely` wording is no longer shown to the owner.
- `e2e/gist-share.e2e.js`: two contexts that both publish.
- `docs/decisions/gist-storage.md`: the Stage 3 decision (record the "interim rule" replaced).
- `TODO/ACCEPTANCE.md`: extend scenario 30 or add a variant step.

## Proposed fix

In `update()`, when the remote revision differs: `readGist` (no token), run its text through the same merge path
as **Merge file…**, wait for it to settle (the merge waits while a drag or field edit is in progress), then
PATCH with `lastRevision` set to the revision just read. If the gist is a different project (a different
project id), refuse as today. Never PATCH before the local merge has succeeded. The 60-second cache on the
public read (`gist-storage.md`) means a just-written revision may be read back stale: keep the existing rule
that accepts a revision this session wrote.

## Effort

M.

## Testing

- **Unit**: `useGistPublish.spec.js`: remote newer and mergeable (merged, then patched with the new
  revision), remote a different project (refused, nothing written), merge conflict (conflict banner,
  nothing written), `readGist` rate-limited (refused with the busy wording, nothing written), stale read of
  our own last write (no needless merge).
- **E2E (real app, `/`)**: two contexts against the fake gist API, both publish and update; each context ends
  with both contexts' bodies. **All three viewports and all three engines** (IndexedDB, canvas and
  `fetch`).
- **Acceptance scenarios**: re-drive 30 and 22 by hand. **Closed findings re-run**: `io-010`/`io-011`'s
  merge repros against the gist path (the strip, **Undo merge**, header **Undo** unchanged).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
