// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — a Node build script, not part of the app's typechecked `src/` (a spec imports it).
//
// The in-app help build (`TODO/ui-061`): renders `docs/*.md` to HTML fragments **at build time**,
// so no Markdown parser ever ships in the runtime bundle, and validates every link while doing so.
// Pure logic over the file system with no Vite import, so it is unit-tested in plain Node
// (`scripts/help-build.spec.js`) and shared by the Vite plugin (`scripts/vite-plugin-help.mjs`)
// and the topic-map rot guard (`src/help/topics.spec.js`).
//
// The renderer is deliberately small: it handles exactly the Markdown the docs use (headings,
// paragraphs, nested lists, tables, fences, blockquotes, emphasis, code spans, links, images) and
// nothing else, so there is no dependency to licence-check. The prose stays CC BY-SA 4.0; this file
// is code and is AGPL-3.0-or-later.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'

/**
 * Folders under `docs/` that are developer material, not end-user documentation. They are left
 * out of the app bundle on purpose: decision records weigh libraries against each other and
 * `montage/` is the build input for one README picture. Links into them render as plain text.
 */
export const EXCLUDED_DIRS = Object.freeze(['decisions', 'montage'])

/**
 * @typedef {{ level: number, text: string, id: string }} Heading
 * @typedef {{ kind: 'page', page: string, anchor?: string } | { kind: 'external', href: string } | { kind: 'text', warning?: string } | { kind: 'error', message: string } | { kind: 'asset', to: string }} ResolvedLink
 * @typedef {object} RenderContext
 * @property {string} [page] slug of the page being rendered
 * @property {(href: string, line: number) => ResolvedLink} [resolveLink]
 * @property {(src: string, line: number) => string | null} [resolveImage] bundled path, or `null` for a dead image
 * @typedef {{ html: string, headings: Heading[], title: string }} Rendered
 */

/** @param {string} text */
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Strip the inline markup a heading's text carries, leaving what a reader sees.
 *
 * @param {string} text
 */
function plainText(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:!?])/g, '$1$2')
}

/**
 * GitHub's heading-id rule, so the anchors the docs already link to (`#the-popovers-fields`)
 * keep resolving: lower-case, drop everything but letters, digits, hyphens, underscores and
 * spaces, then each space becomes a hyphen.
 *
 * @param {string} text heading text, markup allowed
 * @returns {string}
 */
export function slugify(text) {
  return plainText(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .replace(/ /g, '-')
}

/**
 * Inline markup to HTML.
 *
 * @param {string} source
 * @param {RenderContext} context
 * @param {number} line 1-based source line, for error messages
 * @returns {string}
 */
function renderInline(source, context, line) {
  /** @type {string[]} */
  const stash = []
  /** @param {string} html */
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`

  let text = source
  // Backslash escapes first, then code spans, so neither is re-read as markup.
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!|>~<])/g, (_, ch) => keep(escapeHtml(ch)))
  text = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _ticks, code) => keep(`<code>${escapeHtml(code.trim())}</code>`))
  // Autolinks <https://…>.
  text = text.replace(/<(https?:\/\/[^>\s]+)>/g, (_, url) =>
    keep(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`),
  )
  // Images before links (an image is a link with a bang).
  text = text.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g, (_, alt, src) => {
    const bundled = context.resolveImage ? context.resolveImage(src, line) : src
    if (bundled === null) return keep(`<span class="help-dead-image">${escapeHtml(alt)}</span>`)
    return keep(`<img src="${escapeHtml(bundled)}" alt="${escapeHtml(alt)}" loading="lazy">`)
  })
  text = text.replace(/\[((?:[^\]\\]|\\.)*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g, (_, label, href) => {
    const inner = renderInline(label, context, line)
    const resolved = context.resolveLink
      ? context.resolveLink(href, line)
      : /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)
        ? /** @type {ResolvedLink} */ ({ kind: 'external', href })
        : /** @type {ResolvedLink} */ ({ kind: 'text' })
    if (resolved.kind === 'external') {
      return keep(`<a href="${escapeHtml(resolved.href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`)
    }
    if (resolved.kind === 'page') {
      const anchor = resolved.anchor ? ` data-help-anchor="${escapeHtml(resolved.anchor)}"` : ''
      return keep(`<a href="#/help/${escapeHtml(resolved.page)}" data-help-page="${escapeHtml(resolved.page)}"${anchor}>${inner}</a>`)
    }
    if (resolved.kind === 'asset') {
      return keep(`<a href="${escapeHtml(resolved.to)}" target="_blank" rel="noopener">${inner}</a>`)
    }
    return keep(inner)
  })

  text = escapeHtml(text)
  text = text.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/(^|[^\w])__([^_]+?)__(?=[^\w]|$)/g, '$1<strong>$2</strong>')
  text = text.replace(/\*([^*\s][^*]*?)\*/g, '<em>$1</em>')
  text = text.replace(/(^|[^\w])_([^_\s][^_]*?)_(?=[^\w]|$)/g, '$1<em>$2</em>')
  text = text.replace(/~~([^~]+?)~~/g, '<del>$1</del>')
  return text.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)])
}

