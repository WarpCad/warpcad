// SPDX-License-Identifier: AGPL-3.0-or-later
// `gear.worm` (TODO/core-047): the worm's transverse section (`profile.gear` kind `worm`)
// twisted through its whole length by `profile.extrudeLinear`'s `leadMm` — one
// `extrudeFromSlices`, no boolean, so it is watertight by construction. Also the kernel's
// `leadMm` path itself, and the vertex/time ceiling a long worm at Print resolution must fit.
import { describe, expect, it, vi } from 'vitest'
import modeling from '@jscad/modeling'

import { GearAliasError } from '../../gear/aliases.js'
import { wormDimensions } from '../../gear/worm.js'
import { GearBoreError, GearLimitError } from '../../gear/limits.js'
import { isGroup } from '../group.js'
import { evaluate, evaluateOp, expand } from '../index.js'
import { policyFor } from '../tessellation.js'
import { openEdgesOf } from '../watertight.js'
import { WORM_PARAMS, worm } from './gear.worm.js'

// Heavy kernel/library work: slow-but-correct under full-suite load, so a file-level budget (TODO/testing-004).
vi.setConfig({ testTimeout: 30_000 })

const { geometries, measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/** A module-2, single-start worm on a 20 mm pitch circle, 30 mm long. */
const BASE = Object.freeze({ starts: 1, moduleMm: 2, pitchDiameterMm: 20, lengthMm: 30 })

/**
 * @param {Record<string, unknown>} params
 * @param {string} [resolution]
 * @returns {{ solid: Geom3, parts: Record<string, Geom3> }}
 */
function build(params, resolution = 'normal') {
  const value = evaluateOp('gear.worm', params, { policy: policyFor(resolution) })
  if (!isGroup(value)) throw new Error('expected a Group')
  const solid = value.parts.worm
  if (!solid) throw new Error('missing worm part')
  return { solid, parts: /** @type {Record<string, Geom3>} */ (value.parts) }
}

/**
 * @param {() => unknown} fn
 * @returns {Error & { param?: string, code?: string }}
 */
function errorOf(fn) {
  try {
    fn()
  } catch (error) {
    return /** @type {Error} */ (error)
  }
  throw new Error('expected an error, nothing was thrown')
}

/** @param {number} rad */
const wrap = (rad) => Math.atan2(Math.sin(rad), Math.cos(rad))

/**
 * The smallest angular distance from `expectedRad` to a vertex at height `zMm` on the circle
 * of `radiusMm` — 0 when the section there has a vertex at exactly that bearing.
 *
 * @param {Geom3} solid
 * @param {number} zMm
 * @param {number} radiusMm
 * @param {number} expectedRad
 */
function angularMissRad(solid, zMm, radiusMm, expectedRad) {
  let best = Number.POSITIVE_INFINITY
  for (const polygon of geometries.geom3.toPolygons(solid)) {
    for (const [x, y, z] of polygon.vertices) {
      if (Math.abs(z - zMm) > 1e-9 || Math.abs(Math.hypot(x, y) - radiusMm) > 1e-6) continue
      best = Math.min(best, Math.abs(wrap(Math.atan2(y, x) - expectedRad)))
    }
  }
  return best
}

/**
 * Polygon count, distinct vertex positions, and polygon-vertex references.
 *
 * @param {Geom3} solid
 */
function sizeOf(solid) {
  const polygons = geometries.geom3.toPolygons(solid)
  const distinct = new Set()
  let references = 0
  for (const polygon of polygons) {
    for (const v of polygon.vertices) {
      distinct.add(`${v[0]},${v[1]},${v[2]}`)
      references++
    }
  }
  return { polygons: polygons.length, vertices: distinct.size, references }
}

describe('gear.worm — the expansion', () => {
  it('is the worm section, twisted once per lead through the length, centred, plus a hidden pitch cylinder', () => {
    const dims = wormDimensions(BASE)
    expect(worm(BASE)).toEqual([
      { id: 'profile', op: 'profile.gear', params: { kind: 'worm', starts: 1, moduleMm: 2, pitchDiameterMm: 20 } },
      { id: 'thread', op: 'profile.extrudeLinear', target: 'profile', params: { height: 30, leadMm: dims.leadMm, handedness: 'right' } },
      { id: 'worm', op: 'transform.translate', target: 'thread', params: { vector: [0, 0, -15] }, name: 'worm' },
      { id: 'pitch', op: 'primitive.cylinder', params: { diameter: 20, height: 30 }, name: 'pitch', hidden: true },
    ])
  })

  it('passes the section params it was given, and cuts a bore in 2D before the twist (gear.spur’s idiom)', () => {
    const records = worm({ ...BASE, starts: 2, pressureAngleDeg: 25, clearanceMm: 0.4, backlashMm: 0.1, boreMm: 6, handedness: 'left' })
    expect(records.map((r) => r.id)).toEqual(['profile', 'hole', 'face', 'thread', 'worm', 'bore', 'pitch'])
    expect(records[0].params).toEqual({ kind: 'worm', starts: 2, moduleMm: 2, pitchDiameterMm: 20, pressureAngleDeg: 25, clearanceMm: 0.4, backlashMm: 0.1 })
    expect(records[2]).toEqual({ id: 'face', op: 'boolean.subtract', target: 'profile', operands: ['hole'] })
    expect(records[3].target).toBe('face')
    expect(records[3].params?.handedness).toBe('left')
    expect(records[5]).toEqual({ id: 'bore', op: 'primitive.cylinder', params: { diameter: 6, height: 30 }, name: 'bore', hidden: true })
  })

  it('takes the TODO’s `module` spelling, refuses an unknown param and `center` by name', () => {
    expect(worm({ starts: 1, module: 2, pitchDiameterMm: 20, lengthMm: 30 })).toEqual(worm(BASE))
    expect(errorOf(() => worm({ ...BASE, shaftMm: 5 }))).toBeInstanceOf(GearAliasError)
    expect(errorOf(() => worm({ ...BASE, center: [0, 0, 0] }))).toBeInstanceOf(GearAliasError)
    expect(WORM_PARAMS).toContain('frictionCoefficient')
  })

  it('accepts frictionCoefficient — the self-locking readout’s assumption — without changing a record', () => {
    expect(worm({ ...BASE, frictionCoefficient: 0.3 })).toEqual(worm(BASE))
  })
})

describe('gear.worm — geometry', () => {
  for (const starts of [1, 2, 4]) {
    it(`a ${starts}-start worm is watertight with no repair, centred, inside its tip circle`, () => {
      const { solid } = build({ ...BASE, starts })
      expect(openEdgesOf(solid).openEdges).toBe(0)
      const dims = wormDimensions({ ...BASE, starts })
      const [[minX, minY, minZ], [maxX, maxY, maxZ]] = measurements.measureBoundingBox(solid)
      expect(minZ).toBeCloseTo(-15, 9)
      expect(maxZ).toBeCloseTo(15, 9)
      for (const c of [minX, minY, maxX, maxY]) expect(Math.abs(c)).toBeLessThanOrEqual(dims.tipRadiusMm + 1e-9)
      const volume = measurements.measureVolume(solid)
      expect(volume).toBeGreaterThan(Math.PI * dims.rootRadiusMm ** 2 * 30)
      expect(volume).toBeLessThan(Math.PI * dims.tipRadiusMm ** 2 * 30)
    })
  }

  it('turns once per lead: right hand CCW going up, left hand CW, tooth 0 on +X at the bottom face', () => {
    for (const [handedness, sign] of /** @type {const} */ ([
      ['right', 1],
      ['left', -1],
    ])) {
      const { solid } = build({ ...BASE, handedness })
      const dims = wormDimensions(BASE)
      expect(angularMissRad(solid, -15, dims.tipRadiusMm, 0), handedness).toBeLessThan(1e-9)
      const topRad = (sign * 2 * Math.PI * 30) / dims.leadMm
      expect(angularMissRad(solid, 15, dims.tipRadiusMm, topRad), handedness).toBeLessThan(1e-9)
    }
  })

  it('is the same volume per unit length for 1, 2 and 4 starts — the axial section is the same rack', () => {
    const volumes = [1, 2, 4].map((starts) => measurements.measureVolume(build({ ...BASE, starts, pitchDiameterMm: 40 }).solid))
    expect(volumes[1] / volumes[0]).toBeCloseTo(1, 2)
    expect(volumes[2] / volumes[0]).toBeCloseTo(1, 2)
  })

  it('bores through, and the hidden bore and pitch parts are there to snap to', () => {
    const plain = build(BASE).solid
    const { solid, parts } = build({ ...BASE, boreMm: 6 })
    expect(openEdgesOf(solid).openEdges).toBe(0)
    // The hole is the same policy-sampled polygon as the hidden bore cylinder, twisted with the
    // thread, so the volume it removes is within a sliver (0.4% measured) of that cylinder's.
    const removed = measurements.measureVolume(plain) - measurements.measureVolume(solid)
    expect(Math.abs(removed / measurements.measureVolume(parts.bore) - 1)).toBeLessThan(0.01)
    expect(Object.keys(parts).sort()).toEqual(['bore', 'pitch', 'worm'])
  })

  // Measured while building this (2026-10-16, this machine): module 2, 1 start, Ø20, 200 mm
  // (31.8 turns) at Print — 81 section points × 2 452 slices = 198 612 distinct vertices,
  // 397 220 triangles, the fold ~45 ms warm (Draft: 23 910 vertices, ~7 ms). The vertex and
  // polygon ceilings leave ~25% headroom and the time ceiling room for a slow CI machine: a
  // worm is the first gear whose cost grows with its length, so a change that doubles it
  // must fail here, not in a user's tab.
  const LONG = Object.freeze({ starts: 1, moduleMm: 2, pitchDiameterMm: 20, lengthMm: 200 })
  const MAX_LONG_WORM_VERTICES = 250_000
  const MAX_LONG_WORM_POLYGONS = 500_000
  const MAX_LONG_WORM_MS = 3_000

  it(`a 200 mm worm at Print resolution is watertight and stays under ${MAX_LONG_WORM_VERTICES} vertices and ${MAX_LONG_WORM_MS} ms`, () => {
    const started = performance.now()
    const { solid } = build(LONG, 'print')
    const elapsedMs = performance.now() - started
    const size = sizeOf(solid)
    expect(size.vertices).toBeLessThan(MAX_LONG_WORM_VERTICES)
    expect(size.polygons).toBeLessThan(MAX_LONG_WORM_POLYGONS)
    expect(elapsedMs).toBeLessThan(MAX_LONG_WORM_MS)
    expect(openEdgesOf(solid).openEdges).toBe(0)
  }, 60_000)

  it('previews far cheaper than it exports: Draft samples fewer slices than Print', () => {
    expect(sizeOf(build(LONG, 'draft').solid).vertices).toBeLessThan(sizeOf(build(LONG, 'print').solid).vertices / 4)
  }, 60_000)
})

describe('gear.worm — degenerate input, refused or built by name', () => {
  it('builds a worm shorter than one lead — watertight, a partial turn of thread', () => {
    const { solid } = build({ ...BASE, lengthMm: 4 })
    expect(wormDimensions({ ...BASE, lengthMm: 4 }).warnings).toContain('shorter-than-lead')
    expect(openEdgesOf(solid).openEdges).toBe(0)
  })

  it('refuses 0 and 5 starts before a record exists', () => {
    for (const starts of [0, 5]) {
      const error = errorOf(() => worm({ ...BASE, starts }))
      expect(error).toBeInstanceOf(GearLimitError)
      expect(error.param).toBe('starts')
      expect(error.message).toMatch(/^gear\.worm: /)
    }
  })

  it('refuses a pitch diameter below the root-diameter limit, and a bore the root circle cannot hold', () => {
    const tooSmall = errorOf(() => worm({ ...BASE, pitchDiameterMm: 4 }))
    expect(tooSmall).toBeInstanceOf(GearLimitError)
    expect(tooSmall.param).toBe('pitchDiameterMm')
    expect(tooSmall.message).toMatch(/^gear\.worm: /)
    const root = 2 * wormDimensions(BASE).rootRadiusMm
    expect(errorOf(() => worm({ ...BASE, boreMm: root }))).toBeInstanceOf(GearBoreError)
  })

  it('needs a length', () => {
    const { lengthMm: _l, ...noLength } = BASE
    expect(errorOf(() => worm(noLength)).message).toMatch(/lengthMm is required/)
  })
})

describe('profile.extrudeLinear `leadMm` — the twist path for a worm (core-047)', () => {
  /**
   * @param {Record<string, unknown>} params
   * @param {string} [resolution]
   */
  const extrude = (params, resolution = 'normal') =>
    evaluate(
      [
        { id: 'p', op: 'profile.circle', params: { diameter: 10, center: [3, 0], segments: 12 } },
        { id: 'x', op: 'profile.extrudeLinear', target: 'p', params },
      ],
      { policy: policyFor(resolution) }
    ).byId.get('x')

  it('turns the profile once per lead, many turns if need be, watertight', () => {
    const solid = /** @type {Geom3} */ (extrude({ height: 50, leadMm: 10 }))
    expect(openEdgesOf(solid).openEdges).toBe(0)
    const [[, , minZ], [, , maxZ]] = measurements.measureBoundingBox(solid)
    expect(minZ).toBeCloseTo(0, 9)
    expect(maxZ).toBeCloseTo(50, 9)
    // Five whole turns: the top cap's outline lies exactly on the bottom cap's.
    /** @param {number} zMm */
    const capAt = (zMm) => {
      const keys = new Set()
      for (const polygon of geometries.geom3.toPolygons(solid)) {
        // `+ 0` folds −0 into 0, so a vertex on y = 0 keys the same at both caps.
        for (const [x, y, z] of polygon.vertices) if (Math.abs(z - zMm) < 1e-9) keys.add(`${Math.round(x * 1e6) + 0},${Math.round(y * 1e6) + 0}`)
      }
      return [...keys].sort()
    }
    expect(capAt(50)).toEqual(capAt(0))
    // …and halfway up a turn the disc is on the other side of the axis.
    const half = /** @type {Geom3} */ (extrude({ height: 5, leadMm: 10 }))
    const [[hx0], [hx1]] = measurements.measureBoundingBox(half)
    expect(hx0).toBeLessThan(-7)
    expect(hx1).toBeGreaterThan(7)
  })

  it('refuses a lead that is not a positive number, a hand that is not right or left, and mixing it with twistDeg', () => {
    for (const params of [
      { height: 10, leadMm: 0 },
      { height: 10, leadMm: -2 },
      { height: 10, leadMm: Number.POSITIVE_INFINITY },
      { height: 10, leadMm: 2, handedness: 'up' },
      { height: 10, leadMm: 2, twistDeg: 30 },
      { height: 10, leadMm: 2, herringbone: true },
      { height: 10, handedness: 'left' },
    ]) {
      expect(() => extrude(params), JSON.stringify(params)).toThrow(/profile\.extrudeLinear/)
    }
  })

  it('refuses, before building, a lead so fine for its length that even Draft would pass the vertex budget', () => {
    expect(() => extrude({ height: 1000, leadMm: 0.001 }, 'draft')).toThrow(/budget/)
  })
})
