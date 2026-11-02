---
title: Grouping a group merges its parts (hidden parts, holes, colours and hides included), with an optional name prefix
category: core
kind: finding
priority: medium
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-11-02 at the owner's request)
depends: []
status: done
---

> **What shipped, where it differs from the proposal below.** Everything proposed shipped. Four
> differences. (1) The AI tool never fills in a prefix: a collision is refused and names the prefix
> to use, because a model has no popover to read. (2) The "hidden" in the cut rule is the geometry's
> own hidden state, never a Hide in the view, so a view setting cannot change what a boolean retires.
> (3) The real suggested prefix for a bolt is `Bolt / screw 2-`, the Library's name, not `Bolt 2-`.
> (4) Added, found by driving it: `ObjectList.vue`'s part rows wrap instead of truncating, because five
> rows all reading `clearance…` could not be told apart. `planGroupMerge`'s record has no `id`,
> because `nextId` ticks the clock and the planner runs on every keystroke.

## Problem

**In user terms:** select two groups, press **Group**, and each group turns into one opaque part of a
new group. Its own parts can no longer be picked, measured or cut with. The owner wants the groups to
merge: every part, hole and clearance lands in one flat group, and an added group's part names can take a
prefix, as JSCAD's `Group.add` allows.

**The cause is a scope limit `ui-015` recorded on purpose.** `group.assemble` is a plain `native` entry
(`src/core/kernel/registry.js:1796`), so the fold runs `toGeom3` on every operand before `build` sees it
(`src/core/kernel/index.js:346`). The registry's own comment calls this "a real, stated scope limit" that
waited for a UI able to address the parts. That UI has existed since `ui-016`. `add()`'s `subpartPrefix`
(`group.js:627-654`) is the JSCAD prefix, already ported, but nothing outside `group.js` reaches it.

**Reproduced on the owner's project**, `~/Documents/enviro-plus-featherwing.ndjson` (the request said
`~/Downloads`; that folder holds only the drawing). Folded with today's code on 2026-11-02:

| Body | Terminal record | Parts | Lives outside the geometry | Size (mm) |
|---|---|---|---|---|
| `Group 1` | `group-fd5zsq-890` | 16: `PCB`, `Pads`, `Header16`, `Header12`, `Reset`, `MICS6814`, `LCD`, `LCD active area`, `LCD flex`, `Display flex`, `LCD FFC`, `Mic`, `BME280`, `LTR-559`, `L1`, `PMS5003 socket` | `viewHidden`: `Pads`, `Header16`, `Header12` | 50.8 × 22.86 × 11.84 |
| `Clearances` | `group-fd5zsq-896-color-fd5zsq-899` | 5: `Screen clearance`, `Reset clearance`, `Light clearance`, `BME280 clearance`, `Mic clearance` | A whole-body red override (`16711680`) | 39.99 × 31.43 × 11.7 |

Grouping them today gives one body named `Group 3` with **2 parts** (`Group 1`, `Clearances`). The body
reports no colour override and no hidden parts, so **the red and the three hides are lost as well**.

The rest of this file exists because flattening `parts` alone looks finished and still loses work. Colours
and hides live outside the `Group` value, and a cut with one clearance would delete the board.

## Done means

Open the owner's file, select `Group 1`, Shift-select `Clearances`, press **Group**, enter the prefix
`clearance-`, tick **Hide these parts**, and commit. The result, with the kernel half prototyped on the real
file on 2026-11-02:

- One body, still named `Group 1`, with **21 parts**: the 16 unchanged, plus `clearance-Screen clearance`,
  `clearance-Reset clearance`, `clearance-Light clearance`, `clearance-BME280 clearance` and
  `clearance-Mic clearance`.
- Its size stays **50.8 × 22.86 × 11.84 mm**, because hidden parts do not count. `clearance-Screen clearance`
  alone measures 22.7 × 11.8 × 10 mm, and no part has moved.
