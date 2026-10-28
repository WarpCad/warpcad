---
title: A gist is published under the project's name, not the name typed in the Share sheet
category: io
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, outside the milestone plan (found 2026-10-28 by the owner)
depends: [io-017]
status: done
---

**What shipped:** the Share sheet's Name is now the gist's title. `publish()` and `update()` take it
(`choice.name`), so the gist's description, README heading and file name all follow it, including on a
never-saved project. `ShareGistGroup` gets it from `ShareSheet` as a prop. The proposed fix's
*first* choice, writing the name back as the project's own name, was **not** taken: the gist alone
takes the sheet's name, which the finding's own fallback allowed. Reopening the sheet on a never-saved
project still offers *Untitled*. The decision and its reasons are in `docs/decisions/gist-storage.md`
("The gist's name").

## Problem

The Share sheet has an editable **Name** field (`share-name`, `src/stores/share.js`), described as "the
recipient's title". The owner typed **Fan Duct**, published to a gist, and the gist reads **Untitled**: the
README heading, the gist description and the project file's name all say so (screenshots, 2026-10-28:
`gist.github.com/johnwebbcole/7c27aa73…` against the open Share sheet).

Cause: `publish()` and `update()` in `src/composables/useGistPublish.js` read `persistence.projectName`
(lines ~164 and ~243), the name the *file* was last opened or saved under. A project that has never been
saved has none, so `gistFileName`, `gistReadme` and `descriptionOf` all fall back to `DEFAULT_SHARE_NAME`.
The Share sheet's `name` ref never reaches the gist code. The long `#/share/v1/…` link does use it
(`encodeShareLink(records, { name: shareName.value })`), so the two routes in one sheet disagree.

## Interaction model

- **Precondition**: a project with bodies, a connected gist token, the Share sheet open.
- **Trigger**: the existing **Publish** and **Update gist** buttons. No new control.
- **Feedback**: the gist's title, on github.com and in the **Open on GitHub** tab, is the name in the field.
  After an **Update gist**, a changed name renames the gist's description, README heading and file, and the
  old file is removed (the rename branch `update()` already has).
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: no new surface.

## Documentation

- **Page**: `docs/sharing.md`, **Publish a project as a gist**: say the Name field is the gist's title.
  **Example**: "Type *Fan Duct* in **Name** and tap **Publish**: the gist, its README and its file are all
  called *Fan Duct*. Change the name and tap **Update gist** to rename it."
- **Media**: none new (the sheet is already shot).

## Affected files

- `src/stores/share.js`: expose the sheet's `shareName` (it is a computed already) to the gist composable.
- `src/composables/useGistPublish.js` (+ spec): `publish()` and `update()` take the name from the sheet.
- `src/core/gistLink.js` / `gistReadme.js`: unchanged unless the slug rules need a case.
- `e2e/gist-share.e2e.js`: type a name, publish, assert the fake gist API received it.

## Proposed fix

Decide **one** source of truth and record it in `docs/decisions/gist-storage.md`. Recommended: the sheet's
name wins for the gist (it is what the owner is looking at and called "the recipient's title"), and
publishing writes it back as the project's name so the next opening of the sheet, the file name and the gist
agree. If writing it back is too much for this task, the gist alone takes the sheet's name and the sheet
reopens with the gist's name when the project has one. Either way a name is never empty (`Untitled` only
when the field is blank), and the rename branch in `update()` keeps working.

## Effort

S.

## Testing

- **Unit** (`useGistPublish.spec.js`): sheet name `Fan Duct`, project name empty → file, README heading and
  description all say `Fan Duct`; sheet name changed between publish and update → description, README and
  file renamed, old file removed; blank sheet name → `Untitled`.
- **E2E (real app, `/`)**: a never-saved project, type a name, publish against the fake gist API, assert the
  request. **All three viewports; all three engines** (IndexedDB, `fetch`).
- **Acceptance scenarios**: re-drive 30 (the gist share). **Closed findings re-run**: `io-017`'s publish and
  update repros, because the same two functions change.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
