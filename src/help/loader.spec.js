// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { resolveSlug } from './loader.js'

const INDEX = {
  order: ['getting-started', 'booleans'],
  pages: [
    { slug: 'getting-started', title: 'Getting started', headings: [] },
    { slug: 'booleans', title: 'Combining shapes', headings: [] },
  ],
  aliases: { 'old-page': 'booleans' },
}

describe('resolveSlug (docs-028)', () => {
  it('returns a published page as itself', () => {
    expect(resolveSlug(INDEX, 'booleans')).toBe('booleans')
  })

  it('follows one alias to the page that replaced it', () => {
    expect(resolveSlug(INDEX, 'old-page')).toBe('booleans')
  })

  it('returns null for a slug that is neither a page nor an alias', () => {
    expect(resolveSlug(INDEX, 'no-such-page')).toBeNull()
  })

  it('tolerates an index written before aliases existed', () => {
    const { aliases, ...older } = INDEX
    expect(resolveSlug(older, 'old-page')).toBeNull()
    expect(resolveSlug(older, 'booleans')).toBe('booleans')
  })
})
