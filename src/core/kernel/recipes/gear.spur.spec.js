// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { GearParameterError } from '../../gear/dimensions.js'
import { involuteProfile } from '../../gear/involute.js'
import { GEAR_LIMITS, GearBoreError, GearLimitError } from '../../gear/limits.js'
import { boundsOf, isGroup } from '../group.js'
import { evaluate, evaluateOp, expand } from '../index.js'
import { registry } from '../registry.js'
import { policyFor } from '../tessellation.js'
import { makeWatertight, openEdgesOf } from '../watertight.js'
import { GEAR_SPUR_UI, spur } from './gear.spur.js'
import spurSource from './gear.spur.js?raw'
import aliasesSource from '../../gear/aliases.js?raw'
import limitsSource from '../../gear/limits.js?raw'

const { geometries, measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('@jscad/modeling').geometries.geom2.Geom2} Geom2 */
/** @typedef {import('../group.js').Group} Group */

/**
 * @param {unknown} value
 * @returns {Group}
 */
function asGroup(value) {
  if (!isGroup(value)) throw new Error('expected a Group, got bare geometry')
  return value
}

/**
 * @param {Group} group
 * @param {string} name
 * @returns {Geom3}
 */
function partOf(group, name) {
  const part = group.parts[name]
  if (!part) throw new Error(`missing part ${name}`)
  return part
}

/** @param {[number, number][]} points */
function shoelaceAreaMm2(points) {
  let twice = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    twice += x0 * y1 - x1 * y0
  }
  return twice / 2
}

/**
 * Teeth counted off an outline: runs of vertices outside the pitch circle.
 *
 * @param {readonly (readonly number[])[]} points
 * @param {number} pitchRadiusMm
 */
function teethIn(points, pitchRadiusMm) {
  const outside = points.map(([x, y]) => Math.hypot(x, y) > pitchRadiusMm)
  let runs = 0
  for (let i = 0; i < outside.length; i++) {
    if (outside[i] && !outside[(i - 1 + outside.length) % outside.length]) runs++
  }
  return runs
}

/**
 * Near-exact area of the true outline: the same generator at a resolution far past any
 * preset, so the comparison measures the built solid, not the sampling.
 *
 * @param {import('../../gear/dimensions.js').GearParams} gear
 */
function trueProfileAreaMm2(gear) {
  return shoelaceAreaMm2(involuteProfile({ ...gear, pointsPerFlank: 64, tipSegments: 32, rootSegments: 32 }).outline)
}

/**
 * @param {() => unknown} fn
 * @returns {Error}
 */
function errorOf(fn) {
  try {
    fn()
  } catch (error) {
    return /** @type {Error} */ (error)
  }
  throw new Error('expected an error, nothing was thrown')
}

/** The TODO's own "Done" line, exactly as written. */
const TODO_EXAMPLE = Object.freeze({ teeth: 36, module: 1.39, pressureAngleDeg: 20, thicknessMm: 8, boreMm: 4 })

