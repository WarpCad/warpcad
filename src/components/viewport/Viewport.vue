<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { Mesh, Raycaster, Vector2 } from 'three'
import Grid from './Grid.vue'
import OrientationGizmo from './OrientationGizmo.vue'
import NavigationChrome from './NavigationChrome.vue'
import DimensionLines from './DimensionLines.vue'
import Gizmo from './Gizmo.vue'
import MarqueeSelect from './MarqueeSelect.vue'
import OperationsToolbar from './OperationsToolbar.vue'
import SketchStrokes from './SketchStrokes.vue'
import SketchToolbar from './SketchToolbar.vue'
import SketchPanelSheet from '../sketch/SketchPanelSheet.vue'
import ReferenceImageOverlay from '../sketch/ReferenceImageOverlay.vue'
import ScaleTool from '../sketch/ScaleTool.vue'
import TraceTool from '../sketch/TraceTool.vue'
import { registerEscapeYield } from '../../composables/useOverlayStack.js'
import { useReferenceImageView } from '../../composables/useReferenceImageView.js'
import { useImageDrop } from '../../composables/useImageDrop.js'
import { useTheme } from '../../composables/useTheme.js'
import VertexHandles from '../sketch/VertexHandles.vue'
import SnapGuides from './SnapGuides.vue'
import CutPlaneOverlay from './CutPlaneOverlay.vue'
import SplitSheet from '../features/SplitSheet.vue'
import RepeatSheet from './RepeatSheet.vue'
import ModelImportStatus from './ModelImportStatus.vue'
import PlacementSession from './PlacementSession.vue'
import ViewportContextBanner from './ViewportContextBanner.vue'
import { createCutPlaneAnnotation, updateCutPlaneAnnotation } from '../../render/cutPlane.js'
import { useSplitSheetStore } from '../../stores/splitSheet.js'
import { useSelectedBody } from '../../composables/useSelectedBody.js'
import {
  createDimensionAnnotation,
  createOrientedBox,
  createGizmoAnnotation,
  createDialAnnotation,
  createRulerAnnotation,
  createMarqueeRect,
  createBoxScreenBounds,
  createSketchPath,
  updateSketchPath,
  gizmoSizeForBounds,
  marqueeIntersectsBox,
  createSnapGuideAnnotations,
  updateBoxScreenBounds,
  updateDimensionAnnotation,
  updateGizmoAnnotation,
  updateMarqueeRect,
  updateSnapGuideAnnotations,
} from '../../render/annotate.js'
import { createGizmoDrag } from '../../render/gizmoDrag.js'
import { useTransformCommands } from '../../composables/useTransformCommands.js'
import { useSketchEditorCommands } from '../../composables/useSketchEditorCommands.js'
import { isTextEntry } from '../../composables/textEntry.js'
import { useTransformPreviewStore } from '../../stores/transformPreview.js'
import { useColorPreviewStore } from '../../stores/colorPreview.js'
import { isClosed, toPointsMm } from '../../sketch/profile.js'
import { createEvaluationChannel } from '../../core/kernel/evaluationClient.js'
import { unpackGeometry } from '../../core/kernel/transport.js'
import { createOrbitCamera } from '../../render/camera.js'
import { createOffscreenCapture, setViewportCapture } from '../../render/offscreenCapture.js'
import { createViewport, rebuildGpuResources } from '../../render/scene.js'
import { createContextRecovery } from '../../render/contextRecovery.js'
import { applyViewVisibility, createGhostMaterial, drawnBoundsOf, geom3ToBufferGeometry } from '../../render/mesh.js'
import { readSceneTheme, sceneThemeOf } from '../../render/theme.js'
import { announcedColor, announcedPartColors, createBodyCounts, createBodyMeshes } from '../../render/bodyMeshes.js'
import { createPlacementGhost } from '../../render/placementGhost.js'
import { createSketchSnap } from '../../render/sketchSnap.js'
import { createSketchHandles } from '../../render/sketchHandles.js'
import { createSketchDraw } from '../../render/sketchDraw.js'
import { createCameraNavigation } from '../../render/cameraNavigation.js'
import { PICK_OFFSETS_PX, firstDrawnHit, ndcFromClient, projectToSketchPlane, projectToWorkingPlane } from '../../render/pick.js'
import { isBodyDrawn, isPartDrawn } from '../../core/visibility.js'
import { toGeom3 } from '../../core/kernel/index.js'
import {
  libraryRow,
  recordsForDrop,
  variantKey,
} from '../../core/library.js'
import { useDocumentStore } from '../../stores/document.js'
import { useHiddenPartVisibilityStore } from '../../stores/hiddenPartVisibility.js'
import { useHoverHighlightStore } from '../../stores/hoverHighlight.js'
import { useRepeatStore } from '../../stores/repeat.js'
import { usePlacementStore } from '../../stores/placement.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useAlignReferenceStore } from '../../stores/alignReference.js'
import { useTimelineStore } from '../../stores/timeline.js'
import { useSettingsStore } from '../../stores/settings.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'

/** Degrees of orbit per pixel of drag. */
const ORBIT_DEG_PER_PX = 0.4
/**
 * Total pointer travel, in pixels, below which a press counts as a click rather
 * than a drag. A tap on a touch screen always wanders a pixel or two.
 */
const CLICK_SLOP_PX = 5



/** How far clear of the solid a dimension line is drawn. */
const DIMENSION_OFFSET_PX = 28
/** Dimension arrowhead length. */
const DIMENSION_ARROW_PX = 9

const documentStore = useDocumentStore()
/**
 * The History panel's preview state (`TODO/ui-032`, §14).
 *
 * Three things follow from a preview being active, and all three live here
 * because this component owns what the user actually sees:
 *
 * 1. **What renders** — {@link renderSource} below, the previewed prefix of the
 *    log rather than the live document.
 * 2. **What cannot be touched** — picking, the gizmo, and a drop commit are all
 *    gated, because the viewport is showing a state the document is not in.
 * 3. **That it is obviously not live** — the amber inset outline, which is the
 *    non-textual half of §14's feedback and the thing that makes the mode
 *    legible at a glance rather than only by reading the strip.
 */
const timeline = useTimelineStore()

/**
 * The document to draw: the preview, or the real one.
 *
 * A single accessor rather than a flag plus a lookup, so no code path can test
 * one and read the other — which would render the live scene under a strip
 * claiming it is step 2 of 5.
 */
function renderSource() {
  return timeline.previewDocument() ?? documentStore.raw
}

/**
 * What the scene list and `data-body-count` report.
 *
 * Must follow {@link renderSource}, not the live document: while previewing,
 * the canvas shows the previewed prefix, and a DOM readout still counting the
 * latest document would say "2 bodies" over a picture of one.
 */
const announcedBodies = computed(() => timeline.previewBodies ?? documentStore.bodies)

const props = defineProps({
  /**
   * Whether a phone-width bottom sheet has pushed the nav chrome up over the canvas
   * (`TODO/ui-046`). Owned by `AppView.vue`, the only thing that can see every sheet;
   * passed straight through to `NavigationChrome`, which collapses in response.
   */
  navRaised: { type: Boolean, default: false },
  /**
   * `TODO/io-016`: the Shared view's read-only presentation of someone else's project, shown
   * through Watch (`timeline.watchFork`). Only the model, the grid, the navigation chrome and
   * the orientation gizmo: no Operations toolbar, no tool sheets, no preview outline (it is not
   * a preview of *your* project), and the camera frames the shown model.
   */
  presentation: { type: Boolean, default: false },
})
const placement = usePlacementStore()
const selection = useSelectionStore()
const alignReference = useAlignReferenceStore()
const settings = useSettingsStore()
const preview = useTransformPreviewStore()
const colorPreview = useColorPreviewStore()
const hiddenPartVisibility = useHiddenPartVisibilityStore()
const hoverHighlight = useHoverHighlightStore()
/** A Repeat session (`TODO/ui-069`): its other ticked targets are outlined while it is armed. */
const repeatSession = useRepeatStore()
const transformCommands = useTransformCommands()
const sketchEditor = useSketchEditorStore()
const sketchCommands = useSketchEditorCommands()
// `TODO/ai-008`: drop an image file here to attach it to the Assistant (desktop).
const imageDrop = useImageDrop()
/**
 * What is selected, described in plain numbers. Recomputed when the selection or
 * the document changes — **not** per frame; the render callback below only
 * re-*projects* it.
 */
const selected = useSelectedBody()

const rootEl = ref(/** @type {HTMLElement | null} */ (null))
const canvasEl = ref(/** @type {HTMLCanvasElement | null} */ (null))

/**
 * @type {import('vue').Ref<'orbit' | 'pan' | 'select'>} `'select'` is
 * `TODO/ui-024`'s touch equivalent for marquee-select — a third chrome toggle
 * alongside Orbit/Pan (`TODO/ui-018`), since touch has no modifier key at all
 * for the desktop Ctrl/Cmd-drag path below.
 */
const dragMode = ref('orbit')
/** The resolved theme, from the one module that decides it (`TODO/ui-113`). */
const { resolved: theme } = useTheme()
const webglError = ref('')
/**
 * `TODO/render-006`: where the view stands after the browser released its WebGL context, and how
 * many Restore view attempts failed. Drives the banner; `ready` whenever the context is healthy.
 */
const contextState = ref(/** @type {import('../../render/contextRecovery.js').ContextState} */ ('ready'))
const contextFailures = ref(0)
const contextRecovery = createContextRecovery({
  onChange(state, failures) {
    contextState.value = state
    contextFailures.value = failures
  },
})
/** Bumped to give the canvas a fresh element (and so a fresh context) when the old one stays lost. */
const canvasKey = ref(0)
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
/**
 * The rotate dial (`TODO/ui-064`), drawn while a rotate ring is dragged.
 * Reactive and allocated once, mutated in place by `annotate.js`, for the same
 * reasons as `gizmoAnnotation` just above.
 */
const dialAnnotation = reactive(createDialAnnotation())
/**
 * The translate ruler (`TODO/ui-065`), drawn while a translate arm is dragged.
 * Reactive and allocated once, mutated in place, like `dialAnnotation`.
 */
