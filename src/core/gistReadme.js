// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `README.md` a published gist carries (`TODO/io-017`): a short page github.com shows a
 * reader first, regenerated on every publish so nobody edits it by hand and loses the edit.
 *
 * Everything that comes from the project — its name, its note, its body names — is **data,
 * never markup and never instructions**. Each is flattened to one line (the note keeps its
 * lines, each quoted), stripped of control and bidi-override characters, capped, and escaped so
 * that a body named `[x](javascript:…)` or `<img onerror>` reaches GitHub as inert text.
 *
 * What is deliberately **not** here: standing instructions, intent text and the AI
 * conversation. They are in the `.ndjson` the owner chose to publish, but the README is the
 * part that gets skimmed and indexed, so it carries the minimum. {@link GistReadmeInput} has no
 * field that could hold them, and the function reads only the fields it names.
 *
 * The one exception is the **prompts** that made the project (`TODO/io-022`): the owner decided
 * they belong in the README, under **How this was made**, so a reader on github.com sees the
 * requests. This reverses the exclusion above for prompts only, on purpose
 * (`docs/decisions/gist-storage.md`). Each prompt is data like a body name: capped, cleaned,
 * escaped, and an `@name` is broken so it notifies nobody.
 *
 * Pure and deterministic: the same input gives the same text, in any time zone.
 *
 * @module core/gistReadme
 */

import { gistLink, isGistRawUrl } from './gistLink.js'
import { DEFAULT_SHARE_NAME } from './shareLink.js'

/** Longest project name kept, in code points. */
export const MAX_NAME_CHARS = 120
/** Longest note kept, in code points. */
export const MAX_NOTE_CHARS = 1000
/** Longest body name kept, in code points. */
export const MAX_BODY_NAME_CHARS = 80
/** Most body names listed; the rest are counted ("and N more"). */
export const MAX_LISTED_BODIES = 500
/** Most prompts listed under **How this was made**; the rest are counted ("and N more"). */
export const MAX_LISTED_PROMPTS = 20
/** Most characters of prompt text the section carries in all, the cut prompt ending in `…`. */
export const MAX_PROMPT_CHARS = 6000
/** Most body names listed under one prompt's **Made** line. */
const MAX_PROMPT_BODIES = 20

const FOOTER = 'Made with WarpCad. This page is generated; edits are overwritten when the project is published again.'
const UNNAMED = '(unnamed)'

/**
 * The README's whole input. Nothing else is read, so nothing else can leak into it.
 *
 * @typedef {object} GistReadmeInput
 * @property {string} [name] The project's name; blank becomes `Untitled`.
 * @property {string} [note] The project's note, shown as a quote; blank omits the quote.
 * @property {readonly string[]} [bodies] Body names, in timeline order.
 * @property {readonly { text: string, bodies?: readonly string[] }[]} [prompts] The prompts that made
 *   the project, oldest first, each with the names of the bodies it produced (`TODO/io-022`). Blank
 *   prompts are left out; none omits the section.
 * @property {Date | number | string} publishedAt When this publish happened.
 * @property {string | null} [id] The gist id; null before the first `POST` returns one, which
 *   leaves out the **Open in WarpCad** link (the two-call publish fills it in).
 * @property {string} [rawUrl] The project file's `gist.githubusercontent.com` link.
 * @property {string} [fileName] The project file's name in the gist, for the link text.
 */

