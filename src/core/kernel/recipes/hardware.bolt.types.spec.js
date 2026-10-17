// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `hardware.bolt` as the one fastener op (TODO/core-060): a `type` (socket, hex, pan,
 * flat, woodPan, woodFlat) and a bare `spec` size, with every pre-change record shape
 * still read — and still expanding byte-identically, against an oracle pinned from the
 * recipe **before** the refactor (`__fixtures__/fasteners.legacy-oracle.json`).
 */
import { describe, expect, it } from 'vitest'

import { isGroup } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { boltSpecs } from '../tables/bolt-specs.js'
import { DEFAULT_SIZE_BY_TYPE, FASTENER_TYPES, fastenerSpecs as realFastenerSpecs } from '../tables/fastener-specs.js'
import { woodScrewHolesMm as realWoodScrewHolesMm } from '../tables/wood-screw-holes.js'
import { bolt, defaultFitFor, normalizeBoltParams } from './hardware.bolt.js'

import oracle from './__fixtures__/fasteners.legacy-oracle.json'
import expansionFixture from './__fixtures__/hardware.bolt.m10-hex-20-loose.json'

/** Indexed by plain strings in these tests. */
const fastenerSpecs = /** @type {Record<string, Record<string, any>>} */ (realFastenerSpecs)
const woodScrewHolesMm = /** @type {Record<string, Record<string, number>>} */ (realWoodScrewHolesMm)
const TABLES = { boltSpecs, fastenerSpecs }

/** @param {any[]} records @param {string} id */
const recordOf = (records, id) => {
  const record = records.find((candidate) => candidate.id === id)
  if (!record) throw new Error(`no record ${id}`)
  return record
}

/** @param {any[]} records @returns {string[]} the named parts, in order */
const partNames = (records) => records.filter((record) => typeof record.name === 'string').map((record) => record.name)

describe('legacy shapes expand byte-identically (oracle pinned before the refactor)', () => {
  it.each(oracle.bolt.map((testCase) => [JSON.stringify(testCase.params), testCase]))('hardware.bolt %s', (_label, testCase) => {
    expect(JSON.stringify(bolt(testCase.params, TABLES))).toBe(JSON.stringify(testCase.records))
  })

  it('the m10-hex-20-loose fixture still expands exactly, through the registry too', () => {
    expect(JSON.stringify(expand('hardware.bolt', expansionFixture.params))).toBe(JSON.stringify(expansionFixture.records))
  })

  it('a new-shape socket/hex record expands exactly as its legacy spelling did', () => {
    for (const testCase of oracle.bolt) {
      const { spec, ...rest } = testCase.params
      const [size, type] = spec.split(' ')
      expect(JSON.stringify(bolt({ ...rest, type, spec: size }, TABLES)), spec).toBe(JSON.stringify(testCase.records))
    }
  })
})

describe('normalizeBoltParams', () => {
  it('every boltSpecs key round-trips: legacy -> normalised -> the same row', () => {
    for (const key of Object.keys(boltSpecs)) {
      const normal = /** @type {any} */ (normalizeBoltParams({ spec: key, length: 10 }))
      expect(fastenerSpecs[normal.type][normal.spec], key).toBe(boltSpecs[key])
      expect(`${normal.spec} ${normal.type}`).toBe(key)
      expect(normal.length).toBe(10)
    }
  })

  it('splits on the last space: m10 hex -> hex/m10, 1/4 socket -> socket/1/4', () => {
    expect(normalizeBoltParams({ spec: 'm10 hex', length: 20, fit: 'loose' })).toEqual({ type: 'hex', spec: 'm10', length: 20, fit: 'loose' })
    expect(normalizeBoltParams({ spec: '1/4 socket', length: 5 })).toEqual({ type: 'socket', spec: '1/4', length: 5 })
  })

  it('leaves a new-shape record alone, and returns the same object when nothing changes', () => {
    const params = { type: 'flat', spec: 'm3', length: 10, fit: 'close' }
    expect(normalizeBoltParams(params)).toBe(params)
  })

  it('a suffixed spec wins over a stale type — new sizes never contain a space', () => {
    expect(normalizeBoltParams({ type: 'hex', spec: 'm5 socket', length: 8 })).toEqual({ type: 'socket', spec: 'm5', length: 8 })
  })

  it('leaves a bound spec untouched (a variable resolves first)', () => {
    const params = { spec: { $var: 'size' }, length: 10 }
    expect(normalizeBoltParams(params)).toBe(params)
  })

  it('never mutates its input', () => {
    const params = Object.freeze({ spec: 'm3 socket', length: 6 })
    normalizeBoltParams(params)
    expect(params).toEqual({ spec: 'm3 socket', length: 6 })
  })
})

