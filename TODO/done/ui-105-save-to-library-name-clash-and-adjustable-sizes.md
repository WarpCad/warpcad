---
title: Save to library checks names against My parts only, and stops offering Adjustable sizes
category: ui
kind: finding
priority: high
model: sonnet
depends: []
status: done
---

> **Shipped 2026-11-08, wider than proposed.** Names are checked against My parts only (save, rename,
> duplicate, import and the AI's proposal), a save takes the project's version or version + 1, and
> Adjustable sizes is gone from the sheet, the store and `save_to_library` (`exposableParams` and
> `exposedFrom` were deleted; parts saved with exposed params still load and resize). Reproducing on
> the owner's file showed two more faults behind the name check, so by the owner's decision a save
> now also **carries** the project-only parts it nests into My parts, leaves first, and **refuses a
> name the body is built from** (*esp8266 feather is built from a part with that name — pick another
> name*). The owner's group therefore still can't keep its own name, but it saves under any other one.
> Left alone: Rename of a project-only part still saves it without its nested parts.

## Problem

Filed 2026-11-08 from the owner's report, with a screenshot, on the huzzah-feather-esp8266
project (the same file `ui-104` came from). The owner opened a saved project at
`app.warpcad.com` (v1.14.0, 9295c8e), selected the Feather group and tapped **To library**.
There are two faults and one design question.

### 1. The name check counts the project's parts as library parts

The sheet refused the body's own name: *A part called "esp8266 feather" already exists — pick
another name*, and Save stayed disabled. My parts listed two *esp8266 feat…* rows, both marked
**Only in this project**. The local library had no part by that name. The project carried one,
because placing a part copies its definition into the project (`core-037`'s project layer).

The cause is `takenParts()` in `src/stores/library.js:347`. It returns `effectiveUserParts()`,
which is the project layer and the library layer merged, and `nameProblem`
(`src/stores/library.js:377`) checks the typed name against that list. So any part the open
project carries blocks its own name, even when the library has no copy. The owner can't do the
thing the project-only row tells them to do, which is put a part they're looking at into their
library. Rename (`renameProblem`), import (`freeImportName`) and the AI's `saveProposed` use the
same list.

The owner's rule, 2026-11-08: **the library and the project don't share a name space.** A project
can hold a body or a part called *Hexagon* while the library holds a part called *Hexagon*. A save
is refused only when **My parts already holds** a part with that name. In that case the owner
expects to type a new name.

Name identity is the slug op (`user.<slug>`, `partNameProblem` at
`src/core/userPartTools.js:88`), and placed instances record that op. So "the project carries
`user.esp8266-feather` and the library doesn't" is the case the version machinery already handles
(`userPartStatus`, `src/core/userPart.js:1069`). The project keeps building its own copy, and the
library row may report a newer version. Saving into the library under the project part's name
fits that model. It isn't a collision.

### 2. The sheet offers "Adjustable sizes", and labels them with names the user never sees

The sheet's **Adjustable sizes (optional)** fieldset (`SaveToLibrarySheet.vue`, from `ui-055`)
lists every positive dimension in the body's creation records (`exposableParams`,
`src/core/userPartTools.js:133`). A ticked one becomes an Inspector field on every placed copy.
On the Feather it listed *Cube 1 size X 9.9 mm*, *Cube 1 size Y*, *Cube 1 size Z*, *Cube 1 round
radius*, *Cube 2 size X*, and so on. The owner asked why it offers to resize anything at all, and
what *Cube 1* is.

- **The labels are wrong.** `exposableParams` names a row `record.name ?? record.id` (line 158),
  which is the creation record's auto-name. The group's Inspector shows the sub-parts as **USB**
  and **USB clearance cutter**, because the group carries those names, not the cube record. So
  the sheet speaks about parts that, from where the user stands, don't exist.
- **The feature is the wrong model** (owner, 2026-11-08). Saving is an end step. To get a
  different size, the owner places the part, changes the size in the scene, and saves again
  under a new name. A saved part is fixed. That replaces `ui-055`'s "one saved Standoff placed at
  8 mm and again at 20 mm".

## Affected files

- `src/stores/library.js` (`takenParts` at 347; `nameProblem` at 377; `renameProblem` at 495;
  `saveProposed` at 461; `freeImportName` at ~768; the duplicate-name path at ~544; `openSave`'s
  `saveCandidates`/`saveChosen`; `commitSave`'s `exposeParams`)
- `src/core/userPart.js` (a library-layer-only list next to `effectiveUserParts`, e.g.
  `libraryUserParts()`; `userPartStatus` for the version the save takes)
- `src/core/userPartTools.js` (`partNameProblem`'s doc comment: `taken` is My parts, not the
  project; `exposableParams` stops being a UI input)
- `src/core/library.js` (`definePartFromSelection`: the version a save takes when the project
  already carries the op)
- `src/components/layout/SaveToLibrarySheet.vue` (remove the Adjustable sizes fieldset and its
  styles; header comment)
- `src/ai/tools/library.js` (`save_to_library`: drop the `expose` input; same name rule)
- `src/ai/prompt.js` (any line that tells the model it can expose sizes)
- `src/stores/library.spec.js`, `src/core/userPartTools.spec.js`, `src/ai/tools/library.spec.js`
- `e2e/user-library.e2e.js`
- `docs/user-library.md` (step 6 of the Standoff example; the *Adjustable sizes* section at ~197)

## Reproduction (2026-11-08, from `~/Documents/huzzah-feather-esp8266.ndjson`)

- **The selected body is the group built in this project**, `group-duolka-971`, named
  *esp8266 feather* (slug `esp8266-feather`). Its lineage is the placed instance
  `esp8266-feather-1-v5jezw-917` (op `user.esp8266-feather-1`, renamed *esp8266 feather*) merged
  with *Cube 1* and *Cube 2* (renamed *Battery-Connector clearance cutter* and *USB clearance
  cutter*). That is where the sheet's *Cube 1 size X* rows came from.
- **The two project-only rows are two ops**: `user.esp8266-feather` v1 (the imported board, 43
  records of `asset.mesh` / `import.mesh`) and `user.esp8266-feather-1` v1 (6 records, nesting
  `user.esp8266-feather`). The local library held neither.
- **The name fix alone does not make this save work.** Two more faults sit behind it:
  1. Saved as *esp8266 feather*, the part would become `user.esp8266-feather`, which it is built
     from (through `user.esp8266-feather-1`). The part would contain itself.
  2. Under **any** name, `backend.save` (`src/storage/userLibrary.js`, ~186) checks nesting
     against the library alone, so it throws *it nests "user.esp8266-feather-1", which is not
     carried with it*. Any group holding a project-only part fails the same way.

**Owner decision, 2026-11-08 (scope added to this task):**

- **Carry nested project-only parts.** A save also copies into My parts every part the capture
  nests, directly or deeper, that My parts doesn't hold, at the project's version, leaves first
  (so each `backend.save` finds its children already stored). A nested op My parts already holds
  is left alone, whatever its version.
- **Refuse a name the body is built from.** If `user.<slug(name)>` is an op the body's lineage
  uses, directly or through a nested part, `nameProblem` (and the AI's proposal and
  `save_to_library`) says *esp8266 feather is built from a part with that name — pick another
  name* (the typed name, trimmed), and Save stays disabled. This check runs on the record walk
  alone, with no kernel work, because `nameProblem` recomputes as the user types.

## Proposed fix

1. **Reproduce first, from the owner's file** (a copy of huzzah-feather-esp8266). Record two
   things here before changing code. First, is the selected body the original group built in this
   project, or a placed `user.esp8266-feather` instance? The Cube rows suggest the group, because
   `exposableParams` doesn't walk into a `user.*` op. Second, what are the two project-only rows
   (two ops, or one listed twice)? The fix must work for both selections.
2. **Names are checked against My parts only.** Add `libraryUserParts()` in `core/userPart.js`
   (the stored library layer, validated), and make the store's name checks use it for save,
   rename, import and the AI proposal. Project-layer parts and body names never block a library
   name. Keep the slug rule: "Hexagon", "hexagon " and "HEXAGON" are still one library name.
3. **Saving a name the project already carries.** The library gets `user.<slug>`, and the project
   layer keeps its own copy, so placed instances don't change (the rule from `core-037`).
   - Same geometry as the project's copy (`sameGeometry`, `src/core/userPart.js:1207`): save it at
     the project's version. The row stops saying **Only in this project** and no update prompt
     appears.
   - Different geometry: save it at the project's version + 1. The row then shows the existing
     newer-version state, and the project's instances keep building their own version until the
     user chooses otherwise.
4. **Remove Adjustable sizes from the save.** Delete the fieldset, `saveCandidates` and
   `saveChosen`. `commitSave` always saves a fixed part (`exposeParams: []`). Remove `expose`
   from the AI's `save_to_library` schema and from the chat proposal card. **Keep reading** parts
   that were saved with exposed params: their Inspector fields on placed copies keep working,
   because those parts are already in users' libraries and projects. Only new saves change.
   `exposableParams` stays, if anything else uses it, or goes with its spec if nothing does.
5. **Update the sheet's copy.** The note reads *Saves this group as a fixed part you can drag into
   any project. To save another size, place it, change it, and save it under a new name.*

Out of scope: a body-name clash (body names were never checked, so pin it with a spec and leave
it), and the `Cube 1` naming in `ui-104`'s sub-part Inspector, which stays with `ui-104`.

## Interaction model

- **Precondition**: unchanged. Exactly one body is selected (`library.saveGate`), not previewing,
  not a repeat (`ui-076`).
- **Trigger**: unchanged. The **To library** button in the Operations toolbar, or *Save to
  library…* in the Inspector header.
- **Feedback**: the sheet opens with the body's name. When My parts has no part by that name,
  Save is enabled right away, even if the project carries one. When My parts has one, the
  existing line names it and Save stays disabled until the name changes. After a save: the
  *Saved <name>* toast, and the row at the top of My parts with no **Only in this project**
  badge. There is no Adjustable sizes list.
- **Placement / Selection response / Selection count**: n/a (no placement; count unchanged).
- **Small-screen behavior**: same bottom sheet at phone width, now shorter without the sizes
  fieldset. Name, Category, Cancel and Save stay 44 px targets.

## Documentation

- **Page**: `docs/user-library.md`. Remove the *Adjustable sizes* section and the tick in the
  Standoff example's step 6. Add a short *Saving another size* section and a sentence that a
  project's parts never block a library name.
- **Example**: *Open a project that uses a part you don't have in My parts. Its row says Only in
  this project. Select the part in the view, tap **To library**, keep the suggested name, tap
  **Save**. The row loses its badge. To make a 20 mm version, drag it in, set its height to 20 in
  the Inspector, tap **To library** again, and name it **Standoff 20 mm**.*
- **Media**: update the save-sheet still under `e2e/docs/` that shows the fieldset (find it by
  `save-library-param`), and add none unless the page gains a step that needs one. Embed it on
  `docs/user-library.md`.

## Effort

M (a few hours). The name-scope change is small. The version choice in step 3 and removing
`expose` from the sheet, the store and the AI tool are most of the work.

## Testing

- **Unit (RED first)**, `src/stores/library.spec.js` and `src/core/userPartTools.spec.js`:
  - With `setProjectParts([esp8266])` and an empty library, `nameProblem` for *esp8266 feather*
    is `''`, and `save()` stores it.
  - With the same part in the library, the save is refused with the existing sentence.
  - Same geometry saves at the project's version, and the row's `inLibrary` is true. Different
    geometry saves at version + 1, and `newerVersionAvailable` is true.
  - A body named *Hexagon* never blocks a library part *Hexagon*.
  - Rename, import and `saveProposed` follow the same rule.
  - `commitSave` writes no `exposeParams`. A stored part that has exposed params still loads and
    places with its fields.
- **AI**, `src/ai/tools/library.spec.js`: `save_to_library`'s schema has no `expose`, and a
  project-only name is accepted.
- **E2E**, `e2e/user-library.e2e.js`, at `/`: load a fixture project that carries a project-only
  part, select it, **To library**, keep the name, Save. The toast appears, the row has no
  *Only in this project*, and there is no `save-library-param-*` in the sheet. Then save a second
  body under that same name and see the refusal. The spec runs at **all three viewports**
  (the sheet is a bottom sheet at phone width) with a snapshot at each, and on **all three
  engines**, because it writes IndexedDB.
- **Acceptance re-drive**: scenario **18** (the library half: group, save, File ▸ New, drag in)
  and scenario **10** (save, reload, nothing changed: the project layer survives a library save
  under its name).
- **Closed findings to re-run**: `ui-076` (a repeat is still refused), `ui-096` (a project-only
  row's note and Delete), `core-055` (re-capturing a placed part that ends in a translate) and
  `core-054` (a capture keeps its colour override). Each touches the save path changed here.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