/** Bidi embedding, override and isolate controls: they reorder text a reader sees (spoofing). */
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/g
/** Line breaks of every kind, collapsed to one space in a one-line field. */
const LINE_BREAKS = /(?:\r\n|[\r\n\u0085\u2028\u2029])+/g
/** Remaining C0/C1 controls (tab included). */
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g
/** ASCII punctuation with inline meaning in GitHub Markdown, backslash-escaped. */
const MARKDOWN_PUNCTUATION = /[\\`*_{}[\]()#+\-.!|~$]/g

/**
 * Escape text so GitHub Markdown renders it literally: HTML-significant characters become
 * entities (`&` first, so an entity in the data stays visible), and Markdown punctuation is
 * backslash-escaped.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeMarkdownText(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(MARKDOWN_PUNCTUATION, (character) => `\\${character}`)
}

/**
 * At most `max` code points, the last one an ellipsis when cut. Never splits a surrogate pair.
 *
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function cap(text, max) {
  const points = Array.from(text)
  return points.length <= max ? text : points.slice(0, max - 1).join('') + '…'
}

/**
 * One line of data text: no line breaks, controls or bidi overrides, trimmed.
 *
 * @param {unknown} value
 * @returns {string}
 */
function oneLine(value) {
  if (typeof value !== 'string') return ''
  return value.replace(BIDI_CONTROLS, '').replace(LINE_BREAKS, ' ').replace(CONTROLS, ' ').trim()
}

/**
 * Format a publish time as `YYYY-MM-DD HH:MM UTC`.
 *
 * @param {Date | number | string} at
 * @returns {string}
 * @throws {RangeError} When `at` is not a valid time.
 */
export function formatPublishedAt(at) {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) throw new RangeError('publishedAt is not a valid time')
  const iso = date.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

/**
 * Free text with its line breaks kept as `\n` and every other control or bidi override removed.
 *
 * @param {string} value
 * @returns {string}
 */
function cleanedBlock(value) {
  return value
    .replace(BIDI_CONTROLS, '')
    .replace(/\r\n?|[\u0085\u2028\u2029]/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, ' ')
    .trim()
}

/**
 * Each line of cleaned text as a block-quote line, escaped. A blank line is a bare `>`.
 *
 * @param {string} cleaned Lines separated by `\n`.
 * @param {(line: string) => string} escape
 * @returns {string[]}
 */
function quoteLines(cleaned, escape) {
  return cleaned.split('\n').map((line) => {
    const text = escape(line.trim())
    // A line of `=` would turn the line above into a heading (setext); `-` is already escaped.
    if (text === '') return '>'
    return text.startsWith('=') ? `> \\${text}` : `> ${text}`
  })
}

/**
 * The note as quoted lines, or none for a blank note.
 *
 * @param {unknown} note
 * @returns {string[]}
 */
function quotedNote(note) {
  if (typeof note !== 'string') return []
  const cleaned = cap(cleanedBlock(note), MAX_NOTE_CHARS)
  if (cleaned === '') return []
  return quoteLines(cleaned, escapeMarkdownText)
}

/**
 * Escape text as {@link escapeMarkdownText} does, then break every `@` so a mention notifies no one
 * (`&#64;` renders as `@` and is not a mention). Used for prompt text and the bodies a prompt
 * names; the body list keeps its own, unchanged, rendering.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeMention(text) {
  return escapeMarkdownText(text).replace(/@/g, '&#64;')
}

/**
 * **How this was made** (`TODO/io-022`): each prompt as a block quote, then the bodies it produced,
 * oldest first. Capped by {@link MAX_LISTED_PROMPTS} and by {@link MAX_PROMPT_CHARS} in all; the
 * prompt that crosses the character cap is cut with `\u2026`, and the rest are counted.
 *
 * @param {readonly { text: unknown, bodies?: readonly unknown[] }[]} prompts
 * @returns {string[]} The section's lines, or none when there is nothing to list.
 */
function promptsSection(prompts) {
  const usable = prompts
    .map((prompt) => ({
      text: cleanedBlock(typeof prompt?.text === 'string' ? prompt.text : ''),
      bodies: Array.isArray(prompt?.bodies) ? prompt.bodies : [],
    }))
    .filter((prompt) => prompt.text !== '')
  if (usable.length === 0) return []

  /** @type {string[][]} */
  const blocks = [['## How this was made']]
  let budget = MAX_PROMPT_CHARS
  for (const prompt of usable) {
    if (blocks.length - 1 === MAX_LISTED_PROMPTS || budget <= 0) break
    const text = cap(prompt.text, budget)
    budget -= Array.from(text).length
    const block = quoteLines(text, escapeMention)
    if (prompt.bodies.length > 0) {
      const names = prompt.bodies.slice(0, MAX_PROMPT_BODIES).map((body) => {
        const name = cap(oneLine(body), MAX_BODY_NAME_CHARS)
        return name === '' ? UNNAMED : escapeMention(name)
      })
      const more = prompt.bodies.length - names.length
      const suffix = more > 0 ? `, and ${more} more` : ''
      block.push('', `- Made: ${names.join(', ')}${suffix}`)
    }
    blocks.push(block)
  }
  const more = usable.length - (blocks.length - 1)
  if (more > 0) blocks.push([`- and ${more} more`])

  /** @type {string[]} */
  const lines = []
  blocks.forEach((block, index) => {
    if (index > 0) lines.push('')
    lines.push(...block)
  })
  return lines
}

/**
 * The body-count line.
 *
 * @param {readonly unknown[]} bodies
 * @returns {string}
 */
function bodiesLine(bodies) {
  if (bodies.length === 0) return '- No bodies'
  const names = bodies.slice(0, MAX_LISTED_BODIES).map((body) => {
    const name = cap(oneLine(body), MAX_BODY_NAME_CHARS)
    return name === '' ? UNNAMED : escapeMarkdownText(name)
  })
  const more = bodies.length - names.length
  const list = names.join(', ') + (more > 0 ? `, and ${more} more` : '')
  return `- ${bodies.length} ${bodies.length === 1 ? 'body' : 'bodies'}: ${list}`
}

/**
 * Build the gist's `README.md`.
 *
 * @param {GistReadmeInput} input
 * @returns {string} Markdown, ending in a newline.
 * @throws {Error} When `id` is given but is not a gist id, or `publishedAt` is not a time.
 */
export function gistReadme(input) {
  // Destructure exactly the documented fields: nothing else on `input` is ever read.
  const { name, note, bodies, prompts, publishedAt, id, rawUrl, fileName } = input
  const title = cap(oneLine(name), MAX_NAME_CHARS) || DEFAULT_SHARE_NAME
  const list = Array.isArray(bodies) ? bodies : []

  /** @type {string[]} */
  const lines = [`# ${escapeMarkdownText(title)}`, '']
  const quote = quotedNote(note)
  if (quote.length > 0) lines.push(...quote, '')
  if (id !== null && id !== undefined) {
    lines.push(`**[Open in WarpCad](${gistLink(id)})** — nothing to install, no account.`, '')
  }
  lines.push(bodiesLine(list), `- Last published ${formatPublishedAt(publishedAt)}`)
  const raw = id === null || id === undefined || !isGistRawUrl(rawUrl) ? null : rawUrl
  if (raw !== null) {
    const label = cap(oneLine(fileName), MAX_BODY_NAME_CHARS) || 'project file'
    lines.push(`- Project file: [${escapeMarkdownText(label)}](<${raw}>)`)
  }
  const section = promptsSection(Array.isArray(prompts) ? prompts : [])
  if (section.length > 0) lines.push('', ...section)
  lines.push('', FOOTER, '')
  return lines.join('\n')
}
