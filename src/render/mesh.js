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

import { BufferAttribute, BufferGeometry, Group as ThreeGroup, Mesh, MeshStandardMaterial } from 'three'

import { isGroup, toGeom3 } from '../core/kernel/group.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../core/kernel/group.js').Group} KernelGroup */

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
 * Build the scene object for one document body — a plain `Mesh` for a bare
 * solid, or a `THREE.Group` of one `Mesh` per named part for a Group-valued one
 * (`TODO/ui-016`).
 *
 * ## Why a Group body is not one mesh any more
 *
 * Every consumer used to flatten a Group with {@link toGeom3} before it reached
 * a mesh, and that call's `isGroup` branch runs `combine()` — a **CSG union** of
 * every visible part. After that boolean there is no polygon-level trace of
 * which part contributed what, so a raycast could only ever resolve to the
 * *body*, never to a part inside it. Pick depth is therefore not a click-handler
 * feature: the data a click handler would need has to survive as far as the
 * scene graph, which is what this function does.
 *
 * ## The one visual difference, stated out loud
 *
 * Skipping the union means two parts that **touch or overlap** can show a seam
 * or z-fight along their shared boundary, where the combined mesh drew one
 * clean unioned surface. That is an accepted tradeoff rather than a new defect:
 * `group.assemble`'s own design intent is that nothing is unioned away — every
 * operand's geometry survives, addressable by name — and its operands are
 * separate placed solids that a user dropped apart from each other.
 *
 * Two shipped composites **do** interpenetrate, measured rather than assumed
 * (`TODO/ui-016`'s regression-surface check): `hardware.bolt`'s `tap` overlaps
 * both `head` and `thread`, and `kit.anchor`'s `hole` overlaps `post` and shares
 * a coplanar face with it. Neither is reachable from the Library yet — the
 * Hardware and Kit sections are M2 — so nothing a user can place today is
 * affected, but **look at those two on screen when those rows land**; see
 * `TODO/VERIFY.md`. If either reads badly, the fix is to fall back to the
 * combined mesh for that body (the `holes` branch below is the pattern),
 * trading its pick depth for a clean surface, rather than to re-union
 * everything and lose pick depth for groups that never needed it.
 *
 * Two cases deliberately keep the old single-mesh shape, because neither can be
 * drawn faithfully part-by-part:
 *
 * - **A group carrying holes.** `combine()` subtracts `group.holes` from the
 *   union, and a per-part mesh would render straight through them — a filled
 *   bore is a far worse regression than no pick depth. No recipe in the app
 *   builds one today; this is the guard for the first that does.
 * - **A group with no visible parts.** `combine()` throws on that, and so would
 *   any attempt to draw it; falling through to the old path keeps the error in
 *   the one place that already reports it well.
 *
 * Hidden parts (present in `parts`, absent from `names`) are skipped, exactly as
 * `combine()` skips them — a hidden tap-clearance solid must not become visible
 * just because the body stopped being unioned.
 *
 * @param {Geom3 | KernelGroup} geometry Body geometry, as `document.bodies()`
 *   reports it.
 * @param {MeshStandardMaterial} material Shared body material; not owned here.
 * @param {string} bodyId The body's lineage-root id, used for identification by
 *   the viewport's raycast on both the container and every part mesh.
 * @returns {Mesh | ThreeGroup} Named `bodyId` either way. A part mesh carries
 *   `userData.bodyId` and `userData.partName`; a bare solid's mesh carries
 *   neither, which is what makes "is this pickable to a deeper level?" a
 *   property of the hit object rather than a second lookup.
 */
export function createBodyObject(geometry, material, bodyId) {
  if (isGroup(geometry) && geometry.names.length > 0 && geometry.holes.length === 0) {
    const container = new ThreeGroup()
    container.name = bodyId
    for (const partName of geometry.names) {
      const mesh = new Mesh(geom3ToBufferGeometry(geometry.parts[partName]), material)
      mesh.name = bodyId
      mesh.userData.bodyId = bodyId
      mesh.userData.partName = partName
      container.add(mesh)
    }
    return container
  }
  const mesh = new Mesh(geom3ToBufferGeometry(toGeom3(geometry)), material)
  mesh.name = bodyId
  return mesh
}

/**
 * Release the GPU resources of whatever {@link createBodyObject} built, part
 * meshes included. Materials are shared and stay the caller's, as with
 * {@link disposeMesh}.
 *
 * @param {Mesh | ThreeGroup} object
 * @returns {void}
 */
export function disposeBodyObject(object) {
  if (object instanceof ThreeGroup) {
    for (const child of object.children) disposeMesh(/** @type {Mesh} */ (child))
    object.clear()
    return
  }
  disposeMesh(/** @type {Mesh} */ (object))
}

/**
 * Swap in freshly evaluated geometry for a body whose record changed, reusing
 * the object already in the scene when its **shape** — bare solid, or a group
 * with exactly these named parts — is unchanged.
 *
 * Returns `false` when the shape changed (a bare body that became a group, or a
 * group whose part list differs), so the caller rebuilds rather than trying to
 * patch a mismatched object. "Same shape" is a precondition worth checking rather
 * than assuming, because getting it wrong would render one body's geometry inside
 * another's part slots.
 *
 * A transform used to be the interesting case here, because it collapsed a group
 * into a bare solid and so always changed the shape. Since TODO/core-024 it no
 * longer does — `transform.translate`/`transform.rotate` map over a group's parts
 * and hand back a group with the same part list — so moving a composite now takes
 * the in-place per-part path below rather than forcing a rebuild. `ui-029`'s
 * param-edit rebuild is the case that genuinely can change shape (a cylinder
 * bisected into a two-part group, TODO/ui-028).
 *
 * @param {Mesh | ThreeGroup} object
 * @param {Geom3 | KernelGroup} geometry
 * @returns {boolean} True when the object was updated in place.
 */
export function updateBodyObject(object, geometry) {
  const grouped = isGroup(geometry) && geometry.names.length > 0 && geometry.holes.length === 0
  if (grouped !== object instanceof ThreeGroup) return false

  if (!grouped) {
    const mesh = /** @type {Mesh} */ (object)
    const previous = mesh.geometry
    mesh.geometry = geom3ToBufferGeometry(toGeom3(geometry))
    previous.dispose()
    return true
  }

  const group = /** @type {KernelGroup} */ (geometry)
  const container = /** @type {ThreeGroup} */ (object)
  if (container.children.length !== group.names.length) return false
  for (let index = 0; index < group.names.length; index += 1) {
    if (container.children[index].userData.partName !== group.names[index]) return false
  }
  for (let index = 0; index < group.names.length; index += 1) {
    const mesh = /** @type {Mesh} */ (container.children[index])
    const previous = mesh.geometry
    mesh.geometry = geom3ToBufferGeometry(group.parts[group.names[index]])
    previous.dispose()
  }
  return true
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
