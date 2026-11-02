---
title: A plain Group loses a recoloured body's colour
category: core
kind: finding
priority: medium
model: sonnet
depends: []
status: done
---

## Problem

**In user terms:** colour a Cube red, select it and a second Cube, press **Group**, and the red is gone.
Nothing warns you, and Undo is the only way back.

**Measured 2026-11-02 at `3ecbaf8`**, through the document with a real kernel: a red Cube grouped with a
second Cube gives a body with `colorOverrides` of `null` and `Group.colors` of `{}`.

**The cause:** a user colour lives on the operand's lineage (`colorOverridesOf` in `src/core/document.js`). A
`group.assemble` is a new root, which reads only its own lineage, so the operand's colour is left behind.
`group.merge` has the same shape and does not lose it, because `planGroupMerge` bakes each effective colour
into the record (`core-076`). `core-076` left this path alone on purpose and recorded that it needed its own
finding.

Three paths still reach it:

1. **The one-click Group** of bodies with no parts (`run()` in `OperationsToolbar.vue`).
2. **The Group panel with every row unticked and nothing hidden**, where `recordFor` in `src/core/groupMerge.js`
   deliberately writes today's `group.assemble`. A recoloured Pi kept whole loses its colour this way.
3. **The AI `operate` tool's `group.assemble`** (`src/ai/tools/operate.js`).

## Interaction model

- **Precondition**: 2 or more solids selected, at least one with a whole-body colour. Unchanged.
- **Trigger**: the existing **⊞ Group** button, or the panel's **Group**. No new control, and with no parts
  selected it stays one click.
- **Feedback**: the part keeps its colour in the view. The Inspector's Color control on that part shows it.
- **Placement**: n/a. Nothing moves.
- **Selection response**: unchanged.
- **Selection count**: 2 or more, unchanged.
- **Small-screen behavior**: same as desktop.

## Documentation

- **Page**: `docs/groups.md`, under "What happens to the original shapes".
- **Example** (the page contains this; millimetres, Z up):
  1. Drag two **Cubes** into the view, and colour the first one red in the Inspector.
  2. Select both and press **Group**. The first Cube stays red.
  3. Click it twice to reach `Group 1 ▸ Cube 1`. Press **Reset** under Color only if you have recoloured it since:
     Reset returns it to the red it had when you grouped it.
- **Media**: none needed. A colour is not worth a new movie here, and `e2e/docs/groups.docs.js`'s existing shots
  use uncoloured cubes, so they do not change.

## Affected files

- `src/core/groupMerge.js`: `recordFor`
- `src/components/viewport/OperationsToolbar.vue`: `run()`
- `src/ai/tools/operate.js`: the `group.assemble` spec
- `docs/groups.md`

## Proposed fix

**Write `group.merge` of `name` members when there is a colour to keep, and leave `group.assemble` itself alone.**
That op already takes `{ name, colors }` per member and paints them, so this is a change to who writes what, with
no kernel change. Changing what `group.assemble` paints would change saved files, which is the reason `core-076`
left it. Existing records keep folding exactly as they do.

1. In `recordFor`, fall through to `group.assemble` only when nothing merges, nothing is hidden **and no row has an
   effective colour to bake**. A plain Group with no colour anywhere must still write byte-for-byte today's record:
   `groupMerge.spec.js`'s "the record equals group.assemble's" stays true for that case.
2. In `run()`, take the plan for `group.assemble` too, and commit it with no panel. Keep the one-click behaviour: the
   panel still opens only for bodies with parts. Keep the `nextId` call outside the planner.
3. In `operate`, have the `group.assemble` spec write the same record when an operand has a colour, so a click and a
   tool call cannot drift. `params.names` becomes each member's `name`.

**A stated limit:** a body kept whole becomes one part, so only its whole-body colour can survive. Per-part colours on
a kept-whole Pi are lost, because there is only one part left to carry a colour. Merging is the way to keep those.

**Watch for:** History reads `Group A + B` for this record already (`describeRow`, all members named), so the row does
not change. A whole-body colour moves from the override tier to the recipe tier, so Reset on the part falls back to the
baked colour rather than to the theme.

## Effort

S.

## Testing

- **Unit, `groupMerge.spec.js`**: a recoloured solid with nothing merging writes `group.merge` with its colour under its
  name, and the fold paints it; a whole-body colour on a body kept whole does the same; with no colour anywhere the record
  still equals `group.assemble`'s; alpha survives. Degenerate: a colour reset before grouping bakes nothing, and writes
  `group.assemble`.
- **Unit, `operate.spec.js`**: `group.assemble` over a recoloured solid keeps the colour, and its existing "names its parts
  after the bodies" case is unchanged.
- **Unit, `OperationsToolbar.spec.js`**: Group over a recoloured solid opens no panel and writes the record.
- **E2e, `e2e/group-merge.e2e.js`, navigates to `/`**: colour a Cube through the Inspector's real Color control, Group it with
  a second, and read the part's colour. `data-body-part-colors` announces user overrides only, so a baked colour has to be
  read from the value (`group-merge.e2e.js` already does). Undo restores the colour on the operand.
- **The one-click guard**: `e2e/group-combine.e2e.js` passes with no edit.
- **Viewports**: Small-screen behavior is same as desktop, so no new snapshots.
- **Engines**: all three. It changes what the viewport paints and what the project file records.
- **Acceptance scenarios to re-drive**: 4 (gating), 6 (whole-unit Group, with a recoloured Pi), 13 (recolour), 10 (reload),
  22 (merge a copy), 24 (the AI path).
- **Closed findings whose repros must be re-run**: `core-076` (scenario 32 on the owner's real file, not committed) and
  `core-054` (a colour through part capture: **To library** on the result keeps it).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