const rulerAnnotation = reactive(createRulerAnnotation())
const dimensionAnnotations = reactive([
  createDimensionAnnotation(),
  createDimensionAnnotation(),
  createDimensionAnnotation(),
])

/**
 * The Split sheet's cut plane (`TODO/io-007`), re-projected every frame like the gizmo so it
 * stays on the body while the camera moves. Reactive for the same reason, and allocated once.
 */
const cutPlaneAnnotation = reactive(createCutPlaneAnnotation())
const splitSheet = useSplitSheetStore()

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

/**
 * Whether the sketch editor is open (`TODO/sketch-001`). Read everywhere the old sketch
 * mode was: orbit is suspended, a plain drag draws, the Operations toolbar yields the
 * top-left slot, and a click picks outlines instead of bodies.
 */
const sketchMode = computed(() => sketchEditor.active)

/**
 * The draft's outlines as screen paths, the live drag preview, and the revolve axis.
 *
 * Rebuilt only while the editor is open and only when the draft, the camera or the
 * viewport size actually changed (`syncSketchPaths`), never per frame on the ordinary
 * scene — see `annotate.js`'s `updateSketchPath` for the one string it allocates.
 */
const sketchPaths = reactive(/** @type {any[]} */ ([]))
const sketchDraftPath = reactive(createSketchPath())
const sketchAxis = reactive({ visible: false, d: '' })
/**
 * The live Line chain's on-screen furniture (`TODO/sketch-006`), in viewport pixels: a dot at
 * the last vertex, the first vertex (which pulses when the pointer is within the close
 * tolerance), and the live segment's length in mm. Written by `drawChainLive`, never per frame.
 */
const sketchChain = reactive({
  visible: false,
  lastXPx: 0,
  lastYPx: 0,
  firstXPx: 0,
  firstYPx: 0,
  showFirst: false,
  closeNear: false,
  labelXPx: 0,
  labelYPx: 0,
  label: '',
})
/**
 * The selected outline's point and midpoint handles, in viewport pixels (`TODO/sketch-002`),
 * for `VertexHandles.vue` to draw. Laid out by `src/render/sketchHandles.js` (`TODO/ui-108`) only
 * when `syncSketchPaths` redraws, never per frame.
 */
const sketchHandles = reactive({ vertices: /** @type {any[]} */ ([]), midpoints: /** @type {any[]} */ ([]) })
/**
 * The snap marker (`TODO/sketch-007`), in viewport pixels: where the snapped point is
 * (`x/yPx`), where its marker and label are drawn (`markerX/YPx` — the same point, or lifted
 * above a finger), which tier hit (`kind`) and the word for it. `SketchStrokes.vue` draws it.
 */
const sketchSnap = reactive({ visible: false, xPx: 0, yPx: 0, markerXPx: 0, markerYPx: 0, lifted: false, kind: '', label: '' })

// --- non-reactive render state -------------------------------------------

const orbit = createOrbitCamera()
/**
 * The sketch snap (`TODO/ui-108`, extraction 4a): `src/render/sketchSnap.js`. It writes the
 * reactive `sketchSnap` marker above, which the overlay reads.
 */
const sketchSnapper = createSketchSnap({
  orbit,
  editor: sketchEditor,
  sliceZ: () => activeSliceZ(),
  widthPx: () => widthPx,
  heightPx: () => heightPx,
  isEditing: () => sketchHandler.drag.active,
  marker: sketchSnap,
})
/** @type {import('../../render/scene.js').Viewport | null} */
let viewport = null
/** @type {ResizeObserver | null} */
let resizeObserver = null
/** @type {(() => void) | null} */
let unregisterChainYield = null
/** @type {(() => void) | null} */
let stopThemeWatch = null
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
/**
 * The point handles and their drag (`TODO/ui-108`, extraction 4b): `src/render/sketchHandles.js`.
 * `sketchHandles` above is the reactive layout the overlay reads.
 */
const sketchHandler = createSketchHandles({
  orbit,
  editor: sketchEditor,
  sliceZ: () => activeSliceZ(),
  widthPx: () => widthPx,
  heightPx: () => heightPx,
  viewport: viewportRect,
  layout: sketchHandles,
  projectToSketch: (clientXPx, clientYPx) => projectToSketch(clientXPx, clientYPx),
  snap: (pointMm, shiftKey, touch) => sketchSnapper.snap(pointMm, shiftKey, touch),
  hideSnap: () => sketchSnapper.hide(),
  isTouchPress: () => pressPointerType === 'touch',
  requestPreview: () => requestSketchPreview(),
})
/**
 * The draw gesture, the Line chain and profile pick and hover (`TODO/ui-108`, extraction 4c):
 * `src/render/sketchDraw.js`. The chain overlay and the draft outline are the reactive objects
 * the component draws.
 */
const sketchDraw = createSketchDraw({
  orbit,
  editor: sketchEditor,
  sliceZ: () => activeSliceZ(),
  widthPx: () => widthPx,
  heightPx: () => heightPx,
  project: (clientXPx, clientYPx) => projectToSketch(clientXPx, clientYPx),
  snap: (pointMm, shiftKey, touch) => sketchSnapper.snap(pointMm, shiftKey, touch),
  hideSnap: () => sketchSnapper.hide(),
  isTouchPress: () => pressPointerType === 'touch',
  scheduleRender: () => scheduleRender(),
  chain: sketchChain,
  draft: sketchDraftPath,
})
/**
 * The chrome navigation (`TODO/ui-108`, extraction 5a): the direction pad, zoom, standard views, reset,
 * the drag-mode toggle and the wheel. `src/render/cameraNavigation.js`. The drag itself stays here,
 * since its mode depends on the press in progress.
 */
const navigation = createCameraNavigation({
  orbit,
  getMode: () => dragMode.value,
  setMode: (mode) => {
    dragMode.value = mode
  },
  isSketching: () => sketchMode.value,
  heightPx: () => heightPx,
  scheduleRender: () => scheduleRender(),
})

// Scratch values reused by the pointer path — CLAUDE.md's Performance rule.
const scratchNdc = { x: 0, y: 0 }
const scratchPoint = { x: 0, y: 0, z: 0 }
const pickNdc = new Vector2()
const raycaster = new Raycaster()

/**
 * The committed bodies, their selection, hover and Repeat-outline twins, and the body
 * materials (`TODO/ui-108`): `src/render/bodyMeshes.js`. The counts it writes are announced as
 * `data-*` attributes, so they live in a `reactive` object this component owns. `bodyMeshes`
 * and `bodiesGroup` are the controller's own map and group, aliased for picking and the gizmo
 * drag preview.
 */
const bodyCounts = reactive(createBodyCounts())
const bodyScene = createBodyMeshes({
  bodies: () => renderSource().bodies(),
  isHiddenShown: (id) => hiddenPartVisibility.isShown(id),
  isSketched: isSketchedBody,
  selection,
  alignReference,
  hoverHighlight,
  repeatSession,
  colorPreview,
  scheduleRender,
  counts: bodyCounts,
})
const bodiesGroup = bodyScene.group
const bodyMeshes = bodyScene.meshes
const {
  syncBodies,
  selectionRole,
  applySelectionMaterial,
  applyHover,
  removeHoverArtifacts,
  removeRepeatOutlines,
  applyRepeatOutlines,
  paintBodies,
} = bodyScene

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
 * `'sketch-idle'` is a drag under the sketch editor's Select tool: it never draws and never
 * moves the camera (`TODO/sketch-005`).
 * `'sketch-vertex'` is a drag that began on a point handle of the selected outline: it moves
 * that point (or, from a midpoint dot, a newly inserted one) and never draws (`TODO/sketch-002`).
 * `'sketch-scale'` is Set scale's press-and-drag along a ruler (`TODO/sketch-003`).
 * `'sketch-trace'` is a press that wobbled past the tap slop while Auto-trace is armed
 * (`TODO/sketch-004`): it moves nothing, and its press point still traces on release.
 * @type {'' | 'orbit' | 'pan' | 'select' | 'marquee' | 'sketch' | 'sketch-idle' | 'sketch-vertex' | 'sketch-scale' | 'sketch-trace'}
 */
let gestureKind = ''
/** Whether the in-progress marquee adds to the selection rather than replacing it. */
let marqueeAdditive = false

/**
 * The gizmo drag (`TODO/ui-012`, `ui-064`, `ui-065`): the preview transform, the dial's and
 * ruler's steps, the speed bands and the stall timer live in `src/render/gizmoDrag.js`
 * (`TODO/ui-108`, extraction 2). The viewport keeps the selection guard before a drag and the
 * `transform.*` commit after it.
 */
const gizmoDrag = createGizmoDrag({
  meshes: bodyMeshes,
  preview,
  gizmo: gizmoAnnotation,
  dial: dialAnnotation,
  ruler: rulerAnnotation,
  orbit,
  viewportRect,
  widthPx: () => widthPx,
  heightPx: () => heightPx,
  scheduleRender,
  now: () => performance.now(),
})

/** Scratch for one projected pointer, sketch-local `[x, y]` mm. */
const scratchSketchMm = [0, 0]


/** The last pointer over the canvas, so pressing or releasing Shift can re-snap in place. */
const snapPointer = { has: false, xPx: 0, yPx: 0 }

/** Scratch for a marquee release's body-vs-rectangle test (`TODO/ui-024`). */
const boxScreenBounds = createBoxScreenBounds()

const framesRendered = shallowRef(0)

function scheduleRender() {
  // No frames while the context is lost (`TODO/render-006`): nothing calls into a dead context,
  // and the restore schedules the first frame back.
  if (rafId || contextRecovery.state !== 'ready') return
  rafId = requestAnimationFrame(renderFrame)
}

