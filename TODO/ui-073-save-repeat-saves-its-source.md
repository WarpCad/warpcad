---
title: Save to library on a repeat body saves its source part too, so the saved part rebuilds on drop
category: ui
kind: finding
priority: medium
model: sonnet
depends: [core-061]
status: open
---

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

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
