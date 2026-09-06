<script setup>
/**
 * The 3D viewport: a WebGL canvas plus its screen-space overlays.
 *
 * Three things about the shape of this component are deliberate:
 *
 * 1. **One camera, two input paths.** Pointer drags and the on-screen
 *    `NavigationChrome` buttons call the *same* `src/render/camera.js` model.
 *    There is no second camera state anywhere, which is what stops the
 *    chrome and the gesture drifting apart (TODO/render-001's Proposed fix).
 * 2. **Nothing hot is reactive.** The orbit camera, the three.js viewport, the
 *    decoded meshes and the pointer bookkeeping are plain, non-reactive
 *    variables — CLAUDE.md's Performance section is explicit that Vue's deep
 *    reactivity has no business walking render-path state, and a body's vertex
 *    buffer is exactly the multi-megabyte `Float32Array` it warns about. Pointer
 *    handlers touch numbers only and allocate nothing; the reactive overlay state
 *    (`overlay`) is written at most **once per animation frame**, from inside the
 *    render callback, so a fast drag can't push a DOM update per pointer event.
 * 3. **The viewport is the drop target.** It is the only thing that knows its own
 *    rect, its camera, and how to project a screen point onto the working plane,
 *    so it registers itself with `src/stores/placement.js` rather than exporting
 *    that knowledge for the Library panel to re-derive (TODO/ui-010).
 *
 * Rendering is on demand: a frame is scheduled when something actually changes,
 * rather than a permanently-spinning rAF loop burning battery on a static scene.
 */
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { Group as ThreeGroup, Mesh, Raycaster, Vector2 } from 'three'
import Grid from './Grid.vue'
import OrientationGizmo from './OrientationGizmo.vue'
import NavigationChrome from './NavigationChrome.vue'
import { createOrbitCamera } from '../../render/camera.js'
import { createViewport } from '../../render/scene.js'
import {
  BODY_COLORS,
  createBodyMaterial,
  createGhostMaterial,
  disposeMesh,
  geom3ToBufferGeometry,
} from '../../render/mesh.js'
import { ndcFromClient, projectToWorkingPlane } from '../../render/pick.js'
import { evaluateOp, toGeom3 } from '../../core/kernel/index.js'
import { paramsForDrop, recordForDrop } from '../../core/library.js'
import { useDocumentStore } from '../../stores/document.js'
import { usePlacementStore } from '../../stores/placement.js'
import { useSelectionStore } from '../../stores/selection.js'

/** Degrees of orbit per pixel of drag. */
const ORBIT_DEG_PER_PX = 0.4
/** Degrees of orbit per press of a direction button. */
const ORBIT_STEP_DEG = 15
/** Pixels of pan per press of a direction button. */
const PAN_STEP_PX = 60
/** Multiplier per press of a zoom button. */
const ZOOM_STEP = 1.25
/**
 * Total pointer travel, in pixels, below which a press counts as a click rather
 * than a drag. A tap on a touch screen always wanders a pixel or two.
 */
const CLICK_SLOP_PX = 5
/** The ghost is built once per op at the origin, then moved by `mesh.position`. */
const GHOST_ORIGIN = Object.freeze({ x: 0, y: 0 })

const documentStore = useDocumentStore()
const placement = usePlacementStore()
const selection = useSelectionStore()

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
const ghostVisible = ref(false)

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

/**
 * The viewport's own bounding rect, cached rather than measured per pointer
 * event: `getBoundingClientRect()` allocates a fresh `DOMRect` on every call, and
 * hit-testing a placement drag calls it on every `pointermove`. It is refreshed
 * wherever the rect can actually change — resize and layout — and the app has no
 * scrolling container that could move it in between.
 */
const viewportRect = { left: 0, top: 0, width: 0, height: 0 }

// Scratch values reused by the pointer path — CLAUDE.md's Performance rule.
const scratchNdc = { x: 0, y: 0 }
const scratchPoint = { x: 0, y: 0, z: 0 }
const pickNdc = new Vector2()
const raycaster = new Raycaster()

