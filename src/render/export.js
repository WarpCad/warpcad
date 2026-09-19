/**
 * glTF export: kernel solids → a binary `.glb` (`TODO/io-003`).
 *
 * This is the render-side half of export, and it exists because there is no other
 * place glTF can come from: `@jscad/io` has no glTF serializer at all
 * (`docs/decisions/persistence-export.md`, sub-decision 4), so it goes through three.js's
 * `GLTFExporter` over the same `BufferGeometry` the mesh bridge builds for the viewport.
 * STL and OBJ are serialized kernel-side in `src/core/export.js`, where a slicer gets a
 * watertight solid; a glTF consumer is a viewer or a game engine, which does not need
 * one, so the render mesh is the right source here.
 *
 * Like its core sibling this module **does not trigger a download** — it returns bytes,
 * a filename and a mime type, and `TODO/ui-034` hands them to the browser.
 *
 * ## Decisions (`TODO/io-003`)
 *
 * - **Binary `.glb`, not `.gltf`.** One self-contained file; a `.gltf` would drag a
 *   sidecar `.bin` that is lost the first time someone moves the file.
 * - **One combined solid per body, several bodies in one file** — identical to STL and
 *   OBJ, so the three formats never disagree about what a body is. A Group-valued body
 *   is its `combine()`d solid, not its part shells.
 * - **The file is in glTF's own space, not the document's.** The document is
 *   millimetres, Z-up; glTF is metres, Y-up. Feeding mm-Z-up straight through would open
 *   in every viewer a thousand times too large and lying on its back. The vertex data
 *   stays in millimetres and a single root node carries the conversion (a -90° turn
 *   about X, and a 0.001 scale) — a viewer applies it on load, and the geometry itself
 *   is untouched. STL and OBJ carry no unit and are conventionally mm, Z-up, so they are
 *   written as-is.
 * - **Lazy-loaded.** `GLTFExporter` is most of export's bundle cost (~11 KB gzip of the
 *   ~14 KB), and nobody exports on first paint, so it is a dynamic import and stays out
 *   of the main chunk until the first glTF export.
 *
 * Runs under Vitest with no GPU: it builds meshes and never creates a renderer. The
 * exporter's binary path needs `Blob` and `FileReader`, which a browser has and which
 * `export.spec.js` supplies with jsdom.
 *
 * @module render/export
 */

import { BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three'

import { EXPORT_FORMATS, exportFilename, solidsForExport } from '../core/export.js'
import { geom3ToBufferGeometry } from './mesh.js'

/** @typedef {import('../core/export.js').ExportBody} ExportBody */
/** @typedef {import('../core/export.js').ExportResult} ExportResult */

/** Millimetres → metres: glTF's unit is the metre. */
const MM_TO_METRES = 0.001

/** Name of the root node that carries the mm/Z-up → m/Y-up conversion. */
export const GLTF_ROOT_NAME = 'warpcad-export'

/**
 * Serialize bodies to a binary glTF. Several bodies go into one file, one node each,
 * named after the body.
 *
 * @param {readonly ExportBody[]} bodies What to write — the caller has already applied
 *   the selection rule (see `resolveExportScope` in `src/core/export.js`).
 * @returns {Promise<ExportResult>}
 * @throws {import('../core/export.js').ExportError} `nothing-to-export`,
 *   `evaluation-failed` or `empty-geometry`, exactly as for STL and OBJ.
 */
export async function exportGltf(bodies) {
  // Validate before loading the exporter: a refusal should not cost a chunk download.
  const solids = solidsForExport(bodies)

  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')

  const root = new Group()
  root.name = GLTF_ROOT_NAME
  root.rotation.x = -Math.PI / 2 // document +Z (up) → glTF +Y (up); +Y → -Z
  root.scale.setScalar(MM_TO_METRES)

  const material = new MeshStandardMaterial({ color: 0xb0b8c4, metalness: 0.1, roughness: 0.6 })
  let triangleCount = 0
  const geometries = solids.map(({ name, solid }) => {
    const geometry = geom3ToBufferGeometry(solid)
    triangleCount += /** @type {BufferAttribute} */ (geometry.getAttribute('position')).count / 3
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    root.add(mesh)
    return geometry
  })

  try {
    const buffer = /** @type {ArrayBuffer} */ (await new GLTFExporter().parseAsync(root, { binary: true }))
    return {
      bytes: new Uint8Array(buffer),
      filename: exportFilename(bodies, 'glb'),
      mimeType: EXPORT_FORMATS.glb.mimeType,
      triangleCount,
    }
  } finally {
    for (const geometry of geometries) geometry.dispose()
    material.dispose()
  }
}