const FENCE_RE = /^\s*(```+|~~~+)/
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

/**
 * Split a table row on unescaped pipes.
 *
 * @param {string} row
 * @returns {string[]}
 */
function splitRow(row) {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  /** @type {string[]} */
  const cells = []
  let current = ''
  let inCode = false
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '|'
      i++
    } else if (ch === '`') {
      inCode = !inCode
      current += ch
    } else if (ch === '|' && !inCode) {
      cells.push(current.trim())
      current = ''
    } else current += ch
  }
  cells.push(current.trim())
  return cells
}

/**
 * Whether a line begins a block that ends a paragraph or lazy list continuation.
 *
 * @param {string} line
 */
function startsBlock(line) {
  return (
    HEADING_RE.test(line) ||
    FENCE_RE.test(line) ||
    /^\s*>/.test(line) ||
    /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    /^\s*\|/.test(line) ||
    /^\s*<!--/.test(line)
  )
}

/**
 * Collect the headings of a page (outside fences), with GitHub's duplicate-suffix rule.
 *
 * @param {string} markdown
 * @returns {Heading[]}
 */
function collectHeadings(markdown) {
  /** @type {Heading[]} */
  const headings = []
  const seen = new Map()
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (FENCE_RE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const m = HEADING_RE.exec(line)
    if (!m) continue
    const text = plainText(m[2])
    const base = slugify(m[2])
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    headings.push({ level: m[1].length, text, id: n === 0 ? base : `${base}-${n}` })
  }
  return headings
}

/**
 * Render a Markdown document to HTML.
 *
 * @param {string} markdown
 * @param {RenderContext} [context]
 * @returns {Rendered}
 */