- `Pads`, `Header16` and `Header12` are still hidden. The clearances are still red under **Show hidden parts**.
- Draw a shell around the board and Subtract `clearance-Screen clearance` from it: the shell gets the pocket
  and **the board stays in the scene**, so the next clearance can be cut the same way.

Leaving **Hide these parts** unticked gives 21 visible parts and 50.8 × 32.86 × 21.84 mm, because the clearance
blocks then count as part of the board for bounds, whole-body export and whole-body cuts. The popover must make
that choice easy to see.

**A built-in shape is treated like any other group, so you can add to one.** Select a Raspberry Pi and a Cube in
either order, press **Group**, and commit: one body, still named `Raspberry Pi 1`, with the Pi's 33 parts (its hidden
`hole1`–`hole4` still hidden) plus a `Cube 1` part. Tick **Hide these parts** on the Cube's row and it joins as a hidden
part, the same way a bolt's `tap` is one.

## Decisions

| Question | Answer | What follows |
|---|---|---|
| Does a built-in shape (Pi, bolt, camera) or a user part merge too? | **Owner, 2026-11-02: yes, treated like any other, so you can add to a built-in one** | **Merge parts** is ticked by default on every row with parts. Name collisions become routine, not rare (table below), so the popover handles them as it opens. Scenario 6's whole-unit Pi + Camera now means unticking, and its steps change (Testing) |
| Is the prefix literal? | **Owner, 2026-11-02: yes, `prefix + name`, like JSCAD** | Typing exactly `clearance` gives `clearanceScreen clearance`. The popover previews the result, and the docs use `clearance-`, the form a Pi's own `clearance-ethernet` already has |
| Are added parts hidden? | **Owner, 2026-11-02: an option, as in JSCAD's `hidden` argument** | **Hide these parts** on each added row, unticked by default, and `hidden` on the record. Ticked hides everything that row adds. Unticked keeps each part's source state, so it never reveals a bolt's `tap`. In the port, `add()`'s `hidden` governs only the combined part and its prefixed copies always stay out of `names` (`group.js:648-666`); `group.merge` applies the option to the merged parts, as the owner asked |
| Whose identity does the result take? | **Filing choice: a new record carrying the first merging body's current name** | `document.append` refuses `supersedes` and `consumes` together (`document.js:2568`), and its reason holds. So the body id changes while the name, the part order and what the person sees follow that body |

**Collisions, measured on 2026-11-02** with each shape's default params. The number on the diagonal is also that shape's
part count:

| | Bolt | Pi (`bplus`) | Camera | Screen | HAT |
|---|---|---|---|---|---|
| **Bolt** | 6 (`head`, `thread`, `tap`, …) | 0 | | | |
| **Pi (`bplus`)** | | 33 (`hole1`, `mb`, `ethernet`, …) | 3 (`hole1`–`hole3`) | 0 | 6 (`hole1`–`hole4`, `mb`, `gpio`) |
| **Camera** | | | 19 | 1 (`lens`) | 3 (`hole1`–`hole3`) |
| **Screen** | | | | 23 | 0 |

**A merged built-in gives up its whole-body Inspector params.** `paramEditability` blocks any root with `consumes`, so a
merged Pi's **Model** field disappears from the Inspector with the same note a Group gets. The param is not lost:
`stepParamEditability` still allows the Pi's own row in History, which re-folds the merge. The docs must say so.

## The record

A new op, **`group.merge`**. `group.assemble` is unchanged, and so is every file that uses it.

```json
{ "id": "group-…", "op": "group.merge", "name": "Group 1",
  "target": "group-fd5zsq-890",
  "operands": ["group-fd5zsq-896-color-fd5zsq-899"],
  "consumes": ["group-fd5zsq-890", "group-fd5zsq-896-color-fd5zsq-899"],
  "params": { "members": [
    {},
    { "prefix": "clearance-", "hidden": true,
      "colors": { "Screen clearance": { "color": 16711680 }, "…": "one entry per part" } } ] } }
```

- **`target` is the first-picked operand whose parts merge.** The others follow in selection order, so a Cube
  picked before a Pi still joins that Pi. `members` lines up with `[target, ...operands]`.
