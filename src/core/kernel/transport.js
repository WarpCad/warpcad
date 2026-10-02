// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Kernel geometry across a worker boundary (`TODO/perf-001`).
 *
 * This is the first worker in the repo, and this module is the only thing that knows
 * how a `Geom3` or a {@link Group} becomes a message and back. Everything else on
 * either side of the boundary deals in real kernel geometry.
 *
 * ## Why this shape, measured
 *
 * A `Geom3`'s polygons are plain objects holding plain `[x, y, z]` arrays — nothing
 * transferable, so structured clone has to walk and copy them. `TODO/perf-001` measured
 * what that costs on the scene the export benchmark calls `24-bodies` (12 Raspberry Pi
 * boards and 12 bolts, 13,440 polygons *before* their groups are combined):
 *
 * | | cost |
 * |---|---|
 * | {@link packGeometry} on the main thread | **0.18 ms** |
 * | `structuredClone` of the packed bodies (what `postMessage` pays) | **6.5 ms** |
 * | the finished 618 KB STL coming back | **0.11 ms** |
 * | the work this moves off the main thread | **~57 ms** (combine 43, repair 5, serialize 9) |
 *
 * So the clone does not eat the win — it costs about a ninth of what it relocates, and
 * the answer comes back in a `Uint8Array`, which *is* transferable. That measurement is
 * the reason `TODO/perf-001` chose an export worker over "optimise the repair and stop".
 *
 * ## What is deliberately not sent
 *
 * - **Lazy transforms.** `geom3.toPolygons` applies them here, so the worker receives
 *   geometry already in document millimetres and can never apply a move twice — the
 *   trap `src/core/kernel/watertight.js` calls out for the repair itself.
 * - **Anything the export path does not read.** A group travels as its parts, its
 *   visible `names` and its `holes`, because that is exactly what `combine()` uses —
 *   plus its per-part `colors` (TODO/core-026), which cost a few bytes and are the one
 *   piece of recipe intent that would otherwise be lost silently at this boundary.
 *
 * Framework-free and DOM-free: this module runs identically on the main thread and
 * inside the worker, which is what lets a unit test mock the boundary without a real
 * `Worker` (CLAUDE.md, Conventions).
 *
 * @module core/kernel/transport
 */

import modeling from '@jscad/modeling'

import { isGroup } from './group.js'

const { geometries } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./group.js').Group} Group */

/**
 * A solid as plain arrays: one entry per polygon, each a list of `[x, y, z]` corners.
 *
 * @typedef {number[][][]} PackedSolid
 */

/**
 * @typedef {object} PackedGroup
 * @property {'group'} kind
 * @property {string} name
 * @property {string[]} names Ordered visible part names.
 * @property {Record<string, PackedSolid>} parts
 * @property {PackedSolid[]} holes
 * @property {Record<string, import('./group.js').PartColor>} [colors] Part colours
 *   (TODO/core-026). Optional so a message packed before it existed still unpacks.
 */

/**
 * @typedef {object} PackedSolidGeometry
 * @property {'solid'} kind
 * @property {PackedSolid} polygons
 */

/** @typedef {PackedGroup | PackedSolidGeometry} PackedGeometry */

/**
 * @typedef {object} PackedBody
 * @property {string} id
 * @property {string} name
 * @property {PackedGeometry} geometry
 */

/**
 * @param {Geom3} solid
 * @returns {PackedSolid}
 */
function packSolid(solid) {
  try {
    // `toPolygons`, not `solid.polygons`: it applies the lazy transform stack, so what
    // crosses the boundary is where the user actually put the body.
    return geometries.geom3.toPolygons(solid).map((polygon) => polygon.vertices)
  } catch {
    // Not a well-formed solid — an empty boolean result, say, which `toPolygons`
    // throws on because it has no transform stack to apply. Pack whatever polygons it
    // claims and let `solidsForExport` refuse it **by name** on the far side, which is
    // exactly what it would have done on this side. Refusing here instead would lose
    // the body name the popover prints (`io-003`: "nothing is silently empty").
    return Array.isArray(/** @type {any} */ (solid)?.polygons)
      ? /** @type {any} */ (solid).polygons.map((/** @type {any} */ polygon) => polygon?.vertices ?? [])
      : []
  }
}

/**
 * @param {PackedSolid} polygons
 * @returns {Geom3}
 */
function unpackSolid(polygons) {
  return geometries.geom3.create(
    /** @type {any} */ (polygons.map((vertices) => ({ vertices })))
  )
}

/**
 * A body's geometry as something `postMessage` can carry.
 *
 * @param {Geom3 | Group} geometry
 * @returns {PackedGeometry}
 */
export function packGeometry(geometry) {
  if (isGroup(geometry)) {
    /** @type {Record<string, PackedSolid>} */
    const parts = {}
    for (const [partName, part] of Object.entries(geometry.parts)) parts[partName] = packSolid(part)
    return {
      kind: 'group',
      name: geometry.name,
      names: [...geometry.names],
      parts,
      holes: geometry.holes.map((hole) => packSolid(hole)),
      // Plain `{ color, alpha }` objects clone as-is (TODO/core-026).
      colors: { ...geometry.colors },
    }
  }
  return { kind: 'solid', polygons: packSolid(/** @type {Geom3} */ (geometry)) }
}

/**
 * The inverse of {@link packGeometry}. A group comes back structurally identical to
 * what {@link import('./group.js').createGroup} builds, so `combine()`/`toGeom3()`
 * work on it unchanged.
 *
 * @param {PackedGeometry} packed
 * @returns {Geom3 | Group}
 */
export function unpackGeometry(packed) {
  if (packed.kind === 'group') {
    /** @type {Record<string, Geom3>} */
    const parts = {}
    for (const [partName, part] of Object.entries(packed.parts)) parts[partName] = unpackSolid(part)
    return {
      name: packed.name,
      names: [...packed.names],
      parts,
      holes: packed.holes.map(unpackSolid),
      // A packed group from before TODO/core-026 has no colours; it comes back uncoloured.
      colors: { ...(packed.colors ?? {}) },
    }
  }
  return unpackSolid(packed.polygons)
}

/**
 * Pack the bodies an export covers. The caller has already applied the selection rule
 * (`resolveExportScope`), so this is exactly what will be written.
 *
 * @param {readonly import('../export.js').ExportBody[]} bodies
 * @returns {PackedBody[]}
 */
export function packBodies(bodies) {
  return bodies.map((body) => ({ id: body.id, name: body.name, geometry: packGeometry(body.geometry) }))
}

/**
 * @param {readonly PackedBody[]} packed
 * @returns {import('../export.js').ExportBody[]}
 */
export function unpackBodies(packed) {
  return packed.map((body) => ({ id: body.id, name: body.name, geometry: unpackGeometry(body.geometry) }))
}

/**
 * Pack already-combined, already-repaired solids for the trip *back* — what the glTF
 * path needs, because three.js's `GLTFExporter` stays on the main thread.
 *
 * @param {readonly { name: string, solid: Geom3 }[]} solids
 * @returns {{ name: string, polygons: PackedSolid }[]}
 */
export function packSolids(solids) {
  return solids.map(({ name, solid }) => ({ name, polygons: packSolid(solid) }))
}

/**
 * @param {readonly { name: string, polygons: PackedSolid }[]} packed
 * @returns {{ name: string, solid: Geom3 }[]}
 */
export function unpackSolids(packed) {
  return packed.map(({ name, polygons }) => ({ name, solid: unpackSolid(polygons) }))
}
