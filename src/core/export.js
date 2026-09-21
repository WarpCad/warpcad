/**
 * Export: kernel solids → STL / OBJ file bytes (`TODO/io-003`).
 *
 * Pure serialization. Nothing here touches the DOM, starts a download or reads
 * selection state from a store: it takes evaluated bodies and a format, and hands back
 * bytes plus the filename and mime type a downloader needs. The trigger control
 * (File ▾ → Export…) and the download itself belong to `TODO/ui-034`.
 *
 * ## Why STL and OBJ are serialized from the kernel, not the render mesh
 *
 * `docs/decisions/persistence-export.md` (sub-decision 4) measured three.js's
 * `STLExporter`, fed by `src/render/mesh.js`, emitting a **non-watertight** solid for a
 * cube minus a Ø6 bore — 100 of 362 edges with no second face — because the mesh bridge
 * fan-triangulates boolean output and keeps the T-junctions BSP splitting leaves
 * behind. `@jscad/stl-serializer` and `@jscad/obj-serializer` call
 * `modifiers.generalize({ snap: true, triangulate: true })` first, which repairs those,
 * so a slicer gets a closed manifold. glTF has no kernel-side serializer at all
 * (`@jscad/io` ships none) and lives in `src/render/export.js`.
 *
 * That repair turned out to be **partial**, which is `TODO/io-004`: it snaps to a
 * bounding-box-derived grid and only then tests collinearity, against a fixed 1e-5 mm,
 * so it misses every T-junction its own snap moved further than that — 6 open edges on
 * a plain Union placed away from the origin, 40 on a placed bolt, 0 on the two shapes
 * `io-003` happened to measure. Solids go through {@link makeWatertight} here before
 * being serialized, which inserts the missing vertices without moving any coordinate.
 * `src/core/kernel/watertight.js` carries the measurements and the rejected candidates.
 *
 * ## Decisions this module owns (`TODO/io-003`)
 *
 * - **Several bodies are ONE file**, not one file each. "Export these" in every slicer
 *   and mesh viewer means one plate / one scene; the suggested name says so
 *   (`warpcad-scene.<ext>`). Per-body files would be a loop the UI can add on top of
 *   this without any change here, whereas the reverse is not true.
 * - **A Group-valued body exports as its combined solid** — the visible parts unioned,
 *   holes subtracted, i.e. exactly `combine()`. That is the object a person would
 *   print, and it is what every other consumer of a Group-as-geometry already gets. A
 *   hidden part stays out, as it does everywhere else.
 * - **Nothing is silently empty.** No bodies, or a body that tessellates to zero
 *   triangles, is refused with an {@link ExportError} that names the body; so is a
 *   body whose geometry cannot be reduced to a solid.
 *
 * Units are millimetres, Z-up, straight from the document: STL and OBJ carry no unit
 * of their own, and mm / Z-up is what slicers assume.
 *
 * Framework-free per CLAUDE.md: no Vue, no DOM, no three.js. Runs in plain Node.
 *
 * @module core/export
 */

import stlSerializer from '@jscad/stl-serializer'
import objSerializer from '@jscad/obj-serializer'

import { toGeom3 } from './kernel/group.js'
import { makeWatertight } from './kernel/watertight.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./kernel/group.js').Group} KernelGroup */

/** @typedef {'stl' | 'obj' | 'glb'} ExportFormat */

/**
 * The part of a document `Body` (`document.bodies()`) that export needs. A real `Body`
 * satisfies this structurally, so the UI passes `bodies()` entries straight in.
 *
 * @typedef {object} ExportBody
 * @property {string} id Lineage-root id — what a selection holds.
 * @property {string} name Display name, e.g. `"Union 1"`.
 * @property {Geom3 | KernelGroup} geometry Evaluated solid, or a composite's Group.
 */

/**
 * @typedef {object} ExportFormatInfo
 * @property {string} label What the format picker says.
 * @property {string} extension Filename extension, no dot.
 * @property {string} mimeType Blob type for the download.
 */

/**
 * The three v1 formats. glTF is binary `.glb` — one file, with no sidecar `.bin` to
 * lose in a downloads folder (`docs/decisions/interaction-model-qa.md` §12 proposed it,
 * `TODO/io-003` confirmed it).
 *
 * @type {Readonly<Record<ExportFormat, ExportFormatInfo>>}
 */
