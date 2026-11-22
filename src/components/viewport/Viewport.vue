<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The 3D viewport: a WebGL canvas plus its screen-space overlays. Three deliberate choices:
 *
 * 1. **One camera, two input paths.** Pointer drags and the `NavigationChrome` buttons call the
 *    *same* `src/render/camera.js` model, so the chrome and the gesture cannot drift apart.
 * 2. **Nothing hot is reactive.** The orbit camera, the three.js viewport, the decoded meshes and
 *    the pointer bookkeeping are plain variables (CLAUDE.md's Performance section). The reactive
 *    overlay state is written at most once per animation frame, from the render callback.
 * 3. **The viewport is the drop target.** It alone knows its rect, its camera and how to project a
 *    screen point onto the working plane, so it registers itself with `src/stores/placement.js`
 *    (TODO/ui-010).
 *
 * Rendering is on demand: a frame is scheduled when something changes, not on a spinning rAF loop.
 */
import { computed, ref, shallowRef, watch } from 'vue'
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
import ClearanceTag from './ClearanceTag.vue'
import { useSplitSheetStore } from '../../stores/splitSheet.js'
import { useSelectedBody } from '../../composables/useSelectedBody.js'
import { useGizmoHandlers } from '../../composables/useGizmoHandlers.js'
import { createFrameContent } from '../../render/frameContent.js'
import { createOverlaySync } from '../../render/overlaySync.js'
import { useTransformCommands } from '../../composables/useTransformCommands.js'
import { useSketchEditorCommands } from '../../composables/useSketchEditorCommands.js'
import { useTransformPreviewStore } from '../../stores/transformPreview.js'
import { useColorPreviewStore } from '../../stores/colorPreview.js'
import { createEvaluationChannel } from '../../core/kernel/evaluationClient.js'
import { createOrbitCamera } from '../../render/camera.js'
import { setViewportCapture } from '../../render/offscreenCapture.js'
import { useViewportOverlays } from '../../composables/useViewportOverlays.js'
import { useViewportBodies } from '../../composables/useViewportBodies.js'
import { useViewportContext } from '../../composables/useViewportContext.js'
import { useViewportPlacement } from '../../composables/useViewportPlacement.js'
import { useViewportLifecycle } from '../../composables/useViewportLifecycle.js'
import { applyViewVisibility } from '../../render/mesh.js'
import { sceneThemeOf } from '../../render/theme.js'
import { createSceneThemeSync } from '../../render/sceneThemeSync.js'
import { announcedColor, announcedPartColors } from '../../render/bodyMeshes.js'
import { createCameraNavigation } from '../../render/cameraNavigation.js'
import { isTextEntry } from '../../composables/textEntry.js'
import { createSketchControllers } from '../../render/sketchControllers.js'
import { createPointerGestures } from '../../render/pointerGestures.js'
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
const isDragging = ref(false)
/**
 * The WebGL context-loss state, handlers and `canvasKey` (`TODO/render-006`, `ui-152`):
 * `src/composables/useViewportContext.js`. The getters are called later, so they may name things below.
 */
const {
  contextState,
  contextFailures,
  contextRecovery,
  canvasKey,
  attachContextListeners,
  detachContextListeners,
  onRestoreView,
} = useViewportContext({
  viewport: () => viewport,
  canvas: () => canvasEl.value,
  cancelFrame: () => cancelFrame(),
  measure: () => measure(),
})

/**
 * The reactive overlay structures the template and the controllers share (`TODO/ui-144`):
 * `src/composables/useViewportOverlays.js`. Allocated once, mutated in place.
 */
const {
  overlay,
  gizmoAnnotation,
  dialAnnotation,
  rulerAnnotation,
  dimensionAnnotations,
  cutPlaneAnnotation,
  marqueeRect,
  snapGuides,
  sketchPaths,
  sketchDraftPath,
  sketchAxis,
  sketchChain,
  sketchHandles,
  sketchSnap,
} = useViewportOverlays()
const splitSheet = useSplitSheetStore()

/**
 * Whether the sketch editor is open (`TODO/sketch-001`). Read everywhere the old sketch
 * mode was: orbit is suspended, a plain drag draws, the Operations toolbar yields the
 * top-left slot, and a click picks outlines instead of bodies.
 */
const sketchMode = computed(() => sketchEditor.active)

// --- non-reactive render state -------------------------------------------

const orbit = createOrbitCamera()
/** @type {import('../../render/scene.js').Viewport | null} */
let viewport = null
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
 * The committed bodies, their selection, hover and Repeat-outline twins, and the body materials
 * (`TODO/ui-108`, `ui-152`): `src/composables/useViewportBodies.js`.
 */
const { bodyCounts, bodyScene, bodiesGroup, bodyMeshes } = useViewportBodies({
  bodies: () => renderSource().bodies(),
  isHiddenShown: (id) => hiddenPartVisibility.isShown(id),
  isSketched: isSketchedBody,
  selection,
  alignReference,
  hoverHighlight,
  repeatSession,
  colorPreview,
  scheduleRender,
})
const { syncBodies, selectionRole, applySelectionMaterial, applyHover, applyRepeatOutlines, paintBodies } = bodyScene

/**
 * The gizmo drag, its template handlers and the toolbar keep-out (`TODO/ui-012`, `ui-131`,
 * `ui-152`): `src/composables/useGizmoHandlers.js`.
 */
const { gizmoDrag, onGizmoHandleDown, onGizmoHandleMove, onGizmoHandleUp, onGizmoHandleClick } = useGizmoHandlers({
  root: () => rootEl.value,
  viewportRect,
  selected: () => selected.value,
  transformCommands,
  syncBodies,
  pickAt: (clientXPx, clientYPx, additive) => pointer.pickAt(clientXPx, clientYPx, additive),
  drag: {
    meshes: bodyMeshes,
    preview,
    gizmo: gizmoAnnotation,
    dial: dialAnnotation,
    ruler: rulerAnnotation,
    orbit,
    widthPx: () => widthPx,
    heightPx: () => heightPx,
    scheduleRender,
    now: () => performance.now(),
  },
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
 * The sketch editor's controllers (`TODO/ui-108` extractions 4a to 4c, `ui-152`): the snap, the point
 * handles, the draw gesture, the extrusion preview, the outline sync and the chain keys.
 * `src/render/sketchControllers.js`. `pointer` is created next, so the factory reaches it lazily.
 */
const { sketchSnapper, sketchHandler, sketchDraw, sketchPreview, syncSketchPaths, onSketchChainKey } =
  createSketchControllers({
    orbit,
    sketchEditor,
    sliceZ: activeSliceZ,
    widthPx: () => widthPx,
    heightPx: () => heightPx,
    viewportRect,
    pointer: () => pointer,
    scheduleRender: () => scheduleRender(),
    referenceImage,
    isSketching: () => sketchMode.value,
    isTextEntry,
    overlays: { sketchSnap, sketchHandles, sketchChain, sketchDraftPath, sketchPaths, sketchAxis },
    channel: createEvaluationChannel('sketch-preview'),
    resolution: () => documentStore.resolution,
    scene: () => viewport?.graph.scene ?? null,
  })

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

// --- drag placement (the drop-target contract) ----------------------------

/**
 * The placement ghost and the Library's drop target (`TODO/ui-108` extractions 3 and 7, `ui-152`):
 * `src/composables/useViewportPlacement.js`.
 */
const { snapped, ghostVisible, placementGhost, dropTarget } = useViewportPlacement({
  viewport: () => viewport,
  pointer: () => pointer,
  orbit,
  widthPx: () => widthPx,
  heightPx: () => heightPx,
  viewportRect,
  root: () => rootEl.value,
  documentStore,
  snapGuides,
  // The fallback until mount reads the tokens (`onMounted` recolours it).
  color: sceneThemeOf(theme.value).bodyGhost,
  isPreviewing: () => timeline.previewing,
  isSketching: () => sketchMode.value,
  sketchCommands,
  selection,
  syncBodies: () => syncBodies(),
  scheduleRender: () => scheduleRender(),
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

/** The scene's colours from the theme tokens (`TODO/render-008`, `ui-152`): `src/render/sceneThemeSync.js`. */
const sceneTheme = createSceneThemeSync({
  scheme: () => theme.value,
  getViewport: () => viewport,
  bodyScene,
  placementGhost,
  sketchPreview,
  scheduleRender: () => scheduleRender(),
})
const readCurrentSceneTheme = sceneTheme.read
const onThemeChange = sceneTheme.onThemeChange

function cancelFrame() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

// The mount and unmount sequence (`TODO/ui-144`): `src/composables/useViewportLifecycle.js`.
useViewportLifecycle({
  rootEl,
  canvasEl,
  webglError,
  orbit,
  overlay,
  getViewport: () => viewport,
  setViewport: (value) => {
    viewport = value
  },
  readCurrentSceneTheme,
  bodyScene,
  bodiesGroup,
  sketchPreview,
  placementGhost,
  referenceImage,
  placement,
  dropTarget,
  sketchEditor,
  pointer,
  gizmoDrag,
  contextRecovery,
  attachContextListeners,
  detachContextListeners,
  watcherDeps: {
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
  },
  onSketchChainKey,
  isChainLive: () => sketchMode.value && sketchEditor.tool === 'line' && sketchEditor.chainLive,
  measure,
  onThemeChange,
  syncBodies,
  cancelFrame,
  shouldFrameOnMount: () => documentStore.loadRevision > 0 || props.presentation,
  frameLoadedContent,
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
      :drag-mode="dragMode"
      @handle-down="onGizmoHandleDown"
      @handle-move="onGizmoHandleMove"
      @handle-up="onGizmoHandleUp"
      @handle-click="onGizmoHandleClick"
    />
    <!-- TODO/ui-153: names the red ghost a shown clearance draws, in the view itself. -->
    <ClearanceTag v-if="!presentation" />
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
