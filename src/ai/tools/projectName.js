// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `set_project_name` (`TODO/io-040`): an agent names the project — the title a published gist
 * carries and the name Save suggests (`src/core/projectName.js`) — so a project built in the chat
 * or over WebMCP is ready to publish with nothing to type. It renames no file on disk.
 *
 * Same shape and guards as `set_description`: the text is data, never instructions — cleaned to one
 * capped line, stored inert, echoed back as stored with the name it replaced. It changes no row, no
 * limit, and is never a local undo step.
 *
 * @module ai/tools/projectName
 */

import { PROJECT_NAME_LIMITS, prepareProjectName } from '../../core/projectName.js'
import { assertWriteOrigin } from './limits.js'
import { objectSchema } from './schema.js'

/** The tool's name, which the MCP transport also needs (`mcp/projectFile.js` locks the file for it). */
export const SET_PROJECT_NAME = 'set_project_name'

/** @returns {import('./index.js').Tool} */
export function createSetProjectNameTool() {
  return {
    name: SET_PROJECT_NAME,
    description:
      'Set the project’s name: a short title a person would recognise, e.g. "Cable clip". It becomes the title of the gist the person publishes and the name Save suggests; it renames no file. ' +
      `One line, plain text. Replaces the current name (returned as previous); an empty string clears it. At most ${PROJECT_NAME_LIMITS.maxLength} characters are kept.`,
    inputSchema: objectSchema({ name: { type: 'string', description: 'The project’s name, for a person to read.' } }, ['name']),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      assertWriteOrigin(ctx.origin)
      const prepared = prepareProjectName(input.name)
      if (!prepared.ok) return { error: `The name was not set: ${prepared.reason}.`, reason: prepared.reason }
      const previous = ctx.document.name()
      ctx.document.setName(prepared.text, { origin: ctx.origin })
      const text = ctx.document.name()
      return {
        name: { text, truncated: prepared.truncated, previous },
        ...(prepared.truncated
          ? { note: `The name was longer than ${PROJECT_NAME_LIMITS.maxLength} characters and was cut; the stored name is above.` }
          : {}),
      }
    },
  }
}
