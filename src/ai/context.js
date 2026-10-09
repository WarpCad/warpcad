// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Keeping an AI turn's context bounded (`TODO/ai-005`, "Context size"). Framework-free.
 *
 * Two things grow without limit in a long session, and each is cut here with a note that
 * **says what was dropped** — a model that silently loses half the scene would reason about
 * bodies it can no longer see:
 *
 * 1. **The scene.** `describe_scene`, and the `scene` every write tool returns, list every
 *    body. {@link summariseScene} keeps full detail for the newest {@link SCENE_DETAIL_LIMIT}
 *    bodies (the ones a turn is usually working on), lists up to {@link SCENE_LIST_LIMIT}
 *    older ones by id, name and op only, counts the rest, and adds a `summarised` sentence
 *    pointing at `describe_body`. The tools themselves are unchanged — the MCP server
 *    (`ai-009`) gets the full result; only what the agent feeds back to the model is cut.
 * 2. **Earlier turns.** {@link assembleMessages} keeps the **immediately previous** turn in
 *    full only when it finished cleanly (its content, thinking blocks included, is what the
 *    model expects to read back). Every older turn, and every turn that was stopped, capped
 *    or failed, is compacted to one line: the request and what landed, by record id. A
 *    discarded turn is never replayed in full: its fork was dropped, so the bodies its tool
 *    results name do not exist.
 *
 * The compacted lines are the app's own text plus the user's own earlier requests; no
 * document text is in them (record ids are issued by the document, not written into it).
 *
 * @module ai/context
 */

/** Bodies `summariseScene` keeps in full detail. */
export const SCENE_DETAIL_LIMIT = 30

/** Older bodies it still lists by id, name and op; beyond this they are only counted. */
export const SCENE_LIST_LIMIT = 200

/** How much of an earlier request a compacted line keeps. */
const REQUEST_LINE_LIMIT = 200

/** How many record ids a compacted line names before it says "and N more". */
const LINE_ID_LIMIT = 12

/** @typedef {import('./tools/read.js').SceneSummary} SceneSummary */

/**
 * A scene as the model is given it: the tools' {@link SceneSummary}, possibly cut down.
 *
 * @typedef {SceneSummary & {
 *   otherBodies?: Array<{ id: string, name: string, op: string }>,
 *   omittedBodies?: number,
 *   summarised?: string,
 * }} ModelScene
 */

/**
 * One finished turn, as the agent keeps it for the next one.
 *
 * @typedef {object} TurnLog
 * @property {string} request The user's message.
 * @property {'done' | 'stopped' | 'cancelled' | 'failed'} status
 * @property {string[]} recordIds What landed; empty for a discarded or question-only turn.
 * @property {any[]} [messages] The turn's full exchange, kept only for a `done` turn.
 */

/**
 * Cut a scene down to what fits, saying what was cut.
 *
 * @param {SceneSummary} scene
 * @param {{ detailLimit?: number, listLimit?: number }} [options]
 * @returns {ModelScene} `scene` itself when nothing needs cutting.
 */
export function summariseScene(scene, options = {}) {
  const detailLimit = options.detailLimit ?? SCENE_DETAIL_LIMIT
  const listLimit = options.listLimit ?? SCENE_LIST_LIMIT
  const bodies = scene.bodies
  if (bodies.length <= detailLimit) return scene

  const detailed = bodies.slice(bodies.length - detailLimit)
  const older = bodies.slice(0, bodies.length - detailLimit)
  const listed = older.slice(Math.max(0, older.length - listLimit))
  const omitted = older.length - listed.length
  const sentence =
    `This scene has ${bodies.length} bodies. Full detail is given for the newest ${detailed.length}; ` +
    `the ${listed.length} before them are listed in otherBodies by id, name and op only` +
    (omitted > 0 ? `, and the ${omitted} oldest are not listed at all` : '') +
    '. Call describe_body(id) for any body you need in full.'
  return {
    ...scene,
    bodies: detailed,
    otherBodies: listed.map(({ id, name, op }) => ({ id, name, op })),
    ...(omitted > 0 ? { omittedBodies: omitted } : {}),
    summarised: sentence,
  }
}

/**
 * A tool result as the model is given it: a scene in it is summarised; anything else is
 * returned unchanged (the same object).
 *
 * @param {string} toolName
 * @param {Record<string, any>} result
 * @returns {Record<string, any>}
 */
export function compactToolResult(toolName, result) {
  if (toolName === 'describe_scene' && Array.isArray(result.bodies)) {
    const out = summariseScene(/** @type {SceneSummary} */ (result))
    return out
  }
  if (result.scene && Array.isArray(result.scene.bodies)) {
    const scene = summariseScene(result.scene)
    return scene === result.scene ? result : { ...result, scene }
  }
  return result
}

/**
 * One earlier turn, compacted to a line: the request and the outcome.
 *
 * @param {Pick<TurnLog, 'request' | 'status' | 'recordIds'>} turn
 * @returns {string}
 */
export function turnLine(turn) {
  const flat = turn.request.replace(/\s+/g, ' ').trim()
  const request = flat.length > REQUEST_LINE_LIMIT ? `${flat.slice(0, REQUEST_LINE_LIMIT - 1)}…` : flat
  /** @type {string} */
  let outcome
  if (turn.status !== 'done') {
    const why = { stopped: 'stopped at a limit', cancelled: 'stopped by the user', failed: 'failed' }[turn.status]
    outcome = `${why}; discarded, nothing from it is in the project`
  } else if (turn.recordIds.length === 0) {
    outcome = 'answered without changing the project'
  } else {
    const ids = turn.recordIds.slice(0, LINE_ID_LIMIT).join(', ')
    const more = turn.recordIds.length > LINE_ID_LIMIT ? ` and ${turn.recordIds.length - LINE_ID_LIMIT} more` : ''
    outcome = `landed ${turn.recordIds.length} record${turn.recordIds.length === 1 ? '' : 's'} (${ids}${more})`
  }
  return `"${request}" — ${outcome}`
}

/**
 * The `messages` for a new turn: earlier turns (compacted, or the previous one in full) and
 * then the new user message.
 *
 * Roles always alternate starting with `user`: the compacted note is prepended as a text block
 * to the first user message that is sent, never sent as a message of its own.
 *
 * @param {readonly TurnLog[]} turns Oldest first.
 * @param {any[]} userContent The new user message's content blocks.
 * @returns {Array<{ role: 'user' | 'assistant', content: any }>}
 */
export function assembleMessages(turns, userContent) {
  const last = turns.at(-1)
  const keepLast = last !== undefined && last.status === 'done' && Array.isArray(last.messages) && last.messages.length > 0
  const compacted = keepLast ? turns.slice(0, -1) : turns
  /** @type {Array<{ role: 'user' | 'assistant', content: any }>} */
  const messages = keepLast ? /** @type {any[]} */ (last.messages).map((message) => ({ ...message })) : []
  messages.push({ role: 'user', content: userContent })
  if (compacted.length === 0) return messages

  const note =
    'Earlier in this conversation (compacted: only each turn’s request and outcome are kept — its tool calls, tool results, ' +
    'images and replies were dropped; call describe_scene or get_timeline for the current state):\n' +
    compacted.map((turn, index) => `${index + 1}. ${turnLine(turn)}`).join('\n')
  const first = messages[0]
  const content = typeof first.content === 'string' ? [{ type: 'text', text: first.content }] : [...first.content]
  messages[0] = { ...first, content: [{ type: 'text', text: note }, ...content] }
  return messages
}
