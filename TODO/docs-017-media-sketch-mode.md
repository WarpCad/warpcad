---
title: Docs media — Sketch mode: draw, close a profile, extrude, slice
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007]
status: open
---

## Goal

Sketching is a multi-step flow (enter sketch → draw → close the loop → extrude) that is
nearly impossible to follow from prose, and the second attempt's own stop note was *"sketch
mode never opened."* One movie of the whole flow, plus stills of each tool. Embed in
`docs/sketch-mode.md`.

## Interaction model

n/a — documents existing controls.

## Documentation

- **Page** — `docs/sketch-mode.md` (update).
- **Example** — "Drag **Sketch** into the view, click the Line tool, click four corners and
  close back on the first; open the Extrude panel and enter `10` (mm) — a solid block
  appears."

## Media inventory

Spec: `e2e/docs/sketch-mode.docs.js`.

| Name | Kind | Shows | Viewport |
|---|---|---|---|
| `sketch-place` | movie | Place the Sketch primitive, enter sketch mode (scenario 9). | laptop |
| `sketch-toolbar` | still | The sketch toolbar with every tool, cropped (`SketchToolbar`). | laptop |
| `sketch-draw-line` | movie | Click-click lines forming a closed outline; stroke preview follows the pointer (`ui-020`). | laptop |
| `sketch-profile-closed` | still | A closed profile highlighted as a fillable region. | laptop |
| `sketch-hole` | movie | A second inner loop becomes a hole (scenario 9's "solid and a hole"). | laptop |
| `sketch-extrude` | movie | Extrude panel: type depth, solid appears in 3D (`ExtrudePanel`). | laptop |
| `sketch-extrude-panel` | still | The Extrude panel cropped, with its fields labelled. | laptop |
| `sketch-slice-panel` | still | The Slice panel (`SlicePanel`) — read what it does before captioning. | laptop |
| `sketch-result-in-3d` | still | The extruded sketch solid, orbited, selected, Inspector showing sketch body fields. | laptop |

Open follow-ups (`sketch-002` vertex editing, `-003` reference image, `-004` auto-trace,
`-005`…`-007` select/continuous-line/snap) add their own media when they land — see
`docs-020`.

## Affected files

- `e2e/docs/sketch-mode.docs.js`, `docs/sketch-mode.md`, `docs/screenshots/*`,
  `docs/media/*`.

## Proposed fix

Canvas drawing goes through the sketch surface, not DOM controls — map clicks through the
sketch's own plane projection (the existing `sketch-primitive.e2e.js` already does this;
reuse its helper). Caption units (mm) on every typed dimension.

## Effort

M

## Testing

- The extrude movie asserts the document gained a solid with the typed depth (±
  tolerance); the hole movie asserts the extruded solid has a through-cavity (vertex count
  or a probe along the axis).
- Engines: Chromium only for pictures (sketch behaviour is gated in its own specs).
  Viewports: laptop (sketch bottom sheet at phone width is `docs-018`).
- `TODO/ACCEPTANCE.md`: scenario 9 (sketch → extrude) — drive by hand after landing.
  Closed findings: re-run the `sketch-001` repro steps (it is the subsystem being
  documented).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
