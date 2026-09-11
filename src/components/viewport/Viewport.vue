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
import { Euler, Group as ThreeGroup, Mesh, Raycaster, Vector2, Vector3 } from 'three'
import Grid from './Grid.vue'
import OrientationGizmo from './OrientationGizmo.vue'
import NavigationChrome from './NavigationChrome.vue'
import DimensionLines from './DimensionLines.vue'
import Gizmo from './Gizmo.vue'
import MarqueeSelect from './MarqueeSelect.vue'
import OperationsToolbar from './OperationsToolbar.vue'
import SnapGuides from './SnapGuides.vue'
import { useSelectedBody } from '../../composables/useSelectedBody.js'
import {
  axisFacing,
  createDimensionAnnotation,
  createOrientedBox,
  createGizmoAnnotation,
  createMarqueeRect,
  createBoxScreenBounds,
  gizmoSizeForBounds,
  marqueeIntersectsBox,
  rotateDeltaDeg,
  translateDeltaMm,
  createSnapGuideAnnotations,
  updateBoxScreenBounds,
  updateDimensionAnnotation,
  updateGizmoAnnotation,
  updateMarqueeRect,
  updateSnapGuideAnnotations,
} from '../../render/annotate.js'
import { useTransformCommands } from '../../composables/useTransformCommands.js'
import { useTransformPreviewStore } from '../../stores/transformPreview.js'
import { createOrbitCamera } from '../../render/camera.js'
import { createViewport } from '../../render/scene.js'
import {
  BODY_COLORS,
  createBodyMaterial,
  createBodyObject,
  createGhostMaterial,
  disposeBodyObject,
  geom3ToBufferGeometry,
  updateBodyObject,
} from '../../render/mesh.js'
import { nearestOnPlane, ndcFromClient, projectToWorkingPlane } from '../../render/pick.js'
import { evaluateOp, toGeom3 } from '../../core/kernel/index.js'
import { boundsOf } from '../../core/kernel/group.js'
import {
  boxAtPoint,
  clearSnap,
  createBoxMm,
  createSnapState,
  ghostBoxAtOrigin,
  paramsForDrop,
  recordForDrop,
  snapToleranceMm,
  updateSnap,
} from '../../core/library.js'
import { useDocumentStore } from '../../stores/document.js'
import { usePlacementStore } from '../../stores/placement.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useSettingsStore } from '../../stores/settings.js'

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

/** How far clear of the solid a dimension line is drawn. */
const DIMENSION_OFFSET_PX = 28
/** Dimension arrowhead length. */
const DIMENSION_ARROW_PX = 9

const documentStore = useDocumentStore()
const placement = usePlacementStore()
const selection = useSelectionStore()
const settings = useSettingsStore()
const preview = useTransformPreviewStore()
const transformCommands = useTransformCommands()
/**
 * What is selected, described in plain numbers. Recomputed when the selection or
 * the document changes — **not** per frame; the render callback below only
 * re-*projects* it.
 */
const selected = useSelectedBody()

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

/**
 * @type {import('vue').Ref<'orbit' | 'pan' | 'select'>} `'select'` is
 * `TODO/ui-024`'s touch equivalent for marquee-select — a third chrome toggle
 * alongside Orbit/Pan (`TODO/ui-018`), since touch has no modifier key at all
 * for the desktop Ctrl/Cmd-drag path below.
 */
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

/**
 * The selection overlays' screen geometry (`TODO/ui-011`).
 *
 * Reactive, unlike the render state below it, because two Vue components draw
 * from it — and small enough that this is not the case CLAUDE.md's Performance
 * section forbids. That rule is about deep reactivity walking a multi-megabyte
 * `Float32Array`; this is a fixed ~60 numbers, **allocated once here and mutated
 * in place** by `src/render/annotate.js` from inside the render callback, so a
 * frame writes numbers into an existing structure rather than rebuilding one.
 */
const gizmoAnnotation = reactive(createGizmoAnnotation())
const dimensionAnnotations = reactive([
  createDimensionAnnotation(),
  createDimensionAnnotation(),
  createDimensionAnnotation(),
])

/**
 * The selected body's own box, in its own frame (`TODO/ui-023`).
 *
 * Deliberately **not** reactive and allocated exactly once: `syncAnnotations()`
 * repoints its four fields at the description's existing arrays each frame,
 * which is a reference assignment rather than an allocation, per CLAUDE.md's
 * no-per-frame-allocation rule.
 */
const dimensionBox = createOrientedBox()

/**
 * The marquee-select rectangle's screen geometry (`TODO/ui-024`).
 *
 * Reactive for the same reason `gizmoAnnotation` above is: `MarqueeSelect.vue`
 * draws straight from it. Unlike the camera-driven overlays, this is written
 * directly from the pointer path (`onPointerMove`) rather than only from the
 * render callback — the same precedent `src/stores/transformPreview.js`'s own
 * per-`pointermove` writes already set for this component, and still a
 * handful of numbers, not the multi-megabyte structure CLAUDE.md's
 * Performance rule is actually about.
 */
const marqueeRect = reactive(createMarqueeRect())

/**
 * The dashed placement guides' screen geometry (`TODO/ui-013`).
 *
 * Reactive for the same reason `marqueeRect` above is, and written from the same
 * place: the pointer path, once per `pointermove` of a placement drag rather
 * than once per rendered frame. That is the right cadence here — a placement
 * drag is the one gesture during which the camera does not move, so a guide only
 * ever needs re-projecting when the pointer does. Two objects of six fields,
 * mutated in place by `src/render/annotate.js`; nothing like the multi-megabyte
 * `Float32Array` CLAUDE.md's Performance rule is actually about.
 */
