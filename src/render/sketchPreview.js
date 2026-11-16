// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The sketch editor's live extrusion preview (`TODO/ui-108`, step 6; the behaviour is
 * `TODO/sketch-001`): the draft built in the worker, drawn as a ghost in the sketch's own frame.
 *
 * Moved out of `Viewport.vue` without a behaviour change. Framework-free: the sketch editor's
 * state, the evaluation channel, the document's resolution, the scene (a getter, since the
 * viewport is built on mount), and the frame scheduler are handed in.
 *
 * A newer request on the channel supersedes an older one rather than queueing behind it
 * (CLAUDE.md's Performance rule), so a burst of edits costs one build, and an old answer never
 * paints over a newer one.
 */
import { Mesh } from 'three'
import { toGeom3 } from '../core/kernel/index.js'
import { unpackGeometry } from '../core/kernel/transport.js'
import { createGhostMaterial, geom3ToBufferGeometry } from './mesh.js'

/**
 * What this module reads and writes of the sketch editor store (`src/stores/sketchEditor.js`).
 *
 * @typedef {object} SketchPreviewEditor
 * @property {boolean} active
 * @property {{ slices: any, extrusion: any }} draft
 * @property {string} doneProblem
 * @property {string} previewStatus
 * @property {string} previewError
 * @property {readonly number[]} frame
 */

/**
 * @typedef {object} SketchPreviewDeps
 * @property {SketchPreviewEditor} editor
 * @property {{ request: (job: any) => Promise<any> }} channel An evaluation channel
 *   (`createEvaluationChannel` in `src/core/kernel/evaluationClient.js`).
 * @property {() => any} resolution The document's resolution setting, passed through to the build job.
 * @property {() => (import('three').Object3D | null)} scene The scene, or `null` with no viewport.
 * @property {() => void} scheduleRender
 */

/**
 * @typedef {object} SketchPreview
 * @property {() => void} request Ask the worker to build the draft, or clear an unbuildable one.
 * @property {() => void} clear Remove the preview mesh.
 * @property {(colorHex: number) => void} createMaterial Build the ghost material (on mount).
 * @property {(colorHex: number) => void} setColor Recolour it for a theme change.
 * @property {() => void} dispose Dispose the material (on unmount; `clear` first).
 */

/**
 * Create the sketch preview controller.
 *
 * @param {SketchPreviewDeps} deps
 * @returns {SketchPreview}
 */
export function createSketchPreview(deps) {
  const { editor: sketchEditor, channel: sketchPreviewChannel, scheduleRender } = deps
  /** @type {import('three').Mesh | null} */
  let sketchPreviewMesh = null
  /** @type {any} */
  let sketchPreviewMaterial = null

  function clearSketchPreview() {
    if (sketchPreviewMesh) {
      deps.scene()?.remove(sketchPreviewMesh)
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
      .request({ kind: 'build', op: 'primitive.sketch', params, resolution: deps.resolution() })
      .then((outcome) => {
        if (outcome.superseded || !sketchEditor.active || sketchEditor.draft !== draft) return
        const result = /** @type {import('../core/kernel/evaluationJob.js').BuildResult} */ (outcome.result)
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
        const scene = deps.scene()
        if (!scene || !sketchPreviewMaterial) {
          buffer.dispose()
          return
        }
        if (!sketchPreviewMesh) {
          sketchPreviewMesh = new Mesh(buffer, sketchPreviewMaterial)
          sketchPreviewMesh.name = 'sketch-preview'
          sketchPreviewMesh.renderOrder = 1
          sketchPreviewMesh.matrixAutoUpdate = false
          scene.add(sketchPreviewMesh)
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

  return {
    request: requestSketchPreview,
    clear: clearSketchPreview,
    createMaterial(colorHex) {
      sketchPreviewMaterial = createGhostMaterial(colorHex)
    },
    setColor(colorHex) {
      sketchPreviewMaterial?.color.setHex(colorHex)
    },
    dispose() {
      sketchPreviewMaterial?.dispose()
      sketchPreviewMaterial = null
    },
  }
}