function renderFrame() {
  rafId = 0
  if (contextRecovery.state !== 'ready') return
  if (viewport) {
    try {
      viewport.render(orbit)
    } catch (error) {
      webglError.value = `WebGL rendering stopped: ${String(error)}`
      viewport = null
      setViewportCapture(null)
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
  syncCutPlane()
  syncSketchPaths()
}

/** Project the Split sheet's cut plane for the frame just drawn, or hide it. */
function syncCutPlane() {
  if (!splitSheet.isOpen) {
    cutPlaneAnnotation.visible = false
    return
  }
  updateCutPlaneAnnotation(
    orbit,
    splitSheet.previewBounds,
    splitSheet.axisIndex,
    splitSheet.cutMm,
    widthPx,
    heightPx,
    cutPlaneAnnotation,
  )
}

// The plane moves when the sheet's numbers do, not only when the camera does.
watch(
  () => [splitSheet.isOpen, splitSheet.cutMm, splitSheet.axisIndex, splitSheet.previewBounds],
  () => scheduleRender(),
)

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
  // `TODO/ui-089`: a selected body the user hid (or a drilled part they hid) has nothing on
  // screen to attach a gizmo or dimension lines to. Allocation-free: a map lookup and a scan.
  const view = body ? bodyMeshes.get(body.id)?.userData.view : undefined
  const hidden = view !== undefined && (body?.subPart ? !isPartDrawn(view, body.subPart.partName) : !isBodyDrawn(view))
  if (!body || hidden) {
    // Nothing selected, or two or more — either way there is no single body to
    // attach a gizmo to, and leaving the last one drawn would point at a solid
    // the user is no longer working on.
    gizmoAnnotation.visible = false
    dialAnnotation.visible = false
    rulerAnnotation.visible = false
    for (const annotation of dimensionAnnotations) annotation.visible = false
    return
  }
  if (body.subPart || body.moveRefusal) {
    // `TODO/ui-069`: a repeat body (`moveRefusal`) is never moved on its own — its members
    // follow their source and seed (`core-061` decision 6) — so no gizmo either; the Inspector
    // says what to move instead.
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
  gizmoDrag.syncDial()
  gizmoDrag.syncRuler()
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

// --- the sketch editor (TODO/sketch-001) ---------------------------------

/** What the last `syncSketchPaths` drew from, so an unchanged frame redraws nothing. */
let sketchSyncedDraft = /** @type {object | null} */ (null)
let sketchSyncedCamera = -1
let sketchSyncedSize = ''
let sketchSyncedSelection = ''
let sketchSyncedHover = ''
let sketchSyncedSlice = -1
let sketchSyncedVertex = -2
let sketchSyncedHoverVertex = -2
let sketchSyncedTool = ''

/** The active slice's offset along the sketch's own Z. */
function activeSliceZ() {
  return sketchEditor.slice?.zMm ?? 0
}

// --- the reference photo (TODO/sketch-003) ----------------------------------------------
//
// Drawn in WebGL under the grid (never a DOM <img> over the canvas — ui-020 finding #1), and
// never a pick target. This component only routes Set scale's pointer gestures to it.
const referenceImage = useReferenceImageView({
  orbit: () => orbit,
  size: () => ({ widthPx, heightPx }),
  sliceZ: activeSliceZ,
  projectToSketch: (clientX, clientY) => projectToSketch(clientX, clientY),
  scheduleRender: () => scheduleRender(),
})
const { state: referenceImageState, overlay: referenceOverlay } = referenceImage

/** A Set scale press-and-drag along the ruler: its first point, in image px. */
const scaleDrag = { active: false, aPx: /** @type {[number, number] | null} */ (null) }

/** @returns {boolean} False when the press is not on the photo's plane. */
function beginScaleDrag() {
  const px = referenceImage.clientToImagePx(pressStartClientX, pressStartClientY)
  if (!px) return false
  scaleDrag.active = true
  scaleDrag.aPx = px
  // A drag defines both points; a tapped first point it replaces is simply forgotten.
  sketchEditor.scaleAPx = null
  sketchEditor.scaleBPx = null
  sketchEditor.addScalePoint(px)
  return true
}

/**
 * @param {number} clientXPx
 * @param {number} clientYPx
 */
function updateScaleDrag(clientXPx, clientYPx) {
  if (!scaleDrag.active) return
  referenceImage.trackLiveEnd(clientXPx, clientYPx)
  scheduleRender()
}

/**
 * @param {boolean} cancelled
 * @param {number} clientXPx
 * @param {number} clientYPx
 */
function endScaleDrag(cancelled, clientXPx, clientYPx) {
  if (!scaleDrag.active) return
  scaleDrag.active = false
  referenceImage.clearLiveEnd()
  const end = cancelled ? null : referenceImage.clientToImagePx(clientXPx, clientYPx)
  if (!end || !scaleDrag.aPx) {
    sketchEditor.scaleAPx = null
    sketchEditor.scaleBPx = null
  } else {
    sketchEditor.setScaleLine(scaleDrag.aPx, end)
  }
  scaleDrag.aPx = null
  referenceImage.syncOverlay()
  scheduleRender()
}

/**
 * A tap while Set scale is armed fixes the next point — the first, then the second.
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 */
function scaleTap(clientXPx, clientYPx) {
  const px = referenceImage.clientToImagePx(clientXPx, clientYPx)
  if (!px) return
  sketchEditor.addScalePoint(px)
  referenceImage.clearLiveEnd()
  referenceImage.syncOverlay()
  scheduleRender()
}

/**
 * A tap while Auto-trace is armed (`TODO/sketch-004`): trace the region under it, in the
 * worker. The answer lands in the draft (or the banner says why it did not).
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 */
function traceTap(clientXPx, clientYPx) {
  const px = referenceImage.clientToImagePx(clientXPx, clientYPx)
  // Off the slice's plane altogether: the trace itself reports "Tap on the photo".
  sketchEditor.traceAt(px ?? [Number.NaN, Number.NaN])
}

/**
 * Re-project the draft's outlines, if anything they depend on changed.
 *
 * Called from the render callback (camera moves) and from the draft watcher (edits).
 *
 * @param {boolean} [force]
 */
function syncSketchPaths(force = false) {
  if (!sketchEditor.active) {
    if (sketchPaths.length > 0) sketchPaths.splice(0)
    sketchHandler.clear()
    sketchAxis.visible = false
    sketchDraftPath.visible = false
    sketchChain.visible = false
    sketchDraw.live.has = false
    sketchSnapper.hide()
    sketchSyncedDraft = null
    return
  }
  const size = `${widthPx}x${heightPx}`
  const draft = sketchEditor.draft
  if (
    !force &&
    sketchSyncedDraft === draft &&
    sketchSyncedCamera === orbit.version &&
    sketchSyncedSize === size &&
    sketchSyncedSelection === sketchEditor.selectedProfileId &&
    sketchSyncedHover === sketchEditor.hoverProfileId &&
    sketchSyncedSlice === sketchEditor.activeSlice &&
    sketchSyncedVertex === sketchEditor.selectedVertex &&
    sketchSyncedHoverVertex === sketchEditor.hoverVertex &&
    sketchSyncedTool === sketchEditor.tool
  ) {
    return
  }
  sketchSyncedDraft = draft
  sketchSyncedCamera = orbit.version
  sketchSyncedSize = size
  sketchSyncedSelection = sketchEditor.selectedProfileId
  sketchSyncedHover = sketchEditor.hoverProfileId
  sketchSyncedSlice = sketchEditor.activeSlice
  sketchSyncedVertex = sketchEditor.selectedVertex
  sketchSyncedHoverVertex = sketchEditor.hoverVertex
  sketchSyncedTool = sketchEditor.tool
  const frame = sketchEditor.frame
  /** @type {any[]} */
  const next = []
  draft.slices.forEach((slice, sliceIndex) => {
    const active = sliceIndex === sketchEditor.activeSlice
    for (const profile of slice.profiles) {
      const closed = isClosed(profile)
      const points = profile.kind === 'polyline' ? profile.pointsMm : toPointsMm(profile, 64)
      const path = updateSketchPath(orbit, frame, points, slice.zMm, closed || (profile.kind === 'polyline' && profile.closed), widthPx, heightPx, createSketchPath())
      next.push({
        key: `${slice.id}/${profile.id}`,
        id: profile.id,
        sliceIndex,
        role: profile.role,
        closed,
        open: profile.kind === 'polyline' && !profile.closed,
        active,
        selected: active && profile.id === sketchEditor.selectedProfileId,
        hover: active && profile.id === sketchEditor.hoverProfileId,
        visible: path.visible,
        d: path.d,
        badgeX: path.maxXPx + 4,
        badgeY: path.minYPx - 4,
      })
    }
  })
  sketchPaths.splice(0, sketchPaths.length, ...next)
  sketchHandler.sync()

  // Revolve and Helical spin around the sketch's Y axis (x = 0): draw it, dashed, long
  // enough to read at any zoom.
  const method = draft.extrusion.method
  if (method === 'revolve' || method === 'helical') {
    const reachMm = Math.max(200, (orbit.getMmPerPixel(heightPx) || 1) * heightPx)
    const axis = updateSketchPath(orbit, frame, [[0, -reachMm], [0, reachMm]], activeSliceZ(), false, widthPx, heightPx, createSketchPath())
    sketchAxis.visible = axis.visible
    sketchAxis.d = axis.d
  } else {
    sketchAxis.visible = false
  }
  sketchDraw.drawChain()
  sketchSnapper.draw()
  referenceImage.syncOverlay()
}

/**
 * Project a client point onto the active slice's plane, in sketch millimetres.
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 * @returns {number[] | null} `scratchSketchMm`, or `null` if the plane is not under it.
 */
function projectToSketch(clientXPx, clientYPx) {
  ndcFromClient(clientXPx, clientYPx, viewportRect, scratchNdc)
  const aspect = viewportRect.height > 0 ? viewportRect.width / viewportRect.height : 1
  return projectToSketchPlane(orbit, scratchNdc.x, scratchNdc.y, aspect, sketchEditor.frame, activeSliceZ(), scratchSketchMm)
}

/**
 * A mouse over the canvas with a drawing tool armed and nothing pressed: show where a press
 * would land, so the marker and its label appear *before* the click. The live Line chain's
 * rubber band does the same in {@link trackChainPointer}.
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 * @param {boolean} shiftKey
 */
function hoverSketchSnap(clientXPx, clientYPx, shiftKey) {
  const tool = sketchEditor.tool
  if (tool === 'select') {
    sketchSnapper.hide()
    return
  }
  if (tool === 'line' && sketchEditor.chainLive) return
  const point = projectToSketch(clientXPx, clientYPx)
  if (!point) {
    sketchSnapper.hide()
    return
  }
  sketchSnapper.snap(point, shiftKey, false)
}

/**
 * Shift pressed or released with the pointer still: re-place the point in hand at once, rather
 * than waiting for the next move — "hold Shift" should read as instant.
 *
 * @param {KeyboardEvent} event
 */
function onSnapShiftKey(event) {
  if (event.key !== 'Shift' || !sketchMode.value || !snapPointer.has) return
  const shiftKey = event.type === 'keydown'
  if (sketchHandler.drag.active) sketchHandler.updateDrag(snapPointer.xPx, snapPointer.yPx, shiftKey)
  else if (sketchDraw.drag.active) sketchDraw.update(snapPointer.xPx, snapPointer.yPx, shiftKey)
  else if (pointers.size === 0) {
    hoverSketchSnap(snapPointer.xPx, snapPointer.yPx, shiftKey)
    sketchDraw.trackChain(snapPointer.xPx, snapPointer.yPx, shiftKey)
  }
}

/**
 * Look straight at the active slice in the sketch's own frame.
 *
 * For an unrotated body at Z = 0 this is exactly the old `camera.snapTo('top')`; a
 * turned body gets its own plane's normal (`camera.snapToPlane`).
 */
function aimAtSketch() {
  orbit.snapToPlane(sketchEditor.frame, activeSliceZ())
  scheduleRender()
}

function clearSketchHover() {
  snapPointer.has = false
  if (!sketchDraw.drag.active && !sketchHandler.drag.active) sketchSnapper.hide()
  if (sketchDraw.live.has && !sketchDraw.drag.active) {
    sketchDraw.live.has = false
    sketchDraw.drawChain()
    scheduleRender()
  }
  sketchDraw.forgetHover()
  sketchHandler.forgetHover()
  if (sketchEditor.hoverProfileId) sketchEditor.hoverProfileId = ''
  if (sketchEditor.hoverVertex !== -1) sketchEditor.hoverVertex = -1
}

// --- the extrusion preview: built in the worker, superseded, never appended -----------

const sketchPreviewChannel = createEvaluationChannel('sketch-preview')
/** @type {import('three').Mesh | null} */
let sketchPreviewMesh = null
/** @type {any} */
let sketchPreviewMaterial = null

function clearSketchPreview() {
  if (sketchPreviewMesh) {
    viewport?.graph.scene.remove(sketchPreviewMesh)
    sketchPreviewMesh.geometry.dispose()
    sketchPreviewMesh = null
  }
}

/**
 * Ask the worker to build the draft. A newer request on this channel supersedes an older
 * one rather than queueing behind it (CLAUDE.md's Performance rule), so a burst of edits
 * costs one build, and an old answer never paints over a newer one.
 */
function requestSketchPreview() {
  if (!sketchEditor.active) return
  const draft = sketchEditor.draft
  if (sketchEditor.doneProblem && sketchEditor.previewStatus !== 'error') {
    // Statically unbuildable (nothing closed yet, an outline crossing the axis…): nothing
    // to preview, and the toolbar already says why.
    clearSketchPreview()
    sketchEditor.previewStatus = 'idle'
    scheduleRender()
    return
  }
  sketchEditor.previewStatus = 'building'
  const params = JSON.parse(JSON.stringify({ center: [0, 0, 0], slices: draft.slices, extrusion: draft.extrusion }))
  sketchPreviewChannel
    .request({ kind: 'build', op: 'primitive.sketch', params, resolution: documentStore.resolution })
    .then((outcome) => {
      if (outcome.superseded || !sketchEditor.active || sketchEditor.draft !== draft) return
      const result = /** @type {import('../../core/kernel/evaluationJob.js').BuildResult} */ (outcome.result)
      if (result.error || !result.geometry) {
        sketchEditor.previewStatus = 'error'
        sketchEditor.previewError = result.error ?? 'This sketch could not be built'
        clearSketchPreview()
        scheduleRender()
        return
      }
      sketchEditor.previewStatus = 'ok'
      sketchEditor.previewError = ''
      const buffer = geom3ToBufferGeometry(toGeom3(/** @type {any} */ (unpackGeometry(result.geometry))))
      if (!viewport || !sketchPreviewMaterial) {
        buffer.dispose()
        return
      }
      if (!sketchPreviewMesh) {
        sketchPreviewMesh = new Mesh(buffer, sketchPreviewMaterial)
        sketchPreviewMesh.name = 'sketch-preview'
        sketchPreviewMesh.renderOrder = 1
        sketchPreviewMesh.matrixAutoUpdate = false
        viewport.graph.scene.add(sketchPreviewMesh)
      } else {
        sketchPreviewMesh.geometry.dispose()
        sketchPreviewMesh.geometry = buffer
      }
      sketchPreviewMesh.matrix.fromArray(/** @type {number[]} */ ([...sketchEditor.frame]))
      sketchPreviewMesh.matrixWorldNeedsUpdate = true
      scheduleRender()
    })
    .catch(() => {
      sketchEditor.previewStatus = 'idle'
    })
}

/** While an existing sketch is open, its committed mesh hides behind the live preview. */
function applySketchBodyVisibility() {
  for (const [id, object] of bodyMeshes) {
    // `TODO/ui-089`: through the user's Hide / Show too, so closing the editor brings back
    // only what the user had not hidden.
    applyViewVisibility(object, object.userData.view ?? {}, isSketchedBody(id))
  }
  scheduleRender()
}

/**
 * Is this the body the sketch editor is drawing over (its mesh is hidden behind the preview)?
 *
 * @param {string} id
 * @returns {boolean}
 */
function isSketchedBody(id) {
  return sketchEditor.active && sketchEditor.bodyId === id
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

// --- bodies (src/render/bodyMeshes.js, TODO/ui-108) ------------------------

/**
 * The 3D view's colours, read from the theme tokens (`TODO/render-008`). Called on mount and on a
 * theme change only, never from the frame or pointer path: `getComputedStyle` forces a style flush.
 * A token three.js cannot use (or no stylesheet at all) is reported and the fallback for the
 * scheme is drawn instead, never black.
 *
 * @returns {Readonly<import('../../render/theme.js').SceneTheme>}
 */
function readCurrentSceneTheme() {
  try {
    return readSceneTheme(getComputedStyle(document.documentElement), theme.value)
  } catch (error) {
    console.error(error)
    return sceneThemeOf(theme.value)
  }
}

/**
 * Recolour the scene's materials for a scene theme: the bodies' (the controller's) and the
 * placement ghost's and sketch preview's, which still live here. A body's user colour is untouched.
 *
 * @param {Readonly<import('../../render/theme.js').SceneTheme>} colors
 */
function applyMaterialTheme(colors) {
  placementGhost.setColor(colors.bodyGhost)
  sketchPreviewMaterial?.color.setHex(colors.bodyGhost)
  bodyScene.applyMaterialTheme(colors)
}

// --- gizmo drag (TODO/ui-012) ---------------------------------------------
// The drag itself is `src/render/gizmoDrag.js`; these are the template's handlers.

/**
 * @param {import('../../render/gizmoDrag.js').GizmoDownEvent} event
 */
function onGizmoHandleDown(event) {
  const body = selected.value.body
  // Exactly one body, per control 4's precondition. The gizmo is not drawn in
  // any other state, so this is a guard rather than a branch. Nor on a part or a repeat
  // body (`TODO/ui-069`), where it is hidden.
  if (!body || body.subPart || body.moveRefusal) return
  gizmoDrag.begin(event, body)
}

/** @param {{ clientX: number, clientY: number, shiftKey?: boolean, pointerType?: string }} event */
function onGizmoHandleMove(event) {
  gizmoDrag.move(event)
}

/** @param {{ cancelled: boolean }} event */
function onGizmoHandleUp(event) {
  // `end` has already dropped the preview, so the record's baked geometry and the object's
  // own transform are never both applied for a frame.
  const commit = gizmoDrag.end(event)
  if (!commit) return
  if (commit.kind === 'translate') transformCommands.translateBy(commit.bodyId, commit.translate)
  else transformCommands.rotateBy(commit.bodyId, commit.rotate)
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
 * The placement ghost and its drop point (`TODO/ui-108`, extraction 3): the controller lives in
 * `src/render/placementGhost.js`. This component supplies the working-plane projection, the
 * orbit's scale, the document's bodies and the overlay, and keeps the Library's drop-target
 * handlers below.
 */
const placementGhost = createPlacementGhost({
  scene: () => viewport?.graph.scene ?? null,
  project: projectPointer,
  mmPerPixel: () => orbit.getMmPerPixel(heightPx),
  resolution: () => documentStore.resolution,
  documentVersion: () => documentStore.version,
  bodies: () => documentStore.raw.bodies(),
  drawSnapGuides: (guides) => updateSnapGuideAnnotations(orbit, guides, widthPx, heightPx, snapGuides),
  onSnapChange: (value) => {
    snapped.value = value
  },
  onVisibleChange: (value) => {
    ghostVisible.value = value
  },
  // The fallback until mount reads the tokens (`onMounted` recolours it).
  color: sceneThemeOf(theme.value).bodyGhost,
})

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

  preview(op, clientXPx, clientYPx, overrides = {}) {
    if (!viewport || !op) return
    // The variant, not the op: two models of one board are two different meshes, so the
    // ghost's caches are keyed by what actually decides the geometry (`TODO/ui-031`).
    placementGhost.preview(op, variantKey(op, overrides), overrides, clientXPx, clientYPx)
    scheduleRender()
  },

  clearPreview() {
    placementGhost.clear()
    scheduleRender()
  },

  commit(op, clientXPx, clientYPx, overrides = {}, place = undefined) {
    const point = placementGhost.dropPoint(op, variantKey(op, overrides), overrides, clientXPx, clientYPx)
    if (!point) return null
    // `TODO/ui-107`: an import's armed session (or a dropped model file) commits through its own
    // `place` — the definition and the records in one transaction — at the same snapped point a
    // Library drop would use. It selects what it placed.
    if (place !== undefined) {
      if (timeline.previewing) return null
      const placedId = place({ x: point.x, y: point.y })
      syncBodies()
      return placedId
    }
    // Every document mutation goes through the command layer, inside a
    // transaction with an origin (CLAUDE.md Architecture). The component never
    // touches the action log itself.
    //
    // One drop can be more than one record (`TODO/ui-030`): a composite recipe
    // has no position param, so placing one is its own record plus a trailing
    // `transform.translate` that supersedes it. The component stays ignorant of
    // which case it is in — it appends what `recordsForDrop` hands back, in
    // order — and the **first** record is the body's lineage root either way,
    // which is the id the document reports and therefore the id to select.
    // `overrides` is the variant chosen on the row before the drag (ui-031) — the
    // same object the preview above was built from, so the board that lands is the
    // board that was shown.
    // Guarded here as well as on the Library's rows: this is the line that
    // actually mutates the log, and a drop that slipped through during a
    // preview would append to the latest document, out of the user's sight.
    if (timeline.previewing) return null
    // A Sketch row (`TODO/sketch-001`) has no geometry until it is drawn, so its drop
    // commits nothing: it opens the editor with the sketch's origin at the drop point,
    // and Done appends the one record. Cancel leaves no body at all.
    if (libraryRow(op).editor === 'sketch') {
      if (sketchMode.value) return null
      sketchCommands.openNew([point.x, point.y, 0])
      return null
    }
    const records = recordsForDrop(op, { x: point.x, y: point.y }, documentStore.raw, overrides)
    // `appendAll`, not a loop of `append` (`TODO/data-003`): a composite's two
    // records are one *drag*, and undo's granularity is one user-meaningful
    // action. Appending them separately would cost two presses of Undo for one
    // drop, the second of which would briefly leave the part sitting at its
    // un-translated origin.
    documentStore.appendAll(records, { origin: 'local' })
    const rootId = records[0].id ?? null
    if (rootId) selection.select(rootId)
    syncBodies()
    return rootId
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
  // Orbit is suspended while sketching, and a plain drag is already claimed by
  // `decideGestureKind`. This guard covers the sub-slop remainder — the few
  // pixels of travel before the gesture resolves — so the locked camera cannot
  // drift a degree or two on the way into every line.
  if (sketchMode.value) return
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
 * Sketch mode short-circuits all of it (`TODO/ui-020`): while it is active a
 * plain drag **draws**, on mouse and touch alike, and orbit is suspended
 * entirely. That is what removes the gesture collision the marquee needed a
 * modifier key to resolve — section 7's Q16 calls this out as a genuine
 * simplification rather than one more special case. Two-finger pinch-zoom and
 * two-finger pan are untouched (they never reach this function), because you
 * still have to be able to get around the plane you are drawing on.
 *
 * Inside the editor, with Select armed, a press that landed on a point handle of the selected
 * outline drags that point (`TODO/sketch-002`) — the handles exist only under Select; a press anywhere else — including on the
 * outline's stroke *between* dots — draws (or, under Select, does nothing), exactly as before.
 *
 * @returns {'orbit' | 'pan' | 'select' | 'marquee' | 'sketch' | 'sketch-idle' | 'sketch-vertex' | 'sketch-scale' | 'sketch-trace'}
 */
function decideGestureKind() {
  if (sketchMode.value) {
    // Set scale armed (`TODO/sketch-003`): a drag draws the calibration line, nothing else.
    if (sketchEditor.imageTool === 'scale') return 'sketch-scale'
    // Auto-trace armed (`TODO/sketch-004`): a drag does nothing; two fingers still pan/zoom.
    if (sketchEditor.imageTool === 'trace') return 'sketch-trace'
    if (sketchHandler.press.kind) return 'sketch-vertex'
    return sketchEditor.tool === 'select' ? 'sketch-idle' : 'sketch'
  }
  const marqueeModifier = pressPointerType === 'mouse' && (pressCtrlKey || pressMetaKey)
  const marqueeToggle = dragMode.value === 'select'
  // Never while previewing (a History step, a Watch, `TODO/io-016`'s Shared view): the box is judged
  // against the *live* document, so it would select bodies that are not on screen — the same reason
  // `pickAt` returns in preview.
  if (!timeline.previewing && (marqueeModifier || marqueeToggle) && !hitsBodyAt(pressStartClientX, pressStartClientY)) {
    marqueeAdditive = pressShiftKey
    return 'marquee'
  }
  return effectiveDragMode()
}

/** @param {PointerEvent} event */
function onPointerDown(event) {
  const canvas = canvasEl.value
  if (!canvas) return
  // `TODO/ui-045`: without this, a **trusted** touch press leaves WebKit free
  // to synthesise its compatibility mouse sequence (`mousedown`/`mouseup`/
  // `click`) once the touch ends — nothing here listens for it, but its mere
  // dispatch is enough to disturb the browser's own hit-testing/gesture state
  // for whichever real touch tap lands on the canvas next, which is exactly
  // the "a trusted tap selects nothing" symptom the finding describes.
  // Calling `preventDefault()` on the *initiating* `pointerdown` is what the
  // Pointer Events spec uses to suppress that compatibility sequence
  // entirely — a synthetic `PointerEvent` in a test has no such sequence to
  // suppress, which is exactly why every existing spec's synthetic taps never
  // surfaced this.
  event.preventDefault()
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
    sketchHandler.press.kind = ''
    sketchHandler.press.index = -1
    if (sketchMode.value) sketchHandler.hitTest(event.clientX, event.clientY)
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
    // A second finger turns a point drag into a pinch: put the point back.
    if (gestureKind === 'sketch-vertex') sketchHandler.endDrag(true)
    // …and a Set scale drag into a pan: the line is abandoned, the tool stays armed.
    if (gestureKind === 'sketch-scale') endScaleDrag(true, 0, 0)
    gestureKind = ''
    sketchHandler.press.kind = ''
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
  if (!previous) {
    // A mouse moving over the canvas with nothing pressed: the sketch Select tool's hover.
    if (sketchMode.value && event.pointerType === 'mouse' && sketchEditor.imageTool === 'scale') {
      // Set scale: the line's free end follows the mouse once the first mark is fixed.
      referenceImage.trackLiveEnd(event.clientX, event.clientY)
      scheduleRender()
      return
    }
    if (sketchMode.value && event.pointerType === 'mouse') {
      snapPointer.has = true
      snapPointer.xPx = event.clientX
      snapPointer.yPx = event.clientY
      sketchDraw.hoverProfile(event.clientX, event.clientY)
      sketchHandler.hover(event.clientX, event.clientY)
      // Where a press would land, snapped (`TODO/sketch-007`).
      hoverSketchSnap(event.clientX, event.clientY, event.shiftKey)
      // The Line chain's rubber band follows the cursor (`TODO/sketch-006`).
      sketchDraw.trackChain(event.clientX, event.clientY, event.shiftKey)
    }
    return
  }
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
      // Anchored at the press point, not here — see `beginSketchDrag`. A press
      // point that does not meet the working plane has no line to start, so the
      // gesture falls back to doing nothing rather than orbiting the locked
      // camera out from under the user.
      if (gestureKind === 'sketch' && !sketchDraw.begin(pressStartClientX, pressStartClientY, pressShiftKey, pressPointerType === 'touch')) gestureKind = ''
      if (gestureKind === 'sketch-vertex' && !sketchHandler.beginDrag(pressStartClientX, pressStartClientY)) gestureKind = ''
      if (gestureKind === 'sketch-scale' && !beginScaleDrag()) gestureKind = ''
    }
    if (gestureKind === 'sketch-scale') {
      updateScaleDrag(event.clientX, event.clientY)
      return
    }
    if (gestureKind === 'sketch-vertex' || gestureKind === 'sketch') {
      snapPointer.has = true
      snapPointer.xPx = event.clientX
      snapPointer.yPx = event.clientY
    }
    if (gestureKind === 'sketch-vertex') {
      sketchHandler.updateDrag(event.clientX, event.clientY, event.shiftKey)
      return
    }
    if (gestureKind === 'sketch') {
      sketchDraw.update(event.clientX, event.clientY, event.shiftKey)
      return
    }
    // Select never draws, and the locked camera stays put (`TODO/sketch-005`) — nor does an
    // Auto-trace press that wobbled (`TODO/sketch-004`).
    if (gestureKind === 'sketch-idle' || gestureKind === 'sketch-trace') return
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
  const wasSketch = wasPressPointer && gestureKind === 'sketch'
  const wasSketchIdle = wasPressPointer && gestureKind === 'sketch-idle'
  const wasVertexDrag = wasPressPointer && gestureKind === 'sketch-vertex'
  const wasScaleDrag = wasPressPointer && gestureKind === 'sketch-scale'
  const wasTraceWobble = wasPressPointer && gestureKind === 'sketch-trace'
  const tappedVertex = isClick && sketchHandler.press.kind === 'vertex' ? sketchHandler.press.index : -1
  sketchHandler.press.kind = ''
  sketchHandler.press.index = -1
  const pressX = pressStartClientX
  const pressY = pressStartClientY
  pressId = -1
  gestureKind = ''

  if (wasVertexDrag) {
    sketchHandler.endDrag(event.type === 'pointercancel')
    return
  }

  if (wasScaleDrag) {
    endScaleDrag(event.type === 'pointercancel', event.clientX, event.clientY)
    return
  }

  if (wasTraceWobble) {
    // A finger that wobbled past the tap slop still means "here": trace at the press point.
    if (event.type !== 'pointercancel') traceTap(pressX, pressY)
    return
  }

  if (wasSketch) {
    // `pointercancel` (bound to this same handler) abandons the line rather
    // than committing a gesture the user never finished — the same rule the
    // marquee and the gizmo drag already follow.
    sketchDraw.end(event.type === 'pointercancel')
    return
  }

  if (wasSketchIdle) {
    // A drag under Select drew nothing; the *press* still picks whatever it landed on, so a
    // finger that wobbled past the tap slop selects instead of doing nothing at all.
    if (event.type !== 'pointercancel') sketchDraw.pick(pressX, pressY)
    return
  }

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
  if (isClick && sketchMode.value && sketchEditor.imageTool === 'scale') {
    // Set scale (`TODO/sketch-003`): a tap fixes a ruler mark. Mouse and touch alike, no modifier.
    if (event.type !== 'pointercancel') scaleTap(event.clientX, event.clientY)
    return
  }
  if (isClick && sketchMode.value && sketchEditor.imageTool === 'trace') {
    // Auto-trace (`TODO/sketch-004`): a tap traces the part under it. Mouse and touch alike.
    if (event.type !== 'pointercancel') traceTap(event.clientX, event.clientY)
    return
  }
  if (isClick && sketchMode.value && sketchEditor.tool === 'line') {
    // Line: a tap or click fixes the next vertex — no hover, no modifier, any pointer type
    // (`TODO/sketch-006`). Picking an outline is Select's job; a cancelled press does nothing.
    if (event.type !== 'pointercancel') sketchDraw.lineTap(event.clientX, event.clientY, event.shiftKey, event.pointerType === 'touch')
    return
  }
  if (isClick && sketchMode.value) {
    // A tap on a point dot picks the point (`TODO/sketch-002`); anywhere else picks an outline.
    if (tappedVertex >= 0 && event.type !== 'pointercancel') sketchEditor.selectVertex(tappedVertex)
    else sketchDraw.pick(event.clientX, event.clientY)
    return
  }
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
  // The exact point first; only a miss tries the quarter-pixel neighbours, so a ray that
  // fell through the zero-width crack on a shared triangle edge still finds the body
  // (`PICK_OFFSETS_PX`, found by `TODO/core-035`). Click-time only, never per frame.
  for (const [dxPx, dyPx] of PICK_OFFSETS_PX) {
    ndcFromClient(clientXPx + dxPx, clientYPx + dyPx, viewportRect, scratchNdc)
    pickNdc.set(scratchNdc.x, scratchNdc.y)
    raycaster.setFromCamera(pickNdc, viewport.graph.camera)
    // `TODO/ui-089`: the raycaster reports hidden meshes too; a click goes through them.
    const hit = firstDrawnHit(raycaster.intersectObjects(bodiesGroup.children, true))
    if (hit === null) continue
    const object = hit.object
    return { bodyId: object.name, partName: object.userData.partName }
  }
  return null
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
  // §14, point 4: body selection is cleared on entering preview and the
  // Inspector reads `(nothing selected)` throughout. Letting a click select a
  // *previewed* body would put the Inspector and a disabled gizmo on an object
  // that is not in the document — the looks-live-but-isn't case again.
  if (timeline.previewing) return
  // While the sketch editor is open a tap picks outlines (`pickSketchProfile`), never
  // a solid: a body in the selection would light a Union button in a mode where that
  // toolbar is not even on screen.
  if (sketchMode.value) return
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
      // `TODO/ui-089`: a hidden body is never marqueed, and a body with hidden parts is
      // judged by the parts still drawn.
      const bounds = drawnBoundsOf([body])
      if (bounds === null) continue
      const [minMm, maxMm] = bounds
      updateBoxScreenBounds(orbit, minMm, maxMm, widthPx, heightPx, boxScreenBounds)
      if (marqueeIntersectsBox(marqueeRect, boxScreenBounds)) enclosed.push(body.id)
    }
  }
  selection.selectMany(enclosed, additive)
}

// --- chrome + gizmo input (same camera model as the drags above) ----------

/**
 * Frame the camera on everything in the document (`TODO/io-001`).
 *
 * Runs when a whole document is *loaded* — an autosave restore or an Open —
 * never on an edit. A loaded project whose geometry sits outside the default view
 * would otherwise read as an empty scene, and a user who had panned away before
 * reloading would reopen the app to what looks like lost work
 * (`interaction-model-qa.md` §10). Orientation is kept; only target and distance
 * move. Reads the summaries' plain `bounds`, so no geometry is touched.
 *
 * `TODO/ui-089`: a project that comes back with things hidden is framed on what is still
 * drawn, measured from the geometry; with nothing drawn at all, on everything, as before.
 */
function frameLoadedContent() {
  // The live document, as before; only the Shared view (`TODO/io-016`) frames what is on screen,
  // the watched project. Any other preview (a Split sheet's pieces) must not change the framing.
  const summaries = props.presentation ? announcedBodies.value : documentStore.bodies
  if (summaries.length === 0) return
  if (summaries.some((body) => body.viewHidden || body.viewHiddenParts)) {
    const drawn = drawnBoundsOf(props.presentation ? renderSource().bodies() : documentStore.raw.bodies())
    if (drawn !== null) {
      orbit.frameBounds(drawn[0], drawn[1], heightPx > 0 ? widthPx / heightPx : 1)
      scheduleRender()
      return
    }
  }
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const body of summaries) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], body.bounds[0][axis])
      max[axis] = Math.max(max[axis], body.bounds[1][axis])
    }
  }
  orbit.frameBounds(min, max, heightPx > 0 ? widthPx / heightPx : 1)
  scheduleRender()
}

