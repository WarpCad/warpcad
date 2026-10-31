// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The project's **description** (`TODO/io-023`): text written for **people** to read — what the
 * part is, what it is for — as distinct from the standing instructions (`TODO/ai-003`), which are
 * written for the AI. A person sets it in File ▾ → **Project settings…**; an agent sets it with
 * `set_description`. The gist README shows it under the title.
 *
 * ## A small Markdown subset, and nothing else
 *
 * The allowlist: **paragraphs** (a blank line between them; a single line break is a space),
 * **bullet lists** (a line starting `- `, `* ` or `+ `), `**bold**`, `*italic*` / `_italic_`, and
 * `` `inline code` ``. That is all. A link, an image, HTML, a heading, a numbered list, a quote, a
 * table, a code block: each is **plain text**, its characters shown as typed. There is no
 * nesting (bold text is plain text inside), so the parse is a flat list a renderer cannot be
 * tricked into reading as anything else.
 *
 * {@link parseDescription} returns tokens, never markup. The app renders them as elements with
 * text content (`DescriptionText.vue`, no `v-html`); the README (`gistReadme.js`) writes its own
 * Markdown for each token and escapes every character of the text. So the description is
 * **data, never markup and never instructions**: cleaned when it is stored
 * ({@link prepareDescription}) and cleaned again when it is parsed, whatever the file said.
 *
 * Pure and framework-free.
 *
 * @module core/description
 */

/** Caps for the description, enforced on store, on load and on parse. */
export const DESCRIPTION_LIMITS = Object.freeze({
  /** Longest description kept, in code points; a longer one is cut with `…`. */
  maxLength: 2000,
  /** Longest text `set_description` accepts at all; more is refused rather than cut. */
  maxInputLength: 64_000,
})

/** Bidi embedding, override, isolate and mark characters: they reorder what a reader sees. */
const BIDI = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g
/** Line breaks of every kind except `\n`. */
const BREAKS = /\r\n?|[\u0085\u2028\u2029]/g
/** C0 and C1 controls other than `\n` and tab. */
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g

/**
 * @typedef {object} DescriptionInline
 * @property {'text' | 'strong' | 'em' | 'code'} type
 * @property {string} text Plain text: what a renderer shows, never markup.
 */

/**
 * @typedef {{ type: 'paragraph', inlines: DescriptionInline[] } | { type: 'list', items: DescriptionInline[][] }} DescriptionBlock
 */

/**
 * The description as stored: line breaks as `\n`, controls and bidi characters removed, a tab
 * as a space, trimmed, at most {@link DESCRIPTION_LIMITS.maxLength} code points (the cut one
 * ending in `…`). Idempotent, so stored text validates as clean.
 *
 * @param {unknown} value Anything; a non-string is no text at all.
 * @returns {string}
 */
export function cleanDescription(value) {
  if (typeof value !== 'string') return ''
  const text = value.replace(BIDI, '').replace(BREAKS, '\n').replace(CONTROLS, '').replace(/\t/g, ' ').trim()
  const points = Array.from(text)
  if (points.length <= DESCRIPTION_LIMITS.maxLength) return text
  return points.slice(0, DESCRIPTION_LIMITS.maxLength - 1).join('').trimEnd() + '…'
}

/**
 * What `set_description` (and the Project settings dialog) stores, or why it refuses. Empty text
 * is accepted: it clears the description.
 *
 * @param {unknown} value
 * @returns {{ ok: true, text: string, truncated: boolean } | { ok: false, reason: string }}
 */
export function prepareDescription(value) {
  if (typeof value !== 'string') return { ok: false, reason: 'the description must be text' }
  if (value.length > DESCRIPTION_LIMITS.maxInputLength) {
    return {
      ok: false,
      reason:
        `the description is ${value.length} characters, over the cap of ${DESCRIPTION_LIMITS.maxInputLength} this accepts — ` +
        `send at most ${DESCRIPTION_LIMITS.maxLength}`,
    }
  }
  const whole = value.replace(BIDI, '').replace(BREAKS, '\n').replace(CONTROLS, '').replace(/\t/g, ' ').trim()
  const text = cleanDescription(whole)
  return { ok: true, text, truncated: Array.from(whole).length > DESCRIPTION_LIMITS.maxLength }
}

const LIST_ITEM = /^[-*+][ ]+(.*)$/
const WORD = /[\p{L}\p{N}]/u

/**
 * The run of `marker` that closes an emphasis opened at `from`, or -1.
 *
 * @param {string} text
 * @param {number} from Index just after the opener.
 * @param {string} marker `**`, `*` or `_`.
 * @returns {number}
 */
