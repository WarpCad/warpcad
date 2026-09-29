import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { add, boundsOf, createGroup } from '../core/kernel/group.js'
import { GreaterDepth, Raycaster, Vector3 } from 'three'

import {
  addXrayTwin,
  BODY_COLORS,
  createBodyMaterial,
  createBodyObject,
  createColorMaterialCache,
  createGhostMaterial,
  createMesh,
  createXrayMaterial,
  disposeMesh,
  geom3ToBufferGeometry,
  createHoverPartMesh,
  HIDDEN_PART_ALPHA,
  HOVER_HIGHLIGHT_INTENSITY,
  OVERRIDE_HIGHLIGHT_INTENSITY,
  bodyObjectIsCurrent,
  paintBodyObject,
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

describe('Hidden parts (TODO/ui-047)', () => {
  const palette = BODY_COLORS.dark

  function shared() {
    return {
      body: createBodyMaterial(palette.body),
      selected: createBodyMaterial(palette.selected),
      secondary: createBodyMaterial(palette.secondary),
    }
  }

  function cache() {
    return createColorMaterialCache({ selected: palette.selected, secondary: palette.secondary })
  }

  /** A shell with one hidden, red-recipe-coloured clearance part, larger than the shell. */
  function shellWithHiddenTap() {
    let group = createGroup('bolt')
    group = add(group, primitives.cuboid({ size: [10, 10, 10] }), 'shell')
    group = add(group, primitives.cuboid({ size: [16, 16, 16] }), 'tap', { hidden: true, color: 0xff0000 })
    return group
  }

  it('a body not in the shown set builds no hidden-part mesh — identical mesh count to today', () => {
    const material = createBodyMaterial(palette.body)
    const group = shellWithHiddenTap()
    // No 4th argument at all, the exact call every existing call site still makes.
    const object = createBodyObject(group, material, 'bolt-1')
    expect(object.children).toHaveLength(1)
    expect(object.children[0].userData.partName).toBe('shell')
  })

  it('an explicitly-empty shown set is identical to omitting the argument', () => {
    const material = createBodyMaterial(palette.body)
    const group = shellWithHiddenTap()
    const object = createBodyObject(group, material, 'bolt-1', [])
    expect(object.children).toHaveLength(1)
  })

  it('a shown body also builds a mesh for its hidden part, flagged and geometrically the part s own solid', () => {
    const material = createBodyMaterial(palette.body)
    const group = shellWithHiddenTap()
    const object = createBodyObject(group, material, 'bolt-1', ['tap'])
    expect(object.children).toHaveLength(2)
    const hidden = /** @type {any} */ (object.children.find((child) => child.userData.partName === 'tap'))
    expect(hidden).toBeTruthy()
    expect(hidden.userData.hiddenPart).toBe(true)
    expect(hidden.userData.bodyId).toBe('bolt-1')
    const direct = geom3ToBufferGeometry(group.parts.tap)
    expect(Array.from(hidden.geometry.getAttribute('position').array)).toEqual(
      Array.from(direct.getAttribute('position').array),
    )
    // The visible part is unaffected — same mesh, no `hiddenPart` flag.
    const visible = /** @type {any} */ (object.children.find((child) => child.userData.partName === 'shell'))
    expect(visible.userData.hiddenPart).toBeUndefined()
  })

  it('a name that is not actually hidden, or does not exist, is ignored rather than duplicated or thrown', () => {
    const material = createBodyMaterial(palette.body)
    const group = shellWithHiddenTap()
    const object = createBodyObject(group, material, 'bolt-1', ['shell', 'nonexistent'])
    expect(object.children).toHaveLength(1)
  })

  it('paints a shown hidden part translucent in its own recipe colour, depth-write off, at the fixed hidden alpha', () => {
    const materials = shared()
    const colors = cache()
    const group = shellWithHiddenTap()
    const object = createBodyObject(group, materials.body, 'bolt-1', ['tap'])
    colors.beginPass()
    paintBodyObject(object, {
      role: 'none',
      overrides: undefined,
      preview: null,
      shared: materials,
      cache: colors,
      recipeColors: group.colors,
    })
    colors.endPass()
    const hidden = /** @type {any} */ (object.children.find((child) => child.userData.partName === 'tap'))
    const material = hidden.material
    expect(material.color.getHex()).toBe(0xff0000)
    expect(material.transparent).toBe(true)
    expect(material.opacity).toBeCloseTo(HIDDEN_PART_ALPHA, 9)
    expect(material.depthWrite).toBe(false)
    // The visible part keeps the ordinary shared palette material, unaffected.
    const visible = /** @type {any} */ (object.children.find((child) => child.userData.partName === 'shell'))
    expect(visible.material).toBe(materials.body)
  })

  it('a shown hidden part with no recipe colour of its own falls back to the palette, not to a materialless mesh', () => {
    const materials = shared()
    const colors = cache()
    let group = createGroup('assembly')
    group = add(group, primitives.cuboid({ size: [10, 10, 10] }), 'shell')
    group = add(group, primitives.cuboid({ size: [16, 16, 16] }), 'clearance', { hidden: true })
    const object = createBodyObject(group, materials.body, 'a', ['clearance'])
    paintBodyObject(object, {
      role: 'none',
      overrides: undefined,
      preview: null,
      shared: materials,
      cache: colors,
      recipeColors: group.colors,
    })
    const hidden = /** @type {any} */ (object.children.find((child) => child.userData.partName === 'clearance'))
    expect(hidden.material.color.getHex()).toBe(palette.body)
    expect(hidden.material.opacity).toBeCloseTo(HIDDEN_PART_ALPHA, 9)
  })

  it('a user colour override on the hidden part itself is not consulted — the toggle is a view, not a colour pick', () => {
    // Nobody can currently colour-pick a hidden part (the Inspector's Color
    // control only ever addresses a visible part or the whole body), but the
    // material function is defensive anyway: an override naming the hidden part
    // must not leak through and repaint what is meant to read as "this is the
    // clearance, not a real colour choice".
    const materials = shared()
    const colors = cache()
    const group = shellWithHiddenTap()
    const object = createBodyObject(group, materials.body, 'bolt-1', ['tap'])
    paintBodyObject(object, {
      role: 'none',
      overrides: [{ color: 0x00ff00, subPart: 'tap' }],
      preview: null,
      shared: materials,
      cache: colors,
      recipeColors: group.colors,
    })
    const hidden = /** @type {any} */ (object.children.find((child) => child.userData.partName === 'tap'))
    expect(hidden.material.color.getHex()).toBe(0xff0000)
    expect(hidden.material.opacity).toBeCloseTo(HIDDEN_PART_ALPHA, 9)
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

describe('per-body colour overrides (TODO/ui-037)', () => {
  const palette = BODY_COLORS.dark

  function shared() {
    return {
      body: createBodyMaterial(palette.body),
      selected: createBodyMaterial(palette.selected),
      secondary: createBodyMaterial(palette.secondary),
    }
  }

  function cache() {
    return createColorMaterialCache({ selected: palette.selected, secondary: palette.secondary })
  }

  /** @param {any} object */
  const materialOf = (object) => /** @type {any} */ (object).material

  function boltGroup() {
    let group = createGroup('bolt')
    group = add(group, primitives.cuboid({ size: [10, 10, 4], center: [0, 0, 2] }), 'head')
    group = add(group, primitives.cuboid({ size: [4, 4, 20], center: [0, 0, 14] }), 'thread')
    group = add(group, primitives.cuboid({ size: [2, 2, 2], center: [0, 0, 30] }), 'tap')
    return group
  }

  it('a body with no override still uses the shared palette material, the very same instance', () => {
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')

    for (const [role, expected] of /** @type {const} */ ([
      ['none', materials.body],
      ['base', materials.selected],
      ['secondary', materials.secondary],
    ])) {
      colors.beginPass()
      paintBodyObject(mesh, { role, overrides: undefined, preview: null, shared: materials, cache: colors })
      colors.endPass()
      expect(materialOf(mesh)).toBe(expected)
    }
    // Nothing was allocated for a body that never asked for a colour.
    expect(colors.size).toBe(0)
  })

  it('a body with an override renders with a material of that colour, not the shared palette', () => {
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')

    colors.beginPass()
    paintBodyObject(mesh, { role: 'none', overrides: [{ color: 0xff0000 }], preview: null, shared: materials, cache: colors })
    colors.endPass()

    const material = materialOf(mesh)
    expect(material).not.toBe(materials.body)
    expect(material.color.getHex()).toBe(0xff0000)
    expect(material.transparent).toBe(false)
    expect(material.opacity).toBe(1)
    // Unselected: no highlight glow on top of the user's colour.
    expect(material.emissive.getHex()).toBe(0x000000)
  })

  it('carries colorAlpha through as opacity', () => {
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')
    paintBodyObject(mesh, {
      role: 'none',
      overrides: [{ color: 0x00ff00, colorAlpha: 0.5 }],
      preview: null,
      shared: materials,
      cache: colors,
    })
    expect(materialOf(mesh).transparent).toBe(true)
    expect(materialOf(mesh).opacity).toBeCloseTo(0.5, 9)
  })

  it('a selected recoloured body keeps its own colour and is tinted, so both the pick and the selection read', () => {
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')

    paintBodyObject(mesh, { role: 'base', overrides: [{ color: 0xff0000 }], preview: null, shared: materials, cache: colors })
    const base = materialOf(mesh)
    expect(base.color.getHex()).toBe(0xff0000)
    expect(base.emissive.getHex()).toBe(palette.selected)
    expect(base.emissiveIntensity).toBeCloseTo(OVERRIDE_HIGHLIGHT_INTENSITY, 9)

    paintBodyObject(mesh, { role: 'secondary', overrides: [{ color: 0xff0000 }], preview: null, shared: materials, cache: colors })
    expect(materialOf(mesh).color.getHex()).toBe(0xff0000)
    expect(materialOf(mesh).emissive.getHex()).toBe(palette.secondary)
    expect(materialOf(mesh)).not.toBe(base)
  })

  it('a sub-part override wins on its part; the whole-body override paints every other part', () => {
    const materials = shared()
    const colors = cache()
    const object = createBodyObject(boltGroup(), materials.body, 'bolt')

    paintBodyObject(object, {
      role: 'none',
      overrides: [{ color: 0xff0000 }, { color: 0x0000ff, subPart: 'tap' }],
      preview: null,
      shared: materials,
      cache: colors,
    })
    const byPart = Object.fromEntries(object.children.map((child) => [child.userData.partName, materialOf(child)]))
    expect(byPart.tap.color.getHex()).toBe(0x0000ff)
    expect(byPart.head.color.getHex()).toBe(0xff0000)
    expect(byPart.thread.color.getHex()).toBe(0xff0000)
    // Same colour, same material: two parts do not get two copies.
    expect(byPart.head).toBe(byPart.thread)
  })

  it('with only a sub-part override, the other parts keep the shared palette', () => {
    const materials = shared()
    const colors = cache()
    const object = createBodyObject(boltGroup(), materials.body, 'bolt')
    paintBodyObject(object, {
      role: 'none',
      overrides: [{ color: 0x0000ff, subPart: 'tap' }],
      preview: null,
      shared: materials,
      cache: colors,
    })
    const byPart = Object.fromEntries(object.children.map((child) => [child.userData.partName, materialOf(child)]))
    expect(byPart.tap.color.getHex()).toBe(0x0000ff)
    expect(byPart.head).toBe(materials.body)
    expect(byPart.thread).toBe(materials.body)
  })

  it('reuses one material per colour across bodies and repaints, and disposes one no body uses any more', () => {
    const materials = shared()
    const colors = cache()
    const a = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')
    const b = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'b')

    colors.beginPass()
    paintBodyObject(a, { role: 'none', overrides: [{ color: 0xff0000 }], preview: null, shared: materials, cache: colors })
    paintBodyObject(b, { role: 'none', overrides: [{ color: 0xff0000 }], preview: null, shared: materials, cache: colors })
    colors.endPass()
    const red = materialOf(a)
    expect(materialOf(b)).toBe(red)
    expect(colors.size).toBe(1)

    // A repaint with nothing changed is not an allocation.
    colors.beginPass()
    paintBodyObject(a, { role: 'none', overrides: [{ color: 0xff0000 }], preview: null, shared: materials, cache: colors })
    paintBodyObject(b, { role: 'none', overrides: [{ color: 0xff0000 }], preview: null, shared: materials, cache: colors })
    colors.endPass()
    expect(materialOf(a)).toBe(red)

    let disposed = 0
    red.addEventListener('dispose', () => {
      disposed += 1
    })
    colors.beginPass()
    paintBodyObject(a, { role: 'none', overrides: undefined, preview: null, shared: materials, cache: colors })
    paintBodyObject(b, { role: 'none', overrides: [{ color: 0x00ff00 }], preview: null, shared: materials, cache: colors })
    colors.endPass()
    expect(disposed).toBe(1)
    expect(colors.size).toBe(1)
  })

  it('a live preview repaints one reused material in place — no allocation per picker `input` event', () => {
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')

    paintBodyObject(mesh, { role: 'base', overrides: undefined, preview: { color: 0x110000 }, shared: materials, cache: colors })
    const first = materialOf(mesh)
    expect(first.color.getHex()).toBe(0x110000)
    for (const color of [0x440000, 0x880000, 0xff0000]) {
      paintBodyObject(mesh, { role: 'base', overrides: undefined, preview: { color }, shared: materials, cache: colors })
      expect(materialOf(mesh)).toBe(first)
    }
    expect(first.color.getHex()).toBe(0xff0000)
    expect(first.emissive.getHex()).toBe(palette.selected)
  })

  it('a whole-body preview does not paint over a part that has its own override', () => {
    const materials = shared()
    const colors = cache()
    const object = createBodyObject(boltGroup(), materials.body, 'bolt')
    paintBodyObject(object, {
      role: 'base',
      overrides: [{ color: 0x0000ff, subPart: 'tap' }],
      preview: { color: 0xff0000 },
      shared: materials,
      cache: colors,
    })
    const byPart = Object.fromEntries(object.children.map((child) => [child.userData.partName, materialOf(child)]))
    expect(byPart.tap.color.getHex()).toBe(0x0000ff)
    expect(byPart.head.color.getHex()).toBe(0xff0000)

    // …and a sub-part preview paints only that part.
    paintBodyObject(object, {
      role: 'base',
      overrides: undefined,
      preview: { color: 0x00ff00, subPart: 'head' },
      shared: materials,
      cache: colors,
    })
    const again = Object.fromEntries(object.children.map((child) => [child.userData.partName, materialOf(child)]))
    expect(again.head.color.getHex()).toBe(0x00ff00)
    expect(again.thread).toBe(materials.selected)
  })

  it('a part with a recipe colour renders in that colour when nothing else applies (TODO/render-003)', () => {
    const materials = shared()
    const colors = cache()
    const object = createBodyObject(boltGroup(), materials.body, 'bolt')
    paintBodyObject(object, {
      role: 'none',
      overrides: undefined,
      preview: null,
      shared: materials,
      cache: colors,
      recipeColors: { head: { color: 0x808080, alpha: 1 }, thread: { color: 0xc0c0c0, alpha: 1 } },
    })
    const byPart = Object.fromEntries(object.children.map((child) => [child.userData.partName, materialOf(child)]))
    expect(byPart.head.color.getHex()).toBe(0x808080)
    expect(byPart.thread.color.getHex()).toBe(0xc0c0c0)
    // No recipe colour for `tap`: it keeps the shared palette material, the same
    // instance every uncoloured body uses — the regression guard this task's own
    // Testing section names.
    expect(byPart.tap).toBe(materials.body)
  })

  it('a user override beats a recipe colour on the same part', () => {
    const materials = shared()
    const colors = cache()
    const object = createBodyObject(boltGroup(), materials.body, 'bolt')
    paintBodyObject(object, {
      role: 'none',
      overrides: [{ color: 0x0000ff, subPart: 'head' }],
      preview: null,
      shared: materials,
      cache: colors,
      recipeColors: { head: { color: 0x808080, alpha: 1 } },
    })
    const byPart = Object.fromEntries(object.children.map((child) => [child.userData.partName, materialOf(child)]))
    expect(byPart.head.color.getHex()).toBe(0x0000ff)
  })

  it('a body carrying no recipe colours at all keeps the shared palette material, unchanged', () => {
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')
    colors.beginPass()
    paintBodyObject(mesh, { role: 'none', overrides: undefined, preview: null, shared: materials, cache: colors, recipeColors: undefined })
    colors.endPass()
    expect(materialOf(mesh)).toBe(materials.body)
    expect(colors.size).toBe(0)
  })

  it('a translucent recipe colour (alpha < 1) carries through as opacity and does not write depth', () => {
    const materials = shared()
    const colors = cache()
    const object = createBodyObject(boltGroup(), materials.body, 'bolt')
    paintBodyObject(object, {
      role: 'none',
      overrides: undefined,
      preview: null,
      shared: materials,
      cache: colors,
      recipeColors: { tap: { color: 0x008000, alpha: 0.75 } },
    })
    const byPart = Object.fromEntries(object.children.map((child) => [child.userData.partName, materialOf(child)]))
    expect(byPart.tap.color.getHex()).toBe(0x008000)
    expect(byPart.tap.transparent).toBe(true)
    expect(byPart.tap.opacity).toBeCloseTo(0.75, 9)
    // A translucent body material must not write depth, or an opaque part
    // rendered afterward behind it (or another translucent part) can be
    // incorrectly occluded/clipped — the same reason `createGhostMaterial` sets
    // this. An opaque part is unaffected (default `depthWrite: true`).
    expect(byPart.tap.depthWrite).toBe(false)
    expect(byPart.head.depthWrite).toBe(true)
  })

  it('a theme switch retints every highlight, and dispose releases everything', () => {
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')
    paintBodyObject(mesh, { role: 'base', overrides: [{ color: 0xff0000 }], preview: null, shared: materials, cache: colors })
    colors.setHighlights({ selected: BODY_COLORS.light.selected, secondary: BODY_COLORS.light.secondary })
    expect(materialOf(mesh).emissive.getHex()).toBe(BODY_COLORS.light.selected)
    expect(materialOf(mesh).color.getHex()).toBe(0xff0000)

    let disposed = 0
    materialOf(mesh).addEventListener('dispose', () => {
      disposed += 1
    })
    colors.dispose()
    expect(disposed).toBe(1)
    expect(colors.size).toBe(0)
  })
})

describe('the hover highlight (TODO/ui-049)', () => {
  const palette = BODY_COLORS.dark

  function shared() {
    return {
      body: createBodyMaterial(palette.body),
      selected: createBodyMaterial(palette.selected),
      secondary: createBodyMaterial(palette.secondary),
    }
  }

  function cache() {
    return createColorMaterialCache({ selected: palette.selected, secondary: palette.secondary, hover: palette.hover })
  }

  /** @param {any} object */
  const materialOf = (object) => /** @type {any} */ (object).material

  /**
   * The emissive a material should carry: each highlight contributes its colour at its own
   * intensity, summed per channel and clamped — the same additive light the renderer adds.
   *
   * @param {Array<[number, number]>} terms `[colour, intensity]` pairs.
   */
  function summedEmissive(terms) {
    const channel = (/** @type {number} */ shift) =>
      Math.min(255, Math.round(terms.reduce((sum, [color, k]) => sum + ((color >> shift) & 0xff) * k, 0)))
    return (channel(16) << 16) | (channel(8) << 8) | channel(0)
  }

  function twoPartGroup() {
    let group = createGroup('pi')
    group = add(group, primitives.cuboid({ size: [10, 10, 2], center: [0, 0, 1] }), 'mb')
    group = add(group, primitives.cuboid({ size: [4, 4, 4], center: [3, 3, 4] }), 'ethernet')
    group = add(group, primitives.cuboid({ size: [6, 6, 6], center: [-3, -3, 4] }), 'tap', { hidden: true, color: 0xff0000 })
    return group
  }

  it('is its own third colour in both schemes — never either selection colour, nor the body colour', () => {
    for (const scheme of /** @type {const} */ (['dark', 'light'])) {
      const colors = BODY_COLORS[scheme]
      expect(typeof colors.hover).toBe('number')
      expect(colors.hover).not.toBe(colors.selected)
      expect(colors.hover).not.toBe(colors.secondary)
      expect(colors.hover).not.toBe(colors.body)
    }
    expect(HOVER_HIGHLIGHT_INTENSITY).toBeGreaterThan(OVERRIDE_HIGHLIGHT_INTENSITY)
    expect(HOVER_HIGHLIGHT_INTENSITY).toBeLessThanOrEqual(1)
  })

  it('nothing hovered paints exactly as today: the shared palette instance, nothing allocated, no extra mesh', () => {
    const materials = shared()
    const colors = cache()
    const object = createBodyObject(twoPartGroup(), materials.body, 'pi')
    const before = object.children.length
    colors.beginPass()
    paintBodyObject(object, { role: 'none', overrides: undefined, preview: null, shared: materials, cache: colors, hover: null })
    colors.endPass()
    for (const child of object.children) expect(materialOf(child)).toBe(materials.body)
    expect(colors.size).toBe(0)
    expect(object.children).toHaveLength(before)
  })

  it('a hovered unselected body keeps its colour and gains the hover tint as emissive', () => {
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')
    paintBodyObject(mesh, { role: 'none', overrides: undefined, preview: null, shared: materials, cache: colors, hover: { partName: null } })
    const material = materialOf(mesh)
    // Its own material — tinting the shared palette instance would light up every body.
    expect(material).not.toBe(materials.body)
    expect(material.color.getHex()).toBe(palette.body)
    expect(material.emissive.getHex()).toBe(summedEmissive([[palette.hover, HOVER_HIGHLIGHT_INTENSITY]]))
    expect(material.emissiveIntensity).toBe(1)
  })

  it('hovering an already-selected body still reads as different from merely selected', () => {
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')
    paintBodyObject(mesh, { role: 'base', overrides: undefined, preview: null, shared: materials, cache: colors, hover: { partName: null } })
    const material = materialOf(mesh)
    expect(material).not.toBe(materials.selected)
    // The selection colour is still the base colour: selected first, hover on top.
    expect(material.color.getHex()).toBe(palette.selected)
    expect(material.emissive.getHex()).not.toBe(0x000000)
  })

  it('precedence: a hovered, selected, red-overridden body is still red, still selected, and hovered', () => {
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')
    const red = [{ color: 0xff0000 }]
    paintBodyObject(mesh, { role: 'base', overrides: red, preview: null, shared: materials, cache: colors, hover: null })
    const selectedOnly = materialOf(mesh)
    paintBodyObject(mesh, { role: 'base', overrides: red, preview: null, shared: materials, cache: colors, hover: { partName: null } })
    const hovered = materialOf(mesh)
    expect(hovered).not.toBe(selectedOnly)
    expect(hovered.color.getHex()).toBe(0xff0000)
    expect(hovered.emissive.getHex()).toBe(
      summedEmissive([
        [palette.selected, OVERRIDE_HIGHLIGHT_INTENSITY],
        [palette.hover, HOVER_HIGHLIGHT_INTENSITY],
      ]),
    )
    // The un-hovered selected material is untouched by the hover existing alongside it.
    expect(selectedOnly.emissive.getHex()).toBe(palette.selected)
    expect(selectedOnly.emissiveIntensity).toBeCloseTo(OVERRIDE_HIGHLIGHT_INTENSITY, 9)
  })

  it('a part hover lights only that part — its siblings keep the plain palette', () => {
    const materials = shared()
    const colors = cache()
    const object = createBodyObject(twoPartGroup(), materials.body, 'pi')
    paintBodyObject(object, { role: 'none', overrides: undefined, preview: null, shared: materials, cache: colors, hover: { partName: 'ethernet' } })
    const byName = Object.fromEntries(object.children.map((child) => [child.userData.partName, materialOf(child)]))
    expect(byName.ethernet).not.toBe(materials.body)
    expect(byName.ethernet.emissive.getHex()).not.toBe(0x000000)
    expect(byName.mb).toBe(materials.body)
  })

  it('a whole-body hover lights every part of a composite', () => {
    const materials = shared()
    const colors = cache()
    const object = createBodyObject(twoPartGroup(), materials.body, 'pi')
    paintBodyObject(object, { role: 'none', overrides: undefined, preview: null, shared: materials, cache: colors, hover: { partName: null } })
    for (const child of object.children) expect(materialOf(child).emissive.getHex()).not.toBe(0x000000)
  })

  it('setHighlights retints the hover tint too — a colour-scheme switch', () => {
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')
    paintBodyObject(mesh, { role: 'none', overrides: [{ color: 0x00ff00 }], preview: null, shared: materials, cache: colors, hover: { partName: null } })
    const material = materialOf(mesh)
    const light = BODY_COLORS.light
    colors.setHighlights({ selected: light.selected, secondary: light.secondary, hover: light.hover })
    expect(material.emissive.getHex()).toBe(summedEmissive([[light.hover, HOVER_HIGHLIGHT_INTENSITY]]))
    // A caller that only knows the selection colours leaves the hover colour where it was.
    colors.setHighlights({ selected: palette.selected, secondary: palette.secondary })
    expect(material.emissive.getHex()).toBe(summedEmissive([[light.hover, HOVER_HIGHLIGHT_INTENSITY]]))
  })

  it('a stale hover material is freed by the next pass that does not use it', () => {
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')
    colors.beginPass()
    paintBodyObject(mesh, { role: 'none', overrides: undefined, preview: null, shared: materials, cache: colors, hover: { partName: null } })
    colors.endPass()
    const hovered = materialOf(mesh)
    let disposed = false
    hovered.addEventListener('dispose', () => {
      disposed = true
    })
    colors.beginPass()
    paintBodyObject(mesh, { role: 'none', overrides: undefined, preview: null, shared: materials, cache: colors, hover: null })
    colors.endPass()
    expect(disposed).toBe(true)
    expect(materialOf(mesh)).toBe(materials.body)
    expect(colors.size).toBe(0)
  })

  it('a colour\'s plain and hovered materials live as a pair while either is used — no shader recompile per hover', () => {
    // Found by the hover-sweep benchmark: hovering a Pi's translucent `mb` board disposed its
    // plain material, the only user of that transparent shader program, so three.js deleted
    // the program and the next frame recompiled it (~90 ms, both on enter and on leave).
    const materials = shared()
    const colors = cache()
    const mesh = createBodyObject(primitives.cuboid({ size: [10, 10, 10] }), materials.body, 'a')
    const translucent = [{ color: 0x2e8b57, colorAlpha: 0.75 }]
    /** @param {{ partName: string | null } | null} hover */
    const paint = (hover) => {
      colors.beginPass()
      paintBodyObject(mesh, { role: 'none', overrides: translucent, preview: null, shared: materials, cache: colors, hover })
      colors.endPass()
      return materialOf(mesh)
    }
    const plain = paint(null)
    let plainDisposed = false
    plain.addEventListener('dispose', () => {
      plainDisposed = true
    })
    const hovered = paint({ partName: null })
    expect(hovered).not.toBe(plain)
    expect(plainDisposed).toBe(false)
    let hoveredDisposed = false
    hovered.addEventListener('dispose', () => {
      hoveredDisposed = true
    })
    expect(paint(null)).toBe(plain)
    expect(hoveredDisposed).toBe(false)
    // Neither in use any more (the override is gone): both are freed.
    colors.beginPass()
    paintBodyObject(mesh, { role: 'none', overrides: undefined, preview: null, shared: materials, cache: colors, hover: null })
    colors.endPass()
    expect(plainDisposed).toBe(true)
    expect(hoveredDisposed).toBe(true)
    expect(colors.size).toBe(0)
  })

  it('a shown hidden part (the Show hidden parts toggle) takes the hover tint and stays translucent', () => {
    const materials = shared()
    const colors = cache()
    const group = twoPartGroup()
    const object = createBodyObject(group, materials.body, 'pi', ['tap'])
    paintBodyObject(object, {
      role: 'none',
      overrides: undefined,
      preview: null,
      shared: materials,
      cache: colors,
      recipeColors: group.colors,
      hover: { partName: 'tap' },
    })
    const tap = materialOf(object.children.find((child) => child.userData.partName === 'tap'))
    expect(tap.color.getHex()).toBe(0xff0000)
    expect(tap.opacity).toBeCloseTo(HIDDEN_PART_ALPHA, 9)
    expect(tap.emissive.getHex()).not.toBe(0x000000)
  })
})

describe('the transient hovered hidden part (TODO/ui-049)', () => {
  const palette = BODY_COLORS.dark

  function group() {
    let g = createGroup('bolt')
    g = add(g, primitives.cuboid({ size: [10, 10, 10] }), 'shell')
    g = add(g, primitives.cuboid({ size: [16, 16, 16] }), 'tap', { hidden: true, color: 0xff0000 })
    return g
  }

  it('builds one translucent-path mesh for a hidden part: flagged, the part s own solid, never pickable', () => {
    const g = group()
    const mesh = /** @type {any} */ (createHoverPartMesh(g, 'tap', createBodyMaterial(palette.body), 'bolt-1'))
    expect(mesh).not.toBeNull()
    expect(mesh.userData.hiddenPart).toBe(true)
    expect(mesh.userData.hoverTransient).toBe(true)
    expect(mesh.userData.partName).toBe('tap')
    expect(mesh.userData.bodyId).toBe('bolt-1')
    expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(
      Array.from(geom3ToBufferGeometry(g.parts.tap).getAttribute('position').array),
    )
    // Hover-only: a ray through it reaches whatever is really there.
    const hits = /** @type {any[]} */ ([])
    mesh.raycast(new Raycaster(new Vector3(0, 0, 50), new Vector3(0, 0, -1)), hits)
    expect(hits).toHaveLength(0)
  })

  it('builds nothing for a visible part, an unknown name or a bare solid — those have a mesh already', () => {
    const material = createBodyMaterial(palette.body)
    expect(createHoverPartMesh(group(), 'shell', material, 'bolt-1')).toBeNull()
    expect(createHoverPartMesh(group(), 'nope', material, 'bolt-1')).toBeNull()
    expect(createHoverPartMesh(primitives.cuboid({ size: [4, 4, 4] }), 'tap', material, 'c')).toBeNull()
  })

  it('is disposed on clear: its geometry is released, and the body keeps exactly its own mesh count', () => {
    const material = createBodyMaterial(palette.body)
    const g = group()
    const object = createBodyObject(g, material, 'bolt-1')
    const before = object.children.length
    const mesh = /** @type {any} */ (createHoverPartMesh(g, 'tap', material, 'bolt-1'))
    object.add(mesh)
    expect(object.children).toHaveLength(before + 1)
    let released = false
    mesh.geometry.addEventListener('dispose', () => {
      released = true
    })
    mesh.removeFromParent()
    disposeMesh(mesh)
    expect(released).toBe(true)
    expect(object.children).toHaveLength(before)
  })
})

describe('bodyObjectIsCurrent — when an existing body mesh may be kept (TODO/ui-052)', () => {
  const cube = modeling.primitives.cuboid({ size: [2, 2, 2] })
  const moved = modeling.transforms.translate([10, 0, 0], cube)

  it('keeps a mesh whose record and geometry are both unchanged', () => {
    expect(bodyObjectIsCurrent({ recordId: 'snap-1', geometry: cube, hiddenShownKey: '' }, { recordId: 'snap-1', geometry: cube }, '')).toBe(true)
  })

  it('rebuilds when the terminal record is the same but its geometry changed — a row revised in place', () => {
    // A snap left broken folds as identity: same record id, different solid (the body
    // goes back to where it was before the snap). Keyed on the id alone, the viewport
    // kept drawing the snapped mesh while the bounds, gizmo and Inspector moved.
    expect(bodyObjectIsCurrent({ recordId: 'snap-1', geometry: moved, hiddenShownKey: '' }, { recordId: 'snap-1', geometry: cube }, '')).toBe(false)
  })

  it('rebuilds when the record changed, or the shown hidden parts did', () => {
    expect(bodyObjectIsCurrent({ recordId: 'a', geometry: cube, hiddenShownKey: '' }, { recordId: 'b', geometry: cube }, '')).toBe(false)
    expect(bodyObjectIsCurrent({ recordId: 'a', geometry: cube, hiddenShownKey: '' }, { recordId: 'a', geometry: cube }, 'tap')).toBe(false)
  })
})
