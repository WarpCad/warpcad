---
title: A boolean's History row names only the second operand, not the base
category: core
kind: finding
priority: medium
model: sonnet
depends: []
status: done
---

> **Shipped as scoped.** `describeRow` now builds `[target, ...operands]` when `target` is set and falls back to `operands ?? consumes` otherwise. A hand drive showed the base is whichever body was selected first (a just-dropped body stays selected), so `Union Cylinder 1 + Cube 1` is correct for that order.

## Problem

Found by `TODO/ui-051`'s Step 6 re-drive of `TODO/ACCEPTANCE.md` scenario 10, and not caused
by it. Union a Cube and a Cylinder through the Operations toolbar, open **History**: the row
reads **`Union Cylinder 1`**, where `docs/decisions/interaction-model-qa.md` §13 and
`ui-032`'s own spec say **`Union Cube 1 + Cylinder 1`**. The same holds for Subtract,
Intersect and Group, which is the worse case: `Subtract Cylinder 1` reads as though the
cylinder were the thing being cut.

The cause is in `src/core/timelineLabel.js`'s `describeRow`, whose boolean branch prints
`(record.operands ?? record.consumes)`. The real toolbar (`OperationsToolbar.vue`'s `run()`)
writes the **base as `target`** and **only the rest as `operands`**, so `operands` never
holds the base and the `?? consumes` fallback never fires. `timelineLabel.spec.js` misses it
because its fixture puts *both* ids in `operands`, a shape the app never writes.

## Interaction model

n/a. No new control; a label correction on an existing History row.

## Documentation

n/a. `docs/timeline.md` already documents the intended `Union Cube 1 + Cylinder 1`; the fix
makes the app match it.

## Affected files

- `src/core/timelineLabel.js` (`describeRow`'s consuming branch: name `target` then
  `operands`, falling back to `consumes`).
- `src/core/timelineLabel.spec.js` (a fixture in the toolbar's real `target` + `operands`
  shape).

## Proposed fix

Build the operand list as `[record.target, ...(record.operands ?? [])]` when `target` is
set, else `record.consumes`. Handle a `{ id, pieces }` sub-part address the way `nameOf`
already does.

## Effort

S.

## Testing

- **Unit**: a record exactly as `OperationsToolbar.vue` writes it (`target: 'cuboid-1'`,
  `operands: ['cylinder-2']`, `consumes: [...]`) reads `Union Cube 1 + Cylinder 1`; the same
  for Subtract (base first) and a 3-operand Group.
- **`TODO/ACCEPTANCE.md` scenarios to re-drive**: 10 (the rows read after a reload) and 12
  (the History list).
- **Closed-finding regression surface**: none (label only).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
