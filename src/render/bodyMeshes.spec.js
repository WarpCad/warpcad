// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'
import modeling from '@jscad/modeling'
import { Group as ThreeGroup, Mesh } from 'three'

import { add, createGroup } from '../core/kernel/group.js'
import { BODY_COLORS } from './mesh.js'
import { announcedColor, announcedPartColors, createBodyCounts, createBodyMeshes } from './bodyMeshes.js'

const { primitives } = modeling

/**
 * `createBodyMeshes` builds three.js objects and materials only. None of that needs a GL
 * context (a renderer is what uploads them), so the WebGL boundary is simply never crossed
 * here, as in `scene.spec.js`'s `createSceneGraph` cases. The stores are plain objects with
 * the same fields the Pinia stores expose.
 */

/** @param {number} [x] */
function cube(x = 0) {
  return primitives.cuboid({ size: [10, 10, 10], center: [x, 0, 0] })
}

/** A two-part group with one hidden part (`tap`), the shape a bolt recipe builds. */
function boltGroup() {
  let group = createGroup('bolt')
  group = add(group, cube(0), 'shank')
  group = add(group, cube(30), 'head')
  group = add(group, cube(60), 'tap', { hidden: true })
  return group
}

/**
 * @param {string} id
 * @param {object} [extra]
 */
function body(id, extra = {}) {
  return { id, recordId: `${id}-r1`, geometry: cube(), colorOverrides: undefined, ...extra }
}

/** @param {{ bodies?: any[] }} [options] */
function setup({ bodies = [] } = {}) {
  const state = {
    bodies,
    shownHidden: new Set(),
    sketched: '',
  }
  const selection = {
    /** @type {string[]} */
    ids: [],
    /** @param {string} id */
    has(id) {
      return this.ids.includes(id)
    },
  }
  const alignReference = { originOnly: false }
  const hoverHighlight = { target: /** @type {any} */ (null), many: /** @type {string[] | null} */ (null) }
  const repeatSession = { seed: /** @type {any} */ (null), outlined: /** @type {string[]} */ ([]) }
  const colorPreview = { bodyId: /** @type {string | null} */ (null), color: 0, subPart: /** @type {string | undefined} */ (undefined) }
  const scheduleRender = vi.fn()
  const counts = createBodyCounts()
  const controller = createBodyMeshes({
    bodies: () => state.bodies,
    isHiddenShown: (id) => state.shownHidden.has(id),
    isSketched: (id) => state.sketched === id,
    selection,
    alignReference,
    hoverHighlight,
    repeatSession,
    colorPreview,
    scheduleRender,
    counts,
  })
  return { controller, state, selection, alignReference, hoverHighlight, repeatSession, colorPreview, scheduleRender, counts }
}

/** @param {import('three').Object3D} object */
function twinsOn(object) {
  let count = 0
  object.traverse((child) => {
    if (child.name === 'xray-twin') count += 1
  })
  return count
}