- **A member with `name`** becomes one part of that name: a plain solid, or a group kept whole through `toGeom3`,
  which is exactly what `group.assemble` does to it today. `hidden` may sit beside `name`, as in JSCAD's
  `add(object, name, hidden)`; `prefix` is refused there, because `name` is already the whole name.
- **A member without `name`** must be a group, and its parts merge in. A plain solid without `name` throws.
- **Why not a `merge: true` flag on `group.assemble`:** a build that predates the flag would ignore it and
  silently collapse the parts, the wrong-geometry-with-no-error failure `index.js` refuses throughout. An unknown
  op is refused by name, which `project.js` already calls the honest outcome.
- **Why not `add()` with `subpartPrefix`:** it adds a combined part as well (the "single object" the owner is
  objecting to), overwrites a colliding name silently, and carries neither `meta` nor the hidden state.

## Interaction model

- **Precondition**: 2 or more solids selected, the toolbar's existing gate (`OperationsToolbar.vue:399`),
  including its previewing and inactive-body checks.
- **Trigger**: the existing **⊞ Group** button (`data-testid="operation-group"`), on the flat row or in the
  `ui-082` pop-out. There is no new button.
  - **No selected body has named parts:** one click, today's `group.assemble`, no popover. This is the
    common case and must not gain a step.
  - **Any selected body has named parts:** a popover opens, built the way `AlignPopover.vue` is
    (`data-testid="group-merge-popover"`):

    ```
    Group 2 objects
    Group 1 · 16 parts · keeps its names
    Clearances · 5 parts
      [x] Merge parts       group-merge-keep-1
      Prefix [clearance- ]  group-merge-prefix-1
      [x] Hide these parts  group-merge-hide-1
      clearance-Screen clearance, +4 more
    [ Group ]  [ Cancel ]   group-merge-commit
    ```

    The first merging row has no prefix or Hide field: it keeps its names, which is what "merged into the first
    object" means. A plain solid's row reads `Cube 1 · 1 part` and offers only **Hide this part**. **Merge parts** is
    ticked by default on every row with parts, whether Group made the body or it is a built-in shape or a user part.
    Unticked, the row reads `Raspberry Pi 1 · one part` and keeps **Hide this part**. With nothing ticked, the only
    record that can be written is today's `group.assemble`; a Hide tick on such a row then makes it a `group.merge` of
    `name` members, so the option is never dropped silently.
- **Collisions**: checked as the popover opens and as the person types, against every part including hidden ones,
  in row order. A row that would collide opens with its prefix pre-filled as `<body name>-`, so grouping a Pi and a
  Camera opens with `Camera Module 1-` already there and commit enabled, and two bolts give `Bolt 2-head`. An edit
  that collides disables commit, and `group-merge-error` names the clash:
  `clearance-Mic clearance is already a part of Group 1. Change the prefix.` A refused prefix (below) is reported in
  the same place.
- **Feedback**: the popover closes, `data-body-count` drops, and the result is selected under the first merging
  body's name. The Objects list and the Inspector's Parts section list every part, and hidden ones appear under **Show
  hidden parts**. The History row reads `Merge Clearances into Group 1`, and Undo reads `Undo: Merge`.
- **Placement**: n/a. Nothing moves, and every part keeps its world position.
- **Selection response**: unchanged (scenario 6). The first click selects the whole group, with gizmo and bounds
  over its **visible** parts. The second narrows to a part, with a breadcrumb and that part's own size. Hidden parts
  are reached from the Parts section and the Objects list, as a bolt's `tap` is. A part that came from a Group-made
  member still shows its own parameter fields (see `partRecordsFor` below). A part from a built-in shape shows name and
  measurements only, as it does inside that shape today. The whole merged body shows no params; the note says to edit a
  built-in's **Model** from its History row.
- **Selection count**: 2 or more, unchanged. **Order now matters in two ways**, and the docs must stop saying it
  never does: the first merging group gives the name and keeps its part names, and parts follow selection order. A
  pick depth is still ignored, and the operand line still says so (`OperationsToolbar.vue`, note 4).
