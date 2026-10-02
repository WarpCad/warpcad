---
title: Delete the selected body (or bodies), or one part of a selected group
category: ui
kind: feature
priority: high
model: opus
milestone: M7
depends: []
status: done
---


> **Shipped (2026-09-28), with these Step 2 decisions and deviations:**
>
> - **Multi-record transactions already existed** (`document.appendAll` is one undo step
>   for N records), so part removal stayed in this task rather than being split out.
> - **Tombstone:** `op: 'body.delete'`, `supersedes` and `target` both set to the lineage's
>   terminal, routed **past the kernel** like `sketch.*` (no registry entry, never in
>   `scene.byId`). `bodies()` skips a lineage whose terminal is one. A later record that
>   supersedes, consumes, *or names as a plain operand* a deleted body is refused by name
>   (`… names Cube 1, which has been deleted`). The plain-operand check is an addition: a
>   `target` could otherwise still read a deleted body's last geometry out of `scene.byId`.
> - **Part removal: the kernel route** (`group.removePart`, `wholeGroupNative`, in
>   `kernel/group.js`'s `removePart`), not a render filter. **Hidden parts may be removed**:
>   `ui-049`'s Parts list makes every hidden part selectable, so drill-in reaches them, and a
>   hidden part can never be the last visible one.
> - **Phone placement, measured at 390x844 WebKit:** the sheet shows 321 px, the Cube
>   description is 958 px and the Pi's 2,686 px, so a plain bottom button sat 580-2,300 px below
>   the fold. Rather than the proposed sticky header, the one bottom mount is a **sticky
>   footer** (`position: sticky; bottom`) at every width: still at the bottom and away from
>   the top fields, and on screen at scrollTop 0 (y 734-778). One DOM node, one testid.
>   Side effect: it covers the sheet's bottom ~67 px, which made `inspector-hidden-parts.e2e.js`'s
>   canvas snapshot photograph a scrolled sheet; its helper now hides the Inspector too (no
>   assertion changed).
> - **"One step" means one Undo step:** N tombstones are N History rows (`Delete Cube 1`,
>   `Delete Cube 2`, …); the Undo step is labelled `Delete 3 objects`. That label is
>   asserted in `document.spec.js`, not `timelineLabel.spec.js`, since no single row carries it.
> - **Reorder refusal:** `moveStep` refuses statically first (`Step 3 uses step 2's result`,
>   the Delete names the Move's result); the replay's `needs Box 1` is what the same order
>   gets when loaded. Both are tested.
> - **e2e "delete one of two selected":** Delete removes the *whole* selection, so the case
>   deletes both and asserts Subtract disables (and re-enables on Undo, still 2-selected).
> - The Pi 4's USB parts are `usb1`/`usb2`; `usb` in this file was illustrative.
> - **Also changed:** `isTextEntry` moved to `src/composables/textEntry.js`, shared by
>   Ctrl+Z and Delete; Undo restores a drilled-in sub-part (`subPartBefore` on the step's
>   meta); the hover store also clears a hover on a part that has been removed.
> - **Filed, not fixed:** `TODO/core-036`, found re-driving scenario 10. A boolean's History
>   row names only the second operand (pre-existing).

## Goal

Requested by the user on 2026-09-27:

> *"If I add an object to the 3d view, there is no way to delete it. Add a todo to be
> able to delete the selected object (or part of a group)."*

Today there's no way to remove geometry once it's placed. The escape hatches are all
wrong for the job:

- **Undo** only removes the *most recent* step, and anything done after the placement
  goes with it.
- **Suppress** (`data-004` section 16) hides a history row. But it's a History-panel
  row action on a *step*, not an action on an object in the viewport, and suppressing a
  creation step breaks every later step that uses the body (`needs Cube 1`).
- **Hidden parts** (`ui-047`) is a view toggle for recipe clearances, not removal.

The interaction Q&A's "only Undo removes a recent step" (section 18) is about
**history**, not geometry. Deleting an object is a new, forward step in the log, not
a history rewrite. This task doesn't change that scope line and must not be read as
permission to remove log entries.

"Done" looks like this:

1. Place two Cubes. Select one and press **Delete** (or tap the Inspector's **Delete**
   button on a phone). It disappears and the other Cube stays. History gains one
   `Delete Cube 1` step. **Undo** brings it back where it was, reselected.
2. Drop a Raspberry Pi. Drill into its `usb` part (`ui-016`) and press **Delete**. The
   USB block goes and the rest of the Pi stays as one body. History reads
   `Remove usb from Raspberry Pi 1`. Undo restores it.
3. Group two Cubes (`ui-015`), drill into `Cube 2` and delete it. The group keeps
   `Cube 1` as its only part.

## Interaction model

- **Precondition**:
  - **Body depth**: **1 or more** bodies selected. Delete is not an operand-count tool
    like a boolean: removing N selected things is one well-defined action. It's never
    enabled with 0 selected.
  - **Sub-part depth** (`ui-016` breadcrumb `Pi 1 ▸ usb`): **exactly 1** part
    drilled into. It's refused (control disabled, tooltip says why) when removing it
    would leave the group with **no visible parts**. In that case the user wants to
    delete the whole body, and the tooltip says so: `Last visible part: delete Raspberry
    Pi 1 instead`.
  - Not available while a placement drag, gizmo drag, or sketch mode is active.
- **Trigger**, three routes that all go through one command:
  - **Keyboard**: `Delete` and `Backspace`, on a window `keydown` listener. They're
    ignored when focus is in a text entry, using the same `isTextEntry` guard
    `HistoryControls.vue` uses for Ctrl+Z. Without it, Backspace in a Position field
    would delete the body. There are no modifiers, and there's no conflict with the
    existing handlers (Ctrl/Cmd+Z/Y, Escape).
  - **Inspector**: a **Delete** button (`data-testid="inspector-delete"`, trash icon plus
    label, at least 44×44 px, destructive styling from a CSS custom property). It sits
    at the **bottom** of the Inspector's single-body section and in the multi-selection
    summary, so a stray tap near the top fields doesn't hit it. At sub-part depth it's
    labelled **Remove part** (`data-testid="inspector-remove-part"`).
  - **Not** in the Operations toolbar. That's the multi-operand surface for ops that
    *combine* bodies (CLAUDE.md, creation vs. operation), and delete isn't one.
- **Feedback**:
  - The mesh(es) disappear on the next frame, and the gizmo and dimension lines detach.
  - The selection clears, or at sub-part depth steps back up to the parent body. The
    Inspector shows its empty state, or the parent body with the part gone from its
    parts list.
  - History gets **one** step for the whole action, even for N bodies: `Delete Cube 1`,
    `Delete 3 objects`, or `Remove usb from Raspberry Pi 1`. The Undo tooltip reads
    `Undo: Delete Cube 1`.
  - **Undo** restores the body/bodies (or the part) exactly as they were, and restores
    the selection, so Delete then Undo is a true no-op from the user's side.
  - **No confirm dialog.** Undo is the safety net, as it is for every other step. A
    modal on every Delete key press is the kind of friction that makes the key unusable.
- **Placement**: n/a. Nothing is created.
- **Selection response**: covered under Feedback. After a delete, the Operations toolbar's
  count-gated tools re-gate on the new, smaller selection (`ui-014` rules). A boolean
  that was enabled with 2 selected must go disabled once 1 is deleted.
- **Selection count**: 1+ at body depth, exactly 1 at sub-part depth, per Precondition.
  The button's enabled state reflects this, and its tooltip names the reason when it's
  disabled.
- **Small-screen behaviour**: not "same as desktop". Phones and tablets have no Delete
  key, so the Inspector button is the **only** route there and must be reachable:
  - It goes in the phone Inspector bottom sheet, at the bottom and visible without
    scrolling past the Transform fields. If the sheet is scroll-constrained, it goes in
    the sheet's sticky header row next to the body name instead. Decide at Step 2 by
    measuring at 390×844 and say which.
  - It's never hover-only. At ≥44 px it's a real tap target.
  - Deleting closes or collapses the sheet the same way deselecting does today. It must
    not leave an open sheet describing a body that no longer exists.

## Documentation

- **Page**: `docs/selection-and-inspector.md`. Add a **Deleting objects and parts**
  subsection. Also add a one-line cross-reference in the History/timeline page
  (`docs/` page that `ui-032` wrote) explaining that Delete adds a step and that
  **Suppress** on that step is another way to bring the object back.
- **Example**: *"Place two Cubes. Tap the second one so the Inspector shows **Cube 2**.
  Press **Delete** on the keyboard, or scroll to the bottom of the Inspector and tap
  **Delete**. Cube 2 disappears and Cube 1 stays. Press **Undo** (Ctrl+Z / ⌘Z, or the
  ↶ button) and Cube 2 is back where it was. To remove just one piece of a group, tap
  a Raspberry Pi, then tap its USB block so the breadcrumb reads **Raspberry Pi 1 ▸
  usb**, and tap **Remove part**. The rest of the Pi stays."*
  State on the page that deleting an object that later steps don't depend on is always
  safe, and name what happens when one does (see Proposed fix, "Downstream
  references").

## Affected files

- `src/core/document.js`:
  - A body-retirement record kind and its handling in `ingest`/`bodies()`.
  - A `deleteBodies(ids, tx)` method and a `removePart(id, partName, tx)` method.
  - `STEP_VERBS` entries.
  - Update the module doc's "nothing is deleted" notes to say how a tombstone keeps that
    true.
- `src/core/kernel/registry.js`: a `group.removePart` entry (identity-passthrough
  minus one named part). Only if Step 2 picks the kernel route for part removal; see
  Proposed fix.
- `src/core/timelineLabel.js`: `Delete …` / `Remove … from …` row labels.
- `src/core/document.spec.js`, `src/core/kernel/registry.spec.js`,
  `src/core/timelineLabel.spec.js`, `src/core/replay.spec.js`.
- `src/composables/useDeleteCommands.js` (new): the one command all three triggers
  call, with the same transaction origin as the gizmo and Inspector paths. It restores
  the selection on undo.
- `src/components/inspector/DeleteButton.vue` (new), mounted by
  `src/components/inspector/Inspector.vue`. Extract it, because `Inspector.vue` is already
  ~1,500 lines.
- The window `keydown` listener goes in `src/views/` root or a small
  `src/composables/useDeleteShortcut.js`. Don't add it to `Inspector.vue`, because it
  must work when the Inspector sheet is collapsed on a tablet with a keyboard.
- `src/stores/selection.js`: clear or step up after a delete. Keep no dangling ids.
- `e2e/delete-body.e2e.js` (new).
- `docs/selection-and-inspector.md` and the timeline docs page.

## Proposed fix

**Deleting a body is an appended tombstone, not a removed entry.** Add a record kind,
e.g. `op: 'body.delete'`, that carries **`supersedes: <the body's current terminal
id>`**. `bodies()` skips any lineage whose terminal is a tombstone. That gives the
following for free:

- **Identity**: the tombstone is in the body's own lineage, so `currentIdOf` and
  `resolveLiveRoot` see a terminal that is "deleted". Any *later* record that tries to
  supersede or consume it is rejected with the existing named refusal, rather than a
  new code path.
- **Undo**: removing the tombstone (remove-and-rebuild, `data-003`) brings the lineage's
  previous terminal back as the live state. That's the exact position, rotation, colour
  overrides and params.
- **Save/reload and replay**: it's just another record in the NDJSON.
- **Suppress/reorder** (`data-004`): suppressing a Delete row un-deletes. It's a
  legitimate, free consequence to document, not a bug.

The trial fold shouldn't build geometry for the tombstone: route it past the kernel like
`sketch.*` records are, or register it as an identity-passthrough op like
`style.recolor`. Either way, `bodies()` must not report it. Deleting **N** bodies is
**N tombstones in one transaction**, so it's one Undo step. Check that
`document.batch`/`documentBatch.spec.js` already supports a multi-record transaction.
If it doesn't, that's the one piece of new plumbing.

Runner-up, rejected: using `consumes` with a record that produces nothing. `consumes`
means "retired *into* this new body", `mergedInto` would point at a body that doesn't
render, and `currentIdOf` walking "forward" through it would resolve a stale reference
to nothing. That mixes two claims under one field, which is the same argument the
module doc already makes against overloading `supersedes`.

**Removing a part is a supersession of the body, not a tombstone.** The body survives,
so its lineage continues with a record `{ op: 'group.removePart', supersedes:
<terminal>, params: { part: 'usb' } }`. Two ways to evaluate it; pick one at Step 2:

- **Kernel op** (preferred): a registry entry that takes the body's evaluated `Group`
  and returns it without `parts[part]`, recomputing `names`. This is `rawOperands`-shaped
  (it needs the un-combined group). It's honest geometry: the fold's output really lacks
  the part, so bounds, export, booleans and BOM all agree without special cases.
- **Render-and-bounds filter** (like `hidden`): cheaper, but every consumer (`boundsOf`,
  export, boolean operands, `ui-038` BOM) would have to learn to skip it. That's
  exactly the "every consumer must remember" trap. Reject it unless the kernel route
  turns out to be blocked.

Validation: removing an unknown part name throws a named error. Removing the last
*visible* part is refused (the UI already gates this; `core` must too). Removing a
*hidden* part (`tap`, `clearance-*`) is allowed only if `ui-047`'s drill-in can reach
it; say at Step 2 whether that's wanted.

**Downstream references.** Delete is always appended at the end of the active log (or
at the rollback marker, section 18). So in normal use, nothing after it can reference
the deleted body. The two real cases are both existing contracts, not new ones:

- A later history edit (reorder or roll-forward) that moves a row which uses the body
  after its Delete. It gets `data-004`'s atomic `needs Cube 1` refusal. No new logic;
  add a test that proves it.
- A later `group.snap`/Subtract naming the removed **part** by `pieces`. It gets the
  same `needs <part>` / `can't be built` refusal.

**Selection bookkeeping**: the command clears the deleted ids from `selection` *before*
the re-fold result is rendered, so no frame renders a gizmo on a missing body. On undo
it restores the pre-delete selection, the same pattern `ui-044` used for keeping
param-edit undo to one step.

## Effort

M-L. The tombstone and `bodies()` skip are S. Part removal as a `rawOperands` kernel op,
multi-record transactions, selection restore on undo, the phone-sheet placement, and a
three-engine e2e spec make it M-L. If Step 2 finds that multi-record transactions don't
exist yet, split part removal into its own follow-up task rather than let this grow.

## Testing

- **Unit (`src/core/document.spec.js`)**:
  - Delete one of two Cubes: `bodies()` returns only the other, and its geometry and
    transform are unchanged.
  - Delete then undo: the body is back with the identical terminal record, `rotationDeg`
    and `colorOverrides`, and `Body.id` is unchanged (the lineage root survives).
  - Deleting 3 bodies in one transaction is **one** undo step.
  - Superseding or consuming a deleted body is rejected with a named error.
  - Suppressing the Delete row un-deletes the body (`data-004`).
  - Reorder a Move of Cube 1 to after its Delete: an atomic `needs Cube 1` refusal, and
    the document is unchanged.
  - Save → NDJSON → Open round-trip keeps the body deleted (`replay.spec.js`).
  - Degenerate cases: deleting an already-deleted id is rejected; deleting an unknown id
    is rejected; an empty id list is a no-op that appends nothing.
- **Unit (`registry.spec.js`, part removal)**:
  - A real `raspberrypi.bplus` body minus `usb`: `usb` is gone, every other part keeps
    its exact bounds (`toBeCloseTo(…, 6)`), and whole-body bounds shrink only if `usb`
    was on the envelope.
  - A `group.assemble` of two Cubes minus `Cube 2` is still a Group with one part.
  - An unknown part throws. Removing the last visible part throws.
  - A Subtract naming the removed part afterwards gets the named refusal.
- **Unit (`timelineLabel.spec.js`)**: `Delete Cube 1`, `Delete 3 objects`,
  `Remove usb from Raspberry Pi 1`.
- **New `e2e/delete-body.e2e.js`** (navigates to `/`):
  - Place two Cubes, select one, press `Delete`: one mesh remains, the History step
    count goes up by 1, Undo restores it and it's reselected.
  - Same flow via the `inspector-delete` button, which is the **only** route asserted at
    phone and tablet viewports.
  - Backspace while focus is in a Position field edits the field and does **not** delete.
  - Select 2 bodies: the Subtract button is enabled. Delete one: Subtract disables and
    the remaining body is still selected or cleared, whichever is decided.
  - Drop a Pi, drill into `usb`, **Remove part**: the Pi remains, its parts list lacks
    `usb`, and Undo restores it.
  - Save, reload, and the deleted body is still gone.
  - Runs at **all three viewports** with a snapshot at each (a new control in the phone
    Inspector sheet), and on **all three engines** (mesh removal is a WebGL scene change,
    the save/reload leg is persistence, and the Delete/Backspace key handling differs
    on WebKit).
- **`TODO/ACCEPTANCE.md` scenarios to re-drive**:
  - **1** (two independent primitives): the direct inverse. Deleting one must not hide
    or remove the other, which is the mirror image of scenario 1's original "second body
    hid the first" defect.
  - **4** (boolean gating): count gating after a delete shrinks the selection.
  - **6** (group vs. sub-part selection): the Remove-part path and stepping back up.
  - **10** (save, reload).
  - **12** (edit a mid-history step): an edit *before* a Delete still replays, and the
    body stays deleted.
  - Delete is a **new capability class**. Per `ACCEPTANCE.md`'s own rule, add a
    scenario when this lands, e.g. *"place two bodies, delete one, undo, delete it
    again, reload: exactly one body remains."*
- **Closed-finding regression surface**:
  - This adds a new record kind to the lineage/fold machinery `data-003` (undo/redo)
    and `data-004` (history revisions) were built on. Re-run both tasks' original undo
    and suppress repros with a Delete step in the middle.
  - It adds a new writer to `selection` after `ui-041` and `ui-045` fixed selection
    bugs. Re-run `ui-045`'s WebKit tap-select-after-empty-tap repro right after a
    delete clears the selection.
  - Part removal operates on the named-part addressing `core-020`/`core-024` fixed. Re-run
    `core-020`'s repro against a Pi with one part removed.
- **Coordination**:
  - `ui-049` folds the Objects list into the Inspector. That list is a natural second
    home for a per-row delete, but **don't** add one there in this task. Whichever lands
    second puts the button on the merged surface, and they shouldn't run in the same
    `/run-todos` batch.
  - `ui-050` also adds a row to the Inspector's single-body section. Keep Delete at the
    bottom, below it.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
