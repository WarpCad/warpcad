---
title: Rename a part of a group, so an imported model's Part 1, Part 2 can be given real names
category: ui
kind: feature
priority: medium
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-11-05 at the owner's request)
depends: []
status: done
---

> **What shipped (2026-11-05).** As proposed, with these answers to the open points:
> - **All-digit names are refused** (`renamedPartProblem`: *A part name cannot be only digits*),
>   not kept in order: a plain object moves integer-like keys to the front for every reader of
>   `Object.keys(parts)`, not only `setPartHidden`. A name is also refused, not trimmed, if it starts
>   or ends with a space; the field trims what was typed before sending it.
> - **A part a Repeat uses is refused by name** (*Repeat 1 uses Part 3, so it keeps its name*)
>   rather than teaching the Repeat sheet to follow renames.
> - **Two copies renaming the same part:** the merge model (`docs-022`) flags the later row
>   *conflicts with step N*, as it does any two edits of one body's terminal — same result in both
>   orders, nothing lost. The table's "the second is a no-op" holds for the fold (an absent part), not
>   for a merge.
> - **Reorder needed no new rule:** a row naming the new name reads the rename's record, so section
>   17's existing reference check refuses moving it above; a row written before reads an older record
>   id where the old name exists.
> - **A formula whose text names the old part** shows *… has no part Part 22* at the end of History
>   (documented). `laterChangeOf` follows renames, so a rename is never blamed for a size change.
> - One check, `document.renamePartRefusal`, serves the command, the Inspector field and the AI tool.
> - **Hand drive:** not done by a person. Driven by script on the owner's file: naming one part is
>   **3 taps + typing** (row, name or pencil, Enter/Done), about 4-6 ms of main-thread work per commit
>   and no long task. Whether 29 × that is tedious enough to file batch naming is left to the owner's
>   own walk (`TODO/VERIFY.md`).

## Goal

