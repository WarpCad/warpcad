// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Snapping a sketch point onto the outlines already on the slice, and the marker that shows it
 * (`TODO/ui-108`, extraction 4a; the behaviour is `TODO/sketch-007`): the snap targets, rebuilt
 * only when an outline they come from changes; the search for the nearest target in reach; and
 * the marker's screen position, re-projected whenever the camera moves.
 *
 * Moved out of `Viewport.vue` without a behaviour change. Framework-free: the orbit camera, the
 * sketch editor's state, the active slice's height, the viewport's size, and the reactive marker
 * the overlay reads are handed in. Viewport.vue keeps the pointer wiring that decides *when* a
 * point is snapped (press, drag, click, Shift), and the hover that uses it.
 *
 * The search allocates nothing that outlives a call: the snap result, the marker position and
 * the target cache are allocated once, here (CLAUDE.md's Performance rule).
 */
import { SNAP_LABELS, createSnapResult, snapPoint, snapTargets } from '../sketch/snap.js'
import { createScreenPoint, sketchPointToScreen } from './annotate.js'

/** How close, in screen pixels, a point must be to a target to snap onto it. */
const SKETCH_SNAP_RADIUS_PX = 12
/** How far, in screen pixels, a marker is lifted above a finger so the finger does not hide it. */
const SKETCH_SNAP_TOUCH_LIFT_PX = 56

/** @type {readonly any[]} */
const NO_PROFILES = Object.freeze([])

/**
 * What this module reads of the sketch editor store (`src/stores/sketchEditor.js`).
 *
 * @typedef {object} SketchSnapEditor
 * @property {{ profiles: readonly any[] } | null} slice The active slice, or `null`.
 * @property {boolean} snapEnabled The toolbar's Snap toggle.
 * @property {string} tool The armed tool.
 * @property {string} selectedProfileId
 * @property {string} chainId The live Line chain's outline, or `''`.
 * @property {readonly any[]} frame The sketch's plane frame.
 */

/**
 * The reactive marker the overlay reads. Written here; the component owns the object so the
 * template can bind to it.
 *
 * @typedef {object} SnapMarker
 * @property {boolean} visible
 * @property {number} xPx
 * @property {number} yPx
 * @property {number} markerXPx
 * @property {number} markerYPx
 * @property {boolean} lifted
 * @property {string} kind
 * @property {string} label
 */

/**
 * @typedef {object} SketchSnapDeps
 * @property {any} orbit The orbit camera (`getMmPerPixel`, and the projection's inputs).
 * @property {SketchSnapEditor} editor The sketch editor store's state.
 * @property {() => number} sliceZ The active slice's height in mm.
 * @property {() => number} widthPx
 * @property {() => number} heightPx
 * @property {() => boolean} isEditing True while a point is being dragged: the dragged outline is
 *   then the one excluded from the targets, rather than the one being drawn.
 * @property {SnapMarker} marker
 */

/**
 * @typedef {object} SketchSnap
 * @property {(pointMm: number[], shiftKey: boolean, touch: boolean) => boolean} snap
 *   Snap a point in place and show the marker, or hide it. Returns whether it moved.
 * @property {() => void} hide Hide the marker and clear its kind.
 * @property {() => void} draw Re-project the marker for the current camera.
 */

/**
 * Create the sketch snap controller.
 *
 * @param {SketchSnapDeps} deps
 * @returns {SketchSnap}
 */
export function createSketchSnap(deps) {
  const { editor, marker } = deps
  /**
   * The active slice's snap targets, rebuilt only when an outline they come from changed. `profiles`
   * is the identity of every outline they were built from, so the check that they are still current
   * is a walk with no allocation: a point drag replaces only the outline being dragged, which is
   * excluded, so its targets survive the whole drag.
   */
  const cache = {
    /** @type {import('../sketch/snap.js').SnapTargets | null} */
    targets: null,
    /** @type {object[]} */
    profiles: /** @type {object[]} */ ([]),
    excludeId: '',
    /** @type {readonly number[] | null} */
    firstVertex: null,
  }
  const result = createSnapResult()
  /** Where the shown marker is, sketch mm, re-projected when the camera moves. */
  const markerMm = { xMm: 0, yMm: 0 }
  const scratchPoint = createScreenPoint()

  /**
   * The active slice's snap targets, minus `excludeId`.
   *
   * @param {string} excludeId The outline being drawn or edited, or `''`.
   * @param {boolean} keepFirst A live Line chain: its first point stays a target (close on it).
   */
  function targetsFor(excludeId, keepFirst) {
    const profiles = editor.slice?.profiles ?? NO_PROFILES
    /** @type {readonly number[] | null} */
    let first = null
    if (keepFirst && excludeId) {
      for (const profile of profiles) {
        if (profile.id !== excludeId) continue
        if (profile.kind === 'polyline' && !profile.closed && profile.pointsMm.length >= 3) first = profile.pointsMm[0]
        break
      }
    }
    const cached = cache.profiles
    let current = cache.targets !== null && cache.excludeId === excludeId && cache.firstVertex === first
    if (current) {
      let at = 0
      for (const profile of profiles) {
        if (profile.id === excludeId) continue
        if (cached[at] !== profile) {
          current = false
          break
        }
        at += 1
      }
      if (at !== cached.length) current = false
    }
    if (current && cache.targets) return cache.targets
    cached.length = 0
    for (const profile of profiles) if (profile.id !== excludeId) cached.push(profile)
    cache.excludeId = excludeId
    cache.firstVertex = first
    cache.targets = snapTargets(profiles, excludeId, { keepFirstVertex: first !== null })
    return cache.targets
  }

  function draw() {
    if (!marker.kind) {
      if (marker.visible) marker.visible = false
      return
    }
    const point = sketchPointToScreen(
      deps.orbit,
      editor.frame,
      markerMm.xMm,
      markerMm.yMm,
      deps.sliceZ(),
      deps.widthPx(),
      deps.heightPx(),
      scratchPoint,
    )
    marker.xPx = point.x
    marker.yPx = point.y
    marker.markerXPx = point.x
    marker.markerYPx = marker.lifted ? point.y - SKETCH_SNAP_TOUCH_LIFT_PX : point.y
    marker.visible = point.visible
  }

  function hide() {
    if (marker.kind) marker.kind = ''
    if (marker.visible) marker.visible = false
  }

  return {
    snap(pointMm, shiftKey, touch) {
      if (!editor.snapEnabled || shiftKey) {
        hide()
        return false
      }
      // The outline being drawn or edited is never its own target: a dragged point's outline, or
      // the live Line chain (which keeps only its first point, to close on).
      const editing = deps.isEditing()
      const excludeId = editing ? editor.selectedProfileId : editor.tool === 'line' ? editor.chainId : ''
      const targets = targetsFor(excludeId, !editing && editor.tool === 'line')
      const radiusMm = SKETCH_SNAP_RADIUS_PX * (deps.orbit.getMmPerPixel(deps.heightPx()) || 1)
      const hit = snapPoint(pointMm, targets, radiusMm, result)
      if (!hit) {
        hide()
        return false
      }
      pointMm[0] = hit.pointMm[0]
      pointMm[1] = hit.pointMm[1]
      markerMm.xMm = hit.pointMm[0]
      markerMm.yMm = hit.pointMm[1]
      if (marker.kind !== hit.kind) {
        marker.kind = hit.kind
        marker.label = SNAP_LABELS[hit.kind]
      }
      marker.lifted = touch
      draw()
      return true
    },
    hide,
    draw,
  }
}
