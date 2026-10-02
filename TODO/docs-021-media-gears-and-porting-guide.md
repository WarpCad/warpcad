---
title: Docs media for gears, and a "porting a jscad-gears script" guide
category: docs
kind: feature
priority: low
model: sonnet
milestone: M11
depends: [ui-057, ui-058, docs-006, docs-007, testing-002]
status: open
---

## Goal

M10 makes every picture in the docs a by-product of a Playwright run. Gears add a docs page
(`docs/gears.md`, `ui-057`) whose value is *seeing* a mesh, so it needs the same
treatment — plus the one page the user specifically needs: how to rebuild what their old
jscad1 projects do. "Done": `docs/gears.md` carries generated stills and one GIF, and a
`docs/porting-jscad-gears.md` maps V1 scripts onto the Library.

## Interaction model

n/a — documentation only; the controls are `ui-057` and `ui-058`.

## Documentation

- **Page**: `docs/gears.md` (media), new `docs/porting-jscad-gears.md` (+ sidebar entry).
- **Example** — the porting guide's worked case, as a table the reader can follow:
  | V1 (`jscad-gears`) | WarpCad |
  |---|---|
  | `new Gear({ toothCount: 36, circularPitch: π·50/36 })` | Library → Gears → *Spur gear*, Teeth 36, Module 1.4 |
  | `connectedGear` + `toothCount: -96` (ring gear) | *Internal gear*, Teeth 96 — no mating gear needed |
  | `new GearSet(a, b).createShape(3)` | *Gear pair*, or select two gears and **Mesh** |
  | `centerHoleDiameter: 4` | *Shaft & hub* → Bore 4 mm |
  | `drive-wheel`'s hand-snapped "bevel" | *Bevel pair* (a real pitch cone — shapes differ) |
  Plus the three real parameter sets from `window-motor`, `bf-gear` and `drive-wheel`, copied
  from `core-039`'s evidence table, so the user can reproduce their own printed parts.

## Affected files

- `e2e/docs/gears.docs.js` (stills + a movie of: drag a gear, drag a pinion, Mesh, orbit),
  `docs/gears.md`, `docs/porting-jscad-gears.md`, `docs/screenshots/gear-*.png`,
  `docs/media/gears-mesh.gif`, `docs/.vitepress` (or the docs tool's) sidebar.

## Effort

M.

## Testing

- The media guard from `docs-007` passes: no dead links, no orphaned image, no stale movie.
- The `*.docs.js` spec runs in the `docs-*` projects from `docs-005`; the GIF budget from
  `docs-006` applies. A movie is a scripted recording and **does not replace** driving
  scenario 19 (`testing-002`).
- **Acceptance scenarios**: none — docs only. Say so in the commit.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