// --- lifecycle ------------------------------------------------------------

/**
 * The browser released the GPU (`TODO/render-006`): a background tab, a backgrounded iOS app, a
 * driver reset. `preventDefault` is what allows the context to be restored at all.
 *
 * @param {Event} event
 */
function onContextLost(event) {
  event.preventDefault()
  // The assistant's capture_view renders through this context: with it gone, the agent stops
  // offering the tool rather than offering one that fails (`TODO/ai-007`).
  setViewportCapture(null)
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  // Ignored unless drawing: a repeat event during the wait must not cut it short.
  contextRecovery.lost()
}

/**
 * The browser handed the context back. three.js's own handler, registered on the canvas before
 * this one, has already reset its internal state; `rebuildGpuResources` marks what it re-uploads.
 */
function onContextRestored() {
  if (!viewport) return
  if (rebuildGpuResources(viewport.renderer, viewport.graph.scene) === null) return
  resumeDrawing()
}

/** Back to drawing: the banner goes, capture_view comes back, and the first frame is scheduled. */
function resumeDrawing() {
  if (!viewport) return
  contextRecovery.restored()
  setViewportCapture(createOffscreenCapture({ renderer: viewport.renderer, graph: viewport.graph }))
  // Re-applies the size (a fresh canvas starts at 300×150) and schedules the frame.
  measure()
}

