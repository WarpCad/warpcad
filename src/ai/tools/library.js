// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `save_to_library` (`TODO/ai-008`): the model **proposes** saving a body to the user's
 * **My parts** (`TODO/ui-055`) — it never saves.
 *
 * A model does not write to the user's persistent library unprompted. So the tool:
 *
 * 1. checks the body exists in the turn's fork and the name is one the library would take
 *    (`partNameProblem`, against every user part there is);
 * 2. checks the chosen exposed sizes are real ones (`exposableParams`' keys), naming the choices
 *    when one is not;
 * 3. runs `core-037`'s `definePartFromSelection` against the fork — which folds the captured
 *    definition and refuses one that would not rebuild the same geometry — and throws the result
 *    away: it only proves the Save will work;
 * 4. records the proposal on the turn (`ctx.proposals`, latest wins) and returns it.
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
import { REPEAT_SAVE_REASON, effectiveUserParts } from '../../core/userPart.js'
import { exposableParams, exposedFrom, holdsRepeat, partNameProblem } from '../../core/userPartTools.js'
import { findBody } from './read.js'
import { RATIONALE_PROPERTY, objectSchema } from './schema.js'

/** @typedef {import('./index.js').Tool} Tool */

/**
 * A Save the user has not confirmed yet.
 *
 * @typedef {object} SaveProposal
 * @property {string} bodyId
 * @property {string} name
 * @property {string[]} expose `exposableParams` keys.
 * @property {string[]} labels What each exposed size is called, for the chat.
 */

/** How many choices an unknown-key error lists. */
const LISTED = 24

/** @returns {Tool} */
export function createSaveToLibraryTool() {
  return {
    name: 'save_to_library',
    description:
      'Propose saving one body (usually the group you built) to the user’s My parts library, with a name and the sizes worth exposing as adjustable parameters. ' +
      'This does NOT save: the chat shows your proposal and the user taps Confirm to save it. Only propose when the user asked for a library part.',
    inputSchema: objectSchema(
      {
        id: { type: 'string', description: 'The body to save, from describe_scene — usually the group.' },
        name: { type: 'string', description: 'The part’s name in My parts, e.g. "Pi 7 board".' },
        expose: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: sizes to expose as parameters, as "<record id>:<param path>" keys (e.g. "cuboid-2:size.2"). An unknown key is refused with the list of keys there are.',
        },
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
      const nameProblem = partNameProblem(name, effectiveUserParts().map((part) => ({ op: part.op, name: part.name })))
      if (nameProblem) return { error: `${nameProblem}.` }

      const candidates = exposableParams(ctx.document, body.id)
      const keys = /** @type {string[]} */ (input.expose ?? [])
      const unknown = keys.filter((key) => !candidates.some((candidate) => candidate.key === key))
      if (unknown.length > 0) {
        const listed = candidates.slice(0, LISTED).map((candidate) => `${candidate.key} (${candidate.label}, ${candidate.value} mm)`)
        return {
          error:
            `${unknown.map((key) => JSON.stringify(key)).join(', ')} ${unknown.length === 1 ? 'is not a size' : 'are not sizes'} of "${body.name}". ` +
            (listed.length > 0 ? `The sizes there are: ${listed.join('; ')}${candidates.length > LISTED ? '; …' : ''}.` : 'It has no sizes that can be exposed.'),
        }
      }
      const chosen = candidates.filter((candidate) => keys.includes(candidate.key))
      try {
        definePartFromSelection(ctx.document, body.id, { name, exposeParams: exposedFrom(chosen) })
      } catch (error) {
        return { error: `"${body.name}" can't be saved as a part: ${error instanceof Error ? error.message : String(error)}` }
      }

      /** @type {SaveProposal} */
      const proposal = { bodyId: body.id, name, expose: chosen.map((candidate) => candidate.key), labels: chosen.map((candidate) => candidate.label) }
      if (ctx.proposals) ctx.proposals.splice(0, ctx.proposals.length, proposal)
      return {
        proposed: {
          bodyId: body.id,
          name,
          expose: chosen.map((candidate) => ({ key: candidate.key, label: candidate.label, valueMm: candidate.value })),
        },
        saved: false,
        note: 'Not saved. The chat shows this proposal to the user with a Confirm button; it is saved to My parts only when they tap Confirm. Tell them so.',
      }
    },
  }
}
