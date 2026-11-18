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
import { createCutPlaneAnnotation } from '../../render/cutPlane.js'
import { useSplitSheetStore } from '../../stores/splitSheet.js'
import { useSelectedBody } from '../../composables/useSelectedBody.js'
import {
  createDimensionAnnotation,
  createGizmoAnnotation,
  createDialAnnotation,
  createRulerAnnotation,
  createMarqueeRect,
  createSketchPath,
  createSnapGuideAnnotations,
  updateSnapGuideAnnotations,
} from '../../render/annotate.js'
import { createGizmoDrag } from '../../render/gizmoDrag.js'
import { createFrameContent } from '../../render/frameContent.js'
import { createSketchChainKeys } from '../../render/sketchChainKeys.js'
import { createSketchPathSync } from '../../render/sketchPathSync.js'
import { createOverlaySync } from '../../render/overlaySync.js'
import { useTransformCommands } from '../../composables/useTransformCommands.js'
import { useSketchEditorCommands } from '../../composables/useSketchEditorCommands.js'
import { isTextEntry } from '../../composables/textEntry.js'
import { useTransformPreviewStore } from '../../stores/transformPreview.js'
import { useColorPreviewStore } from '../../stores/colorPreview.js'
import { createEvaluationChannel } from '../../core/kernel/evaluationClient.js'
import { createOrbitCamera } from '../../render/camera.js'
import { createOffscreenCapture, setViewportCapture } from '../../render/offscreenCapture.js'
import { createViewport } from '../../render/scene.js'
import { registerViewportWatchers } from '../../composables/useViewportWatchers.js'
import { createContextHandlers } from '../../render/contextHandlers.js'
import { createContextRecovery } from '../../render/contextRecovery.js'
import { applyViewVisibility } from '../../render/mesh.js'
import { readSceneTheme, sceneThemeOf } from '../../render/theme.js'
import { announcedColor, announcedPartColors, createBodyCounts, createBodyMeshes } from '../../render/bodyMeshes.js'
import { createPlacementGhost } from '../../render/placementGhost.js'
import { createSketchSnap } from '../../render/sketchSnap.js'
import { createSketchHandles } from '../../render/sketchHandles.js'
import { createSketchDraw } from '../../render/sketchDraw.js'
import { createCameraNavigation } from '../../render/cameraNavigation.js'
import { createPointerGestures } from '../../render/pointerGestures.js'
import { createSketchPreview } from '../../render/sketchPreview.js'
import { createViewportDropTarget } from '../../composables/useViewportDropTarget.js'
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
/** The resolved theme's brightness, from the one module that decides it (`TODO/ui-113`): the fallback palette's key. */
const { scheme: theme } = useTheme()
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
 * The marquee-select rectangle's screen geometry (`TODO/ui-024`).
 *
 * Reactive for the same reason `gizmoAnnotation` above is: `MarqueeSelect.vue`
 * draws straight from it. Unlike the camera-driven overlays, this is written
 * directly from the pointer path (`pointer.move`) rather than only from the
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
  projectToSketch: (clientXPx, clientYPx) => pointer.projectToSketch(clientXPx, clientYPx),
  snap: (pointMm, shiftKey, touch) => sketchSnapper.snap(pointMm, shiftKey, touch),
  hideSnap: () => sketchSnapper.hide(),
  isTouchPress: () => pointer.isTouchPress(),
  requestPreview: () => sketchPreview.request(),
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
  project: (clientXPx, clientYPx) => pointer.projectToSketch(clientXPx, clientYPx),
  snap: (pointMm, shiftKey, touch) => sketchSnapper.snap(pointMm, shiftKey, touch),
  hideSnap: () => sketchSnapper.hide(),
  isTouchPress: () => pointer.isTouchPress(),
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

/**
 * The camera mirror, the selection overlays and the cut plane (`TODO/ui-108`):
 * `src/render/overlaySync.js`. The sketch paths follow it, in the same frame.
 */
const overlaySync = createOverlaySync({
  orbit,
  overlay,
  gizmo: gizmoAnnotation,
  dial: dialAnnotation,
  ruler: rulerAnnotation,
  dimensions: dimensionAnnotations,
  cutPlane: cutPlaneAnnotation,
  selectedBody: () => selected.value.body,
  bodyView: (id) => bodyMeshes.get(id)?.userData.view,
  splitSheet,
  gizmoDrag,
  widthPx: () => widthPx,
  heightPx: () => heightPx,
})

