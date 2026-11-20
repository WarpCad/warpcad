<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { rightFromSpherical, upFromSpherical, positionFromSpherical } from '../../render/camera.js'
import { nearestCapView, CAP_RADIUS_FRACTION } from '../../render/orientationHit.js'
import { usePanelLayoutStore } from '../../stores/panelLayout.js'

const props = defineProps({
  azimuthDeg: { type: Number, required: true },
  elevationDeg: { type: Number, required: true },
  /**
   * Whether snapping is currently unavailable (`TODO/ui-020`, kept by `TODO/sketch-001`:
   * the sketch editor owns the camera orientation while it is open).
   *
   * The triad keeps drawing — it is still the honest readout of where the
   * camera is looking, and that reassurance is exactly what a user wants while
   * locked to the working plane. Only its *snap* buttons go dead, because
   * snapping to Front mid-sketch would turn the sketch plane edge-on and make
   * drawing silently impossible: a screen-point ray parallel to the plane has
   * no intersection, so every drag would land nowhere with no explanation.
   */
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['snap'])

/**
 * The chrome tier (`TODO/ui-084`): `compact` on a narrow viewport pane, from the layout store.
 * Compact is the existing ≤ 480px form (96px dial, 30px caps, caption hidden); the phone keeps that
 * media query and reports `full`. The caps keep their titles, so the hidden az/el caption loses no
 * function — the triad itself shows the orientation.
 */
const panelLayout = usePanelLayoutStore()
const chromeTier = computed(() => panelLayout.layout.chromeTier)

const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 })
/**
 * Cap placement is a fraction of the dial (`CAP_RADIUS_FRACTION`, 34 of the SVG's 100 units), so the
 * caps spread out when a touch layout enlarges the dial (`TODO/ui-134`). A fixed pixel radius would
 * leave six bigger caps in the same space, overlapping more.
 */
const RADIUS = CAP_RADIUS_FRACTION * 100

/**
 * How far the visible spoke line extends past its own cap's anchor point
 * (TODO/ui-025). The cap buttons stay anchored at `RADIUS` — unchanged, so the
 * existing touch-target floor and the mobile `@media` breakpoint's own cap
 * sizing are untouched — but the colored spoke itself is drawn to
 * `RADIUS * SPOKE_SCALE`, so a short tail of color pokes out past the cap's
 * outer edge into the dial's remaining margin. Both endpoints live in the same
 * `viewBox="-50 -50 100 100"` coordinate space, so this scales identically at
 * every breakpoint rather than needing a separate mobile constant.
 */
const SPOKE_SCALE = 1.42

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
      x: ax * basisRight.x + ay * basisRight.y + az * basisRight.z,
      y: -(ax * basisUp.x + ay * basisUp.y + az * basisUp.z),
      // Positive depth means the axis points toward the viewer.
      depth: ax * toCamera.x + ay * toCamera.y + az * toCamera.z,
    }
  })
})

/** Painter's order: far caps first, so near caps draw on top of them. */
const capsByDepth = computed(() => [...caps.value].sort((a, b) => a.depth - b.depth))

/** @type {import('vue').Ref<HTMLElement | null>} */
const dialEl = ref(null)

/**
 * A pointer click resolves to the cap whose centre is nearest the tap, not the topmost box, so a
 * fingertip in an overlap fires the cap it aimed at (`TODO/ui-134`). A keyboard click (`detail` 0)
 * and a click that lands on the cap already nearest pass through untouched.
 * @param {MouseEvent} event
 */
function onDialClickCapture(event) {
  if (props.disabled || event.detail === 0 || !dialEl.value) return
  if (touchPicker.value && lastPointerType === 'touch') {
    event.stopPropagation()
    pickerOpen.value = !pickerOpen.value
    return
  }
  const rect = dialEl.value.getBoundingClientRect()
  const view = nearestCapView(caps.value, rect.width, {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  })
  if (view === null) return
  const hit = event.target instanceof Element ? event.target.closest('[data-view]') : null
  if (hit && hit.getAttribute('data-view') === view) return
  event.stopPropagation()
  emit('snap', view)
}

/**
 * The phone touch picker (`TODO/ui-148`). A 96px dial cannot hold six caps a fingertip can tell apart
 * (neighbours 23px apart under about 13px of scatter), and a bigger dial does not fit beside the
 * Operations toolbar. So on a coarse pointer under 600px a touch tap on the compact dial opens a large
 * 3x2 picker of the six faces (no gaps between cells, so a tap always lands on one), and picking closes
 * it. A mouse, pen or keyboard click keeps snapping straight from the dial's caps.
 */
const TOUCH_PICKER_QUERY = '(pointer: coarse) and (max-width: 599.98px)'
const touchPicker = ref(false)
const pickerOpen = ref(false)
/** The pointer type of the press that precedes a click; a click event does not carry it everywhere. */
let lastPointerType = ''
/** @type {MediaQueryList | null} */
let touchPickerMql = null

