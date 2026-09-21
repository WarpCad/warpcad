/**
 * glTF export: kernel solids → a binary `.glb` (`TODO/io-003`).
 *
 * This is the render-side half of export, and it exists because there is no other
 * place glTF can come from: `@jscad/io` has no glTF serializer at all
 * (`docs/decisions/persistence-export.md`, sub-decision 4), so it goes through three.js's
 * `GLTFExporter` over the same `BufferGeometry` the mesh bridge builds for the viewport.
 * STL and OBJ are serialized kernel-side in `src/core/export.js`, where a slicer gets a
 * watertight solid.
 *
 * ## Why the `.glb` is watertight too (`TODO/io-005`)
 *
 * `io-003` reasoned that a glTF consumer is a viewer or a game engine, which does not
 * need a closed solid, and left this path on the raw render mesh. Measured, that mesh
 * is open on every shape worth exporting — 44 of 262 undirected edges on a plain Union
 * placed off the origin, 46 of 290 on a placed bolt, 271 of 920 on a `raspberrypi.bplus`,
 * and 42 / 88 even on the two shapes `io-003` measured and the kernel path was always
 * right about — because {@link geom3ToBufferGeometry} fan-triangulates raw boolean
 * output with no T-junction pass at all, not even a partial one.
 *
 * The reasoning still holds for a *renderer*, which draws triangles and never asks
 * whether they share edges. It does not hold for the narrower consumers that made the
 * question worth asking: importing into Blender or a DCC tool and then editing or
 * printing, physics/collision baking, and anything that welds vertices. So this path
 * runs the same `makeWatertight` the kernel formats do, on three grounds recorded in
 * `docs/decisions/persistence-export.md` sub-decision 4: the mechanism already exists
 * and is one call, an unclosed `.glb` beside a closed STL of the same body is a
 * surprising inconsistency, and export is a one-shot action that can afford the
 * 0.7-3.4 ms per body the repair costs. **The viewport still uses the plain fan** — the
 * repair is not in the bridge, and nothing about what the app draws changed.
 *
 * The one thing the export path needs that the viewport does not: the repair inserts
 * vertices that are *collinear* with the edge they split, and fanning such a polygon
 * from corner 0 makes a zero-area triangle whose normal is undefined (measured: 101 of
 * 672 triangles on a repaired board). Hence `triangulation: 'non-degenerate'` below;
 * see {@link geom3ToBufferGeometry} for how it picks an apex.
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
import { makeWatertight } from '../core/kernel/watertight.js'
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
 * ## Prepared solids (`TODO/perf-001`)
 *
 * `options.prepared` lets the caller hand in solids that have **already** been
 * validated (`solidsForExport`) and repaired (`makeWatertight`) — which is what
 * `src/core/exportClient.js` does, because the worker did that half off the main
 * thread. It is an optimisation, never a different result: passing it skips exactly
 * the two calls below and nothing else, and omitting it (every other caller, and every
 * existing spec) runs the original path unchanged. The remaining work — meshing and
 * `GLTFExporter` — measured ~5 ms of a 24-body `.glb`'s ~54 ms, so it stays here rather
 * than dragging three.js into the worker for one format.
 *
 * @param {readonly ExportBody[]} bodies What to write — the caller has already applied
 *   the selection rule (see `resolveExportScope` in `src/core/export.js`).
 * @param {object} [options]
 * @param {{ name: string, solid: any }[]} [options.prepared] Already validated and
 *   repaired solids, in `bodies` order.
 * @returns {Promise<ExportResult>}
 * @throws {import('../core/export.js').ExportError} `nothing-to-export`,
 *   `evaluation-failed` or `empty-geometry`, exactly as for STL and OBJ.
 */
export async function exportGltf(bodies, options = {}) {
  // Validate before loading the exporter: a refusal should not cost a chunk download.
  const solids = options.prepared ?? solidsForExport(bodies)

  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')

  const root = new Group()
  root.name = GLTF_ROOT_NAME
  root.rotation.x = -Math.PI / 2 // document +Z (up) → glTF +Y (up); +Y → -Z
  root.scale.setScalar(MM_TO_METRES)

  const material = new MeshStandardMaterial({ color: 0xb0b8c4, metalness: 0.1, roughness: 0.6 })
  let triangleCount = 0
  const geometries = solids.map(({ name, solid }) => {
    // Closed geometry, like STL and OBJ — `TODO/io-005`, and the module comment above
    // for why the answer to "does a .glb need to be watertight?" came out as yes. The
    // repair runs HERE and not in the bridge: it costs 0.7-3.4 ms per body, which a
    // one-shot export can pay and a viewport rebuild inside a 16 ms frame cannot.
    // Unless the worker already did it (`options.prepared`, `TODO/perf-001`) — in which
    // case running it again would be a no-op that still costs its whole scan.
    const repaired = options.prepared ? solid : makeWatertight(solid)
    const geometry = geom3ToBufferGeometry(repaired, { triangulation: 'non-degenerate' })
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
