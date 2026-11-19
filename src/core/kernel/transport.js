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
 * ## Typed arrays, transferred (`TODO/core-085`)
 *
 * That ninth grows with the mesh. A whole-model Subtract of two copies of a 220 k-triangle 3MF
 * blocked the main thread for about 200 ms at the click (`postMessage` cloning one small JS array
 * per corner and polygon) and 80 ms when the answer landed (`onMessage`'s first read of
 * `event.data`). So a solid now crosses as flat typed arrays ({@link PackedSolid}),
 * {@link transferablesOf} lists their buffers for a sender that is done with them, and
 * {@link packGeometryInSlices} packs a dense model a slice at a time. Coordinates and planes are
 * `Float64Array`, so everything still crosses bit-identical. Shared corner arrays are not kept
 * shared on the far side; nothing depends on that (`watertight.js` keys corners by value).
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
 * A solid as flat typed arrays (`TODO/core-085`): `counts[i]` corners for polygon `i`, and every
 * corner's `x, y, z` in `positions`, polygon after polygon. Doubles, so every coordinate
 * crosses bit-identical. Before `core-085` a solid travelled as one small JS array per corner
 * and polygon, and `postMessage` cloning those cost about 200 ms at a dense 3MF's whole-model
 * Subtract; typed arrays clone as one copy each, and {@link transferablesOf} lists their
 * buffers so a caller done with them can hand them over instead of copying at all.
 *
 * @typedef {object} PackedSolid
 * @property {Uint32Array} counts
 * @property {Float64Array} positions
 */

/**
 * The nested-array form from before `TODO/core-085`: one entry per polygon, each a list of
 * `[x, y, z]` corners. Still unpacked, never produced.
 *
 * @typedef {number[][][]} LegacyPackedSolid
 */

/**
 * A solid's polygon planes, index-aligned with its {@link PackedSolid}: JSCAD `[nx, ny, nz, w]`,
 * four doubles per polygon (`TODO/core-085`; a `number[][]` before it, still unpacked).
 * @typedef {Float64Array} PackedPlanes
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
 * @property {Record<string, import('./group.js').PartMeta>} [meta] Part metadata
 *   (TODO/core-075): which parts are split keys, what to buy. Absent when there is none.
 * @property {{ parts: Record<string, PackedPlanes>, holes: PackedPlanes[] }} [planes] Every
 *   polygon's plane (`TODO/core-079`), only when packed with `{ planes: true }`.
 */

/**
 * @typedef {object} PackedSolidGeometry
 * @property {'solid'} kind
 * @property {PackedSolid} polygons
 * @property {PackedPlanes} [planes] Each polygon's plane (`TODO/core-079`), only when
 *   packed with `{ planes: true }`.
 */

/** @typedef {PackedGroup | PackedSolidGeometry} PackedGeometry */

/**
 * @typedef {object} PackedBody
 * @property {string} id
 * @property {string} name
 * @property {PackedGeometry} geometry
 */

/**
 * A solid's polygons with the lazy transform stack applied — `toPolygons`, not `solid.polygons`,
 * so what crosses the boundary is where the user actually put the body.
 *
 * @param {Geom3} solid
 * @returns {{ polygons: readonly any[], wellFormed: boolean }}
 */
function polygonsOf(solid) {
  try {
    return { polygons: geometries.geom3.toPolygons(solid), wellFormed: true }
  } catch {
    // Not a well-formed solid — an empty boolean result, say, which `toPolygons` throws on
    // because it has no transform stack to apply. Pack whatever polygons it claims and let
    // `solidsForExport` refuse it **by name** on the far side, which is exactly what it would
    // have done on this side. Refusing here instead would lose the body name the popover
    // prints (`io-003`: "nothing is silently empty").
    const claimed = /** @type {any} */ (solid)?.polygons
    return { polygons: Array.isArray(claimed) ? claimed : [], wellFormed: false }
  }
}

