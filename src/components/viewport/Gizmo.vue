<script setup>
/**
 * The transform gizmo: three translate arrows and three rotate rings, attached
 * to the selected body's origin.
 *
 * **Visual only in this task** (`TODO/ui-011`). The handles show where the
 * body's axes are and that it is the thing about to be moved; making them
 * draggable — and keeping that drag in sync with the Inspector's numeric fields
 * — is `ui-012`'s whole contract. Wiring half of it here would leave two
 * half-owners of the same behaviour, so this component listens for no pointer
 * events at all and is explicitly `pointer-events: none`: a gizmo that swallowed
 * clicks would break the click-to-select this task exists to respond to.
 *
 * ## Screen-space SVG, like the rest of the viewport's chrome
 *
 * `render-001` established DOM/SVG overlays for the grid readout and the
 * orientation triad, and CLAUDE.md is explicit about not introducing a second
 * overlay technology alongside them. There is a second reason: an SVG gizmo is
 * assertable by an `*.e2e.js` spec on all three engines without pixel-picking a
 * WebGL canvas, which is what a WebGL-sensitive surface needs coverage for.
 *
 * ## No maths here
 *
 * Every number this draws comes from `src/render/annotate.js`, which is
 * framework-free and unit-tested in plain Node — CLAUDE.md: "a component doing
 * coordinate math beyond laying out its own pixels is a bug waiting to happen."
 * This file lays out pixels.
 */
import { computed } from 'vue'

import { createRingPoints, ringPoints } from '../../render/annotate.js'

const props = defineProps({
  /**
   * A `GizmoAnnotation` from `src/render/annotate.js`, mutated in place by the
   * viewport's render callback rather than replaced per frame.
   */
  annotation: { type: Object, required: true },
})

/**
 * The prop, named at its type boundary. `defineProps` in a plain-JS SFC widens
 * to `Object`, so this is where the shape is stated once instead of every
 * template expression re-asserting it.
 *
 * @type {import('vue').ComputedRef<import('../../render/annotate.js').GizmoAnnotation>}
 */
const gizmo = computed(() => /** @type {any} */ (props.annotation))

/**
 * Axis colours reuse the viewport's own axis tokens, so X is X everywhere.
 * @type {Readonly<Record<string, string>>}
 */
const AXIS_STROKE = Object.freeze({
  X: 'var(--axis-x)',
  Y: 'var(--axis-y)',
  Z: 'var(--accent)',
})

/**
 * Point buffers, allocated once per ring and reused for the life of the
 * component — the projection itself allocates nothing, per CLAUDE.md's
 * Performance rule.
 *
 * The `points` *strings* below are the one thing rebuilt per frame: SVG geometry
 * attributes are strings, so any DOM overlay pays this, and the existing grid
 * readout and orientation triad already do. Three short strings per frame is
 * nursery churn, not the multi-megabyte typed-array traffic that rule is about.
 */
const ringBuffers = [createRingPoints(), createRingPoints(), createRingPoints()]

const ringPaths = computed(() =>
  gizmo.value.rings.map((ring, index) => {
    const points = ringPoints(ring, gizmo.value.originX, gizmo.value.originY, ringBuffers[index])
    let path = ''
    for (const point of points) path += `${point.x.toFixed(2)},${point.y.toFixed(2)} `
    return { axis: ring.axis, points: path.trimEnd() }
  }),
)
</script>

<template>
  <svg
    v-if="gizmo.visible"
    class="tgizmo"
    data-testid="transform-gizmo"
    :data-origin="`${gizmo.originX.toFixed(1)},${gizmo.originY.toFixed(1)}`"
    aria-hidden="true"
  >
    <!-- Rotate rings first, so the translate arrows draw on top of them. -->
    <polygon
      v-for="ring in ringPaths"
      :key="`ring-${ring.axis}`"
      class="tgizmo__ring"
      :data-testid="`gizmo-ring-${ring.axis.toLowerCase()}`"
      :points="ring.points"
      :stroke="AXIS_STROKE[ring.axis]"
    />

    <g v-for="arrow in gizmo.arrows" :key="`arm-${arrow.axis}`">
      <template v-if="arrow.visible">
        <line
          class="tgizmo__arm"
          :data-testid="`gizmo-arm-${arrow.axis.toLowerCase()}`"
          :x1="gizmo.originX"
          :y1="gizmo.originY"
          :x2="arrow.tipX"
          :y2="arrow.tipY"
          :stroke="AXIS_STROKE[arrow.axis]"
        />
        <polygon
          class="tgizmo__head"
          :data-testid="`gizmo-head-${arrow.axis.toLowerCase()}`"
          :points="`${arrow.tipX},${arrow.tipY} ${arrow.h1x},${arrow.h1y} ${arrow.h2x},${arrow.h2y}`"
          :fill="AXIS_STROKE[arrow.axis]"
        />
      </template>
    </g>

    <circle
      class="tgizmo__hub"
      data-testid="gizmo-hub"
      :cx="gizmo.originX"
      :cy="gizmo.originY"
      r="3.5"
    />
  </svg>
</template>

<style scoped>
.tgizmo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  /* The gizmo is not interactive in this task, and it sits directly over the
     bodies the user clicks to select — swallowing those clicks would break the
     very trigger it is the feedback for. */
  pointer-events: none;
}

.tgizmo__ring {
  fill: none;
  stroke-width: 1.5;
  stroke-opacity: 0.55;
  /* Keeps the stroke a real width even where a ring is seen almost edge-on. */
  vector-effect: non-scaling-stroke;
}

.tgizmo__arm {
  stroke-width: 2.5;
  stroke-linecap: round;
}

.tgizmo__hub {
  fill: var(--text-1);
  stroke: var(--surface-0);
  stroke-width: 1.5;
}
</style>
