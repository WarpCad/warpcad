// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The prompt an agent was given (`TODO/ai-031`, `src/core/prompt.js`): the `record_prompt` tool,
 * `apply_records`' `prompt`, and the one rule that links what a write made to the prompt it was
 * made for.
 *
 * ## The binding
 *
 * {@link import('./index.js').ToolContext}'s `prompt` is `{ id, text }`: the prompt the context's
 * writes are for. `record_prompt` stores one and binds it; `apply_records` with `prompt` binds one
 * whose `id` is still `null`; the in-app chat binds the user's message the same way (`ai-005`'s
 * agent). After **every** tool call, {@link linkProduced} looks at the records the call added: if
 * there are any and a prompt is bound, they are added to its `produced` — and a binding with no
 * id is stored then, so a question that writes nothing leaves no prompt behind, and a refused
 * write (which adds nothing) records none. Doing it once, after the call, covers every write tool
 * on every transport, including a boolean's result record, so a boolean consuming produced
 * bodies never orphans the prompt.
 *
 * A transport that builds a context per call (the tab endpoint, the MCP file session) keeps the
 * binding between calls itself and hands it back on the next context; the registry only reads
 * and updates `ctx.prompt`.
 *
 * @module ai/tools/prompt
 */

import { PROMPT_LIMITS, preparePrompt } from '../../core/prompt.js'
import { assertWriteOrigin } from './limits.js'
import { objectSchema } from './schema.js'

/** @typedef {import('./index.js').ToolContext} ToolContext */

/** The tool's name, which the MCP transport also needs (`mcp/projectFile.js` locks the file for it). */
export const RECORD_PROMPT = 'record_prompt'

/** `apply_records`' optional `prompt` property, and `record_prompt`'s one. */
export const PROMPT_PROPERTY = Object.freeze({
  type: 'string',
  description:
    `The user's request, in their own words as you received them — not a paraphrase or a summary. Saved in the project (at most ${PROMPT_LIMITS.maxTextLength} characters) and linked to every body you build for it.`,
})

/**
 * The records a call added: ids in `document` that were not in `known`.
 *
 * @param {import('../../core/document.js').WarpDocument} document
 * @param {ReadonlySet<string | undefined>} known
 * @returns {string[]}
 */
function addedIds(document, known) {
  /** @type {string[]} */
  const ids = []
  for (const entry of document.entries) {
    const id = entry.record.id
    if (id !== undefined && !known.has(id)) ids.push(id)
  }
  return ids
}

/**
 * The ids in the document now, before a call, for {@link linkProduced}.
 *
 * @param {import('../../core/document.js').WarpDocument} document
 * @returns {Set<string | undefined>}
 */
export function knownIds(document) {
  return new Set(document.entries.map((entry) => entry.record.id))
}

/**
 * After a call: link the records it added to the bound prompt, storing the prompt first when the
 * binding has no id yet (or names one the document does not hold — the MCP session re-reads its
 * file, and an earlier attempt's store may not have been written). Never fails the call that
 * already landed: a prompt that cannot be stored (the project's prompt cap) is reported beside
 * the result instead.
 *
 * @param {ToolContext} ctx
 * @param {ReadonlySet<string | undefined>} known {@link knownIds} from before the call.
 * @returns {string | undefined} Why the prompt could not be stored, when it could not.
 */
export function linkProduced(ctx, known) {
  const binding = ctx.prompt
  if (binding === undefined) return undefined
  const added = addedIds(ctx.document, known)
  if (added.length === 0) return undefined
  try {
    if (binding.id !== null && ctx.document.promptOf(binding.id) !== undefined) {
      ctx.document.addPromptProduced(binding.id, added, { origin: ctx.origin })
    } else {
      const stored = ctx.document.recordPrompt(
        { ...(binding.id !== null ? { id: binding.id } : {}), text: binding.text, produced: added },
        { origin: ctx.origin }
      )
      binding.id = stored.id
    }
  } catch (error) {
    return error instanceof Error ? error.message.replace(/^document\.\w+: /, '') : String(error)
  }
  return undefined
}

/**
 * Bind `text` as the context's prompt: reuse the bound one when the text is the same (an agent
 * that called `record_prompt` and then passes the same words on `apply_records`), otherwise a new
 * binding that is stored once the call adds something.
 *
 * @param {ToolContext} ctx
 * @param {string} text Already prepared ({@link preparePrompt}).
 * @returns {void}
 */
export function bindPrompt(ctx, text) {
  if (ctx.prompt?.text === text) return
  ctx.prompt = { id: null, text }
}

/** @returns {import('./index.js').Tool} */
export function createRecordPromptTool() {
  return {
    name: RECORD_PROMPT,
    description:
      'Record the user’s request in the project, so whoever opens it later (a person or another model) can see why its parts exist. ' +
      'Call it once, first, before any write for a new request — with the user’s words as you received them, not a paraphrase. ' +
      'Every body and step you build afterwards is linked to it and its text becomes their design intent. ' +
      `At most ${PROMPT_LIMITS.maxTextLength} characters are kept; the result echoes the stored text and its id, and says when it was cut.`,
    inputSchema: objectSchema({ prompt: PROMPT_PROPERTY }, ['prompt']),
    // The in-app chat records the user's message itself; this is for agents connected from outside.
    transports: ['mcp'],
    run: (ctx, input) => {
      assertWriteOrigin(ctx.origin)
      const prepared = preparePrompt(input.prompt)
      if (!prepared.ok) return { error: `The prompt was not recorded: ${prepared.reason}.`, reason: prepared.reason }
      let stored
      try {
        stored = ctx.document.recordPrompt({ text: prepared.text }, { origin: ctx.origin })
      } catch (error) {
        const reason = error instanceof Error ? error.message.replace(/^document\.\w+: /, '') : String(error)
        return { error: `The prompt was not recorded: ${reason}.`, reason }
      }
      ctx.prompt = { id: stored.id, text: stored.text }
      return {
        prompt: { id: stored.id, text: stored.text, truncated: prepared.truncated },
        ...(prepared.truncated
          ? { note: `The prompt was longer than ${PROMPT_LIMITS.maxTextLength} characters and was cut; the stored text is above.` }
          : {}),
      }
    },
  }
}
