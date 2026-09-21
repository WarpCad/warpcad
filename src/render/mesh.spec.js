import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { add, boundsOf, createGroup } from '../core/kernel/group.js'
import { GreaterDepth, Raycaster, Vector3 } from 'three'

import {
  addXrayTwin,
  BODY_COLORS,
  createBodyMaterial,
  createBodyObject,
  createGhostMaterial,
  createMesh,
  createXrayMaterial,
  disposeMesh,
  geom3ToBufferGeometry,
} from './mesh.js'

const { primitives, measurements } = modeling

/**
 * @param {import('three').BufferGeometry} buffer
 * @returns {[number[], number[]]} `[min, max]` corners, in millimetres.
 */
function bufferBounds(buffer) {
  const positions = buffer.getAttribute('position').array
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis]
      if (value < min[axis]) min[axis] = value
      if (value > max[axis]) max[axis] = value
    }
  }
  return [min, max]
}

describe('geom3ToBufferGeometry', () => {
  it('triangulates a cuboid into 12 triangles and keeps its millimetre bounds', () => {
    const buffer = geom3ToBufferGeometry(primitives.cuboid({ size: [10, 20, 30] }))
    const position = buffer.getAttribute('position')
    // 6 quad faces, fanned: 2 triangles each.
    expect(position.count).toBe(36)
    expect(position.itemSize).toBe(3)
    const [min, max] = bufferBounds(buffer)
    expect(min).toEqual([-5, -10, -15])
    expect(max).toEqual([5, 10, 15])
  })

  it('keeps the document coordinate space: millimetres, Z-up, no conversion', () => {
    const kernel = primitives.cylinder({ radius: 7, height: 42 })
    const [kernelMin, kernelMax] = measurements.measureBoundingBox(kernel)
    const [min, max] = bufferBounds(geom3ToBufferGeometry(kernel))
    for (let axis = 0; axis < 3; axis += 1) {
      expect(min[axis]).toBeCloseTo(kernelMin[axis], 4)
      expect(max[axis]).toBeCloseTo(kernelMax[axis], 4)
    }
  })

  it('computes vertex normals rather than trusting the kernel for them', () => {
    // A boolean result carries no per-vertex normals at all, so this has to come
    // from the triangles — without it a placed body renders as a black silhouette.
    const buffer = geom3ToBufferGeometry(primitives.sphere({ radius: 10, segments: 16 }))
    const normals = buffer.getAttribute('normal')
    expect(normals).toBeTruthy()
    expect(normals.count).toBe(buffer.getAttribute('position').count)
    for (let index = 0; index < normals.count; index += 1) {
      const length = Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index))
      expect(length).toBeCloseTo(1, 5)
    }
  })

  it('fans an n-gon face into n-2 triangles, sharing the first vertex', () => {
    // Kernel polygons are convex but not necessarily triangles — a boolean leaves
    // quads and larger. A hand-built pentagon pins the fan down exactly, without
    // depending on how @jscad/modeling happens to tessellate its own caps.
    const pentagon = {
      polygons: [
        {
          vertices: [
            [0, 0, 0],
            [10, 0, 0],
            [12, 8, 0],
            [5, 13, 0],
            [-2, 8, 0],
          ],
        },
      ],
    }
    const position = geom3ToBufferGeometry(/** @type {any} */ (pentagon)).getAttribute('position')
    expect(position.count).toBe(3 * 3)
    // Every triangle starts from vertex 0.
    for (const triangle of [0, 1, 2]) {
      expect(position.getX(triangle * 3)).toBe(0)
      expect(position.getY(triangle * 3)).toBe(0)
    }
    // ...and the last one closes on the final vertex.
    expect(position.getX(8)).toBe(-2)
    expect(position.getY(8)).toBe(8)
  })

  it('handles a degenerate polygon with fewer than three vertices', () => {
    const buffer = geom3ToBufferGeometry(
      /** @type {any} */ ({ polygons: [{ vertices: [[0, 0, 0], [1, 0, 0]] }] })
    )
    expect(buffer.getAttribute('position').count).toBe(0)
  })

  it('survives empty geometry instead of throwing', () => {
    const buffer = geom3ToBufferGeometry(/** @type {any} */ ({ polygons: [] }))
    expect(buffer.getAttribute('position').count).toBe(0)
  })
})

