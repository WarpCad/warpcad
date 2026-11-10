---
title: Import a model file into the project from the File menu, not into My parts
category: ui
kind: finding
priority: high
model: opus
milestone: none — Findings table, filed 2026-11-10 from the owner's report
depends: []
status: done
---

> **What shipped (2026-11-10).** The full task, not the split: the owner chose it at Step 2.
> **File → Import model…** (`file-import-model`) reads an STL or 3MF in the worker and arms a
> placement session (`usePlacementStore().arm`): the ghost waits at the centre of the visible grid,
> follows hover, and a click, or a one-finger drag and lift, commits through the new
> `document.importUserPart` command, which stages the definition and appends its records as one
> transaction (*Import bracket.stl*, one Undo). Esc and **Cancel** on the chip add nothing. A file
> dropped on the view commits at the drop point. The library backend is never written. Owner's
> answers: **Open question 1**: an imported mesh that was never saved gets no My parts row, decided
> from the part itself (`isMeshPart`). The cost: a mesh placed from My parts and then deleted from it
> also loses its `ui-096` project-only row. **Open question 2**: the owner asked for a File-menu
> **Import to library…** item (`file-import-part`) for WarpCad part files, which go into My parts as
> before. **Change units** moved to the Inspector (`inspector-mesh-units`). The retired-slug entry
> was not possible (`help-slugs.json` redirects whole pages), so `docs/user-library.md` keeps the
> `## Importing a model file` heading above a pointer to the new `docs/import.md`. Step 6 found two
> bugs that were fixed before closing: the transform gizmo of a model that was already selected sat
> above the session layer and turned that model instead of placing the new one (the gizmo is now
> hidden while a session is armed), and at phone width the ghost started under the open Inspector
> sheet (it now starts in the visible band above the chip). The owner's `6538 RV-8803…` file was not
> on this machine. The Feather 3MF and four real STLs were used instead.

## Problem

Filed 2026-11-10 from the owner's report, with a screenshot, on app.warpcad.com v1.14.0
(9295c8e). The owner imported a 3MF and got an empty 3D view with **0 objects** in the
Inspector. The file had gone into the Library instead: a new `6538 RV-8803…` row at the bottom
of **My parts**, under the **Import part file…** and **Import model file…** buttons. Nothing in
the project or the view changed. In the owner's words:

> I expect importing a 3MF or STL file to appear in the project and view. I do NOT expect it
> to jump into my library. If I want to add it to the library, you can do that by selecting it
> in the inspector and adding it to the library.
>
> I think they should be in the File menu and not in the library as buttons.

That's two problems.

1. **The import goes to the wrong place.** `useLibraryStore().importModel`
   (`src/stores/library.js:775-850`) reads the file in the worker, builds a `user.*` part
   definition (`meshPartDefinition`, or `meshAssemblyDefinition` for a 3MF, `TODO/io-024`) and
   calls `backendOf().save(definition)`. That writes it into the person's library storage,
   which every project on the device shares. The project gets nothing until the person finds
   the new row and drags it into the view. Importing a file is a project action in every CAD
   tool the owner uses. Saving to the library is a separate choice, and it already exists as
   **Save to library…** in the Inspector (`SaveToLibraryButton`, `Inspector.vue:828,909`) and
   **To library** in the operations toolbar.
2. **The triggers are in the wrong place.** Both import buttons live in the **My parts** header
   of `src/components/layout/LibraryPanel.vue:338-357`, and again in the rail's ⋯ menu
   (`LibraryRail.vue`, around line 371). There, "Import" reads as "import into my library",
   which is what the code does, but not what a person expects. The File menu
   (`src/components/storage/FileMenu.vue`) holds every other way a file comes into the app
   (Open, Merge) and has no import item. Dropping a file on the Library panel
   (`LibraryPanel.vue:198`, `onFileDrop`) also imports into My parts.

The Library empty-state text says the same wrong thing: "…or choose Import model file… for an
STL or 3MF — and it appears here" (`LibraryPanel.vue:375`).

## Interaction model

