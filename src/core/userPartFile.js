// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The part file behind *Export part file* and *Import part file…* (`TODO/ui-055`): plain JSON
 * carrying one or more user-part definitions (a part and the parts it nests), and optionally
 * their thumbnails. It is a **file from somewhere else**, so it is untrusted exactly as a
 * project file is: every definition goes through `validateUserPart` / `validateUserPartSet`
 * (the same caps, the same allowed-ops list), a thumbnail is kept only if it is a small PNG
 * data URL, and size and count limits are checked before anything is parsed or validated.
 *
 * Framework-free; no storage and no DOM — the store reads the file and writes the library.
 *
 * @module core/userPartFile
 */

import { USER_PART_LIMITS, validateUserPart, validateUserPartSet } from './userPart.js'

/** @typedef {import('./userPart.js').UserPartDefinition} UserPartDefinition */
/** @typedef {import('./userPart.js').UserPartProblem} UserPartProblem */

export const PART_FILE_FORMAT = 'warpcad-parts'
export const PART_FILE_VERSION = 1
/** A part file longer than this is refused unread (UTF-16 code units, about 16 MB). */
export const MAX_PART_FILE_CHARS = 8_000_000
/** The longest thumbnail data URL kept, characters. A 96 px flat-shaded PNG is a few KB. */
export const MAX_THUMBNAIL_CHARS = 64_000
export const THUMBNAIL_PNG_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/

/**
 * Whether `value` is a thumbnail it is safe to put in an `<img src>`: a PNG data URL of
 * bounded size. Anything else — a remote URL, a `javascript:` URL, an SVG — is dropped.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isThumbnailUrl(value) {
  return typeof value === 'string' && value.length <= MAX_THUMBNAIL_CHARS && THUMBNAIL_PNG_PATTERN.test(value)
}

/**
 * @param {readonly UserPartDefinition[]} definitions
 * @param {Readonly<Record<string, string>>} [thumbnails] op → PNG data URL.
 * @returns {string}
 */
export function serializePartFile(definitions, thumbnails = {}) {
  const kept = Object.fromEntries(Object.entries(thumbnails).filter(([, url]) => isThumbnailUrl(url)))
  return JSON.stringify(
    {
      format: PART_FILE_FORMAT,
      version: PART_FILE_VERSION,
      parts: definitions,
      ...(Object.keys(kept).length > 0 ? { thumbnails: kept } : {}),
    },
    null,
    2
  )
}

/**
 * @param {string} reason
 * @returns {{ parts: UserPartDefinition[], thumbnails: Record<string, string>, problems: UserPartProblem[] }}
 */
function refused(reason) {
  return { parts: [], thumbnails: {}, problems: [{ op: null, reason }] }
}

/**
 * Read a part file. Never throws: a file that is not one is a named problem.
 *
 * @param {string} text
 * @returns {{ parts: UserPartDefinition[], thumbnails: Record<string, string>, problems: UserPartProblem[] }}
 */
export function parsePartFile(text) {
  if (typeof text !== 'string' || text.length > MAX_PART_FILE_CHARS) {
    return refused('That file is too large to be a part file')
  }
  /** @type {any} */
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return refused('That file is not valid JSON, so it is not a part file')
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data) || data.format !== PART_FILE_FORMAT) {
    return refused('That is not a WarpCad part file')
  }
  if (typeof data.version !== 'number' || data.version > PART_FILE_VERSION) {
    return refused(`This part file is from a newer version of WarpCad (file version ${data.version}) — update the app to read it`)
  }
  if (!Array.isArray(data.parts)) return refused('That part file has no parts in it')
  if (data.parts.length > USER_PART_LIMITS.maxPartsPerProject) {
    return refused(`That part file has ${data.parts.length} parts; at most ${USER_PART_LIMITS.maxPartsPerProject} are read`)
  }

  /** @type {UserPartProblem[]} */
  const problems = []
  /** @type {UserPartDefinition[]} */
  const valid = []
  for (const raw of data.parts) {
    const verdict = validateUserPart(raw)
    if (verdict.ok) valid.push(verdict.definition)
    else problems.push({ op: verdict.op, reason: verdict.reason })
  }
  const checked = validateUserPartSet(valid)
  problems.push(...checked.problems)

  /** @type {Record<string, string>} */
  const thumbnails = {}
  const offered = data.thumbnails !== null && typeof data.thumbnails === 'object' ? data.thumbnails : {}
  for (const part of checked.definitions) {
    const url = Object.hasOwn(offered, part.op) ? offered[part.op] : undefined
    if (isThumbnailUrl(url)) thumbnails[part.op] = url
  }
  return { parts: checked.definitions, thumbnails, problems }
}

/**
 * The suggested download name for a part: its slug, so two parts never share one.
 *
 * @param {string} op `user.<slug>`
 * @returns {string}
 */
export function partFileName(op) {
  return `${op.replace(/^user\./, '')}.warpcad-part.json`
}
