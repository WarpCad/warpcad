// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `set_description` (`TODO/io-023`): an agent sets the project's **description** — text for
 * people who open the project or its gist, saying what the part is and what it is for
 * (`src/core/description.js`). Not the user's request (`record_prompt` holds that), and not rules
 * for a model (the standing instructions, which only a person sets). A person sets the same field
 * in File ▾ → **Project settings…**.
 *
 * The text is data, never instructions: cleaned and capped, stored inert, echoed back as stored.
 * It changes no row and no limit. The result also returns the text it replaced, so an agent that
 * overwrote a person's description can see what was there.
 *
 * @module ai/tools/description
 */

import { DESCRIPTION_LIMITS, prepareDescription } from '../../core/description.js'
import { assertWriteOrigin } from './limits.js'
import { objectSchema } from './schema.js'

/** The tool's name, which the MCP transport also needs (`mcp/projectFile.js` locks the file for it). */
export const SET_DESCRIPTION = 'set_description'

/** @returns {import('./index.js').Tool} */
export function createSetDescriptionTool() {
  return {
    name: SET_DESCRIPTION,
    description:
      'Set the project’s description: a short text for people who open the project or its published gist — what the part is and what it is for. ' +
      'Not the user’s request (record_prompt keeps that) and not instructions. ' +
      'It may use a small Markdown subset: paragraphs, "- " bullet lists, **bold**, *italic* and `code`; links, images, headings and HTML show as plain text. ' +
      `Replaces the current description (returned as previous); an empty string clears it. At most ${DESCRIPTION_LIMITS.maxLength} characters are kept.`,
    inputSchema: objectSchema(
      { description: { type: 'string', description: 'The description, for a person to read.' } },
      ['description']
    ),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      assertWriteOrigin(ctx.origin)
      const prepared = prepareDescription(input.description)
      if (!prepared.ok) return { error: `The description was not set: ${prepared.reason}.`, reason: prepared.reason }
      const previous = ctx.document.description()
      ctx.document.setDescription(prepared.text, { origin: ctx.origin })
      const text = ctx.document.description()
      return {
        description: { text, truncated: prepared.truncated, previous },
        ...(prepared.truncated
          ? { note: `The description was longer than ${DESCRIPTION_LIMITS.maxLength} characters and was cut; the stored text is above.` }
          : {}),
      }
    },
  }
}
