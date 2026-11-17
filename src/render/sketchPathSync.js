// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The sketch editor's outline sync (`TODO/ui-108`): re-projects the draft's outlines, the
 * revolve axis, the Line chain, the snap guides and the reference photo's overlay, but only when
 * something they depend on changed since the last pass.
 *
 * Moved out of `Viewport.vue` without a behaviour change. Framework-free: the reactive structures
 * the SVG layer draws from are allocated by the viewport and handed in, along with the orbit
 * camera and the viewport size (getters, since it changes on resize).
 *
 * @module render/sketchPathSync
 */
import { createSketchPath, updateSketchPath } from './annotate.js'
import { isClosed, toPointsMm } from '../sketch/profile.js'

/**
 * @typedef {object} SketchPathSyncDeps
 * @property {import('./camera.js').OrbitCamera} orbit
 * @property {any} sketchEditor The sketch editor store (`active`, `draft`, `frame`, selection, hover, tool).
 * @property {any[]} paths The outline list the SVG layer draws. Mutated in place.
 * @property {{ visible: boolean, d: string }} axis The revolve axis. Mutated in place.
 * @property {{ visible: boolean }} draftPath The in-progress outline. Mutated in place.
 * @property {{ visible: boolean }} chain The Line chain's polyline. Mutated in place.
 * @property {{ clear: () => void, sync: () => void }} handler The vertex handles.
 * @property {{ live: { has: boolean }, drawChain: () => void }} draw
 * @property {{ hide: () => void, draw: () => void }} snapper
 * @property {{ syncOverlay: () => void }} referenceImage
 * @property {() => number} widthPx Viewport width, CSS pixels.
 * @property {() => number} heightPx Viewport height, CSS pixels.
 * @property {() => number} sliceZ The active slice's offset along the sketch's own Z.
 */

/**
 * @typedef {object} SketchPathSync
 * @property {(force?: boolean) => void} sync Re-project, if anything changed (or `force`).
 */

/**
 * Create the sketch outline sync controller.
 *
 * @param {SketchPathSyncDeps} deps
 * @returns {SketchPathSync}
 */
export function createSketchPathSync(deps) {
  const { orbit, sketchEditor, paths, axis: sketchAxis, draftPath, chain, handler, draw, snapper, referenceImage } = deps

  /** What the last `sync` drew from, so an unchanged frame redraws nothing. */
  let syncedDraft = /** @type {object | null} */ (null)
  let syncedCamera = -1
  let syncedSize = ''
  let syncedSelection = ''
  let syncedHover = ''
  let syncedSlice = -1
  let syncedVertex = -2
  let syncedHoverVertex = -2
  let syncedTool = ''

  /**
   * Re-project the draft's outlines, if anything they depend on changed.
   *
   * Called from the render callback (camera moves) and from the draft watcher (edits).
   *
   * @param {boolean} [force]
   */
  function sync(force = false) {
    if (!sketchEditor.active) {
      if (paths.length > 0) paths.splice(0)
      handler.clear()
      sketchAxis.visible = false
      draftPath.visible = false
      chain.visible = false
      draw.live.has = false
      snapper.hide()
      syncedDraft = null
      return
    }
    const widthPx = deps.widthPx()
    const heightPx = deps.heightPx()
    const size = `${widthPx}x${heightPx}`
    const draft = sketchEditor.draft
    if (
      !force &&
      syncedDraft === draft &&
      syncedCamera === orbit.version &&
      syncedSize === size &&
      syncedSelection === sketchEditor.selectedProfileId &&
      syncedHover === sketchEditor.hoverProfileId &&
      syncedSlice === sketchEditor.activeSlice &&
      syncedVertex === sketchEditor.selectedVertex &&
      syncedHoverVertex === sketchEditor.hoverVertex &&
      syncedTool === sketchEditor.tool
    ) {
      return
    }
    syncedDraft = draft
    syncedCamera = orbit.version
    syncedSize = size
    syncedSelection = sketchEditor.selectedProfileId
    syncedHover = sketchEditor.hoverProfileId
    syncedSlice = sketchEditor.activeSlice
    syncedVertex = sketchEditor.selectedVertex
    syncedHoverVertex = sketchEditor.hoverVertex
    syncedTool = sketchEditor.tool
    const frame = sketchEditor.frame
    /** @type {any[]} */
    const next = []
    draft.slices.forEach((/** @type {any} */ slice, /** @type {number} */ sliceIndex) => {
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
    paths.splice(0, paths.length, ...next)
    handler.sync()

    // Revolve and Helical spin around the sketch's Y axis (x = 0): draw it, dashed, long
    // enough to read at any zoom.
    const method = draft.extrusion.method
    if (method === 'revolve' || method === 'helical') {
      const reachMm = Math.max(200, (orbit.getMmPerPixel(heightPx) || 1) * heightPx)
      const line = updateSketchPath(orbit, frame, [[0, -reachMm], [0, reachMm]], deps.sliceZ(), false, widthPx, heightPx, createSketchPath())
      sketchAxis.visible = line.visible
      sketchAxis.d = line.d
    } else {
      sketchAxis.visible = false
    }
    draw.drawChain()
    snapper.draw()
    referenceImage.syncOverlay()
  }

  return { sync }
}
