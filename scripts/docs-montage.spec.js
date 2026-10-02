// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { buildFfmpegArgs, expandHome, tileFilter, validateSpec } from './docs-montage.mjs'

const spec = (n, extra = {}) => ({
  output: 'out.jpg',
  sourceRoot: '~/x',
  columns: 2,
  tile: { width: 100, height: 50 },
  gap: 4,
  background: '0x000000',
  quality: 4,
  items: Array.from({ length: n }, (_, i) => ({ src: `${i}.png` })),
  ...extra,
})

describe('validateSpec', () => {
  it('accepts a full grid', () => expect(validateSpec(spec(4))).toEqual([]))
  it('says how many images are missing from a ragged grid', () => {
    expect(validateSpec(spec(3))[0]).toMatch(/add or remove 1/)
  })
  it('rejects an empty list and a zero column count', () => {
    expect(validateSpec(spec(0, { columns: 0 })).length).toBeGreaterThanOrEqual(2)
  })
  it('rejects a crop that leaves the image', () => {
    const s = spec(2)
    s.items[0].crop = { x: 0.5, y: 0, w: 0.8, h: 1 }
    expect(validateSpec(s)[0]).toMatch(/crop/)
  })
})

describe('tileFilter', () => {
  it('covers then centre-crops the tile and pads for the gap', () => {
    const f = tileFilter(1, { src: 'a.png' }, spec(2))
    expect(f).toContain('[1:v]scale=100:50:force_original_aspect_ratio=increase')
    expect(f).toContain('crop=100:50,pad=104:54')
    expect(f.endsWith('[t1]')).toBe(true)
  })
  it('applies a fractional crop first', () => {
    const f = tileFilter(0, { src: 'a.png', crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } }, spec(2))
    expect(f.startsWith('[0:v]crop=iw*0.5:ih*0.6:iw*0.1:ih*0.2,')).toBe(true)
  })
})

describe('buildFfmpegArgs', () => {
  it('lays tiles out row-major on a cell grid and frames the result', () => {
    const args = buildFfmpegArgs(spec(4), ['a', 'b', 'c', 'd'], 'out.jpg')
    const graph = args[args.indexOf('-filter_complex') + 1]
    expect(graph).toContain('layout=0_0|104_0|0_54|104_54')
    expect(graph).toContain('pad=212:112:4:4') // 2*104+4 by 2*54+4, 4px leading edge
    expect(args.filter((a) => a === '-i')).toHaveLength(4)
    expect(args.at(-1)).toBe('out.jpg')
  })
})

describe('expandHome', () => {
  it('only expands a leading ~/', () => {
    expect(expandHome('/a/~/b')).toBe('/a/~/b')
    expect(expandHome('~/b')).not.toContain('~')
  })
})