const snapGuides = reactive(createSnapGuideAnnotations())

/**
 * Whether the ghost is currently being held in line by a snap — the drag's own
 * "this is why the preview jumped" signal, and what an `*.e2e.js` spec asserts
 * mid-gesture instead of pixel-picking the canvas.
 */
const snapped = ref(false)

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

/**
 * Committed bodies, one scene object per document body id.
 *
 * A **bare solid is one `Mesh`; a Group-valued body is a `THREE.Group` of one
 * mesh per named part** (`TODO/ui-016`, `src/render/mesh.js`'s
 * `createBodyObject`). That structure is what a raycast needs in order to
 * resolve a hit to a part rather than only to a body — the old single combined
 * mesh had already unioned the parts away.
 */
const bodiesGroup = new ThreeGroup()
bodiesGroup.name = 'bodies'
/** @type {Map<string, Mesh | ThreeGroup>} */
const bodyMeshes = new Map()
/** Ghost geometry, cached per op so a drag builds each shape at most once. */
const ghostGeometry = new Map()
/**
 * The ghost's *box*, cached per op alongside its geometry (`TODO/ui-013`).
 *
 * The snap needs the dragged shape's bounding box on every `pointermove`, and
 * measuring one means evaluating the solid — far too expensive for the pointer
 * path. Measured once per op at the working-plane origin instead, then
 * translated by `boxAtPoint`, which is pure arithmetic over six numbers.
 *
 * @type {Map<string, import('../../core/library.js').BoxMm>}
 */
const ghostBoxes = new Map()
/** @type {Mesh | null} */
let ghostMesh = null
let ghostOp = ''
let bodyMaterial = /** @type {any} */ (null)
let selectedMaterial = /** @type {any} */ (null)
/** The rest of a multi-body selection — everything but the one picked first. */
let secondaryMaterial = /** @type {any} */ (null)
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
// Desktop drag-mode override (`TODO/ui-018`, mapping made a stored preference
// by `TODO/ui-019`): the button, Shift state and pointer type at the *start*
// of the tracked press, captured once like `pressId`/`pressTravelPx` above, so
// a Shift key released mid-drag can't flip the gesture back to orbit halfway
// through — see `effectiveDragMode()` below.
let pressButton = -1
let pressShiftKey = false
/** @type {string} `PointerEvent.pointerType` at press start: `'mouse'`, `'touch'`, `'pen'`, or `''` between gestures. */
let pressPointerType = ''
// Marquee-select bookkeeping (`TODO/ui-024`), captured at press start like the
// pan-override fields above and for the same reason: a modifier released
// mid-drag must not flip the gesture's meaning halfway through.
let pressCtrlKey = false
let pressMetaKey = false
let pressStartClientX = 0
let pressStartClientY = 0
/**
 * What the single-pointer gesture in progress has resolved to, decided once
 * — by {@link decideGestureKind} — the moment its travel first exceeds
 * `CLICK_SLOP_PX`, and left `''` for the rest of a press that never becomes a
 * drag at all (an ordinary click). Sticky for the life of the gesture, same
 * discipline as `effectiveDragMode()`'s own note on `pressShiftKey`.
 * @type {'' | 'orbit' | 'pan' | 'select' | 'marquee'}
 */
let gestureKind = ''
/** Whether the in-progress marquee adds to the selection rather than replacing it. */
let marqueeAdditive = false

/**
 * The gizmo drag in progress (`TODO/ui-012`).
 *
 * Allocated once and mutated, like every other pointer structure here: a drag
 * writes into it on every `pointermove`, and CLAUDE.md's Performance rule is
 * explicit that the pointer path allocates nothing.
 *
 * `centre*Mm` and `originPx` are captured at `pointerdown` and deliberately not
 * refreshed: a rotation is measured against where the drag *started*, so the
 * sweep stays stable even as the preview turns the solid underneath it.
 */
const gizmoDrag = {
  active: false,
  /** @type {'translate' | 'rotate'} */
  kind: 'translate',
  axisIndex: 0,
  bodyId: '',
  startXPx: 0,
  startYPx: 0,
  originXPx: 0,
  originYPx: 0,
  facing: 1,
  centreXMm: 0,
  centreYMm: 0,
  centreZMm: 0,
}

/** Scratch for a marquee release's body-vs-rectangle test (`TODO/ui-024`). */
const boxScreenBounds = createBoxScreenBounds()

// Scratch for the preview transform below — allocated once, never per frame.
const previewEuler = new Euler()
const previewCentre = new Vector3()

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
  syncAnnotations()
}

/**
 * Re-project the selection overlays for the frame just drawn.
 *
 * Called from the render callback rather than from a watcher, because the gizmo
 * and the dimension lines have to track the camera: an overlay that only updated
 * when the *selection* changed would slide off its own solid the moment the user
 * orbited. That is the same one-camera-two-views trap `render-001` avoided, and
 * it is why this reads the very orbit state the frame was rendered with.
 *
 * Allocates nothing: `annotate.js` writes into the structures allocated above.
 */
