// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import AlignPositionIcon from './AlignPositionIcon.vue'

/**
 * `TODO/ui-086`: the moving block's x-extent against the target box, for each of the seven
 * positions, drawn horizontally on every row (− left, + right).
 *
 * @param {number} position
 * @param {boolean} [pointTarget]
 */
function extents(position, pointTarget = false) {
  const wrapper = mount(AlignPositionIcon, { props: { position, pointTarget } })
  /**
   * @param {string} part
   * @returns {[number, number]} x-extent
   */
  const extent = (part) => {
    const attributes = wrapper.get(`[data-part="${part}"]`).attributes()
    return [Number(attributes.x), Number(attributes.x) + Number(attributes.width)]
  }
  const target = wrapper.find('[data-part="target"]').exists() ? extent('target') : [12, 12]
  return { block: extent('moving'), target }
}

describe('AlignPositionIcon (TODO/ui-088)', () => {
  it('keeps neighbouring positions at least 2 units apart, in/half at least 3', () => {
    const xs = [0, 1, 2, 3, 4, 5, 6].map((p) => extents(p).block[0])
    for (let i = 1; i < 7; i += 1) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(2)
    expect(xs[2] - xs[1]).toBeGreaterThanOrEqual(3) // inside − vs half −
    expect(xs[5] - xs[4]).toBeGreaterThanOrEqual(3) // inside + vs half +
  })

  it('uses a 16-wide target and a 4-wide block with the documented x origins', () => {
    expect(extents(0).target).toEqual([4, 20])
    const expected = [0, 4, 8, 10, 12, 16, 20]
    expected.forEach((x, p) => {
      expect(extents(p).block[0]).toBeCloseTo(x, 6)
      expect(extents(p).block[1] - extents(p).block[0]).toBeCloseTo(4, 6)
    })
  })

  it('never lets the block poke past the target in an inside or half position', () => {
    const t = extents(0).target
    for (const p of [1, 2, 4, 5]) {
      const b = extents(p).block
      expect(b[0]).toBeGreaterThanOrEqual(t[0])
      expect(b[1]).toBeLessThanOrEqual(t[1])
    }
  })

  it('draws a dashed centre line at x = 12 against a box, solid against a point', () => {
    const box = mount(AlignPositionIcon, { props: { position: 2 } }).get('[data-part="centre"]').attributes()
    expect(Number(box.x1)).toBeCloseTo(12, 6)
    expect(Number(box.y1)).toBeCloseTo(2, 6)
    expect(Number(box.y2)).toBeCloseTo(22, 6)
    expect(box['stroke-dasharray']).toBe('2 1.5')
    const point = mount(AlignPositionIcon, { props: { position: 2, pointTarget: true } })
    expect(point.get('[data-part="centre"]').attributes('stroke-dasharray')).toBeUndefined()
    expect(point.find('[data-part="target"]').exists()).toBe(false)
  })
})

describe('AlignPositionIcon (TODO/ui-086)', () => {
  it('draws the seven positions beside, flush, straddling and centred against a box target', () => {
    const t = extents(0).target
    const centre = (t[0] + t[1]) / 2
    expect(extents(0).block[1]).toBeCloseTo(t[0], 6) // outside −: + face on the target's − face
    expect(extents(1).block[0]).toBeCloseTo(t[0], 6) // inside −: − faces flush
    expect(extents(2).block[1]).toBeCloseTo(centre, 6) // half −: + face on the centre
    const mid = extents(3).block
    expect((mid[0] + mid[1]) / 2).toBeCloseTo(centre, 6) // centre on centre
    expect(extents(4).block[0]).toBeCloseTo(centre, 6) // half +: − face on the centre
    expect(extents(5).block[1]).toBeCloseTo(t[1], 6) // inside +: + faces flush
    expect(extents(6).block[0]).toBeCloseTo(t[1], 6) // outside +: − face on the target's + face
  })

  it('draws the target identically in all seven', () => {
    for (let position = 1; position < 7; position += 1) expect(extents(position).target).toEqual(extents(0).target)
  })

  it('against World origin the target is a zero-width line and 0/2/5 and 1/4/6 render identical geometry', () => {
    const [a, b, c] = [0, 2, 5].map((p) => extents(p, true))
    expect(a.target[1] - a.target[0]).toBe(0)
    expect(b).toEqual(a)
    expect(c).toEqual(a)
    const [d, e, f] = [1, 4, 6].map((p) => extents(p, true))
    expect(e).toEqual(d)
    expect(f).toEqual(d)
    expect(d.block).not.toEqual(a.block)
  })
})
