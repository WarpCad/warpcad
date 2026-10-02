// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The resolution policy inside the fold (`TODO/core-035`): which ops follow it, which
 * never do, and that `legacy` is byte-for-byte the pre-`core-035` geometry.
 */
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import goldenJson from './__fixtures__/tessellation-legacy-golden.json'
import { digestOf, tessellationCases } from './__fixtures__/tessellationCases.js'
import { DEFAULT_SEGMENTS, evaluate, expand } from './index.js'
import { isGroup, toGeom3 } from './group.js'
import { policyFor, segmentsFor } from './tessellation.js'

const { geometries } = modeling

/** @type {Record<string, string>} */
const golden = goldenJson

/**
 * How many distinct vertices sit on a solid's top (or bottom) face — for a z-axis
 * cylinder, exactly its segment count.
 *
 * @param {any} value
 * @param {'top' | 'bottom'} [face]
 * @returns {number}
 */
function topRimVertexCount(value, face = 'top') {
  const solid = isGroup(value) ? toGeom3(value) : value
  const vertices = geometries.geom3.toPolygons(solid).flatMap((polygon) => polygon.vertices)
  const zs = vertices.map((v) => v[2])
  const top = face === 'top' ? Math.max(...zs) : Math.min(...zs)
  const onFace = vertices.filter((v) => Math.abs(v[2] - top) < 1e-6)
  // jscad caps a cylinder as a fan around a centre vertex; that one is not on the rim.
  // A regular polygon's vertices average to its centre, so the mean of the distinct face
  // points (rim plus centre) is the centre at any n, odd or even.
  const distinct = [...new Map(onFace.map((v) => [`${v[0].toFixed(5)},${v[1].toFixed(5)}`, v])).values()]
  const cx = distinct.reduce((sum, v) => sum + v[0], 0) / distinct.length
  const cy = distinct.reduce((sum, v) => sum + v[1], 0) / distinct.length
  return distinct.filter((v) => Math.hypot(v[0] - cx, v[1] - cy) > 1e-4).length
}

/** @param {any} value */
const polygonCount = (value) => geometries.geom3.toPolygons(isGroup(value) ? toGeom3(value) : value).length

/**
 * @param {import('./registry.js').OpRecord[]} records
 * @param {string} [preset]
 */
function fold(records, preset) {
  return evaluate(records, preset === undefined ? {} : { policy: policyFor(preset) }).byId
}

describe('legacy folds byte-identically to the code before core-035', () => {
  for (const testCase of tessellationCases()) {
    it(`${testCase.key} — default options`, () => {
      expect(digestOf(fold(testCase.records).get('it'))).toBe(golden[testCase.key])
    })
    it(`${testCase.key} — explicit legacy policy`, () => {
      expect(digestOf(fold(testCase.records, 'legacy').get('it'))).toBe(golden[testCase.key])
    })
  }

  it('the golden file covers every case (no case silently unchecked)', () => {
    expect(Object.keys(golden).sort()).toEqual(tessellationCases().map((c) => c.key).sort())
  })

  it('a legacy cylinder is the identical polygon set to an explicit DEFAULT_SEGMENTS one', () => {
    const implicit = fold([{ id: 'it', op: 'primitive.cylinder', params: { diameter: 50, height: 10 } }], 'legacy')
    const explicit = fold([
      { id: 'it', op: 'primitive.cylinder', params: { diameter: 50, height: 10, segments: DEFAULT_SEGMENTS } },
    ])
    expect(digestOf(implicit.get('it'))).toBe(digestOf(explicit.get('it')))
  })
})

describe('tessellation-intent ops follow the policy', () => {
  const cylinder = [{ id: 'it', op: 'primitive.cylinder', params: { diameter: 50, height: 10 } }]

  it('a Ø50 cylinder has the preset table count on its rim', () => {
    expect(topRimVertexCount(fold(cylinder, 'legacy').get('it'))).toBe(32)
    expect(topRimVertexCount(fold(cylinder, 'draft').get('it'))).toBe(36)
    expect(topRimVertexCount(fold(cylinder, 'normal').get('it'))).toBe(52)
    expect(topRimVertexCount(fold(cylinder, 'fine').get('it'))).toBe(80)
    expect(topRimVertexCount(fold(cylinder, 'print').get('it'))).toBe(112)
  })

  it('cone, sphere and tube get finer as the preset does', () => {
    for (const op of [
      { op: 'primitive.cone', params: { diameter: 40, height: 30 } },
      { op: 'primitive.sphere', params: { diameter: 40 } },
      { op: 'primitive.tube', params: { diameter: 40, innerDiameter: 26, height: 20 } },
    ]) {
      const records = [{ id: 'it', ...op }]
      const draft = polygonCount(fold(records, 'draft').get('it'))
      const print = polygonCount(fold(records, 'print').get('it'))
      expect(print, op.op).toBeGreaterThan(draft)
    }
  })

  it('a rounded-rectangle profile and a fillet rim follow it too', () => {
    const rim = [
      { id: 'cube', op: 'primitive.cuboid', params: { size: [40, 40, 40] } },
      { id: 'it', op: 'modify.filletRim', params: { radius: 5, orientation: 'z+' }, target: 'cube' },
    ]
    expect(polygonCount(fold(rim, 'print').get('it'))).toBeGreaterThan(polygonCount(fold(rim, 'draft').get('it')))
    const board = [{ id: 'it', op: 'kit.board', params: { width: 85, height: 56, cornerRadius: 6, thickness: 1.6 } }]
    expect(polygonCount(fold(board, 'print').get('it'))).toBeGreaterThan(polygonCount(fold(board, 'draft').get('it')))
  })

  it("a bolt's tap clearance (the scenario-5 fit case) follows it", () => {
    const bolt = [{ id: 'it', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 12, fit: 'tap' } }]
    const legacy = fold(bolt, 'legacy').get('it')
    const print = fold(bolt, 'print').get('it')
    // `tap` is the union of a hex clearance head and a round clearance shank; the shank is
    // its own named part, `tap-thread` — the round hole a screw actually passes through.
    const tapLegacy = topRimVertexCount(/** @type {any} */ (legacy).parts['tap-thread'])
    const tapPrint = topRimVertexCount(/** @type {any} */ (print).parts['tap-thread'])
    expect(tapLegacy).toBe(32)
    expect(tapPrint).toBeGreaterThan(tapLegacy)
  })
})

