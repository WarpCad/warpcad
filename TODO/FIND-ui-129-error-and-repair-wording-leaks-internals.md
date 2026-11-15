---
title: Word the fillet, field and broken-step messages for a user, and stop showing replica ids in the chat readout
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-029 cold-read panel
depends: []
status: open
---

## Problem

Two independent fresh agents read these messages with no project context. Each agreed they leak internals:

1. **Fillet radius too large** (`ui-027` #2). `modify.filletRim: radius 45mm must be narrower than the solid's 40mm extent along the axis`
   (source `src/core/kernel/fillet.js` line 296; the row quoted "less than", the code says "narrower than"). "Extent along the axis" and the op id mean
   nothing, and no limit is given. Proposed: *A 45 mm fillet is too large for this 40 mm cube. Use a radius smaller than 40 mm.*
2. **Rejected size field** (`ui-029` #2). `primitive.cylinder: height must be a positive number of millimetres, got 0`. The `document.append:`
   prefix is already stripped (`reasonOf` in `src/core/document.js`), but the op key stays. Both agents proposed *Height must be more than
   0 mm.* The fix belongs at the display boundary, once, for the Inspector and the History row. The same op-key text also reaches a **variable edit**
   as `primitive.cuboid: size[0] must be a positive number of millimetres, got -5`, shown only after commit, in a *This change affects 1 item* dialog.
3. **The broken History row and its repair** (`data-006` #1). Both agents found the row greyed with an *inactive* and a *broken* chip (red, not
   amber), the message `can't be built: supersedes "cuboid-…-1", which has itself already been superseded by "…-move-…" — forking a lineage would put two
   live representations of one body on screen` (record ids and jargon), the repair button **Re-link to the moved step** at the bottom of a
   roughly 130 px panel so it needs scrolling, and a second route: the Inspector's amber box *1 item built on Cube 1 no longer builds.* with
   **Resolve…**. Two names, two colours. The Resolve dialog says *Nothing has changed yet* after the break. Proposed: one name and one amber
   treatment; plain text such as *Fillet can't be applied because Cube 1 was moved after you rolled back*; show the button on the row.
4. **Replica ids in the chat readout** (`data-008` #2). `cuboid-k3f5xa-1`, `cuboid-k3f5xa-1-move-k3f5xa-4`: both agents called the repeated
   project tag noise and proposed showing `Cuboid 1`, `Move of Cuboid 1 (4)` while keeping the full id in a tooltip, the raw log and the MCP
   responses.

Caveat: items 1 and 2 were judged from the strings; items 3 and 4 partly from the live build (3) and the string (4).

## Affected files

`src/core/kernel/fillet.js`, `src/core/kernel/registry.js` (`requireDimension` line 593), `src/core/document.js` (`reasonOf` and the History row
message), the History row and Inspector repair components, the Assistant activity row (`src/components/ai/ActivityRow.vue`).

## Proposed fix

One shared `userReason()` at the display boundary that turns the known kernel messages into the plain sentences; unify *Resolve…* and
*Re-link…*; trim the replica tag only in the display. Keep the raw text for the console, the MCP tools and tests.

## Effort

M.

## Testing

Unit tests for each message mapping; e2e for the fillet popover and the broken row at three viewports on the rotating pair. Re-run the `ui-027`,
`ui-029`, `data-006` and `data-008` reproductions.

## Interaction model

Preconditions as in each row (a selected cube and a fillet radius at or past its extent; a rolled-back timeline with a moved body). Feedback: the
plain sentence.

## Documentation

`docs/fillet-chamfer.md` (the error), `docs/timeline.md` (the Re-link / Resolve section).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
