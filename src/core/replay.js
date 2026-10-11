// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The document-level replay engine (`Initial design.md` §3).
 *
 * `replay(actions, registry)` is the literal
 * `actions.reduce((scene, action) => applyAction(scene, action, registry), emptyScene())`
 * §3 describes: the whole document is an ordered array of plain-JSON action
 * records, and the current scene is always the result of folding every one of
 * them from the start. Nothing here imports `@jscad/modeling` directly — only
 * `evaluate` and `createGroup` from `./kernel/`, so this module is testable in
 * plain Node against a fake registry (`CLAUDE.md`'s "always mock at the
 * boundary").
 *
 * ## Why this can't just be `kernel/index.js`'s `evaluate` directly
 *
 * `evaluate` is the right dispatch logic (native build vs. composite recipe
 * expansion, operand resolution by id) but it throws on the first problem it
 * finds — correct for a composite recipe's own internal expansion, which is
 * code, not untrusted content, so a bug there should fail loudly. A top-level
 * document is different: it can come from a remote URL (`Initial design.md`
 * §9 scenario 8, "remote-load safety"), so one bad line — an unknown `op`, a
 * reference to an id that doesn't exist, a parameter that fails validation —
 * must be reported and skipped, never allowed to halt every later record's
 * replay and never able to execute anything. `applyAction` gets this by
 * wrapping a single-record `evaluate` call in a `try`/`catch` and threading
 * `evaluate`'s own `initial` option through the fold, rather than
 * reimplementing operand resolution and composite dispatch a second time.
 *
 * @module core/replay
 */

import { evaluate } from './kernel/index.js'
import { createGroup } from './kernel/group.js'
import { ASSET_OP, validateImageAsset } from '../sketch/imageAsset.js'
import { VARIABLE_OP, variableRecordError } from './variables.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./kernel/group.js').Group} Group */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */
/** @typedef {import('./kernel/registry.js').RegistryEntry} RegistryEntry */

/**
 * @typedef {object} ReplayError
 * @property {string} [id] The offending record's `id`, when it had one.
 * @property {string} op The offending record's `op`.
 * @property {string} message What went wrong.
 */

/**
 * @typedef {object} Scene
 * @property {Map<string, Geom3 | Group>} byId Every successfully-applied record's
 *   value, by its `id`.
 * @property {Group} group Named results, in the order they were applied.
 * @property {readonly ReplayError[]} errors Every record that was skipped, in the
 *   order they were encountered. Never thrown — a scene always evaluates fully.
 */

/**
 * An empty scene — the seed value `replay`'s fold starts from.
 *
 * @returns {Scene}
 */
export function emptyScene() {
  return { byId: new Map(), group: createGroup(), errors: [] }
}

/**
 * Fold one action record into a scene. Never throws: any failure (an unknown
 * `op`, a `target`/`operands` id that hasn't been applied yet, a parameter that
 * fails the op's own validation) is appended to the returned scene's `errors`
 * and the record is skipped — the rest of the document still replays. The
 * input `scene` is never mutated; a new one is returned.
 *
 * An `op` a malicious document invents can only ever fail this module's own
 * plain-object registry lookup (inside `evaluate`) — there is no `eval` or
 * `new Function` anywhere in this path, so an `op` string can never execute,
 * it can only fail to be found.
 *
 * `cache` (`TODO/core-031`) lets a re-fold reuse this record's value when it meets
 * the same record against the same operand values again — see `FoldCache` in
 * `./kernel/index.js`. It changes how much work a fold does, never what it returns.
 *
 * @param {Scene} scene
 * @param {OpRecord} action
 * @param {Readonly<Record<string, RegistryEntry>>} registry
 * `policy` (`TODO/core-035`) is the design resolution the record's curves are faceted
 * at; omitted, `legacy` — the old fixed 32.
 *
 * @param {import('./kernel/index.js').FoldCache | null} [cache]
 * @param {import('./kernel/tessellation.js').TessellationPolicy} [policy]
 * @returns {Scene}
 */
export function applyAction(scene, action, registry, cache = null, policy = undefined) {
  // A reference photo (`TODO/sketch-003`) is data, not geometry: it never reaches the
  // kernel. A valid one leaves the scene as it was; one that fails validation is skipped
  // and reported like any other bad record — "a load warning, as scenario 8 requires".
  if (action?.op === ASSET_OP) {
    const verdict = validateImageAsset(action)
    if (verdict.ok) return scene
    /** @type {ReplayError} */
    const reported = { op: ASSET_OP, message: verdict.reason }
    if (action.id !== undefined) reported.id = action.id
    return { ...scene, errors: [...scene.errors, reported] }
  }
  // A project variable (`TODO/core-050`) is data too: it never reaches the kernel. Its
  // bindings are resolved by `document.js` before a record gets here.
  if (action?.op === VARIABLE_OP) {
    const problem = variableRecordError(action)
    if (problem === null) return scene
    /** @type {ReplayError} */
    const reported = { op: VARIABLE_OP, message: problem }
    if (action.id !== undefined) reported.id = action.id
    return { ...scene, errors: [...scene.errors, reported] }
  }
  try {
    const { byId, group } = evaluate([action], {
      registry,
      initial: { byId: scene.byId, group: scene.group },
      cache,
      ...(policy === undefined ? {} : { policy }),
    })
    return { byId, group, errors: scene.errors }
  } catch (error) {
    /** @type {ReplayError} */
    const reported = { op: action.op, message: /** @type {Error} */ (error).message }
    if (action.id !== undefined) reported.id = action.id
    return { ...scene, errors: [...scene.errors, reported] }
  }
}

/**
 * Replay a whole document — an ordered array of action records — into a
 * scene, per `Initial design.md` §3's fold. Equivalent to
 * `actions.reduce((scene, action) => applyAction(scene, action, registry), emptyScene())`,
 * provided as a named export since every caller needs it.
 *
 * @param {readonly OpRecord[]} actions
 * @param {Readonly<Record<string, RegistryEntry>>} registry
 * @returns {Scene}
 */
export function replay(actions, registry) {
  return actions.reduce((scene, action) => applyAction(scene, action, registry), emptyScene())
}
