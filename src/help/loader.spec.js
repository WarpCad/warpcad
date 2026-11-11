// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest'

import { helpBaseDefine, NATIVE_HELP_BASE } from '../../scripts/native-build.mjs'
import { helpUrl, loadHelpIndex, loadHelpPage, resetHelpCache, resolveSlug, setHelpFetch } from './loader.js'

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

describe('loadHelpPage picture paths (docs-030)', () => {
  it('points both the <img src> and the dark <source srcset> into the bundled folder', async () => {
    const html =
      '<picture><source srcset="img/screenshots/a.dark.png" media="(prefers-color-scheme: dark)"><img src="img/screenshots/a.png" alt="a" loading="lazy"></picture>'
    setHelpFetch(async () => ({ ok: true, text: async () => html }))
    resetHelpCache()
    try {
      const out = await loadHelpPage('page')
      expect(out).toContain(`srcset="${helpUrl('img/')}screenshots/a.dark.png"`)
      expect(out).toContain(`src="${helpUrl('img/')}screenshots/a.png"`)
    } finally {
      setHelpFetch()
      resetHelpCache()
    }
  })
})

describe('the help origin (ui-119)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setHelpFetch()
    resetHelpCache()
  })

  it('the native mode bakes in https://app.warpcad.com/help/, and the web build bakes in nothing', () => {
    expect(NATIVE_HELP_BASE).toBe('https://app.warpcad.com/help/')
    expect(helpBaseDefine('native')).toBe(JSON.stringify(NATIVE_HELP_BASE))
    expect(helpBaseDefine('production')).toBe('""')
    expect(helpBaseDefine('development')).toBe('""')
  })

  it('a native build fetches the index, pages and pictures from app.warpcad.com', async () => {
    vi.stubGlobal('__HELP_BASE__', NATIVE_HELP_BASE)
    /** @type {string[]} */
    const requested = []
    setHelpFetch(async (url) => {
      requested.push(url)
      return { ok: true, text: async () => '<img src="img/screenshots/a.png" alt="a">' }
    })
    expect(helpUrl('index.json')).toBe('https://app.warpcad.com/help/index.json')
    const out = await loadHelpPage('booleans')
    expect(requested).toEqual(['https://app.warpcad.com/help/booleans.html'])
    expect(out).toContain('src="https://app.warpcad.com/help/img/screenshots/a.png"')
  })

  it('the web build is unchanged: help/ under the app base', () => {
    expect(helpUrl('index.json')).toBe('/help/index.json')
    expect(helpUrl('img/a.png')).toBe('/help/img/a.png')
    vi.stubGlobal('__HELP_BASE__', '')
    expect(helpUrl('booleans.html')).toBe('/help/booleans.html')
  })

  it('a failed fetch leaves nothing cached, so Retry fetches again', async () => {
    let online = false
    let calls = 0
    setHelpFetch(async () => {
      calls++
      if (!online) throw new TypeError('Failed to fetch')
      return { ok: true, text: async () => '<p>back</p>' }
    })
    await expect(loadHelpPage('booleans')).rejects.toThrow()
    await expect(loadHelpIndex()).rejects.toThrow()
    online = true
    await expect(loadHelpPage('booleans')).resolves.toBe('<p>back</p>')
    setHelpFetch(async () => {
      calls++
      return { ok: true, text: async () => JSON.stringify(INDEX) }
    })
    await expect(loadHelpIndex()).resolves.toEqual(INDEX)
    expect(calls).toBe(4)
  })
})
