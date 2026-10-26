// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Whether a body, or one of its parts, is drawn in the 3D view (`TODO/ui-089`): the user's
 * **Hide** / **Show** from the Inspector's Objects list. Framework-free, and its own module for
 * the reason `colorOverride.js` is: "is this part drawn?" is a rule, and a rule that lived in
 * both the store and the render loop would sooner or later answer differently in each.
 *
 * ## The rule, stated once
 *
 * A body and each of its parts are **independent switches**. A body is drawn when it is
 * shown; a part is drawn only when its body **and** the part are both shown. Hiding `Cube 1`
 * hides both pieces, and showing it again restores whatever each part was set to, so a hidden
 * `Cube 1 A` stays hidden. Nothing hidden is the default: a body id this module has never been
 * told about is shown, and so is every body in a file with no `viewHidden` field.
 *
 * ## Not the recipe's `hidden`
 *
 * `hidden` already means a recipe's helper part (a bolt's `tap`, `group.js`'s
 * `hiddenNamesOf`), addressable but not drawn by default. A user hide is a different thing, so
 * nothing here is called bare `hidden`: the flags are `viewHidden` / `viewHiddenParts`, and
 * `grep hidden` keeps finding the recipe concept. Show hidden parts does not override a user
 * hide, and Show all does not turn on Show hidden parts.
 *
 * ## Shapes
 *
 * - In memory, a **view map**: `Map<viewKey, true>`, one key per hidden body or part. Flat, so
 *   the merge can stamp each key on its own (per body, per part, last writer wins).
 * - On the state line, `viewHidden: { "<bodyId>": { "body": true, "parts": ["Cube 1 A"] } }`,
 *   written only when something is hidden, ids and names sorted so the bytes do not depend on
 *   the order things were hidden in (`src/core/project.js`).
 *
 * Keyed by **body id**, the lineage root that Split, Bisect and Resize keep via `supersedes`,
 * so a body's hide survives every in-place edit. A part key names a part; when that part is
 * gone (a re-split, a renamed piece) the key is ignored here and dropped on the next save.
 *
 * @module core/visibility
 */

/** Caps on the state line's `viewHidden`, enforced in code: it is untrusted data from a file. */
export const VIEW_HIDDEN_LIMITS = Object.freeze({
  maxBodies: 10_000,
  maxPartsPerBody: 1_000,
  /** A body id's or a part name's length, the merge section's own id cap. */
  maxNameLength: 256,
})

/**
 * The state-line shape of `viewHidden`: by body id, the body's own hide and its hidden parts.
 *
 * @typedef {Record<string, { body?: true, parts?: string[] }>} ViewHiddenState
 */

/**
 * What a body reports about its visibility (`Body.viewHidden` / `Body.viewHiddenParts`): only
 * parts it still has. Both optional, so a body summary that never heard of a hide reads as
 * shown.
 *
 * @typedef {object} BodyView
 * @property {boolean} [viewHidden]
 * @property {readonly string[]} [viewHiddenParts]
 */

/**
 * The key of one switch: a body (`partName` omitted) or one of its parts. A JSON pair, so no
 * character an id or a name might hold can make two keys collide.
 *
 * @param {string} bodyId
 * @param {string} [partName]
 * @returns {string}
 */
export function viewKey(bodyId, partName) {
  return JSON.stringify(partName === undefined ? [bodyId] : [bodyId, partName])
}

/**
 * The switch a {@link viewKey} names, or `null` for a string that is not one.
 *
 * @param {string} key
 * @returns {{ bodyId: string, partName?: string } | null}
 */
export function parseViewKey(key) {
  /** @type {unknown} */
  let value
  try {
    value = JSON.parse(key)
  } catch {
    return null
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > 2 || !value.every((item) => typeof item === 'string')) {
    return null
  }
  return value.length === 1 ? { bodyId: value[0] } : { bodyId: value[0], partName: value[1] }
}

/**
 * A view map with one switch set. Returns `map` itself when nothing changes, so a caller can
 * tell a no-op from a change without comparing; otherwise a new map (the input is never
 * mutated).
 *
 * @param {ReadonlyMap<string, true>} map
 * @param {string} bodyId
 * @param {{ subPart?: string, hidden: boolean }} target
 * @returns {ReadonlyMap<string, true>}
 */
export function withViewHidden(map, bodyId, target) {
  const key = viewKey(bodyId, target.subPart)
  if (map.has(key) === target.hidden) return map
  const next = new Map(map)
  if (target.hidden) next.set(key, true)
  else next.delete(key)
  return next
}

/**
 * What one body reports: its own hide, and which of its **current** parts are hidden, in the
 * body's part order. A part key naming a part the body no longer has is ignored.
 *
 * @param {ReadonlyMap<string, true>} map
 * @param {string} bodyId
 * @param {readonly string[]} partNames Every part the body has now, recipe-hidden ones included.
 * @returns {{ viewHidden: boolean, viewHiddenParts: string[] }}
 */
export function bodyViewOf(map, bodyId, partNames) {
  return {
    viewHidden: map.has(viewKey(bodyId)),
    viewHiddenParts: partNames.filter((name) => map.has(viewKey(bodyId, name))),
  }
}

/**
 * Whether a body is drawn at all.
 *
 * @param {BodyView} body
 * @returns {boolean}
 */
export function isBodyDrawn(body) {
  return body.viewHidden !== true
}

/**
 * Whether one part of a body is drawn: the body is shown **and** the part is.
 *
 * @param {BodyView} body
 * @param {string} partName
 * @returns {boolean}
 */
export function isPartDrawn(body, partName) {
  return isBodyDrawn(body) && !(body.viewHiddenParts ?? []).includes(partName)
}

