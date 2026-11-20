// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The viewport's reactive overlay structures (`TODO/ui-144`): the camera mirror, the selection
 * overlays, the marquee, the placement guides and the sketch editor's on-screen furniture.
 *
 * Moved out of `Viewport.vue` without a behaviour change. Each structure is **allocated once
 * here and mutated in place** by the render controllers (`src/render/annotate.js` and friends),
 * so a frame writes numbers into an existing structure rather than rebuilding one. They are
 * reactive, unlike the render state, because Vue components draw from them; each is a handful of
 * numbers, not the multi-megabyte `Float32Array` CLAUDE.md's Performance section is about.
 *
 * @module composables/useViewportOverlays
 */
import { reactive } from 'vue'
import { createCutPlaneAnnotation } from '../render/cutPlane.js'
import {
  createDialAnnotation,
  createDimensionAnnotation,
  createGizmoAnnotation,
  createMarqueeRect,
  createRulerAnnotation,
  createSketchPath,
  createSnapGuideAnnotations,
} from '../render/annotate.js'

/**
 * Allocate the viewport's reactive overlay structures, once.
 *
 * @returns {{
 *   overlay: { azimuthDeg: number, elevationDeg: number, distanceMm: number, target: string, mmPerPixel: number, minorMm: number, majorMm: number },
 *   gizmoAnnotation: ReturnType<typeof createGizmoAnnotation>,
 *   dialAnnotation: ReturnType<typeof createDialAnnotation>,
 *   rulerAnnotation: ReturnType<typeof createRulerAnnotation>,
 *   dimensionAnnotations: ReturnType<typeof createDimensionAnnotation>[],
 *   cutPlaneAnnotation: ReturnType<typeof createCutPlaneAnnotation>,
 *   marqueeRect: ReturnType<typeof createMarqueeRect>,
 *   snapGuides: ReturnType<typeof createSnapGuideAnnotations>,
 *   sketchPaths: any[],
 *   sketchDraftPath: ReturnType<typeof createSketchPath>,
 *   sketchAxis: { visible: boolean, d: string },
 *   sketchChain: { visible: boolean, lastXPx: number, lastYPx: number, firstXPx: number, firstYPx: number, showFirst: boolean, closeNear: boolean, labelXPx: number, labelYPx: number, label: string },
 *   sketchHandles: { vertices: any[], midpoints: any[] },
 *   sketchSnap: { visible: boolean, xPx: number, yPx: number, markerXPx: number, markerYPx: number, lifted: boolean, kind: string, label: string },
 * }}
 */
export function useViewportOverlays() {
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

  /** The selection overlays' screen geometry (`TODO/ui-011`), mutated in place by `annotate.js`. */
  const gizmoAnnotation = reactive(createGizmoAnnotation())
  /** The rotate dial (`TODO/ui-064`), drawn while a rotate ring is dragged. */
  const dialAnnotation = reactive(createDialAnnotation())
  /** The translate ruler (`TODO/ui-065`), drawn while a translate arm is dragged. */
  const rulerAnnotation = reactive(createRulerAnnotation())
  const dimensionAnnotations = reactive([
    createDimensionAnnotation(),
    createDimensionAnnotation(),
    createDimensionAnnotation(),
  ])

  /**
   * The Split sheet's cut plane (`TODO/io-007`), re-projected every frame like the gizmo so it
   * stays on the body while the camera moves.
   */
  const cutPlaneAnnotation = reactive(createCutPlaneAnnotation())

  /**
   * The marquee-select rectangle's screen geometry (`TODO/ui-024`). Written directly from the
   * pointer path (`pointer.move`) rather than only from the render callback.
   */
  const marqueeRect = reactive(createMarqueeRect())

  /**
   * The dashed placement guides' screen geometry (`TODO/ui-013`), written once per `pointermove`
   * of a placement drag rather than once per rendered frame (the camera does not move during one).
   */
  const snapGuides = reactive(createSnapGuideAnnotations())

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

  return {
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
  }
}
