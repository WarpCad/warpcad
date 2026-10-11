---
title: Variables panel and a "bind to variable" control on every Inspector param
category: ui
kind: feature
priority: high
model: sonnet
milestone: M12
depends: [core-050]
status: open
---

## Goal

A person can create a variable, wire any Inspector field to it, and then change the one
variable instead of digging down to the part. The motivating case, as a person does it: place
a Raspberry Pi and an enclosure, make **Pi model** a variable, and flip it from 4 to 5 in one
place while the board, its cut-outs and anything snapped to it follow. That is the jscad1
`const piVersion = 4` habit, reachable by hand. "Done" is that case working in the running app
at all three viewports, with the model never opened.

`core-050` owns the model, the binding format and every rule about what can be bound. This
task is the surface for it and must not re-derive any of those rules: what is offered comes
from `bindableParams`, and what is refused comes back with a reason string to show.

## Interaction model

- **Precondition** — two separate controls, two separate preconditions (creation and
  operation are never the same list, `CLAUDE.md`):
  - **Variables panel** (create / edit / rename / delete a variable): *nothing selected* —
    variables belong to the project, not to a body, so the panel must work with an empty
    selection.
  - **Bind control** (attach a variable to a field): **exactly one** body or part selected and
    the field is bindable per `bindableParams`. A field `core-050` calls unbindable (a rotation
    row, a group) shows **no** bind control rather than a disabled one with no explanation;
    the same row's tooltip says why, using the reason from core. Multi-selection: the
    Inspector is already single-selection for params, so the bind control is simply absent.
- **Trigger**
  - Variables panel: a **Variables** section of the Inspector column on laptop/tablet, header
    row with a **+** (`data-testid="variable-add"`); each row has an inline value editor
    matching its kind (number input via `numericEntry.js`, checkbox, dropdown), an overflow
    for **Rename** and **Delete**. On a phone it is a **Variables** tab in the same bottom
    sheet the Inspector uses, not a new surface.
  - Bind control: a small link-icon button at the right edge of every bindable field in
    `ParamFields.vue` (`data-testid="param-bind-<param>"`, tap target ≥ 44 px at phone width).
    It opens a popover listing the **compatible** variables for that field and, first in the
    list, **New variable from this value…** — which creates a variable *seeded with the
    field's current value* (and, for an enum, its current options) and binds it in the same
    transaction. That is the shortest path from "I want this to be switchable" to done and is
    what the Pi example uses.
  - Unbind: once bound, the field shows a **chip with the variable's name** in place of the
    editor (the value is shown read-only beside it). The chip's menu has **Edit variable**
    (scrolls the Variables section to that row) and **Unbind** (rewrites the field to the
    current literal — nothing jumps).
  - Conditions: `ConditionRow.vue` gains a **Variable** choice next to its existing body+param
    choice, backed by `core-050`'s `{ var, in }`.
- **Feedback**
  - Binding: the field turns into the chip, the Variables row's "used by N" count goes up, and
    the document's History gets one row (the feature timeline, not a hidden side effect).
  - Changing a value: the viewport rebuilds and **every bound field in the Inspector updates
    its read-only value** with it. A transient line states the blast radius: *"piModel 4 → 5 —
    3 parameters on 2 parts changed"*. This is the guard against the failure mode this task
    exists to avoid — "I changed something and don't know what moved".
  - If the change would break a dependent (a snapped part that no longer fits, a `fit` that is
    no longer valid for the new `spec`), the existing `DependentRepairDialog.vue` flow runs
    before commit with `core-050`'s impact list — the same dialog `ui-052` uses, not a new one.
  - An unresolvable binding renders as a **named broken row** in History and an error
    state on the chip ("variable `wall` was deleted"), never a silent literal.
  - Undo reverses a value change, a bind, a rename and a delete each in **one** step.