- **Small-screen behavior**: the popover uses the Align popover's phone layout. Rows stack, targets are 44 px, the
  list scrolls inside the popover, the page never scrolls sideways, and commit stays reachable with the on-screen
  keyboard open. At phone width the row of toolbar buttons is unchanged (`ui-043`, `ui-082`).

## Documentation

- **Page**: `docs/groups.md`, a new **Grouping groups: merging their parts** section. In the same edit, correct
  "Group does not care what order you pick things in" and the "Order never matters" note, which stay true only for
  plain solids. Cross-link it from "Cutting with just one part" in `docs/booleans.md` and from the Parts section of
  `docs/selection-and-inspector.md`, and state the cut rule below in `docs/booleans.md`.
- **Example** (the page contains this; millimetres, Z up):
  1. Drag two **Cubes** into the view, select both, and press **Group**: `Group 1`. Do the same with two more Cubes:
     `Group 2`.
  2. Click `Group 1`, hold **Shift** and click `Group 2`, then press **Group**. A small panel opens.
  3. In the `Group 2` row, leave **Merge parts** ticked and type `clearance-` in **Prefix**. The line below it shows
     `clearance-Cube 3, +1 more`. Tick **Hide these parts**, then press the panel's **Group**.
  4. One body remains, still named `Group 1`. In the Inspector's **Parts** section it lists `Cube 1` and `Cube 2`;
     turn on **Show hidden parts** to see `clearance-Cube 3` and `clearance-Cube 4` as well.
  5. To keep a whole group as a single part instead, untick **Merge parts** for it.
  6. To add to a built-in shape, drag in a **Raspberry Pi** and a **Cube**, select both and press **Group**, then press the
     panel's **Group**. The result is still named `Raspberry Pi 1`, its parts now include `Cube 1`, and `hole1` is still
     there to cut with.

  State plainly: the prefix is used exactly as typed, so include your own separator; a prefix cannot contain a comma;
  two shapes with the same part names need a prefix, which the panel fills in for you; a merged Pi's **Model** moves from
  the Inspector to its row in History; and cutting with a hidden part of a merged group leaves the group in place, while
  cutting with a visible part uses it up. Also update the "built-in multi-part shape" paragraph in `docs/groups.md`, which
  today describes parts only as kept inside the shape. Fix the wording against the running app when writing this.
- **Media**: `e2e/docs/groups.docs.js` gains a `group-merge` movie (`docs/media/group-merge.gif`, the example above)
  and a still of the popover (`docs/screenshots/group-merge-prefix.png`), both embedded in `docs/groups.md`.
  `e2e/docs-media.spec.js` guards them.

## Affected files

- `src/core/kernel/group.js`: `mergeInto(group, object, { prefix, hidden, colors })`; `resolvePieces` moves to
  `Object.hasOwn`
- `src/core/kernel/registry.js`: the `group.merge` entry; the comment at `:1786-1795` is rewritten to point at it
- `src/core/groupMerge.js` (new): `planGroupMerge`, the one writer's rule, shared the way `booleanConsumes.js` is
- `src/core/booleanConsumes.js`: `keepsToolBody` (the cut rule below), and `LineageView` gains `hiddenPartsOf`
- `src/core/inspector.js`: `partRecordsFor` follows a merged member's lineage
- `src/core/document.js`, `src/core/dependents.js`, `src/core/timelineLabel.js`,
  `src/components/inspector/ParamFields.vue`: their op-to-verb tables
- `src/components/viewport/OperationsToolbar.vue`, `src/components/viewport/GroupMergePopover.vue` (new)
- `src/ai/tools/operate.js`, `src/composables/useAgent.js` (`lastGroupOf`, `:394`), `docs/mcp.md`. `useAgent.js` has
  uncommitted work in the tree as of filing, so check before editing
- `docs/groups.md`, `docs/booleans.md`, `docs/selection-and-inspector.md`, `e2e/group-merge.e2e.js` (new),
  `e2e/docs/groups.docs.js`, `TODO/ACCEPTANCE.md`

