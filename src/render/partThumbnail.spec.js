// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — drives a hand-written fake canvas/document, as the other render specs do.
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { createGroup, add } from '../core/kernel/group.js'
import { THUMBNAIL_PNG_PATTERN, partPolygons, projectThumbnail, renderPartThumbnail } from './partThumbnail.js'

/**
 * `TODO/ui-055` — the My parts row's thumbnail: drawn from the real geometry, as a small
 * flat-shaded painter's-algorithm picture. The projection is pure and tested in Node; only
 * the last step needs a canvas, and that is mocked at the boundary.
 */

const { cuboid } = modeling.primitives

function cube(size, center) {
  return cuboid({ size: [size, size, size], center })
}

describe('partPolygons', () => {
  it('reads a bare solid and every visible part of a group, and nothing else', () => {
    expect(partPolygons(cube(10, [0, 0, 5]))).toHaveLength(6)
    const group = add(add(createGroup('g'), cube(10, [0, 0, 5]), 'a'), cube(10, [30, 0, 5]), 'b')
    expect(partPolygons(group)).toHaveLength(12)
  })
})

describe('projectThumbnail', () => {
  it('fits every projected point inside the picture, with a margin', () => {
    const faces = projectThumbnail(partPolygons(cube(40, [100, 100, 20])), 64)
    expect(faces.length).toBeGreaterThan(0)
    for (const face of faces) {
      for (let i = 0; i < face.points.length; i += 2) {
        expect(face.points[i]).toBeGreaterThanOrEqual(0)
        expect(face.points[i]).toBeLessThanOrEqual(64)
        expect(face.points[i + 1]).toBeGreaterThanOrEqual(0)
        expect(face.points[i + 1]).toBeLessThanOrEqual(64)
      }
    }
  })

  it('draws far faces first and gives faces with different normals different shades', () => {
    const faces = projectThumbnail(partPolygons(cube(40, [0, 0, 20])), 64)
    const depths = faces.map((face) => face.depth)
    expect(depths).toEqual([...depths].sort((a, b) => a - b))
    expect(new Set(faces.map((face) => face.shade.toFixed(3))).size).toBeGreaterThan(1)
  })

  it('does not throw on nothing, and is the same picture whatever the part’s size or position', () => {
    expect(projectThumbnail([], 64)).toEqual([])
    const small = projectThumbnail(partPolygons(cube(2, [0, 0, 1])), 64)
    const big = projectThumbnail(partPolygons(cube(200, [500, -300, 100])), 64)
    expect(small.map((face) => face.points.map((v) => Math.round(v)))).toEqual(
      big.map((face) => face.points.map((v) => Math.round(v)))
    )
  })
})

describe('renderPartThumbnail', () => {
  function fakeDocument() {
    const calls = []
    const context = new Proxy({}, { get: (_t, key) => (...args) => calls.push([String(key), ...args]), set: () => true })
    const canvas = { width: 0, height: 0, getContext: () => context, toDataURL: () => 'data:image/png;base64,AAAA' }
    return { calls, document: { createElement: () => canvas } }
  }

  it('returns a PNG data URL drawn from the geometry', () => {
    const { calls, document } = fakeDocument()
    const url = renderPartThumbnail(cube(10, [0, 0, 5]), { size: 64, document })
    expect(url).toMatch(THUMBNAIL_PNG_PATTERN)
    expect(calls.some(([name]) => name === 'fill')).toBe(true)
  })

  it('returns null, never throws, with no canvas available', () => {
    expect(renderPartThumbnail(cube(10, [0, 0, 5]), { size: 64, document: null })).toBeNull()
    expect(renderPartThumbnail(cube(10, [0, 0, 5]), { size: 64, document: { createElement: () => ({ getContext: () => null }) } })).toBeNull()
  })
})