export const EXPORT_FORMATS = Object.freeze({
  stl: Object.freeze({ label: 'STL', extension: 'stl', mimeType: 'model/stl' }),
  obj: Object.freeze({ label: 'OBJ', extension: 'obj', mimeType: 'model/obj' }),
  glb: Object.freeze({ label: 'glTF (.glb)', extension: 'glb', mimeType: 'model/gltf-binary' }),
})

/** Filename stem for several bodies, or the whole scene. */
export const SCENE_FILENAME_STEM = 'warpcad-scene'

/**
 * Why an export was refused. `code` is for the UI to branch on; `message` is already
 * a sentence a person can read and names the body where one is to blame.
 *
 * - `nothing-to-export` — no bodies to write.
 * - `empty-geometry` — a body tessellates to zero triangles.
 * - `evaluation-failed` — a body's geometry could not be reduced to a solid.
 * - `unsupported-format` — a format this module does not serialize (`glb`).
 * - `stale-selection` — a selection that matches no body in the scene.
 */
export class ExportError extends Error {
  /**
   * @param {'nothing-to-export' | 'empty-geometry' | 'evaluation-failed' | 'unsupported-format' | 'stale-selection'} code
   * @param {string} message
   * @param {string} [bodyName] The offending body, when there is one.
   */
  constructor(code, message, bodyName) {
    super(message)
    this.name = 'ExportError'
    this.code = code
    this.bodyName = bodyName
  }
}

/**
 * @param {string} format
 * @returns {ExportFormatInfo}
 */
function formatInfo(format) {
  const info = /** @type {Record<string, ExportFormatInfo>} */ (EXPORT_FORMATS)[format]
  if (!info) {
    throw new Error(`unknown export format "${format}" — expected one of ${Object.keys(EXPORT_FORMATS).join(', ')}`)
  }
  return info
}

/**
 * A display name as a filename stem: lowercased, every run of characters outside
 * `a-z 0-9 . _` collapsed to one hyphen, leading/trailing hyphens and dots trimmed.
 * The character class is deliberately narrow — it is what keeps `../../etc/passwd` and
 * `a:b*c` from becoming path fragments — and falls back to `body` when nothing is left.
 *
 * @param {string | undefined} name
 * @returns {string}
 */
export function slugifyName(name) {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return slug === '' ? 'body' : slug
}

/**
 * The suggested download filename: `union-1.stl` for one body, `warpcad-scene.stl` for
 * several bodies or the whole scene.
 *
 * @param {readonly ExportBody[]} bodies What will be exported.
 * @param {ExportFormat} format
 * @returns {string}
 */
export function exportFilename(bodies, format) {
  const { extension } = formatInfo(format)
  const stem = bodies.length === 1 ? slugifyName(bodies[0].name) : SCENE_FILENAME_STEM
  return `${stem}.${extension}`
}

/**
 * Decide which bodies an export covers: **nothing selected → the whole scene;
 * something selected → just that selection**, in scene order.
 *
 * `selectedIds` are body ids as the selection store holds them. A drilled-in sub-part
 * selection keeps its parent body's id there, so it exports the whole parent body —
 * the part is not an export unit anywhere else. An id that is not a body (a sketch
 * entity, a body a boolean has since consumed) is ignored, but a non-empty selection
 * that matches **nothing** is refused rather than widened: the user asked for "just
 * this", and quietly handing them the whole scene is worse than an error.
 *
 * @param {readonly ExportBody[]} bodies Every body in the scene, in scene order.
 * @param {readonly string[]} selectedIds
 * @returns {{ scope: 'scene' | 'selection', bodies: ExportBody[] }}
 */
export function resolveExportScope(bodies, selectedIds) {
  if (selectedIds.length === 0) return { scope: 'scene', bodies: [...bodies] }
  const wanted = new Set(selectedIds)
  const chosen = bodies.filter((body) => wanted.has(body.id))
  if (chosen.length === 0) {
    throw new ExportError(
      'stale-selection',
      'The selection no longer matches anything in the scene — reselect what you want to export'
    )
  }
  return { scope: 'selection', bodies: chosen }
}

/**
 * Reduce each body to one solid and validate it, in order. Shared with
 * `src/render/export.js` so glTF refuses exactly what STL and OBJ refuse.
 *
 * @param {readonly ExportBody[]} bodies
 * @returns {{ name: string, solid: Geom3 }[]}
 * @throws {ExportError} `nothing-to-export`, `evaluation-failed` or `empty-geometry`.
 */
