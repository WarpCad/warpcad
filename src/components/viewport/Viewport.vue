<script setup>
/**
 * The 3D viewport: a WebGL canvas plus its screen-space overlays.
 *
 * Two things about the shape of this component are deliberate:
 *
 * 1. **One camera, two input paths.** Pointer drags and the on-screen
 *    `NavigationChrome` buttons call the *same* `src/render/camera.js` model.
 *    There is no second camera state anywhere, which is what stops the
 *    chrome and the gesture drifting apart (TODO/render-001's Proposed fix).
 * 2. **Nothing hot is reactive.** The orbit camera, the three.js viewport and
 *    the pointer bookkeeping are plain, non-reactive variables — CLAUDE.md's
 *    Performance section is explicit that Vue's deep reactivity has no business
 *    walking render-path state. Pointer handlers touch numbers only and allocate
 *    nothing; the reactive overlay state (`overlay`) is written at most **once
 *    per animation frame**, from inside the render callback, so a fast drag
 *    can't push a DOM update per pointer event.
 *
 * Rendering is on demand: a frame is scheduled when something actually changes,
 * rather than a permanently-spinning rAF loop burning battery on a static scene.
 */
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import Grid from './Grid.vue'
import OrientationGizmo from './OrientationGizmo.vue'
import NavigationChrome from './NavigationChrome.vue'
import { createOrbitCamera } from '../../render/camera.js'
import { createViewport } from '../../render/scene.js'

/** Degrees of orbit per pixel of drag. */
const ORBIT_DEG_PER_PX = 0.4
/** Degrees of orbit per press of a direction button. */
const ORBIT_STEP_DEG = 15
/** Pixels of pan per press of a direction button. */
const PAN_STEP_PX = 60
/** Multiplier per press of a zoom button. */
const ZOOM_STEP = 1.25

/**
 * Resolve the viewport palette from the OS/browser colour scheme. Dark is
 * primary; light follows `prefers-color-scheme` (CLAUDE.md's UI convention),
 * and the *canvas* has to follow it too — light chrome around a hardcoded dark
 * scene reads as a rendering bug.
 *
 * @returns {'dark' | 'light'}
 */
function preferredTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const rootEl = ref(/** @type {HTMLElement | null} */ (null))
const canvasEl = ref(/** @type {HTMLCanvasElement | null} */ (null))

/** @type {import('vue').Ref<'orbit' | 'pan'>} */
const dragMode = ref('orbit')
const theme = ref(preferredTheme())
const webglError = ref('')
const isDragging = ref(false)

/** Reactive mirror of the camera, refreshed once per rendered frame. */
const overlay = reactive({
  azimuthDeg: 0,
  elevationDeg: 0,
  distanceMm: 0,
  /** `x,y,z` in mm — the point the camera orbits and pans around. */
  target: '0,0,0',
  mmPerPixel: 0,
  minorMm: 10,
  majorMm: 50,
})

// --- non-reactive render state -------------------------------------------

const orbit = createOrbitCamera()
/** @type {import('../../render/scene.js').Viewport | null} */
let viewport = null
/** @type {ResizeObserver | null} */
let resizeObserver = null
/** @type {MediaQueryList | null} */
let themeQuery = null
let rafId = 0
let widthPx = 0
let heightPx = 0
let frameCount = 0

// Pointer bookkeeping. Entries are allocated on pointerdown and mutated in
// place on move, so pointermove itself allocates nothing.
/** @type {Map<number, { x: number, y: number }>} */
const pointers = new Map()
let primaryId = -1
let secondaryId = -1
let pinchDistancePx = 0

const framesRendered = shallowRef(0)

function scheduleRender() {
  if (rafId) return
  rafId = requestAnimationFrame(renderFrame)
}

function renderFrame() {
  rafId = 0
  if (viewport) {
    try {
      viewport.render(orbit)
    } catch (error) {
      webglError.value = `WebGL rendering stopped: ${String(error)}`
      viewport = null
    }
  }
  frameCount += 1
  framesRendered.value = frameCount
  syncOverlay()
}

function syncOverlay() {
  overlay.azimuthDeg = orbit.state.azimuthDeg
  overlay.elevationDeg = orbit.state.elevationDeg
  overlay.distanceMm = orbit.state.distanceMm
  const t = orbit.state.target
  overlay.target = `${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}`
  overlay.mmPerPixel = orbit.getMmPerPixel(heightPx)
}

