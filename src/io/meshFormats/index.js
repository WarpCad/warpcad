// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The model-file formats **Import model file…** reads (`TODO/io-009`), keyed by extension.
 *
 * Each entry is a pure parser to the same `{ positions, indices }` contract, so a follow-up
 * format (OBJ, 3MF — sized in `docs/decisions/mesh-import.md`) is one entry here and one
 * parser module, and nothing downstream changes. STL is the only one shipped.
 *
 * The extension picks the parser; it is never trusted beyond that. Each parser sniffs its
 * bytes itself, and a file with no extension at all is offered to every format's sniffer.
 *
 * STEP / IGES / BREP are deliberately absent: they are exact B-rep, not meshes, and reading
 * them needs a B-rep kernel the committed mesh kernel cannot stand in for.
 *
 * @module io/meshFormats
 */

import { MESH_LIMITS } from '../meshAsset.js'
import { parseStl, sniffStl } from './stl.js'

/**
 * @typedef {object} MeshFormat
 * @property {string} id
 * @property {string} label What a message calls it.
 * @property {readonly string[]} extensions Lowercase, with the dot.
 * @property {(bytes: Uint8Array) => boolean} sniff Whether the bytes look like this format.
 * @property {(bytes: Uint8Array, limits?: import('../meshAsset.js').MeshLimits) => MeshParseResult} parse
 */

/**
 * @typedef {{ ok: true, format: string, positions: Float32Array, indices: Uint32Array, triangleCount: number }
 *   | { ok: false, reason: string }} MeshParseResult
 */

/** @type {readonly MeshFormat[]} */
export const MESH_FORMATS = Object.freeze([
  Object.freeze({
    id: 'stl',
    label: 'STL',
    extensions: Object.freeze(['.stl']),
    sniff: (/** @type {Uint8Array} */ bytes) => sniffStl(bytes) !== null,
    parse: parseStl,
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
 * Parse a model file by name and bytes. Never throws.
 *
 * @param {string} name
 * @param {Uint8Array} bytes
 * @param {import('../meshAsset.js').MeshLimits} [limits]
 * @returns {MeshParseResult}
 */
export function parseMeshFile(name, bytes, limits = MESH_LIMITS) {
  const named = formatForName(name)
  if (named !== null) return named.parse(bytes, limits)
  const hasExtension = /\.[A-Za-z0-9]{1,8}$/.test(String(name))
  if (!hasExtension) {
    const sniffed = MESH_FORMATS.find((format) => format.sniff(bytes))
    if (sniffed !== undefined) return sniffed.parse(bytes, limits)
  }
  return { ok: false, reason: `Choose a model file: ${supportedList()}` }
}