/** Committed bodies, one mesh per document record id. */
const bodiesGroup = new ThreeGroup()
bodiesGroup.name = 'bodies'
/** @type {Map<string, Mesh>} */
const bodyMeshes = new Map()
/** Ghost geometry, cached per op so a drag builds each shape at most once. */
const ghostGeometry = new Map()
/** @type {Mesh | null} */
let ghostMesh = null
let ghostOp = ''
let bodyMaterial = /** @type {any} */ (null)
let selectedMaterial = /** @type {any} */ (null)
let ghostMaterial = /** @type {any} */ (null)

// Pointer bookkeeping. Entries are allocated on pointerdown and mutated in
// place on move, so pointermove itself allocates nothing.
/** @type {Map<number, { x: number, y: number }>} */
const pointers = new Map()
let primaryId = -1
let secondaryId = -1
let pinchDistancePx = 0
// Click-vs-drag discrimination for selection picking.
let pressId = -1
let pressTravelPx = 0

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
  const rect = el.getBoundingClientRect()
  viewportRect.left = rect.left
  viewportRect.top = rect.top
  viewportRect.width = rect.width
  viewportRect.height = rect.height
  viewport?.setSize(widthPx, heightPx)
  scheduleRender()
}

// --- bodies ---------------------------------------------------------------

/**
 * Rebuild the scene's meshes from the document's replayed bodies.
 *
 * Additive by construction: a mesh is created only for an id that has none, and
 * removed only for an id the document no longer has. Rebuilding the whole group
 * from scratch would be simpler and is exactly how the second attempt ended up
 * with a second body replacing the first (ACCEPTANCE.md scenario 1).
 */
function syncBodies() {
  if (!bodyMaterial) return
  const bodies = documentStore.raw.bodies()
  const live = new Set()
  for (const body of bodies) {
    live.add(body.id)
    if (bodyMeshes.has(body.id)) continue
    const mesh = new Mesh(geom3ToBufferGeometry(toGeom3(body.geometry)), bodyMaterial)
    mesh.name = body.id
    bodyMeshes.set(body.id, mesh)
    bodiesGroup.add(mesh)
  }
  for (const [id, mesh] of bodyMeshes) {
    if (live.has(id)) continue
    bodiesGroup.remove(mesh)
    disposeMesh(mesh)
    bodyMeshes.delete(id)
  }
  applySelectionMaterial()
  scheduleRender()
}

/**
 * Highlight whatever is selected. Deliberately the whole of this task's
 * selection *response*: the inspector, the dimension lines and the transform
 * gizmo are `ui-011`'s contract, not this one's.
 */
function applySelectionMaterial() {
  if (!bodyMaterial) return
  for (const [id, mesh] of bodyMeshes) {
    mesh.material = selection.has(id) ? selectedMaterial : bodyMaterial
  }
  scheduleRender()
}

function applyMaterialTheme() {
  const palette = BODY_COLORS[theme.value] ?? BODY_COLORS.dark
  bodyMaterial?.color.setHex(palette.body)
  selectedMaterial?.color.setHex(palette.selected)
  ghostMaterial?.color.setHex(palette.ghost)
}

// --- drag placement (the drop-target contract) ----------------------------

/**
 * Project a client point onto the working plane.
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 * @returns {{ x: number, y: number, z: number } | null}
 */
function projectPointer(clientXPx, clientYPx) {
  ndcFromClient(clientXPx, clientYPx, viewportRect, scratchNdc)
  const aspect = viewportRect.height > 0 ? viewportRect.width / viewportRect.height : 1
  return projectToWorkingPlane(orbit, scratchNdc.x, scratchNdc.y, aspect, scratchPoint)
}

/**
 * The ghost's geometry for an op, built once and cached. It is built at the
 * origin through the *same* `paramsForDrop` the commit uses, so the preview is
 * the shape that will actually land — including resting on the working plane
 * rather than sunk half into it.
 *
 * @param {string} op
 */
