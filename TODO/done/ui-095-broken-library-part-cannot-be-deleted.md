---
title: A My parts entry that fails to load cannot be deleted
category: ui
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-05 from the owner's report
depends: []
status: done
---

> **What shipped (2026-11-06).** All four parts as proposed. The Part 4 cause reproduced: deleting a part that another saved part nests left the parent broken. Deviations: the banner reads `<name>: <reason>` with the child named by its part name, and "Delete each…" when several are broken. A part the open project also carries shows only its ordinary row, with Delete now enabled, never a second broken row. The tablet icon rail and the section pop-out got broken tiles too, so a tablet user can delete one. The rail has no banner, so the reason shows in the row pop-out. Part 4 lists indirect dependents too (A nests B nests C: deleting C names B and A). The e2e seeds IndexedDB with `page.evaluate` plus a reload, not `addInitScript`, which would re-seed after the Delete. The docs still lives in its own `e2e/docs/user-library-broken.docs.js`, not `user-library.docs.js`, so adding it does not re-record that file's movies.

## Problem

The owner's library shows this under **Import model file…**, and nothing in the panel can
remove the part it is about:

> Your saved parts could not all be read: it nests "user.esp8266-feather", which is not carried with it

Three things combine to leave the user stuck.

1. **A part that fails to load is dropped with no row.** `createUserLibrary().list()`
   (`src/storage/userLibrary.js:96-125`) validates every stored entry, then validates them
   together with `validateUserPartSet` (`src/core/userPart.js:735-756`), whose `graphProblems`
   (`src/core/userPart.js:704-723`) rejects a part that nests a part the library does not hold.
   Only the valid definitions reach `setLibraryParts`, so `userLibrarySection()`
   (`src/core/library.js:366-372`) never sees the broken one. A part with no row has no **⋯**
   menu, so it has no **Delete…**. The stored entry stays in IndexedDB (`warpcad-parts` /
   `parts`) and the banner comes back on every load.
2. **If the open project carries a copy, its row's Delete is disabled.** A part placed in the
   project gets a row from the project layer, but `inLibrary` (`src/stores/library.js:232`) is
   computed from the *valid* library layer. A part whose stored entry failed validation gets
   `inLibrary: false`, so `UserPartMenu.vue:118-139` disables **Rename** and **Delete…** with the
   tooltip "Only in this project — Duplicate it to keep a copy in My parts". The stored entry is
   still in IndexedDB, but the UI treats it as if it were not there.
3. **The banner names the missing child, not the broken part.** `loadProblem`
   (`src/stores/library.js:216`) joins only the `reason`s, which say what is missing
   (`user.esp8266-feather`) and not which saved part is broken. The user cannot tell which row,
   if any, the message is about. The op is an internal id (`user.` prefix, slug), not a name the
   user ever typed.

**How it probably got this way.** `confirmDelete` (`src/stores/library.js:565-578`) removes a
part from IndexedDB without checking whether another saved part nests it. `save()` checks
nesting (`userLibrary.js:131-135`), so a part can't be *saved* nesting a missing one, but
deleting the nested part afterwards leaves the parent broken. The likely sequence: save a part
that places the imported ESP8266 Feather model, then delete the Feather from My parts. Confirm
this in the RED step before relying on it. If the cause is different (a rename that changes the
op, an import, an older build's data), fix that path as well and record it here.

This is the same class of failure `CLAUDE.md`'s Interaction Model warns about: the app shows a
problem and gives the user no control that can act on it.

## Affected files

- `src/storage/userLibrary.js:96-125`: `list()` returns only `problems` for bad entries, not
  enough to draw a row (op, a name if one can be read, the reason).
- `src/core/userPart.js:704-723`: the "not carried with it" reason; the problem record has the
  op but the banner drops it.
- `src/stores/library.js:166, 210-218, 229-245, 538-578`: `loadProblem`, `start`, `userRows`
  and `inLibrary`, and the delete flow.
- `src/components/layout/LibraryPanel.vue:371-373`: the banner.
- `src/components/layout/UserPartMenu.vue:115-140`: Delete gated on `row.inLibrary`.
- `src/components/layout/LibraryRow.vue`: needs a broken-row variant (no drag source).
- `docs/user-library.md`: "The ⋯ menu on a My parts row" and "Deleting a part you have used".

## Proposed fix

**Part 1: list unreadable entries as rows you can delete.**

- `list()` also returns `broken: { op, name, reason }[]`, one per stored entry that did not
  survive, whether it failed `validateUserPart` or `validateUserPartSet`.
  Keep `ui-055`'s rule intact: once an entry is deleted, a part the project still uses keeps its
  row from the project's copy with Rename and Delete disabled until File ▸ New. Part 2 only
  changes the case where a stored entry still exists. `name` is the stored
  definition's `name` when it is a short plain string (treat it as untrusted data, like
  everything else read from IndexedDB, and truncate it); otherwise the op without its `user.`
  prefix. An entry with no readable op uses its IndexedDB key, which is what `remove(key)`
  deletes.
