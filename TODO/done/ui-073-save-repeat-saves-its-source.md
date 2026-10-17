---
title: Save to library on a repeat body saves its source part too, so the saved part rebuilds on drop
category: ui
kind: finding
priority: medium
model: sonnet
depends: [core-061]
status: done
---

> **Not built. Superseded by `ui-076`** (owner, 2026-10-17): the ability to save a repeat was
> removed instead of made to work.

## Problem

*Save to library…* on a repeat body (for example *Bolt 1 ×3*) saves the repeat without its
source. Dropping that part from My parts later cannot rebuild the repeat, because its source
is missing. The user chose on 2026-10-17 (question 6 of the decision list) to save the
source too.

Affected: `src/core/userPartTools.js` (the save path) and `src/stores/library.js`.

## Affected files

- `src/core/userPartTools.js` (save: include the repeat's source part)
- `src/stores/library.js` (store the source with the repeat)
- `src/components/layout/SaveToLibraryButton.vue` (the button's label and feedback)
- `src/core/userPartTools.spec.js`, `src/stores/library.spec.js` (update)

## Proposed fix

When the saved body is a repeat, save its source part in the same save, so that dropping
the part rebuilds the repeat. The feedback line says so, for example *Saved Bolt 1 and its
repeat*. Undo of the save removes both.

## Effort

M (a few hours).

## Testing

- Unit: saving a repeat stores the source and the repeat, and dropping it rebuilds the
  repeat.
- Unit: undo removes both.
- E2E: a new case in `e2e/user-library.e2e.js` on all 9 projects, because the save button is
  user-visible.
- Acceptance scenarios: scenario 22 (My parts), re-driven on laptop and phone Chromium.
- Closed-finding regression: `ui-055` (save to library), re-run its repro.
- Engines: all three.

## Interaction model

- **Precondition**: a repeat body is selected.
- **Trigger**: *Save to library…* in the Inspector, unchanged.
- **Feedback**: the saved line names both parts.
- **Placement**: n/a. **Selection response**: n/a. **Selection count**: exactly one selected body.
- **Small-screen behaviour**: same as desktop.

## Documentation

- **Page**: `docs/user-library.md` (a short note under saving a repeat).
- **Example**: select *Bolt 1 ×3*, tap *Save to library…*, then open My parts and drop the
  part; three bolts appear.
- **Media**: n/a unless the Library still changes shape.

## Blocked 2026-10-17 (found by the `/run-todos` agent; owner decision needed)

The Problem above is not what the code does. *Save to library…* on a repeat body **refuses**:
`capturePart(piBoltRepeated(), 'rep-1', ...)` throws `"Bolt 1 ×3" can't be saved as a part: step
"rep-1" (pattern.repeat) is not allowed in a part` (`src/core/userPart.js:1235`). Two reasons:
`capturePart` walks only `target` and `operands`, and a `pattern.repeat` record keeps its source
and seed in `params.source` and `params.seed.id`; and `ALLOWED_OP_PREFIXES` has no `pattern.`. A
part expands into plain records and runs through the kernel's `evaluate`, where `pattern.repeat`
deliberately throws (only the document folds a repeat, `foldRepeat` in `src/core/repeat.js`). A
library save writes to IndexedDB and has no undo today, so "undo removes both" has nothing to attach
to. Acceptance scenario 22 is "Merge a copy of the project", not My parts (closest: 18, plus the
library checks in 1 to 3).

Options (the agent recommends 1):

1. **Bake the repeat when saving.** Write each member as ordinary records with the existing
   `detachedLineage` logic, honour `params.skip`, add one native op (for example `pattern.gather`)
   that builds the group `assemble()` builds, and allow the `pattern.` prefix in parts. A frozen
   snapshot, as parts already are. About a day; adds a persisted op to the part vocabulary.
2. **Carry a linked `pattern.repeat` inside a part.** Most faithful, largest and riskiest
   (`repeat.js` and the kernel must reach each other).
3. **Refuse clearly** (say why in the Inspector reason line and the gate message). Small, but it
   contradicts the 2026-10-17 choice to save the source.

When this runs, rewrite the Problem and Testing for the refusal, re-pick the acceptance scenarios,
and define what "undo of the save" means (one stored part holding everything, so deleting it from My
parts removes it all, is the narrowest reading). First RED test: the `capturePart` call above
succeeds and the expanded part rebuilds three bolts.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