describe('what never follows the policy', () => {
  it('primitive.hexagon stays 6 sides under every preset — shape, not tessellation', () => {
    for (const preset of ['legacy', 'draft', 'normal', 'fine', 'print']) {
      const value = fold([{ id: 'it', op: 'primitive.hexagon', params: { diameter: 40, height: 10 } }], preset).get('it')
      expect(topRimVertexCount(value), preset).toBe(6)
    }
  })

  it("a hex-head bolt's head stays a hexagon under every preset", () => {
    for (const preset of ['legacy', 'print']) {
      const bolt = fold([{ id: 'it', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 12 } }], preset).get('it')
      expect(topRimVertexCount(/** @type {any} */ (bolt).parts.head), preset).toBe(6)
    }
  })

  it('an explicit segments: 7 on a record wins over every preset', () => {
    for (const preset of ['legacy', 'draft', 'normal', 'fine', 'print']) {
      const value = fold([{ id: 'it', op: 'primitive.cylinder', params: { diameter: 50, height: 10, segments: 7 } }], preset).get('it')
      expect(topRimVertexCount(value), preset).toBe(7)
    }
  })
})

describe('recipes no longer bake a segment count into the records they emit', () => {
  /** @param {import('./registry.js').OpRecord[]} records */
  const baked = (records) => records.filter((record) => record.params?.segments !== undefined).map((r) => r.id)

  it('hardware.bolt, kit.anchor, kit.board, kit.boardFrame and every raspberrypi.* recipe', () => {
    const cases = tessellationCases().filter((c) => /^(hardware|kit|raspberrypi)\./.test(c.records[0].op))
    expect(cases.length).toBeGreaterThan(10)
    for (const testCase of cases) {
      const record = testCase.records[0]
      expect(baked(expand(record.op, record.params)), testCase.key).toEqual([])
    }
  })

  it('an explicit segments param on the composite is still passed through', () => {
    const records = expand('hardware.bolt', { spec: 'm10 hex', length: 12, segments: 9 })
    expect(baked(records).length).toBeGreaterThan(0)
  })
})

describe('the fold cache is keyed on the policy (core-031)', () => {
  it('re-folding the same record objects at another preset never serves the old tessellation', () => {
    const cache = new WeakMap()
    const records = [{ id: 'it', op: 'primitive.cylinder', params: { diameter: 50, height: 10 } }]
    const normal = evaluate(records, { cache, policy: policyFor('normal') }).byId.get('it')
    const fine = evaluate(records, { cache, policy: policyFor('fine') }).byId.get('it')
    expect(topRimVertexCount(normal)).toBe(52)
    expect(topRimVertexCount(fine)).toBe(80)
    // And back again: a hit is only a hit under the policy it was built with.
    const again = evaluate(records, { cache, policy: policyFor('normal') }).byId.get('it')
    expect(topRimVertexCount(again)).toBe(52)
  })

  it('a composite cached at one preset is rebuilt at another', () => {
    const cache = new WeakMap()
    const records = [{ id: 'it', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 12, fit: 'tap' } }]
    const draft = evaluate(records, { cache, policy: policyFor('draft') }).byId.get('it')
    const print = evaluate(records, { cache, policy: policyFor('print') }).byId.get('it')
    expect(topRimVertexCount(/** @type {any} */ (print).parts['tap-thread'])).toBeGreaterThan(
      topRimVertexCount(/** @type {any} */ (draft).parts['tap-thread'])
    )
  })
})

describe('group.removePart re-folds its group under the policy (TODO/ui-051 path)', () => {
  it('the parts left behind keep the preset tessellation', () => {
    const records = [
      { id: 'bolt', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 12, fit: 'tap' } },
      { id: 'it', op: 'group.removePart', params: { part: 'tap' }, target: 'bolt', supersedes: 'bolt' },
    ]
    const print = /** @type {any} */ (fold(records, 'print').get('it'))
    expect(Object.keys(print.parts)).not.toContain('tap')
    expect(topRimVertexCount(print.parts.thread)).toBe(segmentsFor(5, policyFor('print')))
  })
})
