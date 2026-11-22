---
title: Viewport.vue's script is still 819 lines and pointerGestures.js 781; take the next three slices
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-20 as the remainder of ui-144
depends: []
status: done
---

> **What shipped (2026-11-22).** `Viewport.vue`'s script went from 819 to 593 lines (under 600); `pointerGestures.js` from 781 to 655. Extractions: `render/referencePhotoTaps.js`, `render/sketchHover.js` (slice 1); `composables/useGizmoHandlers.js` (slice 2); `render/sketchControllers.js`, `render/sceneThemeSync.js`, `composables/useViewportContext.js`, `useViewportPlacement.js`, `useViewportBodies.js` (slice 3, plus the theme helpers), each with a `.spec.js`. `sketchControllers` takes `isTextEntry` as a dependency because `render/` must not import `composables/`. The file header comment was also shortened (23 to 13 lines) to land under 600. `pointerGestures.js` stays above the roughly 600 guide: what is left is the gesture-kind decision, orbit, pan, pinch and the press, move and release handlers, which share the press bookkeeping and cannot be split without passing it around.

## Problem

`ui-144` ran the three extractions its file named (the reactive overlay structures, the mount and unmount sequence, raycast
picking and the marquee) and closed on 2026-11-20 **without reaching its target**: the `<script setup>` of
`src/components/viewport/Viewport.vue` is 819 lines against under 600 (964 before), and `src/render/pointerGestures.js` is 781
against the roughly 600-line guide (963 before). What is left in `Viewport.vue` is controller dependency wiring (about twenty
`createX({...})` blocks), about 75 import lines, the gizmo handlers with the toolbar keep-out, and the theme helpers; it is not
template bindings, so this is not a "stop here" case.

## Affected files

- `src/components/viewport/Viewport.vue`
- `src/render/pointerGestures.js` (new `src/render/referencePhotoTaps.js` or similar beside it)
- `src/composables/` (a `useGizmoHandlers`, and factory composables that group the sketch controllers)

## Proposed fix

Same method as `ui-108` and `ui-144`: one extraction per commit, no behaviour change, a diff review of each moved function, and a
`.spec.js` beside each new module.

1. Move Set scale's and Auto-trace's taps and drags (`beginScaleDrag`, `updateScaleDrag`, `endScaleDrag`, `scaleTap`, `traceTap`)
   and the sketch hover (`hoverSketchSnap`, `onSnapShiftKey`, `clearSketchHover`) out of `pointerGestures.js`: about 130 lines.
2. Move the four gizmo handlers and `refreshToolbarKeepOut` into a `useGizmoHandlers` that takes the gizmo drag, the selected
   body, the transform commands, `syncBodies` and the pointer's `pickAt`: about 65 lines.
3. Group the sketch controllers (`createSketchSnap`, `createSketchHandles`, `createSketchDraw`, `createSketchPathSync`,
   `createSketchPreview`) and their wiring into one `createSketchControllers` factory, and the body and placement wiring likewise.
4. Measure again. Stop when the script is under 600 lines, or say plainly which lines remain and why.

## Effort

M.

## Testing

- A `.spec.js` beside each new module.
- No new E2E spec: the behaviour must not change. Run the rotating pair after each slice and `npm run test:e2e:full` on the last
  one.
- Acceptance scenarios to re-drive: 1, 4, 6, 7 and 9. Closed findings whose reproductions re-run: `ui-012`, `ui-013`,
  `sketch-006`, `ui-049`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
