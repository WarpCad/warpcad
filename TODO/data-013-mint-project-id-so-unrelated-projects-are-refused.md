---
title: Mint a project id so a merge can refuse an unrelated project, and attribute merged rows to the right copy
category: data
kind: finding
priority: high
model: opus
depends: [ui-062]
status: open
---

## Problem

Found by hand-driving `ui-062` (2026-10-12): **File ▾ → Merge file…** with two projects that were
each started from **New** in the app merges them silently — `Merged 2 steps from c-b.warpcad`,
with **Undo merge** offered, the other project's rows landing before the user's own. The
specified refusal (`<name> is a different project. Merge only works between copies of the same
project.`) never fires for app-made projects.

Why: no code mints a `projectId` (`src/core/document.js` `projectId = null`; the state line only
writes `project` when it is non-null, `src/core/merge/section.js`). `relatedness()`
(`src/core/merge/merge.js`) therefore falls back to the legacy test, "every shared unstamped id
holds a byte-identical record", and since `data-008` made ids replica-scoped
(`prefix-replica-counter`) two unrelated projects share no ids at all, which the legacy test
treats as vacuously related. The refusal only works for two version-1 files with colliding ids,
which is why every unit and e2e spec passed. Merging an unrelated file is data-hazardous, not
cosmetic: it interleaves another project's history into the user's.

A second symptom with the same root: a merged-in row written on another copy has origin
`local`, so a conflict reason reads `conflicts with step 3 (Fillet Cube 1, by you)` for a step
the user never made. `replicaId()` is random per document instance (a reload gets a new one), so
it cannot tell "this device" from "another device" — attribution needs an identity that persists.

## Affected files

- `src/core/document.js` — mint a project id when a document is created by New / first write,
  keep it across load, save and merge; `mergeState().projectId`
- `src/core/merge/merge.js` — `relatedness()`: decide what a file **without** an id means once
  app-made projects always have one (a v1 / v2-without-id file is still "legacy")
- `src/core/merge/section.js`, `src/core/project.js` — write and read it (`project` already in
  the state line; a format-version question, see below)
- `src/core/origin.js`, `src/core/document.js:~2579` — the `(…, by you)` wording for a row
  another copy made
- `docs/decisions/document-sync.md`, `docs/merging.md` (drop the "not complete yet" note),
  `docs/save-load.md`

## Proposed fix

Decide, then do:

1. **Mint** a random project id on New and on the first write of a document that has none, so
   every project saved by this build carries one. Opening an old file with no id leaves it
   `null` (legacy) rather than stamping it silently — or stamps it and says so; that is the
   call to make. Two files that both carry ids and differ are `unrelated`; the existing
   refusal path and sentence then work unchanged.
2. **A format question for the owner:** does adding `project` to files that had none change the
   bytes of an otherwise-untouched save? Record lines must stay byte-identical (the state line
   already carries merge metadata as version 2); say whether this needs version 3.
3. **Attribution:** either persist a per-device id (IndexedDB, never in the shared file) and
   compare it with the row's replica, or stop saying "by you" for a `local`-origin row in a
   merge reason and say `on this copy` / `on another copy` where the replica is known. Pick the
   one that survives a reload.
4. Remove the interim caveat from `docs/merging.md`.

## Effort

M

## Testing

- Unit: two documents created fresh and merged are refused with `UnrelatedProjectError`
  (`merge.spec.js` / `documentMerge.spec.js`); a copy of a project (same file opened twice) still
  merges; a v1 file with no id merges into a project that has one only when its shared ids are
  byte-identical (legacy rule kept); minted ids survive save → load → merge round trips and do not
  change any record line.
- App-level `e2e/merge-file.e2e.js` (navigates to `/`): extend the different-project case to use
  two projects *built in the app*, not two v1 fixtures, and assert the refusal text and an
  unchanged History. All three viewports and engines (file reading, persistence).
- Acceptance scenarios to re-drive: **10** (save and reload keeps the id), **22** (merge a copy).
- Closed findings to re-run: `ui-062`'s different-project steps; `data-011`'s v1 round trip.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
