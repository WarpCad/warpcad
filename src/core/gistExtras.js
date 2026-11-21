// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The **extra files** an agent stages for the next gist publish (`TODO/io-040`), beside the project
 * file and its `README.md`: an STL of some or all of the bodies, and Markdown notes (print
 * settings, assembly). `stage_gist_files` writes the list; the Share sheet lists it with a checkbox
 * per file; the publish builds each STL from the live timeline at tap time.
 *
 * ## What is stored, and what never is
 *
 * The list is a last-writer-wins register of the document (`src/core/document.js`), merged like the
 * description. An entry is `{ kind: 'stl', name, ids }` or `{ kind: 'note', name, text }`. **Never
 * mesh bytes**: geometry is always derived from the timeline (CLAUDE.md, Architecture). `ids` are
 * body (lineage-root) ids, and `[]` means every body on screen at publish time — the export's own
 * "nothing selected, the whole scene" rule (`resolveExportScope`).
 *
 * ## Only text kinds
 *
 * The Gist REST API takes each file's `content` as a JSON string, so a ZIP (3MF), a binary STL or a
 * PNG cannot go through it (`docs/decisions/gist-storage.md`, io-040). An `stl` is therefore
 * published as **ASCII STL**, and there is no `3mf` kind.
 *
 * ## Caps and names, in code
 *
 * {@link GIST_EXTRAS_LIMITS}: at most 5 files, a note at most 20,000 characters, at most 200 body
 * ids a file (`src/ai/tools/limits.js` reads these). A file name is slugged the way the project
 * file's is (`gistFileName`: accents folded, `a-z0-9` and hyphens, no path, no dot file) and given
 * its kind's extension, so a name can never be a path or another kind of file. A name that would
 * collide with `README.md` (in any letter case), with the project file, or with another staged file
 * is refused when staged and dropped when loaded.
 *
 * A note's text is data, never markup and never instructions: control and bidi characters are
 * removed and it is capped, on store and on load. The publish escapes it as it does the README.
 *
 * Pure and framework-free.
 *
 * @module core/gistExtras
 */

import { gistFileName } from './gistLink.js'
import { stripProjectExtension } from './projectFile.js'

/** The kinds a staged file can be, in the order a tool lists them. */
export const GIST_EXTRA_KINDS = Object.freeze(/** @type {const} */ (['stl', 'note']))

/** Caps for the staged list, enforced on stage, on load and on merge. */
export const GIST_EXTRAS_LIMITS = Object.freeze({
  /** Most extra files one gist carries. */
  maxFiles: 5,
  /** Longest note, in code points. */
  maxNoteChars: 20_000,
  /** Most body ids one STL names. */
  maxIdsPerFile: 200,
  /** Longest body id kept (the merge section's own id cap). */
  maxIdLength: 256,
})

/** Each kind's file extension. */
export const GIST_EXTRA_EXTENSIONS = Object.freeze({ stl: '.stl', note: '.md' })

/** The README's file name in a gist; no staged file may take it, in any letter case. */
export const GIST_README_FILE = 'README.md'

/** The stem an STL gets when neither its own name nor the project's leaves a slug. */
const STL_FALLBACK = 'model'
/** The stem a note gets when its name leaves no slug. */
const NOTE_FALLBACK = 'notes'

/**
 * @typedef {'stl' | 'note'} GistExtraKind
 */

/**
 * One staged file, as the document stores it.
 *
 * @typedef {{ kind: 'stl', name: string, ids: string[] } | { kind: 'note', name: string, text: string }} GistExtra
 */

/**
 * One staged file as a tool echoes it: a note's length rather than its text.
 *
 * @typedef {{ kind: 'stl', name: string, ids: string[] } | { kind: 'note', name: string, chars: number }} GistExtraSummary
 */

/** Bidi embedding, override, isolate and mark characters: they reorder what a reader sees. */
const BIDI = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g
/** Line breaks of every kind except `\n`. */
const BREAKS = /\r\n?|[\u0085\u2028\u2029]/g
/** C0 and C1 controls other than `\n` and tab. */
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g

/**
 * @param {unknown} value
 * @returns {value is GistExtraKind}
 */
export function isGistExtraKind(value) {
  return typeof value === 'string' && /** @type {readonly string[]} */ (GIST_EXTRA_KINDS).includes(value)
}

/**
 * Whether `text` leaves anything for {@link gistFileName} to slug (it folds accents and keeps `a-z0-9`).
 *
 * @param {string} text
 * @returns {boolean}
 */
function hasSlug(text) {
  return /[a-z0-9]/.test(text.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase())
}

/**
 * A staged file's name in the gist: `name` slugged as the project file is, with the kind's
 * extension (a typed one, in any case, is not doubled). Blank or slug-less, `fallback`; that blank
 * too, `model.stl` or `notes.md`.
 *
 * @param {GistExtraKind} kind
 * @param {unknown} name What the agent asked for, e.g. `Cable clip` or `cable-clip.stl`.
 * @param {string} [fallback] The stem to use instead, e.g. the project's name.
 * @returns {string} e.g. `cable-clip.stl`.
 */
