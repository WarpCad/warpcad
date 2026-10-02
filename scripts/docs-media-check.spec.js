// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { findImageRefs, findClaimedStills, checkDocsMedia } from './docs-media-check.mjs'

describe('findImageRefs', () => {
  it('returns the relative target, alt text and 1-based line of each image', () => {
    const md = 'intro\n\n![A cube](./screenshots/cube.png) and\n![](media/x.gif)\n'
    expect(findImageRefs(md)).toEqual([
      { alt: 'A cube', target: './screenshots/cube.png', line: 3 },
      { alt: '', target: 'media/x.gif', line: 4 },
    ])
  })

  it('ignores remote and data URLs, and plain links', () => {
    const md = '![a](https://x.test/a.png) ![b](data:image/png;base64,AAA) [c](./c.png)'
    expect(findImageRefs(md)).toEqual([])
  })

  it('drops a trailing title and any query/fragment', () => {
    expect(findImageRefs('![a](./s/a.png "Title")')[0].target).toBe('./s/a.png')
    expect(findImageRefs('![a](./s/a.png#x)')[0].target).toBe('./s/a.png')
  })

  it('skips images shown as inline code', () => {
    expect(findImageRefs('write `![alt](./s/<name>.png)` like so')).toEqual([])
  })

  it('skips images inside fenced code blocks', () => {
    const md = '```md\n![a](./s/a.png)\n```\n![b](./s/b.png)'
    expect(findImageRefs(md).map((r) => r.target)).toEqual(['./s/b.png'])
  })
})

describe('findClaimedStills', () => {
  it('collects png names from shot() and toHaveScreenshot() literals', () => {
    const src = "await shot(page, 'a.png')\nawait expect(p).toHaveScreenshot(\"b.png\", {})"
    expect([...findClaimedStills(src)].sort()).toEqual(['a.png', 'b.png'])
  })
})

describe('checkDocsMedia', () => {
  const base = {
    refs: [{ file: 'docs/a.md', alt: 'A', target: 'docs/screenshots/a.png', line: 3 }],
    files: ['docs/screenshots/a.png'],
    claimedStills: new Set(['a.png']),
    manifest: {},
    hashes: {},
  }

  it('passes a consistent set', () => {
    expect(checkDocsMedia(base)).toEqual({ errors: [], warnings: [] })
  })

  it('names the page and line of a dead link', () => {
    const r = checkDocsMedia({ ...base, files: [] })
    expect(r.errors.some((e) => e.includes('docs/a.md:3') && e.includes('docs/screenshots/a.png'))).toBe(true)
  })

  it('flags an image with no alt text', () => {
    const r = checkDocsMedia({ ...base, refs: [{ ...base.refs[0], alt: ' ' }] })
    expect(r.errors.some((e) => e.includes('alt text'))).toBe(true)
  })

  it('flags an orphan and names the spec that should show it', () => {
    const r = checkDocsMedia({ ...base, refs: [] })
    expect(r.errors.some((e) => e.includes('orphan') && e.includes('docs/screenshots/a.png'))).toBe(true)
  })

  it('flags a still no docs spec claims', () => {
    const r = checkDocsMedia({ ...base, claimedStills: new Set() })
    expect(r.errors.some((e) => e.includes('no e2e/docs') && e.includes('a.png'))).toBe(true)
  })

  it('flags a gif missing from the manifest', () => {
    const r = checkDocsMedia({
      ...base,
      refs: [{ file: 'docs/a.md', alt: 'M', target: 'docs/media/m.gif', line: 1 }],
      files: ['docs/media/m.gif'],
    })
    expect(r.errors.some((e) => e.includes('manifest') && e.includes('m.gif'))).toBe(true)
  })

  it('reports a stale movie as a warning locally and an error in CI', () => {
    const input = {
      ...base,
      refs: [{ file: 'docs/a.md', alt: 'M', target: 'docs/media/m.gif', line: 1 }],
      files: ['docs/media/m.gif'],
      manifest: { 'm.gif': { spec: 'e2e/docs/m.docs.js', specHash: 'old' } },
      hashes: { 'e2e/docs/m.docs.js': 'new' },
    }
    const local = checkDocsMedia(input)
    expect(local.errors).toEqual([])
    expect(local.warnings.some((w) => w.includes('stale') && w.includes('m.gif'))).toBe(true)
    const ci = checkDocsMedia({ ...input, ci: true })
    expect(ci.errors.some((e) => e.includes('stale'))).toBe(true)
  })
})