## Proposed fix

1. **`mergeInto` in `group.js`**, one pass over the source's parts, no CSG, so the cost grows only with the part
   count:
   - **Names:** `prefix + name`, literal. A name already present, a hidden one included, throws and names both
     groups. Never overwrite.
   - **Refused names.** A `__proto__` part really does vanish: on 2026-11-02, `add()` with that name left `parts`
     with no own keys while `names` still listed it, and `combine` did not throw. So `__proto__`, `constructor` and
     `prototype` are refused here, and `resolvePieces` moves from `!group.parts[piece]` to `Object.hasOwn`. `io-024`
     asks for the same `__proto__` protection; whichever lands first does it.
   - **Prefix rules:** a string that contains no comma (`resolvePieces` splits on commas, so the part could never be
     addressed), no control characters and no leading whitespace. A trailing space is allowed. Each result is 1 to 80
     characters, `operate`'s existing limit.
   - **Visibility:** in `names` only if it was visible in the source and `hidden` is not set. A hidden source part
     stays hidden either way: `hidden` can hide, and never reveals.
   - **Holes:** `group.holes` are concatenated. Nothing can produce one from a record today (`addHole` has no caller),
     so a "hole" a person sees is a hidden part such as `hole1`, and that is what actually matters. A test still pins
     the concatenation, and that `combine` subtracts them, because the kernel API accepts them.
   - **Colours:** the source's `Group.colors` carry over under the new name, then the member's `colors` replace them.
     Each goes through `assertRecordColor`.
   - **Meta:** `meta` carries over under the new name, **and part names inside it are rewritten** (`joins`, `seam.joins`,
     each `hardware[].joins`). Otherwise a prefixed split's seam points at parts that no longer exist.
2. **The `group.merge` registry entry**, `wholeGroupNative('2+', …)`, which refuses a `pieces` address. It starts from
   an empty `createGroup()`, walks `inputs` in order, and validates `members`: the length, the fields, and that a plain
   solid has a `name`. Build errors name the op and the member.
3. **`src/core/groupMerge.js`**, so a click and a tool call cannot drift. `planGroupMerge(document, operands, choices)`
   returns `{ record, viewHides, previewNames, suggestedPrefixes, errors }`, with no side effects, which is what lets the
   popover call it on open and on every keystroke:
   - **Colours, baked into the record.** A user override lives on the operand's lineage (`colorOverridesOf`), which a
     new root does not read. So for each part it resolves `effectiveOverrideOf(body.colorOverrides, part)` and writes
     the answer to `members[i].colors`, expanding a whole-body override per part, target included. They land in the
     recipe tier, so a later user recolour wins, and Reset on it falls back to the baked colour. Separate
     `style.recolor` records would add one History row per part.
   - **View hides, as `viewHides`.** `{ subPart: <new name>, hidden: true }` for each hidden part, and for every part
     of a body hidden whole. Written under the new body id with `setViewHidden` straight after the append. It is not an
     undo step (`stores/document.js:447`), and the old keys stay under the old ids, so Undo brings each operand back as
     it was. Both paths carry them: `operate` needs a small after-append step for this, because `build` returns a record
     and nothing else.
4. **The cut rule, or the clearance workflow fails.** Today a sub-part Subtract retires the whole tool body unless the
   op declares drill parts (`booleanConsumes.js`), and a merged group's root is `group.merge`, so cutting with
   `clearance-Screen clearance` would delete the board. It would also take away a Pi's drilling once the Pi is merged.
   Extend `keepsToolBody`: **when the tool body's lineage root is `group.merge` and every named piece is hidden in it,
   the body stays**, reading the value through `LineageView.hiddenPartsOf`. Scenario 5 is untouched, since a bolt that was
   never merged still has the root `hardware.bolt` and its `tap` is still used up. A bolt merged with something else does
   stay after a `tap` cut, and that difference goes in the docs. The toolbar and `operate` already share this rule.