function measure() {
  const el = rootEl.value
  if (!el) return
  widthPx = el.clientWidth
  heightPx = el.clientHeight
  viewport?.setSize(widthPx, heightPx)
  scheduleRender()
}

// --- pointer input --------------------------------------------------------

/**
 * @param {number} dx horizontal pixels travelled
 * @param {number} dy vertical pixels travelled (screen-down positive)
 */
function applyDrag(dx, dy) {
  if (dragMode.value === 'pan') orbit.panByPixels(dx, dy, heightPx)
  // Dragging "grabs" the scene: pulling right swings the camera left, pulling
  // down tips the top of the scene toward the viewer.
  else orbit.orbit(-dx * ORBIT_DEG_PER_PX, dy * ORBIT_DEG_PER_PX)
  scheduleRender()
}

/** @param {PointerEvent} event */
function onPointerDown(event) {
  const canvas = canvasEl.value
  if (!canvas) return
  try {
    canvas.setPointerCapture?.(event.pointerId)
  } catch {
    // Capture is an optimisation, not a requirement — and it throws outright on
    // a pointer id the browser doesn't consider active (synthetic events in
    // tests, some assistive tooling). Losing capture only means a drag ends when
    // the pointer leaves the canvas.
  }
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (primaryId === -1) primaryId = event.pointerId
  else if (secondaryId === -1) {
    secondaryId = event.pointerId
    pinchDistancePx = pointerSeparation()
  }
  isDragging.value = true
}

function pointerSeparation() {
  const a = pointers.get(primaryId)
  const b = pointers.get(secondaryId)
  if (!a || !b) return 0
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** @param {PointerEvent} event */
function onPointerMove(event) {
  const previous = pointers.get(event.pointerId)
  if (!previous) return
  const dx = event.clientX - previous.x
  const dy = event.clientY - previous.y
  previous.x = event.clientX
  previous.y = event.clientY
  if (dx === 0 && dy === 0) return

  if (pointers.size >= 2) {
    // Two-finger gesture: pinch to zoom, and drag to pan regardless of the
    // active drag mode — the standard touch idiom, and the only way to zoom by
    // gesture on a device with no wheel.
    const separation = pointerSeparation()
    if (separation > 0 && pinchDistancePx > 0) {
      orbit.dolly(pinchDistancePx / separation)
      pinchDistancePx = separation
    }
    // Only one pointer moved, so its travel is half the gesture's translation.
    orbit.panByPixels(dx / 2, dy / 2, heightPx)
    scheduleRender()
    return
  }

  applyDrag(dx, dy)
}

/** @param {PointerEvent} event */
function onPointerUp(event) {
  pointers.delete(event.pointerId)
  try {
    canvasEl.value?.releasePointerCapture?.(event.pointerId)
  } catch {
    // Same as capture above: never let cleanup throw out of a pointer handler.
  }
  if (event.pointerId === primaryId) primaryId = secondaryId
  if (event.pointerId === secondaryId || primaryId === secondaryId) secondaryId = -1
  if (pointers.size < 2) pinchDistancePx = 0
  if (pointers.size === 0) {
    primaryId = -1
    secondaryId = -1
    isDragging.value = false
  }
}

/** @param {WheelEvent} event */
function onWheel(event) {
  event.preventDefault()
  orbit.dolly(Math.exp(event.deltaY * 0.0015))
  scheduleRender()
}

// --- chrome + gizmo input (same camera model as the drags above) ----------

/** @param {string} direction */
function onStep(direction) {
  if (dragMode.value === 'pan') {
    const stepMm = PAN_STEP_PX * (orbit.getMmPerPixel(heightPx) || 1)
    if (direction === 'up') orbit.pan(0, stepMm)
    else if (direction === 'down') orbit.pan(0, -stepMm)
    else if (direction === 'left') orbit.pan(-stepMm, 0)
    else if (direction === 'right') orbit.pan(stepMm, 0)
  } else if (direction === 'up') orbit.orbit(0, ORBIT_STEP_DEG)
  else if (direction === 'down') orbit.orbit(0, -ORBIT_STEP_DEG)
  else if (direction === 'left') orbit.orbit(-ORBIT_STEP_DEG, 0)
  else if (direction === 'right') orbit.orbit(ORBIT_STEP_DEG, 0)
  scheduleRender()
}

/** @param {string} direction */
function onZoom(direction) {
  orbit.dolly(direction === 'in' ? 1 / ZOOM_STEP : ZOOM_STEP)
  scheduleRender()
}

/** @param {string} view */
function onSnap(view) {
  orbit.snapTo(view)
  scheduleRender()
}

function onReset() {
  orbit.reset()
  scheduleRender()
}

/** @param {'orbit' | 'pan'} mode */
function onMode(mode) {
  dragMode.value = mode
}

// --- lifecycle ------------------------------------------------------------

/** @param {Event} event */
function onContextLost(event) {
  event.preventDefault()
  webglError.value =
    'The 3D context was lost (the browser released the GPU). Reload the page to restore the view.'
}

function onThemeChange() {
  theme.value = preferredTheme()
  if (viewport?.graph.setTheme(theme.value)) scheduleRender()
}

onMounted(() => {
  const canvas = canvasEl.value
  if (!canvas) return
  try {
    viewport = createViewport(canvas, { fovDeg: orbit.fovDeg, theme: theme.value })
    // Label the readout from the grid that actually got built, rather than
    // repeating the spacing constant in a second place.
    overlay.minorMm = viewport.graph.gridLines.minorMm
    overlay.majorMm = viewport.graph.gridLines.majorMm
  } catch (error) {
    // The chrome, gizmo and readout stay live: the camera model does not need
    // WebGL, so navigation still works and the failure is visible rather than a
    // silently blank rectangle.
    webglError.value = `This browser could not start WebGL: ${String(error)}`
  }
  canvas.addEventListener('webglcontextlost', onContextLost)

  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(rootEl.value)
  }
  window.addEventListener('resize', measure)

  // Follow a live colour-scheme change, not just the one at load: the user can
  // flip their OS theme with the app open.
  if (typeof window !== 'undefined' && window.matchMedia) {
    themeQuery = window.matchMedia('(prefers-color-scheme: light)')
    themeQuery.addEventListener('change', onThemeChange)
  }

  measure()
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', measure)
  themeQuery?.removeEventListener('change', onThemeChange)
  themeQuery = null
  canvasEl.value?.removeEventListener('webglcontextlost', onContextLost)
  viewport?.dispose()
  viewport = null
})
</script>

