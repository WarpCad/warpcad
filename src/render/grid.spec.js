import { describe, it, expect } from 'vitest'
import { buildGridLines, GRID_MINOR_MM, GRID_MAJOR_EVERY, GRID_EXTENT_MM } from './grid.js'

/** @param {Float32Array} arr */
const segments = (arr) => arr.length / 6

describe('buildGridLines', () => {
  it('defaults to 10mm minor / 50mm major over a ±500mm grid', () => {
    const grid = buildGridLines()
    expect(grid.minorMm).toBe(GRID_MINOR_MM)
    expect(grid.majorMm).toBe(GRID_MINOR_MM * GRID_MAJOR_EVERY)
    expect(grid.majorMm).toBe(50)
    expect(grid.extentMm).toBe(GRID_EXTENT_MM)
  })

  it('splits every 5th line into the major bucket and leaves the axes out of both', () => {
    const grid = buildGridLines({ minorMm: 10, majorEvery: 5, extentMm: 100 })
    // i ∈ [-10, 10] minus i = 0 → 20 offsets, each contributing an X-parallel and
    // a Y-parallel line. i = ±5, ±10 are major (4 offsets → 8 segments).
    expect(segments(grid.major)).toBe(8)
    expect(segments(grid.minor)).toBe(32)
    expect(segments(grid.axisX)).toBe(1)
    expect(segments(grid.axisY)).toBe(1)
  })

  it('lies flat on the Z = 0 plane (Z-up convention)', () => {
    const grid = buildGridLines({ extentMm: 50 })
    for (const arr of [grid.minor, grid.major, grid.axisX, grid.axisY]) {
      for (let i = 2; i < arr.length; i += 3) expect(arr[i]).toBe(0)
    }
  })

  it('runs the axis lines through the origin along X and Y', () => {
    const grid = buildGridLines({ extentMm: 30, minorMm: 10 })
    expect(Array.from(grid.axisX)).toEqual([-30, 0, 0, 30, 0, 0])
    expect(Array.from(grid.axisY)).toEqual([0, -30, 0, 0, 30, 0])
  })

  it('snaps the extent down to a whole number of minor steps', () => {
    // 95mm of extent at 10mm spacing is 9 steps, so the grid ends at 90mm rather
    // than leaving a ragged partial cell at the edge.
    const grid = buildGridLines({ minorMm: 10, extentMm: 95 })
    expect(grid.extentMm).toBe(90)
    expect(grid.axisX[3]).toBe(90)
  })

  it('supports a major-every-10th grid as well as every-5th', () => {
    const grid = buildGridLines({ minorMm: 1, majorEvery: 10, extentMm: 10 })
    expect(grid.majorMm).toBe(10)
    // i = ±10 only → 2 offsets → 4 segments.
    expect(segments(grid.major)).toBe(4)
  })

  it('degenerates gracefully: an extent smaller than one cell has no interior lines', () => {
    const grid = buildGridLines({ minorMm: 10, extentMm: 5 })
    expect(segments(grid.minor)).toBe(0)
    expect(segments(grid.major)).toBe(0)
    expect(grid.extentMm).toBe(0)
  })

  it('rejects nonsense spacings rather than emitting an infinite grid', () => {
    expect(() => buildGridLines({ minorMm: 0 })).toThrow(/minorMm/)
    expect(() => buildGridLines({ minorMm: -10 })).toThrow(/minorMm/)
    expect(() => buildGridLines({ majorEvery: 0 })).toThrow(/majorEvery/)
    expect(() => buildGridLines({ majorEvery: 2.5 })).toThrow(/majorEvery/)
    expect(() => buildGridLines({ extentMm: 0 })).toThrow(/extentMm/)
  })
})