- The store exposes these as `brokenRows` and lists them in My parts after the ordinary rows. A
  broken row has a warning thumbnail, the name, and a one-line reason ("Can't be loaded: it uses
  esp8266-feather, which is no longer in My parts"). It **is not draggable**: no placement
  preview, and a tap does not arm placement. Its **⋯** menu has **Delete…** (enabled) and
  nothing else, or Rename/Duplicate/Export shown disabled with the reason as their title,
  whichever matches how `UserPartMenu` already presents a disabled item.
- Delete on a broken row uses the existing dialog and `confirmDelete`, which already calls
  `remove(op)` and `reload()`. After reload the row and its part of the banner are gone.

**Part 2: base `inLibrary` on what is stored, not on what validated.** A row from the project
layer whose op has a stored entry (valid or broken) is `inLibrary: true`, so its **Delete…** is
enabled and removes the stored entry. The project's own copy is untouched, as the existing
delete copy already promises. Rename stays disabled for a broken stored entry, because renaming
writes through `save()`, which would refuse it.

**Part 3: name the part in the banner.** Each problem reads as `<name>: <reason>`, with a
nested op shown by its part's name when the library or project knows it, and by the op without
`user.` otherwise. Add "Delete it from its ⋯ menu below" when every problem has a broken row to
delete. Example: *Your saved parts could not all be read: Feather enclosure uses
esp8266-feather, which is no longer in My parts. Delete it from its ⋯ menu below.*

**Part 4: stop the cause.** Before `confirmDelete` removes a part, find the saved parts that
nest it (walk `nestedOpsOf` over the library layer). If any do, the dialog names them and
refuses: *esp8266-feather is used inside Feather enclosure in My parts. Delete Feather
enclosure first.* The only button is **Cancel**. That is the conservative choice. Deleting the
dependents as well is the other option; if the implementer prefers it, ask the owner before
building it, because it deletes parts the user did not pick.

Out of scope: repairing a broken part by re-importing the missing child. Once Part 1 lands, a
user who still has the child's file can **Import part file…** and the parent loads again on the
next start, with no further change.

## Interaction model

- **Precondition:** at least one stored My parts entry fails to load (invalid on its own, or
  nests a part the library does not hold). For Part 4: a saved part that another saved part
  nests.
- **Trigger:** the **⋯** button on the broken row in **My parts** (Library panel), then
  **Delete…**, then **Delete** in the dialog. For a broken part the open project also carries,
  the same ⋯ → Delete… on its ordinary row, now enabled.
- **Feedback:** the broken row shows a warning thumbnail and the reason in place of the size
  line. After Delete, the row disappears, the toast reads *Deleted <name> from My parts*, and
  the banner loses that part's line (and disappears once no problem is left). For Part 4, the
  dialog names the parts that use it and offers only Cancel.
- **Placement:** n/a. A broken row cannot be dragged; nothing is placed.
- **Selection response:** n/a. The Library panel does not use viewport selection.
- **Selection count:** n/a.
- **Small-screen behavior:** same as other My parts rows: at phone width the ⋯ menu is the
  existing bottom sheet with large buttons, and the reason line wraps instead of truncating, so
  it does not cause horizontal scroll at 390 px.

## Documentation

- **Page:** `docs/user-library.md`. Add a section "A part that can't be loaded" after "Deleting
  a part you have used", and add a sentence to "Deleting a part you have used" on the Part 4
  refusal.
- **Example:**
  1. Save a cube as **Spacer** (select it, **Save to library…**). Drag Spacer in, select the
     placed copy with a second cube, and save that as **Spacer pair**.
  2. Try to delete **Spacer** from its ⋯ menu. The dialog reads *Spacer is used inside Spacer
     pair in My parts. Delete Spacer pair first.* Tap **Cancel**.
  3. If a part could not be loaded (for example one saved by an older version that refers to a
     part you no longer have), My parts shows it with a warning sign and the reason, and the
     message above the list names it. Tap its **⋯**, then **Delete…**, then **Delete**. The row
     and the message go away.
- **Media:** one still, `docs/screenshots/user-library-broken-part.png`, from a new shot in
  `e2e/docs/user-library.docs.js`, with the broken row and the banner, embedded in the new section. The shot seeds
  IndexedDB with a part that nests a missing op before the app loads. Use a scoped `moviesDir`
  if a movie is added; never `docs:gifs` (it rewrites every GIF).

## Effort

M (a few hours)

## Testing

- **Unit (`src/storage/userLibrary.spec.js`):** `list()` returns a `broken` entry for (a) a
  stored entry that is not a part record, (b) a definition that fails `validateUserPart`, (c) a
  valid definition that nests a missing op, and (d) a part nesting (c), whose reason is "can't
  be loaded". `remove(key)` of each clears it from the next `list()`.
- **Unit (`src/stores/library.spec.js`):** `brokenRows` after `start()`; `inLibrary` true for
  a project-layer row whose stored entry is broken; `confirmDelete` on a broken op removes it
  and drops its line from `loadProblem`; the banner text names the part, not only the child op;
  deleting a nested part is refused with the dependent's name, and nothing is removed.
- **E2E (`e2e/user-library.e2e.js`, navigates to `/`):** seed `warpcad-parts` with a part
  nesting `user.missing-thing` before load (`page.addInitScript`). Expand My parts, see the
  broken row and the named banner, open ⋯ → Delete… → Delete, see the row and the banner go,
  reload, and confirm they stay gone. A second test covers the Part 4 refusal via the UI
  (save, nest, try to delete the child). Run the layout check (row, reason wrapping, bottom
  sheet) at all three viewports, phone, tablet and laptop, with a snapshot at each.
- **Engines:** all three (Chromium, Firefox, WebKit). The path is IndexedDB persistence, and
  Safari's IndexedDB behaviour has differed before.
- **Acceptance scenarios to re-drive:** 18 (a drawing becomes a library part: save, place,
  delete flow), 31 (import a 3MF and use one part, the model this report involves), and 10
  (save, reload, confirm nothing changed, since My parts must survive a reload unchanged).
- **Closed findings to re-run:** the delete-with-placed-instances behaviour from `ui-055`
  ("Deleting a part you have used": the project keeps its copy and the row stays for the
  session). Part 2 changes `inLibrary`, so re-run that flow and confirm placed copies still
  survive.
- **Hand check (owner):** on the browser profile showing the screenshot, confirm the broken
  part now has a row and Delete removes it, and that the banner names it before deletion.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