function syncTouchPicker() {
  touchPicker.value = !!touchPickerMql?.matches
}
onMounted(() => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  touchPickerMql = window.matchMedia(TOUCH_PICKER_QUERY)
  syncTouchPicker()
  touchPickerMql.addEventListener?.('change', syncTouchPicker)
})
onBeforeUnmount(() => {
  touchPickerMql?.removeEventListener?.('change', syncTouchPicker)
  document.removeEventListener('pointerdown', onOutsidePointerDown, true)
})
watch([touchPicker, () => props.disabled], ([on, off]) => {
  if (!on || off) pickerOpen.value = false
})
watch(pickerOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onOutsidePointerDown, true)
  else document.removeEventListener('pointerdown', onOutsidePointerDown, true)
})

/** @type {import('vue').Ref<HTMLElement | null>} */
const pickerEl = ref(null)

/** @param {PointerEvent} event */
function onOutsidePointerDown(event) {
  if (pickerEl.value && event.target instanceof Node && !pickerEl.value.contains(event.target)) pickerOpen.value = false
}

/** @param {PointerEvent} event */
function onDialPointerDown(event) {
  lastPointerType = event.pointerType
}

/**
 * The six faces in the picker's reading order, with the names the picker prints.
 * @type {ReadonlyArray<{view: string, name: string, label: string}>}
 */
const PICKER_FACES = Object.freeze([
  { view: 'top', name: 'Top', label: 'Z' },
  { view: 'front', name: 'Front', label: '−Y' },
  { view: 'right', name: 'Right', label: 'X' },
  { view: 'bottom', name: 'Bottom', label: '−Z' },
  { view: 'back', name: 'Back', label: 'Y' },
  { view: 'left', name: 'Left', label: '−X' },
])

/** @param {string} view a face name, or 'home' */
function pick(view) {
  pickerOpen.value = false
  emit('snap', view)
}

const orientationLabel = computed(
  () => `${Math.round(props.azimuthDeg)}° az · ${Math.round(props.elevationDeg)}° el`,
)
</script>

<template>
  <div
    class="gizmo"
    data-testid="orientation-gizmo"
    :data-disabled="disabled ? 'true' : 'false'"
    :data-azimuth="azimuthDeg.toFixed(2)"
    :data-elevation="elevationDeg.toFixed(2)"
    :data-chrome-tier="chromeTier"
    :data-touch-picker="touchPicker ? 'true' : 'false'"
    :data-picker-open="touchPicker && pickerOpen ? 'true' : 'false'"
  >
    <div
      ref="dialEl"
      class="gizmo__dial"
      data-testid="orientation-dial"
      role="group"
      aria-label="Camera orientation"
      :title="touchPicker && !disabled ? 'Tap to pick a view' : undefined"
      @pointerdown.capture="onDialPointerDown"
      @click.capture="onDialClickCapture"
    >
      <svg class="gizmo__svg" viewBox="-50 -50 100 100" aria-hidden="true">
        <line
          v-for="cap in capsByDepth"
          :key="cap.view"
          class="gizmo__spoke"
          :class="{ 'gizmo__spoke--negative': !cap.positive }"
          x1="0"
          y1="0"
          :x2="cap.x * RADIUS * SPOKE_SCALE"
          :y2="cap.y * RADIUS * SPOKE_SCALE"
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
          left: `${50 + cap.x * RADIUS}%`,
          top: `${50 + cap.y * RADIUS}%`,
          zIndex: Math.round((cap.depth + 1) * 10) + 1,
        }"
        :data-testid="`gizmo-view-${cap.view}`"
        :data-view="cap.view"
        :data-depth="cap.depth.toFixed(3)"
        :disabled="disabled"
        :title="disabled ? 'Camera orientation is locked to the working plane while sketching' : cap.title"
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
      :disabled="disabled"
      title="Home view (isometric)"
      aria-label="Home view (isometric)"
      @click="emit('snap', 'home')"
    >
      Home
    </button>
    <p class="gizmo__caption" data-testid="gizmo-orientation-label">{{ orientationLabel }}</p>

    <div
      v-if="touchPicker && pickerOpen"
      ref="pickerEl"
      class="gizmo__picker"
      data-testid="gizmo-picker"
      role="group"
      aria-label="Pick a view"
      @keydown.esc="pickerOpen = false"
    >
      <p class="gizmo__picker-head" data-testid="gizmo-picker-label">Views · {{ orientationLabel }}</p>
      <div class="gizmo__picker-grid">
        <button
          v-for="face in PICKER_FACES"
          :key="face.view"
          type="button"
          class="gizmo__picker-cell"
          :data-testid="`gizmo-picker-view-${face.view}`"
          :aria-label="`${face.name} view`"
          @click="pick(face.view)"
        >
          <span class="gizmo__picker-name">{{ face.name }}</span>
          <span class="gizmo__picker-axis">{{ face.label }}</span>
        </button>
      </div>
      <div class="gizmo__picker-foot">
        <button type="button" class="gizmo__picker-home" data-testid="gizmo-picker-home" aria-label="Home view (isometric)" @click="pick('home')">Home</button>
        <button type="button" class="gizmo__picker-close" data-testid="gizmo-picker-close" aria-label="Close view picker" @click="pickerOpen = false">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Visibly unavailable rather than silently inert, per CLAUDE.md's rule that a
   control whose precondition does not hold is disabled, not dead. */
