// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Position keys: the fractional index that orders a merged feature timeline (`TODO/data-009`,
 * `docs/decisions/document-sync.md`).
 *
 * A key is a string over a base-62 alphabet (`0-9A-Za-z`, compared by code unit). It is a
 * path of **segments**; a segment is `(digit, counter, replica)`, encoded as a length-prefixed
 * base-62 digit, a length-prefixed base-62 counter and the six-character replica id. Every
 * encoding is prefix-free and order-preserving, so comparing two key strings compares their
 * segment paths lexicographically (a prefix first). A key always **ends with the replica id**
 * of the writer that minted it.
 *
 * Two properties the merge relies on, proved by `fuzz.spec.js`:
 *
 * 1. **Runs do not interleave.** A replica's first insert at a gap mints a *head* segment;
 *    each following insert after its own row stays inside that head's subtree (a *member*
 *    segment, digit {@link MEMBER_DIGIT}, which only the head's own replica ever mints). Another
 *    replica's concurrent rows can never land inside a subtree it has not seen.
 * 2. **Same-gap order follows the stamp.** A fresh insert at a gap is a function of the two
 *    neighbours alone, except for the trailing `(counter, replica)` tag — so two replicas
 *    inserting at one gap get the same prefix and digit, and the earlier stamp sorts first.
 *    **Exception:** when the left neighbour is a row the inserting replica minted itself, its
 *    insert continues that run in place (`MEMBER_DIGIT`), and sorts before another replica's
 *    insert at the same gap whatever the stamps. Without this, keys would grow by one segment
 *    per sequential insert.
 *
 * Keys grow only when a gap is exhausted: digits step by one away from a neighbour, starting
 * from {@link MID_DIGIT}, so about 1 900 inserts at one end of a gap fit in a single segment.
 *
 * Framework-free; imports nothing but `../replica.js` types. Input keys are assumed
 * validated (`data-011`); a malformed key throws.
 */

/** @typedef {import('../replica.js').Stamp} Stamp */

/**
 * @typedef {object} Segment
 * @property {number} digit
 * @property {number} counter
 * @property {string} replica
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const BASE = 62
const REPLICA_LENGTH = 6

/** The digit a fresh insert takes when nothing bounds it from above or below. */
export const MID_DIGIT = BASE * 31
/** The digit of a run's continuation; minted only by the run head's own replica. */
export const MEMBER_DIGIT = 1
/** The escape digit, always followed by another segment, used when a gap's low end is full. */
const ESCAPE_DIGIT = 0
/** The lowest digit a fresh (non-member, non-escape) insert may take. */
const FIRST_FREE_DIGIT = 2

/** @type {Map<string, number>} */
const DIGIT_VALUE = new Map([...ALPHABET].map((char, index) => [char, index]))

/**
 * @param {number} value A non-negative safe integer.
 * @returns {string}
 */
function encodeInt(value) {
  let n = value
  let digits = ''
  do {
    digits = ALPHABET[n % BASE] + digits
    n = Math.floor(n / BASE)
  } while (n > 0)
  return ALPHABET[digits.length] + digits
}

/**
 * @param {string} key
 * @param {number} at
 * @returns {[number, number]} The value and the index after it.
 */
function decodeInt(key, at) {
  const length = DIGIT_VALUE.get(key[at])
  if (length === undefined || length < 1 || at + 1 + length > key.length) {
    throw new Error(`position key "${key}" is malformed at ${at}`)
  }
  let value = 0
  for (let i = at + 1; i <= at + length; i += 1) {
    const digit = DIGIT_VALUE.get(key[i])
    if (digit === undefined) throw new Error(`position key "${key}" is malformed at ${i}`)
    value = value * BASE + digit
  }
  return [value, at + 1 + length]
}

/**
 * @param {Segment} segment
 * @returns {string}
 */
function encodeSegment(segment) {
  return encodeInt(segment.digit) + encodeInt(segment.counter) + segment.replica
}

/**
 * The segment path of a key.
 *
 * @param {string} key
 * @returns {Segment[]}
 */
export function parseKey(key) {
  /** @type {Segment[]} */
  const segments = []
  let at = 0
  while (at < key.length) {
    const [digit, afterDigit] = decodeInt(key, at)
    const [counter, afterCounter] = decodeInt(key, afterDigit)
    const replica = key.slice(afterCounter, afterCounter + REPLICA_LENGTH)
    if (replica.length !== REPLICA_LENGTH) throw new Error(`position key "${key}" is truncated`)
    segments.push({ digit, counter, replica })
    at = afterCounter + REPLICA_LENGTH
  }
  if (segments.length === 0) throw new Error('a position key is never empty')
  return segments
}

/**
 * Total order on position keys: plain code-unit comparison, which the encoding makes equal to
 * segment-path order.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Negative when `a` sorts first, positive when after, `0` when equal.
 */
