---
title: One Library entry for bolts and screws, so a user can place a screw (the Library has no Screw row today)
category: ui
kind: feature
priority: medium
model: sonnet
milestone: unscheduled (user request 2026-10-17)
depends: []
status: open
---

## Goal

A user cannot place a screw today. `hardware.screw` has no `ui` block, so the Library has no
Screw row. The user chose on 2026-10-17 (question 11 of the decision list) to use **one
combined bolt/screw entry** instead of a separate Screw row. Read that answer as a single
Library entry that covers both bolts and screws, with the Type dropdown choosing between
them. This reading is the one to confirm with the user before the work starts. The defaults
already named in `src/core/kernel/registry.js` (`m4`, 12 mm, `PanHead`) seed the entry.

## Interaction model

- **Precondition**: none. The entry is always available in the Library.
- **Trigger**: the combined bolt/screw row in the Library, placed by dragging into the 3D view.
- **Feedback**: the placed part appears at the drop point, and its Inspector shows the Type
  (bolt or screw) and Size.
- **Placement**: dragged into the viewport, as the other Library parts are. Not at a fixed
  transform.
- **Selection response**: the Inspector shows Type, Size, Fit and the head, with the gizmo
  attached.
- **Selection count**: n/a (creation, not an operation).
- **Small-screen behaviour**: the Type dropdown must not clip its longest label in the Library
  column at 390 px. `TODO/VERIFY.md` already records a clipped *Wood screw, flat head*. Decide
  between widening, shortening or wrapping, and check the result at 390 px.

## Affected files

- `src/core/kernel/recipes/hardware.screw.js` (give it the `ui` block, or fold it into the combined entry)
- `src/core/kernel/registry.js` (the defaults and the entry's registration)
- `src/components/layout/LibraryPanel.vue` (the new row)
- `src/core/libraryDefaults.spec.js` (the defaults)

## Proposed fix

Add a `ui` block for the combined entry, seeded with the registry defaults. Its Type
dropdown offers bolt and screw variants. Reuse the existing `hardware.bolt` and
`hardware.screw` recipes, so no new geometry is needed.

## Effort

M (a few hours).

## Testing

- Unit: the combined entry's defaults and its Type options.
- E2E: a new case in `e2e/hardware-library-placement.e2e.js` that places a screw on all 9
  projects.
- Acceptance scenarios: the hardware and Library placement scenarios, re-driven on laptop
  and phone Chromium.
- Closed-finding regression: `ui-052` (Library placement), re-run its repro.
- Engines: all three.

## Documentation

- **Page**: `docs/hardware-library.md` (the combined entry; remove the note that screws
  cannot be placed).
- **Example**: open the Library, drag the bolt/screw entry into the viewport, set Type to
  Screw, read the Inspector's Size.
- **Media**: a still of the entry, and a movie of the drag, from `e2e/docs/hardware-library.docs.js`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
