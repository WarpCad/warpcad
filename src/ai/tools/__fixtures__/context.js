// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Spec helpers for the tool registry (`TODO/ai-002`): a tool context and a stand-in
 * for the selection store the browser transport will pass (`ai-005`).
 *
 * @module ai/tools/__fixtures__/context
 */

import { createTurn } from '../limits.js'

/**
 * A selection the spec can read back. The browser transport hands the tools the
 * same two methods over the real selection store; the MCP transport hands none.
 *
 * @param {string[]} [initial]
 * @returns {import('../index.js').ToolSelection & { history: string[][] }}
 */
export function fakeSelection(initial = []) {
  let current = [...initial]
  /** @type {string[][]} */
  const history = []
  return {
    ids: () => [...current],
    select: (ids) => {
      current = [...ids]
      history.push([...ids])
    },
    history,
  }
}

/**
 * @param {object} options
 * @param {import('../../../core/document.js').WarpDocument} options.document
 * @param {string} [options.origin]
 * @param {import('../index.js').ToolSelection} [options.selection]
 * @param {import('../limits.js').Turn} [options.turn]
 * @param {string} [options.request] The user's message that started the turn (`TODO/ai-003`).
 * @returns {import('../index.js').ToolContext}
 */
export function makeContext({ document, origin = 'ai', selection, turn, request }) {
  return {
    document,
    origin,
    turn: turn ?? createTurn(),
    ...(selection === undefined ? {} : { selection }),
    ...(request === undefined ? {} : { request }),
  }
}
