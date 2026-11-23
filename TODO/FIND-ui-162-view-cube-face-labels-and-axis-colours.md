---
title: Label the view cube's faces and colour them by axis
category: ui
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, requested by the owner 2026-11-23
depends: [ui-161]
status: open
---

## Problem

The owner, 2026-11-23: "the new view cube gizmo looks good. … it's plain. Can you add the axis text and colors to the cube?"

`ui-158` built the cube to match WarpCad1's: solid, **unlabelled**, six grey "lit from above" shades (`--view-cube-*` over
`--pebble-*`). That was what the owner liked about it at the time. In use, nothing on it says which face is Front or which way
+X runs. The `az · el` caption is the only readout, and it doesn't name an axis. The rest of the app already colours axes: the grid's
X and Y lines and the dimension lines read `--axis-x` (red) and `--axis-y` (green). There is no `--axis-z`, because nothing has
drawn Z until now.

This depends on `ui-161` because the label size must be chosen at the cube's final size.

## Interaction model

- **Precondition** — nothing (unchanged).
- **Trigger** — unchanged. The labels are inside the existing face buttons and don't change what a tap does.
- **Feedback** — each face shows its view name and its signed axis, and carries its axis colour:

  | Face | Name | Axis (camera side) | Colour |
  |---|---|---|---|
  | top | TOP | +Z | `--axis-z` |
  | bottom | BOTTOM | −Z | `--axis-z` |
  | front | FRONT | −Y | `--axis-y` |
  | back | BACK | +Y | `--axis-y` |
  | right | RIGHT | +X | `--axis-x` |
  | left | LEFT | −X | `--axis-x` |

  The axes match `viewCube.spec.js` and the Views grid's labels (`PICKER_FACES`: Top is Z, and so on). Front is the −Y side
  because the Front view's camera sits on −Y.
- **Placement** — n/a.
- **Selection response** — n/a.
- **Selection count** — n/a.
- **Small-screen behavior** — at the phone's 55 px side, the face name may not fit at a legible size. If it doesn't, the phone
  shows the signed axis alone (`+Z`) and the name moves into the existing `title` and `aria-label`. Measure this; don't guess.

## Documentation

- **Page** — `docs/viewport-navigation.md`, the view cube steps. They say "the white top face" today, and the top face will now be
  labelled and tinted, so name it by its label instead. Also add a sentence on the colours: red X, green Y, blue Z, the same as the
  grid's axis lines.
- **Example** — "Tap the face marked **TOP +Z** to look straight down at the grid. The red face marked **RIGHT +X** points along
  the grid's red line, so after tapping it you are looking back toward the origin from the +X side."
- **Media** — refresh `docs/screenshots/orientation-gizmo.png` and `.dark`, `docs/media/orientation-gizmo-snap.gif` and `.dark`,
  and every still and GIF with the cube in frame. Do the GIFs one at a time through a scoped run. `docs:gifs` rewrites every GIF,
  so never use it to refresh one movie.

## Affected files

- `src/components/viewport/OrientationGizmo.vue` — a label inside each face button. Update the doc comment that says
  "unlabelled".
- `src/styles/themes/dark.css`, `light.css`, and each `src/styles/skins/*.css` that sets `--axis-x`/`--axis-y` — add `--axis-z`
  (blue).
- `src/styles/tokens.spec.js` — add `--axis-z` to `EXISTING_TOKENS`/`THEMED` as appropriate.
- `src/render/viewCube.spec.js` — the label orientation check below.
- `src/components/viewport/OrientationGizmo.spec.js` — the label and colour checks.

## Proposed fix

These are reversible defaults taken while writing the task. The owner's words were "axis text and colors", and the alternatives
are listed at the end.

1. **Colour.** Keep the lit-from-above shading, because it is what makes the cube read as solid. Tint each face toward its axis
   colour: `--face-fill: color-mix(in srgb, var(--axis-x) 30%, var(--view-cube-right))`, and the same for the others. Supported in
   Safari 16.2+, Firefox 113+ and Chrome 111+. Tune the percentage by eye in both themes and every skin. Each pair of opposite faces
   must still look like the same axis, and the top must still read as the lightest face.
2. **Text.** Inside each face button, add a `<span class="gizmo__face-label">` with the name over the signed axis. Make the span
   `aria-hidden="true"`, because the button's existing `aria-label` already says it. The span sits in the face's own coordinates,
   so the face's `matrix()` skews it with the face the way a printed label would, and per-frame cost stays at zero (CLAUDE.md
   16 ms budget: nothing new is written per camera move). The text colour comes from tokens and must have 4.5:1 contrast against its
   tinted fill. Check this in both themes.
3. **Upright, unmirrored.** Each label must read upright and not mirrored when its own face is snapped square-on (Top in the Top
   view, and so on), and at the Home view for TOP, FRONT and RIGHT. Add a `viewCube.spec.js` case that pins it: for each face,
   the affine at its own view has a positive determinant and maps the label's +y to screen-up. If a face's local axes come out
   rotated, fix them in `viewCube.js`, not with a CSS counter-rotation.
4. **Edge-on faces.** These are already hidden below the depth threshold. Check that a nearly edge-on face's squashed label doesn't
   spill outside its face (`overflow: hidden` on the face).

**Alternatives not taken:** (a) axis letters only, with no face names. That is more compact, but "Front" is the word a user looks
for. (b) A small red, green and blue axis triad drawn at one corner of the cube, as Fusion does. At the Home view the nearest
corner is (+X, −Y, +Z), so its edges would point along −X, +Y and −Z, which reads backwards. It could be added later at the
origin corner if the owner wants it.

## Testing

- **Unit**: `viewCube.spec.js` (label orientation, above). `OrientationGizmo.spec.js`: every face has its name and signed axis,
  and its fill uses the right `--axis-*` token. `tokens.spec.js`: `--axis-z` is defined in both themes and every skin.
- **E2E**: `e2e/orientation-tap.e2e.js` and `e2e/viewport-scaffold.e2e.js` on all three engines (DOM text under a 2D `matrix()`
  can render differently in WebKit), with a gizmo snapshot at each viewport. Read a face's label text after a snap to Top, Front
  and Right.
- **Re-run closed findings**: `ui-158` (every face still snaps, hidden faces still take no taps), `ui-025` (orientation gizmo label
  legibility: the triad's labels had a contrast finding, and this re-raises it).
- **Acceptance**: re-drive scenario 7 step 5 at tablet and phone with touch only. Before tapping, name the face aloud by its label.

## Effort

M

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
