// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The plain-language sentence for a kernel or document message, for the **display boundary**
 * only (`TODO/ui-129`).
 *
 * The kernel's messages name the op and the parameter (`primitive.cylinder: height must be a
 * positive number of millimetres, got 0`) because the console, the MCP tools and the tests need
 * exactly that. A person reading the Inspector, a popover or a History row needs the sentence.
 * This maps the known messages to one and returns anything it does not know untouched, so a new
 * kernel message degrades to its raw text and never to an empty string.
 *
 * Framework-free and pure: it never reads the document and never throws.
 *
 * @module core/userReason
 */

/** A replica's project tag: base-36 digits and letters, at least one digit (so `phone` is a word, not a tag). */
const TAG = '(?=[a-z]*\\d)[a-z0-9]{4,8}'
/** `cuboid-k3f5xa-1`: a kind, the project tag, a counter. Groups: kind, counter (the whole is group 0). */
const BASE_ID = `([a-z][a-z0-9]*)-${TAG}-(\\d+)`
const ID_IN_TEXT = new RegExp(`\\b[a-z][a-z0-9]*-${TAG}-\\d+(?:-[a-z]+-${TAG}-\\d+)?\\b`, 'g')

/** `size[0]` → `Size X`; `height` → `Height`; `cornerRadius` → `Corner radius`. */
const AXES = ['X', 'Y', 'Z']

/**
 * @param {string} key a parameter path as the kernel names it
 * @returns {string} the label a person would read
 */
function labelOfParam(key) {
  const indexed = /^(\w+)\[(\d)\]$/.exec(key)
  if (indexed) return `${labelOfParam(indexed[1])} ${AXES[Number(indexed[2])] ?? indexed[2]}`
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** @param {string} text @returns {string} the number as a person writes it: no sign, no trailing zeros */
const plainNumber = (text) => String(Math.abs(Number(text)))

/**
 * @param {unknown} message a raw `Error.message` (or a string)
 * @returns {string} a sentence a user can act on, or the message unchanged when it is not one this knows
 */
export function userReason(message) {
  const text = typeof message === 'string' ? message : message instanceof Error ? message.message : String(message ?? '')
  // The document wraps a rejected record as `document.append: <op> could not be applied — <kernel text>`.
  const core = text.replace(/^document\.append: /, '').replace(/^\S+ could not be applied — /, '')

  // A fillet or chamfer radius at or past the solid's extent.
  const fillet = /^[\w.]+: radius (-?[\d.]+)mm must be narrower than the solid's ([\d.]+)mm extent along the axis$/.exec(core)
  if (fillet) {
    return `A ${plainNumber(fillet[1])} mm radius is too large for this ${plainNumber(fillet[2])} mm part. Use a radius smaller than ${plainNumber(fillet[2])} mm.`
  }

  // A size field that must be more than zero.
  const positive = /^[\w.]+: ([\w[\]]+) must be a positive number of millimetres, got .*$/.exec(core)
  if (positive) return `${labelOfParam(positive[1])} must be more than 0 mm.`

  // A step that points at a body a later step already replaced.
  if (/which has itself already been superseded by ".*" — forking a lineage would put two live representations of one body on screen$/.test(core)) {
    return "This step can't be built because another step already changed the part it works on, for example a move you made while you were rolled back. Use Re-link to follow the moved part, or edit the earlier step."
  }
  return text
}

/**
 * A record id as a person reads it: the project tag every replica adds is dropped, the counter
 * kept. `cuboid-k3f5xa-1` → `Cuboid 1`; `cuboid-k3f5xa-1-move-k3f5xa-4` → `Move of Cuboid 1 (4)`.
 * Anything that does not look like a replica id comes back unchanged. The full id stays in the
 * tooltip, the raw log and the MCP responses; this is for the readout only.
 *
 * @param {string} id
 * @returns {string}
 */
export function plainRecordId(id) {
  const base = new RegExp(`^${BASE_ID}$`).exec(id)
  if (base) return `${capitalise(base[1])} ${base[2]}`
  const derived = new RegExp(`^(${BASE_ID})-([a-z]+)-${TAG}-(\\d+)$`).exec(id)
  if (derived) return `${capitalise(derived[4])} of ${plainRecordId(derived[1])} (${derived[5]})`
  return id
}

/**
 * Every replica id inside a sentence, tidied by {@link plainRecordId}; the rest of the text is
 * untouched. For a readout that quotes ids (the Assistant's activity rows).
 *
 * @param {string} text
 * @returns {string}
 */
export function plainIdsIn(text) {
  if (typeof text !== 'string' || text === '') return text
  return text.replace(ID_IN_TEXT, (match) => plainRecordId(match))
}

/** @param {string} word @returns {string} */
function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
