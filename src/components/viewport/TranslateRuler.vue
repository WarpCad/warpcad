<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The translate ruler (`TODO/ui-065`): drawn along a translate arm's screen
 * line while that arm is dragged, plus a screen-aligned distance readout.
 *
 * - **Bar and ticks** along the arm, from where the drag began, every fifth
 *   tick labelled with its signed distance from the start.
 * - **Start mark**, dim, a cross-bar fixed at the drag's start.
 * - **Live marker**, the arm's arrowhead convention, at the distance moved,
 *   pointing the way it went.
 * - **Span**, the band between the two, so "how far" is an area to read.
 * - **Readout**: the signed distance to 0.1 mm, and the active step underneath.
 *
 * Rendered inside `Gizmo.vue`'s SVG and kept out of that template so the gizmo
 * stays under CLAUDE.md's ~30-line extraction rule, as `RotateDial.vue` was.
 * Presentation only: every coordinate comes from `src/render/annotate.js`
 * (`updateRulerAnnotation`/`placeRulerReadout`) and every string from
 * `src/render/translateSnap.js`. The geometry, including which way the ruler
 * runs, is unit-tested there in plain Node.
 *
 * Test ids are all `gizmo-ruler-*`. Never `gizmo-arm-*`, `gizmo-head-*`,
 * `gizmo-grab-*` or `gizmo-ring-*`: e2e specs count matches on those prefixes.
 */
import { computed } from 'vue'

import {
  RULER_READOUT_FONT_PX,
  RULER_READOUT_HEIGHT_PX,
  RULER_READOUT_WIDTH_PX,
} from '../../render/annotate.js'
import { formatDistanceMm, stepLabelMm } from '../../render/translateSnap.js'

const props = defineProps({
  /** A `RulerAnnotation`, mutated in place by the viewport's render callback. */
  ruler: { type: Object, required: true },
  /** The arm's axis colour — a CSS colour or `var(--…)`. */
  color: { type: String, required: true },
})

/** @type {import('vue').ComputedRef<import('../../render/annotate.js').RulerAnnotation>} */
const r = computed(() => /** @type {any} */ (props.ruler))

/**
 * Tick labels: the signed distance from the start, without the unit (the
 * readout carries it). Built per frame from at most eight labelled ticks.
 *
 * @param {number} valueMm
 * @returns {string}
 */
function tickLabel(valueMm) {
  const text = String(Number(valueMm.toFixed(1)))
  return valueMm > 0 ? `+${text}` : text
}

/** Points strings, rebuilt per frame like every other `points` in the gizmo. */
const spanPoints = computed(() =>
  r.value.span.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '),
)
const headPoints = computed(() =>
  r.value.liveHead.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '),
)

const valueText = computed(() => formatDistanceMm(r.value.distanceMm))
const stepText = computed(() => stepLabelMm(r.value.stepMm))

const HALF_W = RULER_READOUT_WIDTH_PX / 2
const HALF_H = RULER_READOUT_HEIGHT_PX / 2
/** Second line's size: smaller than the value, still ≥ 14 px. */
const STEP_FONT_PX = 14
</script>

<template>
  <g
    class="truler"
    data-testid="gizmo-ruler"
    :data-axis="r.axis"
    :data-degenerate="r.degenerate ? 'true' : 'false'"
    :data-distance-mm="r.distanceMm"
    :data-step-mm="r.stepMm"
    :data-tick-mm="r.tickMm"
  >
    <polygon
      v-if="r.spanVisible"
      class="truler__span"
      data-testid="gizmo-ruler-span"
      :points="spanPoints"
      :fill="color"
    />
    <!-- End-on, the line is a sliver and the ticks would pile up: only the
         live marker and the readout are drawn (see `updateRulerAnnotation`). -->
    <template v-if="!r.degenerate">
      <line
        class="truler__bar"
        data-testid="gizmo-ruler-bar"
        :x1="r.barX1"
        :y1="r.barY1"
        :x2="r.barX2"
        :y2="r.barY2"
        :stroke="color"
      />
      <template v-for="(tick, index) in r.ticks" :key="`tick-${index}`">
        <line
          v-if="index < r.tickCount"
          class="truler__tick"
          :class="{ 'truler__tick--labelled': tick.labelled }"
          :data-testid="`gizmo-ruler-tick-${index}`"
          :x1="tick.x1"
          :y1="tick.y1"
          :x2="tick.x2"
          :y2="tick.y2"
          :stroke="color"
        />
        <text
          v-if="index < r.tickCount && tick.labelled"
          class="truler__label"
          :x="tick.labelX"
          :y="tick.labelY"
          :fill="color"
        >{{ tickLabel(tick.valueMm) }}</text>
      </template>
      <line
        class="truler__start"
        data-testid="gizmo-ruler-start"
        :x1="r.markX1"
        :y1="r.markY1"
        :x2="r.markX2"
        :y2="r.markY2"
        :stroke="color"
      />
    </template>
    <polygon class="truler__marker" data-testid="gizmo-ruler-marker" :points="headPoints" :fill="color" />

    <!-- Screen-aligned, placed by `placeRulerReadout`, inside the viewport. -->
    <g
      class="truler__readout"
      data-testid="gizmo-ruler-readout"
      :data-value="valueText"
      :data-step="stepText"
      :transform="`translate(${r.readoutX.toFixed(1)} ${r.readoutY.toFixed(1)})`"
    >
      <rect
        class="truler__pill"
        :x="-HALF_W"
        :y="-HALF_H"
        :width="HALF_W * 2"
        :height="HALF_H * 2"
        :rx="12"
        :stroke="color"
      />
      <text
        class="truler__value"
        data-testid="gizmo-ruler-value"
        :y="stepText ? -7 : 0"
        :font-size="RULER_READOUT_FONT_PX"
      >{{ valueText }}</text>
      <text
        v-if="stepText"
        class="truler__step"
        data-testid="gizmo-ruler-step"
        :y="14"
        :font-size="STEP_FONT_PX"
      >{{ stepText }}</text>
    </g>
  </g>
</template>

<style scoped>
.truler {
  pointer-events: none;
}

.truler__span {
  fill-opacity: 0.22;
  stroke: none;
}

.truler__bar {
  stroke-width: 1.25;
  stroke-opacity: 0.6;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.truler__tick {
  stroke-width: 1;
  stroke-opacity: 0.7;
  vector-effect: non-scaling-stroke;
}

.truler__tick--labelled {
  stroke-width: 1.75;
  stroke-opacity: 0.95;
}

.truler__label {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-anchor: middle;
  dominant-baseline: central;
  opacity: 0.85;
}

.truler__start {
  stroke-width: 2;
  stroke-opacity: 0.5;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.truler__marker {
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3));
}

.truler__pill {
  fill: var(--surface-glass, var(--surface-1));
  stroke-width: 1.5;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
}

.truler__value,
.truler__step {
  fill: var(--text-1);
  text-anchor: middle;
  dominant-baseline: central;
  font-variant-numeric: tabular-nums;
}

.truler__value {
  font-weight: 600;
}

.truler__step {
  fill: var(--text-2);
}
</style>