describe('every Type builds head and thread; a fitted size adds tap', () => {
  it.each(FASTENER_TYPES.map((type) => [type]))('%s at its default size', (type) => {
    const spec = DEFAULT_SIZE_BY_TYPE[type]
    const records = bolt({ type, spec, length: 12 }, TABLES)
    expect(partNames(records)).toEqual(['head', 'thread', 'tap-head', 'tap-thread', 'tap-headClearSpace', 'tap'])
    const group = evaluateOp('hardware.bolt', { type, spec, length: 12 })
    if (!isGroup(group)) throw new Error('expected a group')
    expect(group.names).toEqual(['head', 'thread'])
    expect(Object.keys(group.parts)).toContain('tap')
  })

  it('pan head is a cylinder, flat head a cone tapering to the shank, hex a prism', () => {
    expect(recordOf(bolt({ type: 'pan', spec: 'm4', length: 10 }, TABLES), 'head.solid').op).toBe('primitive.cylinder')
    expect(recordOf(bolt({ type: 'woodPan', spec: '#8', length: 10 }, TABLES), 'head.solid').op).toBe('primitive.cylinder')
    expect(recordOf(bolt({ type: 'hex', spec: 'm10', length: 10 }, TABLES), 'head.solid').op).toBe('primitive.hexagon')
    for (const [type, spec] of [['flat', 'm3'], ['woodFlat', '#8']]) {
      const row = fastenerSpecs[type][spec]
      expect(recordOf(bolt({ type, spec, length: 10 }, TABLES), 'head.solid')).toEqual({
        id: 'head.solid',
        op: 'primitive.cone',
        params: { diameter: row.headDiameterMm, topDiameter: row.bodyDiameterMm, height: row.headHeightMm },
      })
    }
  })

  it('a pan/flat head + thread are exactly the hardware.screw records for the same size and head', () => {
    const screwRecords = (/** @type {string} */ head) => expand('hardware.screw', { spec: 'm4', length: 12, head })
    const fastener = (/** @type {string} */ type) => bolt({ type, spec: 'm4', length: 12 }, TABLES).slice(0, 4)
    expect(fastener('pan')).toEqual(screwRecords('PanHead'))
    // flat m4 is the ISO flat-head row, not the screw table's m4, so only the shape matches.
    expect(recordOf(fastener('flat'), 'head.solid').op).toBe(recordOf(screwRecords('FlatHead'), 'head.solid').op)
    expect(bolt({ type: 'woodFlat', spec: '#8', length: 12 }, TABLES).slice(0, 4)).toEqual(
      expand('hardware.screw', { spec: '#8', length: 12, head: 'FlatHead' })
    )
  })

  it('a flat-head tap is the head cone grown by the clearance — the countersink', () => {
    const row = fastenerSpecs.flat.m3
    const records = bolt({ type: 'flat', spec: 'm3', length: 10, fit: 'close' }, TABLES)
    const clearance = row.fitDiameterMm.close - row.bodyDiameterMm
    const tapHead = recordOf(records, 'tap-head.solid')
    expect(tapHead.op).toBe('primitive.cone')
    expect(tapHead.params.diameter).toBeCloseTo(row.headDiameterMm + clearance, 9)
    expect(tapHead.params.topDiameter).toBeCloseTo(row.bodyDiameterMm + clearance, 9)
    expect(tapHead.params.height).toBeCloseTo(row.headHeightMm + clearance, 9)
    expect(recordOf(records, 'tap-thread.solid').params.diameter).toBeCloseTo(row.fitDiameterMm.close, 9)
    expect(recordOf(records, 'tap-thread').params.vector[2]).toBeCloseTo(row.headHeightMm + clearance + 10 / 2, 9)
    expect(recordOf(records, 'tap').hidden).toBe(true)
  })

  it('a wood tap thread is the chosen fit\'s hole exactly; its head grows by the clearance fit\'s clearance', () => {
    const row = fastenerSpecs.woodFlat['#8']
    const growth = woodScrewHolesMm['#8'].clearance - row.bodyDiameterMm
    for (const fit of ['clearance', 'hardwood', 'softwood']) {
      const records = bolt({ type: 'woodFlat', spec: '#8', length: 25, fit }, TABLES)
      expect(recordOf(records, 'tap-thread.solid').params.diameter, fit).toBe(woodScrewHolesMm['#8'][fit])
      const tapHead = recordOf(records, 'tap-head.solid')
      expect(tapHead.params.diameter, fit).toBeCloseTo(row.headDiameterMm + growth, 9)
      expect(tapHead.params.topDiameter, fit).toBeCloseTo(row.bodyDiameterMm + growth, 9)
      expect(tapHead.params.height, fit).toBeCloseTo(row.headHeightMm + growth, 9)
    }
    // A pilot is narrower than the thread — the point of a pilot.
    expect(woodScrewHolesMm['#8'].softwood).toBeLessThan(row.bodyDiameterMm)
  })

  it('defaults fit: loose for machine screws and bolts, softwood for wood screws', () => {
    expect(defaultFitFor('socket')).toBe('loose')
    expect(defaultFitFor('flat')).toBe('loose')
    expect(defaultFitFor('woodPan')).toBe('softwood')
    const records = bolt({ type: 'woodPan', spec: '#8', length: 25 }, TABLES)
    expect(recordOf(records, 'tap-thread.solid').params.diameter).toBe(woodScrewHolesMm['#8'].softwood)
  })

  it('a wood gauge the chart does not cover builds head and thread, and no tap part', () => {
    const records = bolt({ type: 'woodFlat', spec: '#16', length: 30 }, TABLES)
    expect(partNames(records)).toEqual(['head', 'thread'])
  })
})

