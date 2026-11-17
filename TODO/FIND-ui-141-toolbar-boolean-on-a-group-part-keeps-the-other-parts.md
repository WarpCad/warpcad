---
title: Keep a group's other parts when the Operations toolbar runs a boolean on one of its parts
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-17 from OWNER.md Q15 (VERIFY.md ai-041 #2)
depends: []
status: open
---

## Problem

`ai-041` gave the boolean record `params.keepParts` (`src/core/kernel/registry.js:572-590`): with a first operand
that names parts of a group, only those parts are cut and the group's other parts stay. The AI path sets it
(`src/ai/tools/operate.js`). The Operations toolbar does not, so a person gets a different result for the same act.
Driven 2026-11-17 (`testing-044`, production build, Chromium, real mouse): Cube, Cylinder and Cube grouped, a fourth
cube over `Cube 1`, `Cube 1` and the cube ticked (either order), **Subtract** → one `boolean.subtract` body;
`Cylinder 1` and `Cube 2` are gone (Undo restores them). The owner chose to make the toolbar match the AI path
(OWNER.md Q15, 2026-11-17).

## Affected files

- The Operations toolbar's boolean command (find where the toolbar builds the `boolean.*` record; search the
  stores and composables for `boolean.subtract`)
- `src/core/kernel/registry.js` (no change expected; `keepParts` exists)
- `docs/groups.md` (one sentence)
- `e2e/` booleans or groups spec

## Proposed fix

When the base operand of a toolbar Subtract, Union or Intersect is a part of a group (`{ id, pieces }`), set
`params.keepParts: true` on the record, so the group's other parts stay and the group keeps its name. Booleans
between whole bodies are unchanged. One transaction with the local origin, so a single Undo reverses it.

## Effort

S.

## Testing

- Unit: the toolbar's record carries `keepParts: true` exactly when the base names group parts.
- e2e (app at `/`): the reproduction above. After Subtract, the group still lists `Cylinder 1` and `Cube 2`, and
  `Cube 1` has the cut. Undo restores the cube and the uncut part. All three engines (kernel results),
  phone, tablet and laptop (the Objects list path differs on a phone).
- Re-run VERIFY.md `ai-041` #2 and set it `OK`. Closed finding regression: `ui-040` (sub-part-addressed boolean
  operands) and `ai-041`'s group drives.
- Acceptance scenarios: the boolean scenarios (union/subtract) and 6 (group vs sub-part selection).

## Interaction model

- **Precondition:** two operands selected, the base being a part of a group (ticked in the Objects list or
  picked in the view).
- **Trigger:** **Subtract** / **Union** / **Intersect** in the Operations toolbar (unchanged).
- **Feedback:** the cut part changes, and the group and its other parts stay in the view and the Objects list.
- **Selection count:** unchanged (exactly two operands).
- **Placement / Selection response:** n/a.
- **Small-screen behavior:** same as desktop.

## Documentation

- **Page**: `docs/groups.md`. Example: "Group a Cube and a Cylinder, drop a small Cube over the first Cube, tick
  **Cube 1** and the small cube, press **Subtract**: the hole is cut in Cube 1 and the Cylinder stays in the
  group." No new media unless the page already shows a group boolean.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
