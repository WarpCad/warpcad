---
title: Docs media — the Library panel and drag-to-place for every primitive
category: docs
kind: feature
priority: high
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007]
status: open
---

## Goal

Placing a shape is the first thing anyone does, and it is a *drag* — the one interaction
a still cannot show. Capture the drag as a movie, show every primitive the Library can
place, and illustrate snap-guide placement and the text label. Embed in
`docs/primitive-placement.md`.

## Interaction model

n/a — documents existing controls.

## Documentation

- **Page** — `docs/primitive-placement.md` (update).
- **Example** — "Open the Library's Primitives section, press on **Cube**, drag into the 3D
  view — a ghost follows the pointer — and release to place it."

## Media inventory

Spec: `e2e/docs/primitive-placement.docs.js`.

| Name | Kind | Shows | Viewport |
|---|---|---|---|
| `library-panel` | still | Library panel, Primitives section expanded, cropped. | laptop |
| `primitive-drag-cube` | movie | Press the Cube row, drag across the panel edge (ghost appears only over the viewport), release; body lands, becomes selected. | laptop |
| `primitive-drag-two` | movie | Place a cube **then a cylinder** — both remain (the second attempt's "adding an item overwrote the previous one" bug, shown not to happen). | laptop |
| `primitive-gallery` | still | One of each Library primitive in a row — enumerate rows from the Library at implementation time (cuboid, cylinder, sphere, and the rest of the seven) rather than hard-coding a list. | laptop |
| `primitive-ghost-preview` | still | Mid-drag frame: the ghost preview over the viewport, document unchanged. | laptop |
| `placement-snap-guides` | movie | Dragging a part near another's face; snap guides light up; release snaps flush (`ui-013`). | laptop |
| `placement-snap-guides-still` | still | The guide highlight frame. | laptop |
| `text-label-placed` | still | A text-label body placed in the scene (`render-002`), inspector showing its text field. | laptop |
| `primitive-sketch-row` | still | The Sketch row's place-and-draw entry point, cropped (links to `docs-017`). | laptop |

## Affected files

- `e2e/docs/primitive-placement.docs.js`, `docs/primitive-placement.md`,
  `docs/screenshots/*`, `docs/media/*`.

## Proposed fix

Use the real Library row `data-testid`s (`library-row-<op>`; list them via the DOM, as
`primitive-placement.e2e.js` does) and `humanDrag` from the row to viewport points at
different `fx/fy` fractions so the shapes do not stack. The mid-drag still must be taken
*while the pointer is held* — the movie helper can expose a `pause()` that captures a still
and continues. If real `page.mouse` cannot start a Library drag, use the interpolated
synthetic fallback `docs-006` defines.

## Effort

M

## Testing

- Movie specs assert `data-body-count` after each release (1, then 2) and `data-placing`
  returns to `false`; stills pass `docs:screenshots` twice.
- Engines: Chromium only for docs pictures. Viewports: laptop (phone Library sheet is
  `docs-018`).
- `TODO/ACCEPTANCE.md`: scenario 1 (two independent primitives) — re-driven by hand after
  the spec lands, since the movie is a scripted version of it. Closed findings: re-run
  `ui-053` (first library drag after Escape ignored) — press Escape mid-drag in a throwaway
  run, then drag again, and confirm the second drag places.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