function syncAnnotations() {
  const body = selected.value.body
  if (!body) {
    // Nothing selected, or two or more — either way there is no single body to
    // attach a gizmo to, and leaving the last one drawn would point at a solid
    // the user is no longer working on.
    gizmoAnnotation.visible = false
    for (const annotation of dimensionAnnotations) annotation.visible = false
    return
  }
  if (body.subPart) {
    // Drilled into one named part of a group (`TODO/ui-016`). The dimension
    // lines below still draw — they *measure*, and measuring the clicked part is
    // the point of the feature — but the gizmo does not, because it is a drag
    // handle and there is no record a `transform.*` op could target that means
    // "just this part". An attached gizmo here would move the whole group while
    // the Inspector named the part, which is precisely the "gizmo and numeric
    // fields drive the same transform" contract CLAUDE.md requires and this
    // state cannot satisfy. See `src/core/inspector.js`'s `subPart` field.
    gizmoAnnotation.visible = false
  } else {
    const [minMm, maxMm] = body.boundsMm
    // `TODO/ui-017`: sized to the selected body's own on-screen bounding box —
    // `overlay.mmPerPixel` is current because `syncOverlay` sets it immediately
    // before calling here — rather than the fixed 58px/40px `ui-011` originally
    // used, so the rings and arms always extend clear of the rendered object.
    const { armPx, ringPx } = gizmoSizeForBounds(minMm, maxMm, overlay.mmPerPixel)
    updateGizmoAnnotation(
      orbit,
      body.positionMm[0],
      body.positionMm[1],
      body.positionMm[2],
      widthPx,
      heightPx,
      armPx,
      ringPx,
      gizmoAnnotation,
    )
  }
  // `TODO/ui-023`: the dimension lines measure the body's **own** box, not the
  // world-axis shadow the gizmo above is sized against. The two genuinely want
  // different measurements — the gizmo has to clear the tilted part's whole
  // on-screen silhouette, while the numbers have to be the part's real size.
  dimensionBox.minMm = body.localBoundsMm[0]
  dimensionBox.maxMm = body.localBoundsMm[1]
  dimensionBox.rotationDeg = body.rotationDeg
  dimensionBox.pivotMm = body.positionMm
  for (let axis = 0; axis < 3; axis += 1) {
    updateDimensionAnnotation(
      orbit,
      dimensionBox,
      axis,
      widthPx,
      heightPx,
      DIMENSION_OFFSET_PX,
      DIMENSION_ARROW_PX,
      dimensionAnnotations[axis],
    )
  }
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
 *
 * Meshes are keyed by a body's **lineage root** id, which is what makes a move
 * update a body rather than duplicate it: `document.bodies()` reports one entry
 * per logical object however many transform records it has accumulated (see
 * `src/core/document.js`'s supersession note), so a moved body is the same mesh
 * with new geometry — and the selection pointing at it survives, because its id
 * did not change. `recordId` is what actually changed, so that is what decides
 * whether the geometry needs rebuilding.
 */
function syncBodies() {
  if (!bodyMaterial) return
  const bodies = documentStore.raw.bodies()
  const live = new Set()
  for (const body of bodies) {
    live.add(body.id)
    const existing = bodyMeshes.get(body.id)
    if (existing) {
      if (existing.userData.recordId === body.recordId) continue
      // The body was transformed: swap in the new geometry and drop whatever
      // preview transform the drag left on the object, since the translation or
      // rotation is now baked into the vertices themselves. `updateBodyObject`
      // refuses when the object's *shape* changed — a bare body that became a
      // group, or a group whose part list differs — and the rebuild below picks
      // that up rather than patching one body's geometry into another's slots.
      if (updateBodyObject(existing, body.geometry)) {
        existing.position.set(0, 0, 0)
        existing.quaternion.identity()
        existing.userData.recordId = body.recordId
        continue
      }
      bodiesGroup.remove(existing)
      disposeBodyObject(existing)
      bodyMeshes.delete(body.id)
    }
    const object = createBodyObject(body.geometry, bodyMaterial, body.id)
    object.userData.recordId = body.recordId
    bodyMeshes.set(body.id, object)
    bodiesGroup.add(object)
  }
  for (const [id, object] of bodyMeshes) {
    if (live.has(id)) continue
    bodiesGroup.remove(object)
    disposeBodyObject(object)
    bodyMeshes.delete(id)
  }
  applySelectionMaterial()
  scheduleRender()
}

/**
 * What role a body plays in the current selection.
 *
 * Three states rather than two, because in a 2+ selection the solid picked
 * **first** is not just "also selected" — it is Subtract's base, and everything
 * picked after it is a subtrahend (`TODO/ui-014`). A user has to be able to see
 * which is which before pressing the button, so the distinction is painted onto
 * the solids themselves rather than only living inside the toolbar.
 *
 * The single source for both the material below and the `data-selection-role`
 * the scene list announces, so the DOM cannot claim an order the render does not
 * show.
 *
 * @param {string} id A body's lineage root id.
 * @returns {'base' | 'secondary' | 'none'}
 */
function selectionRole(id) {
  if (!selection.has(id)) return 'none'
  return selection.ids[0] === id ? 'base' : 'secondary'
}

/**
 * Highlight whatever is selected. Deliberately the whole of this task's
 * selection *response*: the inspector, the dimension lines and the transform
 * gizmo are `ui-011`'s contract, not this one's.
 */
function applySelectionMaterial() {
  if (!bodyMaterial) return
  for (const [id, object] of bodyMeshes) {
    const role = selectionRole(id)
    const material =
      role === 'base' ? selectedMaterial : role === 'secondary' ? secondaryMaterial : bodyMaterial
    // A Group-valued body is a container of part meshes (`TODO/ui-016`), so the
    // highlight is painted onto every part: a group selects and highlights as
    // one object, exactly as it did when it was a single combined mesh. The
    // drilled-into part is deliberately *not* highlighted differently — its
    // feedback is the breadcrumb, the dimension lines and the absent gizmo.
    if (object instanceof ThreeGroup) {
      for (const child of object.children) /** @type {Mesh} */ (child).material = material
    } else {
      object.material = material
    }
  }
  scheduleRender()
}

function applyMaterialTheme() {
  const palette = BODY_COLORS[theme.value] ?? BODY_COLORS.dark
  bodyMaterial?.color.setHex(palette.body)
  selectedMaterial?.color.setHex(palette.selected)
  secondaryMaterial?.color.setHex(palette.secondary)
  ghostMaterial?.color.setHex(palette.ghost)
}

// --- gizmo drag (TODO/ui-012) ---------------------------------------------

/**
 * Show the drag in progress on the mesh itself, without touching the document.
 *
 * The transform is `p → centre + R·(p − centre) + t`: a body's geometry is baked
 * in world millimetres, so turning the object about its own origin would spin it
 * around the world origin instead — a body 300 mm out would fly across the
 * scene. Written to the three.js object as `quaternion = R` and
 * `position = centre − R·centre + t`, which is that same transform.
 *
 * Nothing here is a document mutation: exactly one `transform.*` record is
 * appended, on release, with the whole gesture's delta. See
 * `src/stores/transformPreview.js` for why.
 */
function applyPreviewTransform() {
  const mesh = bodyMeshes.get(gizmoDrag.bodyId)
  if (!mesh) return
  // 'ZYX' matches `@jscad/modeling`'s own Tait-Bryan order, so the preview turns
  // the same way the committed geometry will.
  previewEuler.set(
    (preview.rxDeg * Math.PI) / 180,
    (preview.ryDeg * Math.PI) / 180,
    (preview.rzDeg * Math.PI) / 180,
    'ZYX',
  )
  mesh.quaternion.setFromEuler(previewEuler)
  previewCentre.set(gizmoDrag.centreXMm, gizmoDrag.centreYMm, gizmoDrag.centreZMm)
  previewCentre.applyQuaternion(mesh.quaternion)
  mesh.position.set(
    gizmoDrag.centreXMm - previewCentre.x + preview.txMm,
    gizmoDrag.centreYMm - previewCentre.y + preview.tyMm,
    gizmoDrag.centreZMm - previewCentre.z + preview.tzMm,
  )
  scheduleRender()
}

/** Put the dragged mesh back where the document says it is. */
function clearPreviewTransform() {
  const mesh = bodyMeshes.get(gizmoDrag.bodyId)
  if (mesh) {
    mesh.position.set(0, 0, 0)
    mesh.quaternion.identity()
  }
  preview.clear()
  gizmoDrag.active = false
  gizmoDrag.bodyId = ''
  scheduleRender()
}

/** @param {{ kind: 'translate' | 'rotate', axisIndex: number, clientX: number, clientY: number }} event */
function onGizmoHandleDown(event) {
  const body = selected.value.body
  // Exactly one body, per control 4's precondition. The gizmo is not drawn in
  // any other state, so this is a guard rather than a branch.
  if (!body) return
  gizmoDrag.active = true
  gizmoDrag.kind = event.kind
  gizmoDrag.axisIndex = event.axisIndex
  gizmoDrag.bodyId = body.id
  gizmoDrag.startXPx = event.clientX
  gizmoDrag.startYPx = event.clientY
  gizmoDrag.originXPx = gizmoAnnotation.originX
  gizmoDrag.originYPx = gizmoAnnotation.originY
  gizmoDrag.facing = axisFacing(orbit.state.azimuthDeg, orbit.state.elevationDeg, event.axisIndex)
  gizmoDrag.centreXMm = body.positionMm[0]
  gizmoDrag.centreYMm = body.positionMm[1]
  gizmoDrag.centreZMm = body.positionMm[2]
  preview.begin(body.id)
}

/** @param {{ clientX: number, clientY: number }} event */
function onGizmoHandleMove(event) {
  if (!gizmoDrag.active) return
  const dxPx = event.clientX - gizmoDrag.startXPx
  const dyPx = event.clientY - gizmoDrag.startYPx

  if (gizmoDrag.kind === 'translate') {
    const deltaMm = translateDeltaMm(
      gizmoAnnotation,
      gizmoDrag.axisIndex,
      dxPx,
      dyPx,
      orbit.getMmPerPixel(heightPx),
    )
    preview.setTranslate(
      gizmoDrag.axisIndex === 0 ? deltaMm : 0,
      gizmoDrag.axisIndex === 1 ? deltaMm : 0,
      gizmoDrag.axisIndex === 2 ? deltaMm : 0,
    )
  } else {
    const deltaDeg = rotateDeltaDeg(
      gizmoDrag.originXPx,
      gizmoDrag.originYPx,
      gizmoDrag.startXPx - viewportRect.left,
      gizmoDrag.startYPx - viewportRect.top,
      event.clientX - viewportRect.left,
      event.clientY - viewportRect.top,
      gizmoDrag.facing,
    )
    preview.setRotate(
      gizmoDrag.axisIndex === 0 ? deltaDeg : 0,
      gizmoDrag.axisIndex === 1 ? deltaDeg : 0,
      gizmoDrag.axisIndex === 2 ? deltaDeg : 0,
    )
  }
  applyPreviewTransform()
}

/** @param {{ cancelled: boolean }} event */
function onGizmoHandleUp(event) {
  if (!gizmoDrag.active) return
  const bodyId = gizmoDrag.bodyId
  const kind = gizmoDrag.kind
  /** @type {[number, number, number]} */
  const translate = [preview.txMm, preview.tyMm, preview.tzMm]
  /** @type {[number, number, number]} */
  const rotate = [preview.rxDeg, preview.ryDeg, preview.rzDeg]

  // Drop the preview *before* committing, so the record's baked geometry and the
  // object's own transform are never both applied for a frame — which would show
  // the body at twice the distance it was dragged.
  clearPreviewTransform()
  if (event.cancelled) return

  if (kind === 'translate') transformCommands.translateBy(bodyId, translate)
  else transformCommands.rotateBy(bodyId, rotate)
  syncBodies()
}

/** @param {{ clientX: number, clientY: number }} event */
function onGizmoHandleClick(event) {
  // A press on a handle that never moved: pick what is underneath, so the gizmo
  // is not a dead zone over the solid it is attached to.
  pickAt(event.clientX, event.clientY, false)
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

/**
 * The ghost's box for an op, built once and cached — see {@link ghostBoxes}.
 *
 * @param {string} op
 * @returns {import('../../core/library.js').BoxMm}
 */
function ghostBoxFor(op) {
  let box = ghostBoxes.get(op)
  if (!box) {
    box = ghostBoxAtOrigin(op)
    ghostBoxes.set(op, box)
  }
  return box
}

// --- snap-assisted placement (TODO/ui-013) --------------------------------

/**
 * What the ghost can snap against: every body already in the document, with the
 * two measurements the snap needs.
 *
 * Rebuilt when the *document* changes, never per `pointermove`: nothing can
 * appear, move or vanish during a placement drag, and `boundsOf` walks a solid's
 * polygons — a cost that has no business inside the pointer path (CLAUDE.md's
 * Performance rule). One drag therefore measures each body at most once.
 *
 * @type {{ id: string, centroidMm: number[], box: import('../../core/library.js').BoxMm }[]}
 */
const snapNeighbours = []
let snapNeighboursVersion = -1

/** The ghost's box at the raw pointer position — allocated once, mutated. */
const ghostBox = createBoxMm()
/** Which alignment (if any) the ghost is being held in, and its guides. */
const snapState = createSnapState()
/** The point the drop will commit at: the pointer's, plus the snap offset. */
const dropPointMm = { x: 0, y: 0 }

function refreshSnapNeighbours() {
  if (snapNeighboursVersion === documentStore.version) return
  snapNeighboursVersion = documentStore.version
  snapNeighbours.length = 0
  for (const body of documentStore.raw.bodies()) {
    const [minMm, maxMm] = boundsOf(body.geometry)
    snapNeighbours.push({
      id: body.id,
      centroidMm: [
        (minMm[0] + maxMm[0]) / 2,
        (minMm[1] + maxMm[1]) / 2,
        (minMm[2] + maxMm[2]) / 2,
      ],
      box: { minMm, maxMm },
    })
  }
}

/** Push the current snap state out to the overlay and the DOM flag. */
function syncSnapGuides() {
  updateSnapGuideAnnotations(orbit, snapState.guides, widthPx, heightPx, snapGuides)
  // Guarded, like `setGhostVisible`: this flips at most a handful of times per
  // gesture rather than once per pointer event.
  if (snapped.value !== snapState.snapped) snapped.value = snapState.snapped
}

/** Drop every trace of the last drag's snap. */
function clearSnapFeedback() {
  clearSnap(snapState)
  syncSnapGuides()
}

/**
 * Where a drop actually lands: the projected pointer point, moved by whatever
 * alignment the nearest existing body pulls it into.
 *
 * **The single source of both the preview and the commit**, deliberately. The
 * ghost the user is watching and the record the release appends both come
 * through here, so the solid cannot land somewhere the preview never showed —
 * the same reasoning that made `paramsForDrop` shared in `ui-010`, and the exact
 * class of drift `ui-013`'s "on drop, the **snapped** position commits" line is
 * about.
 *
 * @param {string} op
 * @param {number} clientXPx
 * @param {number} clientYPx
 * @returns {{ x: number, y: number } | null} `null` when the pointer does not
 *   meet the working plane at all — no valid drop position, snapped or not.
 */
function resolveDropPoint(op, clientXPx, clientYPx) {
  const point = projectPointer(clientXPx, clientYPx)
  if (!point) {
    clearSnapFeedback()
    return null
  }
  dropPointMm.x = point.x
  dropPointMm.y = point.y

  refreshSnapNeighbours()
  const nearest = nearestOnPlane(snapNeighbours, point.x, point.y)
  if (nearest === -1) {
    // `ui-013`'s precondition: an empty scene has nothing to align to, so the
    // drag stays exactly the one `ui-010` built.
    clearSnap(snapState)
  } else {
    boxAtPoint(ghostBoxFor(op), dropPointMm, ghostBox)
    updateSnap(
      ghostBox,
      snapNeighbours[nearest].box,
      snapToleranceMm(orbit.getMmPerPixel(heightPx)),
      snapState,
    )
    dropPointMm.x += snapState.dxMm
    dropPointMm.y += snapState.dyMm
  }
  syncSnapGuides()
  return dropPointMm
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
    const point = resolveDropPoint(op, clientXPx, clientYPx)
    if (!point) {
      setGhostVisible(false)
      scheduleRender()
      return
    }
    // The **snapped** point, so the preview shows where the drop will actually
    // land rather than where the pointer happens to be (`TODO/ui-013`).
    ghostMesh.position.set(point.x, point.y, 0)
    setGhostVisible(true)
    scheduleRender()
  },

  clearPreview() {
    setGhostVisible(false)
    clearSnapFeedback()
    scheduleRender()
  },

  commit(op, clientXPx, clientYPx) {
    const point = resolveDropPoint(op, clientXPx, clientYPx)
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
 * Desktop mouse-button/modifier overrides for the single-pointer gesture in
 * progress, layered on top of the chrome's own `Orbit`/`Pan` toggle
 * (`TODO/ui-018`), keyed by `settings.mouseNavPreset` (`TODO/ui-019` made
 * `ui-018`'s mapping a stored preference rather than a hardcoded one). Adding
 * a future preset only ever means adding a branch here, never touching the
 * pointer-handling functions that call `effectiveDragMode()`.
 *
 * Gated on `pressPointerType === 'mouse'`: every branch below reads
 * `pressButton`, and a touch `PointerEvent` reports `button: 0` too, so
 * without this gate the `left-pans` preset would start panning on an
 * ordinary one-finger touch orbit. `TODO/ui-019`'s own Interaction model
 * section is explicit that the preset choice is "moot on touch" — touch
 * always falls through to the chrome's `dragMode` toggle, regardless of
 * which mouse preset is selected.
 *
 * @param {import('../../stores/settings.js').MouseNavPresetId} preset
 * @returns {'orbit' | 'pan' | null} `null` means "no override — fall through
 *   to the chrome toggle", so the caller only has one fallback to reason about.
 */
function mouseDragOverride(preset) {
  if (preset === 'left-pans') {
    // The alternate preset: plain left-drag pans, right-drag orbits — the
    // mirror image of the default below. No Shift/slop gating is needed on
    // the left-button branch for the same reason the default's plain-left
    // (no Shift) case needs none: a press that never exceeds `CLICK_SLOP_PX`
    // still resolves as a click in `onPointerUp`, independent of what this
    // function returned while its travel was under that threshold.
    if (pressButton === 0) return 'pan'
    if (pressButton === 2) return 'orbit'
    return null
  }
  // Default (`shift-or-right-pans`, `ui-018`'s original scheme). Right mouse
  // button always pans, no modifier needed — there is no competing
  // "right-click" meaning elsewhere in this component, unlike Shift+left. A
  // Shift+left press only counts as a pan override once its travel has
  // exceeded `CLICK_SLOP_PX`: below that threshold the press is still a
  // *candidate click*, and `onPointerUp`'s own `isClick` check is what fires
  // the Shift-click additive-select path — a Shift+left press that never
  // exceeds the slop must reach that path undisturbed, not be swallowed as a
  // pan.
  if (pressButton === 2) return 'pan'
  if (pressButton === 0 && pressShiftKey && pressTravelPx > CLICK_SLOP_PX) return 'pan'
  return null
}

/**
 * The drag mode for the single-pointer gesture in progress.
 *
 * `pressButton`, `pressShiftKey` and `pressPointerType` are captured once at
 * `pointerdown` and `pressTravelPx` only ever grows for the life of the
 * gesture (see the bookkeeping above), so once this starts returning `'pan'`
 * for a gesture it keeps returning `'pan'` for the rest of that gesture even
 * if, say, Shift is released before the pointer comes up — the mode is
 * decided once, at the point travel first crosses whatever threshold the
 * active preset uses, not re-evaluated every move.
 *
 * `dragMode.value` can also be `'select'` (`TODO/ui-024`'s marquee toggle):
 * `decideGestureKind` above intercepts that case into a marquee before ever
 * reaching here in the ordinary flow, but a press that starts *on* a body
 * while `'select'` is active still falls through to this function (there is
 * no separate "drag a body directly" gesture, so it behaves like any other
 * non-`'pan'` mode and orbits — see `applyDrag`'s `!== 'pan'` check).
 *
 * @returns {'orbit' | 'pan' | 'select'}
 */
function effectiveDragMode() {
  if (pressPointerType === 'mouse') {
    const override = mouseDragOverride(settings.mouseNavPreset)
    if (override) return override
  }
  return dragMode.value
}

/**
 * @param {number} dx horizontal pixels travelled
 * @param {number} dy vertical pixels travelled (screen-down positive)
 */
function applyDrag(dx, dy) {
  if (effectiveDragMode() === 'pan') orbit.panByPixels(dx, dy, heightPx)
  // Dragging "grabs" the scene: pulling right swings the camera left, pulling
  // down tips the top of the scene toward the viewer.
  else orbit.orbit(-dx * ORBIT_DEG_PER_PX, dy * ORBIT_DEG_PER_PX)
  scheduleRender()
}

/**
 * Decide, once per single-pointer gesture, whether a drag orbits, pans, or
 * starts a marquee-select rectangle (`TODO/ui-024`).
 *
 * Marquee needs a way to claim a gesture without colliding with `ui-018`'s
 * pan overrides (Shift+left-drag, right-drag) or the plain-left-drag orbit
 * default those gestures — and their regression specs — already depend on.
 * Recorded in `docs/decisions/interaction-model-qa.md`'s marquee addendum:
 * two paths reach marquee, checked *before* falling through to
 * {@link effectiveDragMode}, so neither disturbs its existing behaviour when
 * neither path applies:
 *
 * - **Mouse**: Ctrl or Cmd held at press-down — a modifier `mouseDragOverride`
 *   never reads — with the press having started on empty space (not on a
 *   body's mesh; a gizmo handle never reaches this component at all, since
 *   `Gizmo.vue`'s own hit targets sit above the canvas and stop the event
 *   there).
 * - **Any pointer type, including touch**: the chrome's own `dragMode` toggle
 *   set to `'select'` — the touch equivalent this control needs, since touch
 *   has no modifier key, mirroring the existing Orbit/Pan toggle.
 *
 * Either path sets {@link marqueeAdditive} from `pressShiftKey` — additive
 * marquee is desktop-only for now (stated explicitly, per this task's own
 * Interaction model section, rather than left implicit): touch has no
 * keyboard, so `pressShiftKey` is simply never true for a touch gesture and
 * a touch marquee always replaces the selection, with no special-casing
 * needed here.
 *
 * The empty-space test is a raycast, deferred to the moment travel first
 * crosses `CLICK_SLOP_PX` (not to every `pointerdown`) so an ordinary click
 * never pays for it — the same "once per gesture, not once per frame" cost
 * class {@link pickAt}'s own click-time raycast already pays.
 *
 * @returns {'orbit' | 'pan' | 'select' | 'marquee'}
 */
function decideGestureKind() {
  const marqueeModifier = pressPointerType === 'mouse' && (pressCtrlKey || pressMetaKey)
  const marqueeToggle = dragMode.value === 'select'
  if ((marqueeModifier || marqueeToggle) && !hitsBodyAt(pressStartClientX, pressStartClientY)) {
    marqueeAdditive = pressShiftKey
    return 'marquee'
  }
  return effectiveDragMode()
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
    pressButton = event.button
    pressShiftKey = event.shiftKey
    pressCtrlKey = event.ctrlKey
    pressMetaKey = event.metaKey
    pressPointerType = event.pointerType
    pressStartClientX = event.clientX
    pressStartClientY = event.clientY
    gestureKind = ''
    marqueeAdditive = false
    // Defensive: a marquee only ever ends (release or cancel) with this
    // cleared already, but a fresh press is the right place to guarantee it
    // regardless of how the previous gesture ended.
    marqueeRect.visible = false
  } else {
    // A second contact means this is a gesture, not a click — and never a
    // marquee: abandon one already in progress rather than leave its
    // rectangle stuck on screen.
    pressId = -1
    pressButton = -1
    pressPointerType = ''
    if (gestureKind === 'marquee') marqueeRect.visible = false
    gestureKind = ''
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
    // gesture on a device with no wheel. Never a marquee (see onPointerDown).
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

  if (event.pointerId === pressId) {
    if (gestureKind === '' && pressTravelPx > CLICK_SLOP_PX) {
      gestureKind = decideGestureKind()
      if (gestureKind === 'marquee') marqueeRect.visible = true
    }
    if (gestureKind === 'marquee') {
      updateMarqueeRect(
        pressStartClientX - viewportRect.left,
        pressStartClientY - viewportRect.top,
        event.clientX - viewportRect.left,
        event.clientY - viewportRect.top,
        marqueeRect,
      )
      return
    }
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
  const wasPressPointer = wasTracked && event.pointerId === pressId
  // A press that barely moved is a click: pick whatever is under it. A pointer
  // this component never saw go down belongs to something else (a placement drag
  // released over the canvas) and must not be read as a click here.
  const isClick = wasPressPointer && pressTravelPx <= CLICK_SLOP_PX
  const wasMarquee = wasPressPointer && gestureKind === 'marquee'
  pressId = -1
  gestureKind = ''

  if (wasMarquee) {
    marqueeRect.visible = false
    // `pointercancel` (bound to this same handler) means the gesture was
    // interrupted rather than deliberately released — abandon it with no
    // selection change, the same as a cancelled gizmo drag.
    if (event.type !== 'pointercancel') finishMarquee(marqueeAdditive, event.clientX, event.clientY)
    return
  }
  // Shift (or the platform's Cmd/Ctrl) adds to the selection instead of
  // replacing it — the minimum multi-select `ui-011` needs to reach the "2+
  // selected" Inspector state. A touch-only equivalent gesture belongs with the
  // Operations toolbar that actually consumes multi-selection (`ui-014`), not
  // here, where there would be nothing to do with it yet.
  if (isClick) pickAt(event.clientX, event.clientY, event.shiftKey || event.metaKey || event.ctrlKey)
}

/**
 * Whether a screen point lands on a body's mesh — the marquee's own
 * "started on empty space" precondition (`decideGestureKind` above), and the
 * same raycast {@link pickAt} performs on click, factored out so both share
 * one implementation rather than two that could drift apart.
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 * @returns {boolean}
 */
function hitsBodyAt(clientXPx, clientYPx) {
  return raycastBodyId(clientXPx, clientYPx) !== null
}

/**
 * What is under a screen point: the body, and — for a Group-valued body, whose
 * scene object is a container of per-part meshes (`TODO/ui-016`) — which of its
 * named parts the ray actually landed on.
 *
 * **Recursive**, unlike the flat intersect this replaced: a group's part meshes
 * are children of its container, and a non-recursive test would intersect the
 * container itself (which has no geometry) and report nothing at all. That is
 * the one line that would silently make every grouped body unpickable.
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 * @returns {{ bodyId: string, partName?: string } | null} Nearest hit, or
 *   `null` when nothing is there (including when there is no viewport yet).
 */
function raycastHit(clientXPx, clientYPx) {
  if (!viewport || bodyMeshes.size === 0) return null
  ndcFromClient(clientXPx, clientYPx, viewportRect, scratchNdc)
  pickNdc.set(scratchNdc.x, scratchNdc.y)
  raycaster.setFromCamera(pickNdc, viewport.graph.camera)
  const hits = raycaster.intersectObjects(bodiesGroup.children, true)
  if (hits.length === 0) return null
  const object = hits[0].object
  return { bodyId: object.name, partName: object.userData.partName }
}

/**
 * @param {number} clientXPx
 * @param {number} clientYPx
 * @returns {string | null} The id of the body under the point, nearest first.
 */
function raycastBodyId(clientXPx, clientYPx) {
  return raycastHit(clientXPx, clientYPx)?.bodyId ?? null
}

/**
 * Select the body under a screen point, narrow to one of its parts, or clear the
 * selection when the click lands on empty space.
 *
 * Raycasting only on click, never per pointermove: this is the one place an
 * allocation-bearing three.js call is acceptable, because it runs once per tap.
 *
 * ## Pick depth (`TODO/ui-016`, interaction-model-qa control 6)
 *
 * A click on a group's member mesh means one of two different things depending
 * on what is already selected, and that is the whole feature:
 *
 * - **The group is not already the single selection** → select the whole group.
 *   A first click never jumps straight to a sub-part; a user who wants the
 *   assembly must not have to fight their way back out to it.
 * - **The group is already the single selection** → narrow to the clicked part.
 *   This covers re-targeting to a *sibling* too: clicking a different member
 *   while drilled in goes straight there rather than stepping up first, since
 *   the group is still the selected body throughout.
 *
 * The Shift/marquee-additive path is untouched: an additive click operates on
 * whole bodies, because a sub-part is a display depth, not a second selectable
 * thing to add to a set.
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 * @param {boolean} [additive] Add to the selection rather than replacing it.
 */
function pickAt(clientXPx, clientYPx, additive = false) {
  if (!viewport || bodyMeshes.size === 0) {
    selection.clear()
    return
  }
  const hit = raycastHit(clientXPx, clientYPx)
  // Empty space always clears outright, even with the modifier held: it is the
  // gesture that dismisses the whole selection response — inspector, gizmo and
  // dimension lines — and an additive version of "nothing" has no meaning.
  if (!hit) {
    selection.clear()
    return
  }
  if (additive) {
    selection.toggle(hit.bodyId)
    return
  }
  const alreadyThisBody = selection.ids.length === 1 && selection.ids[0] === hit.bodyId
  if (hit.partName && alreadyThisBody) selection.drillInto(hit.partName)
  else selection.select(hit.bodyId)
}

/**
 * Finish a marquee-select drag (`TODO/ui-024`): intersect every body's world
 * bounding box against the dragged rectangle — partial overlap counts as
 * enclosed, per this task's own Testing section — and hand the resulting id
 * list to the selection store, replacing or adding to the current selection
 * per {@link marqueeAdditive}.
 *
 * @param {boolean} additive
 * @param {number} clientXPx Pointer-up position — the marquee's second corner.
 * @param {number} clientYPx
 */
function finishMarquee(additive, clientXPx, clientYPx) {
  updateMarqueeRect(
    pressStartClientX - viewportRect.left,
    pressStartClientY - viewportRect.top,
    clientXPx - viewportRect.left,
    clientYPx - viewportRect.top,
    marqueeRect,
  )
  const enclosed = []
  if (viewport) {
    for (const body of documentStore.raw.bodies()) {
      const [minMm, maxMm] = boundsOf(body.geometry)
      updateBoxScreenBounds(orbit, minMm, maxMm, widthPx, heightPx, boxScreenBounds)
      if (marqueeIntersectsBox(marqueeRect, boxScreenBounds)) enclosed.push(body.id)
    }
  }
  selection.selectMany(enclosed, additive)
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
  secondaryMaterial = createBodyMaterial(palette.secondary)
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
    // Pick depth changes nothing about *which* body is selected, so it never
    // reaches the watcher above — but it does change what the overlays draw
    // (`TODO/ui-016`: the dimension lines shrink to the part, the gizmo goes).
    // `syncAnnotations` runs from the render callback, so without this the
    // gizmo would simply stay on screen until the next camera move: the exact
    // class of "it passed its own test and still looked broken" defect
    // SECOND-ATTEMPT.md is about.
    watch(() => selection.subPart, scheduleRender, { deep: true }),
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
  for (const object of bodyMeshes.values()) disposeBodyObject(object)
  bodyMeshes.clear()
  bodiesGroup.clear()
  for (const geometry of ghostGeometry.values()) geometry.dispose()
  ghostGeometry.clear()
  ghostBoxes.clear()
  snapNeighbours.length = 0
  snapNeighboursVersion = -1
  ghostMesh = null
  ghostOp = ''
  bodyMaterial?.dispose()
  selectedMaterial?.dispose()
  secondaryMaterial?.dispose()
  ghostMaterial?.dispose()
  bodyMaterial = null
  selectedMaterial = null
  secondaryMaterial = null
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
    :data-selected-count="selection.count"
    :data-placing="placement.isDragging ? 'true' : 'false'"
    :data-ghost="ghostVisible ? 'visible' : 'hidden'"
    :data-snapped="snapped ? 'true' : 'false'"
    :data-transforming="preview.isActive ? 'true' : 'false'"
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
      @contextmenu.prevent
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
        :data-selection-role="selectionRole(body.id)"
      >
        {{ body.name }}
      </li>
    </ul>

    <!-- The selection *response* (TODO/ui-011): dimension lines under the
         gizmo, both attached to whatever is selected right now, both
         non-interactive so neither can swallow the click that selects. -->
    <DimensionLines :annotations="dimensionAnnotations" />
    <Gizmo
      :annotation="gizmoAnnotation"
      @handle-down="onGizmoHandleDown"
      @handle-move="onGizmoHandleMove"
      @handle-up="onGizmoHandleUp"
      @handle-click="onGizmoHandleClick"
    />
    <!-- The marquee-select rectangle (TODO/ui-024): drawn only while a
         marquee drag is in progress, above the gizmo/dimension overlays so
         it is never occluded by them mid-drag. -->
    <MarqueeSelect :rect="marqueeRect" />
    <!-- The dashed placement guides (TODO/ui-013): drawn only while a drag is
         being held in line with an existing item, above the selection overlays
         so the alignment being offered is never occluded mid-drag. -->
    <SnapGuides :guides="snapGuides" />

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
    <!-- The Operations toolbar (TODO/ui-014): viewport chrome, in the same
         band as the navigation controls below and deliberately *not* a row in
         the Library panel beside Cube and Cylinder. CLAUDE.md: creation and
         operation are never the same list, and an operation control stays
         disabled until its operands are actually selected. -->
    <OperationsToolbar />
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