describe('materials', () => {
  it('offers a body colour per colour scheme, and none of them is near-black', () => {
    for (const scheme of /** @type {const} */ (['dark', 'light'])) {
      const palette = /** @type {Record<string, number>} */ (BODY_COLORS[scheme])
      for (const key of ['body', 'selected', 'secondary', 'ghost']) {
        const color = palette[key]
        const luminance =
          (((color >> 16) & 0xff) + ((color >> 8) & 0xff) + (color & 0xff)) / 3
        expect(luminance, `${scheme}.${key}`).toBeGreaterThan(60)
      }
    }
  })

  it('makes the ghost translucent and non-depth-writing so it never masks a solid', () => {
    const ghost = createGhostMaterial(BODY_COLORS.dark.ghost)
    expect(ghost.transparent).toBe(true)
    expect(ghost.opacity).toBeLessThan(1)
    expect(ghost.opacity).toBeGreaterThan(0)
    expect(ghost.depthWrite).toBe(false)
  })

  it('makes a committed body opaque', () => {
    expect(createBodyMaterial(BODY_COLORS.dark.body).transparent).toBe(false)
  })

  it('gives the secondary selection a colour of its own, distinct from all three others', () => {
    // TODO/ui-014: in a 2+ selection the first-picked solid is Subtract's base
    // and the rest are subtrahends, and that order has to read *on screen*
    // before the button is pressed (ACCEPTANCE.md scenario 4, step 4). A
    // "distinct" highlight that is actually the same hex as the primary one, or
    // as an unselected body, would satisfy every structural assertion in the app
    // and still show the user nothing — so the distinctness is asserted here, on
    // the numbers themselves, rather than inferred from a data attribute.
    for (const scheme of /** @type {const} */ (['dark', 'light'])) {
      const palette = /** @type {Record<string, number>} */ (BODY_COLORS[scheme])
      for (const key of ['body', 'selected', 'secondary']) {
        expect(typeof palette[key], `${scheme}.${key} must be a colour`).toBe('number')
      }
      const distinct = new Set([palette.body, palette.selected, palette.secondary])
      expect(distinct.size, `${scheme} body/selected/secondary must differ`).toBe(3)
    }
  })
})

describe('createMesh / disposeMesh', () => {
  it('builds a mesh that carries the solid and leaves its material to the caller', () => {
    const material = createBodyMaterial(BODY_COLORS.dark.body)
    const mesh = createMesh(primitives.cuboid({ size: [2, 2, 2] }), material)
    expect(mesh.material).toBe(material)
    expect(mesh.geometry.getAttribute('position').count).toBe(36)

    let materialDisposed = false
    material.addEventListener('dispose', () => {
      materialDisposed = true
    })
    disposeMesh(mesh)
    // Materials are shared across every body; disposing one body must not take
    // the shared material out from under the others.
    expect(materialDisposed).toBe(false)
  })
})

