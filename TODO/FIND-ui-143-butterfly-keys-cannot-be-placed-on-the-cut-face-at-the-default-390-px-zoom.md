---
title: A Butterfly key cannot be placed by tapping the cut face at 390 px until the view is zoomed, and nothing says why
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-17 from VERIFY.md core-075 stage 2 #2 (TODO/testing-044)
depends: []
status: open
---

## Problem

The `testing-029` cold readers could not place a Butterfly on the 390 px cut plane: taps near the edge did nothing and
no marker appeared, so the marker's look could not be judged (VERIFY.md `core-075` stage 2 #2).

Reproduced 2026-11-17 (`testing-044`), dev server, Chromium 390x844, real mouse, the e2e plank (300 x 40 x 12 mm), right
view, **Split…**, offset 150, **Place connectors by hand**, kind **Butterfly**:

- At the default framing (cut face 2.27 px/mm, 91 x 27 px) **ten taps** on and near the top edge (u -16 to 14, v 6 to
  11.9, including 0.1 mm from the edge) place **no marker**, and the hint line stays *Tap near an edge of the cut plane to
  drop a butterfly key on that face; it snaps to the edge.* No message says why.
- After wheel-zooming to 3.57 px/mm (the range `e2e/print-prep-keys.e2e.js` zooms to first), the tap at (u -6, v 9)
  places the marker, snapped to the top edge (`data-v-mm` 12.00).

The e2e spec always zooms first, so it never sees the default framing, and on a phone a person has to pinch before the
first tap works without being told to. The placed glyph is a small horizontal bowtie, about 16 px wide, on the top edge,
with the remove button above it; it is the same orientation for every edge (it does not turn to match the edge), which at
that size reads as a bowtie but not as a key lying along the face.

## Affected files

- `src/components/viewport/` (the manual-joint cut-plane overlay; tap hit-testing and its minimum scale)
- `src/render/` or `src/core/` helper that decides a tap is "near an edge" (check whether the tolerance is in pixels)
- `e2e/print-prep-keys.e2e.js` (add a no-zoom phone case)

## Proposed fix

Find why a tap near the edge is rejected at 2.27 px/mm (suspect a pixel tolerance or a minimum key size in pixels) and
make the decision in millimetres, or when the face is too small to place on, show a line: *Zoom in to place a key* (and
zoom the view to the face when the manual-joints box is ticked on a phone). Rotate the butterfly glyph to the edge it
snapped to, or draw it larger at phone scale.

## Effort

S.

## Testing

- App-level `*.e2e.js` at `/`, phone viewport, no wheel zoom first: tapping the top edge with the Butterfly kind places
  a marker (or shows the zoom message). All three engines (a tap on the cut face over the WebGL canvas), the three
  viewports.
- Re-run VERIFY.md `core-075` stage 2 #2 and `core-075` stage 1 #3 (the kind row). Closed finding: `core-075` stages 1 to 4.
- Acceptance scenarios: none name Split by hand.

## Interaction model

- **Precondition:** one body selected, **Split…** open, **Place connectors by hand** ticked, a kind chosen.
- **Trigger:** a tap near an edge of the cut face.
- **Feedback:** a marker at the snapped place, or one line saying why not.
- **Small-screen behavior:** this finding is about it.

## Documentation

`docs/print-prep.md`: one sentence, *On a phone, zoom to the cut face first*, if the fix is the message.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