export function gistExtraFileName(kind, name, fallback = '') {
  const extension = GIST_EXTRA_EXTENSIONS[kind]
  let text = typeof name === 'string' ? name : ''
  if (text.toLowerCase().endsWith(extension)) text = text.slice(0, -extension.length)
  const stemOf = (/** @type {string} */ value) => stripProjectExtension(gistFileName(value))
  const stem = hasSlug(text) ? stemOf(text) : hasSlug(fallback) ? stemOf(fallback) : kind === 'note' ? NOTE_FALLBACK : STL_FALLBACK
  return `${stem}${extension}`
}

/**
 * A note's text with control and bidi characters removed, line breaks as `\n`, a tab as a space,
 * trimmed — not yet capped.
 *
 * @param {string} value
 * @returns {string}
 */
function scrubNote(value) {
  return value.replace(BIDI, '').replace(BREAKS, '\n').replace(CONTROLS, '').replace(/\t/g, ' ').trim()
}

/**
 * A note as stored: {@link scrubNote}, at most {@link GIST_EXTRAS_LIMITS.maxNoteChars} code points
 * (a cut one ending in `…`). Idempotent.
 *
 * @param {unknown} value Anything; a non-string is no text.
 * @returns {string}
 */
export function cleanNoteText(value) {
  if (typeof value !== 'string') return ''
  const text = scrubNote(value)
  const points = Array.from(text)
  if (points.length <= GIST_EXTRAS_LIMITS.maxNoteChars) return text
  return points.slice(0, GIST_EXTRAS_LIMITS.maxNoteChars - 1).join('').trimEnd() + '…'
}

/**
 * Body ids as stored: strings within the id cap, once each, at most
 * {@link GIST_EXTRAS_LIMITS.maxIdsPerFile}.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
function cleanIds(value) {
  if (!Array.isArray(value)) return []
  const ids = value.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= GIST_EXTRAS_LIMITS.maxIdLength)
  return [...new Set(ids)].slice(0, GIST_EXTRAS_LIMITS.maxIdsPerFile)
}

/**
 * Whether `name` is taken: by the README, by the project file, or by a name already in `taken`
 * (all compared without letter case, which a cloned gist on macOS or Windows would not keep apart).
 *
 * @param {string} name
 * @param {Set<string>} taken Lower-cased names already used.
 * @param {string | undefined} projectFileName
 * @returns {'readme' | 'project' | 'duplicate' | null}
 */
function collision(name, taken, projectFileName) {
  const lower = name.toLowerCase()
  if (lower === GIST_README_FILE.toLowerCase()) return 'readme'
  if (projectFileName !== undefined && lower === projectFileName.toLowerCase()) return 'project'
  return taken.has(lower) ? 'duplicate' : null
}

/**
 * The staged list from anything — a loaded file, a merge, a setter's argument. Untrusted: an entry
 * that is not an object of a known kind with a name is dropped, as is an empty note, a name that
 * collides, and everything past {@link GIST_EXTRAS_LIMITS.maxFiles}. Names are re-slugged and notes
 * re-cleaned, so stored values validate as clean. Unknown fields (bytes, anything) never survive.
 * Idempotent.
 *
 * @param {unknown} value
 * @param {{ projectFileName?: string }} [options] A name no file may take.
 * @returns {GistExtra[]}
 */
export function normalizeGistExtras(value, options = {}) {
  if (!Array.isArray(value)) return []
  /** @type {GistExtra[]} */
  const extras = []
  /** @type {Set<string>} */
  const taken = new Set()
  for (const item of value) {
    if (extras.length >= GIST_EXTRAS_LIMITS.maxFiles) break
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const { kind, name } = /** @type {Record<string, unknown>} */ (item)
    if (!isGistExtraKind(kind) || typeof name !== 'string') continue
    const fileName = gistExtraFileName(kind, name)
    if (collision(fileName, taken, options.projectFileName) !== null) continue
    if (kind === 'note') {
      const text = cleanNoteText(/** @type {Record<string, unknown>} */ (item).text)
      if (text === '') continue
      extras.push({ kind, name: fileName, text })
    } else {
      extras.push({ kind, name: fileName, ids: cleanIds(/** @type {Record<string, unknown>} */ (item).ids) })
    }
    taken.add(fileName.toLowerCase())
  }
  return extras
}

/**
 * Whether two staged lists say the same thing.
 *
 * @param {readonly GistExtra[]} a
 * @param {readonly GistExtra[]} b
 * @returns {boolean}
 */