5. **`partRecordsFor`** (`inspector.js:606`) reads `params.names` zipped with `consumes` on the body's root, so a merged
   body would answer nothing. Teach it `group.merge`: a `name` member zips as before, and a merging member recurses into
   that operand's own map and applies the prefix. Repeated merges nest, so guard the walk against cycles. A built-in
   member falls back to name and measurements, as it does today, rather than claiming each part is a Pi (the reason
   `describeSubPart` already gives). `group.merge` joins `BLOCKING_OP_LABELS` in `ParamFields.vue`, with the note pointing
   to History.
6. **The AI path.** Add `group.merge` to `OPERATIONS` in `operate.js`, built through `planGroupMerge`, and include it in
   `lastGroupOf`. **`group.assemble` in `operate` refuses an operand with named parts**, with a message naming `group.merge`
   and its `name` member: a model doing this today gets the owner's bug silently, with nothing in the result to warn it.
   Old records still fold; this refusal is in the tool only. `describe_scene` already lists parts with `hidden`
   (`read.js:130`), and part names remain data, not instructions.
7. **The popover, then docs, e2e and the scenario.**

## Not in this task

- **Rewriting existing files.** A saved `group.assemble` over groups keeps folding to opaque parts, because silently
  changing a saved model's part names is worse. The way forward for the owner's file: it has not been merged yet, so
  just do it.
- Ungrouping; a nested tree in the Objects list; moving one member of a group; renaming a part.
- V1's other shape, a combined part plus prefixed copies. `add()` keeps it for recipes.
- **A plain Group of a recoloured solid has the same colour loss** on the unchanged `group.assemble` path. Measured
  2026-11-02: a red Cube grouped with a second Cube gives a body with no `colorOverrides` and empty `Group.colors`. It is
  not fixed here because it changes what existing records paint; it needs its own finding.

## Effort

L. It splits cleanly for `/fix-todo`: (a) `mergeInto`, the op, `planGroupMerge`, the cut rule, `partRecordsFor` and the AI
tool, tested with no visible control; (b) the popover, docs, e2e and the scenario. `model: opus` for the cross-layer
contract, not the arithmetic.

## Testing

- **Unit, `group.spec.js` and `registry.spec.js`**, tolerance 1e-6 mm: merging two groups keeps every part's bounds and the
  union of the inputs' bounds; order follows `inputs`; hidden stays hidden, and `hidden: true` hides only that member;
  `colors`, `meta` and `holes` carry; `joins` follow the prefix. Degenerate and hostile: a group with no parts, a one-part
  group, a collision with a hidden part, a collision caused only by the prefix, an empty prefix, a comma, a control
  character, a leading space, a result of 81 characters; `hidden` beside `name`, on a solid and on a group kept whole;
  `prefix` beside `name`, refused; `hidden` unset not revealing a hidden source part; `__proto__`, `constructor` and `prototype` both as a part and as
  a prefix-made name; a plain solid with no `name`; a wrong-length `members`; a `pieces` address, refused.
- **Unit, the old-file guarantee**: `group.assemble` over two groups folds exactly as today, to 2 parts with the same bounds.
- **Unit, `groupMerge.spec.js`**: built with a small two-group fixture shaped like the owner's file (one group with hidden
  parts, one with a whole-body colour). Part order, the target rule (Cube first, group second), a whole-body override expanded and a per-part override
  beating it, every `viewHides` case, and the record equals `group.assemble`'s when nothing merges and nothing is hidden.
  Real built-ins: Pi + Camera suggests a prefix for the Camera row and commits with 52 parts; Pi + Pi gives 66; two bolts
  give 12; Pi + Cube is named after the Pi in both pick orders, keeps its 33 parts and adds `Cube 1`; a Hide tick on an
  unticked row still writes the hide.
- **Unit, `booleanConsumes.spec.js`**: a hidden part of a merged group stays; a visible part retires it; hidden mixed with
  visible retires it; a bolt's `tap` still retires (scenario 5); a Pi's `hole1` on the unmerged Pi still stays (`core-064`).
