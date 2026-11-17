// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Frame the camera on a freshly loaded document (`TODO/io-001`, `TODO/ui-089`; moved out of
 * `Viewport.vue` by `TODO/ui-108` without a behaviour change).
 *
 * Runs when a whole document is *loaded* (an autosave restore or an Open), never on an edit. A
 * loaded project whose geometry sits outside the default view would otherwise read as an empty
 * scene, and a user who had panned away before reloading would reopen the app to what looks like
 * lost work. Orientation is kept; only target and distance move. Reads the summaries' plain
 * `bounds`, so no geometry is touched.
 *
 * A project that comes back with things hidden is framed on what is still drawn, measured from
 * the geometry; with nothing drawn at all, on everything.
 *
 * @module render/frameContent
 */
import { drawnBoundsOf } from './mesh.js'

/**
 * @typedef {object} FrameContentDeps
 * @property {{ frameBounds: (min: readonly number[], max: readonly number[], aspect?: number) => void }} orbit
 * @property {() => readonly { bounds: readonly (readonly number[])[], viewHidden?: boolean, viewHiddenParts?: readonly unknown[] }[]} summaries
 *   The bodies to frame: the live document's, or the watched project's in the Shared view.
 * @property {() => readonly any[]} rawBodies The bodies with geometry, for the hidden-parts case.
 * @property {() => number} widthPx
 * @property {() => number} heightPx
 * @property {() => void} scheduleRender
 */

/**
 * Create the framing function.
 *
 * @param {FrameContentDeps} deps
 * @returns {() => void}
 */
export function createFrameContent(deps) {
  return function frameLoadedContent() {
    const summaries = deps.summaries()
    if (summaries.length === 0) return
    const widthPx = deps.widthPx()
    const heightPx = deps.heightPx()
    const aspect = heightPx > 0 ? widthPx / heightPx : 1
    if (summaries.some((body) => body.viewHidden || body.viewHiddenParts)) {
      const drawn = drawnBoundsOf(deps.rawBodies())
      if (drawn !== null) {
        deps.orbit.frameBounds(drawn[0], drawn[1], aspect)
        deps.scheduleRender()
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
    deps.orbit.frameBounds(min, max, aspect)
    deps.scheduleRender()
  }
}
