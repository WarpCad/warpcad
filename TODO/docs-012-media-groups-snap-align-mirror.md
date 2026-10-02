---
title: Docs media — Group, sub-part selection, Snap, Align and Mirror
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007]
status: open
---

## Goal

The operations that rearrange or combine *without* merging geometry. Each is spatial and
easiest to understand as before → after. Embed in `docs/groups.md`, `docs/snap-align.md`
and `docs/mirror.md`.

## Interaction model

n/a — documents existing controls.

## Documentation

- **Page** — `docs/groups.md`, `docs/snap-align.md`, `docs/mirror.md` (update all three).
- **Example** — "Select a plate and a lug, press **⇥ Snap**, choose *flush against +X* —
  the lug slides against the plate's side without merging."

## Media inventory

Specs: `e2e/docs/groups.docs.js`, `e2e/docs/snap-align.docs.js`, `e2e/docs/mirror.docs.js`.

| Name | Kind | Shows | Page |
|---|---|---|---|
| `group-combine` | movie | Select two shapes → ⊞ Group → one selectable body; moving it moves both (`ui-015`). | groups |
| `group-subpart-select` | movie | Click a grouped body (whole group selected), then drill into one sub-part; Inspector shows the part (`ui-016`/`ui-042`). | groups |
| `group-vs-union` | still | Side-by-side comparison: a group keeps each part's colour/geometry; a union is one mesh. Two scenes, one composed image or two shots in a table. | groups |
| `snap-popover` | still | The Snap popover open with face/operand choices (`ui-026`). | snap-align |
| `snap-operation` | movie | Select two → Snap → one solid slides flush to the other. | snap-align |
| `align-operation` | movie | Select two → Align → centred on an axis. | snap-align |
| `snap-subpart-operand` | movie | Snap using a sub-part as the operand (a screw onto a board's mounting hole) (`ui-035`). | snap-align |
| `mirror-popover` | still | Mirror popover with plane choice (`ui-039`). | mirror |
| `mirror-operation` | movie | Select one body → Mirror across a plane → reflected copy appears. | mirror |
| `mirror-result` | still | Final frame, orbited to show symmetry. | mirror |

## Affected files

- the three specs above, the three docs pages, `docs/screenshots/*`, `docs/media/*`.

## Proposed fix

Compose `group-vs-union` as two element screenshots stacked by the spec in a tiny HTML
harness page rendered inside the same Playwright run — no image-processing dependency, and
it stays under `toHaveScreenshot`. If that proves awkward, make it two separate shots in a
two-column markdown table instead.

## Effort

M

## Testing

- Movies assert end state (group is one selectable body; snapped bodies share a face plane
  within a stated tolerance; mirror produces a body with the negated centre coordinate).
- Engines: Chromium only. Viewports: laptop.
- `TODO/ACCEPTANCE.md`: scenario 3 (snap-placement of a kit assembly), 6 (group vs sub-part
  selection), 16 (mirror a body) — drive by hand after landing. Closed findings: re-run
  `ui-041` (select an unpickable body) and `core-013`'s snap/align repro.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
