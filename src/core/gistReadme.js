// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `README.md` a published gist carries (`TODO/io-017`): a short page github.com shows a
 * reader first, regenerated on every publish so nobody edits it by hand and loses the edit.
 *
 * Everything that comes from the project — its name, description, body names, prompts, replies
 * and variables — is **data, never markup and never instructions**. Each is stripped of control
 * and bidi-override characters, capped, and escaped so that a body named `[x](javascript:…)` or
 * `<img onerror>` reaches GitHub as inert text.
 *
 * ## The project's brief (`TODO/io-023`)
 *
 * In this order: the title; the **description** (`src/core/description.js`) as plain text under
 * it; the **Open in WarpCad** link; the counts and the file link; **How this was made**, each
 * prompt as a quote with the agent's **Reply** as a second quote, then the bodies it produced
 * (`TODO/io-022`, `TODO/ai-032`); **Variables**, a table of every project variable with its
 * range where the project defines one; the footer. The sections after the counts are one list,
 * {@link SECTIONS}, so a later property meant for a reader is one entry there.
 *
 * The description is the one field with formatting, and only its subset: the README writes
 * its own Markdown for each token {@link parseDescription} returns (`**`, `*`, a code span, a
 * `- ` item) and escapes every character of the text, so no link, image, heading or HTML can
 * come from it. Every `@` in the data is broken (`&#64;`) so a mention notifies nobody.
 *
 * What is deliberately **not** here: standing instructions (they are rules for a model, not a
 * reader's brief) and intent text. They are in the `.ndjson` the owner chose to publish, but the
 * README is the part that gets skimmed and indexed. {@link GistReadmeInput} has no field that
 * could hold them, and the function reads only the fields it names. The conversation is here
 * only as the owner decided (`docs/decisions/gist-storage.md`): the request and the reply, and
 * only when the Share sheet's **Include prompts in the README** is ticked.
 *
 * Pure and deterministic: the same input gives the same text, in any time zone.
 *
 * @module core/gistReadme
 */

import { parseDescription } from './description.js'
import { gistLink, isGistRawUrl } from './gistLink.js'
import { DEFAULT_SHARE_NAME } from './shareLink.js'

/** Longest project name kept, in code points. */
export const MAX_NAME_CHARS = 120
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
/** Most variables the **Variables** table lists; the rest are counted ("and N more"). */
export const MAX_LISTED_VARIABLES = 100
/** Longest table cell (a variable's name, value or range), in code points. */
const MAX_CELL_CHARS = 200

const FOOTER = 'Made with WarpCad. This page is generated; edits are overwritten when the project is published again.'
const UNNAMED = '(unnamed)'

/**
 * The README's whole input. Nothing else is read, so nothing else can leak into it.
 *
 * @typedef {object} GistReadmeInput
 * @property {string} [name] The project's name; blank becomes `Untitled`.
 * @property {string} [description] `TODO/io-023`: the project's description for people, in its
 *   Markdown subset (`src/core/description.js`); blank omits it.
 * @property {readonly string[]} [bodies] Body names, in timeline order.
 * @property {readonly GistReadmePrompt[]} [prompts] The prompts that made the project, oldest first
 *   (`TODO/io-022`). Blank prompts are left out; none omits the section.
 * @property {readonly GistReadmeVariable[]} [variables] `TODO/io-023`: the project's variables, in
 *   definition order; none omits the section.
 * @property {Date | number | string} publishedAt When this publish happened.
 * @property {string | null} [id] The gist id; null before the first `POST` returns one, which
 *   leaves out the **Open in WarpCad** link (the two-call publish fills it in).
 * @property {string} [rawUrl] The project file's `gist.githubusercontent.com` link.
 * @property {string} [fileName] The project file's name in the gist, for the link text.
 */

/**
 * One prompt as the README lists it.
 *
 * @typedef {object} GistReadmePrompt
 * @property {string} text The request.
 * @property {string} [reply] `TODO/io-023`: the agent's reply (`TODO/ai-032`'s segments joined by a
 *   blank line); blank or absent leaves the **Reply** quote out.
 * @property {readonly string[]} [bodies] The names of the bodies it produced.
 */

/**
 * One variable as the **Variables** table lists it — `src/core/variables.js`'s `Variable`, of which
 * only these fields are read.
 *
 * @typedef {object} GistReadmeVariable
 * @property {string} name
 * @property {string} kind `number`, `boolean` or `enum`.
 * @property {unknown} value
 * @property {string} [unit] A number's unit: `mm`, `deg` or `''`.
 * @property {number} [min]
 * @property {number} [max]
 * @property {readonly { value: unknown, label: string }[]} [options] An enum's choices.
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
 * One description token as Markdown: its text escaped ({@link escapeMention}) inside the markers
 * this function writes itself. A code span's text is literal to GitHub (no HTML, no mention), and
 * holds no backtick ({@link parseDescription} ends a span at the first), so it cannot close early.
 *
 * @param {import('./description.js').DescriptionInline[]} inlines
 * @returns {string}
 */
function inlineMarkdown(inlines) {
  const text = inlines
    .map((inline) => {
      if (inline.type === 'code') return `\`${inline.text.replace(/`/g, '')}\``
      const escaped = escapeMention(inline.text)
      if (inline.type === 'strong') return `**${escaped}**`
      if (inline.type === 'em') return `*${escaped}*`
      return escaped
    })
    .join('')
  // A line of `=` would turn the line above into a heading (setext); `-` is already escaped.
  return text.startsWith('=') ? `\\${text}` : text
}

