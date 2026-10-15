---
title: Name a placed part or group in the Inspector
category: ui
kind: feature
priority: high
model: sonnet
milestone: M16
depends: [core-038, ui-049]
status: open
---

## Goal

With two dozen bolts on the board, `Bolt 14` tells you nothing. A person selects a body or a
group, types `Pi camera bolt` into the Inspector's name field, and from then on that is what
the Inspector header, the object list, the phone tab, the BOM and every refusal message call
it. "Done": drop three bolts from the Library, name them *Pi camera bolt*, *Screen bolt*,
*Case bolt*, and select each from the object list and read the right name back — also after
a reload.

## Interaction model

- **Precondition**: **exactly one** body or group selected (a multi-selection shows no name
  field — a shared name for several objects is not a thing). Works for every body kind:
  library hardware, Pi boards, primitives, sketch solids, boolean results and **groups**.
  When the selection is **drilled into a sub-part** of a group (`ui-016`) the field is
  absent for a recipe's own sub-parts (`usbc`, `head` — their names are the recipe's), and
  the breadcrumb/title is read-only text as it is today; the group's name is edited by
  stepping back out to the group.
- **Trigger**: the name at the top of the Inspector (`data-testid="inspector-name"`, today a
  `<p>`) becomes an inline-editable field, with a pencil affordance
  (`data-testid="inspector-name-edit"`) so it reads as editable on touch. Tap/click or press
  **F2** to edit; **Enter** or blur commits, **Escape** reverts. The Library drop path is
  unchanged — a placed part still arrives as `Bolt 1` and is selected, so the field is
  right there (the part that arrives selected with its name pre-selected for typing is
  *not* wanted: it would steal keystrokes from a user who is about to nudge it with arrows).
- **Feedback**: the new name appears at once in the Inspector header, the object list row,
  the phone-width tab label (truncated with an ellipsis, full name in the `title`/aria
  label), the BOM row's detail line and the timeline row (`Place Pi camera bolt`). A blank
  entry restores the generated name and says so in the field's helper text. A name another
  object already uses shows a non-blocking hint "Another part is already called this" —
  it still commits.
- **Placement**: n/a — the part is already placed.
- **Selection response**: unchanged — the gizmo and parameter fields stay attached; editing
  the name must not drop or re-create the selection (the lost-selection bug class in
  `SECOND-ATTEMPT.md`: the commit appends a record, which rebuilds the body, and the
  selection id has to survive that, same as `ui-029`'s param edits).
- **Selection count**: exactly 1; with 0 the panel shows the list, with 2+ the multi-select
  summary, neither with a name field.
- **Small-screen behavior**: the field is a full-width row at phone width (44 px min height),
  the on-screen keyboard must not push the viewport off-screen — commit on blur and on the
  keyboard's Done key; the object list truncates long names with an ellipsis rather than
  wrapping the row. Pointer-only and hover-only affordances are not allowed (pencil is always
  visible).

## Documentation

Update `docs/selection-and-inspector.md` (add a "Naming a part" section; the page is already in the sidebar).
Example: "Open **Library**, drag a **M3 bolt** into the view twice. Select the first, tap the
name **Bolt 1** at the top of the **Inspector**, type `Pi camera bolt` and press **Enter**.
Select the second and name it `Screen bolt`. Open the object list: the rows now read *Pi
camera bolt* and *Screen bolt*."

## Affected files

- `src/components/inspector/Inspector.vue` (name header → field; keep under the ~30
  template-line rule by extracting `NameField.vue`)
- new `src/components/inspector/NameField.vue` (+ `.spec.js`)
- `src/components/inspector/ObjectList.vue`, `src/components/display/BillOfMaterials.vue`
  (verify they read `Body.name`, not a cached label)
- `src/composables/useSelectedBody.js` (expose `rename(name)` → `document.renameBody`)
- `docs/selection-and-inspector.md`

## Effort

M.

## Testing

- **Unit** (`NameField.spec.js`, `Inspector.spec.js`): Enter commits, Escape reverts, blur
  commits, blank restores generated name, 60-char cap, duplicate hint shown and commit still
  allowed, field absent for 0 / 2+ selections and for a drilled-into recipe sub-part,
  present for a group.
- **E2E** (`e2e/rename-part.e2e.js` → `/`): the example above with real mouse; then at phone
  width with trusted touch (tap the name, type, tap away). Assert object-list rows, Inspector
  header and phone tab all show the new name; reload and the names persist; undo (Ctrl/Cmd+Z)
  restores `Bolt 1`; rename, then drag the gizmo, and the name survives. A group: select two
  bodies → **Combine into group**, rename the group, rename survives selecting a sub-part and
  stepping back out. Three viewports with a snapshot each; **all three engines**
  (persistence + touch keyboard path).
- **Acceptance**: re-drive scenarios 1 (placing a second item must not overwrite the first —
  rename-then-place is the new path), 4 (boolean gating — a renamed operand is still
  selectable and a refusal names it by the new name), and 3 (library/kit placement — the
  renamed part is not partial), plus 6 (group vs. sub-part selection). Closed-finding re-runs: `ui-029` (select → edit a param →
  selection must persist; here, select → rename → edit a param), `ui-016` (drill into a
  sub-part, step back out), `ui-053` (first library drag after Escape — Escape now also
  cancels a name edit, and must not cancel an armed placement by accident).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
