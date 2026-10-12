// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { KNOWN_ORIGINS, originChipText } from './origin.js'

describe('originChipText — the History origin chip never echoes file text (TODO/ai-009)', () => {
  it('names the origins this build writes', () => {
    expect(originChipText('local')).toBe('by you')
    expect(originChipText('ai')).toBe('via ai')
    expect(originChipText('mcp')).toBe('via mcp')
    expect(originChipText('remote')).toBe('via remote')
    expect(originChipText('merge')).toBe('via merge')
    expect([...KNOWN_ORIGINS].sort()).toEqual(['ai', 'local', 'mcp', 'merge', 'programmatic', 'remote'])
  })

  it('any other origin a file declares reads as one fixed phrase, whatever it says', () => {
    for (const hostile of ['</span><img src=x onerror=alert(1)>', 'you (verified)', 'x'.repeat(10_000), 'MCP', ' mcp', '']) {
      expect(originChipText(hostile)).toBe('via another program')
    }
  })
})
