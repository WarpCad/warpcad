---
title: "JSCAD V3 switch: replace extrudeRectangular and the old vectorText output — sketch Outline walls and text.label"
category: core
kind: feature
priority: low
model: sonnet
milestone: deferred — JSCAD V3 switch, not on the current roadmap
depends: [core-066, core-067]
status: deferred
---

**Deferred 2026-10-17** with its umbrella, `core-066`.

## Goal

A sketch extruded with the **Outline** method and a **text label** come out the same under V3 as
under 2.13.0: same wall thickness, same stroke width, same volume and bounding box. Done means
the specs and e2e below pass on the `core-066` branch, with the volumes and boxes captured on
`main` as the reference.

## Current behaviour (2.13.0)

- `src/core/kernel/registry.js:749-761` (Outline method): for each sketch outline,
  `extrusions.extrudeRectangular({ size: options.wallMm / 2, height: options.heightMm },
  primitives.polygon({ points }))`. In 2.x this reverses any clockwise outline, expands it as a
  closed `path2` by `delta = size` on each side, and extrudes the resulting ring: a wall
  `2 × size` thick (the comment at `:752-754` records the measurement: 2 mm in, 4 mm wall).
- `src/core/kernel/text.js:69-79` (`text.label`): `text.vectorText({ height }, params.text)`
  returns **an array of strokes, each an array of `[x, y]` points**; strokes of one point are
  dropped (`.filter((points) => points.length > 1)`), and each stroke becomes
  `extrusions.extrudeRectangular({ size: strokeWidth, height }, geometries.path2.fromPoints(
  { closed: false }, points))`, then all are unioned (`:83`).

## Expected V3 behaviour

Verified by running both versions in Node (2026-10-17, 3.0.7-alpha.0):

- `extrudeRectangular` was removed in 3.0.0-alpha.0. The compat shim is
  `extrudeLinear(opt, offset(opt, geom))`, which **ignores `size`** (the shim passes
  `{ size, height }` to `offset`, whose option is `delta`, default 1) and, for a `geom2`,
  **grows a filled shape instead of a wall**. Measured: `extrudeRectangular({ size: 2, height: 5 },
  20 × 20 square)` gives 1600 mm³ in 2.13.0 (a 2 × 2 mm wall ring) and **2420 mm³** in V3 (a
  filled 22 × 22 block). So the sketch Outline method would silently make solid blocks.
- `vectorText(options, text)` now returns **lines**: `[{ width, height, chars: [{ width,
  height, paths: [path2, ...] }] }]`. For `'A'`, 2.13.0 returns 3 point arrays; V3 returns 1 line
  object. `text.js`'s `.filter((points) => points.length > 1)` drops every line object (no
  `.length`), so `text.label` would throw "text must contain at least one drawable character"
  for every input. (Changelog: "reworked vectorChar and vectorText to return segments as path2
  objects"; "corrected vectorChar and vectorText options to align with the common API".)
- Candidate replacements, checked for parity against 2.13.0:
  - text: flatten `lines[].chars[].paths[]`, keep paths with more than one point, and use
    `extrudeLinear({ height }, offset({ delta: strokeWidth, corners: 'edge', segments: 16 },
    path))`. For `'AB'`, height 10, stroke 1, depth 2: volume **359.8173 mm³** and bounding box
    `[[-0.2202, -1, 0], [26.7143, 16, 2]]` in both.
  - outline wall: for each outline of the polygon, `extrudeLinear({ height }, offset({ delta: size,
    corners: 'edge' }, path2.fromPoints({ closed: true }, outline)))`. For a 20 × 20 square,
    size 1, height 5: **800 mm³**, box `[[-1, -1, 0], [21, 21, 5]]` in both.

Unverified:

- The vectorText option names WarpCad passes (`height` only) are unchanged, but the default
  `height` and letter spacing were not compared across versions beyond the `'AB'` case.
- 2.x reversed clockwise outlines before expanding (`extrudeRectangularGeom2.js`); the candidate
  above did not, and was only checked on a counter-clockwise square. Check a clockwise outline.
- Multi-line text (`\n`) and alignment: V3 handles line spacing inside `vectorText`; not compared.

## Proposed fix

1. `text.js:69-79`: adopt the text candidate above. Keep the one-point-stroke filter (a dot) and
   the "at least one drawable character" error.
2. `registry.js:749-761`: adopt the wall candidate, reversing clockwise outlines first to match
   2.x. Keep the `wallMm / 2` mapping and its comment, updated to say what replaced
   `extrudeRectangular`.
3. Use the flat V3 imports (`offset`, `extrudeLinear`, `path2`, `vectorText`) rather than the
   untyped compat shims (`core-067` step 4).

## Affected files

- `src/core/kernel/text.js:20-25, 61-94`
- `src/core/kernel/registry.js:749-761`
- `src/core/kernel/text.spec.js`, `src/core/kernel/registry.spec.js` (Outline cases),
  `src/core/exportJob.spec.js` (Outline exports with 0 open edges)

## Effort

S (< 1 hr) to M.

## Interaction model

n/a — the Extrude panel's Outline button and the text label tool are unchanged; only the kernel
call behind them changes, and the result must be identical.

## Documentation

n/a — no user-visible change. If parity fails and a visible difference is accepted instead, the
sketch and text-label pages under `docs/` must be updated in the same task.

## Testing

- **Parity with 2.x** (captured on `main` first): `text.spec.js` volumes and boxes for single
  characters, a dot-only character (`.`), mixed case, digits and a two-line string; Outline walls
  for a square, a circle, a clockwise outline, and a solid with a hole (Outline ignores Solid/Hole
  roles, per the Extrude panel) — volume within 1e-6 relative, box within 1e-9 mm.
- **Wall thickness**: `wallMm: 2` gives a 2 mm wall (`registry.js:752-754`'s contract).
- **Closure**: Outline and a text label export with 0 open edges (`exportJob.spec.js`).
- **Degenerate**: empty text and whitespace-only text still refused; a stroke of two identical
  points.
- E2E: `e2e/text-label-placement.e2e.js` on Chromium, Firefox and WebKit at laptop and phone.
  No app-level e2e drives the **Outline** extrude method today (checked 2026-10-17: only
  `e2e/support/drawingProvider.js` names `'outline'`), so add an Outline case to
  `e2e/sketch-primitive.e2e.js` (draw a square, Outline, Done, assert the body's volume is a wall,
  not a block) and run it on the same matrix.
- Acceptance scenarios to re-drive: **9** (sketch, extrude) with the Outline method.
- Closed-finding regression: `io-004`'s open-edge repro on an Outline-extruded sketch export.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
