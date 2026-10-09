---
title: Curve helpers and a lofted wing — sample an airfoil into a sketch outline, taper and twist it along the span
category: sketch
kind: feature
priority: high
model: opus
milestone: M9
depends: [sketch-001]
status: done
---


> **What actually shipped.** The design landed as written, with these differences and
> additions:
>
> - **The spec's NACA thickness constant was wrong.** "0.12 × 0.594689 × chord" at 30 %
>   chord is not the NACA 0012 half-thickness; the correct value is 0.12 × 1.00029 × chord.
>   The unit test asserts the correct number, and the Testing bullet below is corrected.
> - **Spline through points** is implemented as *Smooth selected outline*: it needs exactly
>   one closed outline picked and smooths it into a closed Catmull-Rom curve, greyed out
>   with a reason otherwise. It does not start a new point-by-point drawing mode.
> - **Edit curve is the Inspector's numbers** (`inspector-sketch-curve-*`), regenerating the
>   outline in place; **Convert to outline** drops the provenance and makes the points
>   draggable (sketch-002).
> - **Twist pivots about the slice origin** (an airfoil placed on the origin turns about its
>   leading edge); positive is
>   counter-clockwise seen from above.
> - **Loft correspondence** (`resample.js`): every outline starts at the trailing edge and
>   slices share arc-length stations, which is what keeps two airfoils from skinning into a
>   twisted shape. A 180-degree start mismatch is covered by a unit spec.
> - The `curve` outline kind is accepted by the AI `create` tool, validated by the same
>   caps as raw points.
> - **Side effect found by the drive**: the taller Slices card puts the Reference image
>   buttons below the fold at 1440x900 (the card scrolls). Two docs movie specs now scroll
>   them into view; four docs screenshots were re-taken (toolbar's Curve button, Offset and
>   Twist rows). No UI change was made for it.
> - Docs: `docs/sketch-mode.md` (*Curves and airfoils*, *Tapered and twisted lofts*) with
>   `e2e/docs/sketch-airfoil.docs.js` producing `sketch-curve-sheet.png`,
>   `sketch-airfoil-placed.png` and `sketch-slice-offset-twist.png`.
## Goal

"Use the sketch tool to create an airfoil for a model plane wing" must be possible for a
person *and* the AI through the same sketch model. Today a profile is a circle, rect,
polygon or polyline, with no way to produce a smooth curved outline short of clicking
hundreds of points. "Done": a **Curve** helper turns a formula into a closed polyline
outline in a sketch slice, and a three-slice Loft (root, mid, tip) with different chord,
position and twist makes a tapered, twisted wing that exports watertight.

## Design

- `src/sketch/curves.js` (pure, framework-free, no kernel import): `naca4(code, chordMm,
  { points, closedTrailingEdge })` (the standard 4-digit camber/thickness equations, cosine
  spacing so the leading edge is dense), `ellipse`, `arc`, `bezier`, `catmullRom`, and
  `resampleByArcLength(points, n)`. Each returns `Vec2Mm[]` in the sketch plane, unit in the
  parameter name. Trailing edge: the open-TE equation leaves a tiny gap; the helper closes
  it (default) and says how, because a zero-thickness TE is non-manifold.
- A profile gains **provenance, not a new kind**: a polyline may carry `source: { curve:
  'naca4', params }` so the editor can offer *Edit curve* and the AI/History can say "NACA
  2412, 120 mm chord" instead of 160 anonymous points. The kernel still sees a polyline,
  so there is no new kernel path. Cap and validation reuse `MAX_POLYLINE_POINTS`.
- **Loft between slices with different vertex counts and orientation** is already
  `resample.js`; this task proves it for airfoils (matching start vertex at the trailing
  edge, consistent winding, so the loft does not twist inside out) and fixes what it finds.
- **Per-slice transform**: each slice may carry `offsetMm: [x, y]` and `rotateDeg`, so a
  tip can be swept back and twisted (washout) without redrawing. This is the minimal
  addition that makes a wing a sketch rather than a boolean of boxes.
- The sketch's local Z is the extrusion axis, so a wing's span runs along it; the editor
  and the AI both place the finished body with the existing rotate/translate.

## Interaction model

- **Precondition**: the sketch editor is open on a slice (sketch-001); *Edit curve* needs
  exactly one curve-sourced outline selected (depends on `sketch-005`'s Select tool).
- **Trigger**: a **Curve ▾** tool in the sketch toolbar (`data-testid="sketch-tool-curve"`)
  with *Airfoil (NACA 4-digit)*, *Ellipse*, *Spline through points*. Choosing Airfoil asks
  for code, chord and point count in a small sheet and **places the outline on the slice by
  dragging it into position** (preview follows the pointer, commits on release — the
  placement rule). Slice rows in the Slices panel get **Offset** and **Twist** fields.
- **Feedback**: the outline appears with the status line "Airfoil NACA 2412 · 120 mm chord";
  Loft preview (worker-built, as sketch-001) updates live; invalid input names the field.
- **Selection response**: the Inspector sheet shows the curve's parameters as editable
  numbers that regenerate the outline; the outline's points are not individually draggable
  until Convert to outline (`sketch-002`).
- **Selection count**: Edit curve needs exactly 1.
- **Small-screen behavior**: Curve ▾ fits the phone toolbar slot (re-check `ui-043`'s
  overlap rule); the parameter sheet is a bottom sheet; 44 px targets.

## Documentation

Update `docs/sketch-mode.md`: *Curves and airfoils*, *Tapered and twisted lofts*. Example:
"Add a Sketch, open **Curve ▾ → Airfoil**, enter `2412`, chord `120`, drag it to the origin,
tap **Slices → Add slice**, set its Z to `200`, chord `70`, Twist `-2`, Offset X `30`, choose
**Extrude ▾ → Loft**, tap **Done**. You have a 200 mm tapered, washed-out wing panel."

## Affected files

- `src/sketch/curves.js` (+ spec), `src/sketch/profile.js` (`source` field, per-slice
  offset/twist, validation), `src/sketch/resample.js`, `src/core/kernel/registry.js`
  (`buildSketch` honours slice offset/twist), `src/components/viewport/SketchToolbar.vue`,
  new `src/components/sketch/CurveSheet.vue`, `SlicePanel.vue`, `docs/sketch-mode.md`,
  and the AI tool in `src/ai/tools/` (`sketch.create` accepts a `curve` spec as well as
  raw points).

## Effort

L. The loft-vertex-correspondence part is where airfoils go wrong: budget for it.

## Testing

- **Unit**: NACA 0012 half-thickness at 30 % chord is 0.12 × 1.00029 × chord to `toBeCloseTo` (the original 0.594689 constant was wrong; see the note at the top);
  NACA 2412 max camber is 2 % at 40 %; point 0 is the trailing edge; winding is CCW; closed
  TE; `points: 3`, `chordMm: 0`, code `'abcd'`, negative chord → named errors. Loft: two
  airfoils with different point counts, a 180° start-vertex mismatch (must not self-intersect
  — assert volume within tolerance of the analytic frustum-ish estimate and `watertight`).
- **E2E** (`e2e/sketch-airfoil.e2e.js` → `/`, real `page.mouse` and trusted touch on
  phone): build the 3-step recipe above by hand, assert the body count and the status line,
  export STL and assert non-empty. Three viewports; all three engines (canvas + touch).
- **Acceptance**: re-drive 9 and 1; closed findings `ui-020 #1/#2/#3`, `ui-043`, `ui-046`,
  `sketch-005/006/007` once landed.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