/**
 * Milliseconds {@link packGeometryInSlices} packs before it stops for the event loop. A quarter
 * of a frame, measured (`TODO/core-085`): at 8 ms, two slices and a frame could still fall
 * between two zero-delay timer ticks and read as a 22 to 26 ms gap at a dense pair's click.
 */
export const SLICE_BUDGET_MS = 4

/** Polygons packed between budget checks by {@link packGeometryInSlices}: well under a millisecond. */
const CHUNK_POLYGONS = 8192

/**
 * Copy polygons `from`..`to` into `positions`, starting at element `at`.
 *
 * @param {readonly any[]} polygons
 * @param {Uint32Array} counts
 * @param {Float64Array} positions
 * @param {number} from
 * @param {number} to
 * @param {number} at
 * @returns {number} Where the next polygon's corners start.
 */
function fillPositions(polygons, counts, positions, from, to, at) {
  for (let index = from; index < to; index += 1) {
    const count = counts[index]
    if (count === 0) continue
    const vertices = polygons[index].vertices
    for (let corner = 0; corner < count; corner += 1) {
      const vertex = vertices[corner]
      positions[at] = vertex[0]
      positions[at + 1] = vertex[1]
      positions[at + 2] = vertex[2]
      at += 3
    }
  }
  return at
}

/**
 * Copy polygons `from`..`to`'s planes into `planes`.
 *
 * @param {readonly any[]} polygons
 * @param {Float64Array} planes
 * @param {number} from
 * @param {number} to
 */
function fillPlanes(polygons, planes, from, to) {
  for (let index = from; index < to; index += 1) {
    const plane = geometries.poly3.plane(polygons[index])
    planes[index * 4] = plane[0]
    planes[index * 4 + 1] = plane[1]
    planes[index * 4 + 2] = plane[2]
    planes[index * 4 + 3] = plane[3]
  }
}

/**
 * Pack a solid into flat typed arrays, and its planes when asked (`TODO/core-079`: each
 * polygon's own plane, so a boolean on the far side reads the very plane this side would).
 * One pass over the polygons to size the arrays, then fills in chunks of `chunk` polygons,
 * yielding between chunks so {@link packGeometryInSlices} can stop for the event loop. No
 * per-polygon allocation.
 *
 * @param {Geom3} solid
 * @param {boolean} withPlanes
 * @param {number} chunk
 * @returns {Generator<void, { polygons: PackedSolid, planes?: PackedPlanes }, void>}
 */
function* packSolidSteps(solid, withPlanes, chunk) {
  const { polygons, wellFormed } = polygonsOf(solid)
  const counts = new Uint32Array(polygons.length)
  let corners = 0
  for (let index = 0; index < polygons.length; index += 1) {
    const vertices = polygons[index]?.vertices
    const count = Array.isArray(vertices) ? vertices.length : 0
    counts[index] = count
    corners += count
  }
  const positions = new Float64Array(corners * 3)
  let at = 0
  for (let from = 0; from < polygons.length; from += chunk) {
    at = fillPositions(polygons, counts, positions, from, Math.min(polygons.length, from + chunk), at)
    yield
  }
  if (!withPlanes) return { polygons: { counts, positions } }
  // A malformed solid has no planes to send, and unpacks as before.
  if (!wellFormed) return { polygons: { counts, positions }, planes: new Float64Array(0) }
  const planes = new Float64Array(polygons.length * 4)
  for (let from = 0; from < polygons.length; from += chunk) {
    fillPlanes(polygons, planes, from, Math.min(polygons.length, from + chunk))
    yield
  }
  return { polygons: { counts, positions }, planes }
}

/**
 * Run a packing generator to the end, synchronously.
 *
 * @template T
 * @param {Generator<void, T, void>} steps
 * @returns {T}
 */
function drain(steps) {
  for (;;) {
    const step = steps.next()
    if (step.done) return step.value
  }
}

/**
 * @param {Geom3} solid
 * @param {boolean} withPlanes
 * @returns {{ polygons: PackedSolid, planes?: PackedPlanes }}
 */
