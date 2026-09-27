---
title: Edit a composite part's parameters (Pi model, bolt spec/fit/length) and repair what the change breaks
category: ui
kind: feature
priority: high
model: opus
milestone: M7
depends: [ui-029, ui-044, data-004, core-024, ui-035]
status: open
---

## Goal

Requested by the user on 2026-09-27:

> *"I've added a raspberry pi to the design, and selected it. I can see the parameter for
> the type, but I cannot change it. I'd like to be able to change the parameters for group
> objects like a raspberry pi, or a screw type/size. There may be problems changing some
> types, and these should be flagged somehow. For example if I add a raspberry pi 4, then
> add something that snaps to the AV jack and then change the type to a raspberry pi 5,
> that av jack no longer exists. A way to solve this should be provided."*

Today every composite recipe's Parameters section is read-only. There are two separate
reasons, and both are deliberate:

- `src/core/paramEdit.js`'s append-path guard (`ui-029`) and replace-path guard
  (`data-004`) both refuse composite recipes: *"a bolt's `spec` is a catalogue choice
  needing a dropdown, not a number."* The Inspector reflects this as `isRecipePart`
  (`Inspector.vue`).
- `text`-kind fields (`src/core/inspector.js`'s `ParamField`) are never editable, because
  no enum control exists. A Pi's `model` shows as a value the user can read but not change.

This task builds that control, lifts both guards for composites, and adds a
**pre-commit impact check** plus a **repair dialog**. A variant change that removes a part
something else depends on is then caught and resolved, instead of silently producing wrong
geometry.

"Done" looks like this:

1. Select a placed **Raspberry Pi**. Its **Model** field is a dropdown (Pi 2 / 3 / 4 / 5,
   the same options the Library's pre-drag picker offers). Pick a different model, and the
   board rebuilds in place: same position, same rotation, same colour overrides.
2. Select a placed **Bolt**. `spec` and `fit` are dropdowns, and `length` is an editable
   number. The `fit` options follow the chosen `spec`, because
   `tables.boltSpecs[spec].fitDiameterMm` defines them per spec. This makes
   `ACCEPTANCE.md` scenario 2 step 3 drivable as written for the first time.
3. Every other composite with a variant or size param behaves the same way:
   `raspberrypi.cameraModule`'s model, a nut/washer/bearing spec, and `core-027`'s screws
   once they land. This happens through one registry mechanism, with no per-recipe UI code.
4. **Change a Pi 4 to a Pi 5 while a body is snapped to its `avjack`.** Before anything
   commits, a **"This change affects 1 item"** dialog lists the snapped body, the
   relationship (`Snap → avjack`), and why (*"Pi 5 has no `avjack`"*). It offers per-item
   fixes (Only when…, Remap, Detach, Leave broken) plus **Cancel**. See the Interaction
   model below.
   - **Only when Model is Pi 4** is the fix the user named ("an `if pi=4` would fix it").
     The dependent is kept but made **conditional** on the Pi's model. On a Pi 5 it's
     inactive: skipped by the fold, not drawn, not broken. Switch the Pi back to a Pi 4
     and it comes back, still snapped to the jack, with no further repair.
   - This makes one design hold several board revisions. A case with an AV-jack cut-out
     that only exists "if Pi 4" and a fan grille that only exists "if Pi 5" can both live
     in the same document.
5. A change that breaks nothing commits immediately, with no dialog. Most edits look like
   this: a bolt length, a Pi 4→5 swap with nothing attached, or an attached `ethernet` jack
   that both models have. Dependents that still resolve **follow** the change. A plug
   snapped to the Pi 4's `ethernet` moves to where the Pi 5's `ethernet` is.
6. A change the user committed with **Leave broken** stays visibly flagged until fixed:
   - the Pi's Inspector shows a warning with a **Resolve…** button that reopens the same
     dialog;
   - the dependent body's Inspector shows the same warning;
   - the timeline marks the broken rows with `data-004`'s existing broken badge.
7. The model change, including every remap or detach chosen in the dialog, is **one Undo
   step** (`ui-044`'s precedent).

## Interaction model

- **Precondition**: exactly 1 body selected. It must be a whole body, not a drilled-into
  sub-part (`ui-016`/`ui-042`'s `Pi 1 ▸ ethernet` state), and its lineage root must be a
  `kind: 'composite'` recipe with at least one param the registry marks editable (below).
  A drilled-into part shows its parent's params read-only, with the note *"Select the
  whole Raspberry Pi to change its model"* and a link that selects the parent.
  `paramEdit.js`'s existing non-transform-op guard is unaffected for primitives. The
  Step 2 decision below states how a composite lineage with a fillet or boolean on top is
  handled.
- **Trigger**:
  - **Enum params** (`model`, `spec`, `fit`): a native `<select>` in the Inspector's
    Parameters section. `data-testid="param-<key>"`, the same key scheme `ui-029`'s number
    fields use. It commits on `change`. There is no separate Apply button, matching how a
    number field commits on Enter/blur.
  - **Numeric composite params** (a bolt's `length`, a Pi's `clearance`): `ui-029`'s
    existing number field, now enabled for composites.
  - Native `<select>` is chosen on purpose: iOS/iPadOS render it as the system wheel
    picker, which is the best touch control available and costs nothing.
  - **Resolve…**: a button in the Inspector's warning banner (below) that reopens the
    repair dialog for an already-committed breakage.
- **Feedback**:
  - **Nothing breaks**: the mesh rebuilds in place. The Inspector's Size and the dimension
    lines update, the gizmo stays attached, and dependents that still resolve re-evaluate
    and move with it. There is no dialog and no toast, which is the same feedback a number
    edit gives today.
  - **Something would break**: the edit is **held, not committed**. The select shows the
    new value in a pending state while the **repair dialog** opens, listing one row per
    affected dependent:
    - **Who**: the dependent body's name, which on hover/focus highlights that body. Reuse
      `ui-049`'s hover store if it has landed; if not, this is a static row.
    - **Relationship**: `Snap → avjack`, `Align → usb1`, or `Subtract (operand) →
      clearance-avjack`.
    - **Why**: *"Pi 5 has no part named `avjack`"*, or for a non-part breakage the
      kernel's own message, e.g. a fillet that no longer fits the smaller bolt head.
    - **Fix**, a per-row choice:
      1. **Only when Model is Pi 4**: keep the dependent, but make it conditional on the
         edited body's param having its **old** value. The label is generated from the
         schema: `Only when <body name>'s <param label> is <old option label>`. It is
         offered only when the changed param is an **enum** (a condition on a number,
         e.g. "only when length is 20", is out of scope). The row adds a **scope**
         select, defaulted per relationship:
         - **Snap/Align (placement)**: defaults to **the whole body** (`Cube 1` exists only
           on a Pi 4). A plug for a jack that doesn't exist shouldn't exist either, and
           conditioning only the snap would leave it floating at its pre-snap pose.
         - **Boolean with a sub-part operand**: defaults to **this operation only**. The
           case keeps existing on a Pi 5, just without the AV-jack cut-out. Conditioning
           the whole case body would delete the case, which is never what's meant.
         - The other scope is always available in the select.
      2. **Remap to…**: a `<select>` listing the new variant's parts, pre-filled with a
         suggestion when one exists (see Proposed fix, "Suggestions"). This is only
         offered where the reference is a part address (`{ id, pieces }`).
      3. **Detach**: the dependent keeps its current world pose and loses the link. Offered
         for placement relationships (Snap/Align) only. There is no meaningful "keep where
         it is" for a boolean operand.
      4. **Leave broken**: commit anyway and flag it (below).
    - **Footer**: **Apply** (disabled until every row has a fix chosen; defaults are
      Remap-if-suggested, else Leave broken) and **Cancel**, which reverts the select and
      leaves the document untouched. **Only when…** is never the default. It changes
      what the design *means* (one design, two revisions), so the user has to choose it.
  - **After Only when…**, the condition stays visible and editable. It is not buried in
    the record:
    - **Timeline**: the conditioned row(s) show a condition chip
      (`if Pi 1 = Pi 4`, `data-testid="timeline-condition-chip"`). While the condition is
      false, the row is greyed like a suppressed row (section 16's styling) but with the
      chip instead of the "suppressed" label, so the two can be told apart.
    - **Inspector** on a conditioned body: a **Condition** row reading *"Only when
      Raspberry Pi 1's Model is Pi 4"* with **Edit** (the option list becomes a
      multi-select, e.g. "Pi 3 or Pi 4") and **Remove** (always active again).
    - **Selecting an inactive body**: it can't be picked in the viewport, because it
      isn't drawn. `ui-041`/`ui-049`'s object list shows it greyed with the chip, and
      selecting it from there opens the Inspector on it so the condition can be edited.
    - An inactive dependent is **not** broken. It raises no warning banner and no broken
      badge, and a later impact check doesn't report it again.
  - **After Leave broken**:
    - The Pi's Inspector shows a warning banner at the top of its detail view: *"2 items
      refer to parts this Pi 5 doesn't have."* with **Resolve…**
      (`data-testid="dependents-resolve"`).
    - Each broken dependent's Inspector shows *"Snapped to Raspberry Pi 1 ▸ avjack, which
      no longer exists."* with the same **Resolve…**.
    - The timeline rows carry `data-004`'s existing broken badge and reason, with no new
      timeline UI.
    - A broken dependent body still renders at its last good pose (see Proposed fix,
      "What a broken snap renders as"), so the user can still see and select it.
- **Placement**: n/a. Nothing new is created, and the body keeps its pose.
- **Selection response**: unchanged. The selection survives the rebuild: same body id,
  same gizmo. If the selection was a drilled-into part of the edited body that no longer
  exists, the selection falls back to the whole body, and the breadcrumb updates.
- **Selection count**: exactly 1. With 2+ selected, the Parameters section already
  doesn't render (the multi-select Inspector state), and this task doesn't add
  multi-body param editing.
- **Small-screen behaviour**: not "same as desktop".
  - At 390×844 the repair dialog is a **full-height bottom sheet** over the Inspector
    sheet, not a centred modal: one row per dependent, with the Fix select at full width
    under the Who/Why text. Apply and Cancel are pinned to the sheet's bottom edge, 44px
    tall, clear of the home indicator (`env(safe-area-inset-bottom)`).
  - Every select and button in it keeps a 44px tap target.
  - A Pi with many broken dependents scrolls inside the sheet, not the page, with no
    horizontal overflow.
  - The Inspector warning banner wraps. It must not push the Parameters section's first
    field below the sheet's peek height at phone width; if it would, the banner collapses
    to one line plus **Resolve…**.

## Documentation

- **Pages**:
  - `docs/selection-and-inspector.md`: a new "Changing a part's model or size" section
    covering the dropdowns, which composite params are editable, and why a drilled-into
    part's are not.
  - `docs/snap-and-align.md` (or whichever page `ui-026`/`ui-035` documented Snap/Align
    in; find it with `grep -rln -i 'snap' docs`): a "When the part you snapped to goes
    away" section covering the repair dialog, Remap vs Detach vs Leave broken, and the
    Resolve… button.
  - `docs/booleans.md`: one paragraph noting that a sub-part operand (`ui-040`) can break
    the same way, and that Detach isn't offered for it.
- **Examples**:
  - *"Drag a Raspberry Pi into the viewport and choose **Pi 4** in the Library before
    dropping it. Drop a Cube next to it, select the Cube, then Shift-click the Pi's AV
    jack so both are selected, and use **Snap** to sit the cube against the jack. Now
    select the whole Pi and change **Model** to **Pi 5**. A dialog explains that the Pi 5
    has no AV jack. For the Cube's row choose **Detach** and press **Apply**. The Pi
    becomes a Pi 5 and the cube stays exactly where it was. Press Undo once and you're
    back to a Pi 4 with the cube snapped to its jack."*
  - The conditional example, on the same page: *"Do the same again, but this time choose
    **Only when Raspberry Pi 1's Model is Pi 4** for the Cube and press **Apply**. The
    Cube disappears, and its timeline rows show `if Pi 1 = Pi 4`. Change the Model back to
    **Pi 4** and the Cube reappears, still snapped to the AV jack. Use this to keep parts
    for several board revisions in one design."*
  - A shorter bolt example: *"Select a Bolt, change **spec** to `m3 socket`; the **fit**
    list now shows only the fits an M3 socket has."*

## Affected files

- `src/core/kernel/registry.js`: a per-op **editable-param schema** for composites,
  generalising `OpUiChoice`:
  - `paramOptions(op, params, tables) → Record<key, { kind: 'enum', options: OpUiOption[] }
    | { kind: 'number', unit, min? }>`.
  - Built from the recipe's own exported lists (`BPLUS_MODELS`,
    `CAMERA_MODULE_MODELS`, `Object.keys(tables.boltSpecs)`,
    `Object.keys(tables.boltSpecs[spec].fitDiameterMm)`), the same "derived, not
    hand-copied" rule `modelChoice` follows.
  - A composite with no schema entry stays read-only, the fail-safe default.
- `src/core/kernel/recipes/*.js`: export whatever option lists aren't exported yet.
  Also add an optional `partAliases` map where a rename is real, e.g. Pi 4
  `camera` → Pi 5 `camera0`.
- `src/core/paramEdit.js`: lift the composite refusal in whichever guard the Step 2
  decision picks. Keep `RESERVED_PARAMS`. Reject an enum value not in the schema, so the
  MCP surface can't write an invalid model.
- `src/core/dependents.js` (new, framework-free): given a document, a lineage id, and a
  candidate replacement record, return the **new** breakages as
  `{ dependentRecordId, dependentBodyId, relationship, missingPieces[], reason,
  suggestions }[]`. It reuses `document.js`'s shadow fold (`shadowCheckTail`, as
  `data-004` built it) and diffs `brokenById` before and after, so it catches part-name
  breakages *and* any other refold failure, with no second evaluator.
- `src/core/repair.js` (new, framework-free): turn chosen fixes into records.
  - Remap: rewrite the dependent record's `pieces` in the same replace-path rebuild.
  - Detach: replace the Snap/Align record with a `transform.translate` equal to its last
    evaluated delta.
  - Only when…: set a `when` condition (below) on either the dependent's lineage root
    (whole-body scope) or the one dependent record (this-operation scope), through the
    replace path.
  - Everything is emitted as one batch with one origin.
- `src/core/condition.js` (new, framework-free): evaluate a record's `when` against the
  current fold state. It validates the shape and reports a condition that can't be
  evaluated (below) by name.
- `src/core/document.js`:
  - `OpRecord` gains an optional `when` field. Declare it in `registry.js`'s typedef and
    add it to `SHAPE_FIELDS` if a condition's target counts as a reference for
    `canMove`/reorder validity. It does: reordering a conditioned row above the body it
    tests must be refused the same way an operand reference is.
  - The fold skips an inactive record through the same path as `entry.suppressed`
    (around `document.js:1201`), and a lineage whose root is inactive skips as a whole.
  - The timeline row model gains `inactiveBy: { refId, param, values } | null` next to
    `suppressed`.
- `src/components/timeline/TimelineRow.vue`: the condition chip and inactive styling.
- `src/components/inspector/Inspector.vue`: the Condition row with Edit/Remove.
- `src/composables/useParamCommands.js`: an async `setParam` that runs the impact check
  first, resolves with `{ committed } | { needsRepair, breakages }`, and commits the edit
  plus any repairs as one transaction.
- `src/components/inspector/Inspector.vue`: enum `<select>` fields, composite number fields
  enabled, the warning banner with Resolve…, and the drilled-into-part note.
  It's already ~1,500 lines, so extract the Parameters section into
  `src/components/inspector/ParamFields.vue` while touching it.
- `src/components/inspector/DependentRepairDialog.vue` (new): a modal at laptop/tablet
  width and a bottom sheet at phone width.
- `src/core/inspector.js`: `ParamField` gains `kind: 'enum'` with `options`, and
  `describeBody` reports `brokenDependents` for the banner.
- `e2e/composite-param-edit.e2e.js` (new).
- `TODO/ACCEPTANCE.md`:
  - Rewrite scenario 2 so its Bolt steps are drivable as written.
  - Add a new scenario, **"Change a part's model under a dependent"**: Pi 4 + a cube
    snapped to `avjack` → Pi 5 → Detach → Undo. It gets two more passes:
    - Leave broken, then Resolve… with Remap.
    - **Only when Model is Pi 4**, then switch back to a Pi 4 and confirm the cube
      reappears snapped. Also save and reload on a Pi 5, and confirm it stays inactive
      and still shows its chip.
- `TODO/core-027-hardware-screw-family.md`: add one line saying its recipe must export
  its spec/length option lists for this task's schema. That covers the user's "screw
  type/size" once screws exist; today the Bolt is the stand-in.
- The docs pages above.

## Proposed fix

### Decide at Step 2: replace in place, not append (recommendation)

`ui-029` edits a primitive by **appending** a fresh creation record that supersedes the
terminal, then re-applying the pose. For a composite with dependents, that is the wrong
mechanism. A Snap record already in the log was evaluated against the *old* Pi, so under
the append path it neither breaks nor follows. The cube just stays at the Pi 4's AV-jack
coordinates, floating beside a Pi 5. That is precisely the "wrong geometry, no error"
class this project keeps catching, and it would make the user's own example
undetectable.

**Recommendation**: a composite param edit uses `data-004`'s **replace path**. It swaps
the lineage's creation record in place (new params, same id) and re-folds.

- Every later record, including transforms, snaps and sub-part booleans, re-evaluates
  against the new variant. Survivors follow the change, and failures surface in
  `brokenById`.
- The pose survives for free, because the later transform records are still in the log.
  This makes `useParamCommands`'s pose re-apply step unnecessary on this path.
- A fillet or chamfer above a composite also re-runs, and it is *reported* if it no longer
  fits rather than silently dropped. `paramEdit.js` already argues that the replace path
  needs no freeze guard.

Confirm at Step 2, against the real fold:

- (a) `group.snap`/`group.align` records are live under a re-fold, recomputing their
  delta from operand geometry rather than baking it at commit. `ui-026`'s record carries
  `target`/`operands`, so they should be, but prove it with a unit test before relying
  on it.
- (b) A sub-part boolean operand (`ui-040`) that consumes the Pi lineage still resolves
  the replaced creation record.

If (a) is false, this task has to make snap live first, and it says so in its Step 2
note.

Out of scope, but name it in the Step 2 note: primitives keep `ui-029`'s append path.
That means a primitive's snapped dependents also don't follow a resize today. This is the
same bug class, but no part ever *disappears* there, so file it as its own finding rather
than widening this task.

### Impact check before commit

`dependents.js` runs the candidate log through the existing shadow fold. The worker path
must stay off the main thread: `core-030`/`core-031` moved the fold to the worker, so
this is one more job type there, and a superseded check is cancelled (CLAUDE.md
Performance). Only breakages **new** relative to the current `brokenById` count. An
already-broken row isn't the user's new problem. The select shows a pending state while
the check runs, and a Pi fold takes well under a second, so there is no spinner unless it
exceeds ~300 ms.

### Suggestions (the Remap pre-fill)

In priority order:

1. The same part name exists in the new variant. This can't happen for a *broken*
   reference, so it's listed only for completeness.
2. The recipe's `partAliases` for this old→new param pair, e.g. `camera` → `camera0`.
3. For a hidden `clearance-<x>` part, the clearance of whatever `<x>` remaps to.
4. No suggestion: the default fix is Leave broken, never a guess.

Don't fuzzy-match names. Remapping `avjack` to `usbc` because both are "jacks" would be
exactly the silent wrong geometry the dialog exists to prevent.

### What a broken snap renders as

Today a broken row stops the fold for that lineage (`data-004`). A body whose Snap record
is broken must still render **at its last good pose**. The fold treats a broken
placement record as identity for that lineage, and the timeline badge carries the error.
If the body vanished instead, a user who picked Leave broken couldn't find the thing they
need to fix. Verify this against `data-004`'s actual broken-row behaviour and state what
happens.

### Conditional records (the "if Pi = 4" fix)

**Shape**: `when: { ref: <lineage id>, param: <key>, in: [<value>, …] }` on an `OpRecord`.
The record is **active** when the referenced lineage's current (terminal-resolved) root
param value is in `in`. It is deliberately **not** an expression language:
- one param,
- equality or membership,
- an enum param only.

Condition data stays plain JSON (CLAUDE.md: params are "never a function or code"), and
the MCP surface and an AI partner can read and write it as design intent without parsing
anything. `and`/`or` across several params, and numeric comparisons, are out of scope.
File them if someone asks.

**Evaluation**, in the fold:
- **Inactive** reuses section 16's suppress semantics: the record stays in the log and
  the timeline, and is left out of the fold. A `when` on a lineage **root** makes every
  record in that lineage inactive too, *silently*. They are not reported as broken by
  `shadowCheckTail`, because "this body doesn't exist on a Pi 5" is the intended state,
  not an error.
- **Verify at Step 2** what section 16 does today to a record whose operand lineage was
  suppressed out. The known risk is that it gets reported broken:
  - A downstream record that references an inactive body (e.g. a later Union of the
    AV plug and something else) must become broken **with the condition named in the
    reason**, e.g. *"Cube 1 only exists when Pi 1 is a Pi 4"*.
  - It must not become silently inactive itself. Conditions don't spread without the
    user choosing them.
- **Ordering**: `ref` must be a lineage created **earlier** in the log than the
  conditioned record, the same rule operands follow. That rules out cycles and a record
  conditioned on itself by construction.
- **A condition that can't be evaluated** is reported as broken, not treated as
  true or false. That covers:
  - a deleted `ref` lineage (`ui-051`),
  - a `param` the ref's op no longer has,
  - a value no longer in the schema.

  A silent default either way would hide or show geometry with no explanation.

**Changing the param back**: switching Pi 1 from Pi 5 to Pi 4 re-activates everything
conditioned on `in: [4]`. The impact check must count this as *no new breakage* and open
no dialog. It must also not list the newly active records as "affected". Reactivating
the same geometry that was there before is the whole point.

**Save/reload and older documents**: `when` is an optional field, so documents without
it load unchanged. A document with it, opened by a build that predates this task,
would ignore the condition and fold everything. That's the usual forward-compat risk
of any new record field, and the Step 2 note should say whether `data-001`'s format
version gets bumped for it.

**Undo**: adding, editing or removing a condition is one Undo step each, and choosing
Only when… inside the dialog is part of the dialog's single transaction (below).

### Undo

One transaction with one origin, covering the param replace plus every Remap/Detach
record. Undo restores the Pi 4 *and* the original snap, with no half-state. Follow
`ui-044`'s single-step mechanism.

## Effort

L. The enum control and schema are M on their own. On top of that, the replace-path
switch needs Step 2 proofs, plus a new shadow-fold job in the worker, a new dialog with
a phone bottom-sheet variant, and two acceptance-scenario rewrites. Conditional records
add a new record field the fold, the timeline, reorder validation and persistence all
have to honour.

If Step 2 finds this too large for one pass, split it at the condition boundary. Put
the `when` field, its fold semantics and the timeline chip in their own `data-*` task,
landed first, and give this task's dialog the **Only when…** option on top of it. Say
so explicitly rather than shipping the dialog without the option the user asked for.

## Testing

- **Unit** (Vitest, next to source):
  - `registry.spec.js`:
    - `paramOptions` for `raspberrypi.bplus` lists exactly `BPLUS_MODELS`.
    - For `hardware.bolt`, `fit` options change with `spec`.
    - A composite with no schema returns none, so it stays read-only.
  - `paramEdit.spec.js`: an enum value outside the schema is rejected by name, and
    `center`/`rotation` are still refused for composites.
  - `dependents.spec.js`, from hand-built logs:
    - Pi 4 + snap-to-`avjack` → Pi 5 reports one breakage with
      `missingPieces: ['avjack']`.
    - The same with snap-to-`ethernet` reports none, and the snapped body's evaluated
      position **changes** to the Pi 5's ethernet location, checked with `toBeCloseTo`
      at 1e-6 mm.
    - A sub-part Subtract on `clearance-avjack` reports a boolean-operand breakage.
    - An already-broken row isn't re-reported.
    - A bolt spec change that makes a later fillet not fit reports the kernel's message.
    - Degenerate cases: no dependents, a dependent that references the whole body (no
      `pieces`), and `pieces: 'avjack,usb1'` with only one piece missing.
  - `repair.spec.js`:
    - Detach leaves the dependent's world pose unchanged (`toBeCloseTo`, 1e-6 mm).
    - Remap rewrites only the named piece.
    - The whole batch is one origin, and one undo restores the original log byte for byte.
  - `condition.spec.js`:
    - `in: [4]` is active on a Pi 4 and inactive on a Pi 5, and `in: [3, 4]` is active on
      either.
    - A deleted `ref`, a missing param and an out-of-schema value each report broken by
      name, and are never read as true or false.
    - A `ref` later in the log than the conditioned record is rejected.
  - `document.spec.js` (conditions in the fold):
    - A whole-body condition skips every record in that lineage, with no `brokenById`
      entries.
    - An operation-scope condition on a sub-part Subtract leaves the case present and
      un-cut on a Pi 5, and cut on a Pi 4.
    - A later record referencing an inactive body is broken, with the condition in its
      reason.
    - Reordering a conditioned row above its `ref` is refused.
    - Switching Pi 5 → Pi 4 → Pi 5 round-trips the scene. Compare evaluated positions
      with `toBeCloseTo`, 1e-6 mm.
  - `dependents.spec.js`: a change that only **re-activates** conditioned records reports
    no breakages, and an inactive dependent isn't reported on a later change.
  - `inspector.spec.js`: `describeBody` emits `kind: 'enum'` fields with options and
    `brokenDependents`.
  - Step 2 proofs as tests: a snap record re-evaluates under re-fold, and a broken snap
    renders its dependent at its last good pose.
- **New `e2e/composite-param-edit.e2e.js`** (navigates to `/`):
  - Place a Pi 4 and change Model to Pi 5 with nothing attached. The canvas changes
    (pixel diff over the board), there is no dialog, and the gizmo is still attached.
  - Place a Bolt, change `spec`. The `fit` options change, and so does the mesh.
  - Pi 4 + cube snapped to `avjack` → Pi 5:
    - The dialog lists the cube.
    - **Cancel** reverts the select and nothing changes.
    - Again with **Detach**: the cube's Position fields are unchanged and the Pi is a Pi 5.
    - Undo once: back to a Pi 4, and the snap row is in the timeline.
  - The same setup with **Leave broken**: the warning banner appears on the Pi and the
    cube, the timeline row is badged, and **Resolve…** reopens the dialog. Remapping to a
    real part clears the banner.
  - The same setup with **Only when Model is Pi 4** (whole-body scope):
    - The cube leaves the canvas (pixel diff).
    - Its timeline rows show `timeline-condition-chip`, and no broken badge or banner
      appears anywhere.
    - Change the Model back to Pi 4: no dialog, and the cube reappears at the AV-jack
      position.
    - Undo twice: the change back, then the whole dialog transaction.
    - Save and reload while on a Pi 5: the cube is still inactive, and the chip is still
      shown.
  - A case with a sub-part Subtract of `clearance-avjack`, set to Only when… with the
    default **this operation** scope: the case stays on screen on a Pi 5 without the
    cut-out, and gets it back on a Pi 4.
  - Remove a condition from the Inspector's Condition row while on a Pi 5: the cube
    comes back as a **broken** dependent with the warning banner. Removing the condition
    restores the original problem; it doesn't hide it.
  - Pi 4 + cube snapped to `ethernet` → Pi 5: no dialog, and the cube's Position fields
    change to follow the jack.
  - Runs at **all three viewports** with a snapshot of the open dialog at each (the phone
    bottom-sheet variant is a layout change), and on **all three engines** (kernel
    results, rendered canvas, and WebKit's native `<select>` on touch).
- **`TODO/ACCEPTANCE.md` scenarios to re-drive**:
  - **2** Hardware property edit: rewritten, and now fully drivable. It has only ever been
    a partial pass.
  - **3** Snap-placement of a kit assembly: snap records are now re-folded by a param
    edit.
  - **5** Hidden-part boolean: sub-part operands can now break and be remapped.
  - **6** Group vs. sub-part selection: the drilled-into-part fallback.
  - **10** Save, reload: a Leave-broken document must reload still flagged, with the
    Resolve… button working.
  - **12** Edit a step in the middle of the history: the same replace path.
  - **13** Recolour: overrides survive a model change.
  - The new "Change a part's model under a dependent" scenario.
- **Closed-finding regression surface**: this task extends the replace path and the
  param-edit command. Re-run each of these tasks' original repro:
  - **`data-004`**: edit a mid-history step and confirm it replays, with a failing rim op
    reported by name.
  - **`ui-044`**: a param edit is exactly one Undo step.
  - **`ui-032`** / **`data-004`** section 16 (Suppress): suppress and unsuppress a row,
    and confirm a dependent of a suppressed row still behaves as it did. Conditions reuse
    the suppress skip path, so a change there is a change to both.
  - **`ui-041`**: an inactive body shows in the object list and can be selected from
    there, even though it can't be picked in the viewport.
  - **`ui-029`**: a primitive's resize is still the append path, and a filleted cylinder
    is still frozen.
  - **`ui-035`** / **`ui-040`**: a sub-part Snap and a sub-part Subtract on a Pi 5 still
    work when nothing is changed.
  - **`core-033`** / **`render-003`**: recipe part colours are right after a model swap.
    The Pi 5 has differently coloured parts than the Pi 4.