/**
 * The body row's eye: `hidden` when the body is, `mixed` when it is shown with some part
 * hidden, `shown` otherwise.
 *
 * @param {BodyView} body
 * @returns {'shown' | 'hidden' | 'mixed'}
 */
export function eyeStateOf(body) {
  if (!isBodyDrawn(body)) return 'hidden'
  return (body.viewHiddenParts ?? []).length > 0 ? 'mixed' : 'shown'
}

/**
 * The ids of the bodies hidden whole, in list order.
 *
 * @param {readonly (BodyView & { id: string })[]} bodies
 * @returns {string[]}
 */
export function hiddenBodyIds(bodies) {
  return bodies.filter((body) => !isBodyDrawn(body)).map((body) => body.id)
}

/**
 * The count line's `N hidden`: a hidden body counts once (its parts with it), and each hidden
 * part of a shown body counts once.
 *
 * @param {readonly BodyView[]} bodies
 * @returns {number}
 */
export function hiddenCountOf(bodies) {
  let count = 0
  for (const body of bodies) count += isBodyDrawn(body) ? (body.viewHiddenParts ?? []).length : 1
  return count
}

/**
 * The state-line value for a view map, or `null` when nothing is hidden (the field is then not
 * written). Body ids and part names sorted. `keep` drops switches the caller knows are stale:
 * a body no record in the file names, a part the body no longer has.
 *
 * @param {ReadonlyMap<string, true>} map
 * @param {(bodyId: string, partName: string | undefined) => boolean} [keep]
 * @returns {ViewHiddenState | null}
 */
export function encodeViewHidden(map, keep = () => true) {
  /** @type {Map<string, { body: boolean, parts: string[] }>} */
  const byBody = new Map()
  for (const key of map.keys()) {
    const parsed = parseViewKey(key)
    if (parsed === null || !keep(parsed.bodyId, parsed.partName)) continue
    const entry = byBody.get(parsed.bodyId) ?? { body: false, parts: [] }
    if (parsed.partName === undefined) entry.body = true
    else entry.parts.push(parsed.partName)
    byBody.set(parsed.bodyId, entry)
  }
  if (byBody.size === 0) return null
  /** @type {ViewHiddenState} */
  const state = {}
  for (const bodyId of [...byBody.keys()].sort(compareText)) {
    const { body, parts } = /** @type {{ body: boolean, parts: string[] }} */ (byBody.get(bodyId))
    state[bodyId] = {
      ...(body ? { body: /** @type {const} */ (true) } : {}),
      ...(parts.length > 0 ? { parts: parts.sort(compareText) } : {}),
    }
  }
  return state
}

/**
 * Validate a state line's `viewHidden`, untrusted, into its normal form: duplicates collapsed,
 * `body: false` and empty entries dropped, ids and names sorted. A wrong type or a value past a
 * cap throws, naming the field; whether each body id names a record is the reader's to decide.
 *
 * @param {unknown} raw
 * @returns {ViewHiddenState}
 * @throws {Error} Naming what is wrong.
 */
export function normalizeViewHidden(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('`viewHidden` must map body ids to what is hidden')
  }
  const entries = Object.entries(raw)
  if (entries.length > VIEW_HIDDEN_LIMITS.maxBodies) {
    throw new Error(`\`viewHidden\` names more than ${VIEW_HIDDEN_LIMITS.maxBodies} bodies`)
  }
  /** @type {Map<string, true>} */
  const map = new Map()
  for (const [bodyId, value] of entries) {
    if (bodyId.length === 0 || bodyId.length > VIEW_HIDDEN_LIMITS.maxNameLength) {
      throw new Error(`\`viewHidden\` has a body id that is empty or longer than ${VIEW_HIDDEN_LIMITS.maxNameLength}`)
    }
    const label = JSON.stringify(bodyId.slice(0, 40))
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`\`viewHidden\` for ${label} must be an object`)
    }
    const { body, parts } = /** @type {Record<string, unknown>} */ (value)
    if (body !== undefined && typeof body !== 'boolean') {
      throw new Error(`\`viewHidden\` for ${label}: \`body\` must be true or false`)
    }
    if (parts !== undefined && (!Array.isArray(parts) || !parts.every((name) => typeof name === 'string' && name !== ''))) {
      throw new Error(`\`viewHidden\` for ${label}: \`parts\` must be a list of part names`)
    }
    const names = /** @type {string[]} */ (parts ?? [])
    if (names.length > VIEW_HIDDEN_LIMITS.maxPartsPerBody) {
      throw new Error(`\`viewHidden\` for ${label} names more than ${VIEW_HIDDEN_LIMITS.maxPartsPerBody} parts`)
    }
    if (names.some((name) => name.length > VIEW_HIDDEN_LIMITS.maxNameLength)) {
      throw new Error(`\`viewHidden\` for ${label} has a part name longer than ${VIEW_HIDDEN_LIMITS.maxNameLength}`)
    }
    if (body === true) map.set(viewKey(bodyId), true)
    for (const name of names) map.set(viewKey(bodyId, name), true)
  }
  return encodeViewHidden(map) ?? {}
}

/**
 * The view map a (normalized) state-line value describes.
 *
 * @param {ViewHiddenState} state
 * @returns {Map<string, true>}
 */
export function viewHiddenMapOf(state) {
  /** @type {Map<string, true>} */
  const map = new Map()
  for (const [bodyId, { body, parts }] of Object.entries(state)) {
    if (body === true) map.set(viewKey(bodyId), true)
    for (const name of parts ?? []) map.set(viewKey(bodyId, name), true)
  }
  return map
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}