- **Placement** — n/a. This task creates no geometry. A variable has no 3D presence.
- **Selection response** — selecting a body with bound params shows chips instead of editors
  for them; the gizmo is unchanged. Moving a body with the gizmo is a transform and is **not**
  bindable (see `core-050`), so a transform row never shows a bind control — say so in the
  docs rather than leaving people to wonder.
- **Selection count** — bind control: exactly 1. Variables panel: any (0 included). The **Delete**
  of a variable that is in use opens a dialog listing its consumers with two actions, *Delete
  and keep current values* and *Cancel*; there is no plain destructive delete.
- **Small-screen behavior** — **not** "same as desktop". At 390 px the Variables section is a
  tab in the existing bottom sheet; the bind popover becomes a bottom sheet of its own; the
  value editors stack label-over-field; nothing scrolls horizontally. Designed phone-first:
  the popover's list is tap-driven, with no hover state anywhere. Chip text truncates with the
  full name on the chip's menu.

## Documentation

- **Page** — new `docs/variables.md`, plus a sidebar entry (`.claude/commands/docs.md` Step 4),
  and a one-line cross-link from `docs/selection-and-inspector.md` ("a field can be bound to a
  variable") and `docs/timeline.md` (variable rows).
- **Example** — *Switch a design between Pi models.* 1) From the Library, drag a **Raspberry
  Pi** onto the grid. 2) Select it. In the Inspector, next to **Model**, tap the link icon
  and choose **New variable from this value…**, name it `piModel`. The Model field becomes a
  `piModel` chip. 3) Drag a cube in next to it as an enclosure and, in its condition, choose
  **Variable → piModel → in: 4** (the cut-out only exists on a Pi 4). 4) Open **Variables**
  (nothing selected is fine) and change `piModel` from `4` to `5` in the dropdown. The board
  swaps and the cut-out disappears, and the line "piModel 4 → 5 — 2 parameters on 2 parts
  changed" appears. 5) Press **Undo** once; everything returns to the Pi 4. The page also
  states the units rule for a numeric variable (millimetres; degrees for an angle kind) and
  the one thing that *cannot* be bound (rotation of a transform step) with its reason.
- **Media** — new `e2e/docs/variables.docs.js`: `docs/screenshots/variables-panel.png`,
  `variable-bind-popover.png`, `variable-bound-chip.png` and a movie
  `docs/media/pi-model-switch.gif` (steps 2-5 above), all embedded in `docs/variables.md`.
  Generated by `npm run docs:media`, never by hand; `e2e/docs-media.spec.js` must stay green.

## Handoff from `core-050` (Opus half, recorded 2026-10-11)

Read `docs/decisions/project-variables.md` first. What this task must handle that the core
leaves to it:

- **Raw `{ "$var": name }` objects reach the UI.** `recordOf`, `Body.params` and the AI's
  `describe_body` return the *binding as written*, not the resolved value. `ParamFields.vue`,
  `useParamCommands.js` (around line 150) and `inspector.js` must show a chip for a binding and
  never feed the object into a numeric input; `dependents.variantLabelOf` must tolerate one.
- **A variable condition has no ref.** `{ var, in }` conditions report `refId: ''`,
  `param: ''` plus `var` in `InactiveBy` and `RowCondition`; `ConditionRow.vue` must branch on it.
- **Create-and-bind must be one undo step.** Wrap it as
  `document.batch(() => { defineVariable(...); bindParam(...) })`. This is untested in core.
- **`var.define` is not a kernel-registry op** (like `asset.image`, `body.delete`), so it is not
  in `list_ops` and the Library never offers it; History shows it as `Define <name>`.
- **The whole `transform.rotate` row is unbindable**, not only `rotation` (its angles feed the
  absolute rotation later transforms carry). Show `bindableParams`'s reason string verbatim.