- **Unit, elsewhere**: `inspector.spec.js`, a part of a merged Group-made member reports its creation record through two
  merges. `project.spec.js`, a merged body with hides round-trips byte for byte. `userPart.spec.js`, **To library** on a
  merged body, then a placed copy keeps its parts, hidden state and colours. `operate.spec.js`, the mapped op, and
  `group.assemble`'s refusal.
- **E2e, `e2e/group-merge.e2e.js`, navigates to `/`**: build two groups with real mouse and, at phone and tablet, trusted
  touch. Assert the popover, the live preview, a collision disabling commit. Commit: one body, the first group's name, all
  parts in the Objects list, hidden ones appearing with **Show hidden parts**, size unchanged. A coloured source stays
  coloured in the render, and a hidden part stays hidden. Cut a plate with one hidden part: the pocket exists and the group
  stays; cut a second. Undo restores both operands with their colours and hides; Redo; reload; export excludes the hidden
  parts. Untick **Merge parts** on every row and get today's two-part result. A second case adds a Cube to a real Pi, with
  the Cube hidden: the name stays the Pi's, `hole1` still cuts and the Pi stays, and the Pi's **Model** changes from its
  History row with the Cube still present.
- **The one-click guard**: `e2e/group-combine.e2e.js` passes **with no edit**. So do the other specs that group plain cubes.
  A spec whose selection holds a built-in shape needs the commit click, and **must untick Merge parts if it expects whole
  units**. Run `grep -rn operation-group e2e/` and list each changed spec in the commit.
- **Viewports**: all three, with a snapshot of the popover at each.
- **Engines**: all three. It touches the viewport's per-part meshes, worker transport of a merged value and persistence.
- **New acceptance scenario 32 in `TODO/ACCEPTANCE.md`**, "Merge two groups, one prefixed, and cut with a hidden part" (31 is
  reserved by `io-024`), **driven by hand with the owner's real file**, `~/Documents/enviro-plus-featherwing.ndjson`, to the
  numbers in Done means. Do not commit that file. *Drive it differently*: pick `Clearances` first and confirm the result is
  named `Clearances`; type a colliding prefix and correct it; merge a group that has been moved and rotated; merge one that
  is hidden whole; merge a third group into the result; press commit straight after dragging, before the fold settles; Undo
  then Redo; reach a hidden part at phone width from the Objects list; pick a Cube before a Pi; merge two Pis and read the
  suggested prefix; keep one Pi whole with **Hide this part** ticked.
- **Acceptance scenarios to re-drive**: 1, 3 (a kit assembly, then merged), 4 (gating), **5 (a never-merged bolt's `tap` must
  still be used up)**, **6, whose meaning changes by the owner's decision: rewrite step 2 to untick Merge parts on each row,
  expectations unchanged, so whole-unit grouping stays covered; merging is covered by scenario 32**, 10, 11, 12 (edit an
  upstream step under a merge), 13, 14, **15 (a model change under a merge that now collides, such as a Pi model adding a part
  the added group already has: a broken row that says why, not a silent overwrite)**, 18 (`group.assemble`'s drawing path,
  unchanged), 22 (merge a copy holding a `group.merge`), 24 and 25 (the AI paths).
- **Closed findings whose repros must be re-run**: `ui-016` (breadcrumb step-up), `ui-042` (per-part group meshes), `ui-051`
  (delete one part, on a prefixed part), `ui-089` (hides), `core-054` (colour through capture), `core-064` (drilling with an
  unmerged Pi), `ui-040` (the operand line and pick depth), `ui-043` and `ui-082` (toolbar fit and the pop-out opening this
  popover). `core-020` needs no re-run: a `native` entry never reaches the nested `evaluate` its bug lived in.
- **Perf**: no benchmark target of its own, because `mergeInto` runs no CSG. Built-ins make the worst case larger than the
  owner's file: measure selecting the 21-part result and a 66-part Pi + Pi. `measureGeometry` runs a real union for a
  composite's volume, so if the Pi + Pi selection stalls, that blocks this task. Record both numbers in the commit.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