/** @param {HTMLCanvasElement | null | undefined} canvas */
function attachContextListeners(canvas) {
  canvas?.addEventListener('webglcontextlost', onContextLost)
  canvas?.addEventListener('webglcontextrestored', onContextRestored)
}

/** @param {HTMLCanvasElement | null | undefined} canvas */
function detachContextListeners(canvas) {
  canvas?.removeEventListener('webglcontextlost', onContextLost)
  canvas?.removeEventListener('webglcontextrestored', onContextRestored)
}

let restoring = false

/**
 * **Restore view** (`TODO/render-006`): dispose the renderer and draw the same scene graph through
 * a fresh one. On the same canvas if its context is alive again, otherwise on a new canvas
 * element, since a canvas whose context stays lost can never give out another. Never a page
 * reload: the document, both undo stacks, the selection, the camera and the kernel worker are
 * untouched.
 */
async function onRestoreView() {
  if (!viewport || restoring) return
  restoring = true
  let ok = false
  try {
    detachContextListeners(canvasEl.value)
    if (viewport.isContextLost()) {
      canvasKey.value += 1
      await nextTick()
    }
    const canvas = canvasEl.value
    if (canvas) {
      // three's listeners go on in the renderer's constructor, ahead of the app's, as on mount.
      viewport.replaceRenderer(canvas)
      attachContextListeners(canvas)
      ok = !viewport.isContextLost()
    }
  } catch {
    ok = false
    attachContextListeners(canvasEl.value)
  } finally {
    restoring = false
  }
  if (ok) resumeDrawing()
  else contextRecovery.attemptFailed()
}

