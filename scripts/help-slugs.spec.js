// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { checkSlugLock, helpIndex } from './help-build.mjs'

/** A two-page build, shaped like `buildHelp`'s result for `helpIndex`. */
const BUILD = {
  order: ['getting-started', 'booleans'],
  pages: {
    'getting-started': { slug: 'getting-started', title: 'Getting started', headings: [] },
    booleans: { slug: 'booleans', title: 'Combining shapes', headings: [{ level: 2, id: 'x', text: 'X' }] },
  },
}
const TOPICS = ['boolean', 'align']

describe('helpIndex metadata (docs-028)', () => {
  it('says which build produced it, and keeps the existing fields', () => {
    const index = helpIndex(BUILD, { version: '1.2.3', commit: 'abc1234', aliases: { old: 'booleans' } })
    expect(index.schema).toBe(1)
    expect(index.version).toBe('1.2.3')
    expect(index.commit).toBe('abc1234')
    expect(index.aliases).toEqual({ old: 'booleans' })
    expect(index.order).toEqual(['getting-started', 'booleans'])
    expect(index.pages[1]).toEqual({ slug: 'booleans', title: 'Combining shapes', headings: [{ id: 'x', text: 'X' }] })
  })

  it('defaults the metadata when none is given, so an unchanged caller still works', () => {
    const index = helpIndex(BUILD)
    expect(index.schema).toBe(1)
    expect(index.aliases).toEqual({})
    expect(index.version).toBeUndefined()
  })
})

describe('checkSlugLock (docs-028)', () => {
  it('passes when the lockfile lists every page and topic and has no stale slugs', () => {
    const lock = { slugs: ['getting-started', 'booleans', 'boolean', 'align'], aliases: {} }
    expect(checkSlugLock({ pageSlugs: ['getting-started', 'booleans'], topicIds: TOPICS }, lock)).toEqual([])
  })

  it('fails a page or topic that is missing from the lockfile, and says how to fix it', () => {
    const lock = { slugs: ['getting-started', 'boolean', 'align'], aliases: {} }
    const errors = checkSlugLock({ pageSlugs: ['getting-started', 'booleans'], topicIds: TOPICS }, lock)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/"booleans" is not in docs\/help-slugs\.json/)
    expect(errors[0]).toMatch(/npm run help:slugs/)
  })

  it('fails a published slug that is gone, unless an alias covers it', () => {
    const lock = { slugs: ['getting-started', 'booleans', 'boolean', 'align', 'old-page'], aliases: {} }
    const errors = checkSlugLock({ pageSlugs: ['getting-started', 'booleans'], topicIds: TOPICS }, lock)
    expect(errors.some((e) => /"old-page" was published but is gone/.test(e))).toBe(true)
  })

  it('passes a removed slug that an alias points at a live page', () => {
    const lock = {
      slugs: ['getting-started', 'booleans', 'boolean', 'align', 'old-page'],
      aliases: { 'old-page': 'booleans' },
    }
    expect(checkSlugLock({ pageSlugs: ['getting-started', 'booleans'], topicIds: TOPICS }, lock)).toEqual([])
  })

  it('fails an alias whose target is not a page or topic', () => {
    const lock = { slugs: ['getting-started', 'booleans', 'boolean', 'align', 'old-page'], aliases: { 'old-page': 'nowhere' } }
    const errors = checkSlugLock({ pageSlugs: ['getting-started', 'booleans'], topicIds: TOPICS }, lock)
    expect(errors.some((e) => /alias "old-page" points at "nowhere"/.test(e))).toBe(true)
  })

  it('fails an alias that points at another alias', () => {
    const lock = {
      slugs: ['getting-started', 'booleans', 'boolean', 'align', 'a', 'b'],
      aliases: { a: 'b', b: 'booleans' },
    }
    const errors = checkSlugLock({ pageSlugs: ['getting-started', 'booleans'], topicIds: TOPICS }, lock)
    expect(errors.some((e) => /alias "a" points at another alias/.test(e))).toBe(true)
  })

  it('fails an alias that shadows a live page or topic', () => {
    const lock = { slugs: ['getting-started', 'booleans', 'boolean', 'align'], aliases: { booleans: 'getting-started' } }
    const errors = checkSlugLock({ pageSlugs: ['getting-started', 'booleans'], topicIds: TOPICS }, lock)
    expect(errors.some((e) => /alias "booleans" shadows/.test(e))).toBe(true)
  })
})
