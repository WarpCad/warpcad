// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { PlacementRefusal, assertSeparate } from './joint.placements.js'

/** @typedef {import('./joint.pins.js').Connector} Connector */

/** @type {(index: number, kind: string, at: { uMm: number, vMm: number } | null, searched?: boolean) => string} */
const label = (index, kind, at, searched = false) =>
  at === null ? `placement ${index + 1} (${kind})` : `placement ${index + 1} (${kind}${searched ? ' found by search' : ''} at ${at.uMm}, ${at.vMm})`

/**
 * @param {'search' | 'placed'} source
 * @param {number} uMm
 * @param {number} radiusMm
 * @returns {Connector}
 */
const pin = (source, uMm, radiusMm) => ({
  kind: 'pins',
  source,
  uMm,
  vMm: 0,
  sizeMm: 2 * radiusMm,
  footprint: { shape: 'circle', uMm, vMm: 0, radiusMm },
})

describe('assertSeparate — overlapping connectors are refused, whoever placed them', () => {
  it('a searched pin over a hand-placed one is refused by name, saying the search put it there', () => {
    const entries = [
      { index: 0, connector: pin('placed', 0, 3) },
      { index: 1, connector: pin('search', 4, 3) },
    ]
    expect(() => assertSeparate(entries, label)).toThrow(PlacementRefusal)
    expect(() => assertSeparate(entries, label)).toThrow(
      /placement 2 \(pins found by search at 4, 0\) overlaps placement 1 \(pins at 0, 0\)/
    )
  })

  it('two from the same search entry are named by that entry; walls exactly touching are apart', () => {
    expect(() =>
      assertSeparate(
        [
          { index: 0, connector: pin('search', 0, 3) },
          { index: 0, connector: pin('search', 5, 3) },
        ],
        label
      )
    ).toThrow(/placement 1 \(pins found by search at 5, 0\) overlaps placement 1/)
    expect(() =>
      assertSeparate(
        [
          { index: 0, connector: pin('search', 0, 3) },
          { index: 1, connector: pin('placed', 6, 3) },
        ],
        label
      )
    ).not.toThrow()
  })
})
