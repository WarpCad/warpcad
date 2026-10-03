<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The selected outline's point handles (`TODO/sketch-002`): a dot on every point, and a
 * smaller hollow dot on the middle of every segment long enough to hold one.
 *
 * ## Drawn small, hit big — and never by this element
 *
 * Each handle is a **44 px touch target** drawn as a small dot. The target is not an SVG
 * shape: the overlay is `pointer-events: none`, exactly like `SketchStrokes.vue`, because
 * ui-020 finding #1 was a hit shape over the canvas swallowing the draw gesture. The
 * 22 px-radius hit test runs in `Viewport.vue` on `pointerdown`, against the same screen
 * positions drawn here, so the canvas keeps every press and a press on a stroke *between*
 * handles still draws.
 *
 * Midpoint dots are left out by `Viewport.vue` on segments shorter than two targets
 * (88 px on screen), so a dense traced outline doesn't become a wall of handles.
 *
 * Shown only while **Select** is armed: a drawing tool's press always draws, even on a
 * dense outline whose dot targets would otherwise cover its whole stroke.
 *
 * No maths here: every position comes from `Viewport.vue` via `annotate.js`.
 */
import { computed } from 'vue'

const props = defineProps({
  /** `{ vertices: { index, x, y, xMm, yMm, selected, hover }[], midpoints: { segment, x, y }[] }`. */
  handles: { type: Object, required: true },
})

/** @type {import('vue').ComputedRef<any[]>} */
const vertices = computed(() => /** @type {any[]} */ (props.handles.vertices))
/** @type {import('vue').ComputedRef<any[]>} */
const midpoints = computed(() => /** @type {any[]} */ (props.handles.midpoints))
</script>

<template>
  <svg
    class="handles"
    data-testid="sketch-vertex-handles"
    :data-vertex-count="vertices.length"
    :data-midpoint-count="midpoints.length"
    data-target-px="44"
  >
    <circle
      v-for="mid in midpoints"
      :key="`m${mid.segment}`"
      class="handles__mid"
      :data-testid="`sketch-midpoint-${mid.segment}`"
      :cx="mid.x"
      :cy="mid.y"
      r="4"
    />
    <circle
      v-for="vertex in vertices"
      :key="`v${vertex.index}`"
      class="handles__vertex"
      :class="{ 'handles__vertex--selected': vertex.selected, 'handles__vertex--hover': vertex.hover && !vertex.selected }"
      :data-testid="`sketch-vertex-${vertex.index}`"
      :data-selected="vertex.selected ? 'true' : 'false'"
      :data-hover="vertex.hover ? 'true' : 'false'"
      :data-x-mm="vertex.xMm.toFixed(3)"
      :data-y-mm="vertex.yMm.toFixed(3)"
      :cx="vertex.x"
      :cy="vertex.y"
      :r="vertex.selected || vertex.hover ? 7 : 5.5"
    />
  </svg>
</template>

<style scoped>
.handles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.handles__vertex {
  fill: var(--surface-0);
  stroke: var(--accent);
  stroke-width: 2;
}

/* A selected point is filled, so "this one" never rests on colour alone. */
.handles__vertex--selected {
  fill: var(--accent);
  stroke: var(--surface-0);
}

.handles__vertex--hover {
  fill: var(--accent);
  fill-opacity: 0.45;
}

.handles__mid {
  fill: var(--surface-0);
  fill-opacity: 0.85;
  stroke: var(--accent);
  stroke-width: 1.5;
  stroke-dasharray: 2 2;
}
</style>
