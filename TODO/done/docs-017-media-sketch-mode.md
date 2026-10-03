---
title: Docs media — Sketch mode: draw, close a profile, extrude, slice
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007]
status: done
---

> **What shipped (2026-10-03, unattended `/run-todos`).** All 9 inventory rows landed in
> `e2e/docs/sketch-mode.docs.js` (4 movies, 5 stills, laptop Chromium) and are embedded in
> `docs/sketch-mode.md`; nothing under `src/` changed. Deviations from the spec's wording:
> - **There is no "sketch mode" to enter.** A sketch is a Library primitive (sketch-001), so
>   `sketch-place` drags the Sketch row in and the page calls it the *sketch editor*.
> - **The Line tool is a drag, not click-click.** Each side is one press-drag-release starting
>   where the last ended; the movie's first side asserts `data-drafting` mid-drag (the live stroke follows
>   the pointer). The spec's example ("click four corners") was corrected on the page to the
>   real gesture, and Done is part of it (the Extrude panel only shows a see-through preview).
> - **A closed outline is not "filled"**; it turns blue and the tan region is the Extrude preview. The page
>   says so. A new "Worked example: a block" carries the spec's example (60 x 40 mm, Height 10 mm).
> - **Through-cavity check** (hole movie): the app exposes no vertex count, so it compares the body's
>   measured volume with block minus a full-depth 15 mm radius bore (within 8 %), and requires it to sit
>   below block minus 85 % of the bore, so a blind pocket or no hole fails.
> - The extrude movie asserts one `primitive.sketch` body, 10 mm tall (to 0.1 mm), resting on the plane.
>   The slice still shows the real card (two rows, Z in mm, **＋ Slice**, **Delete slice**); the extrude
>   GIF needed `fps: 8, width: 600` to fit the 1.5 MB budget (10.4 s).
> - `docs/README.md`'s Sketch entry now lists the block example.

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
