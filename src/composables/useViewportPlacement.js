// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The placement ghost and the Library's drop target (`TODO/ui-108` extractions 3 and 7), grouped here
 * by `TODO/ui-152` without a behaviour change: `src/render/placementGhost.js` and
 * `src/composables/useViewportDropTarget.js`, plus the two reactive flags (`snapped`, `ghostVisible`)
 * the template announces as `data-snapped` and `data-ghost`.
 *
 * @module composables/useViewportPlacement
 */
import { ref } from 'vue'
import { updateSnapGuideAnnotations } from '../render/annotate.js'
import { createPlacementGhost } from '../render/placementGhost.js'
import { createViewportDropTarget } from './useViewportDropTarget.js'

/**
 * @typedef {object} ViewportPlacementDeps
 * @property {() => ({ graph: { scene: import('three').Scene } } | null)} viewport
 * @property {() => any} pointer The pointer gestures controller (`projectToWorkingPlane`), built later.
 * @property {any} orbit
 * @property {() => number} widthPx
 * @property {() => number} heightPx
 * @property {{ left: number, top: number, width: number, height: number }} viewportRect
 * @property {() => (HTMLElement | null)} root
 * @property {any} documentStore
 * @property {any} snapGuides The reactive snap-guide annotations.
 * @property {any} color The ghost's fallback colour until mount reads the tokens.
 * @property {() => boolean} isPreviewing
 * @property {() => boolean} isSketching
 * @property {any} sketchCommands
 * @property {any} selection
 * @property {() => void} syncBodies
 * @property {() => void} scheduleRender
 */

/**
 * Create the placement ghost and the drop target. Call once from `setup`.
 *
 * @param {ViewportPlacementDeps} deps
 */
export function useViewportPlacement(deps) {
  const { orbit, documentStore, scheduleRender } = deps
  /** Whether the ghost is being held in line by a snap: the drag's "this is why the preview jumped" signal. */
  const snapped = ref(false)
  const ghostVisible = ref(false)

  const placementGhost = createPlacementGhost({
    scene: () => deps.viewport()?.graph.scene ?? null,
    project: (clientXPx, clientYPx) => deps.pointer().projectToWorkingPlane(clientXPx, clientYPx),
    mmPerPixel: () => orbit.getMmPerPixel(deps.heightPx()),
    resolution: () => documentStore.resolution,
    documentVersion: () => documentStore.version,
    bodies: () => documentStore.raw.bodies(),
    drawSnapGuides: (guides) => updateSnapGuideAnnotations(orbit, guides, deps.widthPx(), deps.heightPx(), deps.snapGuides),
    onSnapChange: (value) => {
      snapped.value = value
    },
    onVisibleChange: (value) => {
      ghostVisible.value = value
    },
    color: deps.color,
  })

  const dropTarget = createViewportDropTarget({
    root: deps.root,
    rect: deps.viewportRect,
    hasViewport: () => !!deps.viewport(),
    placementGhost,
    scheduleRender,
    isPreviewing: deps.isPreviewing,
    isSketching: deps.isSketching,
    sketchCommands: deps.sketchCommands,
    documentStore,
    selection: deps.selection,
    syncBodies: deps.syncBodies,
  })

  return { snapped, ghostVisible, placementGhost, dropTarget }
}
