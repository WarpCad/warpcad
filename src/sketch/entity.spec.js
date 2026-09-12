import { describe, expect, it } from 'vitest'

import {
  SKETCH_LINE_OP,
  createLineEntity,
  isDegenerate,
  lengthOf,
  lineFromParams,
  lineParams,
  moveEndpoint,
} from './entity.js'

describe('lengthOf', () => {
  it('measures a real 3-4-5 triangle', () => {
    // The one piece of new maths this whole control introduces, so it is
    // asserted against a case whose answer is known exactly rather than one
    // computed the same way the implementation computes it.
    expect(lengthOf([0, 0], [3, 4])).toBeCloseTo(5, 10)
    expect(lengthOf([10, 20], [13, 24])).toBeCloseTo(5, 10)
    // Direction must not matter — a line measured end-to-start is the same line.
    expect(lengthOf([13, 24], [10, 20])).toBeCloseTo(5, 10)
  })

  it('reports 0 for a zero-length segment rather than throwing', () => {
    // CLAUDE.md's numerical convention: cover the degenerate case. The entity
    // module deliberately does *not* reject one — refusing to commit a
    // zero-length drag is the interaction layer's job (see `isDegenerate`), and
    // a measurement function that threw would make that check the caller's
    // problem in a second place.
    expect(lengthOf([0, 0], [0, 0])).toBe(0)
    expect(lengthOf([-7.5, 2.25], [-7.5, 2.25])).toBe(0)
  })

  it('is exact along a single axis, at millimetre scale', () => {
    expect(lengthOf([-20, 0], [20, 0])).toBeCloseTo(40, 10)
    expect(lengthOf([0, -0.5], [0, 0.5])).toBeCloseTo(1, 10)
  })
})

describe('moveEndpoint', () => {
  it('updates only the named endpoint and leaves the other untouched', () => {
    const line = createLineEntity('sketch-1', [0, 0], [30, 40])

    const movedStart = moveEndpoint(line, 'start', [5, 5])
    expect(movedStart.startMm).toEqual([5, 5])
    expect(movedStart.endMm).toEqual([30, 40])

    const movedEnd = moveEndpoint(line, 'end', [1, 2])
    expect(movedEnd.startMm).toEqual([0, 0])
    expect(movedEnd.endMm).toEqual([1, 2])
  })

  it('returns a new entity and never mutates the one it was given', () => {
    // The document log is append-only and its records are immutable, so an
    // endpoint edit has to produce a *new* value to append rather than rewrite
    // the one already committed (see `src/core/document.js`'s supersession note).
    const line = createLineEntity('sketch-1', [0, 0], [30, 40])
    const moved = moveEndpoint(line, 'start', [5, 5])
    expect(moved).not.toBe(line)
    expect(line.startMm).toEqual([0, 0])
    expect(moved.id).toBe('sketch-1')
  })

  it('rejects an endpoint name it does not know', () => {
    const line = createLineEntity('sketch-1', [0, 0], [30, 40])
    expect(() => moveEndpoint(line, /** @type {any} */ ('middle'), [1, 1])).toThrow(/middle/)
  })
})

describe('isDegenerate', () => {
  it('is true only for a release that never really moved', () => {
    // The Interaction model's explicit degenerate case: pointer-down and
    // pointer-up at the same place commits nothing.
    expect(isDegenerate([4, 4], [4, 4], 0.001)).toBe(true)
    expect(isDegenerate([4, 4], [4.0005, 4], 0.001)).toBe(true)
    expect(isDegenerate([4, 4], [4, 14], 0.001)).toBe(false)
  })
})

describe('lineParams / lineFromParams — the record shape, defined once', () => {
  it('round-trips an entity through plain JSON params', () => {
    const line = createLineEntity('sketch-2', [-10, 3.5], [10, -3.5])
    const params = lineParams(line.startMm, line.endMm)
    expect(JSON.parse(JSON.stringify(params))).toEqual(params)
    expect(lineFromParams('sketch-2', params)).toEqual(line)
  })

  it('refuses params that are not two finite points', () => {
    // A document can arrive from an untrusted URL (`src/core/replay.js`'s own
    // reasoning), so the reader validates rather than trusting the shape.
    expect(lineFromParams('x', /** @type {any} */ ({}))).toBeNull()
    expect(lineFromParams('x', /** @type {any} */ ({ start: [0, 0] }))).toBeNull()
    expect(lineFromParams('x', /** @type {any} */ ({ start: [0, 0], end: [0, NaN] }))).toBeNull()
    expect(lineFromParams('x', /** @type {any} */ ({ start: [0, 0], end: [1, 2, 3] }))).toBeNull()
  })

  it('names the op string in one place', () => {
    expect(SKETCH_LINE_OP).toBe('sketch.line')
    // The document's fold routes on this prefix, so the two must not drift.
    expect(SKETCH_LINE_OP.startsWith('sketch.')).toBe(true)
  })
})
