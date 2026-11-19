---
title: Make the Objects-list hover tint clearly visible on light-blue and default bodies
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-17 from OWNER.md Q8 (VERIFY.md ui-049 #1)
depends: []
status: done
---

> **What shipped (2026-11-19):** one constant. `HOVER_HIGHLIGHT_INTENSITY` in `src/render/mesh.js` went from 0.45 to 0.9; no token or `bodyMeshes.js` change was needed because the tint is the emissive term of the hover material. New `e2e/objects-hover-tint.e2e.js` (RED first: 5.5 light) asserts dE00 >= 10 hover vs unhovered and >= 25 vs selected on the default body in both schemes. Measured 18.9 dark / 14.6 light and 42.9 / 47.9. The docs have no sentence about the hover tint, so none changed.

## Problem

Hovering a row in the Inspector's Objects list tints its body violet so you can see which body the row is
(`src/render/bodyMeshes.js`, the hover tint painted by `paintBodies`, plus x-ray twins). On light bodies the
change is too faint. Measured 2026-11-14 on this Mac's GPU (`testing-030`, headed Chrome, production build),
ΔE00 hover vs. unhovered, where ≥ 10 reads as clearly different: light-blue body 6.9 dark / 5.3 light, default
body 7.7 / 6.2, red body 25.5 / 24.0. Hover vs. the amber selection is 35-41, so selection is not at risk. Two
cold readers split on the light-blue body. The owner chose to strengthen it (OWNER.md Q8, 2026-11-17).

## Affected files

- `src/render/bodyMeshes.js` (hover tint strength, ~lines 150-170 and 380-400)
- The hover colour token in `src/styles/tokens.css`, if the tint reads it
- `e2e/` hover spec (search `hover` in the Objects list specs)

## Proposed fix

Raise the tint's strength (or mix toward a more saturated violet) so hover vs. unhovered is ΔE00 ≥ 10 on the
light-blue and default bodies in both themes, while hover vs. selected stays ≥ 25. Keep the red body readable
(it is already 24-25). No new control.

## Effort

S.

## Testing

- An e2e that hovers a list row and samples the body's pixels before and after, asserting ΔE00 ≥ 10 for the
  default body in dark and light (reuse `testing-030`'s ΔE measurement approach). All three engines (WebGL).
- Re-run VERIFY.md `ui-049` #1's measurement; set the row `OK` with the new numbers.
- Acceptance scenarios: 6 (selection). Closed finding regression: `ui-049`'s hover reproduction.

## Interaction model

No new control. **Feedback** changes: the hovered row's body tint is stronger. Small-screen behaviour: same
(touch has no hover; a tapped row selects).

## Documentation

- **Page**: the Objects list section of the Inspector docs: check that its sentence about hover still matches.
  No new media unless a docs still shows a hover.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
