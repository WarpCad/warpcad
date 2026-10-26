---
title: Keep the Objects count line and "Show all" visible while a body is selected
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, outside the milestone plan
depends: []
status: open
---

## Problem

Found 2026-10-26 by the hand-driven pass of `ui-089` (laptop width, 1440 × 900). The Inspector's
**Objects** section is collapsed by default whenever **one or more bodies are selected**
(`src/components/inspector/Inspector.vue`: `objectsOpen` = `objectList.isSectionOpen(selectedCount)`).
Its count line — `1 object · 1 hidden · Show all` — lives inside that section, so the moment a body is
selected the count line and the **Show all** link disappear, along with the Objects rows and their eyes.

That is the state a user is in straight after a split, which is exactly when they need to hide a piece
and then find their way back. Concretely, in the pass:

- After Split, the body is selected. Hiding `Cube 1 A` from the Parts list (which *is* visible while the
  body is selected) works, but the section header reads only `OBJECTS (1) ▸`, and no `Show all` is
  visible anywhere on screen.
- The only way back is to deselect the body, open the Objects section, and then press Show all, or to
  remember `Shift+H`. Neither is discoverable from the hidden state.

The reverse case also holds: with nothing selected the section opens and the count line shows, so the
control is only missing in the state where a user most often lands after hiding something.

Found and not yet fixed: this is a gap in `ui-089`'s own surface, not a regression in the core rule. The
hide itself persists across a reload and Show all brings the piece back (both checked by hand).

## Affected files

- `src/components/inspector/Inspector.vue` — `objectsOpen` and the section's collapsed default
- `src/stores/objectList.js` — `isSectionOpen(selectedCount)`, the rule that sets the default
- `src/components/inspector/ObjectList.vue` — the count line (`data-testid="objects-count"`) and the
  `objects-show-all` link, which must stay reachable when the section is collapsed

## Proposed fix

Keep the hidden-state summary on screen whatever the section's open state is:

1. Move the count line's "N hidden · Show all" into the section **header** row, beside `OBJECTS (n)`, so
   it stays visible when the section is collapsed. The header already has room on laptop width. At phone
   width (390 px) it wraps under the header text rather than pushing the header wider.
2. Keep `isSectionOpen` as it is. Collapsing the rows when a body is selected is intentional (it makes
   room for the selection's own controls); only the summary moves.
3. Show all in the header acts exactly as it does now (clears every body and part hide in one change).

## Interaction model

- **Precondition** — at least one body is hidden in the view (wholly or per part). The link is absent
  otherwise, as now.
- **Trigger** — the **Show all** link in the Objects section header, visible with the section open or
  collapsed.
- **Feedback** — the link clears every hide; the header summary disappears when nothing is hidden. The
  eyes in the rows are unchanged.
- **Placement** — n/a (nothing is created).
- **Selection response** — with a body selected, the section stays collapsed, and the header summary is
  visible. Selecting or deselecting does not move or hide the summary.
- **Selection count** — n/a (Show all is not an operation on the selection).
- **Small-screen behavior** — the summary wraps under `OBJECTS (n)` at 390 px. The link stays at tap-target
  size (44 px high). No horizontal scroll of the Inspector sheet (the `ui-085` rule).

## Documentation

- **Page** — `docs/selection-and-inspector.md` (update the existing **Hide and show** section, added by
  `ui-089`).
- **Example** — "After a split, select the body and hide one piece from the Parts list. The Objects header
  now reads `1 hidden · Show all` even with the body still selected. Press Show all to bring the piece
  back, without deselecting the body."
- **Media** — regenerate `e2e/docs/object-visibility.docs.js`'s still (`docs/screenshots/objects-hide-split-piece.png`)
  if its frame shows the Objects section; the frame it takes is the selected-body state, so it should now
  include the header summary. Run `npm run docs:media` and check the picture.

## Effort

S. A header move, one store-free template change, and the matching spec.

## Testing

- **Unit** — `src/components/inspector/ObjectListVisibility.spec.js`: with one body selected and one part
  hidden, the header summary and `objects-show-all` are present with the section collapsed; with nothing
  hidden, neither is rendered.
- **E2E** — extend `e2e/object-visibility.e2e.js` (navigates to `/`): split a cube, **leave the body
  selected**, hide `Cube 1 A` from the Parts list, assert `objects-show-all` is visible, click it, and
  assert both parts are shown while the body is still selected. **All three reference viewports** (the
  header wraps at 390 px, so each needs its own snapshot) and **all three engines** (the header layout
  differs by engine font metrics).
- **Acceptance scenarios to re-drive, by hand** — 6 (Group vs. sub-part selection): the header summary must
  not change which part row is selected; 10 (Save, reload, and confirm nothing changed): the header reads the
  same after a reload.
- **Closed findings to re-run** — `ui-089` itself (its own Hide / Show / Show all steps, re-driven by hand
  as in the pass that found this), and `ui-085` (Inspector sheet scrolls sideways in Safari) on the phone
  snapshot.

## Open questions

- Should the header summary also appear in the Parts list when the Objects section is collapsed? This spec
  says no: the Parts list already shows each part's eye, so only the global Show all needs the header.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