describe('the gear.spur recipe expands into records, it builds nothing', () => {
  it('expands the Library defaults into profile → 2D bore subtract → extrude → centre, plus the bore and pitch references', () => {
    expect(spur(GEAR_SPUR_UI.defaults)).toEqual([
      { id: 'profile', op: 'profile.gear', params: { teeth: 24, moduleMm: 2, pressureAngleDeg: 20 } },
      { id: 'hole', op: 'profile.circle', params: { diameter: 8 } },
      { id: 'face', op: 'boolean.subtract', target: 'profile', operands: ['hole'] },
      { id: 'blank', op: 'profile.extrudeLinear', target: 'face', params: { height: 8 } },
      { id: 'gear', op: 'transform.translate', target: 'blank', params: { vector: [0, 0, -4] }, name: 'gear' },
      { id: 'bore', op: 'primitive.cylinder', params: { diameter: 8, height: 8 }, name: 'bore', hidden: true },
      { id: 'pitch', op: 'primitive.cylinder', params: { diameter: 48, height: 8 }, name: 'pitch', hidden: true },
    ])
  })

  it('cuts the bore while the profile is still 2D — a 3D subtract leaves open cap edges on a many-toothed gear', () => {
    const records = spur({ teeth: 120, moduleMm: 2, thicknessMm: 6, boreMm: 20 })
    const ops = records.map((record) => record.op)
    expect(ops.indexOf('boolean.subtract')).toBeLessThan(ops.indexOf('profile.extrudeLinear'))
    expect(records.find((record) => record.op === 'boolean.subtract')?.target).toBe('profile')
  })

  it('emits no bore and no subtract when boreMm is absent or 0', () => {
    const expected = [
      { id: 'profile', op: 'profile.gear', params: { teeth: 17, moduleMm: 1 } },
      { id: 'blank', op: 'profile.extrudeLinear', target: 'profile', params: { height: 5 } },
      { id: 'gear', op: 'transform.translate', target: 'blank', params: { vector: [0, 0, -2.5] }, name: 'gear' },
      { id: 'pitch', op: 'primitive.cylinder', params: { diameter: 17, height: 5 }, name: 'pitch', hidden: true },
    ]
    expect(spur({ teeth: 17, moduleMm: 1, thicknessMm: 5 })).toEqual(expected)
    expect(spur({ teeth: 17, moduleMm: 1, thicknessMm: 5, boreMm: 0 })).toEqual(expected)
  })

  it('carries every gear param onto the profile record and nothing placement- or resolution-shaped', () => {
    const [profile] = spur({
      teeth: 30,
      moduleMm: 1.5,
      pressureAngleDeg: 25,
      profileShift: 0.3,
      clearanceMm: 0.2,
      backlashMm: 0.1,
      thicknessMm: 6,
    })
    expect(profile.params).toEqual({
      teeth: 30,
      moduleMm: 1.5,
      pressureAngleDeg: 25,
      profileShift: 0.3,
      clearanceMm: 0.2,
      backlashMm: 0.1,
    })
  })

  it('expands the extreme ends of every cap to well-formed records', () => {
    const low = spur({ teeth: GEAR_LIMITS.teeth.min, moduleMm: GEAR_LIMITS.moduleMm.min, pressureAngleDeg: GEAR_LIMITS.pressureAngleDeg.max, thicknessMm: 0.1 })
    const high = spur({ teeth: GEAR_LIMITS.teeth.max, moduleMm: GEAR_LIMITS.moduleMm.max, pressureAngleDeg: GEAR_LIMITS.pressureAngleDeg.min, thicknessMm: GEAR_LIMITS.thicknessMm.max, boreMm: 100 })
    for (const records of [low, high]) {
      expect(records[0].op).toBe('profile.gear')
      expect(JSON.parse(JSON.stringify(records))).toEqual(records)
    }
    expect(high.find((r) => r.id === 'pitch')?.params?.diameter).toBeCloseTo(25000, 9)
  })

  it('takes V1 vocabulary through the alias table, so a V1 gear ports by renaming nothing', () => {
    const [profile, blank] = spur({ toothCount: 36, circularPitch: (Math.PI * 50) / 36, clearance: 0.5, backlash: 0.1, thicknessMm: 8 })
    expect(profile.params?.teeth).toBe(36)
    expect(profile.params?.moduleMm).toBeCloseTo(50 / 36, 12)
    expect(profile.params?.clearanceMm).toBe(0.5)
    expect(blank.params?.height).toBe(8)
  })

  it('is reachable through the registry as a 0-operand composite, beside 0-operand native profile.gear and profile.circle', () => {
    expect(registry['gear.spur']).toMatchObject({ kind: 'composite', operandCount: 0 })
    for (const op of ['profile.gear', 'profile.circle']) {
      expect(registry[op], op).toMatchObject({ kind: 'native', operandCount: 0 })
      expect(registry[op].ui, op).toBeUndefined()
    }
    expect(expand('gear.spur', GEAR_SPUR_UI.defaults)).toEqual(spur(GEAR_SPUR_UI.defaults))
  })

  it('emits only ops the registry knows, and only JSON values', () => {
    for (const record of spur(GEAR_SPUR_UI.defaults)) {
      expect(registry[record.op], record.op).toBeDefined()
      expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    }
  })

  it('never imports @jscad/modeling — a recipe is records, not geometry', () => {
    for (const [name, source] of [['gear.spur.js', spurSource], ['aliases.js', aliasesSource], ['limits.js', limitsSource]]) {
      expect(source, name).not.toMatch(/from\s+['"]@jscad\/modeling/)
    }
  })
})

describe('folding gear.spur gives the solid core-040’s dimensions describe', () => {
  const group = asGroup(evaluateOp('gear.spur', TODO_EXAMPLE))
  const gear = partOf(group, 'gear')
  const gearParams = { teeth: 36, moduleMm: 1.39, pressureAngleDeg: 20 }
  const profile = involuteProfile(gearParams)

  it('names gear, bore and pitch, with only the toothed body visible', () => {
    expect(Object.keys(group.parts).sort()).toEqual(['bore', 'gear', 'pitch'])
    expect(group.names).toEqual(['gear'])
  })

  it('sits centred on the origin, axis Z, mid-thickness at Z = 0, tooth 0 on +X', () => {
    const [min, max] = boundsOf(gear)
    expect(min[2]).toBeCloseTo(-4, 9)
    expect(max[2]).toBeCloseTo(4, 9)
    // The bore's 2D boolean moves vertices by up to ~2e-4 mm (see gear.spur.js), hence 1e-3.
    expect(Math.abs(max[0] - profile.tipRadiusMm)).toBeLessThan(1e-3)
    const onPlusX = geometries.geom3
      .toPolygons(gear)
      .flatMap((polygon) => polygon.vertices)
      .some(([x, y]) => Math.abs(x - profile.tipRadiusMm) < 1e-3 && Math.abs(y) < 1e-3)
    expect(onPlusX).toBe(true)
    expect(Math.max(-min[0], max[1], -min[1])).toBeLessThanOrEqual(profile.tipRadiusMm + 1e-3)
  })

  it('has volume ≈ thickness · (profile area − bore area), within 0.5 %', () => {
    const expectedMm3 = 8 * (trueProfileAreaMm2(gearParams) - Math.PI * 2 * 2)
    const actualMm3 = measurements.measureVolume(gear)
    expect(Math.abs(actualMm3 - expectedMm3) / expectedMm3).toBeLessThan(0.005)
  })

  it('has the tooth count it was asked for', () => {
    const outline = geometries.geom2.toPoints(/** @type {Geom2} */ (/** @type {unknown} */ (evaluateOp('profile.gear', gearParams))))
    expect(teethIn(outline, profile.pitchRadiusMm)).toBe(36)
  })

  it('makes the pitch part a reference at the pitch circle and the bore part the bore', () => {
    const [pMin, pMax] = boundsOf(partOf(group, 'pitch'))
    expect(pMax[0] - pMin[0]).toBeCloseTo(profile.pitchDiameterMm, 9)
    expect(pMax[2] - pMin[2]).toBeCloseTo(8, 9)
    const [bMin, bMax] = boundsOf(partOf(group, 'bore'))
    expect(bMax[0] - bMin[0]).toBeCloseTo(4, 9)
  })
})

describe('watertight on 6, 17, 36 and 120 teeth, with and without a bore', () => {
  for (const teeth of [6, 17, 36, 120]) {
    for (const bored of [false, true]) {
      it(`${teeth} teeth, ${bored ? 'bored' : 'solid'}`, () => {
        const moduleMm = 2
        const rootDiameterMm = 2 * involuteProfile({ teeth, moduleMm }).rootRadiusMm
        const params = { teeth, moduleMm, thicknessMm: 6, ...(bored ? { boreMm: 0.4 * rootDiameterMm } : {}) }
        const gear = partOf(asGroup(evaluateOp('gear.spur', params)), 'gear')
        expect(openEdgesOf(makeWatertight(gear)).openEdges).toBe(0)
        expect(measurements.measureVolume(gear)).toBeGreaterThan(0)
      })
    }
  }

  it('rejects a bore at or past the root diameter with a named error, not a hole through the teeth', () => {
    const rootDiameterMm = 2 * involuteProfile({ teeth: 36, moduleMm: 2 }).rootRadiusMm
    for (const boreMm of [rootDiameterMm, rootDiameterMm + 0.5, 1000]) {
      const error = errorOf(() => spur({ teeth: 36, moduleMm: 2, thicknessMm: 6, boreMm }))
      expect(error, String(boreMm)).toBeInstanceOf(GearBoreError)
      expect(error.name).toBe('GearBoreError')
      expect(error.message).toMatch(/root/)
    }
  })
})

describe('hostile input: a named error, checked before the profile is built', () => {
  /** @type {[string, Record<string, unknown>][]} */
  const hostile = [
    ['NaN teeth', { teeth: Number.NaN, moduleMm: 2, thicknessMm: 6 }],
    ['fractional teeth', { teeth: 20.5, moduleMm: 2, thicknessMm: 6 }],
    ['10⁶ teeth', { teeth: 1e6, moduleMm: 2, thicknessMm: 6 }],
    ['2 teeth', { teeth: 2, moduleMm: 2, thicknessMm: 6 }],
    ['Infinity module', { teeth: 20, moduleMm: Number.POSITIVE_INFINITY, thicknessMm: 6 }],
    ['negative module', { teeth: 20, moduleMm: -1, thicknessMm: 6 }],
    ['module past the cap', { teeth: 20, moduleMm: 51, thicknessMm: 6 }],
    ['pressure angle past the cap', { teeth: 20, moduleMm: 2, pressureAngleDeg: 40, thicknessMm: 6 }],
    ['NaN thickness', { teeth: 20, moduleMm: 2, thicknessMm: Number.NaN }],
    ['zero thickness', { teeth: 20, moduleMm: 2, thicknessMm: 0 }],
    ['missing thickness', { teeth: 20, moduleMm: 2 }],
    ['missing module', { teeth: 20, thicknessMm: 6 }],
    ['negative bore', { teeth: 20, moduleMm: 2, thicknessMm: 6, boreMm: -3 }],
    ['Infinity bore', { teeth: 20, moduleMm: 2, thicknessMm: 6, boreMm: Number.POSITIVE_INFINITY }],
    ['string backlash', { teeth: 20, moduleMm: 2, thicknessMm: 6, backlashMm: '0.1' }],
  ]

  it.each(hostile)('%s is a GearLimitError from the recipe', (_label, params) => {
    const error = errorOf(() => spur(params))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error).toBeInstanceOf(GearParameterError)
    expect(error.message).toMatch(/^gear\.spur: /)
  })

  it('refuses 10⁶ teeth on the native profile.gear too, before any outline is sampled', () => {
    const started = performance.now()
    const error = errorOf(() => evaluateOp('profile.gear', { teeth: 1e6, moduleMm: 2 }))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error.message).toMatch(/^profile\.gear: /)
    // Sampling a million teeth would take seconds and gigabytes; a cap is microseconds.
    expect(performance.now() - started).toBeLessThan(50)
  })

  it('refuses an unknown param on profile.gear — its vocabulary is canonical only', () => {
    expect(() => evaluateOp('profile.gear', { teeth: 20, module: 2 })).toThrow(/module/)
  })

  it('refuses `center` on the recipe by name: the trailing translate places it', () => {
    expect(() => spur({ teeth: 20, moduleMm: 2, thicknessMm: 6, center: [1, 2, 3] })).toThrow(/transform\.translate/)
  })

  it('reports a tooth with no material left as core-040’s named error, with the op in front', () => {
    const error = errorOf(() => evaluateOp('profile.gear', { teeth: 20, moduleMm: 2, backlashMm: 10 }))
    expect(error.name).toBe('GearToothVanishedError')
    expect(error.message).toMatch(/^profile\.gear: /)
  })
})

