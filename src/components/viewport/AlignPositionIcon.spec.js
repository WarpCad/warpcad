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
  return { block: extent('moving'), target: extent('target') }
}

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
