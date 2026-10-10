---
title: Exporting at another resolution drops the Leave-broken flag, so a project with a left-broken row cannot export
category: core
kind: finding
priority: medium
model: sonnet
milestone: M6
depends: [core-035, ui-052]
status: open
---

## Problem

`refoldRequestOf` (`src/core/exportJob.js`) builds the export worker's re-fold request from
`document.entries`, but copies only `record`, `origin` and `suppressed`. `ui-052`'s per-entry
**`leftBroken`** flag (a row the user chose to leave broken, which the fold skips) is not
copied. The worker's `createDocument(...).loadEntries(...)` therefore folds the broken row as
if it were healthy, and the export fails with `evaluation-failed` for a document that the app
itself shows and edits without complaint.

Found while verifying `TODO/core-037`: a project that names a user part it cannot load opens
with that row (and everything built on it) left broken, by design, and exporting it at a
resolution other than the design's hits this.

## Reproduction

1. Open a project whose state line has no `parts` but whose records contain a `user.*`
   placement (or any row the user has Left broken, e.g. a fillet that no longer fits), so
   `document.entries` has an entry with `leftBroken: true`.
2. Export at a resolution other than the design's (the Export popover's resolution picker).
3. Expected: the export folds with the broken row skipped, exactly as the live scene does.
   Actual: `ExportError` `evaluation-failed`.

Failing-test sketch (`src/core/exportJob.spec.js`): build a `createDocument()`, `loadEntries`
a two-entry log whose second entry is `{ record: <unknown user.* op record>, origin, leftBroken: true }`,
call `refoldRequestOf(document, 'fine', [])` then run the job; assert it resolves with the
first body and does not throw, and assert `request.entries[1].leftBroken === true`.

## Proposed fix

Copy `leftBroken` in `refoldRequestOf` next to `suppressed`
(`...(entry.leftBroken === true ? { leftBroken: true } : {})`) and make sure
`bodiesAtResolution`'s `loadEntries` call passes it through. Update the `RefoldRequest`
typedef. Check `document.loadEntries` already honours the field (it does for the file path).

## Affected files

`src/core/exportJob.js`, `src/core/exportJob.spec.js`.

## Effort

S.

## Testing

- **Unit**: the sketch above, plus the same with `suppressed: true` alongside, so the two
  flags are shown independent.
- **Acceptance**: none plausibly affected (scenario 11, export, only if the fix is driven
  by hand with a left-broken row; the unit test is the gate). This extends the `core-035`
  re-fold subsystem; re-run its repro (export a doc at Print resolution) once.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