describe('resolution comes from the design (core-035), not from a per-gear setting', () => {
  /** @param {import('../tessellation.js').TessellationPolicy | undefined} policy */
  const verticesAt = (policy) =>
    geometries.geom2.toPoints(
      /** @type {Geom2} */ (/** @type {unknown} */ (evaluateOp('profile.gear', { teeth: 36, moduleMm: 2 }, policy ? { policy } : {})))
    ).length

  it('samples finer for Print than for Draft, so export is finer than preview', () => {
    expect(verticesAt(policyFor('print'))).toBeGreaterThan(verticesAt(policyFor('draft')))
    expect(verticesAt(policyFor('fine'))).toBeGreaterThanOrEqual(verticesAt(policyFor('normal')))
  })

  it('uses Decision 4’s fixed 8 points per flank under legacy, deterministically', () => {
    const legacy = verticesAt(undefined)
    expect(legacy).toBe(verticesAt(undefined))
    // 4 flank runs of 8 points per tooth at least, plus the lands.
    expect(legacy).toBeGreaterThanOrEqual(36 * 4 * 8)
  })

  it('keeps every preset’s outline within the tolerance of the true area', () => {
    const trueArea = trueProfileAreaMm2({ teeth: 36, moduleMm: 2 })
    for (const id of ['draft', 'normal', 'fine', 'print']) {
      const outline = geometries.geom2.toPoints(
        /** @type {Geom2} */ (/** @type {unknown} */ (evaluateOp('profile.gear', { teeth: 36, moduleMm: 2 }, { policy: policyFor(id) })))
      )
      expect(Math.abs(shoelaceAreaMm2(/** @type {any} */ (outline)) - trueArea) / trueArea, id).toBeLessThan(0.005)
    }
  })
})

