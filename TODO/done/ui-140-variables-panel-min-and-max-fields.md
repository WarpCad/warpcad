---
title: Show and edit a variable's Min and Max in the Variables panel, and refuse an out-of-range value before it commits
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-17 from OWNER.md Q11 (VERIFY.md core-050 #1)
depends: []
status: done
---


> **Shipped:** as proposed. Core gained `setVariableRange` (+ plain-word helpers `variableRangeProblem`, `variableRangeEditProblem`); the row's Min and Max are the shared `NumberField` (blank = unbounded) and the refusals render under their own field (`variable-value-error-<name>`, `variable-min-error-<name>`, `variable-max-error-<name>`). Formula variables have no Min/Max fields yet (only plain numbers); core's own check stays as the backstop.

## Problem

The document model stores a variable's min and max, and an AI agent can set them. The Variables panel (`ui-059`)
shows only Name, Kind, Value and Unit, so a person can neither see nor set a range. Nothing is refused before
commit. Typing -5 into a variable bound to a cube's size commits, then shows *This change affects 1 item* with
the internal message `primitive.cuboid: size[0] must be a positive number of millimetres…` (cold-read panel,
`testing-029`, 2026-11-14). The owner chose to add Min and Max to the panel (OWNER.md Q11, 2026-11-17).

## Affected files

- The Variables panel component under `src/components/` (find it from `ui-059`'s retirement note in `TODO/done/`)
- The variable command(s) in `src/core/` that set min and max (reuse what the AI tools call; no new model field)
- `e2e/` variables spec(s)

## Proposed fix

1. Two optional number fields, **Min** and **Max**, on each variable row's edit view (unit-aware, the shared
   NumberField). Empty means unbounded.
2. Typing a Value outside the range is refused under the field before commit, in plain words ("Must be 5 or
   more"), using the existing refusal-under-field pattern (`ui-100`).
3. Setting Min above Max is refused the same way.
4. Every change goes through the command layer with the local origin, so Undo works.

## Effort

M.

## Testing

- Unit: the command refuses min > max; the value check honours min and max; empty is unbounded.
- e2e (app at `/`): set Min 5 on a variable bound to a Cube's size, type 2, see the refusal and no commit; type 6,
  commits and the Cube resizes; Undo restores. Phone, tablet and laptop projects (the panel is a sheet on a
  phone). Chromium is enough unless the panel's sheet path touches touch input; then all three engines.
- Re-run VERIFY.md `core-050` #1 and set it `OK`. Closed finding regression: `ui-059`'s bind and edit
  reproduction.
- Acceptance scenarios: the variables scenario in `TODO/ACCEPTANCE.md` (search "variable").

## Interaction model

- **Precondition:** a variable exists (Variables panel open).
- **Trigger:** the variable row's edit view, new **Min** and **Max** fields under Value.
- **Feedback:** an out-of-range Value is refused under the field before commit; a valid one commits as today.
- **Placement / Selection response / Selection count:** n/a.
- **Small-screen behavior:** the same fields in the phone's Variables sheet, tap-size, with no horizontal scroll at 390 px.

## Documentation

- **Page**: the variables docs page (from `ui-059`). Example: "Open Variables, tap **width**, set **Min** to 20,
  then try **Value** 10: the field says *Must be 20 or more* and nothing changes." **Media**: one still of the
  refusal, via `e2e/docs/`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
