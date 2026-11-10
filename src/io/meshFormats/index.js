// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The model-file formats **File → Import model…** reads (`TODO/io-009`), keyed by extension.
 *
 * Each entry is a parser to the same `{ positions, indices }` contract, so a follow-up
 * format (OBJ — sized in `docs/decisions/mesh-import.md`) is one entry here and one parser
 * module, and nothing downstream changes.
 *
 * **The stated exception is 3MF** (`TODO/io-024`): a parser may answer with a promise (3MF
 * inflates a zip entry, which is asynchronous) and with several placed meshes —
 * `{ parts: [{ name, positions, indices, matrix }], unitScale, duplicates, skippedObjects }` —
 * which `../meshJob.js` turns into an assembly part. A single-mesh answer is unchanged.
 *
 * The extension picks the parser; it is never trusted beyond that. Each parser sniffs its
 * bytes itself, and a file with no extension at all is offered to every format's sniffer.
 *
 * STEP / IGES / BREP are deliberately absent: they are exact B-rep, not meshes, and reading
 * them needs a B-rep kernel the committed mesh kernel cannot stand in for (`TODO/io-025`). A
 * STEP file dropped on the Library is refused by name, with what to do instead.
 *
 * @module io/meshFormats
 */

import { MESH_LIMITS } from '../meshAsset.js'
import { parseStl, sniffStl } from './stl.js'
import { parseThreeMf, sniffThreeMf } from './threeMf.js'

/**
 * @typedef {object} MeshFormat
 * @property {string} id
 * @property {string} label What a message calls it.
 * @property {readonly string[]} extensions Lowercase, with the dot.
 * @property {(bytes: Uint8Array) => boolean} sniff Whether the bytes look like this format.
 * @property {boolean} [magic] Whether `sniff` checks a signature, so it is asked before the rest.
 * @property {(bytes: Uint8Array, limits?: import('../meshAsset.js').MeshLimits) => MeshParseResult | Promise<MeshParseResult>} parse
 */

/**
 * @typedef {{ ok: true, format: string, positions: Float32Array, indices: Uint32Array, triangleCount: number }
 *   | import('../meshJob.js').ParsedAssembly
 *   | { ok: false, reason: string }} MeshParseResult
 */

/** What a STEP file is told (`TODO/io-024`): it is not read yet (`TODO/io-025`). */
export const STEP_REFUSAL = 'STEP files are not read yet. Export 3MF or STL from your CAD program'

/**
 * Why a file is refused by its name alone, before it is read, or `null`.
 *
 * @param {string} name
 * @returns {string | null}
 */
export function unsupportedFormatReason(name) {
  return /\.(step|stp)$/i.test(String(name)) ? STEP_REFUSAL : null
}

/** @type {readonly MeshFormat[]} */
export const MESH_FORMATS = Object.freeze([
  Object.freeze({
    id: 'stl',
    label: 'STL',
    extensions: Object.freeze(['.stl']),
    sniff: (/** @type {Uint8Array} */ bytes) => sniffStl(bytes) !== null,
    parse: parseStl,
  }),
  // A model file of several placed parts (`TODO/io-024`), read without any dependency.
  Object.freeze({
    id: '3mf',
    label: '3MF',
    extensions: Object.freeze(['.3mf']),
    magic: true,
    sniff: sniffThreeMf,
    parse: (/** @type {Uint8Array} */ bytes, /** @type {import('../meshAsset.js').MeshLimits | undefined} */ limits) => parseThreeMf(bytes, limits),
  }),
])

/**
 * The format a file name's extension names, or `null`.
 *
 * @param {string} name
 * @returns {MeshFormat | null}
 */
export function formatForName(name) {
  const lower = String(name).toLowerCase()
  return MESH_FORMATS.find((format) => format.extensions.some((extension) => lower.endsWith(extension))) ?? null
}

/**
 * The file input's `accept` attribute: every extension a parser exists for.
 *
 * @returns {string}
 */
export function acceptAttribute() {
  return MESH_FORMATS.flatMap((format) => format.extensions).join(',')
}

/** What a refusal of an unknown type says. */
function supportedList() {
  return MESH_FORMATS.map((format) => `${format.label} (${format.extensions.join(', ')})`).join(' or ')
}

/**
 * Parse a model file by name and bytes. Never rejects.
 *
 * @param {string} name
 * @param {Uint8Array} bytes
 * @param {import('../meshAsset.js').MeshLimits} [limits]
 * @returns {Promise<MeshParseResult>}
 */
export async function parseMeshFile(name, bytes, limits = MESH_LIMITS) {
  const unsupported = unsupportedFormatReason(name)
  if (unsupported !== null) return { ok: false, reason: unsupported }
  const named = formatForName(name)
  if (named !== null) return named.parse(bytes, limits)
  const hasExtension = /\.[A-Za-z0-9]{1,8}$/.test(String(name))
  if (!hasExtension) {
    // A format with a magic number (3MF's zip signature) is asked first: STL's sniffer takes any
    // file of 84 bytes or more for a binary STL.
    const ordered = [...MESH_FORMATS.filter((format) => format.magic), ...MESH_FORMATS.filter((format) => !format.magic)]
    const sniffed = ordered.find((format) => format.sniff(bytes))
    if (sniffed !== undefined) return sniffed.parse(bytes, limits)
  }
  return { ok: false, reason: `Choose a model file: ${supportedList()}` }
}
