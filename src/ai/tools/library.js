// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `save_to_library` (`TODO/ai-008`): the model **proposes** saving a body to the user's
 * **My parts** (`TODO/ui-055`) — it never saves.
 *
 * A model does not write to the user's persistent library unprompted. So the tool:
 *
 * 1. checks the body exists in the turn's fork and the name is one the library would take
 *    (`partNameProblem`, against **My parts** only — a part the open project carries never blocks
 *    a name — and `lineageNameProblem`, a name the body is itself built from);
 * 2. runs `core-037`'s `definePartFromSelection` against the fork — which folds the captured
 *    definition and refuses one that would not rebuild the same geometry — and throws the result
 *    away: it only proves the Save will work;
 * 3. records the proposal on the turn (`ctx.proposals`, latest wins) and returns it.
 *
 * A saved part is fixed (`TODO/ui-105`): the tool offers no sizes to expose.
 *
 * The agent hands the proposal back with the turn's outcome; the chat shows it with a
 * **Confirm** button (`ai-save-confirm`), and only that tap writes to the library, through the
 * same store action the Save sheet uses. The tool is given no storage to write with (decision 7:
 * a tool cannot reach what it is not handed; `limits.spec.js` checks no tool module names
 * IndexedDB). Browser only: over MCP there is no one to tap Confirm.
 *
 * @module ai/tools/library
 */

import { definePartFromSelection } from '../../core/library.js'
import { REPEAT_SAVE_REASON, libraryUserParts, lineageUserPartOps } from '../../core/userPart.js'
import { holdsRepeat, lineageNameProblem, partNameProblem } from '../../core/userPartTools.js'
import { findBody } from './read.js'
import { RATIONALE_PROPERTY, objectSchema } from './schema.js'

/** @typedef {import('./index.js').Tool} Tool */

/**
 * A Save the user has not confirmed yet.
 *
 * @typedef {object} SaveProposal
 * @property {string} bodyId
 * @property {string} name
 */

/** @returns {Tool} */
export function createSaveToLibraryTool() {
  return {
    name: 'save_to_library',
    description:
      'Propose saving one body (usually the group you built) to the user’s My parts library, with a name. ' +
      'This does NOT save: the chat shows your proposal and the user taps Confirm to save it. Only propose when the user asked for a library part.',
    inputSchema: objectSchema(
      {
        id: { type: 'string', description: 'The body to save, from describe_scene — usually the group.' },
        name: { type: 'string', description: 'The part’s name in My parts, e.g. "Pi 7 board".' },
        rationale: RATIONALE_PROPERTY,
      },
      ['id', 'name']
    ),
    transports: ['ai'],
    run: (ctx, input) => {
      const found = findBody(ctx.document, input.id)
      if (found.reason !== undefined) return { error: found.reason }
      const body = found.body
      if (holdsRepeat(ctx.document, body.id)) return { error: REPEAT_SAVE_REASON }
      const name = String(input.name).trim()
      const nameProblem =
        partNameProblem(name, libraryUserParts().map((part) => ({ op: part.op, name: part.name }))) ||
        lineageNameProblem(name, lineageUserPartOps(ctx.document, body.id))
      if (nameProblem) return { error: `${nameProblem}.` }

      try {
        definePartFromSelection(ctx.document, body.id, { name })
      } catch (error) {
        return { error: `"${body.name}" can't be saved as a part: ${error instanceof Error ? error.message : String(error)}` }
      }

      /** @type {SaveProposal} */
      const proposal = { bodyId: body.id, name }
      if (ctx.proposals) ctx.proposals.splice(0, ctx.proposals.length, proposal)
      return {
        proposed: { bodyId: body.id, name },
        saved: false,
        note: 'Not saved. The chat shows this proposal to the user with a Confirm button; it is saved to My parts only when they tap Confirm. Tell them so.',
      }
    },
  }
}
