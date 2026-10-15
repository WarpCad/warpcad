// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { buildHelp, EXCLUDED_DIRS, renderMarkdown, slugify } from './help-build.mjs'

/** @type {string[]} */
const made = []

/**
 * A throwaway docs folder.
 *
 * @param {Record<string, string>} files path under the folder -> contents
 * @returns {string}
 */
function docs(files) {
  const dir = mkdtempSync(join(tmpdir(), 'help-build-'))
  made.push(dir)
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return dir
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('slugify (GitHub heading ids, so existing in-page links keep working)', () => {
  it('lowercases, drops punctuation and joins words with hyphens', () => {
    expect(slugify("The popover's fields")).toBe('the-popovers-fields')
    expect(slugify('A worked example: Enlarge')).toBe('a-worked-example-enlarge')
  })

  it('keeps one hyphen per space, so a dropped dash leaves a double hyphen', () => {
    expect(slugify('You need exactly 2 shapes selected — not "2 or more"')).toBe(
      'you-need-exactly-2-shapes-selected--not-2-or-more',
    )
  })

  it('ignores inline markup', () => {
    expect(slugify('The `Align` **tool**')).toBe('the-align-tool')
  })
})

describe('renderMarkdown', () => {
  it('gives every heading an id and reports it', () => {
    const out = renderMarkdown('# Title\n\n## First part\n\ntext\n\n## First part\n')
    expect(out.html).toContain('<h1 id="title">Title</h1>')
    expect(out.html).toContain('<h2 id="first-part">First part</h2>')
    expect(out.html).toContain('<h2 id="first-part-1">First part</h2>')
    expect(out.headings.map((h) => h.id)).toEqual(['title', 'first-part', 'first-part-1'])
  })

  it('renders emphasis, code and escapes raw angle brackets', () => {
    const out = renderMarkdown('**bold** and *soft* and `a < b` and <script>alert(1)</script>\n')
    expect(out.html).toContain('<strong>bold</strong>')
    expect(out.html).toContain('<em>soft</em>')
    expect(out.html).toContain('<code>a &lt; b</code>')
    expect(out.html).not.toContain('<script>')
  })

  it('renders tables, nested lists and fenced code', () => {
    const out = renderMarkdown(
      ['| A | B |', '|---|---|', '| 1 | 2 |', '', '- one', '  - nested', '- two', '', '1. a', '2. b', '', '```', 'x < y', '```', ''].join('\n'),
    )
    expect(out.html).toContain('<table>')
    expect(out.html).toContain('<th>A</th>')
    expect(out.html).toContain('<td>2</td>')
    expect(out.html).toMatch(/<ul>\s*<li>one\s*<ul>\s*<li>nested<\/li>\s*<\/ul>\s*<\/li>\s*<li>two<\/li>\s*<\/ul>/)
    expect(out.html).toContain('<ol>')
    expect(out.html).toContain('<pre><code>x &lt; y')
  })

  it('drops HTML comments (the SPDX marker)', () => {
    expect(renderMarkdown('hi\n\n<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->\n').html).not.toContain('SPDX')
  })

  it('rewrites a docs-page link to an in-sheet link and an image to a lazy bundled path', () => {
    const out = renderMarkdown('[Booleans](booleans.md#which-one) ![alt text](./screenshots/a.png)\n', {
      page: 'x',
      resolveLink: (href) => ({ kind: 'page', page: 'booleans', anchor: href.split('#')[1] }),
      resolveImage: (src) => `img/${src.replace('./', '')}`,
    })
    expect(out.html).toContain('data-help-page="booleans"')
    expect(out.html).toContain('data-help-anchor="which-one"')
    expect(out.html).toContain('<img src="img/screenshots/a.png" alt="alt text" loading="lazy">')
  })
})

describe('buildHelp', () => {
  it('renders each page, orders by the README, and lists headings in the index', () => {
    const dir = docs({
      'README.md': '# Docs\n\n- [Second](second.md)\n- [First](first.md)\n',
      'first.md': '# First page\n\n## Part one\n\nhello\n',
      'second.md': '# Second page\n\nsee [first](first.md#part-one)\n',
    })
    const out = buildHelp({ docsDir: dir })
    expect(out.errors).toEqual([])
    expect(out.order).toEqual(['readme', 'second', 'first'])
    expect(out.pages.first.title).toBe('First page')
    expect(out.pages.first.headings.map((h) => h.id)).toContain('part-one')
    expect(out.pages.second.html).toContain('data-help-page="first"')
  })

  it('leaves developer material out of the bundle and says so', () => {
    expect(EXCLUDED_DIRS).toEqual(expect.arrayContaining(['decisions', 'montage']))
    const dir = docs({
      'README.md': '# Docs\n',
      'decisions/kernel.md': '# Kernel\n',
      'montage/notes.md': '# Montage\n',
    })
    const out = buildHelp({ docsDir: dir })
    expect(Object.keys(out.pages)).toEqual(['readme'])
  })

  it('turns a link into excluded developer material into plain text with a warning, not a dead link', () => {
    const dir = docs({ 'README.md': '# Docs\n\nsee [the kernel](decisions/kernel.md)\n', 'decisions/kernel.md': '# K\n' })
    const out = buildHelp({ docsDir: dir })
    expect(out.errors).toEqual([])
    expect(out.pages.readme.html).not.toContain('decisions/kernel.md')
    expect(out.pages.readme.html).toContain('the kernel')
    expect(out.warnings.join('\n')).toContain('decisions/kernel.md')
  })

  it('fails on a dead image link', () => {
    const dir = docs({ 'README.md': '# Docs\n\n![gone](screenshots/nope.png)\n' })
    const out = buildHelp({ docsDir: dir })
    expect(out.errors.join('\n')).toMatch(/README\.md:3.*screenshots\/nope\.png/)
  })

  it('fails on a dead page link and a dead anchor', () => {
    const dir = docs({
      'README.md': '# Docs\n\n[a](missing.md) and [b](other.md#nope) and [c](#nowhere)\n',
      'other.md': '# Other\n',
    })
    const out = buildHelp({ docsDir: dir })
    const text = out.errors.join('\n')
    expect(text).toContain('missing.md')
    expect(text).toContain('other.md#nope')
    expect(text).toContain('#nowhere')
  })

  it('collects the pictures it needs, once each, under img/', () => {
    const dir = docs({
      'README.md': '# Docs\n\n![a](screenshots/a.png) ![a again](screenshots/a.png) ![m](media/m.gif)\n',
      'screenshots/a.png': 'png',
      'media/m.gif': 'gif',
    })
    const out = buildHelp({ docsDir: dir })
    expect(out.errors).toEqual([])
    expect(out.assets.map((a) => a.to).sort()).toEqual(['img/media/m.gif', 'img/screenshots/a.png'])
    expect(out.pages.readme.html).toContain('src="img/screenshots/a.png"')
  })
})
