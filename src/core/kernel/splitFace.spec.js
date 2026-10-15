// SPDX-License-Identifier: AGPL-3.0-or-later
import modeling from '@jscad/modeling'
import { describe, expect, it } from 'vitest'

import { previewSplitFace } from './split.js'

const { booleans, primitives } = modeling

/**
 * The Split sheet's Place connectors overlay asks the kernel one question (`TODO/ui-067`):
 * what does the cut face look like, what would the search place, and does each hand placement
 * fit. These pin that answer to the same checks Apply runs.
 */

const bar = () => primitives.cuboid({ size: [300, 40, 20], center: [150, 0, 0] })
const params = { axis: 'x', offsetMm: 150, clearanceMm: 0.2 }

describe('previewSplitFace', () => {
  it('describes the cut face: axes, extent, and a fits grid that is clear in the middle and dimmed at the rim', () => {
    const face = previewSplitFace(bar(), params)
    expect(face.uAxis).toBe('y')
    expect(face.vAxis).toBe('z')
    expect(face.uRange[0]).toBeCloseTo(-20, 9)
    expect(face.uRange[1]).toBeCloseTo(20, 9)
    expect(face.vRange[0]).toBeCloseTo(-10, 9)
    expect(face.fits).toHaveLength(face.columns * face.rows)
    const at = (/** @type {number} */ u, /** @type {number} */ v) =>
      face.fits[
        Math.floor(((v - face.vRange[0]) / 20) * face.rows) * face.columns +
          Math.floor(((u - face.uRange[0]) / 40) * face.columns)
      ]
    expect(at(0, 0)).toBe(1)
    expect(at(19.9, 9.9)).toBe(0)
  })

  it('seeds from the search: the pins it would place, as placements', () => {
    const face = previewSplitFace(bar(), { ...params, seed: 'pins' })
    expect(face.autoError).toBe('')
    expect(face.auto.length).toBeGreaterThanOrEqual(1)
    for (const entry of face.auto) {
      expect(entry.kind).toBe('pins')
      expect(Number.isFinite(entry.uMm)).toBe(true)
      expect(Number.isFinite(entry.sizeMm)).toBe(true)
    }
    expect(previewSplitFace(bar(), params).auto).toEqual([])
  })

  it('gives each placement a verdict, worded by number, kind and position when it does not fit', () => {
    const face = previewSplitFace(bar(), {
      ...params,
      placements: [
        { kind: 'pins', uMm: 0, vMm: 0, sizeMm: 3 },
        { kind: 'pins', uMm: 19.8, vMm: 0, sizeMm: 3 },
      ],
    })
    expect(face.verdicts[0]).toEqual({ ok: true, reason: '' })
    expect(face.verdicts[1].ok).toBe(false)
    expect(face.verdicts[1].reason).toMatch(/^placement 2 \(pins at y = 19\.8, z = 0 mm\)/)
  })

  it('names two placements that would share a wall, though each fits alone', () => {
    const face = previewSplitFace(bar(), {
      ...params,
      placements: [
        { kind: 'pins', uMm: 0, vMm: 0, sizeMm: 4 },
        { kind: 'pins', uMm: 3, vMm: 0, sizeMm: 4 },
      ],
    })
    expect(face.verdicts.every((verdict) => verdict.ok)).toBe(true)
    expect(face.overall).toMatch(/overlaps/)
  })

  it('a screw boss whose bore would leave piece A before its far face keeps core-059’s refusal, by name and position', () => {
    const stepped = booleans.union(
      primitives.cuboid({ size: [200, 20, 20], center: [200, 0, 0] }),
      primitives.cuboid({ size: [101, 20, 4], center: [50.5, 0, 0] })
    )
    const face = previewSplitFace(stepped, {
      axis: 'x',
      offsetMm: 150,
      placements: [{ kind: 'screwBoss', uMm: 0, vMm: 4, sizeMm: 3 }],
    })
    expect(face.verdicts[0].ok).toBe(false)
    expect(face.verdicts[0].reason).toMatch(/placement 1 \(screwBoss at y = 0, z = 4 mm\).*screw bore.*piece A/)
  })

  it('refuses a cut outside the body, as the op does', () => {
    expect(() => previewSplitFace(bar(), { ...params, offsetMm: 400 })).toThrow(/outside the body/)
  })
})