function closerOf(text, from, marker) {
  let at = text.indexOf(marker, from)
  while (at !== -1) {
    const inner = text.slice(from, at)
    // A single-character marker never spans its own character (`*a*b*` closes at the first).
    const ok =
      inner !== '' &&
      !/^\s|\s$/.test(inner) &&
      (marker !== '**' || !inner.includes('*')) &&
      (marker === '**' || !inner.includes(marker)) &&
      // `_` does not open or close inside a word (`snake_case_name`).
      (marker !== '_' || !WORD.test(text[at + 1] ?? ''))
    if (ok) return at
    if (marker !== '**' && inner.includes(marker)) return -1
    at = text.indexOf(marker, at + 1)
  }
  return -1
}

/**
 * The inline tokens of one paragraph or list item. Linear in the text's length times a small
 * constant: each position tries code, bold, italic, then is text.
 *
 * @param {string} text One line, already cleaned.
 * @returns {DescriptionInline[]}
 */
function inlinesOf(text) {
  /** @type {DescriptionInline[]} */
  const out = []
  let plain = ''
  const flush = () => {
    if (plain !== '') out.push({ type: 'text', text: plain })
    plain = ''
  }
  let index = 0
  while (index < text.length) {
    const character = text[index]
    if (character === '`') {
      const end = text.indexOf('`', index + 1)
      const inner = end === -1 ? '' : text.slice(index + 1, end)
      if (end !== -1 && inner.trim() !== '') {
        flush()
        out.push({ type: 'code', text: inner })
        index = end + 1
        continue
      }
      // An empty pair or a lone backtick is text, all of the run.
      let run = index
      while (text[run] === '`') run += 1
      plain += text.slice(index, run)
      index = run
      continue
    }
    if (character === '*' && text[index + 1] === '*') {
      const end = closerOf(text, index + 2, '**')
      if (end !== -1) {
        flush()
        out.push({ type: 'strong', text: text.slice(index + 2, end) })
        index = end + 2
        continue
      }
    }
    if (character === '*' || (character === '_' && !WORD.test(text[index - 1] ?? ''))) {
      const end = closerOf(text, index + 1, character)
      if (end !== -1) {
        flush()
        out.push({ type: 'em', text: text.slice(index + 1, end) })
        index = end + 1
        continue
      }
    }
    plain += character
    index += 1
  }
  flush()
  return out
}

/**
 * The description as blocks of inline tokens, the allowed subset only (see the module note).
 * Cleans the text first, whatever it is, so a description that reached the document by any
 * path parses the same.
 *
 * @param {unknown} value The stored description.
 * @returns {DescriptionBlock[]} None for a blank description.
 */
export function parseDescription(value) {
  const text = cleanDescription(value)
  if (text === '') return []
  /** @type {DescriptionBlock[]} */
  const blocks = []
  /** @type {string[]} */
  let paragraph = []
  /** @type {string[] | null} */
  let list = null
  const endParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', inlines: inlinesOf(paragraph.join(' ')) })
    paragraph = []
  }
  const endList = () => {
    if (list !== null && list.length > 0) blocks.push({ type: 'list', items: list.map(inlinesOf) })
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') {
      endParagraph()
      endList()
      continue
    }
    const item = LIST_ITEM.exec(line)
    if (item !== null && item[1].trim() !== '') {
      endParagraph()
      list ??= []
      list.push(item[1].trim())
      continue
    }
    endList()
    paragraph.push(line)
  }
  endParagraph()
  endList()
  return blocks
}

/** Longest first line {@link descriptionFirstLine} returns, in code points. */
const FIRST_LINE_MAX = 80

/**
 * The first line of a description as plain text, for the sender's one-line hint ("People who open
 * this will see: …"): the first paragraph, or the first bullet, with its Markdown markers gone,
 * cut to 80 code points with `…`. `''` when there is no text.
 *
 * @param {unknown} value The description as stored.
 * @returns {string}
 */
export function descriptionFirstLine(value) {
  const [block] = parseDescription(value)
  if (block === undefined) return ''
  const inlines = block.type === 'paragraph' ? block.inlines : (block.items[0] ?? [])
  const text = inlines.map((inline) => inline.text).join('').replace(/\s+/g, ' ').trim()
  const points = Array.from(text)
  return points.length <= FIRST_LINE_MAX ? text : points.slice(0, FIRST_LINE_MAX - 1).join('').trimEnd() + '…'
}
