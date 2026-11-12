// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The placement ghost and the drop point it commits at (`TODO/ui-108`, extraction 3; the
 * behaviour is `TODO/ui-010`, `ui-013`, `ui-030` and `ui-031`): the translucent preview that
 * follows the pointer during a Library drag, the caches that keep each variant's geometry,
 * box and offset off the pointer path, and the snap-assisted drop point that both the preview
 * and the commit read.
 *
 * Moved out of `Viewport.vue` without a behaviour change. Framework-free: the working-plane
 * projection, the orbit's millimetres-per-pixel, the document's bodies and resolution, the
 * scene, and the overlay and visibility callbacks are handed in. Viewport.vue keeps the wiring:
 * the drop target's hit-testing (`contains`), the record the release appends (`commit`), and the
 * projection itself, which needs the viewport's rect.
 *
 * The pointer path allocates nothing: the ghost box, the drop point and the snap state are
 * allocated once, here, and mutated (CLAUDE.md's Performance rule). Geometry, boxes and offsets
 * are built once per variant and cached, never per `pointermove`.
 */
import { Mesh } from 'three'
import { geom3ToBufferGeometry, createGhostMaterial } from './mesh.js'
import { nearestOnPlane } from './pick.js'
import { boundsOf } from '../core/kernel/group.js'
import { drawnSolidOf, evaluateOp, policyFor } from '../core/kernel/index.js'
import {
  boxAtPoint,
  clearSnap,
  createBoxMm,
  createSnapState,
  ghostBoxAtOrigin,
  ghostOffsetMm,
  paramsForDrop,
  snapToleranceMm,
  updateSnap,
} from '../core/library.js'

/** @typedef {import('../core/library.js').BoxMm} BoxMm */
/** @typedef {{ x: number, y: number, z: number }} WorkingPlanePoint */

/**
 * The ghost is built once per op at the origin, then moved by `mesh.position`.
 */
const GHOST_ORIGIN = Object.freeze({ x: 0, y: 0 })

/**
 * @typedef {object} PlacementGhostDeps
 * @property {() => any} scene The three.js scene the ghost mesh joins, or `null` before mount.
 * @property {(clientXPx: number, clientYPx: number) => WorkingPlanePoint | null} project
 *   The pointer's point on the working plane, or `null` when the pointer misses it.
 * @property {() => number} mmPerPixel The orbit's millimetres per pixel at the viewport height.
 * @property {() => string} resolution The document's design resolution id (TODO/core-035).
 * @property {() => number} documentVersion Bumped on every document change.
 * @property {() => Iterable<{ id: string, geometry: any }>} bodies The document's bodies.
 * @property {(guides: any) => void} drawSnapGuides Push the snap guides out to the overlay.
 * @property {(snapped: boolean) => void} onSnapChange Called only when the snap flag flips.
 * @property {(visible: boolean) => void} onVisibleChange Called only when visibility flips.
 * @property {number} color The ghost's colour for the current scheme, as a hex number.
 */

/**
 * @typedef {object} PlacementGhost
 * @property {(op: string, key: string, overrides: Record<string, any>, clientXPx: number, clientYPx: number) => void} preview
 *   Move the ghost under the pointer. Does not schedule a render; the caller does.
 * @property {(op: string, key: string, overrides: Record<string, any>, clientXPx: number, clientYPx: number) => { x: number, y: number } | null} dropPoint
 *   Where a drop lands: the pointer's point plus the snap offset. `null` off the working plane.
 * @property {() => void} clear Hide the ghost and drop every trace of the last snap.
 * @property {(hex: number) => void} setColor Recolour the ghost for a colour scheme.
 * @property {() => void} dispose
 */

/**
 * Create the placement ghost controller.
 *
 * @param {PlacementGhostDeps} deps
 * @returns {PlacementGhost}
 */
export function createPlacementGhost(deps) {
  /**
   * Ghost geometry, cached per `variantKey` (and design resolution) so a drag builds each shape at
   * most once. Keyed by variant rather than by op since `TODO/ui-031`: one op can be several shapes.
   * @type {Map<string, any>}
   */
  const geometryCache = new Map()
  /**
   * The ghost's *box*, cached per variant alongside its geometry (`TODO/ui-013`). The snap needs
   * the dragged shape's bounding box on every `pointermove`, and measuring one means evaluating the
   * solid, which is far too expensive for the pointer path. Measured once per variant at the origin
   * instead, then translated by `boxAtPoint`.
   * @type {Map<string, BoxMm>}
   */
  const boxCache = new Map()
  /**
   * How far the ghost *mesh* has to sit from the drop point, cached per variant (`TODO/ui-030`).
   * Zero on all three axes for a primitive. A composite recipe has no position param, so its mesh
   * carries the difference, the same offset the drop's trailing `transform.translate` will commit.
   * @type {Map<string, [number, number, number]>}
   */
  const offsetCache = new Map()

  const material = createGhostMaterial(deps.color)
  /** @type {Mesh | null} */
  let mesh = null
  let meshOp = ''
  let visible = false

  /**
   * What the ghost can snap against: every body already in the document, with the two
   * measurements the snap needs. Rebuilt when the document changes, never per `pointermove`.
   * @type {{ id: string, centroidMm: number[], box: BoxMm }[]}
   */
  const neighbours = []
  let neighboursVersion = -1

  /** The ghost's box at the raw pointer position, allocated once and mutated. */
  const ghostBox = createBoxMm()
  /** Which alignment (if any) the ghost is being held in, and its guides. */
  const snapState = createSnapState()
  /** The point the drop will commit at: the pointer's, plus the snap offset. */
  const dropPointMm = { x: 0, y: 0 }
  let lastSnapped = false

  /**
   * @param {string} key
   * @param {string} op
   * @param {Record<string, any>} overrides
   */
  function geometryFor(key, op, overrides) {
    // At the design resolution (TODO/core-035). Part of the cache key, so changing the setting
    // never serves a ghost faceted at the old one.
    const resolution = deps.resolution()
    const cacheKey = `${key}@${resolution}`
    let geometry = geometryCache.get(cacheKey)
    if (!geometry) {
      // `drawnSolidOf`, not `toGeom3`: a group's parts side by side, never a union in the pointer
      // path (TODO/io-024).
      geometry = geom3ToBufferGeometry(
        drawnSolidOf(evaluateOp(op, paramsForDrop(op, GHOST_ORIGIN, overrides), { policy: policyFor(resolution) })),
      )
      geometryCache.set(cacheKey, geometry)
    }
    return geometry
  }

  /**
   * @param {string} key
   * @param {string} op
   * @param {Record<string, any>} overrides
   * @returns {BoxMm}
   */
  function boxFor(key, op, overrides) {
    let box = boxCache.get(key)
    if (!box) {
      box = ghostBoxAtOrigin(op, overrides)
      boxCache.set(key, box)
    }
    return box
  }

  /**
   * @param {string} key
   * @param {string} op
   * @param {Record<string, any>} overrides
   * @returns {[number, number, number]}
   */
  function offsetFor(key, op, overrides) {
    let offset = offsetCache.get(key)
    if (!offset) {
      offset = ghostOffsetMm(op, overrides)
      offsetCache.set(key, offset)
    }
    return offset
  }

  function refreshNeighbours() {
    if (neighboursVersion === deps.documentVersion()) return
    neighboursVersion = deps.documentVersion()
    neighbours.length = 0
    for (const body of deps.bodies()) {
      const [minMm, maxMm] = boundsOf(body.geometry)
      neighbours.push({
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

  /** Push the snap state out to the overlay and the flag, guarded so it writes only on a flip. */
  function syncSnap() {
    deps.drawSnapGuides(snapState.guides)
    if (lastSnapped !== snapState.snapped) {
      lastSnapped = snapState.snapped
      deps.onSnapChange(lastSnapped)
    }
  }

  function clearSnapFeedback() {
    clearSnap(snapState)
    syncSnap()
  }

  /** @param {boolean} value */
  function setVisible(value) {
    if (visible !== value) {
      visible = value
      deps.onVisibleChange(value)
    }
    if (mesh) mesh.visible = value
  }

  /**
   * Where a drop actually lands: the projected pointer point, moved by whatever alignment the
   * nearest existing body pulls it into. **The single source of both the preview and the commit**,
   * so the solid cannot land somewhere the preview never showed (`TODO/ui-013`).
   *
   * @param {string} key
   * @param {string} op
   * @param {Record<string, any>} overrides
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {{ x: number, y: number } | null}
   */
  function resolve(key, op, overrides, clientXPx, clientYPx) {
    const point = deps.project(clientXPx, clientYPx)
    if (!point) {
      clearSnapFeedback()
      return null
    }
    dropPointMm.x = point.x
    dropPointMm.y = point.y

    refreshNeighbours()
    const nearest = nearestOnPlane(neighbours, point.x, point.y)
    if (nearest === -1) {
      // `ui-013`'s precondition: an empty scene has nothing to align to.
      clearSnap(snapState)
    } else {
      boxAtPoint(boxFor(key, op, overrides), dropPointMm, ghostBox)
      updateSnap(ghostBox, neighbours[nearest].box, snapToleranceMm(deps.mmPerPixel()), snapState)
      dropPointMm.x += snapState.dxMm
      dropPointMm.y += snapState.dyMm
    }
    syncSnap()
    return dropPointMm
  }

  return {
    preview(op, key, overrides, clientXPx, clientYPx) {
      const scene = deps.scene()
      if (!mesh) {
        mesh = new Mesh(geometryFor(key, op, overrides), material)
        mesh.name = 'placement-ghost'
        // Drawn after the solids so its translucency composites over them.
        mesh.renderOrder = 1
        meshOp = key
        scene?.add(mesh)
      }
      if (meshOp !== key) {
        mesh.geometry = geometryFor(key, op, overrides)
        meshOp = key
      }
      const point = resolve(key, op, overrides, clientXPx, clientYPx)
      if (!point) {
        setVisible(false)
        return
      }
      // The snapped point, plus the composite offset, so the preview is where the drop lands.
      const offset = offsetFor(key, op, overrides)
      mesh.position.set(point.x + offset[0], point.y + offset[1], offset[2])
      setVisible(true)
    },

    dropPoint(op, key, overrides, clientXPx, clientYPx) {
      return resolve(key, op, overrides, clientXPx, clientYPx)
    },

    clear() {
      setVisible(false)
      clearSnapFeedback()
    },

    setColor(hex) {
      material.color.setHex(hex)
    },

    dispose() {
      for (const geometry of geometryCache.values()) geometry.dispose()
      geometryCache.clear()
      boxCache.clear()
      offsetCache.clear()
      neighbours.length = 0
      neighboursVersion = -1
      mesh = null
      meshOp = ''
      material.dispose()
    },
  }
}