export function solidsForExport(bodies) {
  if (bodies.length === 0) {
    throw new ExportError('nothing-to-export', 'Nothing to export — the scene has no bodies')
  }
  return bodies.map((body) => {
    /** @type {Geom3} */
    let solid
    try {
      solid = toGeom3(body.geometry)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new ExportError('evaluation-failed', `Cannot export "${body.name}": ${reason}`, body.name)
    }
    if (!solid || !Array.isArray(solid.polygons)) {
      throw new ExportError('evaluation-failed', `Cannot export "${body.name}": it has no solid geometry`, body.name)
    }
    if (!solid.polygons.some((polygon) => polygon.vertices.length >= 3)) {
      throw new ExportError(
        'empty-geometry',
        `Cannot export "${body.name}": it has no triangles, so the file would be empty`,
        body.name
      )
    }
    return { name: body.name, solid }
  })
}

/**
 * Concatenate serializer chunks (an `ArrayBuffer`, or a string) into one `Uint8Array`.
 *
 * @param {ReadonlyArray<ArrayBuffer | string>} chunks
 * @returns {Uint8Array}
 */
function toBytes(chunks) {
  const encoder = new TextEncoder()
  const parts = chunks.map((chunk) => (typeof chunk === 'string' ? encoder.encode(chunk) : new Uint8Array(chunk)))
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return bytes
}

/**
 * Triangles actually written, read back from the finished bytes rather than
 * predicted from the input: the serializers snap vertices and triangulate, and it is
 * the file that has to be non-empty.
 *
 * @param {Uint8Array} bytes
 * @param {'stl' | 'obj'} format
 * @returns {number}
 */
function countWrittenTriangles(bytes, format) {
  if (format === 'stl') {
    // Binary STL: 80-byte header, then a little-endian uint32 triangle count.
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true)
  }
  let triangles = 0
  for (const line of new TextDecoder().decode(bytes).split('\n')) {
    if (!line.startsWith('f ')) continue
    // A face with n corners is n - 2 triangles; the serializer triangulates by
    // default, so this is normally 1, but the count stays right if that changes.
    triangles += Math.max(0, line.trim().split(/\s+/).length - 3)
  }
  return triangles
}

/**
 * @typedef {object} ExportResult
 * @property {Uint8Array} bytes The file's contents.
 * @property {string} filename Suggested download name, e.g. `union-1.stl`.
 * @property {string} mimeType
 * @property {number} triangleCount Triangles in the file (never zero).
 */

/**
 * Serialize bodies to a binary STL or an OBJ. Several bodies go into one file.
 *
 * @param {readonly ExportBody[]} bodies What to write — the caller has already applied
 *   the selection rule (see {@link resolveExportScope}).
 * @param {ExportFormat} format `'stl'` or `'obj'`. `'glb'` is
 *   `src/render/export.js`'s job and is refused here by name.
 * @returns {ExportResult}
 * @throws {ExportError} See {@link solidsForExport}; plus `unsupported-format` for glb.
 */
export function exportBodies(bodies, format) {
  const info = formatInfo(format)
  if (format === 'glb') {
    throw new ExportError(
      'unsupported-format',
      'glTF is exported from the rendered mesh — use exportGltf in src/render/export.js'
    )
  }
  // T-junction repair before serializing, not after: the serializer's own pass is the
  // thing that misses these (`TODO/io-004`, and `src/core/kernel/watertight.js` for why),
  // and by the time it has written bytes there is no topology left to repair. glTF does
  // NOT come through here — it is serialized from the render mesh in
  // `src/render/export.js`, which has the same T-junctions and worse; that is measured
  // and filed as `TODO/io-005`, not silently folded in.
  const solids = solidsForExport(bodies).map((entry) => makeWatertight(entry.solid))

  const chunks =
    format === 'stl'
      ? stlSerializer.serialize({ binary: true }, ...solids)
      : objSerializer.serialize({ triangulate: true }, ...solids)
  const bytes = toBytes(chunks)

  const triangleCount = countWrittenTriangles(bytes, format)
  if (triangleCount === 0) {
    throw new ExportError('empty-geometry', 'Cannot export: the result has no triangles, so the file would be empty')
  }
  return { bytes, filename: exportFilename(bodies, format), mimeType: info.mimeType, triangleCount }
}