function syncOverlay() {
  overlaySync.sync()
  syncSketchPaths()
}

// The plane moves when the sheet's numbers do, not only when the camera does.
watch(
  () => [splitSheet.isOpen, splitSheet.cutMm, splitSheet.axisIndex, splitSheet.previewBounds],
  () => scheduleRender(),
)

// --- the sketch editor (TODO/sketch-001) ---------------------------------

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
  projectToSketch: (clientX, clientY) => pointer.projectToSketch(clientX, clientY),
  scheduleRender: () => scheduleRender(),
})
const { state: referenceImageState, overlay: referenceOverlay } = referenceImage

/**
 * The pointer gestures (`TODO/ui-108`, extraction 5b): the gesture-kind decision, orbit, pan and
 * pinch, raycast picking, the marquee, the sketch hover and Shift re-snap, and Set scale's and
 * Auto-trace's taps and drags. `src/render/pointerGestures.js`. The canvas's pointer events are
 * bound to it in the template.
 */
const pointer = createPointerGestures({
  orbit,
  viewport: () => viewport,
  bodiesGroup,
  bodyMeshes,
  viewportRect,
  widthPx: () => widthPx,
  heightPx: () => heightPx,
  canvas: () => canvasEl.value,
  getMode: () => dragMode.value,
  mouseNavPreset: () => settings.mouseNavPreset,
  isSketching: () => sketchMode.value,
  isPreviewing: () => timeline.previewing,
  sliceZ: () => activeSliceZ(),
  sketchEditor,
  selection,
  documentBodies: () => documentStore.raw.bodies(),
  sketchHandler,
  sketchDraw,
  sketchSnapper,
  referenceImage,
  marqueeRect,
  setDragging: (dragging) => {
    isDragging.value = dragging
  },
  scheduleRender: () => scheduleRender(),
})

/**
 * The sketch outline sync (`TODO/ui-108`): re-projects the draft's outlines, the revolve axis and
 * the chain when something they depend on changed. `src/render/sketchPathSync.js`.
 */
const sketchPathSync = createSketchPathSync({
  orbit,
  sketchEditor,
  paths: sketchPaths,
  axis: sketchAxis,
  draftPath: sketchDraftPath,
  chain: sketchChain,
  handler: sketchHandler,
  draw: sketchDraw,
  snapper: sketchSnapper,
  referenceImage,
  widthPx: () => widthPx,
  heightPx: () => heightPx,
  sliceZ: activeSliceZ,
})

/** @param {boolean} [force] */
function syncSketchPaths(force = false) {
  sketchPathSync.sync(force)
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

// --- the extrusion preview: built in the worker, superseded, never appended -----------

/** The draft's live extrusion ghost (`TODO/ui-108`, step 6): `src/render/sketchPreview.js`. */
const sketchPreview = createSketchPreview({
  editor: sketchEditor,
  channel: createEvaluationChannel('sketch-preview'),
  resolution: () => documentStore.resolution,
  scene: () => viewport?.graph.scene ?? null,
  scheduleRender: () => scheduleRender(),
})

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
  sketchPreview.setColor(colors.bodyGhost)
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
  pointer.pickAt(event.clientX, event.clientY, false)
}

// --- drag placement (the drop-target contract) ----------------------------

/**
 * The placement ghost and its drop point (`TODO/ui-108`, extraction 3): the controller lives in
 * `src/render/placementGhost.js`. This component supplies the working-plane projection, the
 * orbit's scale, the document's bodies and the overlay, and keeps the Library's drop-target
 * handlers below.
 */