export function sameGistExtras(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * A fresh, deep copy of a staged list, so no reader can change the stored one.
 *
 * @param {readonly GistExtra[]} extras
 * @returns {GistExtra[]}
 */
export function copyGistExtras(extras) {
  return extras.map((extra) => (extra.kind === 'stl' ? { kind: 'stl', name: extra.name, ids: [...extra.ids] } : { ...extra }))
}

/**
 * A staged file as a tool echoes it: a note by its length, not its text.
 *
 * @param {GistExtra} extra
 * @returns {GistExtraSummary}
 */
export function summarizeGistExtra(extra) {
  return extra.kind === 'stl'
    ? { kind: 'stl', name: extra.name, ids: [...extra.ids] }
    : { kind: 'note', name: extra.name, chars: Array.from(extra.text).length }
}

/**
 * What `stage_gist_files` stores, or why it refuses — the whole list or nothing, since an agent
 * that asked for three files and got two would describe a gist that does not exist.
 *
 * @param {unknown} files The tool's `files`: `[{ kind, ids?, name?, text? }]`; `[]` clears.
 * @param {object} context
 * @param {string} [context.projectName] The document's name: an STL's name when it gives none.
 * @param {string} [context.projectFileName] The project file's name in the gist; no file may take it.
 * @param {ReadonlySet<string>} context.bodyIds The bodies on screen now; an STL may name only these.
 * @returns {{ ok: true, extras: GistExtra[] } | { ok: false, reason: string }}
 */
export function prepareGistExtras(files, context) {
  if (!Array.isArray(files)) return { ok: false, reason: 'files must be a list' }
  const { maxFiles, maxNoteChars, maxIdsPerFile } = GIST_EXTRAS_LIMITS
  if (files.length > maxFiles) {
    return { ok: false, reason: `at most ${maxFiles} files can be staged for a gist; this list has ${files.length}` }
  }
  /** @type {GistExtra[]} */
  const extras = []
  /** @type {Set<string>} */
  const taken = new Set()
  for (const [index, item] of files.entries()) {
    const at = `files[${index}]`
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: `${at} must be an object` }
    const { kind, ids, name, text } = /** @type {Record<string, unknown>} */ (item)
    if (!isGistExtraKind(kind)) {
      return {
        ok: false,
        reason:
          `${at}.kind must be "stl" or "note". A gist holds text files only, so a 3MF or a binary STL cannot be published; ` +
          '"stl" is published as ASCII STL',
      }
    }
    if (name !== undefined && typeof name !== 'string') return { ok: false, reason: `${at}.name must be text` }
    /** @type {GistExtra} */
    let extra
    if (kind === 'note') {
      if (ids !== undefined) return { ok: false, reason: `${at} is a note, which takes no ids` }
      if (typeof text !== 'string') return { ok: false, reason: `${at} is a note and needs text` }
      if (text.length > maxNoteChars * 4) {
        return { ok: false, reason: `${at}'s note is longer than ${maxNoteChars.toLocaleString('en-US')} characters` }
      }
      const scrubbed = scrubNote(text)
      if (scrubbed === '') return { ok: false, reason: `${at}'s note is empty: it has no text once control characters are removed` }
      const length = Array.from(scrubbed).length
      if (length > maxNoteChars) {
        return { ok: false, reason: `${at}'s note is ${length.toLocaleString('en-US')} characters; at most ${maxNoteChars.toLocaleString('en-US')} are allowed` }
      }
      extra = { kind, name: gistExtraFileName(kind, name), text: scrubbed }
    } else {
      if (text !== undefined) return { ok: false, reason: `${at} is an STL, which takes no text (stage a note for that)` }
      if (context.bodyIds.size === 0) return { ok: false, reason: `${at} is an STL, but the project has no bodies to export` }
      if (ids !== undefined && (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))) {
        return { ok: false, reason: `${at}.ids must be a list of body ids` }
      }
      const wanted = /** @type {string[] | undefined} */ (ids) ?? []
      if (wanted.length > maxIdsPerFile) return { ok: false, reason: `${at} names ${wanted.length} bodies; at most ${maxIdsPerFile} are allowed` }
      const unknown = wanted.find((id) => !context.bodyIds.has(id))
      if (unknown !== undefined) {
        return { ok: false, reason: `${at} names ${JSON.stringify(unknown)}, which is not a body on screen; take ids from describe_scene` }
      }
      extra = { kind, name: gistExtraFileName(kind, name, context.projectName ?? ''), ids: [...new Set(wanted)] }
    }
    const clash = collision(extra.name, taken, context.projectFileName)
    if (clash === 'readme') return { ok: false, reason: `${at} would be named "${extra.name}", which would replace the gist's ${GIST_README_FILE}; choose another name` }
    if (clash === 'project') return { ok: false, reason: `${at} would be named "${extra.name}", the project file's own name; choose another name` }
    if (clash === 'duplicate') return { ok: false, reason: `two files would both be named "${extra.name}"; give each its own name` }
    taken.add(extra.name.toLowerCase())
    extras.push(extra)
  }
  return { ok: true, extras }
}

/**
 * A staged note as the gist file's text (`TODO/io-040`): the agent's Markdown with HTML made
 * literal (`&`, `<`, `>`) and every `@` broken (`&#64;` renders as `@` and mentions no one), so a
 * note is data on GitHub, not markup or a ping. Lists, bold and code in it still render. Ends in a
 * newline.
 *
 * @param {string} text A stored note ({@link cleanNoteText}).
 * @returns {string}
 */
export function noteFileContent(text) {
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@/g, '&#64;')
  return safe.endsWith('\n') ? safe : `${safe}\n`
}