describe('regression: the composite pipeline core-020 and core-024 were filed against', () => {
  const drop = [
    { id: 'g1', op: 'gear.spur', params: { ...GEAR_SPUR_UI.defaults } },
    { id: 'g1-drop', op: 'transform.translate', target: 'g1', supersedes: 'g1', params: { vector: [60, 0, 4], rotation: [0, 0, 0] } },
  ]

  it('core-020: a gear placed after a drag keeps its named parts, and owns nothing else in the scene', () => {
    const { byId } = evaluate([{ id: 'cube', op: 'primitive.cuboid', params: { size: [10, 10, 10] }, name: 'cube' }, ...drop])
    const moved = asGroup(byId.get('g1-drop'))
    expect(Object.keys(moved.parts).sort()).toEqual(['bore', 'gear', 'pitch'])
    const [min, max] = boundsOf(moved)
    expect((min[0] + max[0]) / 2).toBeGreaterThan(55)
    expect(min[2]).toBeCloseTo(0, 9)
  })

  it('core-024: a boolean on one sub-part (the bore) addresses only that part', () => {
    const block = { id: 'block', op: 'primitive.cuboid', params: { size: [30, 30, 8], center: [60, 0, 4] } }
    const { byId } = evaluate([
      ...drop,
      block,
      { id: 'cut', op: 'boolean.subtract', target: 'block', operands: [{ id: 'g1-drop', pieces: 'bore' }] },
    ])
    const cut = /** @type {Geom3} */ (byId.get('cut'))
    const boreVolumeMm3 = measurements.measureVolume(partOf(asGroup(byId.get('g1-drop')), 'bore'))
    expect(measurements.measureVolume(cut)).toBeCloseTo(30 * 30 * 8 - boreVolumeMm3, 3)
  })
})