export function compareKeys(a, b) {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * @param {Segment} a
 * @param {Segment} b
 * @returns {boolean}
 */
function sameSegment(a, b) {
  return a.digit === b.digit && a.counter === b.counter && a.replica === b.replica
}

/**
 * The shallowest key strictly between two segment paths, tagged with `stamp`. A function of
 * the neighbours alone apart from the tag. The first `keepDepth` segments of `low` are copied
 * unconditionally, which keeps the result inside `low`'s subtree.
 *
 * @param {Segment[]} low Segments of the key before (`[]` for the start).
 * @param {Segment[] | null} high Segments of the key after (`null` for the end).
 * @param {Stamp} stamp
 * @param {number} keepDepth
 * @returns {string}
 */
function shallowestBetween(low, high, stamp, keepDepth) {
  let out = ''
  let aligned = high !== null // `out` equals `high`'s prefix so far
  for (let i = 0; ; i += 1) {
    const lo = i < low.length ? low[i] : null
    /** @type {Segment | null} */
    let hi = null
    if (aligned) {
      if (i >= /** @type {Segment[]} */ (high).length) throw new Error('keyBetween: no key fits between equal keys')
      hi = /** @type {Segment[]} */ (high)[i]
    }
    if (lo !== null && i < keepDepth) {
      out += encodeSegment(lo)
      if (hi !== null && !sameSegment(lo, hi)) aligned = false
      continue
    }
    const lower = lo === null ? FIRST_FREE_DIGIT : Math.max(lo.digit + 1, FIRST_FREE_DIGIT)
    const upper = hi === null ? Infinity : hi.digit - 1
    if (lower <= upper) {
      let digit
      if (hi === null) digit = lo === null ? MID_DIGIT : lower
      else if (lo === null) digit = upper
      else digit = lower + Math.floor((upper - lower) / 2)
      return out + encodeSegment({ digit, counter: stamp.counter, replica: stamp.replica })
    }
    if (lo !== null) {
      out += encodeSegment(lo)
      if (hi !== null && !sameSegment(lo, hi)) aligned = false
      continue
    }
    // No room and nothing below: `hi` is present with a digit under FIRST_FREE_DIGIT.
    const top = /** @type {Segment} */ (hi)
    if (top.digit > ESCAPE_DIGIT) {
      out += encodeSegment({ digit: ESCAPE_DIGIT, counter: stamp.counter, replica: stamp.replica })
      aligned = false
    } else {
      out += encodeSegment(top)
    }
  }
}

/**
 * A key strictly between `before` and `after`, for an insert stamped `stamp`.
 *
 * Deviation from the `TODO/data-009` signature (`replica`): the whole insert stamp is passed,
 * because same-gap order follows the stamp only if the key carries the counter as well as the
 * replica id.
 *
 * @param {string | null} before The key of the row before the gap, or `null` for the start.
 * @param {string | null} after The key of the row after the gap, or `null` for the end.
 * @param {Stamp} stamp The insert's stamp; its replica is the writer.
 * @returns {string}
 */
export function keyBetween(before, after, stamp) {
  if (before !== null && after !== null && compareKeys(before, after) >= 0) {
    throw new Error(`keyBetween: "${before}" does not sort before "${after}"`)
  }
  const low = before === null ? [] : parseKey(before)
  const high = after === null ? null : parseKey(after)
  const fits = (/** @type {string} */ key) =>
    (before === null || key > before) && (after === null || key < after)
  const n = low.length
  const mine = (/** @type {Segment} */ segment) => segment.replica === stamp.replica
  const tag = { counter: stamp.counter, replica: stamp.replica }

  // Continue my own run as a sibling member: constant length however long the run.
  if (before !== null && n >= 2 && mine(low[n - 1]) && low[n - 1].digit === MEMBER_DIGIT && mine(low[n - 2])) {
    const sibling = before.slice(0, before.length - encodeSegment(low[n - 1]).length) +
      encodeSegment({ digit: MEMBER_DIGIT, ...tag })
    if (fits(sibling)) return sibling
  }
  // Start a run of members under my own row, or descend under it when that slot is taken.
  if (before !== null && n >= 1 && mine(low[n - 1])) {
    const child = before + encodeSegment({ digit: MEMBER_DIGIT, ...tag })
    if (fits(child)) return child
    return shallowestBetween(low, high, stamp, n)
  }
  return shallowestBetween(low, high, stamp, 0)
}

/**
 * `count` keys in order strictly between `before` and `after`, as one run (they stay
 * contiguous against any concurrent insert at the same gap). The `i`-th key is tagged with
 * counter `stamp.counter + i`; tags only order keys, they are never read as stamps.
 *
 * @param {string | null} before
 * @param {string | null} after
 * @param {number} count
 * @param {Stamp} stamp
 * @returns {string[]}
 */
export function keysBetween(before, after, count, stamp) {
  /** @type {string[]} */
  const keys = []
  let previous = before
  for (let i = 0; i < count; i += 1) {
    previous = keyBetween(previous, after, { counter: stamp.counter + i, replica: stamp.replica })
    keys.push(previous)
  }
  return keys
}
