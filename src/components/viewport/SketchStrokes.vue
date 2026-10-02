<script setup>
/**
 * The sketch editor's outlines on the sketch plane (`TODO/sketch-001`): every profile in
 * the draft, the live outline being dragged out, and — for Revolve and Helical — the axis.
 *
 * ## Why an SVG overlay and not lines in the scene
 *
 * A thin, bright, single-colour stroke is exactly what an SVG path is, with no material to
 * tune, and the role/state styling (a dashed Hole, an amber open outline, a ghosted
 * inactive slice) is CSS on theme tokens — legible in light and dark without colour alone
 * carrying the meaning. Paths are re-projected from the same orbit state the WebGL frame
 * used (`src/render/annotate.js`'s `updateSketchPath`), so they stay glued to the plane.
 *
 * ## It never takes a pointer event
 *
 * The whole overlay is `pointer-events: none`. ui-020's acceptance drive found what an
 * invisible fat hit-stroke over the canvas does: it swallows the press, so a drag started
 * on a drawn line drew nothing — a dead strip across the viewport. Picking an outline is
 * done in sketch millimetres by `Viewport.vue` (`profileAtPoint`), so the canvas keeps
 * every gesture.
 *
 * ## No maths here
 *
 * Every number comes from `Viewport.vue` via `annotate.js`; this file lays out pixels.
 */
import { computed } from 'vue'

const props = defineProps({
  /**
   * One entry per outline in the draft: `{ key, id, sliceIndex, role, closed, open,
   * active, selected, visible, d, badgeX, badgeY }`.
   */
  paths: { type: Array, required: true },
  /** The outline being dragged out right now: `{ visible, d, closed }`. */
  draft: { type: Object, required: true },
  /** The revolve axis for Revolve/Helical: `{ visible, d }`. */
  axis: { type: Object, required: true },
})

/** @type {import('vue').ComputedRef<any[]>} */
const list = computed(() => /** @type {any[]} */ (props.paths))
</script>

<template>
  <svg class="sketch" data-testid="sketch-strokes" :data-path-count="paths.length" :data-drafting="draft.visible ? 'true' : 'false'">
    <path v-if="axis.visible" class="sketch__axis" data-testid="sketch-axis" :d="axis.d" />
    <template v-for="path in list" :key="path.key">
      <path
        v-show="path.visible"
        class="sketch__path"
        :class="{
          'sketch__path--hole': path.role === 'hole',
          'sketch__path--open': path.open,
          'sketch__path--ghost': !path.active,
          'sketch__path--selected': path.selected,
        }"
        :data-testid="path.active ? `sketch-profile-${path.id}` : `sketch-ghost-${path.sliceIndex}-${path.id}`"
        :data-profile-id="path.id"
        :data-role="path.role"
        :data-closed="path.closed ? 'true' : 'false'"
        :data-selected="path.selected ? 'true' : 'false'"
        :data-slice="path.sliceIndex"
        :d="path.d"
      />
      <text
        v-if="path.visible && path.selected && path.role === 'hole'"
        class="sketch__badge"
        data-testid="sketch-hole-badge"
        :x="path.badgeX"
        :y="path.badgeY"
      >
        hole
      </text>
    </template>
    <path v-show="draft.visible" class="sketch__path sketch__path--draft" data-testid="sketch-draft" :d="draft.d" />
  </svg>
</template>

<style scoped>
.sketch {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.sketch__path {
  fill: none;
  stroke: var(--sketch-stroke);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* A Hole is dashed, so Solid vs Hole never rests on colour alone. */
.sketch__path--hole {
  stroke-dasharray: 7 5;
}

/* An open chain is not part of the solid: amber, and the toolbar says so in words. */
.sketch__path--open {
  stroke: var(--warn);
}

/* Inactive slices stay visible as a faint stack, so a wing's ribs read as a whole. */
.sketch__path--ghost {
  stroke-opacity: 0.35;
  stroke-width: 1.25;
}

.sketch__path--selected {
  stroke: var(--accent);
  stroke-width: 2.75;
}

.sketch__path--draft {
  stroke-dasharray: 4 4;
  stroke-opacity: 0.9;
}

.sketch__axis {
  fill: none;
  stroke: var(--text-3);
  stroke-width: 1.25;
  stroke-dasharray: 10 4 2 4;
}

.sketch__badge {
  fill: var(--accent);
  font-size: 11px;
  font-weight: 650;
  paint-order: stroke;
  stroke: var(--surface-0);
  stroke-width: 3;
}
</style>
