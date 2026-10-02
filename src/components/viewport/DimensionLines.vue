<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The selected body's three on-canvas dimension lines — one per axis, each an
 * extension line, arrowheads and a numeric millimetre label.
 *
 * **Always all three at once**, per `docs/decisions/interaction-model-qa.md`
 * control 3 Q10: "§7b is explicit that this is always all three at once, never a
 * single collapsed number." A single overall size readout would be a different,
 * lesser thing — the point is that a user can read the part's X, Y and Z extents
 * off the screen without opening a panel, which is the same rule CLAUDE.md
 * applies to the grid.
 *
 * ## Screen-space SVG, like the rest of the viewport's chrome
 *
 * `render-001` established DOM/SVG overlays (`Grid.vue`,
 * `OrientationGizmo.vue`, `NavigationChrome.vue`) and CLAUDE.md's own note on
 * this task says not to introduce a second overlay technology for a third one.
 * It also makes the numbers assertable by an `*.e2e.js` spec on all three
 * engines without pixel-picking a WebGL canvas.
 *
 * ## No maths here
 *
 * Which of the box's four parallel edges gets dimensioned, how far the line is
 * offset clear of the solid, and where the arrowheads sit are all computed in
 * `src/render/annotate.js` — framework-free, unit-tested in plain Node, per
 * CLAUDE.md's "geometry logic belongs in `src/core/`, not in components". This
 * file lays out pixels.
 */

import { computed } from 'vue'

const props = defineProps({
  /**
   * Three `DimensionAnnotation`s from `src/render/annotate.js`, mutated in place
   * by the viewport's render callback rather than replaced per frame.
   */
  annotations: { type: Array, required: true },
})

/**
 * The prop, named at its type boundary — see `Gizmo.vue` for why this alias
 * exists rather than a `PropType` annotation.
 *
 * @type {import('vue').ComputedRef<import('../../render/annotate.js').DimensionAnnotation[]>}
 */
const dimensions = computed(() => /** @type {any} */ (props.annotations))

/**
 * Colour per axis — and, since `TODO/ui-023`, per the **body's own** axis rather
 * than the world's once the body is turned.
 *
 * That is the labelling call `ui-023` had to make, and it is deliberate: a
 * rotated part's "length" stays the same coloured, same lettered number however
 * the part is turned or the camera orbited, which is what makes it readable at
 * all and what every CAD tool does. Colouring by *world* axis instead would mean
 * a tilted cylinder's diameter changed colour as it turned, and would put the
 * red line on a number that is no longer the part's width.
 *
 * The letters and colours stay the same three, and stay matched to the
 * Inspector's own Size X/Y/Z row (which reads the identical local measurement),
 * so panel and overlay can never quote different numbers for the same part. The
 * transform gizmo remains a **global-mode** gizmo drawn on world axes — an
 * ordinary CAD pairing, and out of scope for this finding by its own note.
 *
 * `data-frame` on each group says which of the two a given line is in, so the
 * distinction is assertable rather than implied.
 *
 * @type {Readonly<Record<string, string>>}
 */
const AXIS_STROKE = Object.freeze({
  X: 'var(--axis-x)',
  Y: 'var(--axis-y)',
  Z: 'var(--accent)',
})

/**
 * Arrowhead points as an SVG polygon list.
 *
 * @param {{ x: number, y: number }[]} head
 * @returns {string}
 */
function headPoints(head) {
  return head.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
}

const visibleCount = () => dimensions.value.filter((annotation) => annotation.visible).length
</script>

<template>
  <svg
    class="dims"
    data-testid="dimension-lines"
    :data-axis-count="visibleCount()"
    aria-hidden="true"
  >
    <g
      v-for="annotation in dimensions"
      :key="annotation.axis"
      v-show="annotation.visible"
      class="dims__axis"
      :data-testid="`dimension-${annotation.axis.toLowerCase()}`"
      :data-length-mm="annotation.lengthMm.toFixed(3)"
      :data-label="annotation.label"
      :data-frame="annotation.frame"
      :stroke="AXIS_STROKE[annotation.axis]"
    >
      <!-- Extension lines: they tie the number to the two corners it measures. -->
      <line
        class="dims__extension"
        :x1="annotation.a1x"
        :y1="annotation.a1y"
        :x2="annotation.e1x"
        :y2="annotation.e1y"
      />
      <line
        class="dims__extension"
        :x1="annotation.a2x"
        :y1="annotation.a2y"
        :x2="annotation.e2x"
        :y2="annotation.e2y"
      />

      <line
        class="dims__line"
        :x1="annotation.x1"
        :y1="annotation.y1"
        :x2="annotation.x2"
        :y2="annotation.y2"
      />

      <polygon
        class="dims__head"
        :points="headPoints(annotation.h1)"
        :fill="AXIS_STROKE[annotation.axis]"
      />
      <polygon
        class="dims__head"
        :points="headPoints(annotation.h2)"
        :fill="AXIS_STROKE[annotation.axis]"
      />

      <text
        class="dims__label"
        :data-testid="`dimension-label-${annotation.axis.toLowerCase()}`"
        :x="annotation.labelX"
        :y="annotation.labelY"
        :fill="AXIS_STROKE[annotation.axis]"
      >
        {{ annotation.label }}
      </text>
    </g>
  </svg>
</template>

<style scoped>
.dims {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  /* Annotation, not a control: it must never eat a click meant for the body
     underneath it, which is the trigger this whole overlay is feedback for. */
  pointer-events: none;
}

.dims__extension {
  stroke-width: 1;
  stroke-dasharray: 3 3;
  stroke-opacity: 0.7;
}

.dims__line {
  stroke-width: 1.5;
}

.dims__head {
  stroke: none;
}

.dims__label {
  font-family: var(--font-mono);
  font-size: 11px;
  text-anchor: middle;
  dominant-baseline: middle;
  /* A halo in the viewport's own ground colour, so the number stays readable
     over the solid, over the grid, and in either colour scheme. */
  stroke: var(--surface-0);
  stroke-width: 3.5;
  paint-order: stroke fill;
}

@media (max-width: 480px) {
  .dims__label {
    font-size: 10px;
  }
}
</style>