describe('refusals, in the existing wording style', () => {
  it('an unknown type lists the six', () => {
    expect(() => bolt({ type: 'carriage', spec: 'm4', length: 10 }, TABLES)).toThrow(
      /hardware\.bolt: unknown type "carriage", expected one of socket \| hex \| pan \| flat \| woodPan \| woodFlat/
    )
  })

  it('an unknown size names the type and lists that type\'s sizes only', () => {
    expect(() => bolt({ type: 'pan', spec: 'm3', length: 10 }, TABLES)).toThrow(/hardware\.bolt: unknown pan size "m3", expected one of m4$/)
  })

  it('an unknown legacy spec still lists every legacy key', () => {
    expect(() => bolt({ spec: 'm7 hex', length: 10 }, TABLES)).toThrow(/unknown spec "m7 hex", expected one of m1\.6 socket/)
  })

  it('a fit the type does not have lists the ones it does', () => {
    expect(() => bolt({ type: 'woodPan', spec: '#8', length: 10, fit: 'loose' }, TABLES)).toThrow(
      /hardware\.bolt: unknown fit "loose", expected one of clearance \| hardwood \| softwood/
    )
  })

  it('a fit on a size with no fit data is refused, not guessed', () => {
    expect(() => bolt({ type: 'woodPan', spec: '#16', length: 10, fit: 'softwood' }, TABLES)).toThrow(/#16 has no fit data/)
  })

  it('a zero length is refused for every type', () => {
    for (const type of FASTENER_TYPES) {
      expect(() => bolt({ type, spec: DEFAULT_SIZE_BY_TYPE[type], length: 0 }, TABLES), type).toThrow(/length must be a positive number/)
    }
  })
})