function ghostGeometryFor(op) {
  let geometry = ghostGeometry.get(op)
  if (!geometry) {
    geometry = geom3ToBufferGeometry(toGeom3(evaluateOp(op, paramsForDrop(op, GHOST_ORIGIN))))
    ghostGeometry.set(op, geometry)
  }
  return geometry
}

/** @param {boolean} value */
function setGhostVisible(value) {
  // Guarded so a drag that stays inside the viewport writes no reactive state at
  // all: this flips at most twice per gesture, not once per pointermove.
  if (ghostVisible.value !== value) ghostVisible.value = value
  if (ghostMesh) ghostMesh.visible = value
}

/** @type {import('../../stores/placement.js').DropTarget} */
const dropTarget = {
  contains(clientXPx, clientYPx) {
    const root = rootEl.value
    if (!root || viewportRect.width === 0) return false
    if (
      clientXPx < viewportRect.left ||
      clientXPx > viewportRect.left + viewportRect.width ||
      clientYPx < viewportRect.top ||
      clientYPx > viewportRect.top + viewportRect.height
    ) {
      return false
    }
    // The rect alone is not enough, and this is not a theoretical edge case: at
    // phone width the Library panel is a bottom *sheet overlaying the viewport*,
    // so a press on a row — and a release back onto one — is geometrically
    // inside the viewport's rect while being visually on top of it. Rect-only
    // hit-testing showed the ghost the instant a row was pressed and placed a
    // body underneath the sheet on release. Asking the document what is actually
    // under the pointer respects the stacking the user can see. The drag icon is
    // `pointer-events: none`, so it never answers this question about itself.
    const under = document.elementFromPoint(clientXPx, clientYPx)
    return under !== null && root.contains(under)
  },

  preview(op, clientXPx, clientYPx) {
    if (!viewport || !op) return
    if (!ghostMesh) {
      ghostMesh = new Mesh(ghostGeometryFor(op), ghostMaterial)
      ghostMesh.name = 'placement-ghost'
      // Drawn after the solids so its translucency composites over them.
      ghostMesh.renderOrder = 1
      ghostOp = op
      viewport.graph.scene.add(ghostMesh)
    }
    if (ghostOp !== op) {
      ghostMesh.geometry = ghostGeometryFor(op)
      ghostOp = op
    }
    const point = projectPointer(clientXPx, clientYPx)
    if (!point) {
      setGhostVisible(false)
      scheduleRender()
      return
    }
    ghostMesh.position.set(point.x, point.y, 0)
    setGhostVisible(true)
    scheduleRender()
  },

  clearPreview() {
    setGhostVisible(false)
    scheduleRender()
  },

  commit(op, clientXPx, clientYPx) {
    const point = projectPointer(clientXPx, clientYPx)
    if (!point) return null
    // Every document mutation goes through the command layer, inside a
    // transaction with an origin (CLAUDE.md Architecture). The component never
    // touches the action log itself.
    const record = recordForDrop(op, { x: point.x, y: point.y }, documentStore.raw)
    documentStore.append(record, { origin: 'local' })
    selection.select(record.id)
    syncBodies()
    return record.id ?? null
  },
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
  if (pointers.size === 1) {
    pressId = event.pointerId
    pressTravelPx = 0
  } else {
    // A second contact means this is a gesture, not a click.
    pressId = -1
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
  if (event.pointerId === pressId) pressTravelPx += Math.abs(dx) + Math.abs(dy)

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
  const wasTracked = pointers.delete(event.pointerId)
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
  // A press that barely moved is a click: pick whatever is under it. A pointer
  // this component never saw go down belongs to something else (a placement drag
  // released over the canvas) and must not be read as a click here.
  const isClick = wasTracked && event.pointerId === pressId && pressTravelPx <= CLICK_SLOP_PX
  pressId = -1
  if (isClick) pickAt(event.clientX, event.clientY)
}

/**
 * Select the body under a screen point, or clear the selection when the click
 * lands on empty space.
 *
 * Raycasting only on click, never per pointermove: this is the one place an
 * allocation-bearing three.js call is acceptable, because it runs once per tap.
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 */
function pickAt(clientXPx, clientYPx) {
  if (!viewport || bodyMeshes.size === 0) {
    selection.clear()
    return
  }
  ndcFromClient(clientXPx, clientYPx, viewportRect, scratchNdc)
  pickNdc.set(scratchNdc.x, scratchNdc.y)
  raycaster.setFromCamera(pickNdc, viewport.graph.camera)
  const hits = raycaster.intersectObjects(bodiesGroup.children, false)
  selection.select(hits.length > 0 ? hits[0].object.name : null)
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
  applyMaterialTheme()
  if (viewport?.graph.setTheme(theme.value)) scheduleRender()
}

/** @type {(() => void) | null} */
let unregisterTarget = null
/** @type {(() => void)[]} */
const stopWatchers = []

onMounted(() => {
  const canvas = canvasEl.value
  if (!canvas) return
  const palette = BODY_COLORS[theme.value] ?? BODY_COLORS.dark
  bodyMaterial = createBodyMaterial(palette.body)
  selectedMaterial = createBodyMaterial(palette.selected)
  ghostMaterial = createGhostMaterial(palette.ghost)

  try {
    viewport = createViewport(canvas, { fovDeg: orbit.fovDeg, theme: theme.value })
    viewport.graph.scene.add(bodiesGroup)
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

  unregisterTarget = placement.registerTarget(dropTarget)
  stopWatchers.push(
    watch(() => documentStore.version, syncBodies),
    watch(() => selection.ids, applySelectionMaterial, { deep: true }),
  )

  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(rootEl.value)
  }
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, { passive: true })

  // Follow a live colour-scheme change, not just the one at load: the user can
  // flip their OS theme with the app open.
  if (typeof window !== 'undefined' && window.matchMedia) {
    themeQuery = window.matchMedia('(prefers-color-scheme: light)')
    themeQuery.addEventListener('change', onThemeChange)
  }

  measure()
  // A document that already has content (a reload, a loaded file) renders on
  // mount rather than waiting for the next mutation.
  syncBodies()
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  unregisterTarget?.()
  unregisterTarget = null
  for (const stop of stopWatchers.splice(0)) stop()
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure)
  themeQuery?.removeEventListener('change', onThemeChange)
  themeQuery = null
  canvasEl.value?.removeEventListener('webglcontextlost', onContextLost)
  for (const mesh of bodyMeshes.values()) disposeMesh(mesh)
  bodyMeshes.clear()
  bodiesGroup.clear()
  for (const geometry of ghostGeometry.values()) geometry.dispose()
  ghostGeometry.clear()
  ghostMesh = null
  ghostOp = ''
  bodyMaterial?.dispose()
  selectedMaterial?.dispose()
  ghostMaterial?.dispose()
  bodyMaterial = null
  selectedMaterial = null
  ghostMaterial = null
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
    :data-body-count="documentStore.count"
    :data-selected-id="selection.onlyId ?? ''"
    :data-placing="placement.isDragging ? 'true' : 'false'"
    :data-ghost="ghostVisible ? 'visible' : 'hidden'"
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

    <!-- The scene's contents, in the DOM. Not decoration: it is what makes the
         placed bodies assertable and announceable without pixel-picking a
         canvas, and it is the minimal "is this selected?" signal TODO/ui-010
         asks for. The inspector that will *edit* a body is ui-011's. -->
    <ul class="viewport__bodies" data-testid="scene-bodies">
      <li
        v-for="body in documentStore.bodies"
        :key="body.id"
        :data-testid="`scene-body-${body.id}`"
        :data-body-id="body.id"
        :data-body-op="body.op"
        :data-body-name="body.name"
        :data-body-center="`${body.center[0].toFixed(2)},${body.center[1].toFixed(2)},${body.center[2].toFixed(2)}`"
        :data-selected="selection.has(body.id) ? 'true' : 'false'"
      >
        {{ body.name }}
      </li>
    </ul>

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

/* Present for assistive tech and for tests, drawn by WebGL for everyone else. */
.viewport__bodies {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  list-style: none;
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
