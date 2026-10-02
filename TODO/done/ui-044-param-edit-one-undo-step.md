---
title: An Inspector param edit on a moved body is three Undo steps, and one Undo leaves it in the wrong place
category: ui
kind: finding
priority: high
model: sonnet
depends: []
status: done
---

> **What shipped (2026-09-24):** the param edit's rebuilt record, rotate-back and
> move-back are now **one Undo step** labelled `Edit <body>`, and a refusal on any of the
> three leaves the document and both stacks exactly as they were. `appendAll` could not
> carry it, because the rotate-back and move-back are measured against the rebuilt body.
> So the fix is a new core primitive, `document.batch(build)` in `src/core/document.js`,
> exposed as the document store's `batch`. The build calls the ordinary `append` as often
> as it needs, reading the live document between calls, and the local steps it pushed
> are merged into one. Atomicity comes from `core-030`'s `captureState`/`restoreState`.
> It works on the rolled-back `insertAt` path too, with the marker advancing past both records.
> Scope grew past the Affected files to `src/core/document.js`, `src/stores/document.js`,
> `src/core/documentBatch.spec.js` (new) and `docs/selection-and-inspector.md`.
> **Not done: "History shows the edit as one step."** History lists one row per log
> record, and `data-004`'s row actions (Edit, Suppress, Move) work on individual records,
> so the rebuilt record and its `Move <body>` still show as two rows. Grouping rows is a
> timeline-design change, not this S fix. The docs page states the two-row behaviour
> plainly rather than implying one row.


## Problem

Found while `TODO/core-030`'s Step 6 re-ran `data-003`'s repro by hand. It is **pre-existing**:
the production build at `335d361` (before `core-030`) behaves identically, step for step.

Steps (laptop 1440×900 Chromium and phone 390×844 WebKit, production build):

1. Drag a Sphere in, then drag a Cylinder in. The Cylinder is left selected.
2. In the Inspector, type `33` into Position X and press Enter. The cylinder moves.
3. Type `12` into Diameter and press Enter. The cylinder gets thinner and **stays where
   it is**.
4. Open History. There are **two new rows for that one edit**: `Cylinder 1 — edited`,
   then `Move Cylinder 1`.
5. Press **Undo** once. The Undo button said `Undo: Move Cylinder 1`.

**Seen:** the cylinder keeps its new 12 mm diameter and **jumps back to its original drop
spot** (x ≈ −43 mm), a state the user never created. A second Undo is needed to get back
to the moved 40 mm cylinder. A rotated body takes a third press (rotate-back).

**Expected** (`docs/decisions/interaction-model-qa.md` section 19, "one user-meaningful
action = one step"): one press of Undo returns the moved 40 mm cylinder, and History shows
the edit as one step.

**Cause:** `src/composables/useParamCommands.js`'s `applyChanges` commits the rebuilt
creation record, the rotate-back and the move-back as **three separate
`documentStore.append` calls**. `document.appendAll` exists for exactly this: `ui-030`
built it so that a composite placement, which also needs two records, is one Undo step.
The Undo/Redo stack itself is behaving correctly; it steps through exactly what was
appended.

## Affected files

- `src/composables/useParamCommands.js`: build all the records first, then commit them
  once with `appendAll` under one label. The rotate-back and move-back are measured
  against the rebuilt body, so they have to be derived from a trial result, or computed
  from the rebuilt geometry before committing.
- `src/composables/useParamCommands.spec.js`
- `e2e/inspector-param-edit.e2e.js`

## Proposed fix

Compute every record first, then make **one** `appendAll` call labelled `Edit Cylinder 1`.
`moveToRecord` needs the rebuilt body's position. Either evaluate the rebuilt record on a
scratch fold to measure it, or derive the move from the creation params' own centre (the
same arithmetic `positionOf` reads back). Refuse atomically if any of the records would not
fold.

## Effort

**S.**

## Testing

- Unit: a param edit on a moved body, and on a rotated one, is exactly **one** undo step.
  One `undo()` returns every body's geometry to its pre-edit state (assert bounds and
  volume, not a call count).
- E2E (`e2e/inspector-param-edit.e2e.js`, navigating to `/`): steps 1-5 above end with the
  moved 40 mm cylinder after one Undo, and History shows one row for the edit. Run on
  Chromium and WebKit at all three viewports; Firefox cannot launch in this sandbox.
- `TODO/ACCEPTANCE.md`: scenario 2 (hardware property edit) and scenario 12 (Undo/Redo).
  Re-run `data-003`'s repro (after a gizmo move, an Inspector param edit and a Subtract,
  Undo returns exactly the prior state), this time on a body that has been **moved first**,
  which is the case its original drive did not cover.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