/** One token read per theme change, after `useTheme` has set `<html data-theme>`. */
function onThemeChange() {
  const colors = readCurrentSceneTheme()
  applyMaterialTheme(colors)
  viewport?.graph.setTheme(colors)
  scheduleRender()
}

/**
 * The Line chain's keys (`TODO/sketch-006`): Esc finishes (twice in a row cancels), Enter
 * finishes, Backspace removes the last point. They act only while the Line is armed with a
 * chain live (Esc also for the "twice" window), never in a text field, and mark the event
 * handled so the app-wide Backspace-deletes-the-selection shortcut stands down.
 *
 * @param {KeyboardEvent} event
 */
function onSketchChainKey(event) {
  // Esc stands an armed Set scale down (`TODO/sketch-003`) — from the length field too.
  if (sketchMode.value && sketchEditor.imageTool === 'scale' && event.key === 'Escape' && !event.repeat) {
    event.preventDefault()
    sketchEditor.cancelScale()
    return
  }
  // …and an armed Auto-trace (`TODO/sketch-004`), keeping what it traced.
  if (sketchMode.value && sketchEditor.imageTool === 'trace' && event.key === 'Escape' && !event.repeat) {
    event.preventDefault()
    sketchEditor.finishTrace()
    return
  }
  if (!sketchMode.value || sketchEditor.tool !== 'line') return
  if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return
  if (isTextEntry(event.target)) return
  if (event.key === 'Escape') {
    if (event.repeat) return
    if (sketchEditor.escapeChain() !== 'none') event.preventDefault()
  } else if (event.key === 'Enter') {
    // Enter on a focused button is that button's click, not "finish".
    if (event.target instanceof HTMLElement && event.target.closest('button, a, [role="button"]')) return
    if (!sketchEditor.chainLive) return
    event.preventDefault()
    sketchEditor.finishChain()
  } else if (event.key === 'Backspace' && !event.shiftKey) {
    if (!sketchEditor.chainLive) return
    event.preventDefault()
    sketchEditor.undoPoint()
  }
  if (event.defaultPrevented) {
    sketchDraw.drawChain()
    scheduleRender()
  }
}