const placementGhost = createPlacementGhost({
  scene: () => viewport?.graph.scene ?? null,
  project: (clientXPx, clientYPx) => pointer.projectToWorkingPlane(clientXPx, clientYPx),
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

/** The Library's drop target (`TODO/ui-108`): `src/composables/useViewportDropTarget.js`. */
const dropTarget = createViewportDropTarget({
  root: () => rootEl.value,
  rect: viewportRect,
  hasViewport: () => !!viewport,
  placementGhost,
  scheduleRender: () => scheduleRender(),
  isPreviewing: () => timeline.previewing,
  isSketching: () => sketchMode.value,
  sketchCommands,
  documentStore,
  selection,
  syncBodies: () => syncBodies(),
})

// --- chrome + gizmo input (same camera model as the drags above) ----------

/**
 * Frame the camera on everything in the document when a whole document is loaded (`TODO/io-001`,
 * `TODO/ui-089`): `src/render/frameContent.js`. The live document, as before; only the Shared view
 * (`TODO/io-016`) frames what is on screen, the watched project. Any other preview (a Split
 * sheet's pieces) must not change the framing.
 */
const frameLoadedContent = createFrameContent({
  orbit,
  summaries: () => (props.presentation ? announcedBodies.value : documentStore.bodies),
  rawBodies: () => (props.presentation ? renderSource().bodies() : documentStore.raw.bodies()),
  widthPx: () => widthPx,
  heightPx: () => heightPx,
  scheduleRender: () => scheduleRender(),
})

// --- lifecycle ------------------------------------------------------------

/**
 * The WebGL context-lost and restore handlers (`TODO/render-006`, `TODO/ui-108`):
 * `src/render/contextHandlers.js`. **Restore view** gives the canvas a fresh element through
 * `canvasKey` when the old context stays lost.
 */
const contextHandlers = createContextHandlers({
  viewport: () => viewport,
  canvas: () => canvasEl.value,
  recovery: contextRecovery,
  cancelFrame: () => {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
  },
  measure: () => measure(),
  remountCanvas: async () => {
    canvasKey.value += 1
    await nextTick()
  },
})
const attachContextListeners = contextHandlers.attach
const detachContextListeners = contextHandlers.detach
const onRestoreView = contextHandlers.restoreView

/** One token read per theme change, after `useTheme` has set `<html data-theme>`. */
function onThemeChange() {
  const colors = readCurrentSceneTheme()
  applyMaterialTheme(colors)
  viewport?.graph.setTheme(colors)
  scheduleRender()
}

/** The sketch editor's keys (`TODO/ui-108`): `src/render/sketchChainKeys.js`. */
const onSketchChainKey = createSketchChainKeys({
  isSketching: () => sketchMode.value,
  sketchEditor,
  isTextEntry,
  redraw: () => {
    sketchDraw.drawChain()
    scheduleRender()
  },
})

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
  sketchPreview.createMaterial(colors.bodyGhost)
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
  // `src/composables/useViewportWatchers.js` (`TODO/ui-108`).
  stopWatchers.push(
    ...registerViewportWatchers({
      documentStore,
      timeline,
      hiddenPartVisibility,
      sketchEditor,
      selection,
      alignReference,
      hoverHighlight,
      repeatSession,
      colorPreview,
      presentation: () => props.presentation,
      sketchDraw,
      sketchHandler,
      sketchPreview,
      sketchSnapper,
      pointer,
      referenceImage,
      syncBodies,
      frameLoadedContent,
      aimAtSketch,
      applySketchBodyVisibility,
      syncSketchPaths,
      scheduleRender,
      applySelectionMaterial,
      applyHover,
      applyRepeatOutlines,
      paintBodies,
    }),
  )

  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(rootEl.value)
  }
  window.addEventListener('keydown', onSketchChainKey)
  // The Line chain's Escape stays ahead of the overlay stack (`TODO/ui-110`).
  unregisterChainYield = registerEscapeYield(() => sketchMode.value && sketchEditor.tool === 'line' && sketchEditor.chainLive)
  window.addEventListener('keydown', pointer.shiftKey)
  window.addEventListener('keyup', pointer.shiftKey)
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
  sketchPreview.clear()
  sketchPreview.dispose()
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
  window.removeEventListener('keydown', pointer.shiftKey)
  window.removeEventListener('keyup', pointer.shiftKey)
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
      @pointerdown="pointer.down"
      @pointermove="pointer.move"
      @pointerup="pointer.up"
      @pointercancel="pointer.up"
      @pointerleave="pointer.leave"
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
  z-index: calc(var(--z-canvas-overlay) + 5);
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
  padding: var(--space-5) var(--space-5h);
  transform: translate(-50%, -50%);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: var(--text-size-md);
  text-align: center;
}
</style>
