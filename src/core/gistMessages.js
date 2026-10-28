// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a person reads when a gist call fails or warns (`TODO/io-017`, Stage 2).
 *
 * One fixed sentence per failure kind and situation. **Nothing is ever filled in**: no server
 * text, no token, no gist id, no project name — `gistBackend.js` already keeps server text out of
 * its errors, and this module does not read even those messages, only the error's `kind`. A kind
 * this module does not know gets the generic sentence, never its own text.
 *
 * The situations differ because the same failure means different things to the two people
 * involved: a missing gist is "this shared project can't be found" to someone who followed a
 * link, and "the gist was deleted on GitHub" to its owner pressing **Update**; "no network" while
 * sending adds that the project is still saved in this browser, because it always is.
 *
 * Also here: {@link plainGistDescription}, the gist's `description` made safe to show as text.
 *
 * Framework-free.
 *
 * @module core/gistMessages
 */

/** A rate-limited read (60 an hour per IP for an unauthenticated read; a classroom shares one). */
export const GIST_BUSY_MESSAGE = 'GitHub is busy. Try again in a few minutes.'

/** A classic token whose scopes go beyond `gist` (`gistBackend.js`'s `broaderThanNeeded`). */
export const BROADER_THAN_NEEDED_MESSAGE = 'This token can do more than WarpCad needs. Make a new one with only the gist box ticked.'

/** Longest gist description shown, in code points. */
export const MAX_GIST_DESCRIPTION_CHARS = 200

/**
 * Where the failure happened: `open` — following a `#/gist/<id>` link (the recipient);
 * `connect` — the token dialog; `publish`, `update`, `stop` — the owner's three actions.
 *
 * @typedef {'open' | 'connect' | 'publish' | 'update' | 'stop'} GistMessageContext
 */

/**
 * `gistBackend.js`'s failure kinds, plus the ones Stage 2 adds: `unreadable` (the gist's file
 * did not load as a project), `invalid-link` (a `#/gist/` hash with no valid id),
 * `changed-remotely` (the interim update rule), `not-connected`, `no-bodies`, `busy`,
 * `already-published`, `not-published`, `storage` (the browser would not store the token), and
 * `unknown` (anything that is not a gist failure).
 *
 * @typedef {import('../storage/gistBackend.js').GistFailureKind | 'unreadable' | 'invalid-link'
 *   | 'changed-remotely' | 'not-connected' | 'no-bodies' | 'busy' | 'already-published'
 *   | 'not-published' | 'storage' | 'unknown'} GistMessageKind
 */

/** @type {readonly GistMessageContext[]} */
export const GIST_MESSAGE_CONTEXTS = Object.freeze(['open', 'connect', 'publish', 'update', 'stop'])

/** @type {readonly GistMessageKind[]} */
export const GIST_MESSAGE_KINDS = Object.freeze([
  'unauthorized',
  'forbidden',
  'rate-limited',
  'not-found',
  'conflict',
  'offline',
  'server',
  'malformed',
  'invalid',
  'empty',
  'no-project-file',
  'ambiguous',
  'too-large',
  'untrusted-host',
  'unreadable',
  'invalid-link',
  'changed-remotely',
  'not-connected',
  'no-bodies',
  'busy',
  'already-published',
  'not-published',
  'storage',
  'unknown',
])

const SAFE = 'Your project is still saved in this browser.'
const CANT_BE_FOUND = "This shared project can't be found."
const CANT_BE_OPENED = "This shared project can't be opened."
const GENERIC = 'Something went wrong talking to GitHub. Try again in a few minutes.'
const TOKEN_REJECTED = 'GitHub rejected this token. It may have expired or been revoked. Connect again with a new token.'
const NO_GIST_PERMISSION = "This token can't write gists. Make a new token with only the Gists permission (read and write)."
const CHANGED_REMOTELY = 'This gist changed since you last published it. Open its link first, then update.'

/** What a recipient following a link reads. @type {Partial<Record<GistMessageKind, string>>} */
const OPEN = {
  'rate-limited': GIST_BUSY_MESSAGE,
  'not-found': `${CANT_BE_FOUND} It may have been deleted, or the link may be wrong.`,
  empty: `${CANT_BE_FOUND} The gist is empty.`,
  'no-project-file': `${CANT_BE_FOUND} The gist has no WarpCad project in it.`,
  ambiguous: `${CANT_BE_FOUND} The gist holds more than one project and none is named project.ndjson.`,
  unreadable: `${CANT_BE_OPENED} It may be damaged, or made by a newer WarpCad.`,
  malformed: `${CANT_BE_OPENED} GitHub's answer could not be read.`,
  'too-large': 'This shared project is too large to open.',
  'untrusted-host': `${CANT_BE_OPENED} It points somewhere WarpCad does not read from.`,
  'invalid-link': 'This link looks incomplete. Check that you copied all of it.',
  invalid: 'This link looks incomplete. Check that you copied all of it.',
  offline: 'No network. Check your connection and try again.',
  server: 'GitHub is having trouble right now. Try again in a few minutes.',
  forbidden: "GitHub refused to show this shared project.",
  unauthorized: "GitHub refused to show this shared project.",
}

