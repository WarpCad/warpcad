---
title: A My parts row that exists only in the open project can't be deleted, and doesn't say why
category: ui
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-06 from the owner's report
depends: []
status: done
---

> **What shipped.** Parts 1–3 as specified, with one change in Part 1: a delete writes a `body.delete` tombstone and keeps the original record, so the row count is taken from live placements (`projectUsage`), not raw records. `usageOf` is unchanged. Undo removes the tombstone, so the row returns. Not built, because they are owner decisions: the separate "In this project" section and the "Select placed copies" button. Hand-driven: none yet (scenarios 10, 18, 31 still to do by hand). The owner's case (a/b/c) is most likely nested or stale; confirm on the browser profile.

## Problem

The owner opened **⋯** on **esp8266 feather** in My parts and got this menu: **Rename** and
**Delete…** greyed out, **Duplicate** and **Export part file** enabled. Nothing on screen says why,
and nothing the user can do removes the row. It's the same part `ui-095` was filed about. Deleting
the Feather from My parts is what left its parent broken, and `ui-095` let the parent be deleted.
The Feather's row is still listed.

**Why Delete is disabled.** My parts lists every *effective* user part (`userLibrarySection()`,
`src/core/library.js:366-372`). That is the **library layer** (IndexedDB) *plus* the **project
layer**: the copies the open project carries (`effectiveUserParts()`, `src/core/userPart.js`). A
part the open project carries but IndexedDB no longer holds gets a row with
`inLibrary: false` (`src/stores/library.js:272`), and `UserPartMenu.vue` disables Rename and Delete
for it. `ui-055` chose this on purpose ("the row stays, from the project's copy, with Rename/Delete
disabled, until File > New", `TODO/done/ui-055-save-to-library-and-my-parts.md` item 5), and
`docs/user-library.md` "Deleting a part you have used" says the same. The rule itself holds up:
there is no library copy left to delete. The way it reaches the user fails in four places:

1. **The reason is only a hover tooltip.** The disabled items carry the reason in `title`
   ("Only in this project — Duplicate it to keep a copy in My parts", `UserPartMenu.vue`
   `projectOnlyReason`). Touch devices never show a `title`, and on a laptop the user has to hover
   a disabled button to find it. `CLAUDE.md` Responsive Layout: a control that only explains
   itself on mouse hover fails. The screenshot shows no reason anywhere.
2. **The row looks like a saved part.** Nothing on a project-only row marks it as different from
   a saved one. The **in-project dot** (`LibraryRow.vue:274, 395-400`) shows only when
   `usage > 0`, and for a part that is in the project *and* in the library it means something else.
   So the user reads the row as "a part in my library", and Delete being disabled looks like a bug.
3. **A part used only inside another placed part shows no dot.** `usageOf`
   (`src/core/userPartTools.js:267-271`) counts records whose `op` is the part itself. The project
   layer, though, carries every part the placed parts *nest* (`adoptUserPart` →
   `requiredUserParts`, `src/core/document.js:3097-3109`). The Feather is most likely nested
   inside a placed enclosure part. Its row then shows usage 0 and no dot, and still can't be
   deleted. The user can see no connection between the row and anything in the project.
4. **A row whose part nothing uses any more stays until reload.** The project layer only grows
   during a session: `ensureProjectParts` only adds, and `setProjectParts` runs only on a project
   load (`src/core/document.js:5205-5210`). The document's own `userParts` map is never pruned
   either. `serializeProject` drops unused definitions only when it writes
   (`src/core/project.js:276-284`). So after the user deletes every placed copy, the row stays,
   shows usage 0, and offers no way to remove it, until a reload or File ▸ New. The docs say
   "until you start a new project", which doesn't match this case either.

**Confirm which case the owner hit in the RED step**, before relying on it: (a) the Feather is
placed directly (usage ≥ 1); (b) it's nested inside a placed part (usage 0, nested use); or (c)
nothing in the project uses it any more (stale, case 4). The fix covers all three, but the
test should use the owner's case as its main repro.

**Workaround today:** if nothing in the project uses the part, reload the page (the autosave
writes only the parts in use, so the row should be gone after reload; confirm this). If something
does use it, the row stays until those placed copies are deleted, or File ▸ New.

## Affected files

- `src/stores/library.js:261-283`: `userRows`, `inLibrary`, `usage`.
- `src/core/userPartTools.js:267-271`: `usageOf` counts direct use only.
- `src/core/library.js:340-372`: `userPartRow` / `userLibrarySection` list every effective part.
- `src/components/layout/UserPartMenu.vue`: Rename/Delete disabled, reason only in `title`.
- `src/components/layout/LibraryRow.vue:274, 370, 395-400`: the in-project dot and
  `data-in-library`. The tablet rail (`LibraryRail.vue`) and pop-outs (`LibraryRowPopout.vue`,
  `LibrarySectionPopout.vue`) render the same rows.
- `docs/user-library.md`: "Deleting a part you have used".

## Proposed fix

**Part 1: list a project-only part only while the project uses it.** A row whose part is not in
the library (`inLibrary: false`) is listed in My parts only if the open project *uses* it: a
record places it, or a record places a part that nests it, at any depth. Otherwise there's no row.
This filters what is *listed* and deletes nothing. The document and the project layer keep the
definition, so **undo** of a placement delete still finds it and the row comes back. Leave
`ensureProjectParts`, the document's `userParts` and `serializeProject` as they are. Dropping the
definition itself would break undo: an undone delete would restore a record whose part no longer
exists anywhere. A part that is in the library is always listed, whatever its usage, as now.

**Part 2: count nested use.** Add `projectUsage(records, op, lookup)` next to `usageOf`. It
returns `{ direct, nestedIn: string[] }`: the count of records placing `op`, and the names of the
placed parts that nest it, walked with `nestedOpsOf` over the document's carried parts. Part 1
filters on it, the row's dot shows for either kind of use, and Part 3's wording reads it. Keep
`usageOf` for the callers that mean direct use only (the Delete dialog's count of placed copies).

**Part 3: say on the row and in the menu that the part is only in this project.**

- A project-only row shows a visible line in place of (or under) its size line: *Only in this
  project*. On the tablet rail and in pop-outs, the tile gets a matching badge and the pop-out
  shows the line. This is text on screen, not a `title`.
- In the **⋯** menu, under the title, a short visible note: *Not in My parts. It's listed because
  this project uses it.* For nested use, name the part: *…because Feather enclosure, placed in
  this project, uses it.* For direct use: *…because it's placed 2 times in this project.*
- **Rename** stays disabled. **Delete…** is **enabled** and opens the existing dialog with
  project-only wording and only **Cancel**:
  *esp8266 feather isn't in My parts any more. It's listed here because Feather enclosure, placed
  in this project, uses it. Delete Feather enclosure from the view and it leaves this list. To keep
  esp8266 feather, choose Duplicate.* (For direct use: *…because it's placed 2 times in this
  project. Delete those from the view and it leaves this list.*) The user who taps Delete gets
  the reason instead of a dead button. That is the point of this fix.
- Remove `projectOnlyReason` as the only carrier of the explanation; keep `title` only as an
  addition.

**Out of scope, ask before building:** a separate "In this project" section under My parts
instead of mixing these rows in, or a **Select placed copies** button in the dialog. Either may
be the better long-term shape, but each is a layout or selection decision for the owner, not a
bug fix.

## Interaction model

- **Precondition:** the open project carries a user part that the local library doesn't hold
  (deleted from My parts after placing it, or arrived in a project file, a gist, an MCP write or
  an AI turn).
- **Trigger:** the **⋯** button on that part's row in **My parts** (Library panel; tile on the
  tablet rail), then **Delete…**.
- **Feedback:** the row reads *Only in this project* and the in-project dot shows. The ⋯ menu
  says why it's listed. Delete… opens a dialog that names what keeps it there and offers only
  Cancel. After the last placed copy (or the last placed part that nests it) is deleted from the
  view, the row disappears at once. Undo brings the copy and the row back.
- **Placement:** unchanged. A project-only row can still be dragged in, as now.
- **Selection response / count:** n/a. The Library panel doesn't use viewport selection.
- **Small-screen behavior:** at 390 px the ⋯ menu is the existing bottom sheet. The note and the
  row's *Only in this project* line wrap, with no horizontal scroll. Nothing depends on hover.

## Documentation

- **Page:** `docs/user-library.md`. Rewrite the last two sentences of the first paragraph of
  "Deleting a part you have used", and add a short subsection "A part that's only in this
  project".
- **Example:**
  1. Save a cube as **Spacer**, drag Spacer into the view, then delete Spacer from My parts
     (**⋯ → Delete… → Keep a copy in the project**).
  2. The Spacer row stays and reads *Only in this project*. Tap **⋯**: the menu says it's listed
     because it's placed once in this project. Tap **Delete…**: the dialog says to delete the
     placed copy from the view, or Duplicate to keep it. Tap **Cancel**.
  3. Select the placed Spacer in the view and delete it. The Spacer row leaves My parts. Undo,
     and it comes back.
- **Media:** one still, `docs/screenshots/user-library-project-only.png` (the row with its line
  and the open ⋯ menu), from a new shot in its own `e2e/docs/user-library-project-only.docs.js`
  so `user-library.docs.js`'s movies aren't re-recorded. Never `docs:gifs` (it rewrites every GIF).

## Effort

M (a few hours)

## Testing

- **Unit (`src/core/userPartTools.spec.js`):** `projectUsage` for direct use; nested one level;
  nested two levels (A nests B nests C, A placed → C's `nestedIn` names A); unused (0, `[]`); a
  cycle-free graph with a part nested by two placed parts names both once.
- **Unit (`src/stores/library.spec.js`):** a project-only part that is placed has a row with
  `inLibrary: false`; one nested in a placed part has a row and a non-zero usage signal; one no
  record uses has **no** row; a library part with zero usage still has a row. After removing the
  last record that places it, the row is gone. After undo it's back, and the definition was never
  dropped (`document.userParts()` still has it). The Delete prompt for a project-only op names the
  nesting part or the placed count and has `confirmLabel: null`.
- **E2E (`e2e/user-library.e2e.js`, navigates to `/`):** save a cube as a part, place it, delete it
  from My parts with **Keep a copy in the project**. The row shows *Only in this project*. ⋯ shows
  the note, Delete… is enabled and its dialog offers only Cancel. Delete the placed copy in the
  view, and the row disappears. Undo, and it returns. A second test covers the nested case: part
  B nests part A, place B, delete A from My parts (refused while B is saved, so delete B's library
  entry first with its copy kept). A's row says it's listed because of B. Snapshot the row and the
  open ⋯ menu at phone, tablet and laptop.
- **Engines:** all three (Chromium, Firefox, WebKit). The path reads IndexedDB and the document's
  undo, and the phone bottom sheet is where the reason was invisible.
- **Acceptance scenarios to re-drive:** 18 (a drawing becomes a library part: save, place,
  delete), 31 (import a 3MF and use one part as a reference, the Feather path this report came
  from), and 10 (save, reload, confirm nothing changed: a reload must not bring back an unused
  project-only row, nor drop a used one).
- **Closed findings to re-run:** `ui-095`'s repro (a broken stored entry still gets its ⚠ row and
  Delete, and a project-layer row whose stored entry is broken keeps Delete enabled and *removes*
  the stored entry, not the Part 3 dialog), and `ui-055`'s "Deleting a part you have used" flow
  (placed copies survive a delete from My parts).
- **Hand check (owner):** on the browser profile from the screenshot, open ⋯ on esp8266 feather
  and confirm the menu now says why it's listed and what to do. Record in the "What shipped" note
  which case (a/b/c above) it was.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