function packSolidWith(solid, withPlanes) {
  return drain(packSolidSteps(solid, withPlanes, Number.MAX_SAFE_INTEGER))
}

/**
 * @param {PackedSolid | LegacyPackedSolid} polygons
 * @param {PackedPlanes | number[][]} [planes] Present (and the same length) when the packer sent planes.
 * @returns {Geom3}
 */
function unpackSolid(polygons, planes) {
  if (Array.isArray(polygons)) {
    // The nested-array form from before TODO/core-085.
    const exact = Array.isArray(planes) && planes.length === polygons.length
    return geometries.geom3.create(
      /** @type {any} */ (polygons.map((vertices, index) => (exact ? { vertices, plane: /** @type {number[][]} */ (planes)[index] } : { vertices })))
    )
  }
  const { counts, positions } = polygons
  const exact = planes instanceof Float64Array && planes.length === counts.length * 4
  const out = new Array(counts.length)
  let at = 0
  for (let index = 0; index < counts.length; index += 1) {
    const count = counts[index]
    const vertices = new Array(count)
    for (let corner = 0; corner < count; corner += 1) {
      vertices[corner] = [positions[at], positions[at + 1], positions[at + 2]]
      at += 3
    }
    out[index] = exact
      ? { vertices, plane: [planes[index * 4], planes[index * 4 + 1], planes[index * 4 + 2], planes[index * 4 + 3]] }
      : { vertices }
  }
  return geometries.geom3.create(/** @type {any} */ (out))
}

/**
 * A body's geometry as something `postMessage` can carry.
 *
 * `planes` (`TODO/core-079`) also sends each polygon's plane, so the geometry unpacks
 * **bit-identical** for a boolean: JSCAD's booleans read a polygon's cached plane, and a
 * boolean result's polygons carry the plane of the face they were merged from — one recomputed
 * from the corners on the far side differs in the 13th digit, enough to move a cut's vertices.
 * The measure job asks for it, because the union it builds comes back to be cut with. Export
 * does not: it never runs a boolean on what it receives.
 *
 * @param {Geom3 | Group} geometry
 * @param {{ planes?: boolean }} [options]
 * @returns {PackedGeometry}
 */
export function packGeometry(geometry, options = {}) {
  return drain(packGeometrySteps(geometry, options.planes === true, Number.MAX_SAFE_INTEGER))
}

/**
 * {@link packGeometry}, a slice at a time (`TODO/core-085`): it stops for the event loop whenever
 * `budgetMs` has been spent since the last stop, so packing a dense model never holds one task
 * for long. At a 2 × 220 k-triangle whole-model Subtract the pack alone was 17 ms of the click's
 * task, over the 16 ms frame. The result is exactly what {@link packGeometry} returns. The
 * geometry is immutable, so nothing can change it between slices.
 *
 * @param {Geom3 | Group} geometry
 * @param {{ planes?: boolean, budgetMs?: number, chunkPolygons?: number, now?: () => number, yieldToEventLoop?: () => Promise<void> }} [options]
 *   `budgetMs` defaults to {@link SLICE_BUDGET_MS}; `now`, `yieldToEventLoop` and
 *   `chunkPolygons` are the clock, the yield and the slice size, replaceable for a test.
 * @returns {Promise<PackedGeometry>}
 */
export async function packGeometryInSlices(geometry, options = {}) {
  const budgetMs = options.budgetMs ?? SLICE_BUDGET_MS
  const now = options.now ?? (() => performance.now())
  const yieldToEventLoop = options.yieldToEventLoop ?? (() => new Promise((resolve) => setTimeout(resolve, 0)))
  const steps = packGeometrySteps(geometry, options.planes === true, options.chunkPolygons ?? CHUNK_POLYGONS)
  let sliceStart = now()
  for (;;) {
    const step = steps.next()
    if (step.done) return step.value
    if (now() - sliceStart >= budgetMs) {
      await yieldToEventLoop()
      sliceStart = now()
    }
  }
}