- **Two failure modes, two behaviours.** A binding the schema can detect as invalid (missing
  variable, wrong kind, outside min/max or the enum) becomes a tolerated, named *broken row*.
  A kernel failure on a native op with no schema refuses the revision atomically (nothing
  changes, the reason is named). A loaded file with a binding to an undefined name, or past the
  10,000-binding cap, loads with that record left broken and a named `LoadWarning`.
- **Known gap.** Other failures only visible at fold time (for example a wrong kind) combined
  with a dependent snap can still refuse a *loaded* file. If the panel can reach that state,
  file a finding rather than papering over it.
- **No AI tools yet.** The seven variable tools are `TODO/ai-014`, not part of this task.

## Affected files

- `src/components/inspector/VariablesPanel.vue`, `VariableRow.vue`, `ParamBindButton.vue`,
  `ParamBindPopover.vue`, `VariableUsageDialog.vue` (each ≤ ~30 template lines per `CLAUDE.md`;
  extract, don't grow `Inspector.vue`)
- `src/components/inspector/ParamFields.vue` (chip-or-editor per field), `ConditionRow.vue`
  (+ the `{ var, in }` form), `Inspector.vue` (mount the section only)
- `src/composables/useVariableCommands.js` (+ spec) — the thin command wrappers over
  `core-050`'s functions, in the style of `useParamCommands.js`; **no geometry or validation
  logic here** (`CLAUDE.md`: component doing coordinate/validation math is a bug)
- `src/stores/` — UI-only state only (popover open, which row is expanded); the variables
  themselves live in the document and are never mirrored into Pinia
- `docs/variables.md`, `e2e/docs/variables.docs.js`, sidebar entry

## Effort

M.

## Testing

- **Unit** — `useVariableCommands.spec.js`: each command forwards to the core function with a
  transaction origin and returns the blast-radius summary; the "unbindable" reason string is
  passed through verbatim; `ParamBindButton` renders for a bindable field and not for a rotation
  row; chip shows the variable name and read-only value.
- **E2E (required, real app)** — `e2e/variables.e2e.js`, navigating to `/` and **driving the Pi
  example above end to end** with no model access: place Pi → bind Model via *New variable from
  this value…* → place a cube and add the `{ var }` condition → change `piModel` in the panel →
  assert the viewport geometry changed (snapshot, not only the DOM) → Undo once → assert it
  returned. Plus: delete a variable that is in use (dialog lists consumers, *keep values* leaves
  the literals), rename (bindings follow), and the "variable defined *after* its consumer" order.
  Runs at **all three viewports** (phone/tablet/laptop) with a snapshot at each, because the
  small-screen behaviour differs from desktop, and against **all three engines**
  (Chromium/Firefox/WebKit): it touches the canvas, the worker result, and the persistence
  round-trip (save, reload, confirm the chips and values survive).
- **Driven, not scripted** — after the spec is green, run the `run` skill and use the feature
  the way someone unfamiliar would: bind a field, then try to type into the now-chipped field,
  bind two fields to one variable, bind a rotation, delete a variable mid-edit, change a value
  while an earlier popover is still open, and tap the bind icon before the worker has
  settled. Report each as PASS/FAIL.
- **Acceptance scenarios to re-drive**: 1, 2 (hardware property edit — its field now has a
  bind control), **15 (change a part's model under a dependent — the closest existing
  scenario; a variable must give the same outcome as editing the field)**, 10, 12, 14, and
  7 (touch-only navigation) at phone width because the bottom sheet gained a tab.
  Add a new scenario (next free number in `TODO/ACCEPTANCE.md`): *create a variable from a
  field, bind a second field to it, change it, undo, save, reload*.
- **Closed findings re-run**: `ui-052` and `ui-044` (their repros, now through a variable),
  `ui-049` (the object list lives in the Inspector this task also adds a section to — confirm
  both still render at 390 px), `ui-043` (phone toolbar/chrome overlap — the sheet gained a
  tab, so recheck the overlap), `ui-046` (nav chrome raised position vs. the sheet).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
