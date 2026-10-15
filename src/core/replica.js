// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Replica ids and the Lamport clock behind replica-scoped record ids (`TODO/data-008`,
 * `docs/decisions/document-sync.md`).
 *
 * Two writers must never mint the same record id. Each document instance is a **replica**
 * with its own short random id, and counts with a **Lamport clock** that is always ahead of
 * every stamp it has read. An id is `prefix-replica-counter`; a stamp is the pair
 * `(counter, replica)`, which orders totally — counter first, replica id as the tiebreak.
 *
 * Framework-free (CLAUDE.md `src/core/`): no DOM, no Vue. The random source is injected so
 * a spec passes a fixed one.
 */

/** 32 symbols → 5 bits each, so a six-character id is 30 bits. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

/** Length of a replica id, in characters. */
export const REPLICA_ID_LENGTH = 6

const REPLICA_PATTERN = new RegExp(`^[a-z2-7]{${REPLICA_ID_LENGTH}}$`)

/**
 * @param {number} length
 * @returns {Uint8Array}
 */
function cryptoRandomBytes(length) {
  return globalThis.crypto.getRandomValues(new Uint8Array(length))
}

/**
 * A new replica id.
 *
 * **One per document instance, never shared.** A page reload gets a new one and two tabs
 * never share one — that is the property every other guarantee here leans on: a clock is
 * unique only because no other writer counts under its replica id.
 *
 * @param {(length: number) => Uint8Array} [randomBytes] Injected byte source; defaults to
 *   `crypto.getRandomValues`. A spec passes a fixed one.
 * @returns {string} Six characters of `a-z2-7`.
 */
export function createReplicaId(randomBytes = cryptoRandomBytes) {
  const bytes = randomBytes(REPLICA_ID_LENGTH)
  let id = ''
  for (let i = 0; i < REPLICA_ID_LENGTH; i += 1) id += ALPHABET[bytes[i] & 31]
  return id
}

/** Length of a minted project id, in characters: 80 random bits (`TODO/data-013`). */
export const PROJECT_ID_LENGTH = 16

/**
 * A new project id (`TODO/data-013`): what says two files are copies of one project.
 *
 * Unlike a replica id it is **shared**: every copy of a project, on every device, carries the
 * one id its document minted on its first change. It is long enough (80 bits) that two
 * projects started anywhere never collide, and fits the file's `merge.project` rule
 * (`src/core/merge/validate.js`: short, lowercase).
 *
 * @param {(length: number) => Uint8Array} [randomBytes] Injected byte source; defaults to
 *   `crypto.getRandomValues`.
 * @returns {string} Sixteen characters of `a-z2-7`.
 */
export function createProjectId(randomBytes = cryptoRandomBytes) {
  const bytes = randomBytes(PROJECT_ID_LENGTH)
  let id = ''
  for (let i = 0; i < PROJECT_ID_LENGTH; i += 1) id += ALPHABET[bytes[i] & 31]
  return id
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isReplicaId(value) {
  return typeof value === 'string' && REPLICA_PATTERN.test(value)
}

const ID_COUNTER_PATTERN = new RegExp(`-[a-z2-7]{${REPLICA_ID_LENGTH}}-(\\d+)$`)

/**
 * The Lamport counter a record id carries, for a clock to observe on load.
 *
 * A replica-scoped id ends `-<replica>-<counter>`; a legacy id (`op-7`) carries none and
 * reads `0`. Reading only — nothing is ever rewritten, so a legacy file stays byte-identical.
 *
 * @param {string | undefined} id
 * @returns {number}
 */
export function counterOfId(id) {
  if (typeof id !== 'string') return 0
  const match = ID_COUNTER_PATTERN.exec(id)
  if (match === null) return 0
  const counter = Number(match[1])
  return Number.isSafeInteger(counter) ? counter : 0
}

/**
 * A logical timestamp: a Lamport counter and the replica that issued it.
 *
 * @typedef {object} Stamp
 * @property {number} counter A non-negative integer.
 * @property {string} replica A replica id.
 */

/**
 * @param {unknown} value
 * @returns {value is Stamp}
 */
export function isStamp(value) {
  if (typeof value !== 'object' || value === null) return false
  const { counter, replica } = /** @type {Record<string, unknown>} */ (value)
  return Number.isSafeInteger(counter) && /** @type {number} */ (counter) >= 0 && isReplicaId(replica)
}

/**
 * Total order on stamps: lower counter first, and the replica id breaks a tie.
 *
 * @param {Stamp} a
 * @param {Stamp} b
 * @returns {number} Negative when `a` is earlier, positive when later, `0` when identical.
 */
export function compareStamps(a, b) {
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1
  if (a.replica === b.replica) return 0
  return a.replica < b.replica ? -1 : 1
}

/**
 * A Lamport clock for one replica.
 *
 * @typedef {object} Clock
 * @property {string} replica The replica this clock counts for.
 * @property {() => number} now The current counter, without advancing it.
 * @property {() => number} tick Advance by one and return the new counter.
 * @property {(counter: number) => void} observe Move at least as far as a counter that was
 *   read from elsewhere. Never moves backwards; a malformed value is ignored.
 * @property {() => Stamp} stamp The current counter paired with this replica.
 */

/**
 * @param {string} replica A replica id from {@link createReplicaId}.
 * @param {number} [start] Counter to start from (default `0`).
 * @returns {Clock}
 */
export function createClock(replica, start = 0) {
  if (!isReplicaId(replica)) {
    throw new Error(`createClock: "${String(replica)}" is not a replica id`)
  }
  let counter = Number.isSafeInteger(start) && start >= 0 ? start : 0
  return {
    replica,
    now: () => counter,
    tick() {
      counter += 1
      return counter
    },
    observe(seen) {
      if (Number.isSafeInteger(seen) && seen > counter) counter = seen
    },
    stamp: () => ({ counter, replica }),
  }
}
