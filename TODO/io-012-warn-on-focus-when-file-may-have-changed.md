---
title: On window focus, warn "this file may have changed" in browsers with no file handle (Safari, Firefox, phones)
category: io
kind: feature
priority: medium
model: sonnet
milestone: unscheduled (user request 2026-10-17)
depends: []
status: open
---

## Goal

Safari, Firefox and phones have no file handle, so the app cannot see when the project file
changes on disk. Today those browsers get no prompt. The user chose on 2026-10-17
(question 10 of the decision list) to warn on focus, so the user knows to re-open or merge
the file.

## Interaction model

- **Precondition**: a project was opened from a file, the browser has no file handle, and the
  window gains focus.
- **Trigger**: window focus. No click is needed.
- **Feedback**: a status line in the existing merge strip, reading *This file may have
  changed. Use File ▾ → Merge file… to bring it in.* It stays until the user acts or
  dismisses it.
- **Placement**: n/a.
- **Selection response**: n/a.
- **Selection count**: n/a.
- **Small-screen behaviour**: the line uses the same strip as the merge chip, so it reflows
  to the phone width and does not push the workspace further than the existing merge strip
  already does.

## Affected files

- `src/stores/merge.js` (the focus handler and the no-handle branch)
- `src/stores/fileMenu.js` (the Merge file… action it points to)
- `src/components/storage/FileMenu.vue` (the menu entry, unchanged)
- `src/components/layout/` (the merge strip; find it by its *Changes waiting to merge* text)

## Proposed fix

On focus, when the project has no file handle, set the warning state. Do not read the file
automatically (no handle means no read permission). Clear the warning after a merge or a
save. Keep Merge file… as the only action.

## Effort

S to M (a few hours), depending on how the strip renders the new state.

## Testing

- Unit: the focus handler sets the warning when there is no handle, and does not when there
  is one.
- E2E: a new case in `e2e/save-load-ui.e2e.js` (or a sibling) on all 9 projects, since the
  line is user-visible. Use the no-handle path that the engine forces.
- Acceptance scenarios: scenario 13 (file round trip), re-driven on laptop and phone
  Chromium, and the merge scenarios.
- Closed-finding regression: `io-010`, re-run its Safari merge repro (File ▾ → Merge file…).
- Engines: all three, because the no-handle behaviour differs by engine.

## Documentation

- **Page**: `docs/save-and-open.md` (the no-handle paragraph).
- **Example**: on Safari, open a project file, change it on disk from another app, return to
  WarpCad; the line appears; tap File ▾ → Merge file… and pick the file.
- **Media**: a still of the status line, from an `e2e/docs/` shot.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
