// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { parseRowRefs, staleCounts, staleWaits } from './roadmap-waits.mjs'

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

describe('staleCounts', () => {
  const build = (queued, readyIds, tableIds) =>
    `## Next up — recommended TODOs\n\n| # | State | Milestone | Task |\n|---|---|---|---|\n` +
    readyIds.map((id, i) => `| ${i + 1} | ▶ Ready | \`FIND\` | [\`${id}\`](x.md) t |`).join('\n') +
    `\n| 9 | Closed by owner | \`M19\` | [\`testing-037\`](y.md) t |\n` +
    `| [Findings](#findings-open-rows) | ${queued} queued (all ready) | q |\n\n## Held\n\n` +
    `### Findings (open rows)\n\n| id | Task |\n|---|---|\n` +
    tableIds.map((id) => `| \`${id}\` | t |`).join('\n') +
    `\n\n## Open work outside any milestone\n`
  it('passes when counts and ids agree, ignoring a closed row', () => {
    expect(staleCounts(build(2, ['ui-1', 'ui-2'], ['ui-1', 'ui-2']))).toEqual([])
  })
  it('catches a summary count left one too high after a row closed', () => {
    expect(staleCounts(build(3, ['ui-1', 'ui-2'], ['ui-1', 'ui-2']))).toHaveLength(1)
  })
  it('catches a Findings row with no ready Next up row, and the reverse', () => {
    expect(staleCounts(build(2, ['ui-1', 'ui-2'], ['ui-1', 'ui-3']))).toHaveLength(2)
  })
})