describe('createBodyMeshes: body sync', () => {
  it('does nothing before its materials exist', () => {
    const { controller, scheduleRender } = setup({ bodies: [body('a')] })
    controller.syncBodies()
    expect(controller.meshes.size).toBe(0)
    expect(controller.group.children).toHaveLength(0)
    expect(scheduleRender).not.toHaveBeenCalled()
  })

  it('an empty body list builds nothing and still schedules a frame', () => {
    const { controller, counts, scheduleRender } = setup()
    controller.createMaterials('dark')
    controller.syncBodies()
    expect(controller.meshes.size).toBe(0)
    expect(controller.group.children).toHaveLength(0)
    expect(counts).toEqual({ xrayTwins: 0, hoverTwins: 0, repeatOutlines: 0, hoverTransient: '' })
    expect(scheduleRender).toHaveBeenCalled()
  })

  it('names the group it adds bodies to', () => {
    const { controller } = setup()
    expect(controller.group).toBeInstanceOf(ThreeGroup)
    expect(controller.group.name).toBe('bodies')
  })

  it('adds one object per body, keyed by its id, and keeps it across an unchanged sync', () => {
    const { controller, state } = setup({ bodies: [body('a'), body('b')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    expect([...controller.meshes.keys()]).toEqual(['a', 'b'])
    expect(controller.group.children).toHaveLength(2)
    const first = controller.meshes.get('a')
    // Same record, same geometry object: the very same mesh survives (ACCEPTANCE scenario 1).
    state.bodies = [...state.bodies]
    controller.syncBodies()
    expect(controller.meshes.get('a')).toBe(first)
    expect(controller.group.children).toHaveLength(2)
  })

  it('removes and disposes the object of a body the document no longer has', () => {
    const { controller, state } = setup({ bodies: [body('a'), body('b')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    const gone = /** @type {Mesh} */ (controller.meshes.get('b'))
    const dispose = vi.spyOn(gone.geometry, 'dispose')
    state.bodies = [state.bodies[0]]
    controller.syncBodies()
    expect(controller.meshes.has('b')).toBe(false)
    expect(controller.group.children).toHaveLength(1)
    expect(dispose).toHaveBeenCalled()
  })

  it('updates a moved body in place and drops the drag preview transform', () => {
    const { controller, state } = setup({ bodies: [body('a')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    const object = /** @type {Mesh} */ (controller.meshes.get('a'))
    object.position.set(5, 6, 7)
    object.rotation.set(0.3, 0.2, 0.1)
    state.bodies = [{ ...state.bodies[0], recordId: 'a-r2', geometry: cube(20) }]
    controller.syncBodies()
    expect(controller.meshes.get('a')).toBe(object)
    expect(object.userData.recordId).toBe('a-r2')
    expect(object.position.x).toBeCloseTo(0, 9)
    expect(object.position.y).toBeCloseTo(0, 9)
    expect(object.position.z).toBeCloseTo(0, 9)
    expect(object.quaternion.w).toBeCloseTo(1, 9)
    object.geometry.computeBoundingBox()
    expect(/** @type {any} */ (object.geometry.boundingBox).min.x).toBeCloseTo(15, 6)
  })

  it('rebuilds when a bare body becomes a group', () => {
    const { controller, state } = setup({ bodies: [body('a')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    const before = controller.meshes.get('a')
    state.bodies = [{ ...state.bodies[0], recordId: 'a-r2', geometry: boltGroup() }]
    controller.syncBodies()
    const after = controller.meshes.get('a')
    expect(after).not.toBe(before)
    expect(after).toBeInstanceOf(ThreeGroup)
    expect(controller.group.children).toEqual([after])
  })

  it('rebuilds when Show hidden parts is toggled, adding the hidden part mesh', () => {
    const { controller, state } = setup({ bodies: [body('g', { geometry: boltGroup() })] })
    controller.createMaterials('dark')
    controller.syncBodies()
    expect(/** @type {ThreeGroup} */ (controller.meshes.get('g')).children).toHaveLength(2)
    state.shownHidden.add('g')
    controller.syncBodies()
    const parts = /** @type {ThreeGroup} */ (controller.meshes.get('g')).children.map((child) => child.userData.partName)
    expect(parts).toEqual(['shank', 'head', 'tap'])
  })

  it('hides the body the sketch editor draws over, and a body the user hid', () => {
    const { controller, state } = setup({ bodies: [body('a'), body('b', { viewHidden: true }), body('c')] })
    state.sketched = 'c'
    controller.createMaterials('dark')
    controller.syncBodies()
    expect(controller.meshes.get('a')?.visible).toBe(true)
    expect(controller.meshes.get('b')?.visible).toBe(false)
    expect(controller.meshes.get('c')?.visible).toBe(false)
  })
})

describe('createBodyMeshes: selection', () => {
  it('reports base, secondary and none, and Align-to-origin drops the secondary role', () => {
    const { controller, selection, alignReference } = setup()
    selection.ids = ['a', 'b']
    expect(controller.selectionRole('a')).toBe('base')
    expect(controller.selectionRole('b')).toBe('secondary')
    expect(controller.selectionRole('c')).toBe('none')
    alignReference.originOnly = true
    expect(controller.selectionRole('b')).toBe('none')
  })

  it('paints the selected material and adds one x-ray twin per selected mesh', () => {
    const { controller, selection, counts } = setup({ bodies: [body('a'), body('b'), body('c')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    selection.ids = ['a', 'b']
    controller.applySelectionMaterial()
    const a = /** @type {Mesh} */ (controller.meshes.get('a'))
    const b = /** @type {Mesh} */ (controller.meshes.get('b'))
    const c = /** @type {Mesh} */ (controller.meshes.get('c'))
    expect(/** @type {any} */ (a.material).color.getHex()).toBe(BODY_COLORS.dark.selected)
    expect(/** @type {any} */ (b.material).color.getHex()).toBe(BODY_COLORS.dark.secondary)
    expect(/** @type {any} */ (c.material).color.getHex()).toBe(BODY_COLORS.dark.body)
    expect(counts.xrayTwins).toBe(2)
    expect(twinsOn(controller.group)).toBe(2)
  })

  it('selecting the same body twice does not stack twins, and deselecting removes them', () => {
    const { controller, selection, counts } = setup({ bodies: [body('a')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    selection.ids = ['a']
    controller.applySelectionMaterial()
    controller.applySelectionMaterial()
    expect(counts.xrayTwins).toBe(1)
    expect(twinsOn(controller.group)).toBe(1)
    selection.ids = []
    controller.applySelectionMaterial()
    expect(counts.xrayTwins).toBe(0)
    expect(twinsOn(controller.group)).toBe(0)
    const a = /** @type {Mesh} */ (controller.meshes.get('a'))
    expect(/** @type {any} */ (a.material).color.getHex()).toBe(BODY_COLORS.dark.body)
  })

  it('outlines no body the user hid', () => {
    const { controller, selection, counts } = setup({ bodies: [body('a', { viewHidden: true })] })
    controller.createMaterials('dark')
    controller.syncBodies()
    selection.ids = ['a']
    controller.applySelectionMaterial()
    expect(counts.xrayTwins).toBe(0)
  })

  it('twins every drawn part of a selected group', () => {
    const { controller, selection, counts } = setup({ bodies: [body('g', { geometry: boltGroup() })] })
    controller.createMaterials('dark')
    controller.syncBodies()
    selection.ids = ['g']
    controller.applySelectionMaterial()
    expect(counts.xrayTwins).toBe(2)
  })

  it('a live colour preview repaints the body without touching its twins', () => {
    const { controller, selection, colorPreview, counts } = setup({ bodies: [body('a')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    selection.ids = ['a']
    controller.applySelectionMaterial()
    const twinsBefore = counts.xrayTwins
    colorPreview.bodyId = 'a'
    colorPreview.color = 0xff0000
    controller.paintBodies()
    const a = /** @type {Mesh} */ (controller.meshes.get('a'))
    expect(/** @type {any} */ (a.material).color.getHex()).toBe(0xff0000)
    expect(counts.xrayTwins).toBe(twinsBefore)
  })
})

describe('createBodyMeshes: hover', () => {
  it('twins a hovered body, and hovering it twice does not stack twins', () => {
    const { controller, hoverHighlight, counts } = setup({ bodies: [body('a')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    hoverHighlight.target = { bodyId: 'a', partName: null }
    controller.applyHover()
    controller.applyHover()
    expect(counts.hoverTwins).toBe(1)
    expect(twinsOn(controller.group)).toBe(1)
    hoverHighlight.target = null
    controller.applyHover()
    expect(counts.hoverTwins).toBe(0)
    expect(twinsOn(controller.group)).toBe(0)
  })

  it('a hover on a body with no mesh lights nothing and does not throw', () => {
    const { controller, hoverHighlight, counts } = setup({ bodies: [body('a')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    hoverHighlight.target = { bodyId: 'missing', partName: null }
    hoverHighlight.many = ['also-missing']
    expect(() => controller.applyHover()).not.toThrow()
    expect(counts.hoverTwins).toBe(0)
  })

  it('a hovered hidden part gets a transient mesh, freed when the hover moves on', () => {
    const { controller, hoverHighlight, counts } = setup({ bodies: [body('g', { geometry: boltGroup() })] })
    controller.createMaterials('dark')
    controller.syncBodies()
    hoverHighlight.target = { bodyId: 'g', partName: 'tap' }
    controller.applyHover()
    const object = /** @type {ThreeGroup} */ (controller.meshes.get('g'))
    const transient = /** @type {Mesh} */ (object.children.find((child) => child.userData.hoverTransient))
    expect(transient).toBeInstanceOf(Mesh)
    expect(counts.hoverTransient).toBe('tap')
    expect(counts.hoverTwins).toBe(1)
    const dispose = vi.spyOn(transient.geometry, 'dispose')
    hoverHighlight.target = { bodyId: 'g', partName: 'head' }
    controller.applyHover()
    expect(dispose).toHaveBeenCalled()
    expect(object.children.some((child) => child.userData.hoverTransient)).toBe(false)
    expect(counts.hoverTransient).toBe('')
    expect(counts.hoverTwins).toBe(1)
  })

  it('a many-body hover twins every part of every listed body, once', () => {
    const { controller, hoverHighlight, counts } = setup({ bodies: [body('a'), body('g', { geometry: boltGroup() })] })
    controller.createMaterials('dark')
    controller.syncBodies()
    hoverHighlight.target = { bodyId: 'a', partName: null }
    hoverHighlight.many = ['a', 'g']
    controller.applyHover()
    // `a` is in the many set, so its target twin is not added twice: 1 for `a`, 2 for `g`.
    expect(counts.hoverTwins).toBe(3)
  })

  it('a re-sync keeps the hover on the new geometry', () => {
    const { controller, state, hoverHighlight, counts } = setup({ bodies: [body('a')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    hoverHighlight.target = { bodyId: 'a', partName: null }
    controller.applyHover()
    state.bodies = [{ ...state.bodies[0], recordId: 'a-r2', geometry: cube(20) }]
    controller.syncBodies()
    expect(counts.hoverTwins).toBe(1)
    expect(twinsOn(controller.group)).toBe(1)
  })
})

describe('createBodyMeshes: repeat outlines', () => {
  it('outlines each ticked target, with a transient mesh for a hidden one', () => {
    const { controller, repeatSession, counts } = setup({ bodies: [body('g', { geometry: boltGroup() })] })
    controller.createMaterials('dark')
    controller.syncBodies()
    repeatSession.seed = { bodyId: 'g' }
    repeatSession.outlined = ['head', 'tap']
    controller.applyRepeatOutlines()
    expect(counts.repeatOutlines).toBe(2)
    const object = /** @type {ThreeGroup} */ (controller.meshes.get('g'))
    expect(object.children.filter((child) => child.userData.hoverTransient)).toHaveLength(1)
    // Applying again replaces rather than stacks.
    controller.applyRepeatOutlines()
    expect(counts.repeatOutlines).toBe(2)
    expect(object.children.filter((child) => child.userData.hoverTransient)).toHaveLength(1)
    repeatSession.seed = null
    controller.applyRepeatOutlines()
    expect(counts.repeatOutlines).toBe(0)
    expect(object.children.some((child) => child.userData.hoverTransient)).toBe(false)
  })

  it('a seed with no mesh, or a bare solid, outlines nothing and still schedules a frame', () => {
    const { controller, repeatSession, counts, scheduleRender } = setup({ bodies: [body('a')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    scheduleRender.mockClear()
    repeatSession.seed = { bodyId: 'missing' }
    repeatSession.outlined = ['head']
    controller.applyRepeatOutlines()
    expect(counts.repeatOutlines).toBe(0)
    expect(scheduleRender).toHaveBeenCalledTimes(1)
    repeatSession.seed = { bodyId: 'a' }
    controller.applyRepeatOutlines()
    expect(counts.repeatOutlines).toBe(0)
  })
})

describe('createBodyMeshes: theme', () => {
  it('recolours every shared material for the light theme, and back', () => {
    const { controller, selection } = setup({ bodies: [body('a'), body('b')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    selection.ids = ['a']
    controller.applySelectionMaterial()
    controller.applyMaterialTheme('light')
    const a = /** @type {Mesh} */ (controller.meshes.get('a'))
    const b = /** @type {Mesh} */ (controller.meshes.get('b'))
    expect(/** @type {any} */ (a.material).color.getHex()).toBe(BODY_COLORS.light.selected)
    expect(/** @type {any} */ (b.material).color.getHex()).toBe(BODY_COLORS.light.body)
    const twin = /** @type {Mesh} */ (a.children.find((child) => child.name === 'xray-twin'))
    expect(/** @type {any} */ (twin.material).color.getHex()).toBe(BODY_COLORS.light.selected)
    controller.applyMaterialTheme('dark')
    expect(/** @type {any} */ (a.material).color.getHex()).toBe(BODY_COLORS.dark.selected)
    expect(/** @type {any} */ (b.material).color.getHex()).toBe(BODY_COLORS.dark.body)
  })

  it('an unknown theme falls back to dark', () => {
    const { controller } = setup({ bodies: [body('a')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    controller.applyMaterialTheme('light')
    controller.applyMaterialTheme(/** @type {any} */ ('sepia'))
    const a = /** @type {Mesh} */ (controller.meshes.get('a'))
    expect(/** @type {any} */ (a.material).color.getHex()).toBe(BODY_COLORS.dark.body)
  })

  it('creates its materials in the theme it is given', () => {
    const { controller } = setup({ bodies: [body('a')] })
    controller.createMaterials('light')
    controller.syncBodies()
    const a = /** @type {Mesh} */ (controller.meshes.get('a'))
    expect(/** @type {any} */ (a.material).color.getHex()).toBe(BODY_COLORS.light.body)
  })

  it('repaints on a theme switch only while something is hovered', () => {
    const { controller, hoverHighlight, scheduleRender } = setup({ bodies: [body('a')] })
    controller.createMaterials('dark')
    controller.syncBodies()
    scheduleRender.mockClear()
    controller.applyMaterialTheme('light')
    expect(scheduleRender).not.toHaveBeenCalled()
    hoverHighlight.target = { bodyId: 'a', partName: null }
    controller.applyHover()
    const a = /** @type {Mesh} */ (controller.meshes.get('a'))
    const hoveredLight = /** @type {any} */ (a.material).color.getHex()
    scheduleRender.mockClear()
    controller.applyMaterialTheme('dark')
    expect(scheduleRender).toHaveBeenCalled()
    // The hovered copy is keyed by the palette colour, so the switch picks up the new one.
    expect(/** @type {any} */ (a.material).color.getHex()).not.toBe(hoveredLight)
  })

  it('a theme switch before any materials exist is a no-op', () => {
    const { controller } = setup()
    expect(() => controller.applyMaterialTheme('light')).not.toThrow()
  })
})

describe('createBodyMeshes: dispose', () => {
  it('frees every object and material, and later syncs do nothing', () => {
    const { controller, state, hoverHighlight, counts } = setup({ bodies: [body('a'), body('g', { geometry: boltGroup() })] })
    controller.createMaterials('dark')
    controller.syncBodies()
    hoverHighlight.target = { bodyId: 'g', partName: 'tap' }
    controller.applyHover()
    const a = /** @type {Mesh} */ (controller.meshes.get('a'))
    const geometryDispose = vi.spyOn(a.geometry, 'dispose')
    const materialDispose = vi.spyOn(/** @type {any} */ (a.material), 'dispose')
    controller.dispose()
    expect(geometryDispose).toHaveBeenCalled()
    expect(materialDispose).toHaveBeenCalled()
    expect(controller.meshes.size).toBe(0)
    expect(controller.group.children).toHaveLength(0)
    expect(counts.hoverTwins).toBe(0)
    expect(counts.hoverTransient).toBe('')
    state.bodies = [body('b')]
    controller.syncBodies()
    expect(controller.meshes.size).toBe(0)
  })
})

describe('announcedColor / announcedPartColors', () => {
  it('announce the whole-body override and the per-part ones', () => {
    const overrides = [
      { color: 0xff0000 },
      { color: 0x00ff00, subPart: 'head' },
      { color: 0x0000ff, subPart: 'shank' },
    ]
    expect(announcedColor({ colorOverrides: overrides })).toBe('#ff0000')
    expect(announcedPartColors({ colorOverrides: overrides })).toBe('head=#00ff00;shank=#0000ff')
  })

  it('announce nothing for a body with no overrides', () => {
    expect(announcedColor({})).toBe('')
    expect(announcedPartColors({})).toBe('')
    expect(announcedColor({ colorOverrides: [] })).toBe('')
  })
})