export function renderMarkdown(markdown, context = {}) {
  const headings = collectHeadings(markdown)
  let headingIndex = 0
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')

  /**
   * @param {string[]} block
   * @param {number} firstLine 1-based source line of block[0]
   * @returns {string}
   */
  function blocks(block, firstLine) {
    /** @type {string[]} */
    const out = []
    let i = 0
    const at = () => firstLine + i
    while (i < block.length) {
      const line = block[i]
      if (line.trim() === '') {
        i++
        continue
      }
      // HTML comments (the SPDX marker) leave no trace in the page.
      if (/^\s*<!--/.test(line)) {
        while (i < block.length && !block[i].includes('-->')) i++
        i++
        continue
      }
      const fence = FENCE_RE.exec(line)
      if (fence) {
        const marker = fence[1]
        /** @type {string[]} */
        const code = []
        i++
        while (i < block.length && !block[i].trim().startsWith(marker)) code.push(block[i++])
        i++
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        continue
      }
      const heading = HEADING_RE.exec(line)
      if (heading) {
        const info = headings[headingIndex++]
        const level = heading[1].length
        out.push(`<h${level} id="${escapeHtml(info.id)}">${renderInline(heading[2], context, at())}</h${level}>`)
        i++
        continue
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push('<hr>')
        i++
        continue
      }
      if (/^\s*>/.test(line)) {
        const start = i
        /** @type {string[]} */
        const inner = []
        while (i < block.length && /^\s*>/.test(block[i])) inner.push(block[i++].replace(/^\s*> ?/, ''))
        out.push(`<blockquote>${blocks(inner, firstLine + start)}</blockquote>`)
        continue
      }
      if (/^\s*\|/.test(line) && i + 1 < block.length && TABLE_SEP_RE.test(block[i + 1])) {
        const head = splitRow(line)
        const startLine = at()
        i += 2
        /** @type {string[][]} */
        const rows = []
        while (i < block.length && /^\s*\|/.test(block[i])) rows.push(splitRow(block[i++]))
        const th = head.map((c) => `<th>${renderInline(c, context, startLine)}</th>`).join('')
        const body = rows
          .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c, context, startLine)}</td>`).join('')}</tr>`)
          .join('')
        out.push(`<div class="help-table"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`)
        continue
      }
      const list = LIST_RE.exec(line)
      if (list) {
        const baseIndent = list[1].length
        const ordered = /\d/.test(list[2])
        /** @type {{ lines: string[], first: number }[]} */
        const items = []
        while (i < block.length) {
          const m = LIST_RE.exec(block[i])
          if (m && m[1].length === baseIndent && /\d/.test(m[2]) === ordered) {
            /** @type {string[]} */
            const body = [m[3]]
            const first = firstLine + i
            i++
            while (i < block.length) {
              const next = block[i]
              if (next.trim() === '') {
                // A blank line stays in the item only if the item continues, indented, after it.
                let j = i
                while (j < block.length && block[j].trim() === '') j++
                if (j < block.length && /^\s+\S/.test(block[j]) && block[j].search(/\S/) > baseIndent && !(LIST_RE.test(block[j]) && block[j].search(/\S/) <= baseIndent)) {
                  for (; i < j; i++) body.push('')
                  continue
                }
                break
              }
              const nextIndent = next.search(/\S/)
              const nextList = LIST_RE.exec(next)
              if (nextList && nextIndent <= baseIndent) break
              if (nextIndent > baseIndent) {
                body.push(next.slice(Math.min(nextIndent, baseIndent + 2)))
                i++
                continue
              }
              // Lazy continuation of the item's paragraph (an image under a step, say).
              if (startsBlock(next)) break
              body.push(next)
              i++
            }
            items.push({ lines: body, first })
          } else break
        }
        const tag = ordered ? 'ol' : 'ul'
        const rendered = items.map((item) => {
          const inner = blocks(item.lines, item.first)
          // Tight lists: a leading paragraph is not wrapped, so a step reads as one line of text.
          return `<li>${inner.replace(/^<p>([\s\S]*?)<\/p>/, '$1')}</li>`
        })
        out.push(`<${tag}>${rendered.join('')}</${tag}>`)
        continue
      }
      // A paragraph: everything up to the next blank line or block start.
      const start = at()
      /** @type {string[]} */
      const para = [line]
      i++
      while (i < block.length && block[i].trim() !== '' && !startsBlock(block[i]) && !LIST_RE.test(block[i])) para.push(block[i++])
      out.push(`<p>${renderInline(para.join('\n').trim(), context, start)}</p>`)
    }
    return out.join('\n')
  }

  const html = blocks(lines, 1)
  const first = headings.find((h) => h.level === 1) ?? headings[0]
  return { html, headings, title: first ? first.text : '' }
}

/**
 * @typedef {{ slug: string, file: string, title: string, headings: Heading[], html: string }} HelpPage
 * @typedef {{ from: string, to: string }} HelpAsset
 * @typedef {{ pages: Record<string, HelpPage>, order: string[], assets: HelpAsset[], errors: string[], warnings: string[] }} HelpBuild
 */

/**
 * Every Markdown file directly under `docsDir` (not in an excluded folder).
 *
 * @param {string} docsDir
 * @returns {string[]} file names
 */
function listPages(docsDir) {
  return readdirSync(docsDir)
    .filter((name) => name.endsWith('.md') && statSync(join(docsDir, name)).isFile())
    .sort()
}

/**
 * Render the whole documentation set and check it.
 *
 * Errors (a dead image, a dead page link, a dead anchor) make the build fail; warnings (a link
 * into developer material, which renders as plain text) do not.
 *
 * @param {{ docsDir: string }} options
 * @returns {HelpBuild}
 */