/** @type {(() => void) | null} */
let unregisterTarget = null
/** @type {(() => void)[]} */
const stopWatchers = []

onMounted(() => {
  const canvas = canvasEl.value
  if (!canvas) return
  // First paint: `useTheme()` (in setup) has already written `<html data-theme>`, so this one read
  // sees the resolved theme's tokens, and every material and the scene start in those colours.
  const colors = readCurrentSceneTheme()
  bodyScene.createMaterials(colors)
  sketchPreviewMaterial = createGhostMaterial(colors.bodyGhost)
  placementGhost.setColor(colors.bodyGhost)

  try {
    viewport = createViewport(canvas, { fovDeg: orbit.fovDeg, theme: colors })
    viewport.graph.scene.add(bodiesGroup)
    referenceImage.attach(viewport.graph.scene)
    // `TODO/ai-007`: the assistant's capture_view renders this scene offscreen, with its own
    // camera and meshes, so the user's view is never moved (`src/render/offscreenCapture.js`).
    setViewportCapture(createOffscreenCapture({ renderer: viewport.renderer, graph: viewport.graph }))
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
  attachContextListeners(canvas)

  unregisterTarget = placement.registerTarget(dropTarget)
  stopWatchers.push(
    watch(() => documentStore.version, syncBodies),
    // Entering, leaving or moving a preview changes what is on screen without
    // changing the document, so it needs its own trigger.
    watch(() => timeline.previewStep, syncBodies),
    // `TODO/ai-017`: Watch shows the Assistant's fork, which changes with every tool call and
    // with no live-document mutation at all; starting and ending a Watch moves this too.
    watch(() => timeline.watchRevision, syncBodies),
    // The Show hidden parts toggle (`TODO/ui-047`) changes what is on screen with
    // no document mutation at all — spreading the reactive Set into a fresh array
    // is what makes this getter re-run on every add/delete, since two different
    // arrays are never `===` even when their contents happen to match.
    watch(() => [...hiddenPartVisibility.shown], syncBodies),
    // A loaded document (restore / Open), as opposed to an edit: frame it. Declared
    // after the `syncBodies` watcher so the meshes exist before the camera moves.
    watch(() => documentStore.loadRevision, frameLoadedContent),
    // `TODO/io-016`: the Shared view's project arrives through Watch, not a load; frame it too.
    watch(
      () => timeline.watchRevision,
      () => {
        if (props.presentation) frameLoadedContent()
      },
    ),
    // The sketch editor (`TODO/sketch-001`). Opening it aims the camera straight at the
    // active slice and hides the edited body's own mesh behind the live preview; every
    // draft edit re-projects the outlines and asks the worker for a new preview.
    watch(
      () => sketchEditor.active,
      (active) => {
        if (active) {
          sketchDraw.end(true)
          sketchHandler.endDrag(true)
          aimAtSketch()
        } else {
          sketchDraw.end(true)
          sketchHandler.drag.active = false
          sketchHandler.drag.beforeDraft = null
          clearSketchPreview()
          // The photo is a tracing aid: it leaves the scene, and its memory, with the editor.
          scaleDrag.active = false
          referenceImage.release()
        }
        applySketchBodyVisibility()
        syncSketchPaths(true)
        requestSketchPreview()
      },
    ),
    watch(
      () => sketchEditor.draft,
      () => {
        syncSketchPaths(true)
        // A point drag replaces the draft on every move; the worker builds the preview once,
        // on release (`sketchHandler.endDrag`), rather than once per pointer event.
        if (!sketchHandler.drag.active) requestSketchPreview()
        scheduleRender()
      },
    ),
    watch(
      () => [
        sketchEditor.activeSlice,
        sketchEditor.selectedProfileId,
        sketchEditor.hoverProfileId,
        sketchEditor.selectedVertex,
        sketchEditor.hoverVertex,
        sketchEditor.tool,
        sketchEditor.chainPointCount,
      ],
      () => {
        syncSketchPaths(true)
        scheduleRender()
      },
    ),
    // A marker left over from the last tool, slice or snap state would point at nothing.
    watch(() => [sketchEditor.tool, sketchEditor.activeSlice, sketchEditor.snapEnabled], () => sketchSnapper.hide()),
    watch(() => documentStore.version, applySketchBodyVisibility),
    // The reference photo (`TODO/sketch-003`): which one, where, and how opaque all live in the
    // draft; a photo added this session lives in the editor until Done.
    watch(
      () => [sketchEditor.active, sketchEditor.draft, sketchEditor.activeSlice, sketchEditor.assetsVersion, sketchEditor.frame, documentStore.version],
      () => referenceImage.sync(),
    ),
    watch(
      () => [sketchEditor.imageTool, sketchEditor.scaleAPx, sketchEditor.scaleBPx],
      () => {
        referenceImage.syncOverlay()
        scheduleRender()
      },
    ),
    watch(() => selection.ids, applySelectionMaterial, { deep: true }),
    watch(() => alignReference.originOnly, applySelectionMaterial),
    // The object list's hover (`TODO/ui-049`). The store hands out a fresh object only on
    // a real change, so this fires at hover-change rate, never pointer rate.
    // `TODO/ui-092`: a Prompts view row's parts, at the same change rate.
    watch([() => hoverHighlight.target, () => hoverHighlight.many], applyHover),
    // A Repeat session's target outlines (`TODO/ui-069`): its seed and ticked targets.
    watch(() => [repeatSession.seed?.bodyId, repeatSession.outlined.join(',')], applyRepeatOutlines),
    // The Inspector's colour picker, while it is open (`TODO/ui-037`): the mesh
    // follows every `input` event with no document write. Repaint only — the
    // selection has not changed, so the twins stay as they are.
    watch(() => [colorPreview.bodyId, colorPreview.subPart, colorPreview.color], paintBodies),
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
  window.addEventListener('keydown', onSketchChainKey)
  // The Line chain's Escape stays ahead of the overlay stack (`TODO/ui-110`).
  unregisterChainYield = registerEscapeYield(() => sketchMode.value && sketchEditor.tool === 'line' && sketchEditor.chainLive)
  window.addEventListener('keydown', onSnapShiftKey)
  window.addEventListener('keyup', onSnapShiftKey)
  window.addEventListener('keydown', gizmoDrag.shiftKey)
  window.addEventListener('keyup', gizmoDrag.shiftKey)
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, { passive: true })

  // Follow a theme change, whether the user picked it in Help or the OS flipped it.
  stopThemeWatch = useTheme().onChange(onThemeChange)

  measure()
  // A document that already has content (a reload, a loaded file) renders on
  // mount rather than waiting for the next mutation.
  syncBodies()
  if (documentStore.loadRevision > 0 || props.presentation) frameLoadedContent()
})

onBeforeUnmount(() => {
  setViewportCapture(null)
  // The viewport is the only thing that can draw or close the editor, so it must not
  // outlive it — a draft left open with no surface to finish it on is a stuck mode.
  sketchEditor.close()
  clearSketchPreview()
  sketchPreviewMaterial?.dispose()
  sketchPreviewMaterial = null
  referenceImage.dispose()
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  unregisterTarget?.()
  unregisterTarget = null
  for (const stop of stopWatchers.splice(0)) stop()
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('keydown', onSketchChainKey)
  unregisterChainYield?.()
  window.removeEventListener('keydown', onSnapShiftKey)
  window.removeEventListener('keyup', onSnapShiftKey)
  window.removeEventListener('keydown', gizmoDrag.shiftKey)
  window.removeEventListener('keyup', gizmoDrag.shiftKey)
  gizmoDrag.clearStall()
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure)
  stopThemeWatch?.()
  stopThemeWatch = null
  detachContextListeners(canvasEl.value)
  contextRecovery.dispose()
  bodyScene.dispose()
  placementGhost.dispose()
  viewport?.dispose()
  viewport = null
})
</script>

