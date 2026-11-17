---
title: Finish shrinking Viewport.vue's script and split pointerGestures.js
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-17 as the remainder of ui-108
depends: []
status: open
---

## Problem

`ui-108` moved Viewport.vue's interaction logic into controllers over seven slices and was closed on
2026-11-17 with its own target missed: the `<script setup>` of `src/components/viewport/Viewport.vue` is
still 964 lines against the under-600 target, measured after slice 7 (commit `0e23af74`). What is left is
mostly wiring, not interaction logic:

- the block of `ref`, `reactive` and `let` declarations at the top of the script (the overlay and
  annotation structures the template reads, the sketch and snap overlays, the banner state);
- the `onMounted` body (building the viewport, registering the drop target and the key listeners, the
  first sync) and `onBeforeUnmount`;
- the small bridge functions that forward a call to a controller (`syncOverlay`, `syncSketchPaths`,
  `measure`, `onThemeChange`, the gizmo handle handlers).

Separately, `src/render/pointerGestures.js` is 938 lines, over the roughly 600-line guide. Picking and the
marquee are the natural split.

## Affected files

- `src/components/viewport/Viewport.vue`
- `src/render/pointerGestures.js` (new `src/render/picking.js` or `marquee.js` beside it)
- `src/composables/` (a `useViewportOverlays` that allocates the reactive overlay structures)

## Proposed fix

Same method as `ui-108`: one extraction per commit, no behaviour change, a diff against the original for each
moved function, and a `.spec.js` beside each new module.

1. Move the reactive overlay declarations into a composable that returns them, so the component only
   destructures.
2. Move the mount and unmount sequence into a `useViewportLifecycle` that takes the controllers as arguments.
3. Split picking and the marquee out of `pointerGestures.js`.

Stop when the script is under 600 lines or the remaining lines are only the template's own bindings. Say which in
the closing note rather than forcing the number.

## Effort

M (three extractions).

## Testing

- A `.spec.js` beside each new module.
- No new E2E spec: the behaviour must not change. Run the rotating pair after each slice and
  `npm run test:e2e:full` on the last one.
- Acceptance scenarios to re-drive: 1, 4, 6, 7 and 9. Closed findings whose reproductions re-run: `ui-012`,
  `ui-013`, `sketch-006`, `ui-049`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
