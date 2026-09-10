import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import {
  BODY_COLORS,
  createBodyMaterial,
  createGhostMaterial,
  createMesh,
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