<template>
  <div
    ref="rootEl"
    class="viewport"
    data-testid="viewport"
    :data-image-drop="imageDrop.dropActive.value ? 'true' : 'false'"
    @dragover="imageDrop.onDragOver"
    @dragleave="imageDrop.onDragLeave"
    @drop="imageDrop.onDrop"
    :data-drag-mode="dragMode"
    :data-dragging="isDragging ? 'true' : 'false'"
    :data-camera-azimuth="overlay.azimuthDeg.toFixed(2)"
    :data-camera-elevation="overlay.elevationDeg.toFixed(2)"
    :data-camera-distance="overlay.distanceMm.toFixed(2)"
    :data-camera-target="overlay.target"
    :data-frames-rendered="framesRendered"
    :data-webgl="webglError ? 'unavailable' : contextState === 'ready' ? 'ready' : 'lost'"
    :data-body-count="announcedBodies.length"
    :data-selected-id="selection.onlyId ?? ''"
    :data-selected-count="selection.count"
    :data-xray-twins="bodyCounts.xrayTwins"
    :data-hover="hoverHighlight.target ? (hoverHighlight.target.partName === null ? hoverHighlight.target.bodyId : `${hoverHighlight.target.bodyId}/${hoverHighlight.target.partName}`) : ''"
    :data-hover-bodies="hoverHighlight.hoveredBodyIds.join(',')"
    :data-hover-twins="bodyCounts.hoverTwins"
    :data-repeat-outlines="bodyCounts.repeatOutlines"
    :data-hover-transient="bodyCounts.hoverTransient"
    :data-placing="placement.isDragging ? 'true' : 'false'"
    :data-placement-armed="placement.armed ? 'true' : 'false'"
    :data-ghost="ghostVisible ? 'visible' : 'hidden'"
    :data-snapped="snapped ? 'true' : 'false'"
    :data-transforming="preview.isActive ? 'true' : 'false'"
    :data-previewing="timeline.previewing ? 'true' : 'false'"
    :data-presentation="presentation ? 'true' : undefined"
    :data-sketch-mode="sketchMode ? 'true' : 'false'"
    :data-sketch-body="sketchEditor.bodyId ?? ''"
    :data-sketch-slice="sketchEditor.activeSlice"
    :data-sketch-selected="sketchEditor.selectedProfileId"
    :data-sketch-vertex="sketchEditor.selectedVertex"
    :data-sketch-tool="sketchMode ? sketchEditor.tool : ''"
    :data-sketch-chain-points="sketchMode ? sketchEditor.chainPointCount : 0"
    :data-sketch-preview="sketchEditor.previewStatus"
    :data-sketch-panel="sketchEditor.panel"
    :data-reference-image="referenceImageState"
    :data-scale-step="sketchMode ? sketchEditor.scaleStep : ''"
    :data-image-tool="sketchMode ? sketchEditor.imageTool : ''"
  >
    <!-- `:key`: Restore view swaps in a fresh canvas element when the old context stays lost
         (TODO/render-006), keeping every handler below. -->
    <canvas
      :key="canvasKey"
      ref="canvasEl"
      class="viewport__canvas"
      :class="{
        'viewport__canvas--sketch-select': sketchMode && sketchEditor.tool === 'select' && sketchEditor.imageTool === '',
        'viewport__canvas--sketch-draw': sketchMode && (sketchEditor.tool !== 'select' || sketchEditor.imageTool !== ''),
      }"
      data-testid="viewport-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="clearSketchHover"
      @wheel="navigation.wheel"
      @contextmenu.prevent
    />

    <!-- TODO/ui-107: an import's armed placement session — the pointer surface over the canvas
         (under every other overlay, so the chrome stays usable) and its chip. -->
    <PlacementSession v-if="!presentation" @wheel="navigation.wheel" />
    <ModelImportStatus v-if="!presentation" />

    <p v-if="webglError" class="viewport__error" data-testid="viewport-webgl-unavailable">
      {{ webglError }}
    </p>
    <!-- TODO/render-006: the browser released the GPU; the view restores itself or offers to. -->
    <ViewportContextBanner
      v-else-if="contextState !== 'ready'"
      :state="contextState"
      :failures="contextFailures"
      :presentation="presentation"
      @restore="onRestoreView"
    />

    <!-- The scene's contents, in the DOM. Not decoration: it is what makes the
         placed bodies assertable and announceable without pixel-picking a
         canvas, and it is the minimal "is this selected?" signal TODO/ui-010
         asks for. The inspector that will *edit* a body is ui-011's.
         `data-body-bounds` and `data-body-volume` (TODO/ui-027) are for a
         fillet/chamfer spec: the bounding box is *unchanged by design* for a
         rim op (`fillet.js`'s own module doc), so `data-body-bounds` alone
         cannot confirm one actually ran — `data-body-volume` is the real
         signal, since rim material is genuinely removed either way.
         A composite's volume needs a kernel union, which runs in the evaluation
         worker (TODO/core-029): until it lands the attribute is ABSENT, never a
         placeholder number — a spec waits for it rather than reading a guess.
         `data-view-hidden` / `data-view-hidden-parts` (TODO/ui-089): the user's Hide in
         the view, which the canvas then does not draw. -->
    <ul class="viewport__bodies" data-testid="scene-bodies">
      <li
        v-for="body in announcedBodies"
        :key="body.id"
        :data-testid="`scene-body-${body.id}`"
        :data-body-id="body.id"
        :data-body-op="body.op"
        :data-body-name="body.name"
        :data-body-center="`${body.center[0].toFixed(2)},${body.center[1].toFixed(2)},${body.center[2].toFixed(2)}`"
        :data-body-bounds="`${body.bounds[0][0].toFixed(2)},${body.bounds[0][1].toFixed(2)},${body.bounds[0][2].toFixed(2)},${body.bounds[1][0].toFixed(2)},${body.bounds[1][1].toFixed(2)},${body.bounds[1][2].toFixed(2)}`"
        :data-body-volume="body.volumeMm3 === null ? undefined : body.volumeMm3.toFixed(3)"
        :data-selected="selection.has(body.id) ? 'true' : 'false'"
        :data-selection-role="selectionRole(body.id)"
        :data-body-color="announcedColor(body)"
        :data-body-part-colors="announcedPartColors(body)"
        :data-view-hidden="body.viewHidden ? 'true' : undefined"
        :data-view-hidden-parts="body.viewHiddenParts?.join('|')"
      >
        {{ body.name }}
      </li>
    </ul>

    <!-- The selection *response* (TODO/ui-011): dimension lines under the
         gizmo, both attached to whatever is selected right now, both
         non-interactive so neither can swallow the click that selects. -->
    <DimensionLines v-if="!presentation" :annotations="dimensionAnnotations" />
    <!-- Not while an import waits to be placed (TODO/ui-107): the gizmo is stacked above the
         session layer, so a press on a selected body's ring would turn that body instead of
         moving the ghost. It comes back on the placed model, which the commit selects. -->
    <Gizmo
      v-if="!timeline.previewing && !presentation && !placement.armed"
      :annotation="gizmoAnnotation"
      :dial="dialAnnotation"
      :ruler="rulerAnnotation"
      @handle-down="onGizmoHandleDown"
      @handle-move="onGizmoHandleMove"
      @handle-up="onGizmoHandleUp"
      @handle-click="onGizmoHandleClick"
    />
    <!-- The marquee-select rectangle (TODO/ui-024): drawn only while a
         marquee drag is in progress, above the gizmo/dimension overlays so
         it is never occluded by them mid-drag. -->
    <MarqueeSelect v-if="!presentation" :rect="marqueeRect" />
    <!-- The dashed placement guides (TODO/ui-013): drawn only while a drag is
         being held in line with an existing item, above the selection overlays
         so the alignment being offered is never occluded mid-drag. -->
    <template v-if="!presentation">
      <SnapGuides :guides="snapGuides" />
      <CutPlaneOverlay :annotation="cutPlaneAnnotation" />
      <SplitSheet />
      <!-- The Repeat panel (TODO/ui-069): open for a whole Repeat session, no backdrop. -->
      <RepeatSheet />
    </template>
    <!-- The sketch editor's outlines (TODO/sketch-001): the draft's profiles, the
         live drag, and the revolve axis. Pointer-transparent, so the canvas keeps every
         gesture (ui-020 finding #1). -->
    <!-- The reference photo's Set scale line and corner badge (TODO/sketch-003). The photo
         itself is in WebGL; this is pointer-transparent furniture over it. -->
    <ReferenceImageOverlay v-if="sketchMode" :overlay="referenceOverlay" />
    <SketchStrokes v-if="sketchMode" :paths="sketchPaths" :draft="sketchDraftPath" :axis="sketchAxis" :chain="sketchChain" :snap="sketchSnap" />
    <VertexHandles v-if="sketchMode && sketchHandles.vertices.length > 0" :handles="sketchHandles" />

    <Grid
      :mm-per-pixel="overlay.mmPerPixel"
      :minor-mm="overlay.minorMm"
      :major-mm="overlay.majorMm"
    />
    <OrientationGizmo
      :azimuth-deg="overlay.azimuthDeg"
      :elevation-deg="overlay.elevationDeg"
      :disabled="sketchMode"
      @snap="navigation.snapView"
    />
    <!-- The Sketch toolbar (TODO/sketch-001): mounted only while the editor is open,
         in the top-left slot the Operations toolbar yields. Its Slices / Extrude panels
         open in the sheet below — a bottom sheet on a narrow viewport. -->
    <!-- Set scale's banner takes the toolbar's slot while it is armed (TODO/sketch-003). -->
    <SketchToolbar v-if="sketchMode && sketchEditor.imageTool === ''" />
    <ScaleTool v-if="sketchMode" />
    <!-- …and so does Auto-trace's (TODO/sketch-004). -->
    <TraceTool v-if="sketchMode" />
    <SketchPanelSheet v-if="sketchMode" @activate-slice="aimAtSketch" />
    <!-- The Operations toolbar (TODO/ui-014): viewport chrome, in the same
         band as the navigation controls below and deliberately *not* a row in
         the Library panel beside Cube and Cylinder. CLAUDE.md: creation and
         operation are never the same list, and an operation control stays
         disabled until its operands are actually selected. -->
    <!-- Hidden while the sketch editor is open: its buttons operate on selected
         *solids*, and the editor selects only outlines (see `pickSketchProfile`), so
         every one of them would be permanently disabled — dead chrome sitting in the one
         top-left toolbar slot the Sketch toolbar needs. -->
    <OperationsToolbar v-if="!sketchMode && !presentation" />
    <NavigationChrome
      :drag-mode="dragMode"
      :can-select="!presentation"
      :sketching="sketchMode"
      :raised="navRaised"
      :sketch-sheet="sketchMode && sketchEditor.panel !== ''"
      @step="navigation.step"
      @zoom="navigation.zoom"
      @mode="navigation.setMode"
      @reset="navigation.reset"
    />
  </div>
</template>

<style scoped>
/* TODO/ui-107: while an import waits to be placed, its chip takes the bottom row of the view, and
   the navigation chrome and the scale readout move up by its height (they read this variable),
   so the chip never covers the zoom buttons or the readout at any width. */
.viewport[data-placement-armed='true'] {
  --layout-placement-chip-room: 60px;
}

.viewport {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--surface-0);
  /* A size container (`TODO/sketch-001`): the sketch editor's toolbar, sheet and the nav
     chrome's fold respond to the *viewport's* width, not the window's — at the 820px
     tablet reference the viewport column is 390px wide, the same as a phone. */
  container: viewport / inline-size;
}

/* §14, point 2: "the viewport gets an amber inset outline." An `outline` rather
   than a border so it costs the canvas no layout, and `pointer-events: none` on
   the pseudo-element so the mode indicator can never eat an orbit drag. Amber
   is the same colour the preview strip uses — one colour for one idea. */
.viewport[data-previewing='true']:not([data-presentation='true'])::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  outline: 3px solid var(--warn);
  outline-offset: -3px;
  z-index: 5;
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

/* Sketch editor: an arrow to pick with, a crosshair to draw with — never the orbit hand,
   since a plain drag does not orbit in the editor. */
.viewport__canvas--sketch-select,
.viewport__canvas--sketch-select:active {
  cursor: default;
}

.viewport__canvas--sketch-draw,
.viewport__canvas--sketch-draw:active {
  cursor: crosshair;
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
