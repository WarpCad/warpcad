// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The committed bodies' scene controller and the counts it announces (`TODO/ui-108`), grouped here by
 * `TODO/ui-152` without a behaviour change: `src/render/bodyMeshes.js`. The counts become `data-*`
 * attributes, so they live in a `reactive` object this composable owns. `bodyMeshes` and `bodiesGroup`
 * are the controller's own map and group, aliased for picking and the gizmo drag preview.
 *
 * @module composables/useViewportBodies
 */
import { reactive } from 'vue'
import { createBodyCounts, createBodyMeshes } from '../render/bodyMeshes.js'

/**
 * @typedef {object} ViewportBodiesDeps
 * @property {() => Iterable<any>} bodies The bodies to draw: the previewed prefix or the live document's.
 * @property {(id: string) => boolean} isHiddenShown Whether the user chose to Show a hidden part.
 * @property {(id: string) => boolean} isSketched Whether the sketch editor is drawing over this body.
 * @property {any} selection
 * @property {any} alignReference
 * @property {any} hoverHighlight
 * @property {any} repeatSession
 * @property {any} colorPreview
 * @property {() => void} scheduleRender
 */

/**
 * Create the bodies' controller. Call once from `setup`.
 *
 * @param {ViewportBodiesDeps} deps
 */
export function useViewportBodies(deps) {
  const bodyCounts = reactive(createBodyCounts())
  const bodyScene = createBodyMeshes({ ...deps, counts: bodyCounts })
  return {
    bodyCounts,
    bodyScene,
    bodiesGroup: bodyScene.group,
    bodyMeshes: bodyScene.meshes,
  }
}