<template>
  <div
    ref="rootEl"
    class="viewport"
    data-testid="viewport"
    :data-drag-mode="dragMode"
    :data-dragging="isDragging ? 'true' : 'false'"
    :data-camera-azimuth="overlay.azimuthDeg.toFixed(2)"
    :data-camera-elevation="overlay.elevationDeg.toFixed(2)"
    :data-camera-distance="overlay.distanceMm.toFixed(2)"
    :data-camera-target="overlay.target"
    :data-frames-rendered="framesRendered"
    :data-webgl="webglError ? 'unavailable' : 'ready'"
    :data-theme="theme"
  >
    <canvas
      ref="canvasEl"
      class="viewport__canvas"
      data-testid="viewport-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
    />

    <p v-if="webglError" class="viewport__error" data-testid="viewport-webgl-unavailable">
      {{ webglError }}
    </p>

    <Grid
      :mm-per-pixel="overlay.mmPerPixel"
      :minor-mm="overlay.minorMm"
      :major-mm="overlay.majorMm"
    />
    <OrientationGizmo
      :azimuth-deg="overlay.azimuthDeg"
      :elevation-deg="overlay.elevationDeg"
      @snap="onSnap"
    />
    <NavigationChrome
      :drag-mode="dragMode"
      @step="onStep"
      @zoom="onZoom"
      @mode="onMode"
      @reset="onReset"
    />
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--surface-0);
}

.viewport__canvas {
  display: block;
  width: 100%;
  height: 100%;
  /* Essential on touch: without this the browser claims vertical drags for
     page scrolling, which is how the previous attempt ended up with an orbit
     that only worked horizontally on iPad. */
  touch-action: none;
  cursor: grab;
}

.viewport__canvas:active {
  cursor: grabbing;
}

.viewport__error {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: min(420px, 80vw);
  margin: 0;
  padding: 12px 14px;
  transform: translate(-50%, -50%);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: 13px;
  text-align: center;
}
</style>
