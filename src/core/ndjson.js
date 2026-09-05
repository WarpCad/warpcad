/**
 * NDJSON read/write for the document's action log (`Initial design.md` §3).
 *
 * One JSON action record per line — cheap to append, line-diffable, and
 * streamable from a remote URL without parsing the whole document first. This
 * module is pure string-in/array-out: no file-system or network code lives
 * here (that's `src/storage/`'s job), and no line is ever `eval`'d or handed to
 * `new Function` — a malformed or hostile line can only ever fail `JSON.parse`,
 * which cannot execute anything, it can only refuse to produce a value. That is
 * the load-bearing security property `Initial design.md` §3 asks for.
 *
 * @module core/ndjson
 */

/**
 * @typedef {object} ParseError
 * @property {number} line 1-indexed line number in the original text.
 * @property {string} message
 * @property {string} raw The line's raw text, for a human to inspect.
 */

/**
 * @typedef {object} ParseResult
 * @property {object[]} records Successfully parsed lines, in file order.
 * @property {ParseError[]} errors Lines that failed to parse as JSON — reported,
 *   never thrown, so one corrupt line does not prevent the rest of the document
 *   from loading.
 */

/**
 * Parse NDJSON text into action records. Blank lines are skipped silently; a
 * line that isn't valid JSON is reported in `errors` rather than thrown, so a
 * document with one bad line still loads everything else.
 *
 * @param {string} text
 * @returns {ParseResult}
 */
export function parseNdjson(text) {
  /** @type {object[]} */
  const records = []
  /** @type {ParseError[]} */
  const errors = []

  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed === '') return
    try {
      records.push(JSON.parse(trimmed))
    } catch (error) {
      errors.push({
        line: index + 1,
        message: `invalid JSON: ${/** @type {Error} */ (error).message}`,
        raw: trimmed,
      })
    }
  })

  return { records, errors }
}

/**
 * Serialize action records back to NDJSON text, one JSON line per record.
 *
 * @param {readonly object[]} records
 * @returns {string} Empty string for an empty array; otherwise newline-terminated.
 */
export function serializeNdjson(records) {
  if (records.length === 0) return ''
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n'
}