describe('createBodyObject (TODO/ui-016)', () => {
  /**
   * Three separated cuboids under one Group, the shape `group.assemble` builds
   * from a 3-body selection.
   *
   * @returns {import('../core/kernel/group.js').Group}
   */
  function threePartGroup() {
    let group = createGroup('assembly')
    group = add(group, primitives.cuboid({ size: [10, 10, 10], center: [0, 0, 0] }), 'Cube 1')
    group = add(group, primitives.cuboid({ size: [10, 10, 10], center: [40, 0, 0] }), 'Cube 2')
    group = add(group, primitives.cuboid({ size: [10, 10, 10], center: [0, 60, 0] }), 'Cube 3')
    return group
  }

  it('builds one mesh per named part, each the part s own geometry with no boolean applied', () => {
    const material = createBodyMaterial(BODY_COLORS.dark.body)
    const group = threePartGroup()
    const object = createBodyObject(group, material, 'group-1')

    expect(object.children).toHaveLength(3)
    expect(object.name).toBe('group-1')
    for (const partName of group.names) {
      const child = /** @type {import('three').Mesh} */ (
        object.children.find((candidate) => candidate.userData.partName === partName)
      )
      expect(child).toBeTruthy()
      expect(child.userData.bodyId).toBe('group-1')
      // Byte-for-byte the part's own triangles: a `combine()` on the way through
      // would union the three into one solid and lose which part is which, which
      // is the whole reason a raycast cannot reach a sub-part today.
      const direct = geom3ToBufferGeometry(group.parts[partName])
      expect(Array.from(child.geometry.getAttribute('position').array)).toEqual(
        Array.from(direct.getAttribute('position').array),
      )
    }
  })

  it('loses nothing and duplicates nothing: the parts together span the whole group s bounds', () => {
    const material = createBodyMaterial(BODY_COLORS.dark.body)
    const group = threePartGroup()
    const object = createBodyObject(group, material, 'group-1')

    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (const child of object.children) {
      const [partMin, partMax] = bufferBounds(/** @type {import('three').Mesh} */ (child).geometry)
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], partMin[axis])
        max[axis] = Math.max(max[axis], partMax[axis])
      }
    }
    const [groupMin, groupMax] = boundsOf(group)
    for (let axis = 0; axis < 3; axis += 1) {
      expect(min[axis]).toBeCloseTo(groupMin[axis], 6)
      expect(max[axis]).toBeCloseTo(groupMax[axis], 6)
    }
  })

  it('a bare solid is still one plain mesh, with no part structure to drill into', () => {
    const material = createBodyMaterial(BODY_COLORS.dark.body)
    const object = createBodyObject(primitives.cuboid({ size: [4, 4, 4] }), material, 'cuboid-1')
    expect(object.children).toHaveLength(0)
    expect(object.name).toBe('cuboid-1')
    expect(object.userData.partName).toBeUndefined()
    expect(/** @type {import('three').Mesh} */ (object).geometry.getAttribute('position').count).toBe(36)
  })

  it('a hidden part is not rendered, matching what combine() would have drawn', () => {
    const material = createBodyMaterial(BODY_COLORS.dark.body)
    let group = createGroup('assembly')
    group = add(group, primitives.cuboid({ size: [10, 10, 10] }), 'shell')
    group = add(group, primitives.cuboid({ size: [4, 4, 4] }), 'tap', { hidden: true })
    const object = createBodyObject(group, material, 'group-2')
    expect(object.children.map((child) => child.userData.partName)).toEqual(['shell'])
  })
})

describe('x-ray twin (TODO/ui-041)', () => {
  const cube = () => primitives.cuboid({ size: [10, 10, 10] })

  it('draws only where something nearer already is: depth test inverted, no depth write', () => {
    const material = createXrayMaterial(0xffc46b)
    // The one property the whole feature rests on. A LessEqual twin would draw the body
    // twice over itself; a Greater one draws exactly the part that is hidden.
    expect(material.depthFunc).toBe(GreaterDepth)
    expect(material.depthWrite).toBe(false)
    expect(material.transparent).toBe(true)
    expect(material.opacity).toBeGreaterThan(0)
    expect(material.opacity).toBeLessThan(1)
    // Pulled nearer, so a coincident front face can never pass a strict Greater vs itself.
    expect(material.polygonOffsetFactor).toBeLessThan(0)
  })

  it('is a child of the mesh, sharing its geometry — so it follows every transform', () => {
    const material = createBodyMaterial(0x9fc0e8)
    const mesh = createMesh(cube(), material)
    const twin = addXrayTwin(mesh, createXrayMaterial(0xffc46b))
    expect(twin.parent).toBe(mesh)
    expect(twin.geometry).toBe(mesh.geometry)
    // A move of the body (the gizmo's live preview writes position on the mesh) moves it too.
    mesh.position.set(5, 0, 0)
    mesh.updateMatrixWorld(true)
    expect(new Vector3().setFromMatrixPosition(twin.matrixWorld).x).toBeCloseTo(5, 6)
  })

  it('is invisible to picking: a raycast that hits the body reports the body, never the twin', () => {
    const mesh = createMesh(cube(), createBodyMaterial(0x9fc0e8))
    mesh.name = 'body-1'
    addXrayTwin(mesh, createXrayMaterial(0xffc46b))
    const caster = new Raycaster(new Vector3(0, 0, 50), new Vector3(0, 0, -1))
    const hits = caster.intersectObject(mesh, true)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.object === mesh)).toBe(true)
  })

  it('a Group body gets a twin per part mesh, without changing the container children', () => {
    let group = createGroup()
    group = add(group, cube(), 'shell')
    group = add(group, primitives.cuboid({ size: [4, 4, 4] }), 'head')
    const object = createBodyObject(group, createBodyMaterial(0x9fc0e8), 'group-9')
    const before = object.children.length
    for (const child of object.children) addXrayTwin(/** @type {import("three").Mesh} */ (child), createXrayMaterial(0xffc46b))
    // `updateBodyObject` checks `container.children.length === group.names.length`; a twin
    // hung on the container itself would make every later edit of a composite rebuild it.
    expect(object.children).toHaveLength(before)
  })
})