/**
 * The description (`TODO/io-023`) as Markdown lines: each paragraph on one line, each list item a
 * `- ` line, a blank line between blocks. None for a blank description.
 *
 * @param {unknown} description
 * @returns {string[]}
 */
function descriptionLines(description) {
  /** @type {string[]} */
  const lines = []
  parseDescription(description).forEach((block, index) => {
    if (index > 0) lines.push('')
    if (block.type === 'paragraph') lines.push(inlineMarkdown(block.inlines))
    else for (const item of block.items) lines.push(`- ${inlineMarkdown(item)}`)
  })
  return lines
}

/**
 * **How this was made** (`TODO/io-022`): each prompt as a block quote, then (`TODO/io-023`) the
 * agent's reply as a second quote headed **Reply**, then the bodies it produced, oldest first.
 * Capped by {@link MAX_LISTED_PROMPTS} and by {@link MAX_PROMPT_CHARS} in all — requests and
 * replies share the one budget; the text that crosses it is cut with `\u2026`, and the prompts
 * after it are counted.
 *
 * @param {readonly { text: unknown, reply?: unknown, bodies?: readonly unknown[] }[]} prompts
 * @returns {string[]} The section's lines, or none when there is nothing to list.
 */
function promptsSection(prompts) {
  const usable = prompts
    .map((prompt) => ({
      text: cleanedBlock(typeof prompt?.text === 'string' ? prompt.text : ''),
      reply: cleanedBlock(typeof prompt?.reply === 'string' ? prompt.reply : ''),
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
    if (prompt.reply !== '' && budget > 0) {
      const reply = cap(prompt.reply, budget)
      budget -= Array.from(reply).length
      block.push('', '**Reply**', '', ...quoteLines(reply, escapeMention))
    }
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
 * A number as written: `0`, `-2.5`, `0.4` — never blank, never exponent-free rounding.
 *
 * @param {unknown} value
 * @returns {string}
 */
function numberText(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

/**
 * A variable's value in words: an enum's option label, `yes` / `no` for a boolean, else the number
 * with its unit (`src/core/variables.js`'s `variableValueLabel`, which this mirrors for plain input).
 *
 * @param {GistReadmeVariable} variable
 * @returns {string}
 */
function variableValueText(variable) {
  if (variable.kind === 'enum') {
    const option = Array.isArray(variable.options) ? variable.options.find((candidate) => Object.is(candidate?.value, variable.value)) : undefined
    if (option !== undefined && typeof option.label === 'string') return option.label
    return typeof variable.value === 'string' || typeof variable.value === 'number' ? String(variable.value) : ''
  }
  if (variable.kind === 'boolean') return variable.value === true ? 'yes' : 'no'
  const unit = typeof variable.unit === 'string' && variable.unit !== '' ? ` ${variable.unit}` : ''
  const number = numberText(variable.value)
  return number === '' ? '' : `${number}${unit}`
}

/**
 * A variable's range in words, or `—` when the project defines none: `40–120 mm`, `≥ 40 mm`,
 * `≤ 120 mm` for a number; the option labels for an enum; `yes / no` for a boolean.
 *
 * @param {GistReadmeVariable} variable
 * @returns {string}
 */
function variableRangeText(variable) {
  if (variable.kind === 'enum') {
    const labels = (Array.isArray(variable.options) ? variable.options : [])
      .map((option) => (typeof option?.label === 'string' ? oneLine(option.label) : ''))
      .filter((label) => label !== '')
    return labels.length === 0 ? '—' : labels.join(', ')
  }
  if (variable.kind === 'boolean') return 'yes / no'
  const unit = typeof variable.unit === 'string' && variable.unit !== '' ? ` ${variable.unit}` : ''
  const min = numberText(variable.min)
  const max = numberText(variable.max)
  if (min !== '' && max !== '') return `${min}–${max}${unit}`
  if (min !== '') return `≥ ${min}${unit}`
  if (max !== '') return `≤ ${max}${unit}`
  return '—'
}

/**
 * One table cell: one line, capped, escaped — `|` is backslash-escaped, so a cell cannot end the
 * cell or the table — and every `@` broken. A blank cell reads `—`.
 *
 * @param {string} text
 * @returns {string}
 */
function cell(text) {
  const line = cap(oneLine(text), MAX_CELL_CHARS)
  return line === '' ? '—' : escapeMention(line)
}

/**
 * **Variables** (`TODO/io-023`): a table of every project variable in definition order — name,
 * value and range. The **Range** column is left out when no variable has one (a number with
 * neither `min` nor `max` has none), rather than shown blank. Capped by
 * {@link MAX_LISTED_VARIABLES}, the rest counted.
 *
 * @param {readonly GistReadmeVariable[]} variables
 * @returns {string[]} The section's lines, or none when there are no variables.
 */
function variablesSection(variables) {
  const usable = variables.filter((variable) => typeof variable?.name === 'string' && oneLine(variable.name) !== '')
  if (usable.length === 0) return []
  const listed = usable.slice(0, MAX_LISTED_VARIABLES)
  const rows = listed.map((variable) => ({
    name: cell(variable.name),
    value: cell(variableValueText(variable)),
    range: cell(variableRangeText(variable)),
  }))
  const ranged = rows.some((row) => row.range !== '—')
  const lines = [
    '## Variables',
    '',
    ranged ? '| Name | Value | Range |' : '| Name | Value |',
    ranged ? '| --- | --- | --- |' : '| --- | --- |',
    ...rows.map((row) => (ranged ? `| ${row.name} | ${row.value} | ${row.range} |` : `| ${row.name} | ${row.value} |`)),
  ]
  const more = usable.length - listed.length
  if (more > 0) lines.push('', `- and ${more} more`)
  return lines
}

/**
 * The sections after the counts, in order (`TODO/io-023`): one entry each, so a later property
 * meant for a reader is one more entry, not a rewrite. Each returns its lines, or none.
 *
 * @type {readonly ((input: GistReadmeInput) => string[])[]}
 */
const SECTIONS = Object.freeze([
  (input) => promptsSection(Array.isArray(input.prompts) ? input.prompts : []),
  (input) => variablesSection(Array.isArray(input.variables) ? input.variables : []),
])

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
  const { name, description, bodies, prompts, variables, publishedAt, id, rawUrl, fileName } = input
  const title = cap(oneLine(name), MAX_NAME_CHARS) || DEFAULT_SHARE_NAME
  const list = Array.isArray(bodies) ? bodies : []

  /** @type {string[]} */
  const lines = [`# ${escapeMarkdownText(title)}`, '']
  const about = descriptionLines(description)
  if (about.length > 0) lines.push(...about, '')
  if (id !== null && id !== undefined) {
    lines.push(`**[Open in WarpCad](${gistLink(id)})** — nothing to install, no account.`, '')
  }
  lines.push(bodiesLine(list), `- Last published ${formatPublishedAt(publishedAt)}`)
  const raw = id === null || id === undefined || !isGistRawUrl(rawUrl) ? null : rawUrl
  if (raw !== null) {
    const label = cap(oneLine(fileName), MAX_BODY_NAME_CHARS) || 'project file'
    lines.push(`- Project file: [${escapeMarkdownText(label)}](<${raw}>)`)
  }
  for (const section of SECTIONS) {
    const sectionLines = section({ prompts, variables, publishedAt })
    if (sectionLines.length > 0) lines.push('', ...sectionLines)
  }
  lines.push('', FOOTER, '')
  return lines.join('\n')
}