**In user terms:** the owner imported a 3MF and every part came in as `Part 1`, `Part 2`, and so on. A
3MF often carries no names (FreeCAD's export of the Feather has none, `io-024`), so the numbers are all
the importer can offer. Nothing in the app can change them afterwards. With 29 parts, `Part 22` says
nothing, and the name is what the Objects list, the breadcrumb, Align, formulas and History all show.

Done means: click into a part of a group, type a new name where the Inspector shows the part's name,
press **Enter**. The new name shows everywhere the old one did, the part keeps its colour, its
visibility and its place in the list, the selection stays on it, and one **Undo** puts it all back.

**Why this does not exist.** `core-038` ruled it out on purpose: "A recipe's sub-part names are part of
what the recipe *is*... renaming a member afterwards is out of scope — record it as a follow-up finding
only if the user asks." This is that request. `ui-056` left plain text in the Inspector for the same
reason (`Inspector.vue:891`).

## Done means

**A real import.** Import `~/Downloads/esp8266 feather.3mf` (`io-024`'s file, never committed), drag it
in, tap `Part 22` under **Parts**, press **F2**, type `ESP-12`, press **Enter**:

- The breadcrumb reads `Objects ▸ esp8266 feather ▸ ESP-12`, and the row is still in its old position,
  between `Part 21` and `Part 23`.
- History gains `Rename Part 22 to ESP-12 on esp8266 feather`.
- `ESP-12` is what the Align top line, the Print pieces file name (`esp-12.stl`) and `describe_scene` say.
- Undo: `Part 22` is back, and still selected. Redo: `ESP-12`, and still selected.
- Reload: `ESP-12` is still there.
- **Save to Library**, then drag the new row in: the new copy's part is called `ESP-12` too.

**A group.** Two **Cubes**, **Group**, tap `Cube 2`, colour it red, name it `Lid`. It stays red. Name
`Cube 1` to `Lid` as well: refused with *This group already has a part called Lid*, and nothing changes.

## Decisions

Every row is a filing choice; none was put to the owner. Change any of them before this runs.

| Question | Answer | What follows |
|---|---|---|
| A real rename, or a display label over the old name? | **A real rename: a new kernel op, `group.renamePart`.** The fold's group really has the new name | A label means every reader has to remember to translate, which `group.js:970` calls the trap, and dozens of modules read part names (`grep -l partName src`). It would also leave the formula language and the AI addressing the old name. The price is the carry list in Proposed fix |
| Do references written earlier need rewriting? | **No.** A record's operands point at a record id, and a formula reads the body "as they stand just above that row" (`formulaRead.js:8`). A rename is appended, so everything above it folds exactly as it did | History stays true: the row above the rename still says `Part 22` |
| Which bodies? | **Groups and imported models**: the lineage's root op is `group.assemble`, `group.merge` or `user.*` | **Not a recipe's own parts** (a bolt's `head`, a Pi's `ethernet`): `core-038`'s rule and the docs stand. `partAliasesOf`, the repair suggestions and the recipe's own part list all assume those names |
| Duplicates? | **Refused**, naming the clash. Unlike a body, where it is only a hint (`ui-056`) | `parts` is keyed by name, so a duplicate would destroy a part. The message suggests the next free name, in `assemblyPartNames`' pattern: *`10K 1` is free* for ten resistors |
| Blank? | **Keeps the old name, writes nothing**, helper line *A part needs a name* | A body's blank restores a generated name (`ui-056`). A part has none to go back to; Undo does that job |
| What characters? | `cleanPartName`'s rules, reported rather than silently fixed: no control characters, no comma (`resolvePieces` splits on commas), not `__proto__`, `constructor`, `prototype`, at most 80 characters (`MAX_PART_NAME_LENGTH`) | One check for the field and the kernel, beside `partNameProblem` |
| An Undo step? | **Yes**, one History row per rename | 29 renames are 29 rows. Accepted: no batching in this task |
| If a later edit removes the part, or brings in a part with the target name? | **The step does nothing, it does not fail**, same as `setPartHidden` | A display choice must not break a row. Anything that reads the new name then gets the ordinary "no part named" message. Refused at write time when the part is unknown. This also settles two replicas renaming the same part: the merged log's first one wins, the second is a no-op |
| Offered to the AI? | **Yes**, in `OPERATIONS`, with `partHiddenSpec`'s write-time check | `style.rename` is in `NOT_OFFERED`, but naming 29 parts by hand is the case where a model helps most: `io-024` shows the parts can be matched to a STEP tree by size. Move it to `NOT_OFFERED` if the owner prefers |
| Editing the Library row's definition directly? | **Not in this task.** **Save to Library** carries the names (`userPart.js:167` already allows `group.`) | See Not in this task |

## The record

```json
{ "id": "group-1-renamepart-1", "op": "group.renamePart", "target": "group-1", "supersedes": "group-1",
  "params": { "part": "Part 22", "to": "ESP-12" } }
```

Unnamed, `target` and `supersedes` both the current terminal, as `group.setPartHidden` is. `to`, not
`name`: the body id does not change, so selection and `viewHidden` stay keyed to the body.

## Interaction model

- **Precondition**: exactly one body selected and drilled into one named part, on a group or imported
  model (Decisions). On a recipe's own part, the name stays plain text as it is today.
- **Trigger**: the part's name at the top of the Inspector becomes the same editable field a body has:
  click or tap the name, the always-visible pencil (`inspector-name-edit`), or **F2**. **Enter** or
  tapping away commits; **Escape** reverts and is swallowed, so it cancels nothing else that is armed.
  Reaching the part is unchanged: a row under **Parts** or in the Objects list, or a second click in the
  3D view (`ui-016`). The Parts row itself is not edited inline.
- **Feedback**: at once, in the breadcrumb, the Parts section, the Objects list row, the viewport hover,
  the Align top line, the Repeat sheet, and History's new row. A refusal shows in the field's helper line
  and the field stays open with what was typed.
- **Placement**: n/a, the part is already placed.
- **Selection response**: unchanged. The selection stays drilled into the renamed part, and the gizmo and
  the highlight stay. It must survive commit, Undo and Redo (see Proposed fix: this is the lost-selection
  bug class, `SECOND-ATTEMPT.md`).
- **Selection count**: exactly 1, drilled in. With 0 or 2+ there is no part name field. A whole-body
  selection edits the body's name, as today.
- **Small-screen behavior**: same as `ui-056`: a full-width row of at least 44 px, commit on blur and on
  the keyboard's Done key, and the on-screen keyboard must not push the 3D view off screen. Long names in
  the rows truncate with an ellipsis. Nothing relies on hover.

## Documentation

- **Page**: `docs/selection-and-inspector.md`. Add **Naming a part of a group** after "Naming a part", and
  correct that section's last paragraph, which says a drilled-in name is always plain text. Add a pointer
  from `docs/user-library.md`'s "Importing a model with its parts: 3MF" section, and from
  `docs/groups.md`.
- **Example**: "Drag two **Cubes** into the view. Select both and press **Group**. Under **Parts**, tap
  `Cube 2`. Tap its name at the top of the **Inspector**, type `Lid` and press **Enter**. The Parts list
  now reads `Cube 1`, `Lid`." Then the imported case: "A 3MF often has no names, so its parts arrive as
  `Part 1`, `Part 2`. Tap a row under **Parts**, look at which part lights up in the view, and name it the
  same way. **Save to Library** afterwards if you want new copies to keep the names." Say that names must
  be unique within a group, and that a ready-made part's own names (a bolt's `head`) cannot be changed.
- **Media**: one still, `docs/screenshots/inspector-rename-part.png`, from
  `e2e/docs/selection-inspector.docs.js`, embedded in that section. No movie. `hardware-bolt-fit.png`
  should not change, because a recipe's part keeps plain text; if it does, find out why.

## Affected files

- `src/core/kernel/group.js`: `renamePart`, and one name check beside `partNameProblem`
- `src/core/kernel/registry.js`: the `group.renamePart` entry
- `src/core/document.js`: `renamePart` command, op constant, `STEP_VERBS`, the History label
  (`:4396`), `colorOverridesOf`, `laterChangeOf` (`:3587`)
- `src/core/colorOverride.js`, `src/core/userPart.js` (`bakedRecolorsOf`)
- `src/core/timelineLabel.js:311`
- `src/core/visibility.js`, `src/stores/document.js` (`:332`, `:867`), `src/stores/selection.js`,
  `alignReference.js`, `hoverHighlight.js`, `colorPreview.js`
- `src/components/inspector/NameField.vue`, `Inspector.vue:890`, `src/composables/useSelectedBody.js`
- `src/ai/tools/operate.js`
- `docs/selection-and-inspector.md`, `docs/user-library.md`, `docs/groups.md`
- `e2e/rename-part-of-group.e2e.js` (new), `e2e/docs/selection-inspector.docs.js`
- `TODO/ACCEPTANCE.md`: one more step on scenario 31

## Proposed fix

Read from the source on 2026-11-05. Nothing here has been prototyped or measured.

**1. The kernel.** `renamePart(value, partName, to)` in `group.js`, on the pattern of `setPartHidden`: a
bare solid and an invalid name are refused; an absent part or a taken target returns `value` unchanged.
Three things to get right:

- **Keep the order.** Rebuild `parts` key by key with the new name in the same position, and map `names`
  in place. Delete-and-add would send the row to the bottom.
- **Don't union.** Use `copyParts`' way of carrying properties, not a spread or `Object.entries`, which
  would read a lazily combined part (`group.js:733`, half a second on a 29-part model in `io-024`). The
  solids are shared, so a rename does no CSG.
- **Carry the part's data**: `colors`, `meta` under the new key, and `joins`, `seam.joins` and
  `hardware[].joins` in every other part's `meta`, through `renameMetaParts`.

An all-digit name needs a decision when it is written: JavaScript moves integer-like keys to the front
of an object, and `setPartHidden` rebuilds `names` from `Object.keys(parts)`, so a part named `10` would
jump. Either refuse all-digit names or make that rebuild keep order. The test below holds either answer.

**2. Everything that holds the old name and does not go through the fold.** This list is the risk in
the task. Folding through the op is the easy half.

| Holder | Today | Needs |
|---|---|---|
| `style.recolor`'s `subPart` | `colorOverridesOf` reads the lineage and matches by name at the end (`colorOverride.js:120`), so a red part would turn back to its default colour | Translate each earlier entry's `subPart` through a rename met in the stream; a recolor written after the rename already uses the new name |
| A saved part's baked colours | `bakedRecolorsOf` reads recolors off a definition's chain | The same translation when the chain contains a rename: this is what **Save to Library** then drag exercises. `core-054` lost exactly this colour once |
| The drilled-in selection | `stores/document.js:332` steps up to the whole body when the part name is gone, so the commit would throw the selection away | Move the address to the new name before that check runs, for commit, Undo and Redo. Also `:867`'s restore |
| The eye (`viewHiddenParts`, `viewHidden` on the state line) | Keyed by part name, outside Undo | Move the key on rename and move it back on Undo, or the part silently reappears |
| `alignReference`, `hoverHighlight`, `colorPreview`, the Show hidden parts state | Keyed or filtered by part name, in memory | Follow the rename, or drop to their "whole object" state with no error |
| `laterChangeOf`, the "reads before a later change" report (`document.js:3587`) | A formula above the rename read `Part 22`; the check re-reads that name on the later row, gets `null` and reports the rename as having changed the size | Follow the reading's part name through renames as it walks down, so a rename is not reported. This would be a false alarm on scenario 33's path |
| A Repeat's `seed.pieces` and `targets` (`repeat.js`) | Stored as names. The row folds above the rename, so it should still build, but **Repeat sheet** and the status read current names against stored ones | Check this first. If it cannot be made to hold, refuse the rename by name while a Repeat uses that part: *Repeat 1 uses Part 3* |
| `dependents.js`, reordering History | A reference below a rename could be moved above it. Section 17's static move check (`document.js:6408`) looks at record references, not part names | Teach that check that a row naming `to` cannot move above the rename, and a row naming `part` cannot move below it. A merge that arrives naming the old part gets the existing "no part named" repair |

One store-level `partRenamed(bodyId, from, to)`, called on commit and, with the names swapped, on Undo
and Redo, is simpler than teaching each store. Undo and Redo know the record they removed or restored.

**3. The command and the field.** `document.renamePart(id, part, to, transaction)` refuses by name, on
`setPartHidden`'s pattern: unknown body, deleted body, a Repeat, a recipe body, an unknown part, a taken
name; an unchanged name writes nothing. Give `NameField.vue` an optional part mode, or extract its
editing to a shared piece, rather than writing a second field: F2, Escape, blur and the pointerdown-outside
commit (`ui-056`, found by touch e2e) are all earned behaviour. Its testids stay `inspector-name` and
`inspector-name-edit`. An `objects-part-<id>-<name>` testid changes with the name, as it should.

**4. The AI.** `group.renamePart` in `OPERATIONS`, with write-time checks and a message listing the
body's real part names. The exhaustiveness spec fails otherwise.

## Not in this task

- **Naming parts in a batch**: a table of all 29, or tab to the next part. Worth filing if the one-at-a-time
  walk is tedious in the hand drive; the walk's count is recorded in Testing.
- **Renaming a part in the Library row's definition**, without placing it. Saving a named copy covers it.
- **Renaming a recipe's parts**, and **a split's `A`/`B` pieces** (root op is the original solid).
- **Reading names from a STEP tree** (`io-025`, deferred).

## Effort

M, at the top of it. The op and the field are small; the carry table is the work.

## Testing

- **Unit, `group.spec.js`**: order kept; `names` kept; a hidden part stays hidden; `colors` and `meta`
  follow, including another part's `joins`; solids are the same objects; a lazy part is not read; absent
  part and taken target return `value`; a bare solid, `__proto__`, a comma, a control character, blank
  and 81 characters are refused; an all-digit name does not move the row, including after a
  `setPartHidden` hide and show.
- **Unit, `document.spec.js`**: one record, one Undo, Redo; save and reload; refused for each case by
  name, writing nothing; a red part stays red; a recolor after the rename works; a rename then a
  `{ pieces }` Subtract using the new name; a Subtract above the rename still folds; a formula above it
  keeps its value and raises **no** "later change" report; rename chained twice (`A`→`B`→`C`), and `A`
  reused by another part afterwards; a removed part makes the step a no-op; two replicas renaming the
  same part merge cleanly, in both orders; a reorder across the rename is refused.
- **Unit, `userPart`**: capture a renamed group, drop it: the new name and the colour both carry.
- **Unit, `NameField.spec.js`, `Inspector.spec.js`**: field present on a group's part and an imported
  part; plain text on a recipe's part; Enter, Escape, blur, blank, duplicate.
- **Unit, `operate.spec.js`**: offered; an unknown part refused with the list.
- **E2E** (`e2e/rename-part-of-group.e2e.js`, navigates to `/`, using `src/io/__fixtures__/threeMf.js`'s
  file through **Import model file…**): the Done means flow with a real mouse; then at phone width with
  trusted touch. Assert the rows, breadcrumb, History, selection kept through Undo and Redo, reload, a
  colour kept, and a duplicate refused. **All three viewports with a snapshot each, and all three
  engines**, since it covers persistence, the touch keyboard path and per-part meshes in WebGL.
- **Perf**: on the owner's 29-part file, measure commit to repaint, and confirm no mesh is rebuilt.
  Target: under a frame's budget of main-thread work beyond the fold, and no union.
- **Acceptance**: add a step to scenario 31 (rename `Part 22` to `ESP-12`, then Align against it, then
  Subtract with it). Re-drive **31**, **6** (group vs. sub-part selection), **32** (merged groups, a hidden
  part), **33** (formula over two parts, the `laterChangeOf` row above), **15** (the absent-part no-op, as
  `ui-093` re-ran it), and **1**. Drive it differently on purpose: rename while another part is eye-hidden,
  rename then Undo with the Align popover open, and tap a different part while the field is open.
- **Hand drive**: name all 29 parts of the real file, count the gestures per part, and record the number
  in the retirement note. That number decides whether batch naming gets filed.
- **Closed findings to re-run**: `ui-029` (select, edit, selection persists), `ui-016` (drill in, step
  out), `ui-053` (Escape must not cancel an armed placement), `ui-069` (a Repeat across parts, then rename
  a target), `core-054` (saved colours), `core-055` (recapture a placed part), `core-077` (a plain group's
  colour), `ui-093` (hide, rename, show), `io-024` (drop twice: the second copy is whole and keeps its
  file's names).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