describe('GEAR_SPUR_UI: the catalogue metadata ui-057 attaches to the registry entry', () => {
  it('is frozen, labelled, and its defaults fold to a gear', () => {
    expect(Object.isFrozen(GEAR_SPUR_UI)).toBe(true)
    expect(GEAR_SPUR_UI.label).toBe('Spur gear')
    expect(() => evaluateOp('gear.spur', GEAR_SPUR_UI.defaults)).not.toThrow()
  })

  it('names an instance by its tooth count, as History will read it', () => {
    expect(GEAR_SPUR_UI.nameFor?.({ ...GEAR_SPUR_UI.defaults, teeth: 36 })).toBe('Spur gear 36T')
  })

  it('takes its param ranges from the same caps the recipe enforces', () => {
    expect(GEAR_SPUR_UI.paramRanges.teeth).toEqual(GEAR_LIMITS.teeth)
    expect(GEAR_SPUR_UI.paramRanges.moduleMm).toEqual(GEAR_LIMITS.moduleMm)
    expect(GEAR_SPUR_UI.paramRanges.pressureAngleDeg).toEqual(GEAR_LIMITS.pressureAngleDeg)
    expect(GEAR_SPUR_UI.paramRanges.thicknessMm).toEqual(GEAR_LIMITS.thicknessMm)
  })

  it('is not on the registry entry yet, so the gear is not a Library row before ui-057', () => {
    expect(registry['gear.spur'].ui).toBeUndefined()
  })
})