/**
 * @param {Geom3 | Group} geometry
 * @param {boolean} withPlanes
 * @param {number} chunk
 * @returns {Generator<void, PackedGeometry, void>}
 */
function* packGeometrySteps(geometry, withPlanes, chunk) {
  if (isGroup(geometry)) {
    /** @type {Record<string, PackedSolid>} */
    const parts = {}
    /** @type {Record<string, PackedPlanes>} */
    const partPlanes = {}
    for (const [partName, part] of Object.entries(geometry.parts)) {
      const packed = yield* packSolidSteps(part, withPlanes, chunk)
      parts[partName] = packed.polygons
      if (packed.planes !== undefined) partPlanes[partName] = packed.planes
    }
    const holes = []
    for (const hole of geometry.holes) holes.push(yield* packSolidSteps(hole, withPlanes, chunk))
    /** @type {PackedGroup} */
    const packed = {
      kind: 'group',
      name: geometry.name,
      names: [...geometry.names],
      parts,
      holes: holes.map((hole) => hole.polygons),
      // Plain `{ color, alpha }` objects clone as-is (TODO/core-026).
      colors: { ...geometry.colors },
      // Plain data (TODO/core-075): Print pieces needs it on the worker side.
      ...(geometry.meta === undefined ? {} : { meta: JSON.parse(JSON.stringify(geometry.meta)) }),
    }
    if (withPlanes) packed.planes = { parts: partPlanes, holes: holes.map((hole) => /** @type {PackedPlanes} */ (hole.planes)) }
    return packed
  }
  const { polygons, planes } = yield* packSolidSteps(/** @type {Geom3} */ (geometry), withPlanes, chunk)
  return planes === undefined ? { kind: 'solid', polygons } : { kind: 'solid', polygons, planes }
}

/**
 * Every `ArrayBuffer` inside packed geometry, each listed once (`TODO/core-085`): what to pass
 * as `postMessage`'s transfer list when the sender is done with what it packed. Transferring
 * hands the buffers over without a copy and **detaches** them on this side, so only a caller
 * that packed for this one message may do it.
 *
 * Accepts anything the packers here produce, or arrays and objects of them (a job's operands,
 * a measure result's unions), and ignores everything else.
 *
 * @param {unknown} packed
 * @returns {ArrayBuffer[]}
 */
export function transferablesOf(packed) {
  /** @type {Set<ArrayBuffer>} */
  const found = new Set()
  /** @param {unknown} value */
  const visit = (value) => {
    if (value === null || typeof value !== 'object') return
    if (ArrayBuffer.isView(value)) {
      if (value.buffer instanceof ArrayBuffer && value.buffer.byteLength > 0) found.add(value.buffer)
      return
    }
    // Plain arrays of numbers (a legacy nested solid, a colour) hold no buffers; skip them fast.
    if (Array.isArray(value)) {
      for (const item of value) if (item !== null && typeof item === 'object') visit(item)
      return
    }
    for (const item of Object.values(value)) visit(item)
  }
  visit(packed)
  return [...found]
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
    for (const [partName, part] of Object.entries(packed.parts)) parts[partName] = unpackSolid(part, packed.planes?.parts[partName])
    return {
      name: packed.name,
      names: [...packed.names],
      parts,
      holes: packed.holes.map((hole, index) => unpackSolid(hole, packed.planes?.holes[index])),
      // A packed group from before TODO/core-026 has no colours; it comes back uncoloured.
      colors: { ...(packed.colors ?? {}) },
      ...(packed.meta === undefined ? {} : { meta: { ...packed.meta } }),
    }
  }
  return unpackSolid(packed.polygons, packed.planes)
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
  return solids.map(({ name, solid }) => ({ name, polygons: packSolidWith(solid, false).polygons }))
}

/**
 * @param {readonly { name: string, polygons: PackedSolid | LegacyPackedSolid }[]} packed
 * @returns {{ name: string, solid: Geom3 }[]}
 */
export function unpackSolids(packed) {
  return packed.map(({ name, polygons }) => ({ name, solid: unpackSolid(polygons) }))
}
