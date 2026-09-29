---
title: Resizing a primitive leaves anything snapped to it where it was
category: data
kind: finding
priority: medium
model: opus
depends: [ui-052]
status: open
---

## Problem

Named out of scope by `TODO/ui-052`, which asked for it to be filed rather than widening
that task. A **primitive's** Inspector param edit (a cube's Size, a cylinder's Diameter)
still takes `ui-029`'s **append** path: it appends a rebuilt creation record that
supersedes the terminal, then re-applies the pose. A Snap or Align already in the log was
evaluated against the *old* solid, so it neither re-folds nor follows. Snap a small cube
onto the top of a 40 mm cube, change the big cube's Size Z to 60, and the small cube stays
floating 20 mm inside it, with no warning.

It is the same "wrong geometry, no error" class `ui-052` fixed for composites by moving
them to `data-004`'s **replace** path (swap the creation record in place and re-fold).
There, every later record, snaps included, re-evaluates against the new solid. No part
ever *disappears* on a primitive, so there is nothing for a repair dialog to do. What is
missing is only that dependents follow.

## Interaction model

n/a. No new control. Resizing through the Inspector's Parameters keeps its current
trigger and feedback; the difference is that snapped and aligned dependents move with the
change, the same as they do for a composite's model change.

## Documentation

`docs/selection-and-inspector.md`'s "Resizing a shape" gains one sentence: anything
snapped or aligned to the shape follows the resize.

## Affected files

- `src/core/paramEdit.js`: `paramEditability` offers `path: 'replace'` for a primitive too,
  or a primitive-specific replace builder mirroring `compositeParamEditRecord`.
- `src/composables/useParamCommands.js`: route a primitive's `setParam` through the replace
  path, and drop the pose re-apply step there (the later transforms stay in the log).
- `ui-029`'s freeze guard: decide whether a Fillet/Chamfer above a primitive still freezes
  it (the replace path re-runs the rim op and *reports* it if it no longer fits, which
  `paramEdit.js` already argues needs no freeze).

## Proposed fix

Reuse `ui-052`'s replace path (`document.reviseRecords`, one Undo step) for primitive
param edits, then decide the fillet-freeze question with the user. It changes a long-
standing, documented behaviour (`ui-029`), so confirm it before starting.

## Effort

M.

## Testing

- **Unit**: a cube snapped onto a cube's top follows a Size Z change
  (`toBeCloseTo`, 1e-6 mm); one Undo restores both; a fillet that no longer fits is
  reported by name.
- **e2e**: the same through the Inspector at all three viewports.
- **`TODO/ACCEPTANCE.md` scenarios to re-drive**: 2, 3, 12.
- **Closed-finding regression surface**: `ui-029` (resize keeps the body centred where it
  was; filleted body behaviour), `ui-044` (one Undo step), `data-004` (mid-history replay).
