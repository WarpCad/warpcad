// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `delete_bodies` tool (`TODO/FIND-ai-051`): what **Delete** and the Inspector's **Remove
 * part** do, for an agent. Without it a discarded attempt could only be hidden by merging it into
 * a scratch body, which leaves boolean rows in History and a body the user never asked for.
 *
 * It calls core's `deleteBodies` (one `body.delete` tombstone per body, one atomic change) or
 * `removePart` (one part of a group). Nothing new is granted: an agent could already consume or
 * resize any body, and **Undo AI turn** takes the tombstones back like any record it wrote.
 *
 * The UI asks the user what to do about Repeats that follow a deleted body (`TODO/ui-069`); a
 * tool cannot be asked, so without `repeats` it refuses, changing nothing, and names the
 * followers. `repeats: 'delete'` and `'leave-broken'` are the dialog's two buttons.
 *
 * @module ai/tools/delete
 */

import { composeIntent } from '../../core/intent.js'
import { ReplayRejection } from '../../core/document.js'
import { followersOf } from '../../core/repeat.js'
import { assertWriteOrigin } from './limits.js'
import { findBody, sceneSummary } from './read.js'
import { objectSchema, withRationale } from './schema.js'

/** @typedef {import('./index.js').Tool} Tool */

/** @returns {Tool} */
export function createDeleteBodiesTool() {
  return {
    name: 'delete_bodies',
    description:
      'Delete bodies you no longer need, including your own discarded attempts, e.g. { "ids": ["cuboid-abcdef-1"] }. Do not merge them into a scratch body. ' +
      'Several ids go in one call and are one change; the user can bring them back with Undo AI turn or Undo. ' +
      'Pass part with exactly one id to remove one part of a group instead (the body stays). ' +
      'If Repeats follow a body you delete, nothing is deleted and the reply lists them: call again with repeats "delete" to delete them too, or "leave-broken" to keep them as broken History rows. ' +
      'Refused, changing nothing, for an id that is not a body on screen (call describe_scene), one named twice, or a part the group does not have.',
    inputSchema: withRationale(
      objectSchema(
        {
          ids: {
            type: 'array',
            description: 'Body ids from describe_scene, one or more.',
            items: { type: 'string' },
          },
          part: { type: 'string', description: 'A part name from describe_body. With it, ids holds exactly one group and only that part is removed.' },
          repeats: {
            type: 'string',
            enum: ['delete', 'leave-broken'],
            description: 'What to do with Repeats that follow a deleted body: "delete" them too, or "leave-broken" (keep their rows, flagged broken). Needed only when the reply lists followers.',
          },
        },
        ['ids'],
      ),
    ),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      assertWriteOrigin(ctx.origin)
      const { document, turn } = ctx
      /** @type {string[]} */
      const ids = input.ids
      const { part, repeats } = input
      if (ids.length === 0) return { error: 'ids must name at least one body. Call describe_scene for the ids there are.' }
      if (part !== undefined && ids.length !== 1) return { error: 'part removes one part of one group: pass exactly one id with it.' }

      /** @type {Array<{ id: string, name: string }>} */
      const named = []
      for (const id of ids) {
        const found = findBody(document, id)
        if (found.reason !== undefined) return { error: found.reason }
        if (named.some((entry) => entry.id === id)) return { error: `${found.body.name} is named twice — give each body once` }
        named.push({ id: found.body.id, name: found.body.name })
      }

      const intent = composeIntent(ctx.request ?? ctx.prompt?.text, input.rationale)
      const transaction = { origin: /** @type {string} */ (ctx.origin), ...(intent === undefined ? {} : { intent }) }

      try {
        if (part !== undefined) {
          const body = /** @type {any} */ (findBody(document, ids[0]).body)
          if (body.repeat !== undefined && body.repeat.targets.length === 1 && body.repeat.targets[0] === part) {
            // Removing a Repeat's last member deletes the Repeat, as the Inspector does.
            return deleteWhole(ctx, [ids[0]], undefined, transaction, named)
          }
          const hit = turn.canAppend(1)
          if (hit) return hit
          document.removePart(ids[0], part, { ...transaction, label: `Remove ${part} from ${body.name}` })
          turn.commitRecords(1)
          return { removed: { id: ids[0], part }, scene: sceneSummary(document) }
        }
        return deleteWhole(ctx, ids, repeats, transaction, named)
      } catch (error) {
        if (error instanceof ReplayRejection) return { error: error.message, step: error.step.step, reason: error.step.reason }
        if (error instanceof Error) return { error: error.message.replace(/^document\.(deleteBodies|removePart): /, '') }
        throw error
      }
    },
  }
}

/**
 * @param {import('./index.js').ToolContext} ctx
 * @param {string[]} ids
 * @param {'delete' | 'leave-broken' | undefined} repeats
 * @param {import('../../core/document.js').TransactionOptions} transaction
 * @param {Array<{ id: string, name: string }>} named
 * @returns {Record<string, any>}
 */
function deleteWhole(ctx, ids, repeats, transaction, named) {
  const { document, turn } = ctx
  const followers = followersOf(document.bodies(), ids)
  if (followers.length > 0 && repeats === undefined) {
    const list = followers.map((follower) => `${follower.name} (${follower.id})`).join(', ')
    return {
      error: `${list} follow${followers.length === 1 ? 's' : ''} what you are deleting, so nothing was deleted. Call again with repeats "delete" to delete ${followers.length === 1 ? 'it' : 'them'} too, or "leave-broken" to keep the row${followers.length === 1 ? '' : 's'} flagged broken in History.`,
      followers: followers.map(({ id, name }) => ({ id, name })),
    }
  }
  const followerIds = followers.map((follower) => follower.id)
  const all = repeats === 'delete' ? [...ids, ...followerIds] : ids
  const count = all.length + (repeats === 'leave-broken' ? followerIds.length : 0)
  const hit = turn.canAppend(count)
  if (hit) return hit

  const label = all.length === 1 ? `Delete ${named[0]?.name ?? 'object'}` : `Delete ${all.length} objects`
  if (repeats === 'leave-broken' && followerIds.length > 0) {
    document.batch(
      (doc) => {
        doc.reviseRecords(followerIds.map((id) => ({ id, leftBroken: true })), transaction)
        return doc.deleteBodies(ids, transaction)
      },
      { label },
    )
  } else {
    document.deleteBodies(all, { ...transaction, label })
  }
  turn.commitRecords(count)
  const deleted = all.map((id) => ({ id, name: named.find((entry) => entry.id === id)?.name ?? followers.find((follower) => follower.id === id)?.name ?? id }))
  return { deleted, scene: sceneSummary(document) }
}