.gizmo[data-disabled='true'] .gizmo__cap,
.gizmo[data-disabled='true'] .gizmo__home {
  opacity: 0.4;
  cursor: not-allowed;
}

.gizmo {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
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
  fill: var(--accent);
}

.gizmo__cap {
  position: absolute;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  transform: translate(-50%, -50%);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-round);
  /* Translucent rather than opaque (TODO/ui-025): the spoke passing underneath
     a cap stays partially visible through it instead of being fully occluded. */
  background: color-mix(in srgb, var(--surface-2) 62%, transparent);
  backdrop-filter: blur(1px);
  color: var(--text-1);
  font: 600 11px/1 var(--font-mono);
  cursor: pointer;
  touch-action: manipulation;
}

.gizmo__cap--negative {
  /* Recede further than the positive caps (TODO/ui-025) — smaller opacity and
     an outline-only fill — so the six caps stop reading as six equal-weight
     buttons and the solid positive-axis triad reads as the dominant element. */
  background: color-mix(in srgb, var(--surface-1) 28%, transparent);
  border-style: dashed;
  color: var(--text-3);
  opacity: 0.7;
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
  font-size: var(--text-size-xs);
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
  font-size: var(--text-size-2xs);
  color: var(--text-3);
}

/* The compact form (`TODO/ui-084`): the ≤ 480px rules below, keyed on the chrome tier as well.
   Keep this block and the media block in step. */
.gizmo[data-chrome-tier='compact'] {
  top: 8px;
  right: 8px;
  padding: var(--space-2);
}

.gizmo[data-chrome-tier='compact'] .gizmo__dial {
  width: 96px;
  height: 96px;
}

.gizmo[data-chrome-tier='compact'] .gizmo__cap {
  width: 30px;
  height: 30px;
  font-size: var(--text-size-2xs);
}

.gizmo[data-chrome-tier='compact'] .gizmo__caption {
  display: none;
}

/* Touch layout at tablet width and up (`TODO/ui-134`): a 190px dial so six 44px caps stay clear of each
   other and a fingertip (about 13px of scatter) lands on the cap it aimed at. Keyed like the compact
   rules so it wins. Not on a phone: 390px cannot hold this dial beside the Operations toolbar
   (`TODO/ui-148`), so the phone keeps the 96px dial and the nearest-cap tap resolution only. */
@media (pointer: coarse) and (min-width: 600px) {
  .gizmo[data-chrome-tier] .gizmo__dial {
    width: 190px;
    height: 190px;
  }

  .gizmo[data-chrome-tier] .gizmo__cap {
    width: 44px;
    height: 44px;
    font-size: var(--text-size-xs);
  }

  .gizmo[data-chrome-tier] .gizmo__home {
    min-height: 44px;
  }
}

/* The phone touch picker (`TODO/ui-148`): an overlay anchored to the gizmo's top-right corner that
   covers the dial while open. Six 68x64px cells with no gap, so every tap inside lands on a cell. */
/* While the picker is open the whole gizmo paints above the Operations toolbar it overlaps. */
.gizmo[data-picker-open='true'] {
  z-index: calc(var(--z-canvas-overlay) + 4);
}

.gizmo__picker {
  position: absolute;
  top: 0;
  right: 0;
  z-index: var(--z-popover);
  width: max-content;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-overlay);
}

.gizmo__picker-head {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-size-2xs);
  color: var(--text-3);
  text-align: center;
}

.gizmo__picker-grid {
  display: grid;
  grid-template-columns: repeat(3, 68px);
  grid-auto-rows: 64px;
}

.gizmo__picker-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 0;
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: var(--text-size-sm);
  font-weight: var(--weight-medium);
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}

.gizmo__picker-cell:active,
.gizmo__picker-cell:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

.gizmo__picker-axis {
  font: 500 var(--text-size-2xs) / 1 var(--font-mono);
  color: var(--text-3);
}

.gizmo__picker-foot {
  display: flex;
  gap: var(--space-2);
}

.gizmo__picker-home,
.gizmo__picker-close {
  flex: 1;
  min-height: 44px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: var(--text-size-xs);
  cursor: pointer;
  touch-action: manipulation;
}

@media (max-width: 480px) {
  .gizmo {
    top: 8px;
    right: 8px;
    padding: var(--space-2);
  }

  .gizmo__dial {
    width: 96px;
    height: 96px;
  }

  .gizmo__cap {
    width: 30px;
    height: 30px;
    font-size: var(--text-size-2xs);
  }

  .gizmo__caption {
    display: none;
  }
}
</style>
