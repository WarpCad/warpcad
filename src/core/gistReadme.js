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

const FOOTER = 'Made with WarpCad. This page is generated; edits are overwritten when the project is published again.'
const UNNAMED = '(unnamed)'

/**
 * The README's whole input. Nothing else is read, so nothing else can leak into it.
 *
 * @typedef {object} GistReadmeInput
 * @property {string} [name] The project's name; blank becomes `Untitled`.
 * @property {string} [note] The project's note, shown as a quote; blank omits the quote.
 * @property {readonly string[]} [bodies] Body names, in timeline order.
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
 * The note as quoted lines, or none for a blank note.
 *
 * @param {unknown} note
 * @returns {string[]}
 */
function quotedNote(note) {
  if (typeof note !== 'string') return []
  const cleaned = cap(note.replace(BIDI_CONTROLS, '').replace(/\r\n?|[\u0085\u2028\u2029]/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, ' ').trim(), MAX_NOTE_CHARS)
  if (cleaned === '') return []
  return cleaned.split('\n').map((line) => {
    const text = escapeMarkdownText(line.trim())
    // A line of `=` would turn the line above into a heading (setext); `-` is already escaped.
    return text === '' ? '>' : `> ${text.startsWith('=') ? `\\${text}` : text}`
  })
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
  const { name, note, bodies, publishedAt, id, rawUrl, fileName } = input
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
  lines.push('', FOOTER, '')
  return lines.join('\n')
}
