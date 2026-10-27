// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The share link: a whole project carried inside a URL fragment (`TODO/io-016`).
 *
 * Format `v1`: `<host>/#/share/v1/<base64url>`, where the payload is `deflate-raw` of one
 * JSON preamble line (`{"name":…,"note":…}`) followed by the project's NDJSON. The fragment is
 * never sent to a server, so the project stays out of host logs and analytics. The version
 * lives in the path so a future `v2` is recognised and refused politely by this build.
 *
 * Everything that arrives in a link is hostile data (`CLAUDE.md`): the compressed length is
 * capped before decoding, the decompressed length is capped **while streaming**, and any
 * line that does not parse refuses the whole link — a half-parsed project is never returned.
 * The records that come back are exactly what `parseNdjson` gives **Open…**, so every
 * existing validator downstream applies unchanged.
 *
 * Pure and framework-free: string and bytes in, string and bytes out, via the web
 * `CompressionStream`/`DecompressionStream` that all three target engines ship.
 *
 * @module core/shareLink
 */

import { parseNdjson, serializeNdjson } from './ndjson.js'

/** The canonical host (`docs/decisions/hosting.md`) — never `location.origin`, which is
 * `tauri://localhost` or the dev server inside the native shell and the dev host. */
export const SHARE_HOST = 'https://app.warpcad.com'
/** The only format version this build reads and writes. */
export const SHARE_VERSION = 'v1'
/** Longest accepted payload, in base64url characters, checked before any decoding. */
export const MAX_PAYLOAD_CHARS = 2_000_000
/** Longest accepted decompressed payload, in bytes, enforced while streaming. */
export const MAX_DECOMPRESSED_BYTES = 8 * 1024 * 1024
/** Name shown when a link or a project carries none. */
export const DEFAULT_SHARE_NAME = 'Untitled'

const ROUTE_PATTERN = /#\/share\/([^/?#\s]*)\/?([^\s]*)$/

/**
 * @typedef {object} ShareOptions
 * @property {string} [name] Title the recipient sees; empty or blank becomes `Untitled`.
 * @property {string} [note] A short message from the sender.
 * @property {string} [host] Override of {@link SHARE_HOST}, for tests.
 */

/**
 * @typedef {{ ok: true, records: object[], name: string, note: string }
 *   | { ok: false, reason: ShareFailure }} ShareDecoded
 */

/**
 * Why a link could not be read: `not-share-link` (no share route in the text),
 * `unsupported-version` (a `vN` this build does not know), `too-large` (over a cap),
 * `malformed` (not base64url, or not a compressed payload — typically truncated),
 * `corrupt` (it decompressed but is not a project).
 *
 * @typedef {'not-share-link' | 'unsupported-version' | 'too-large' | 'malformed' | 'corrupt'} ShareFailure
 */

/**
 * @param {Uint8Array} bytes
 * @returns {string} Unpadded base64url.
 */
function toBase64Url(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * @param {string} text
 * @returns {Uint8Array | null} `null` when `text` is not base64url.
 */
function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>} The `deflate-raw` compression of `bytes`.
 */
async function deflate(bytes) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Inflate `bytes`, aborting as soon as the output passes `limit` so a tiny deflate bomb never
 * gets to allocate its full size.
 *
 * @param {Uint8Array} bytes
 * @param {number} limit Maximum output length in bytes.
 * @returns {Promise<Uint8Array | 'too-large'>} The output, or `'too-large'`.
 * @throws When `bytes` is not a complete `deflate-raw` stream.
 */
async function inflate(bytes, limit) {
  const source = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = source.getReader()
  /** @type {Uint8Array[]} */
  const parts = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      await reader.cancel()
      return 'too-large'
    }
    parts.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * @param {unknown} name
 * @returns {string} A non-empty display name.
 */
function displayName(name) {
  return typeof name === 'string' && name.trim() !== '' ? name : DEFAULT_SHARE_NAME
}

/**
 * Build a share link for a project.
 *
 * @param {readonly object[]} records The project's NDJSON records (`parseNdjson(...).records`).
 * @param {ShareOptions} [options]
 * @returns {Promise<string>} `<host>/#/share/v1/<payload>`.
 */
export async function encodeShareLink(records, options = {}) {
  const preamble = JSON.stringify({ name: displayName(options.name), note: typeof options.note === 'string' ? options.note : '' })
  const text = preamble + '\n' + serializeNdjson(records)
  const payload = toBase64Url(await deflate(new TextEncoder().encode(text)))
  return `${options.host ?? SHARE_HOST}/#/share/${SHARE_VERSION}/${payload}`
}

/**
 * Whether `text` contains a `#/share/…` route at all, whatever its version or payload — what
 * boot uses to decide to show the Shared view or the "looks incomplete" screen.
 *
 * @param {string} text A hash (`#/share/v1/…`), a relative `/#/share/…` or a full URL.
 * @returns {boolean}
 */
export function isShareLink(text) {
  return typeof text === 'string' && ROUTE_PATTERN.test(text)
}

/**
 * Read a share link. Never throws: every failure is `{ ok: false, reason }`.
 *
 * @param {string} hashOrUrl A hash, a relative `/#/share/…` or a full URL.
 * @returns {Promise<ShareDecoded>}
 */
export async function decodeShareLink(hashOrUrl) {
  const match = typeof hashOrUrl === 'string' ? ROUTE_PATTERN.exec(hashOrUrl) : null
  if (!match) return { ok: false, reason: 'not-share-link' }
  if (match[1] !== SHARE_VERSION) return { ok: false, reason: 'unsupported-version' }
  const payload = match[2]
  if (payload.length > MAX_PAYLOAD_CHARS) return { ok: false, reason: 'too-large' }
  const compressed = fromBase64Url(payload)
  if (!compressed || compressed.length === 0) return { ok: false, reason: 'malformed' }

  /** @type {Uint8Array | 'too-large'} */
  let inflated
  try {
    inflated = await inflate(compressed, MAX_DECOMPRESSED_BYTES)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (inflated === 'too-large') return { ok: false, reason: 'too-large' }

  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(inflated)
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  const newline = text.indexOf('\n')
  /** @type {any} */
  let preamble
  try {
    preamble = JSON.parse(newline === -1 ? text : text.slice(0, newline))
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  if (preamble === null || typeof preamble !== 'object' || Array.isArray(preamble)) return { ok: false, reason: 'corrupt' }

  const { records, errors } = parseNdjson(newline === -1 ? '' : text.slice(newline + 1))
  if (errors.length > 0) return { ok: false, reason: 'corrupt' }
  if (records.some((record) => record === null || typeof record !== 'object' || Array.isArray(record))) {
    return { ok: false, reason: 'corrupt' }
  }
  return {
    ok: true,
    records,
    name: displayName(preamble.name),
    note: typeof preamble.note === 'string' ? preamble.note : '',
  }
}