export function buildHelp({ docsDir }) {
  /** @type {string[]} */
  const errors = []
  /** @type {string[]} */
  const warnings = []
  /** @type {Map<string, HelpAsset>} */
  const assets = new Map()
  const files = listPages(docsDir)
  /** @type {Record<string, string>} */
  const sources = {}
  /** @type {Record<string, Heading[]>} */
  const headingsByPage = {}
  for (const file of files) {
    const slug = file.replace(/\.md$/, '').toLowerCase()
    sources[slug] = readFileSync(join(docsDir, file), 'utf-8')
    headingsByPage[slug] = collectHeadings(sources[slug])
  }

  /** @type {Record<string, HelpPage>} */
  const pages = {}
  for (const file of files) {
    const slug = file.replace(/\.md$/, '').toLowerCase()
    /** @param {number} line */
    const where = (line) => `${posix.join('docs', file)}:${line}`

    /** @type {RenderContext} */
    const context = {
      page: slug,
      resolveImage(src, line) {
        const clean = src.replace(/[#?].*$/, '')
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) return src
        const rel = posix.normalize(clean)
        const abs = join(docsDir, rel)
        if (rel.startsWith('..') || !existsSync(abs) || !statSync(abs).isFile()) {
          errors.push(`${where(line)}: dead image link ${src}`)
          return null
        }
        const to = posix.join('img', rel)
        assets.set(to, { from: abs, to })
        return to
      },
      resolveLink(href, line) {
        if (/^(?:https?:|mailto:)/i.test(href)) return { kind: 'external', href }
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return { kind: 'text' }
        const [pathPart, anchor] = href.split('#')
        const target = pathPart === '' ? `${slug}.md` : posix.normalize(pathPart)
        /** @type {string | undefined} */
        let anchorId = anchor
        if (anchorId !== undefined) {
          try {
            anchorId = decodeURIComponent(anchorId)
          } catch {
            // keep the raw fragment
          }
        }
        // Developer material: outside docs/, or inside an excluded folder.
        const top = target.split('/')[0]
        if (target.startsWith('..') || EXCLUDED_DIRS.includes(top)) {
          warnings.push(`${where(line)}: link to developer material ${href} is shown as plain text`)
          return { kind: 'text' }
        }
        if (!target.endsWith('.md')) {
          const abs = join(docsDir, target)
          if (existsSync(abs) && statSync(abs).isFile()) {
            const to = posix.join('img', target)
            assets.set(to, { from: abs, to })
            return { kind: 'asset', to }
          }
          errors.push(`${where(line)}: dead link ${href}`)
          return { kind: 'text' }
        }
        const targetSlug = target.replace(/\.md$/, '').toLowerCase()
        if (!(targetSlug in sources)) {
          errors.push(`${where(line)}: dead link ${href} (no such page ${target})`)
          return { kind: 'text' }
        }
        if (anchorId !== undefined && anchorId !== '' && !headingsByPage[targetSlug].some((h) => h.id === anchorId)) {
          errors.push(`${where(line)}: dead anchor ${href} (no heading #${anchorId} in ${target})`)
        }
        return { kind: 'page', page: targetSlug, anchor: anchorId || undefined }
      },
    }

    const rendered = renderMarkdown(sources[slug], context)
    pages[slug] = { slug, file, title: rendered.title || slug, headings: rendered.headings, html: rendered.html }
  }

  // Contents order: the docs index's own order (it is the sidebar), then anything it forgot.
  /** @type {string[]} */
  const order = []
  // Getting started is where the Help entry opens, so it leads; the docs index follows it.
  if ('getting-started' in pages) order.push('getting-started')
  if ('readme' in pages) order.push('readme')
  const readme = sources.readme ?? ''
  for (const m of readme.matchAll(/\]\(\s*(?:\.\/)?([\w-]+)\.md(?:#[^)]*)?\)/g)) {
    const slug = m[1].toLowerCase()
    if (slug in pages && !order.includes(slug)) order.push(slug)
  }
  for (const slug of Object.keys(pages)) if (!order.includes(slug)) order.push(slug)

  return { pages, order, assets: [...assets.values()], errors, warnings }
}

/**
 * The small JSON the Help sheet loads first: titles, order and each page's `##` headings.
 *
 * @param {HelpBuild} build
 */
export function helpIndex(build) {
  return {
    order: build.order,
    pages: build.order.map((slug) => ({
      slug,
      title: build.pages[slug].title,
      headings: build.pages[slug].headings.filter((h) => h.level === 2).map((h) => ({ id: h.id, text: h.text })),
    })),
  }
}
