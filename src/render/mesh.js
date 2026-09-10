/**
 * The mesh bridge: `@jscad/modeling` geometry → a three.js `BufferGeometry`.
 *
 * This is the only place kernel geometry becomes render geometry. Two rules from
 * CLAUDE.md shape it:
 *
 * - **Geometry is derived and disposable.** Nothing here is ever persisted; a
 *   mesh is rebuilt from the document's replayed scene, never stored as document
 *   state.
 * - **Decoded meshes are plain, non-reactive values.** The typed arrays below
 *   must never be handed to Vue's `reactive`/`ref` — deep reactivity walking a
 *   multi-megabyte `Float32Array` is a performance bug, not a convenience.
 *
 * Kernel polygons are convex but may have more than three vertices, so each is
 * fanned into triangles. Vertex normals are computed by three.js from the
 * triangles rather than trusted from the kernel, because a boolean's output
 * carries no per-vertex normals at all.
 *
 * Runs in plain Node under Vitest: `BufferGeometry` needs no GPU context, so the
 * conversion is unit-tested without WebGL (CLAUDE.md: "always mock at the
 * boundary").
 */

import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial } from 'three'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/**
 * Number of triangles a fan over an `n`-gon produces.
 *
 * @param {number} vertexCount
 * @returns {number}
 */
function trianglesInFan(vertexCount) {
  return vertexCount < 3 ? 0 : vertexCount - 2
}

/**
 * Convert kernel geometry into a three.js `BufferGeometry` in millimetres, Z-up —
 * the same space the document uses, so no unit conversion happens here and the
 * scene's world units are document millimetres throughout.
 *
 * @param {Geom3} geometry Kernel solid.
 * @returns {BufferGeometry} Non-indexed, with computed vertex normals.
 */
export function geom3ToBufferGeometry(geometry) {
  const polygons = geometry?.polygons ?? []

  let triangles = 0
  for (const polygon of polygons) triangles += trianglesInFan(polygon.vertices.length)

  const positions = new Float32Array(triangles * 9)
  let offset = 0
  for (const polygon of polygons) {
    const vertices = polygon.vertices
    for (let index = 2; index < vertices.length; index += 1) {
      const a = vertices[0]
      const b = vertices[index - 1]
      const c = vertices[index]
      positions[offset] = a[0]
      positions[offset + 1] = a[1]
      positions[offset + 2] = a[2]
      positions[offset + 3] = b[0]
      positions[offset + 4] = b[1]
      positions[offset + 5] = b[2]
      positions[offset + 6] = c[0]
      positions[offset + 7] = c[1]
      positions[offset + 8] = c[2]
      offset += 9
    }
  }

  const buffer = new BufferGeometry()
  buffer.setAttribute('position', new BufferAttribute(positions, 3))
  buffer.computeVertexNormals()
  return buffer
}

/**
 * Body colours, per colour scheme. Deliberately not near-black in either scheme:
 * SECOND-ATTEMPT.md lists "the scene is very dark" as a bug that shipped twice,
 * and a body has to read as a solid object against the grid at a glance.
 *
 * `secondary` is the **rest** of a multi-body selection, where `selected` is the
 * one picked first (`TODO/ui-014`). That distinction is not decoration: the
 * first-picked solid is Subtract's base and every later one is a subtrahend, so
 * "which of these is the thing being cut?" has to be answerable by looking at the
 * scene, before the button is pressed. Teal rather than a dimmer amber, for the
 * same reason `--snap-guide` is magenta: the gizmo's rings and the Z dimension
 * line are already accent-blue, and a second highlight in a hue something else
 * owns reads as part of that overlay rather than as its own signal.
 */
export const BODY_COLORS = Object.freeze({
  dark: Object.freeze({
    body: 0x9fc0e8,
    selected: 0xffc46b,
    secondary: 0x66d9c0,
    ghost: 0xffc46b,
  }),
  light: Object.freeze({
    body: 0x6f8fb8,
    selected: 0xd4802a,
    secondary: 0x0f8a72,
    ghost: 0xd4802a,
  }),
})

/** @typedef {keyof typeof BODY_COLORS} MeshTheme */

/**
 * Material for a committed solid.
 *
 * @param {number} color
 * @returns {MeshStandardMaterial}
 */
export function createBodyMaterial(color) {
  return new MeshStandardMaterial({ color, metalness: 0.08, roughness: 0.55, flatShading: false })
}

/**
 * Material for the drag-placement ghost — translucent, and drawn without writing
 * depth so it never punches a hole in the solids behind it.
 *
 * @param {number} color
 * @returns {MeshStandardMaterial}
 */
export function createGhostMaterial(color) {
  return new MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    metalness: 0,
    roughness: 0.9,
  })
}

/**
 * Build a renderable mesh for a solid.
 *
 * @param {Geom3} geometry
 * @param {MeshStandardMaterial} material
 * @returns {Mesh}
 */
export function createMesh(geometry, material) {
  return new Mesh(geom3ToBufferGeometry(geometry), material)
}

/**
 * Release a mesh's GPU resources. Its material is shared across meshes and is
 * owned by the caller, so it is deliberately not disposed here.
 *
 * @param {Mesh} mesh
 * @returns {void}
 */
export function disposeMesh(mesh) {
  mesh.geometry.dispose()
}
