import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { getEntry } from './registry.js'
import { evaluateOp } from './index.js'
import { LIBRARY_SECTIONS, restingCenter } from '../library.js'

const { measurements, geometries } = modeling

/**
 * @param {Record<string, any>} params
 * @returns {import('@jscad/modeling').geometries.geom3.Geom3}
 */
function build(params) {
  return /** @type {any} */ (getEntry('text.label').build?.({ params, inputs: [] }))
}

/** @param {any} solid */
function size(solid) {
  const [min, max] = measurements.measureBoundingBox(solid)
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

describe('text.label (TODO/render-002)', () => {
  it('is a 0-operand native op with Library metadata', () => {
    const entry = getEntry('text.label')
    expect(entry.kind).toBe('native')
    expect(entry.operandCount).toBe(0)
    expect(entry.ui?.label).toBe('Text')
  })

  it('extrudes a string into a solid whose thickness is heightMm', () => {
    const solid = build({ text: 'HI', size: 10, strokeWidth: 1.5, height: 3 })
    expect(geometries.geom3.isA(solid)).toBe(true)
    const [w, d, h] = size(solid)
    expect(h).toBeCloseTo(3, 6)
    expect(w).toBeGreaterThan(5)
    // `size` is the cap height; stroke ends are flat, so nothing is added above it.
    expect(d).toBeCloseTo(10, 1)
  })

  it('a longer string is wider than a shorter one at the same size', () => {
    const a = size(build({ text: 'AB', size: 10, strokeWidth: 1, height: 2 }))[0]
    const b = size(build({ text: 'ABCD', size: 10, strokeWidth: 1, height: 2 }))[0]
    expect(b).toBeGreaterThan(a * 1.6)
  })

  it('is centred on `center` by bounding box, like every primitive', () => {
    const solid = build({ text: 'Hi', size: 10, strokeWidth: 1, height: 2, center: [5, -7, 20] })
    const [min, max] = measurements.measureBoundingBox(solid)
    expect((min[0] + max[0]) / 2).toBeCloseTo(5, 6)
    expect((min[1] + max[1]) / 2).toBeCloseTo(-7, 6)
    expect((min[2] + max[2]) / 2).toBeCloseTo(20, 6)
  })

  it('throws on an empty or whitespace-only string rather than returning nothing', () => {
    expect(() => build({ text: '', size: 10, strokeWidth: 1, height: 2 })).toThrow(/text\.label.*text/)
    expect(() => build({ text: '   ', size: 10, strokeWidth: 1, height: 2 })).toThrow(/drawable/)
  })

  it.each(['size', 'strokeWidth', 'height'])('rejects a non-positive %s', (key) => {
    const params = { text: 'A', size: 10, strokeWidth: 1, height: 2, [key]: 0 }
    expect(() => build(params)).toThrow(new RegExp(`text\\.label.*${key}`))
  })

  it('evaluates through the real fold to a solid', () => {
    const solid = evaluateOp('text.label', { text: 'A', size: 10, strokeWidth: 1, height: 2 })
    expect(geometries.geom3.isA(solid)).toBe(true)
  })

  it('has a Library row in its own section, resting on the working plane', () => {
    const section = LIBRARY_SECTIONS.find((s) => s.id === 'text')
    expect(section?.title).toBe('Text')
    const [row] = section?.rows ?? []
    expect(row.op).toBe('text.label')
    expect(row.operandCount).toBe(0)
    const [x, y, z] = restingCenter('text.label', row.defaults, { x: 12, y: 8 })
    expect(x).toBe(12)
    expect(y).toBe(8)
    expect(z).toBeCloseTo(row.defaults.height / 2, 6)
  })
})
