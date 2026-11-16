// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { parseRowRefs, staleWaits } from './roadmap-waits.mjs'

const doc = (rows, tail = '') =>
  `## Next up\n\n| # | State |\n|---|---|\n${rows}\n\n## Held\n${tail}`

describe('parseRowRefs', () => {
  it('expands lists and ranges', () => {
    expect(parseRowRefs('14, 16–18')).toEqual([14, 16, 17, 18])
  })
})

describe('staleWaits', () => {
  it('passes when every referenced row exists', () => {
    expect(staleWaits(doc('| 14 | ▶ Ready |\n| 15 | ⏳ Waits on 14 |'))).toEqual([])
  })
  it('names a reference to a deleted row, including inside a range', () => {
    expect(staleWaits(doc('| 14 | ▶ Ready |\n| 15 | ⏳ Waits on 11–14 |')).length).toBe(3)
  })
  it('catches the Findings table copies and ignores prose', () => {
    const md = doc('| 14 | ▶ Ready |', '| x | ⏳ Waits on 11 (Next up row 14) |\n> `⏳ Waits on N` means')
    expect(staleWaits(md)).toHaveLength(1)
  })
})
