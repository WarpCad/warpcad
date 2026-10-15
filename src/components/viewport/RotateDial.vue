<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The rotate dial (`TODO/ui-064`): a watchface drawn in a rotate ring's own
 * plane while that ring is dragged, plus a screen-aligned digital readout.
 *
 * - **Ticks** every 15° of turn, longer every 45°, labelled 0/90/180/270
 *   counting from the grab.
 * - **Start hand**, dim, fixed at the grab. **Live hand**, bright with an
 *   arrowhead, at grab + turned.
 * - **Sector**, the wedge between the hands, so "how far" is an area to read,
 *   not two lines to compare.
 * - **Readout**: the signed turned angle to 0.1°, and the active step underneath.
 *
 * Rendered inside `Gizmo.vue`'s SVG and kept out of that template so the
 * gizmo stays under CLAUDE.md's ~30-line extraction rule. Presentation only:
 * every coordinate comes from `src/render/annotate.js`
 * (`updateDialAnnotation`/`placeDialReadout`) and every string from
 * `src/render/rotateSnap.js`. The geometry, including which way the hands
 * turn, is unit-tested there in plain Node.
 *
 * Test ids are all `gizmo-dial-*`. Never `gizmo-ring-*`, `gizmo-core-ring-*`,
 * `gizmo-rotate-arrow-*` or `gizmo-grab-*`: e2e specs count matches on those
 * prefixes, and `ui-022` already shipped one rename after a collision.
 */
import { computed } from 'vue'

import { DIAL_READOUT_FONT_PX, DIAL_READOUT_HEIGHT_PX, DIAL_READOUT_WIDTH_PX } from '../../render/annotate.js'
import { formatTurnDeg, stepLabel } from '../../render/rotateSnap.js'

const props = defineProps({
  /** A `DialAnnotation`, mutated in place by the viewport's render callback. */
  dial: { type: Object, required: true },
  /** The ring's axis colour — a CSS colour or `var(--…)`. */
  color: { type: String, required: true },
})

/** @type {import('vue').ComputedRef<import('../../render/annotate.js').DialAnnotation>} */
const d = computed(() => /** @type {any} */ (props.dial))

/**
 * The sector polygon: hub, then the arc. Rebuilt per frame like every other
 * `points` string in the gizmo (SVG geometry attributes are strings).
 */
const sectorPoints = computed(() => {
  let path = `${d.value.originX.toFixed(2)},${d.value.originY.toFixed(2)}`
  for (const point of d.value.sector) path += ` ${point.x.toFixed(2)},${point.y.toFixed(2)}`
  return path
})

const headPoints = computed(() => {
  const [a, b, c] = d.value.liveHead
  return `${a.x.toFixed(2)},${a.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)} ${c.x.toFixed(2)},${c.y.toFixed(2)}`
})

const valueText = computed(() => formatTurnDeg(d.value.turnedDeg))
const stepText = computed(() => stepLabel(d.value.stepDeg))

const HALF_W = DIAL_READOUT_WIDTH_PX / 2
const HALF_H = DIAL_READOUT_HEIGHT_PX / 2
/** Second line's size: smaller than the value, still ≥ 14 px. */
const STEP_FONT_PX = 14
</script>

<template>
  <g
    class="rdial"
    data-testid="gizmo-dial"
    :data-axis="d.axis"
    :data-degenerate="d.degenerate ? 'true' : 'false'"
    :data-turned-deg="d.turnedDeg"
    :data-step-deg="d.stepDeg"
  >
    <polygon
      v-if="d.sectorVisible"
      class="rdial__sector"
      data-testid="gizmo-dial-sector"
      :points="sectorPoints"
      :fill="color"
    />
    <!-- Edge-on, the ticks would pile onto one line: only the live hand and
         the readout are drawn (see `updateDialAnnotation`). -->
    <template v-if="!d.degenerate">
      <line
        v-for="(tick, index) in d.ticks"
        :key="`tick-${index}`"
        class="rdial__tick"
        :class="{ 'rdial__tick--major': tick.major }"
        :data-testid="`gizmo-dial-tick-${index}`"
        :x1="tick.x1"
        :y1="tick.y1"
        :x2="tick.x2"
        :y2="tick.y2"
        :stroke="color"
      />
      <text
        v-for="(label, index) in d.labels"
        :key="`label-${index}`"
        class="rdial__label"
        :data-testid="`gizmo-dial-label-${label.text}`"
        :x="label.x"
        :y="label.y"
        :fill="color"
      >{{ label.text }}</text>
      <line
        class="rdial__hand rdial__hand--start"
        data-testid="gizmo-dial-start-hand"
        :x1="d.originX"
        :y1="d.originY"
        :x2="d.startX"
        :y2="d.startY"
        :stroke="color"
      />
    </template>
    <line
      class="rdial__hand rdial__hand--live"
      data-testid="gizmo-dial-hand"
      :x1="d.originX"
      :y1="d.originY"
      :x2="d.liveX"
      :y2="d.liveY"
      :stroke="color"
    />
    <polygon class="rdial__head" data-testid="gizmo-dial-hand-head" :points="headPoints" :fill="color" />

    <!-- Screen-aligned, not in the ring's plane: text skewed onto an ellipse
         is unreadable. Placed by `placeDialReadout`, inside the viewport. -->
    <g
      class="rdial__readout"
      data-testid="gizmo-dial-readout"
      :data-value="valueText"
      :data-step="stepText"
      :transform="`translate(${d.readoutX.toFixed(1)} ${d.readoutY.toFixed(1)})`"
    >
      <rect
        class="rdial__pill"
        :x="-HALF_W"
        :y="-HALF_H"
        :width="HALF_W * 2"
        :height="HALF_H * 2"
        :rx="12"
        :stroke="color"
      />
      <text
        class="rdial__value"
        data-testid="gizmo-dial-value"
        :y="stepText ? -7 : 0"
        :font-size="DIAL_READOUT_FONT_PX"
      >{{ valueText }}</text>
      <text
        v-if="stepText"
        class="rdial__step"
        data-testid="gizmo-dial-step"
        :y="14"
        :font-size="STEP_FONT_PX"
      >{{ stepText }}</text>
    </g>
  </g>
</template>

<style scoped>
.rdial {
  pointer-events: none;
}

.rdial__sector {
  fill-opacity: 0.16;
  stroke: none;
}

.rdial__tick {
  stroke-width: 1;
  stroke-opacity: 0.7;
  vector-effect: non-scaling-stroke;
}

.rdial__tick--major {
  stroke-width: 1.75;
  stroke-opacity: 0.95;
}

.rdial__label {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-anchor: middle;
  dominant-baseline: central;
  opacity: 0.85;
}

.rdial__hand {
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.rdial__hand--start {
  stroke-width: 1.25;
  stroke-opacity: 0.45;
}

.rdial__hand--live {
  stroke-width: 2.5;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3));
}

.rdial__pill {
  fill: var(--surface-glass, var(--surface-1));
  stroke-width: 1.5;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
}

.rdial__value,
.rdial__step {
  fill: var(--text-1);
  text-anchor: middle;
  dominant-baseline: central;
  font-variant-numeric: tabular-nums;
}

.rdial__value {
  font-weight: 600;
}

.rdial__step {
  fill: var(--text-2);
}
</style>
