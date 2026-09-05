<script setup>
/**
 * The grid's on-screen dimension labelling.
 *
 * The grid's *lines* are built in `src/render/grid.js` and added to the scene by
 * `src/render/scene.js` — geometry math stays out of components, per CLAUDE.md
 * ("a component doing coordinate math beyond laying out its own pixels is a bug
 * waiting to happen"). What this component owns is the half of CLAUDE.md's grid
 * rule that the 3D lines can't satisfy on their own: "enough labeling (an axis
 * ruler, a scale readout, or an on-hover dimension) that a user can read
 * real-world size off the grid without opening the inspector."
 *
 * It renders a live scale bar — a bar of a round millimetre length, redrawn as
 * the camera dollies — plus a static legend naming the minor/major spacing.
 */
import { computed } from 'vue'
import { chooseScaleBar } from '../../render/camera.js'

const props = defineProps({
  /** World millimetres per screen pixel at the camera target plane. */
  mmPerPixel: { type: Number, required: true },
  /** Minor (base) grid spacing in mm. */
  minorMm: { type: Number, required: true },
  /** Major grid spacing in mm. */
  majorMm: { type: Number, required: true },
  /** Widest the scale bar may be drawn, in px. */
  maxBarPx: { type: Number, default: 110 },
})

const bar = computed(() => chooseScaleBar(props.mmPerPixel, props.maxBarPx))
</script>

<template>
  <div class="readout" data-testid="grid-scale-readout" :data-scale-mm="bar.lengthMm">
    <div class="readout__bar-row">
      <div
        class="readout__bar"
        data-testid="grid-scale-bar"
        :style="{ width: `${Math.round(bar.lengthPx)}px` }"
        aria-hidden="true"
      />
      <span class="readout__bar-label" data-testid="grid-scale-label">{{ bar.label }}</span>
    </div>
    <p class="readout__legend" data-testid="grid-legend">
      Grid <strong>{{ minorMm }} mm</strong> · major <strong>{{ majorMm }} mm</strong>
    </p>
    <p class="readout__sr">
      Scale bar represents {{ bar.label }}. Minor grid lines are {{ minorMm }} millimetres apart;
      bold major lines are {{ majorMm }} millimetres apart.
    </p>
  </div>
</template>

<style scoped>
.readout {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
  pointer-events: none;
}

.readout__bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.readout__bar {
  height: 8px;
  min-width: 8px;
  border: 1px solid var(--text-2);
  border-top: none;
  border-radius: 0 0 2px 2px;
}

.readout__bar-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-1);
}

.readout__legend {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-2);
}

.readout__legend strong {
  color: var(--text-1);
  font-weight: 600;
}

.readout__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 480px) {
  .readout {
    right: 8px;
    bottom: 8px;
    padding: 6px 8px;
  }

  .readout__legend {
    font-size: 10px;
  }
}
</style>
