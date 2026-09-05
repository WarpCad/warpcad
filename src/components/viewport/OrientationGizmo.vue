<script setup>
/**
 * Orientation gizmo — a live axis triad in a fixed screen-space corner.
 *
 * CLAUDE.md's viewport rule: the gizmo "shows the current camera orientation and
 * can itself be clicked/tapped to snap to a standard view." Both halves are here:
 * the triad re-projects as the camera orbits, and each axis cap is a real button
 * that snaps the camera to the view looking down that axis.
 *
 * It is a DOM/SVG overlay, not an object in world space (CLAUDE.md's component
 * categories put gizmo/nav chrome in `viewport/` as screen-space overlays). That
 * also makes every face independently tappable and assertable by an e2e spec
 * without pixel-picking a WebGL canvas.
 *
 * Z-up mapping, per CLAUDE.md's convention — the axis you click is the axis the
 * camera ends up *on*: +Z → top (looking straight down Z), −Y → front, +X →
 * right. Sign flips here are exactly the easy bug, so `src/render/camera.js`'s
 * spec pins every one of these orientations.
 */
import { computed } from 'vue'
import { rightFromSpherical, upFromSpherical, positionFromSpherical } from '../../render/camera.js'

const props = defineProps({
  azimuthDeg: { type: Number, required: true },
  elevationDeg: { type: Number, required: true },
})

const emit = defineEmits(['snap'])

const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 })
const RADIUS = 33

/** Module-scope scratch so re-projection allocates no vectors. */
const basisRight = { x: 0, y: 0, z: 0 }
const basisUp = { x: 0, y: 0, z: 0 }
const toCamera = { x: 0, y: 0, z: 0 }

/** @type {ReadonlyArray<{view: string, label: string, axis: [number, number, number], positive: boolean, title: string}>} */
const AXES = Object.freeze([
  { view: 'right', label: 'X', axis: [1, 0, 0], positive: true, title: 'Right view (camera on +X)' },
  { view: 'left', label: '−X', axis: [-1, 0, 0], positive: false, title: 'Left view (camera on −X)' },
  { view: 'back', label: 'Y', axis: [0, 1, 0], positive: true, title: 'Back view (camera on +Y)' },
  { view: 'front', label: '−Y', axis: [0, -1, 0], positive: false, title: 'Front view (camera on −Y)' },
  { view: 'top', label: 'Z', axis: [0, 0, 1], positive: true, title: 'Top view (looking straight down Z)' },
  { view: 'bottom', label: '−Z', axis: [0, 0, -1], positive: false, title: 'Bottom view (camera on −Z)' },
])

const caps = computed(() => {
  rightFromSpherical(props.azimuthDeg, props.elevationDeg, basisRight)
  upFromSpherical(props.azimuthDeg, props.elevationDeg, basisUp)
  positionFromSpherical(props.azimuthDeg, props.elevationDeg, 1, ORIGIN, toCamera)

  return AXES.map((entry) => {
    const [ax, ay, az] = entry.axis
    return {
      ...entry,
      // Screen-space projection of the world axis onto the camera basis. SVG's
      // Y grows downward, hence the negated up component.
      x: (ax * basisRight.x + ay * basisRight.y + az * basisRight.z) * RADIUS,
      y: -(ax * basisUp.x + ay * basisUp.y + az * basisUp.z) * RADIUS,
      // Positive depth means the axis points toward the viewer.
      depth: ax * toCamera.x + ay * toCamera.y + az * toCamera.z,
    }
  })
})

/** Painter's order: far caps first, so near caps draw on top of them. */
const capsByDepth = computed(() => [...caps.value].sort((a, b) => a.depth - b.depth))

const orientationLabel = computed(
  () => `${Math.round(props.azimuthDeg)}° az · ${Math.round(props.elevationDeg)}° el`,
)
</script>

<template>
  <div
    class="gizmo"
    data-testid="orientation-gizmo"
    :data-azimuth="azimuthDeg.toFixed(2)"
    :data-elevation="elevationDeg.toFixed(2)"
  >
    <div class="gizmo__dial" role="group" aria-label="Camera orientation">
      <svg class="gizmo__svg" viewBox="-50 -50 100 100" aria-hidden="true">
        <line
          v-for="cap in capsByDepth"
          :key="cap.view"
          class="gizmo__spoke"
          :class="{ 'gizmo__spoke--negative': !cap.positive }"
          x1="0"
          y1="0"
          :x2="cap.x"
          :y2="cap.y"
          :stroke="cap.label.includes('X') ? 'var(--axis-x)' : cap.label.includes('Y') ? 'var(--axis-y)' : 'var(--accent)'"
        />
        <circle class="gizmo__hub" cx="0" cy="0" r="2.5" />
      </svg>

      <button
        v-for="cap in capsByDepth"
        :key="cap.view"
        type="button"
        class="gizmo__cap"
        :class="{ 'gizmo__cap--negative': !cap.positive }"
        :style="{
          left: `calc(50% + ${cap.x}px)`,
          top: `calc(50% + ${cap.y}px)`,
          zIndex: Math.round((cap.depth + 1) * 10) + 1,
        }"
        :data-testid="`gizmo-view-${cap.view}`"
        :data-depth="cap.depth.toFixed(3)"
        :title="cap.title"
        :aria-label="cap.title"
        @click="emit('snap', cap.view)"
      >
        <span>{{ cap.label }}</span>
      </button>
    </div>

    <button
      type="button"
      class="gizmo__home"
      data-testid="gizmo-view-home"
      title="Home view (isometric)"
      aria-label="Home view (isometric)"
      @click="emit('snap', 'home')"
    >
      Home
    </button>
    <p class="gizmo__caption" data-testid="gizmo-orientation-label">{{ orientationLabel }}</p>
  </div>
</template>

<style scoped>
.gizmo {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
}

.gizmo__dial {
  position: relative;
  width: 116px;
  height: 116px;
}

.gizmo__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.gizmo__spoke {
  stroke-width: 2.5;
  stroke-linecap: round;
}

.gizmo__spoke--negative {
  opacity: 0.35;
  stroke-dasharray: 4 4;
}

.gizmo__hub {
  fill: var(--text-3);
}

.gizmo__cap {
  position: absolute;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  transform: translate(-50%, -50%);
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text-1);
  font: 600 11px/1 var(--font-mono);
  cursor: pointer;
  touch-action: manipulation;
}

.gizmo__cap--negative {
  background: var(--surface-1);
  color: var(--text-3);
}

.gizmo__cap:hover,
.gizmo__cap:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

.gizmo__home {
  width: 100%;
  min-height: 28px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 11px;
  cursor: pointer;
  touch-action: manipulation;
}

.gizmo__home:hover,
.gizmo__home:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

.gizmo__caption {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
}

@media (max-width: 480px) {
  .gizmo {
    top: 8px;
    right: 8px;
    padding: 4px;
  }

  .gizmo__dial {
    width: 96px;
    height: 96px;
  }

  .gizmo__cap {
    width: 30px;
    height: 30px;
    font-size: 10px;
  }

  .gizmo__caption {
    display: none;
  }
}
</style>
