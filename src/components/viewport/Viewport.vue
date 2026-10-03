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
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { Euler, Group as ThreeGroup, Mesh, Raycaster, Vector2, Vector3 } from 'three'
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
import VertexHandles from '../sketch/VertexHandles.vue'
import SnapGuides from './SnapGuides.vue'
import { useSelectedBody } from '../../composables/useSelectedBody.js'
import {
  axisFacing,
  createDimensionAnnotation,
  createOrientedBox,
  createGizmoAnnotation,
  createMarqueeRect,
  createBoxScreenBounds,
  createScreenPoint,
  createSketchPath,
  sketchPointToScreen,
  updateSketchPath,
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
import { useSketchEditorCommands } from '../../composables/useSketchEditorCommands.js'
import { isTextEntry } from '../../composables/textEntry.js'
import { useTransformPreviewStore } from '../../stores/transformPreview.js'
import { useColorPreviewStore } from '../../stores/colorPreview.js'
import { formatMmValue } from '../../core/units.js'
import { isDegenerate } from '../../sketch/entity.js'
import { circleFromDrag, isClosed, polygonFromDrag, profileAtPoint, rectFromDrag, segmentCountOf, toPointsMm } from '../../sketch/profile.js'
import { createEvaluationChannel } from '../../core/kernel/evaluationClient.js'
import { unpackGeometry } from '../../core/kernel/transport.js'
import { createOrbitCamera } from '../../render/camera.js'
import { createViewport } from '../../render/scene.js'
import {
  addXrayTwin,
  BODY_COLORS,
  createBodyMaterial,
  createBodyObject,
  createColorMaterialCache,
  createGhostMaterial,
  createHoverPartMesh,
  createXrayMaterial,
  disposeBodyObject,
  disposeMesh,
  geom3ToBufferGeometry,
  paintBodyObject,
  updateBodyObject,
  bodyObjectIsCurrent,
} from '../../render/mesh.js'
import { colorIntToCssHex, ownOverrideOf } from '../../core/colorOverride.js'
import { PICK_OFFSETS_PX, nearestOnPlane, ndcFromClient, projectToSketchPlane, projectToWorkingPlane } from '../../render/pick.js'
import { evaluateOp, policyFor, toGeom3 } from '../../core/kernel/index.js'
import { boundsOf, hiddenNamesOf, isGroup } from '../../core/kernel/group.js'
import {
  boxAtPoint,
  clearSnap,
  createBoxMm,
  createSnapState,
  ghostBoxAtOrigin,
  ghostOffsetMm,
  libraryRow,
  paramsForDrop,
  recordsForDrop,
  snapToleranceMm,
  updateSnap,
  variantKey,
} from '../../core/library.js'
import { useDocumentStore } from '../../stores/document.js'
import { useHiddenPartVisibilityStore } from '../../stores/hiddenPartVisibility.js'
import { useHoverHighlightStore } from '../../stores/hoverHighlight.js'
import { usePlacementStore } from '../../stores/placement.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useTimelineStore } from '../../stores/timeline.js'
import { useSettingsStore } from '../../stores/settings.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'

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

/**
 * How close, in pixels, a tap has to land to an outline's stroke to pick it — and how
 * close a Line drag has to start to its chain's end, or finish on its first point, to
 * continue or close it (`TODO/sketch-001`). Pixels, converted to millimetres at the
 * moment of use, so "close enough" means the same thing to the hand at every zoom level.
 */
const SKETCH_PICK_TOLERANCE_PX = 14
/**
 * Below this, a sketch drag committed nothing — the Interaction model's explicit
 * degenerate case. Expressed in pixels and converted to millimetres at the
 * moment of the check, so the threshold means the same thing to the user's hand
 * at every zoom level. `CLICK_SLOP_PX` already stops a *motionless* press from
 * becoming a draw at all; this covers the drag that moved a hair further.
 */
const SKETCH_MIN_LENGTH_PX = 3
/** A second Line click within this of a fix, on the same spot, finishes the chain (ms). */
const SKETCH_DOUBLE_TAP_MS = 450
/**
 * A point handle's touch target, across (`TODO/sketch-002`): the 44 px minimum tap target,
 * drawn as a much smaller dot. A press within half of this of a dot grabs it.
 */
const SKETCH_HANDLE_TARGET_PX = 44
/** Midpoint dots show only on segments at least this long on screen — two targets. */
const SKETCH_MIDPOINT_MIN_SEGMENT_PX = 2 * SKETCH_HANDLE_TARGET_PX

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

defineProps({
  /**
   * Whether a phone-width bottom sheet has pushed the nav chrome up over the canvas
   * (`TODO/ui-046`). Owned by `AppView.vue`, the only thing that can see every sheet;
   * passed straight through to `NavigationChrome`, which collapses in response.
   */
  navRaised: { type: Boolean, default: false },
})
const placement = usePlacementStore()
const selection = useSelectionStore()
const settings = useSettingsStore()
const preview = useTransformPreviewStore()
const colorPreview = useColorPreviewStore()
const hiddenPartVisibility = useHiddenPartVisibilityStore()
const hoverHighlight = useHoverHighlightStore()
const transformCommands = useTransformCommands()
const sketchEditor = useSketchEditorStore()
const sketchCommands = useSketchEditorCommands()
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
 * for `VertexHandles.vue` to draw. Rebuilt only when `syncSketchPaths` redraws, never per
 * frame. `sketchHandleHits` is the same positions as plain numbers — `[x, y, index, …]` —
 * for the press-time hit test, so that never walks a reactive array.
 */
const sketchHandles = reactive({ vertices: /** @type {any[]} */ ([]), midpoints: /** @type {any[]} */ ([]) })
const sketchHandleHits = { vertices: /** @type {number[]} */ ([]), midpoints: /** @type {number[]} */ ([]) }
const scratchHandlePoint = createScreenPoint()

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
/**
 * Ghost geometry, cached per `variantKey` so a drag builds each shape at most
 * once. Keyed by variant rather than by op since `TODO/ui-031`, because one op can
 * now be several shapes — see `ghostGeometryFor`.
 */
const ghostGeometry = new Map()
/**
 * The ghost's *box*, cached per variant alongside its geometry (`TODO/ui-013`).
 *
 * The snap needs the dragged shape's bounding box on every `pointermove`, and
 * measuring one means evaluating the solid — far too expensive for the pointer
 * path. Measured once per variant at the working-plane origin instead, then
 * translated by `boxAtPoint`, which is pure arithmetic over six numbers.
 *
 * @type {Map<string, import('../../core/library.js').BoxMm>}
 */
const ghostBoxes = new Map()
/**
 * How far the ghost *mesh* has to sit from the drop point, cached per variant
 * (`TODO/ui-030`).
 *
 * Zero on all three axes for a primitive, whose geometry is built already resting
 * at the origin because its position is one of its own params. A composite recipe
 * has no position param, so its geometry comes out wherever the recipe builds it
 * and the mesh carries the difference — the same offset the drop's trailing
 * `transform.translate` will commit, so the preview cannot promise a position the
 * commit then ignores.
 *
 * @type {Map<string, [number, number, number]>}
 */
const ghostOffsets = new Map()
/** @type {Mesh | null} */
let ghostMesh = null
let ghostOp = ''
let bodyMaterial = /** @type {any} */ (null)
let selectedMaterial = /** @type {any} */ (null)
/** The rest of a multi-body selection — everything but the one picked first. */
let secondaryMaterial = /** @type {any} */ (null)
let ghostMaterial = /** @type {any} */ (null)
/** X-ray tints for a selected body's hidden part (`TODO/ui-041`), base and secondary. */
let xrayMaterial = /** @type {any} */ (null)
let xraySecondaryMaterial = /** @type {any} */ (null)
/**
 * Materials for bodies carrying a user colour override (`TODO/ui-037`), one per
 * colour/alpha/selection role — see `createColorMaterialCache`. A body with no
 * override never touches this and keeps the three shared materials above.
 *
 * @type {import('../../render/mesh.js').ColorMaterialCache | null}
 */
let colorMaterials = null
/** The twins currently attached, so a selection change can take them all off again. */
/** @type {Mesh[]} */
const xrayTwins = []
/** How many selection twins are attached — announced for specs as `data-xray-twins`. */
const xrayTwinCount = ref(0)

/**
 * The object list's hover highlight (`TODO/ui-049`), kept **apart** from the selection's
 * twins above so a hover change adds and removes only its own meshes and never rebuilds
 * every selection twin: its own x-ray material in the hover colour, the twins it put on the
 * hovered meshes, and the one transient mesh a hovered *hidden* part gets while **Show
 * hidden parts** is off. All plain, non-reactive — the counts below are the only refs.
 */
let xrayHoverMaterial = /** @type {any} */ (null)
/** @type {Mesh[]} */
const hoverTwins = []
/** @type {Mesh | null} */
let hoverTransient = null
const hoverTwinCount = ref(0)
const hoverTransientName = ref('')

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
 * @type {'' | 'orbit' | 'pan' | 'select' | 'marquee' | 'sketch' | 'sketch-idle' | 'sketch-vertex'}
 */
let gestureKind = ''
/**
 * The point handle a sketch press landed on (`TODO/sketch-002`), decided at `pointerdown`:
 * `'vertex'` or `'midpoint'` with its index, or `''`. A press that becomes a drag turns into
 * a `'sketch-vertex'` gesture; one that stays a tap picks the point.
 * @type {'' | 'vertex' | 'midpoint'}
 */
let pressHandleKind = ''
let pressHandleIndex = -1
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

/**
 * The outline being dragged out right now, in sketch millimetres (`TODO/sketch-001`).
 *
 * Non-reactive and allocated once, like every other pointer structure here: the reactive
 * half a component draws from is `sketchDraftPath` above, written once per `pointermove`.
 */
const sketchDrag = {
  active: false,
  startXMm: 0,
  startYMm: 0,
  endXMm: 0,
  endYMm: 0,
}
/** Scratch for one projected pointer, sketch-local `[x, y]` mm. */
const scratchSketchMm = [0, 0]
/**
 * Where the pointer is on the sketch plane while a Line chain is live — the end of the live
 * segment (`TODO/sketch-006`). Mouse hover and a touch drag both write it; a tap leaves it at
 * the vertex it just fixed.
 */
const sketchLive = { has: false, xMm: 0, yMm: 0 }
/** `performance.now()` of the last vertex fix and what it did — double-click detection. */
let sketchLastFixAt = -1e9
let sketchLastFixResult = ''

/**
 * The point drag in progress (`TODO/sketch-002`). `offset*Mm` keeps the grab where it was on
 * the dot — a press 12 px off a point's centre doesn't make the point jump under the finger.
 * `before*` is what a `pointercancel` puts back.
 */
const vertexDrag = {
  active: false,
  index: -1,
  offsetXMm: 0,
  offsetYMm: 0,
  /** @type {import('../../sketch/profile.js').SketchParams | null} */
  beforeDraft: null,
  beforeVertex: -1,
}
/** Scratch for the dragged point's new position, mm. */
const scratchVertexMm = [0, 0]

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
  syncSketchPaths()
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
    clearSketchHandles()
    sketchAxis.visible = false
    sketchDraftPath.visible = false
    sketchChain.visible = false
    sketchLive.has = false
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
  syncSketchHandles()

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
  drawChainLive()
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

function clearSketchHandles() {
  if (sketchHandles.vertices.length > 0) sketchHandles.vertices = []
  if (sketchHandles.midpoints.length > 0) sketchHandles.midpoints = []
  sketchHandleHits.vertices.length = 0
  sketchHandleHits.midpoints.length = 0
}

/**
 * Lay out the selected polyline's point handles (`TODO/sketch-002`): a dot on every point,
 * and a midpoint dot on every segment at least {@link SKETCH_MIDPOINT_MIN_SEGMENT_PX} long on
 * screen. Called from `syncSketchPaths`, so it runs when the camera, the draft, the selection
 * or the tool changed — never per frame.
 *
 * **Only while Select is armed.** Found by this task's acceptance drive: on a dense outline
 * (a converted circle at normal zoom has dots ~10 px apart) the 44 px targets cover the whole
 * stroke, so with Rectangle armed a drag that began on the stroke grabbed a point instead of
 * drawing — ui-020 finding #1's dead strip again. A drawing tool's press therefore always
 * draws; under Select a press on a stroke never draws anyway, so dense targets cost nothing.
 */
function syncSketchHandles() {
  const profile = sketchEditor.selectedProfile
  if (sketchEditor.tool !== 'select' || !profile || profile.kind !== 'polyline' || profile.pointsMm.length === 0) {
    clearSketchHandles()
    return
  }
  const zMm = activeSliceZ()
  const frame = sketchEditor.frame
  /** @type {any[]} */
  const vertices = []
  /** @type {any[]} */
  const midpoints = []
  const vertexHits = sketchHandleHits.vertices
  const midpointHits = sketchHandleHits.midpoints
  vertexHits.length = 0
  midpointHits.length = 0
  const points = profile.pointsMm
  for (let index = 0; index < points.length; index += 1) {
    const point = sketchPointToScreen(orbit, frame, points[index][0], points[index][1], zMm, widthPx, heightPx, scratchHandlePoint)
    if (!point.visible) continue
    vertexHits.push(point.x, point.y, index)
    vertices.push({
      index,
      x: point.x,
      y: point.y,
      xMm: points[index][0],
      yMm: points[index][1],
      selected: index === sketchEditor.selectedVertex,
      hover: index === sketchEditor.hoverVertex,
    })
  }
  const segments = segmentCountOf(profile)
  for (let segment = 0; segment < segments; segment += 1) {
    const a = points[segment]
    const b = points[(segment + 1) % points.length]
    const start = sketchPointToScreen(orbit, frame, a[0], a[1], zMm, widthPx, heightPx, scratchHandlePoint)
    const startX = start.x
    const startY = start.y
    const startVisible = start.visible
    const end = sketchPointToScreen(orbit, frame, b[0], b[1], zMm, widthPx, heightPx, scratchHandlePoint)
    if (!startVisible || !end.visible) continue
    // A dense outline doesn't become a wall of handles: the fix there is zoom or Simplify.
    if (Math.hypot(end.x - startX, end.y - startY) < SKETCH_MIDPOINT_MIN_SEGMENT_PX) continue
    const x = (startX + end.x) / 2
    const y = (startY + end.y) / 2
    midpointHits.push(x, y, segment)
    midpoints.push({ segment, x, y })
  }
  sketchHandles.vertices = vertices
  sketchHandles.midpoints = midpoints
}

/**
 * Which handle a client point lands on: the nearest point dot within half a target, else the
 * nearest midpoint dot within half a target. Points win over midpoints, which they never
 * overlap anyway (a midpoint dot needs a segment of two whole targets).
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 * @returns {boolean} Whether a handle was hit; the result is in `pressHandleKind`/`pressHandleIndex`.
 */
function sketchHandleAt(clientXPx, clientYPx) {
  pressHandleKind = ''
  pressHandleIndex = -1
  const x = clientXPx - viewportRect.left
  const y = clientYPx - viewportRect.top
  const reach = SKETCH_HANDLE_TARGET_PX / 2
  let best = reach
  const vertexHits = sketchHandleHits.vertices
  for (let at = 0; at < vertexHits.length; at += 3) {
    const distance = Math.hypot(vertexHits[at] - x, vertexHits[at + 1] - y)
    if (distance <= best) {
      best = distance
      pressHandleKind = 'vertex'
      pressHandleIndex = vertexHits[at + 2]
    }
  }
  if (pressHandleKind) return true
  const midpointHits = sketchHandleHits.midpoints
  for (let at = 0; at < midpointHits.length; at += 3) {
    const distance = Math.hypot(midpointHits[at] - x, midpointHits[at + 1] - y)
    if (distance <= best) {
      best = distance
      pressHandleKind = 'midpoint'
      pressHandleIndex = midpointHits[at + 2]
    }
  }
  return pressHandleKind !== ''
}

/**
 * Start dragging a point: the pressed one, or — from a midpoint dot — a new one inserted on
 * that segment. Either way it becomes the picked point.
 *
 * @returns {boolean} False when the press point does not meet the sketch plane.
 */
function beginVertexDrag() {
  const press = projectToSketch(pressStartClientX, pressStartClientY)
  if (!press) return false
  const pressXMm = press[0]
  const pressYMm = press[1]
  vertexDrag.beforeDraft = sketchEditor.draft
  vertexDrag.beforeVertex = sketchEditor.selectedVertex
  let index = pressHandleIndex
  if (pressHandleKind === 'midpoint') index = sketchEditor.insertVertexOn(pressHandleIndex)
  else sketchEditor.selectVertex(index)
  const point = sketchEditor.selectedVertexMm
  if (index < 0 || !point) return false
  vertexDrag.active = true
  vertexDrag.index = index
  vertexDrag.offsetXMm = point[0] - pressXMm
  vertexDrag.offsetYMm = point[1] - pressYMm
  return true
}

/** @param {number} clientXPx @param {number} clientYPx */
function updateVertexDrag(clientXPx, clientYPx) {
  if (!vertexDrag.active) return
  const point = projectToSketch(clientXPx, clientYPx)
  if (!point) return
  scratchVertexMm[0] = point[0] + vertexDrag.offsetXMm
  scratchVertexMm[1] = point[1] + vertexDrag.offsetYMm
  sketchEditor.moveVertex(vertexDrag.index, scratchVertexMm)
}

/**
 * Finish a point drag. A `pointercancel` puts the draft (and the picked point) back exactly
 * as they were; a release keeps the move and builds the preview once.
 *
 * @param {boolean} cancelled
 */
function endVertexDrag(cancelled) {
  if (!vertexDrag.active) return
  vertexDrag.active = false
  if (cancelled && vertexDrag.beforeDraft) {
    sketchEditor.setDraft(vertexDrag.beforeDraft)
    sketchEditor.selectVertex(vertexDrag.beforeVertex)
  }
  vertexDrag.beforeDraft = null
  requestSketchPreview()
}

/** Where the last point hover was resolved, so a mouse that barely moved resolves nothing. */
let vertexHoverX = -1e9
let vertexHoverY = -1e9

/**
 * Highlight the point dot under a mouse with nothing pressed — the dots are there whenever
 * Select is armed and an outline with points is picked (`TODO/sketch-002`).
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 */
function hoverSketchVertex(clientXPx, clientYPx) {
  if (sketchHandleHits.vertices.length === 0) {
    if (sketchEditor.hoverVertex !== -1) sketchEditor.hoverVertex = -1
    return
  }
  if (Math.abs(clientXPx - vertexHoverX) < 2 && Math.abs(clientYPx - vertexHoverY) < 2) return
  vertexHoverX = clientXPx
  vertexHoverY = clientYPx
  const index = sketchHandleAt(clientXPx, clientYPx) && pressHandleKind === 'vertex' ? pressHandleIndex : -1
  pressHandleKind = ''
  pressHandleIndex = -1
  if (index !== sketchEditor.hoverVertex) sketchEditor.hoverVertex = index
}

/** The pick/snap tolerance in sketch millimetres at the current zoom. */
function sketchToleranceMm() {
  return SKETCH_PICK_TOLERANCE_PX * (orbit.getMmPerPixel(heightPx) || 1)
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

/**
 * Begin drawing, from the point the press started at — the *press* point, not where
 * travel first crossed the slop threshold.
 *
 * @returns {boolean} False when the press point does not meet the sketch plane.
 */
function beginSketchDrag() {
  const point = projectToSketch(pressStartClientX, pressStartClientY)
  if (!point) return false
  sketchDrag.active = true
  sketchDrag.startXMm = point[0]
  sketchDrag.startYMm = point[1]
  sketchDrag.endXMm = point[0]
  sketchDrag.endYMm = point[1]
  return true
}

/** The profile the drag in progress would commit, or `null` for the Line tool. */
function draggedProfile() {
  const start = /** @type {[number, number]} */ ([sketchDrag.startXMm, sketchDrag.startYMm])
  const end = /** @type {[number, number]} */ ([sketchDrag.endXMm, sketchDrag.endYMm])
  if (sketchEditor.tool === 'circle') return circleFromDrag('draft', start, end)
  if (sketchEditor.tool === 'rect') return rectFromDrag('draft', start, end)
  if (sketchEditor.tool === 'polygon') return polygonFromDrag('draft', start, end, sketchEditor.polygonSides)
  return null
}

/** Redraw the live preview of the drag in progress. */
function drawSketchDraft() {
  if (sketchEditor.tool === 'line') {
    drawChainLive()
    return
  }
  const profile = draggedProfile()
  const points = profile ? toPointsMm(profile, 64) : []
  updateSketchPath(orbit, sketchEditor.frame, points, activeSliceZ(), profile !== null, widthPx, heightPx, sketchDraftPath)
}

/**
 * The vertex the live segment starts from: the chain's last fixed vertex, or — on the very
 * first drag, before any vertex is fixed — where the press began.
 *
 * @returns {readonly number[] | null}
 */
function chainAnchorMm() {
  const start = sketchEditor.chainStartMm
  if (start) return start
  const profile = sketchEditor.chainId ? sketchEditor.slice?.profiles.find((candidate) => candidate.id === sketchEditor.chainId) : null
  if (profile && profile.kind === 'polyline' && !profile.closed) return profile.pointsMm[profile.pointsMm.length - 1]
  if (sketchDrag.active) return [sketchDrag.startXMm, sketchDrag.startYMm]
  return null
}

/**
 * Draw the Line tool's live furniture (`TODO/sketch-006`): the dashed segment from the last
 * vertex to the pointer with its length in mm, the last-vertex dot, and the first vertex —
 * pulsing when the pointer is within the close tolerance. Runs on every pointer move while a
 * chain is live and whenever the camera or draft re-projects.
 */
function drawChainLive() {
  const anchor = sketchEditor.active && sketchEditor.tool === 'line' ? chainAnchorMm() : null
  if (!anchor) {
    sketchChain.visible = false
    if (!sketchDrag.active || sketchEditor.tool === 'line') sketchDraftPath.visible = false
    return
  }
  const zMm = activeSliceZ()
  const frame = sketchEditor.frame
  const last = sketchPointToScreen(orbit, frame, anchor[0], anchor[1], zMm, widthPx, heightPx, scratchHandlePoint)
  sketchChain.lastXPx = last.x
  sketchChain.lastYPx = last.y
  sketchChain.visible = last.visible
  const profile = sketchEditor.chainId ? sketchEditor.slice?.profiles.find((candidate) => candidate.id === sketchEditor.chainId) : null
  const chainPoints = profile && profile.kind === 'polyline' ? profile.pointsMm : null
  sketchChain.showFirst = chainPoints !== null && chainPoints.length >= 3
  if (chainPoints) {
    const first = sketchPointToScreen(orbit, frame, chainPoints[0][0], chainPoints[0][1], zMm, widthPx, heightPx, scratchHandlePoint)
    sketchChain.firstXPx = first.x
    sketchChain.firstYPx = first.y
  }
  if (!sketchLive.has) {
    sketchDraftPath.visible = false
    sketchChain.label = ''
    sketchChain.closeNear = false
    return
  }
  const end = [sketchLive.xMm, sketchLive.yMm]
  updateSketchPath(orbit, frame, [anchor, end], zMm, false, widthPx, heightPx, sketchDraftPath)
  const lengthMm = Math.hypot(end[0] - anchor[0], end[1] - anchor[1])
  const toleranceMm = sketchToleranceMm()
  sketchChain.closeNear =
    sketchChain.showFirst && chainPoints !== null && Math.hypot(end[0] - chainPoints[0][0], end[1] - chainPoints[0][1]) <= toleranceMm
  if (lengthMm > toleranceMm * 0.5) {
    const tip = sketchPointToScreen(orbit, frame, end[0], end[1], zMm, widthPx, heightPx, scratchHandlePoint)
    sketchChain.labelXPx = (sketchChain.lastXPx + tip.x) / 2
    sketchChain.labelYPx = (sketchChain.lastYPx + tip.y) / 2 - 8
    sketchChain.label = `${formatMmValue(lengthMm)} mm`
  } else {
    sketchChain.label = ''
  }
}

/**
 * Track the pointer as the live end of the Line chain (mouse hover, or a finger that is down).
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 */
function trackChainPointer(clientXPx, clientYPx) {
  if (sketchEditor.tool !== 'line' || !sketchEditor.chainLive) return
  const point = projectToSketch(clientXPx, clientYPx)
  if (!point) return
  sketchLive.has = true
  sketchLive.xMm = point[0]
  sketchLive.yMm = point[1]
  drawChainLive()
  scheduleRender()
}

/**
 * The Line tool's one vertex-fix step as the viewport sees it: every click, tap and
 * drag-release lands here with the sketch-local point it fixes. `TODO/sketch-007`'s snapping
 * wraps this — adjust `pointMm`, then call through — and nothing else about the tool changes.
 *
 * @param {readonly number[]} pointMm Sketch-local millimetres.
 * @returns {'started' | 'added' | 'closed' | 'ignored'}
 */
function fixSketchVertex(pointMm) {
  const mmPerPx = orbit.getMmPerPixel(heightPx) || 1
  const result = sketchEditor.fixChainVertex(pointMm, {
    closeToleranceMm: sketchToleranceMm(),
    minLengthMm: SKETCH_MIN_LENGTH_PX * mmPerPx,
  })
  if (result !== 'ignored') {
    sketchLastFixAt = performance.now()
    sketchLastFixResult = result
  }
  return result
}

/**
 * A click or tap with the Line armed: fix a vertex there. A second click right on the vertex
 * just fixed (a double-click / double-tap) finishes the chain instead, and a click straight
 * after a close is swallowed so the double-click that closed an outline does not also start
 * the next one.
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 */
function lineTap(clientXPx, clientYPx) {
  const point = projectToSketch(clientXPx, clientYPx)
  if (!point) return
  const sincePrevious = performance.now() - sketchLastFixAt
  if (sincePrevious < SKETCH_DOUBLE_TAP_MS && sketchLastFixResult === 'closed') return
  const result = fixSketchVertex([point[0], point[1]])
  if (result === 'ignored' && sketchEditor.chainLive && sincePrevious < SKETCH_DOUBLE_TAP_MS) sketchEditor.finishChain()
  sketchLive.has = true
  sketchLive.xMm = point[0]
  sketchLive.yMm = point[1]
  drawChainLive()
  scheduleRender()
}

/**
 * @param {number} clientXPx
 * @param {number} clientYPx
 */
function updateSketchDrag(clientXPx, clientYPx) {
  if (!sketchDrag.active) return
  const point = projectToSketch(clientXPx, clientYPx)
  if (!point) return
  sketchDrag.endXMm = point[0]
  sketchDrag.endYMm = point[1]
  if (sketchEditor.tool === 'line') {
    sketchLive.has = true
    sketchLive.xMm = point[0]
    sketchLive.yMm = point[1]
  }
  drawSketchDraft()
  scheduleRender()
}

/**
 * Finish a draw gesture: add one outline to the draft, unless it was cancelled or never
 * really moved. Nothing reaches the document — that waits for Done.
 *
 * For the Line tool a drag does not draw "a segment" any more: it fixes vertices. With no
 * chain yet, the press point is the first vertex and the release the second (so one drag still
 * draws one segment); with a chain live, only the release point matters — the segment already
 * runs from the last vertex.
 *
 * @param {boolean} cancelled
 */
function endSketchDrag(cancelled) {
  if (!sketchDrag.active) return
  const start = /** @type {[number, number]} */ ([sketchDrag.startXMm, sketchDrag.startYMm])
  const end = /** @type {[number, number]} */ ([sketchDrag.endXMm, sketchDrag.endYMm])
  sketchDrag.active = false
  sketchDraftPath.visible = false
  scheduleRender()
  if (sketchEditor.tool === 'line') {
    if (!cancelled) {
      if (!sketchEditor.chainLive) fixSketchVertex(start)
      fixSketchVertex(end)
    }
    drawChainLive()
    return
  }
  if (cancelled) return
  // The degenerate case: a release that never really moved adds nothing at all.
  if (isDegenerate(start, end, SKETCH_MIN_LENGTH_PX * (orbit.getMmPerPixel(heightPx) || 1))) return

  const profile = draggedProfile()
  if (profile) {
    // Deliberately **not** auto-selected (ui-020's finding #3): drawing several outlines
    // in a row is the point of the editor, and a selection would only get in the way.
    sketchEditor.addToActiveSlice({ ...profile, id: sketchEditor.nextProfileId() })
  }
}

/**
 * A tap in the editor: pick the outline under it in the active slice, or clear.
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 */
function pickSketchProfile(clientXPx, clientYPx) {
  const point = projectToSketch(clientXPx, clientYPx)
  if (!point) {
    sketchEditor.selectProfile('')
    return
  }
  const profiles = sketchEditor.slice?.profiles ?? []
  sketchEditor.selectProfile(profileAtPoint(profiles, [point[0], point[1]], sketchToleranceMm()) ?? '')
}

/** Where the last hover was resolved, so a mouse that barely moved resolves nothing. */
let sketchHoverX = -1e9
let sketchHoverY = -1e9

/**
 * Highlight the outline under a mouse that has nothing pressed — only while Select is armed,
 * since that is the tool whose whole job is picking. Hover is a highlight, never a selection
 * (`TODO/sketch-005`). Skipped for sub-2 px moves: `profileAtPoint` samples every outline.
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 */
function hoverSketchProfile(clientXPx, clientYPx) {
  if (sketchEditor.tool !== 'select') {
    if (sketchEditor.hoverProfileId) sketchEditor.hoverProfileId = ''
    return
  }
  if (Math.abs(clientXPx - sketchHoverX) < 2 && Math.abs(clientYPx - sketchHoverY) < 2) return
  sketchHoverX = clientXPx
  sketchHoverY = clientYPx
  const point = projectToSketch(clientXPx, clientYPx)
  const id = point ? profileAtPoint(sketchEditor.slice?.profiles ?? [], [point[0], point[1]], sketchToleranceMm()) ?? '' : ''
  if (id !== sketchEditor.hoverProfileId) sketchEditor.hoverProfileId = id
}

function clearSketchHover() {
  if (sketchLive.has && !sketchDrag.active) {
    sketchLive.has = false
    drawChainLive()
    scheduleRender()
  }
  sketchHoverX = -1e9
  sketchHoverY = -1e9
  vertexHoverX = -1e9
  vertexHoverY = -1e9
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
    object.visible = !(sketchEditor.active && sketchEditor.bodyId === id)
  }
  scheduleRender()
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
  // The hover's twins share their meshes' geometry and its transient mesh sits inside a
  // body's container: take them off before any geometry is swapped or disposed, and put
  // them back at the end against whatever the scene now holds.
  removeHoverArtifacts()
  // Preview bodies carry the *same* lineage-root ids as live ones — they come
  // from the same records — so entering and leaving a preview adds and removes
  // exactly the meshes that differ, through the same additive path a normal
  // edit takes. Nothing about preview needs its own rebuild strategy.
  const bodies = renderSource().bodies()
  const live = new Set()
  for (const body of bodies) {
    live.add(body.id)
    // Hidden parts to also build a mesh for (`TODO/ui-047`'s **Show hidden parts**
    // toggle) — `[]` whenever the body is not in the shown set, which reproduces
    // today's mesh count exactly. Computed every pass (cheap: a `Set.has` and an
    // array filter, not a kernel call) so a toggle click is picked up the next
    // time this function runs, without its own separate diffing path.
    const shownHiddenNames =
      isGroup(body.geometry) && hiddenPartVisibility.isShown(body.id)
        ? hiddenNamesOf(body.geometry)
        : []
    // A stable key for "does the set of hidden-part meshes this body needs match
    // what it already has", so toggling forces a rebuild and leaving it alone
    // never does — joined with a separator no part name can contain.
    const hiddenShownKey = shownHiddenNames.join('\u0000')
    const existing = bodyMeshes.get(body.id)
    if (existing) {
      // Decided before `userData.geometry` is refreshed below (`TODO/ui-052`): same record
      // *and* same evaluated geometry, or the mesh is stale.
      const current = bodyObjectIsCurrent(existing.userData, body, hiddenShownKey)
      // Read by `paintBodies`. Set before the early-out on purpose: a timeline
      // preview can hand back the same terminal with a different history.
      existing.userData.colorOverrides = body.colorOverrides
      // A bare `Geom3` has no `.colors` at all, so this is `undefined` for every
      // non-composite body — exactly the "no recipe colour" case `paintColorOf`
      // already falls through on (`TODO/render-003`).
      existing.userData.recipeColors = isGroup(body.geometry) ? body.geometry.colors : undefined
      // What a hovered hidden part's transient mesh is built from (`TODO/ui-049`). A
      // reference to the evaluated result, never a copy, and never reactive.
      existing.userData.geometry = body.geometry
      const sameHiddenShown = existing.userData.hiddenShownKey === hiddenShownKey
      if (current) continue
      // The body was transformed: swap in the new geometry and drop whatever
      // preview transform the drag left on the object, since the translation or
      // rotation is now baked into the vertices themselves. `updateBodyObject`
      // refuses when the object's *shape* changed — a bare body that became a
      // group, or a group whose part list differs — and the rebuild below picks
      // that up rather than patching one body's geometry into another's slots.
      // Only attempted when the hidden-shown set is unchanged: `updateBodyObject`
      // knows nothing about hidden-part meshes, so a toggle always falls through
      // to the full rebuild below, which bakes the new set in from the start.
      if (sameHiddenShown && updateBodyObject(existing, body.geometry)) {
        existing.position.set(0, 0, 0)
        existing.quaternion.identity()
        existing.userData.recordId = body.recordId
        continue
      }
      bodiesGroup.remove(existing)
      disposeBodyObject(existing)
      bodyMeshes.delete(body.id)
    }
    const object = createBodyObject(body.geometry, bodyMaterial, body.id, shownHiddenNames)
    object.userData.recordId = body.recordId
    object.userData.hiddenShownKey = hiddenShownKey
    object.userData.colorOverrides = body.colorOverrides
    object.userData.recipeColors = isGroup(body.geometry) ? body.geometry.colors : undefined
    object.userData.geometry = body.geometry
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
  applyHover()
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
  // Twins are rebuilt from scratch on every call: cheap (selection-change rate, not
  // frame rate), and it means a body whose geometry was swapped by a move or an edit
  // can never keep a twin pointing at the geometry it just disposed.
  for (const twin of xrayTwins) twin.removeFromParent()
  xrayTwins.length = 0
  for (const [id, object] of bodyMeshes) {
    const role = selectionRole(id)
    // A selected body also gets an x-ray twin, because a body completely inside another
    // is occluded at every pixel and swapping its material alone changes nothing on the
    // canvas. Where it is not hidden the twin draws nothing. See `createXrayMaterial`.
    if (role !== 'none') {
      const tint = role === 'base' ? xrayMaterial : xraySecondaryMaterial
      if (object instanceof ThreeGroup) {
        for (const child of object.children) {
          // A hover's transient hidden part is not part of the selection's picture.
          if (child.userData.hoverTransient) continue
          xrayTwins.push(addXrayTwin(/** @type {Mesh} */ (child), tint))
        }
      } else {
        xrayTwins.push(addXrayTwin(/** @type {Mesh} */ (object), tint))
      }
    }
  }
  xrayTwinCount.value = xrayTwins.length
  paintBodies()
}

// --- the object list's hover highlight (TODO/ui-049) -----------------------

/** Take the hover's twins and transient mesh off the scene and free the transient. */
function removeHoverArtifacts() {
  for (const twin of hoverTwins) twin.removeFromParent()
  hoverTwins.length = 0
  if (hoverTransient) {
    hoverTransient.removeFromParent()
    disposeMesh(hoverTransient)
    hoverTransient = null
  }
  hoverTwinCount.value = 0
  hoverTransientName.value = ''
}

/**
 * Show the current hover target, at hover-change rate (the store refuses a repeat write):
 * the hover tint is painted by {@link paintBodies}, and the target also gets x-ray twins in
 * the hover colour, because a tint that only paints front faces changes nothing on the
 * canvas for a body inside a case — exactly the body the list exists for.
 *
 * A hovered **hidden** part that is not already drawn (Show hidden parts off) gets a
 * transient translucent mesh for the length of the hover, built by the same path `ui-047`'s
 * toggle uses and disposed as soon as the hover moves on.
 */
function applyHover() {
  removeHoverArtifacts()
  const target = hoverHighlight.target
  const object = target ? bodyMeshes.get(target.bodyId) : undefined
  if (target && object && xrayHoverMaterial && bodyMaterial) {
    /** @type {Mesh[]} */
    let meshes = []
    if (object instanceof ThreeGroup) {
      const parts = /** @type {Mesh[]} */ (object.children)
      meshes = target.partName === null ? parts : parts.filter((child) => child.userData.partName === target.partName)
      if (target.partName !== null && meshes.length === 0) {
        const transient = createHoverPartMesh(object.userData.geometry, target.partName, bodyMaterial, target.bodyId)
        if (transient) {
          object.add(transient)
          hoverTransient = transient
          hoverTransientName.value = target.partName
          meshes = [transient]
        }
      }
    } else if (target.partName === null) {
      meshes = [/** @type {Mesh} */ (object)]
    }
    for (const mesh of meshes) hoverTwins.push(addXrayTwin(mesh, xrayHoverMaterial))
  }
  hoverTwinCount.value = hoverTwins.length
  paintBodies()
}

/**
 * Put the right material on every body: its selection role, its recipe's own
 * baked-in part colours (`TODO/render-003`) and its user colour overrides
 * (`TODO/ui-037`). Split out of {@link applySelectionMaterial} so a live
 * colour-picker preview can repaint **without** rebuilding the x-ray twins — the
 * picker fires `input` at pointer rate, and twins are a `new Mesh` apiece.
 *
 * A Group-valued body is a container of part meshes (`TODO/ui-016`), so the
 * highlight is painted onto every part: a group selects and highlights as one
 * object, exactly as it did when it was a single combined mesh. The drilled-into
 * part is deliberately *not* highlighted differently — its feedback is the
 * breadcrumb, the dimension lines and the absent gizmo. A colour override, by
 * contrast, *can* differ per part: see `paintBodyObject`.
 */
function paintBodies() {
  if (!bodyMaterial || !colorMaterials) return
  const shared = { body: bodyMaterial, selected: selectedMaterial, secondary: secondaryMaterial }
  const previewId = colorPreview.bodyId
  const hoverTarget = hoverHighlight.target
  colorMaterials.beginPass()
  for (const [id, object] of bodyMeshes) {
    paintBodyObject(object, {
      role: selectionRole(id),
      overrides: object.userData.colorOverrides,
      preview: previewId === id ? { color: colorPreview.color, subPart: colorPreview.subPart } : null,
      shared,
      cache: colorMaterials,
      recipeColors: object.userData.recipeColors,
      hover: hoverTarget?.bodyId === id ? { partName: hoverTarget.partName } : null,
    })
  }
  colorMaterials.endPass()
  scheduleRender()
}

/**
 * What the scene list announces as a body's colour (`TODO/ui-037`): the
 * whole-body override as `#rrggbb`, or `''` for the theme default. Part overrides
 * are listed separately in `data-body-part-colors`.
 *
 * @param {{ colorOverrides?: readonly import('../../core/document.js').ColorOverride[] }} body
 * @returns {string}
 */
function announcedColor(body) {
  const own = ownOverrideOf(body.colorOverrides, undefined)
  return own ? colorIntToCssHex(own.color) : ''
}

/**
 * `part=#rrggbb;part=#rrggbb`, for the parts that carry their own override.
 *
 * @param {{ colorOverrides?: readonly import('../../core/document.js').ColorOverride[] }} body
 * @returns {string}
 */
function announcedPartColors(body) {
  return (body.colorOverrides ?? [])
    .filter((entry) => entry.subPart !== undefined)
    .map((entry) => `${entry.subPart}=${colorIntToCssHex(entry.color)}`)
    .join(';')
}

function applyMaterialTheme() {
  const palette = BODY_COLORS[theme.value] ?? BODY_COLORS.dark
  bodyMaterial?.color.setHex(palette.body)
  selectedMaterial?.color.setHex(palette.selected)
  secondaryMaterial?.color.setHex(palette.secondary)
  ghostMaterial?.color.setHex(palette.ghost)
  sketchPreviewMaterial?.color.setHex(palette.ghost)
  xrayMaterial?.color.setHex(palette.selected)
  xraySecondaryMaterial?.color.setHex(palette.secondary)
  xrayHoverMaterial?.color.setHex(palette.hover)
  colorMaterials?.setHighlights({ selected: palette.selected, secondary: palette.secondary, hover: palette.hover })
  // A hovered body with no colour of its own wears a copy of the palette colour, keyed by
  // that colour: a scheme switch needs a repaint to pick up the new one.
  if (hoverHighlight.target) paintBodies()
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
 * All three ghost caches below are keyed by `variantKey(op, overrides)` rather
 * than by `op` (`TODO/ui-031`), because a row can now carry a chosen variant and
 * `raspberrypi.bplus` is one op with five different shapes behind it. Keying on
 * the op alone would draw whichever model happened to be dragged first for every
 * model dragged after it — a preview quietly lying about what the drop commits.
 * Every key is computed once per gesture, in `preview`/`commit`, never per
 * `pointermove`.
 *
 * The ghost's geometry for a variant, built once and cached. It is built at the
 * origin through the *same* `paramsForDrop` the commit uses, so the preview is
 * the shape that will actually land — including resting on the working plane
 * rather than sunk half into it.
 *
 * @param {string} key From `variantKey`.
 * @param {string} op
 * @param {Record<string, any>} overrides
 */
function ghostGeometryFor(key, op, overrides) {
  // At the design resolution (TODO/core-035) — otherwise the ghost of a cylinder would have
  // the old 32 sides and the body that lands a different count. Part of the cache key, so
  // changing the setting never serves a ghost faceted at the old one.
  const resolution = documentStore.resolution
  const cacheKey = `${key}@${resolution}`
  let geometry = ghostGeometry.get(cacheKey)
  if (!geometry) {
    geometry = geom3ToBufferGeometry(
      toGeom3(evaluateOp(op, paramsForDrop(op, GHOST_ORIGIN, overrides), { policy: policyFor(resolution) })),
    )
    ghostGeometry.set(cacheKey, geometry)
  }
  return geometry
}

/**
 * The ghost's box for a variant, built once and cached — see {@link ghostBoxes}.
 *
 * @param {string} key From `variantKey`.
 * @param {string} op
 * @param {Record<string, any>} overrides
 * @returns {import('../../core/library.js').BoxMm}
 */
function ghostBoxFor(key, op, overrides) {
  let box = ghostBoxes.get(key)
  if (!box) {
    box = ghostBoxAtOrigin(op, overrides)
    ghostBoxes.set(key, box)
  }
  return box
}

/**
 * The ghost mesh's offset from the drop point for a variant — see
 * {@link ghostOffsets}. Cached for the same reason the box is: it is measured off
 * built geometry, which has no business in the pointer path.
 *
 * @param {string} key From `variantKey`.
 * @param {string} op
 * @param {Record<string, any>} overrides
 * @returns {[number, number, number]}
 */
function ghostOffsetFor(key, op, overrides) {
  let offset = ghostOffsets.get(key)
  if (!offset) {
    offset = ghostOffsetMm(op, overrides)
    ghostOffsets.set(key, offset)
  }
  return offset
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
 * @param {string} key From `variantKey` — what the ghost box is cached under.
 * @param {string} op
 * @param {Record<string, any>} overrides
 * @param {number} clientXPx
 * @param {number} clientYPx
 * @returns {{ x: number, y: number } | null} `null` when the pointer does not
 *   meet the working plane at all — no valid drop position, snapped or not.
 */
function resolveDropPoint(key, op, overrides, clientXPx, clientYPx) {
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
    boxAtPoint(ghostBoxFor(key, op, overrides), dropPointMm, ghostBox)
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

  preview(op, clientXPx, clientYPx, overrides = {}) {
    if (!viewport || !op) return
    // The variant, not the op: two models of one board are two different meshes,
    // so `ghostOp` has to compare the thing that actually decides the geometry.
    const key = variantKey(op, overrides)
    if (!ghostMesh) {
      ghostMesh = new Mesh(ghostGeometryFor(key, op, overrides), ghostMaterial)
      ghostMesh.name = 'placement-ghost'
      // Drawn after the solids so its translucency composites over them.
      ghostMesh.renderOrder = 1
      ghostOp = key
      viewport.graph.scene.add(ghostMesh)
    }
    if (ghostOp !== key) {
      ghostMesh.geometry = ghostGeometryFor(key, op, overrides)
      ghostOp = key
    }
    const point = resolveDropPoint(key, op, overrides, clientXPx, clientYPx)
    if (!point) {
      setGhostVisible(false)
      scheduleRender()
      return
    }
    // The **snapped** point, so the preview shows where the drop will actually
    // land rather than where the pointer happens to be (`TODO/ui-013`), plus the
    // offset a composite's geometry needs to sit where its drop will commit it
    // (`TODO/ui-030` — zero for every primitive).
    const offset = ghostOffsetFor(key, op, overrides)
    ghostMesh.position.set(point.x + offset[0], point.y + offset[1], offset[2])
    setGhostVisible(true)
    scheduleRender()
  },

  clearPreview() {
    setGhostVisible(false)
    clearSnapFeedback()
    scheduleRender()
  },

  commit(op, clientXPx, clientYPx, overrides = {}) {
    const point = resolveDropPoint(variantKey(op, overrides), op, overrides, clientXPx, clientYPx)
    if (!point) return null
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
 * @returns {'orbit' | 'pan' | 'select' | 'marquee' | 'sketch' | 'sketch-idle' | 'sketch-vertex'}
 */
function decideGestureKind() {
  if (sketchMode.value) {
    if (pressHandleKind) return 'sketch-vertex'
    return sketchEditor.tool === 'select' ? 'sketch-idle' : 'sketch'
  }
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
    pressHandleKind = ''
    pressHandleIndex = -1
    if (sketchMode.value) sketchHandleAt(event.clientX, event.clientY)
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
    if (gestureKind === 'sketch-vertex') endVertexDrag(true)
    gestureKind = ''
    pressHandleKind = ''
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
    if (sketchMode.value && event.pointerType === 'mouse') {
      hoverSketchProfile(event.clientX, event.clientY)
      hoverSketchVertex(event.clientX, event.clientY)
      // The Line chain's rubber band follows the cursor (`TODO/sketch-006`).
      trackChainPointer(event.clientX, event.clientY)
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
      if (gestureKind === 'sketch' && !beginSketchDrag()) gestureKind = ''
      if (gestureKind === 'sketch-vertex' && !beginVertexDrag()) gestureKind = ''
    }
    if (gestureKind === 'sketch-vertex') {
      updateVertexDrag(event.clientX, event.clientY)
      return
    }
    if (gestureKind === 'sketch') {
      updateSketchDrag(event.clientX, event.clientY)
      return
    }
    // Select never draws, and the locked camera stays put (`TODO/sketch-005`).
    if (gestureKind === 'sketch-idle') return
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
  const tappedVertex = isClick && pressHandleKind === 'vertex' ? pressHandleIndex : -1
  pressHandleKind = ''
  pressHandleIndex = -1
  const pressX = pressStartClientX
  const pressY = pressStartClientY
  pressId = -1
  gestureKind = ''

  if (wasVertexDrag) {
    endVertexDrag(event.type === 'pointercancel')
    return
  }

  if (wasSketch) {
    // `pointercancel` (bound to this same handler) abandons the line rather
    // than committing a gesture the user never finished — the same rule the
    // marquee and the gizmo drag already follow.
    endSketchDrag(event.type === 'pointercancel')
    return
  }

  if (wasSketchIdle) {
    // A drag under Select drew nothing; the *press* still picks whatever it landed on, so a
    // finger that wobbled past the tap slop selects instead of doing nothing at all.
    if (event.type !== 'pointercancel') pickSketchProfile(pressX, pressY)
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
  if (isClick && sketchMode.value && sketchEditor.tool === 'line') {
    // Line: a tap or click fixes the next vertex — no hover, no modifier, any pointer type
    // (`TODO/sketch-006`). Picking an outline is Select's job; a cancelled press does nothing.
    if (event.type !== 'pointercancel') lineTap(event.clientX, event.clientY)
    return
  }
  if (isClick && sketchMode.value) {
    // A tap on a point dot picks the point (`TODO/sketch-002`); anywhere else picks an outline.
    if (tappedVertex >= 0 && event.type !== 'pointercancel') sketchEditor.selectVertex(tappedVertex)
    else pickSketchProfile(event.clientX, event.clientY)
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
    const hits = raycaster.intersectObjects(bodiesGroup.children, true)
    if (hits.length === 0) continue
    const object = hits[0].object
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
  // While sketching, the pad pans whatever the drag-mode toggle says: orbit is
  // suspended, and a pad that quietly orbited would break the camera lock the
  // mode is built on.
  if (sketchMode.value || dragMode.value === 'pan') {
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
  // Unreachable while sketching — the gizmo's buttons are disabled — but
  // guarded here too rather than trusting a component prop, because snapping
  // to an edge-on view would leave every subsequent drag projecting onto
  // nothing at all.
  if (sketchMode.value) return
  orbit.snapTo(view)
  scheduleRender()
}

function onReset() {
  orbit.reset()
  scheduleRender()
}

/**
 * Frame the camera on everything in the document (`TODO/io-001`).
 *
 * Runs when a whole document is *loaded* — an autosave restore or an Open —
 * never on an edit. A loaded project whose geometry sits outside the default view
 * would otherwise read as an empty scene, and a user who had panned away before
 * reloading would reopen the app to what looks like lost work
 * (`interaction-model-qa.md` §10). Orientation is kept; only target and distance
 * move. Reads the summaries' plain `bounds`, so no geometry is touched.
 */
function frameLoadedContent() {
  const summaries = documentStore.bodies
  if (summaries.length === 0) return
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

/** @param {'orbit' | 'pan'} mode */
function onMode(mode) {
  if (sketchMode.value) return
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

/**
 * The Line chain's keys (`TODO/sketch-006`): Esc finishes (twice in a row cancels), Enter
 * finishes, Backspace removes the last point. They act only while the Line is armed with a
 * chain live (Esc also for the "twice" window), never in a text field, and mark the event
 * handled so the app-wide Backspace-deletes-the-selection shortcut stands down.
 *
 * @param {KeyboardEvent} event
 */
function onSketchChainKey(event) {
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
    drawChainLive()
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
  const palette = BODY_COLORS[theme.value] ?? BODY_COLORS.dark
  bodyMaterial = createBodyMaterial(palette.body)
  selectedMaterial = createBodyMaterial(palette.selected)
  secondaryMaterial = createBodyMaterial(palette.secondary)
  ghostMaterial = createGhostMaterial(palette.ghost)
  sketchPreviewMaterial = createGhostMaterial(palette.ghost)
  xrayMaterial = createXrayMaterial(palette.selected)
  xraySecondaryMaterial = createXrayMaterial(palette.secondary)
  xrayHoverMaterial = createXrayMaterial(palette.hover)
  colorMaterials = createColorMaterialCache({ selected: palette.selected, secondary: palette.secondary, hover: palette.hover })

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
    // Entering, leaving or moving a preview changes what is on screen without
    // changing the document, so it needs its own trigger.
    watch(() => timeline.previewStep, syncBodies),
    // The Show hidden parts toggle (`TODO/ui-047`) changes what is on screen with
    // no document mutation at all — spreading the reactive Set into a fresh array
    // is what makes this getter re-run on every add/delete, since two different
    // arrays are never `===` even when their contents happen to match.
    watch(() => [...hiddenPartVisibility.shown], syncBodies),
    // A loaded document (restore / Open), as opposed to an edit: frame it. Declared
    // after the `syncBodies` watcher so the meshes exist before the camera moves.
    watch(() => documentStore.loadRevision, frameLoadedContent),
    // The sketch editor (`TODO/sketch-001`). Opening it aims the camera straight at the
    // active slice and hides the edited body's own mesh behind the live preview; every
    // draft edit re-projects the outlines and asks the worker for a new preview.
    watch(
      () => sketchEditor.active,
      (active) => {
        if (active) {
          endSketchDrag(true)
          endVertexDrag(true)
          aimAtSketch()
        } else {
          endSketchDrag(true)
          vertexDrag.active = false
          vertexDrag.beforeDraft = null
          clearSketchPreview()
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
        // on release (`endVertexDrag`), rather than once per pointer event.
        if (!vertexDrag.active) requestSketchPreview()
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
    watch(() => documentStore.version, applySketchBodyVisibility),
    watch(() => selection.ids, applySelectionMaterial, { deep: true }),
    // The object list's hover (`TODO/ui-049`). The store hands out a fresh object only on
    // a real change, so this fires at hover-change rate, never pointer rate.
    watch(() => hoverHighlight.target, applyHover),
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
  if (documentStore.loadRevision > 0) frameLoadedContent()
})

onBeforeUnmount(() => {
  // The viewport is the only thing that can draw or close the editor, so it must not
  // outlive it — a draft left open with no surface to finish it on is a stuck mode.
  sketchEditor.close()
  clearSketchPreview()
  sketchPreviewMaterial?.dispose()
  sketchPreviewMaterial = null
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  unregisterTarget?.()
  unregisterTarget = null
  for (const stop of stopWatchers.splice(0)) stop()
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('keydown', onSketchChainKey)
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure)
  themeQuery?.removeEventListener('change', onThemeChange)
  themeQuery = null
  canvasEl.value?.removeEventListener('webglcontextlost', onContextLost)
  removeHoverArtifacts()
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
  xrayMaterial?.dispose()
  xraySecondaryMaterial?.dispose()
  xrayHoverMaterial?.dispose()
  xrayHoverMaterial = null
  colorMaterials?.dispose()
  colorMaterials = null
  xrayTwins.length = 0
  bodyMaterial = null
  selectedMaterial = null
  secondaryMaterial = null
  ghostMaterial = null
  xrayMaterial = null
  xraySecondaryMaterial = null
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
    :data-body-count="announcedBodies.length"
    :data-selected-id="selection.onlyId ?? ''"
    :data-selected-count="selection.count"
    :data-xray-twins="xrayTwinCount"
    :data-hover="hoverHighlight.target ? (hoverHighlight.target.partName === null ? hoverHighlight.target.bodyId : `${hoverHighlight.target.bodyId}/${hoverHighlight.target.partName}`) : ''"
    :data-hover-twins="hoverTwinCount"
    :data-hover-transient="hoverTransientName"
    :data-placing="placement.isDragging ? 'true' : 'false'"
    :data-ghost="ghostVisible ? 'visible' : 'hidden'"
    :data-snapped="snapped ? 'true' : 'false'"
    :data-transforming="preview.isActive ? 'true' : 'false'"
    :data-previewing="timeline.previewing ? 'true' : 'false'"
    :data-sketch-mode="sketchMode ? 'true' : 'false'"
    :data-sketch-body="sketchEditor.bodyId ?? ''"
    :data-sketch-slice="sketchEditor.activeSlice"
    :data-sketch-selected="sketchEditor.selectedProfileId"
    :data-sketch-vertex="sketchEditor.selectedVertex"
    :data-sketch-tool="sketchMode ? sketchEditor.tool : ''"
    :data-sketch-chain-points="sketchMode ? sketchEditor.chainPointCount : 0"
    :data-sketch-preview="sketchEditor.previewStatus"
    :data-sketch-panel="sketchEditor.panel"
  >
    <canvas
      ref="canvasEl"
      class="viewport__canvas"
      :class="{ 'viewport__canvas--sketch-select': sketchMode && sketchEditor.tool === 'select', 'viewport__canvas--sketch-draw': sketchMode && sketchEditor.tool !== 'select' }"
      data-testid="viewport-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="clearSketchHover"
      @wheel="onWheel"
      @contextmenu.prevent
    />

    <p v-if="webglError" class="viewport__error" data-testid="viewport-webgl-unavailable">
      {{ webglError }}
    </p>

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
         placeholder number — a spec waits for it rather than reading a guess. -->
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
      >
        {{ body.name }}
      </li>
    </ul>

    <!-- The selection *response* (TODO/ui-011): dimension lines under the
         gizmo, both attached to whatever is selected right now, both
         non-interactive so neither can swallow the click that selects. -->
    <DimensionLines :annotations="dimensionAnnotations" />
    <Gizmo
      v-if="!timeline.previewing"
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
    <!-- The sketch editor's outlines (TODO/sketch-001): the draft's profiles, the
         live drag, and the revolve axis. Pointer-transparent, so the canvas keeps every
         gesture (ui-020 finding #1). -->
    <SketchStrokes v-if="sketchMode" :paths="sketchPaths" :draft="sketchDraftPath" :axis="sketchAxis" :chain="sketchChain" />
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
      @snap="onSnap"
    />
    <!-- The Sketch toolbar (TODO/sketch-001): mounted only while the editor is open,
         in the top-left slot the Operations toolbar yields. Its Slices / Extrude panels
         open in the sheet below — a bottom sheet on a narrow viewport. -->
    <SketchToolbar v-if="sketchMode" />
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
    <OperationsToolbar v-if="!sketchMode" />
    <NavigationChrome
      :drag-mode="dragMode"
      :sketching="sketchMode"
      :raised="navRaised"
      :sketch-sheet="sketchMode && sketchEditor.panel !== ''"
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
  /* A size container (`TODO/sketch-001`): the sketch editor's toolbar, sheet and the nav
     chrome's fold respond to the *viewport's* width, not the window's — at the 820px
     tablet reference the viewport column is 390px wide, the same as a phone. */
  container: viewport / inline-size;
}

/* §14, point 2: "the viewport gets an amber inset outline." An `outline` rather
   than a border so it costs the canvas no layout, and `pointer-events: none` on
   the pseudo-element so the mode indicator can never eat an orbit drag. Amber
   is the same colour the preview strip uses — one colour for one idea. */
.viewport[data-previewing='true']::after {
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