- **Precondition** — none for the menu item. It is disabled, with its reason under the label in
  the File menu's existing dimmed-item style, while the History preview is open
  (`timeline.previewing`). This is the same rule as the other document-changing File items.
- **Trigger** — **File → Import model…** (`data-testid="file-import-model"`), in the File menu's
  "This device" group, right after **Merge…**. It opens the system file picker, filtered to
  `.stl` and `.3mf` (today's `modelAccept`, with no `capture`, so a phone offers Files). At
  laptop width, dropping an STL or 3MF file **on the 3D view** does the same thing. The drop
  sets the position directly (see Placement). Dropping a file on the Library panel no longer
  imports anything.
- **Feedback** — while the worker reads the file, a status line near the top of the viewport
  shows *Reading bracket.stl…* with a spinner and a Cancel button (today's `modelImporting` and
  `cancelImportModel`, moved out of the Library). After that, the placement preview appears
  (below). On commit the model is selected, the Inspector shows its size and its "not
  parametric" note as it does today for a placed mesh, it is listed in **Objects**, and a
  History entry *Import bracket.stl* is added. A refusal (too large, bad file, unknown units)
  shows today's reason text in that same status line, `role="alert"`, and the project does not
  change.
- **Placement** — placed in the 3D view, per `CLAUDE.md`'s Interaction Model. The menu path has
  no drag already under way, so the import arms a **placement session**. The ghost mesh the
  Library drag uses (the viewport's existing preview) follows the pointer over the view, and a
  click commits at that point on the grid. On touch, the ghost starts at the centre of the
  visible grid. A one-finger drag moves it, and releasing commits. A floating chip,
  *Place bracket.stl · Cancel*, stays visible during the session, and Esc or Cancel ends it
  with nothing added. A file dropped on the view commits right at the drop point, with no
  separate session. Snapping while placing behaves as it does for a Library drop.
- **Selection response** — the committed model is selected. For a 3MF it is selected as the
  whole assembly, the same first-click behaviour `io-024` gives it (a second click narrows to a
  part). The transform gizmo attaches as it does for any placed body. The Inspector's
  **Save to library…** stays the way to put it in My parts. Saving it there reuses `ui-105`'s
  path: the save takes the project's copy of the definition, with the same geometry.
- **Selection count** — n/a: importing creates geometry. It is not an operation on a selection.
- **Small-screen behavior** — the File menu is already reachable at phone width, so the item
  lives in the same menu. The placement session's chip sits above the phone toolbar and clear
  of the bottom sheet. The Library sheet loses both import buttons at every width, and the
  rail's ⋯ menu loses its import items.

### What happens to Import part file…

**Import part file…** reads WarpCad's own part file (`.json`, from a My parts row's
**Export part file**, `TODO/ui-055`). That file is a library-to-library exchange format. It can
hold several parts and the parts they nest. Its button moves too: it leaves the Library header
and becomes **File → Import part file…** (`data-testid="file-import-part"`), right after Import
model…. Recommended default: it **keeps adding to My parts**, because the file is a set of
library entries, not one placed object. Its toast then names where the parts went and points to
the Library (*Added Standoff to My parts. Open Library to place it*). See Open questions.

## Documentation

- **Page** — a new `docs/import.md`, *Importing a model file*, with a sidebar entry
  (`.claude/commands/docs.md` Step 4). Move the "Importing a model file", "What it reads, and its
  limits", "Importing a model with its parts: 3MF" and "What a 3MF import keeps" sections out of
  `docs/user-library.md` and into it, rewritten for the File-menu flow. `docs/user-library.md`
  keeps one short paragraph: *to keep an imported model, select it and choose Save to
  library…*, with a link to the new page. Add a retired-slug entry to `docs/help-slugs.json` so
  old `user-library#importing-a-model-file` links still land on the new page. Point the
  `import-model` help topic (`src/help/topics.js:64`) at it. Add **Import model…** and
  **Import part file…** to `docs/save-load.md`'s File-menu list.
- **Example** — "Open **File**, choose **Import model…**, and pick `bracket.stl`. *Reading
  bracket.stl…* shows over the view. Move the pointer over the grid, and a see-through bracket
  follows it. Click where it should go. The bracket appears selected, and the Inspector shows
  its size, 40 × 20 × 40 mm. To keep it for other projects, choose **Save to library…** in the
  Inspector." Plus the 3MF version, using the Feather HUZZAH example the page already has, and
  the touch version (drag the ghost, then lift your finger).
- **Media** — update `e2e/docs/import-model.docs.js` and `e2e/docs/import-3mf.docs.js` so they
  drive the File menu: `docs/media/import-model-place.gif` and `docs/media/import-3mf-align.gif`
  are re-recorded, and both move to `docs/import.md`. Retake
  `docs/screenshots/library-my-parts.png`, because its import buttons are gone. Add one new
  still, `docs/screenshots/file-menu-import.png`: the open File menu with both import items.
  Encode the GIFs through a scoped `moviesDir`. Do not run `docs:gifs`, which rewrites every
  GIF.

## Affected files

- `src/stores/library.js:775-850` — split `importModel`. Reading and validating the file
  (`importModelFile`, `importedNameFor`, the definition builders) moves to a new project-side
  flow. The library store keeps only `importText` (part files) and `setMeshUnits`.
- New `src/stores/modelImport.js` (UI state only: the file being read, the error, the placement
  session) and a command in the command layer that adds the definition to the project's parts
  and adds the placed record in **one** transaction with a local origin, so one Undo removes
  both.
- `src/core/document.js:3116` (`adoptUserPart`) — today a definition reaches the project only
  by being built from the library first. The import needs a path that puts the definition in
  the project layer directly, without the library backend.
- `src/stores/placement.js` — `begin()` takes pointer coordinates, so placement only works as a
  drag today. Add an armed session that starts with no pointer, follows hover, and commits on a
  click or tap.
- `src/components/storage/FileMenu.vue`, `src/stores/fileMenu.js` — the two new items, their
  hidden file inputs, and the preview-mode reason.
- `src/components/layout/LibraryPanel.vue:110,198-204,338-357,362-375,384-404` and
  `src/components/layout/LibraryRail.vue` — remove the buttons, the inputs, the file drop, the
  *Reading…* row, and the import wording in the empty-state text.
- The viewport drop target (`src/components/viewport/`) — accept a dropped `.stl`/`.3mf` file.
- `src/stores/library.js` (the My parts row list, `ui-096`) — see Open question 1.
- Specs to update: `src/stores/library.spec.js:266`, `src/components/layout/LibraryRail.spec.js:71`,
  `e2e/import-model.e2e.js`, `e2e/import-3mf.e2e.js`, `e2e/user-library.e2e.js`.

## Proposed fix

1. **Project-side import.** Keep the worker read (`importModelFile`) and the definition
   builders as they are. They already produce a `user.*` definition that a project can carry
   (`TODO/core-037`), validate through `validateMeshAsset`, and round-trip through save, merge,
   gist and export. The change is where the definition goes: into the open project's part layer
   through a new command, never through `backendOf().save`. The name is checked against the
   **project's** parts, not My parts. `ui-105` keeps the two name spaces separate, so a project
   can import `bracket.stl` while My parts already has a `Bracket`.
2. **Armed placement.** Add a placement session to `usePlacementStore` that the viewport's
   existing ghost and drop target already understand: `arm(op, label)` starts with no pointer
   position, the first hover or touch sets one, and `commit()` / `cancel()` end it. The drag path
   (`begin`/`move`/`drop`) is unchanged. No per-move allocation, the same as the existing
   `track()`.
3. **One transaction.** Committing adds the definition and the record together, inside one
   transaction with a local origin, named *Import bracket.stl*. Undo removes the instance and the
   definition the project carried only for it. Cancelling the session adds nothing.
4. **Move the triggers** to the File menu, as described in Interaction model, and take them out
   of the Library and the rail.
5. **Units.** Today **Change units** for a mesh is in the My parts row's ⋯ menu
   (`setMeshUnits`). An imported model that is not in My parts needs the same choice. Show it in
   the Inspector for a selected imported mesh. It writes a new version of the project's
   definition and goes through the command layer.

If this is too much for one task, split it after step 1. Steps 1 and 3 (import into the
project, placed at the centre of the visible grid and selected) fix the owner's actual
complaint. The armed placement session, step 2, can then follow as its own task, which brings
the menu path in line with `CLAUDE.md`'s placement rule. Say so explicitly in the closing note
if that split is taken.

## Open questions

1. **Should a freshly imported model show up in My parts as a project-only row?** `ui-096`
   lists every part the open project places, even one that is not in My parts, with the note
   *Not in My parts. It's listed because it's placed once in this project.* If that rule holds,
   an imported model still "appears in the library", which is exactly what the owner objected
   to. **Recommended:** list only parts that came from My parts. An imported model that was
   never saved to the library gets no My parts row. Its home is Objects and the Inspector, and
   **Save to library…** gives it a row. The `ui-096` rows stay for parts that were placed from
   the library and then deleted from it.
2. **Where does Import part file… put its parts?** Recommended: My parts, as today (see
   Interaction model). The alternative is to add the parts to the project and place the first
   one. That is consistent with Import model…, but the file is a set of library entries, so
   "place it" has no single answer.

The implementer asks these through `AskUserQuestion` at `/fix-todo` Step 2. If the owner is not
there, they proceed with the recommended answers and record them in the closing note.

## Effort

L — a new project-side import command, an armed placement mode the store does not have yet, two
File-menu items, the Library clean-up, a docs page move, and two re-recorded movies. Splits into
two M tasks as described under Proposed fix.

## Testing

- **Unit** (Vitest, next to source): the import command adds the definition to the project's
  parts and the record in one transaction, and one undo removes both. A refused file changes
  nothing. A name already in My parts is still accepted for the project. The library backend's
  `save` is **never** called by Import model… (assert on the mocked backend). The placement
  store's armed session: `arm` → hover → `commit`, and `arm` → `cancel` adds nothing. The File
  menu store disables the item while previewing, with a reason.
- **E2E** (`*.e2e.js` at `/`): rewrite `e2e/import-model.e2e.js` and `e2e/import-3mf.e2e.js` to
  drive **File → Import model…**, place with a real pointer (jittered moves), and assert that
  the body is in Objects and selected, the Inspector shows its size, **My parts' count does not
  change**, and Undo removes it. Add a case that drops a file on the viewport. Add a case for
  Inspector → **Save to library…** on the imported model, which makes the My parts row appear
  with the same size. Update `e2e/user-library.e2e.js` so it checks that the Library header no
  longer has import buttons.
- **Viewports**: the small-screen behaviour differs (touch placement, chip position), so these
  specs run at all three reference viewports, with a snapshot at each.
- **Engines**: touch input, the WebGL ghost and persistence (IndexedDB library, project save)
  are all involved, so all three engines: Chromium, Firefox and WebKit.
- **Acceptance scenarios to re-drive**: **26** (Import an STL, place it, and subtract a
  primitive from it) and **31** (Import a 3MF and use one part as a reference). Both change their
  steps from the Library to the File menu, so rewrite their steps in `TODO/ACCEPTANCE.md` in the
  same commit. Also **1** (two independent primitives, last re-driven with an imported STL),
  **10** (save, reload, confirm nothing changed: the imported definition must survive a reload
  with no library entry behind it), **18** (a drawing becomes a library part, which shares the
  Save to library path) and **8** (remote-load safety: a project carrying an imported mesh
  opened from a gist).
- **Closed findings to re-run**: `io-009`'s and `io-024`'s original reproductions (a large STL
  and the Feather 3MF), now through the File menu. `ui-096`'s project-only row reproduction,
  against the answer to Open question 1. `ui-105`'s name-clash reproduction, saving an imported
  model whose name My parts already holds.
- **Owner's case**: re-run the owner's report directly. Import the 3MF from the screenshot
  (`6538 RV-8803…`) through File → Import model…, then confirm it is in the view and in Objects,
  and that My parts did not change.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