/** What the owner reads while connecting, publishing, updating or stopping. @type {Partial<Record<GistMessageKind, string>>} */
const SEND = {
  unauthorized: TOKEN_REJECTED,
  forbidden: NO_GIST_PERMISSION,
  'rate-limited': GIST_BUSY_MESSAGE,
  'not-found': "That gist can't be found. It may have been deleted on GitHub.",
  conflict: `${CHANGED_REMOTELY}`,
  'changed-remotely': CHANGED_REMOTELY,
  offline: `No network. ${SAFE}`,
  server: `GitHub is having trouble right now. ${SAFE}`,
  malformed: `GitHub's answer could not be read. ${SAFE}`,
  invalid: `GitHub did not accept this project. ${SAFE}`,
  'too-large': `This project is too large to publish as a gist. ${SAFE}`,
  'not-connected': 'Connect GitHub for short links first.',
  'no-bodies': 'Add something to the project before publishing it.',
  busy: 'WarpCad is already talking to GitHub. Wait for it to finish.',
  'already-published': 'This project is already published. Use Update gist instead.',
  'not-published': 'This project is not published as a gist from this GitHub account.',
  storage: "This browser wouldn't store the token, so it is not connected. Check that site storage is allowed.",
}

/** What the connect dialog reads, where it differs. @type {Partial<Record<GistMessageKind, string>>} */
const CONNECT = {
  invalid: 'That does not look like a GitHub token. Paste the whole token.',
  offline: "No network, so the token couldn't be checked. Try again when you're online.",
  server: "GitHub is having trouble right now, so the token couldn't be checked. Try again in a few minutes.",
  malformed: "GitHub's answer could not be read, so the token couldn't be checked. Try again.",
}

/**
 * The sentence for a failure.
 *
 * @param {GistMessageKind} kind
 * @param {GistMessageContext} context
 * @returns {string} Fixed wording, never anything passed in.
 */
export function gistMessage(kind, context) {
  const known = typeof kind === 'string' && GIST_MESSAGE_KINDS.includes(kind)
  if (!known) return GENERIC
  /** @type {Partial<Record<GistMessageKind, string>>[]} */
  const tables = context === 'open' ? [OPEN] : context === 'connect' ? [CONNECT, SEND] : [SEND]
  for (const table of tables) {
    if (Object.hasOwn(table, kind)) return /** @type {string} */ (table[kind])
  }
  return GENERIC
}

/**
 * @typedef {{ ok: false, kind: GistMessageKind, message: string }} GistFailure
 */

/**
 * A thrown value as a failure to show: a gist error's `kind` (`GistError`, or its
 * `HostedError` base) and the fixed sentence; anything else is `unknown`. Reads only `kind` —
 * never the error's message, which could carry server text.
 *
 * @param {unknown} error
 * @param {GistMessageContext} context
 * @returns {GistFailure}
 */
export function gistFailureOf(error, context) {
  const kind = /** @type {any} */ (error)?.kind
  /** @type {GistMessageKind} */
  const known = error instanceof Error && typeof kind === 'string' && GIST_MESSAGE_KINDS.includes(/** @type {any} */ (kind))
    ? /** @type {GistMessageKind} */ (kind)
    : 'unknown'
  return { ok: false, kind: known, message: gistMessage(known, context) }
}

/** Bidi embedding, override and isolate controls: they reorder what a reader sees. */
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/g
/** C0/C1 controls and line or paragraph separators. */
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g

/**
 * The gist's `description`, untrusted, as one line of plain text: controls and bidi overrides
 * gone, whitespace collapsed, at most {@link MAX_GIST_DESCRIPTION_CHARS} code points (the last
 * an ellipsis when cut). HTML and Markdown are left exactly as typed: the screen renders this as
 * text, so `<img onerror>` is shown, not run.
 *
 * @param {unknown} value
 * @returns {string} `''` for anything that is not text.
 */
export function plainGistDescription(value) {
  if (typeof value !== 'string') return ''
  const line = value.replace(BIDI_CONTROLS, '').replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim()
  const points = Array.from(line)
  return points.length <= MAX_GIST_DESCRIPTION_CHARS ? line : points.slice(0, MAX_GIST_DESCRIPTION_CHARS - 1).join('') + '…'
}
