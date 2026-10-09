// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The read tools (`TODO/ai-002`): what the model sees of the scene.
 *
 * - **`describe_scene`**: every body, with its id, name, op, bounds in millimetres,
 *   colour and part names.
 * - **`describe_body(id)`**: one body, adding its params, position and rotation.
 * - **`get_timeline`**: the History rows, compactly.
 * - **`get_selection`** / **`select(ids)`** (browser only): selection is not something
 *   the model needs for geometry, since operations take ids. It exists so the *human*
 *   sees what the AI is talking about (`CLAUDE.md`'s feedback rule).
 *
 * Results are compact on purpose. A mesh is never returned: a result is read by a
 * model, priced per token, and a body's polygons would cost thousands of tokens to say
 * nothing it can act on. Part names **are** returned, so the model can address a part
 * (`{ id, pieces: 'tap' }`) the way a human drills in. Numbers are rounded to a
 * micrometre so a result does not carry floating-point noise into the conversation.
 *
 * Document-derived text (body and part names) is untrusted input
 * (`docs/decisions/ai-partner.md` decision 7). These tools return it as plain JSON
 * values; wrapping and escaping it as `document_data` is the agent's job (`ai-005`),
 * done once for every tool result rather than per tool.
 *
 * @module ai/tools/read
 */

import { recipeColorOf } from '../../core/colorOverride.js'
import { boundsOf, hiddenNamesOf, isGroup } from '../../core/kernel/group.js'
import { latestIntentOf } from '../../core/intent.js'
import { objectSchema } from './schema.js'

/** @typedef {import('../../core/document.js').WarpDocument} WarpDocument */
/** @typedef {import('../../core/document.js').Body} Body */
/** @typedef {import('./index.js').Tool} Tool */
/** @typedef {[number, number, number]} Vec3 */

/**
 * @typedef {object} PartSummary
 * @property {string} name Exactly as an operand's `pieces` takes it.
 * @property {boolean} hidden In the group but not drawn by default (a bolt's `tap`).
 */

/**
 * @typedef {object} BodySummary
 * @property {string} id The body's stable id — what every tool takes.
 * @property {string} name
 * @property {string} op The registry op that created it.
 * @property {[Vec3, Vec3]} boundsMm World-axis `[min, max]`.
 * @property {Vec3} sizeMm
 * @property {string | null} color `#rrggbb`, or `null` for the default material.
 * @property {PartSummary[]} parts Empty for a body with no named parts.
 */

/**
 * @typedef {object} SceneSummary
 * @property {number} count
 * @property {BodySummary[]} bodies
 * @property {{ activeSteps: number, totalSteps: number } | null} rolledBack Set while the
 *   History is rolled back: rows past the marker are not evaluated, so their bodies are
 *   absent here, and a new write lands at the marker.
 * @property {Array<{ id: string, name: string, state: string }>} inactiveBodies Bodies a
 *   condition is currently leaving out (`TODO/ui-052`).
 */

/**
 * Round to a micrometre, and never report `-0`.
 *
 * @param {number} value
 * @returns {number}
 */
export function round(value) {
  const rounded = Math.round(value * 1e6) / 1e6
  return rounded === 0 ? 0 : rounded
}

/**
 * @param {readonly number[]} vector
 * @returns {Vec3}
 */
export function round3(vector) {
  return [round(vector[0]), round(vector[1]), round(vector[2])]
}

/**
 * @param {number} color `0xRRGGBB`.
 * @returns {string}
 */
function hex(color) {
  return `#${color.toString(16).padStart(6, '0')}`
}

/**
 * The colour that paints the whole body: the user's whole-body override, else the
 * recipe's own colour when the body is a single visible part, else `null`.
 *
 * @param {Body} body
 * @returns {string | null}
 */
function colorOf(body) {
  const whole = body.colorOverrides?.find((override) => override.subPart === undefined)
  if (whole) return hex(whole.color)
  const geometry = body.geometry
  if (isGroup(geometry) && geometry.names.length === 1) {
    const recipe = recipeColorOf(geometry.colors, geometry.names[0])
    if (recipe) return hex(recipe.color)
  }
  return null
}

/**
 * @param {Body} body
 * @returns {PartSummary[]}
 */
function partsOf(body) {
  const geometry = body.geometry
  if (!isGroup(geometry)) return []
  return [
    ...geometry.names.map((name) => ({ name, hidden: false })),
    ...hiddenNamesOf(geometry).map((name) => ({ name, hidden: true })),
  ]
}

/**
 * One body, compactly. Never its mesh.
 *
 * @param {Body} body
 * @returns {BodySummary}
 */
export function bodySummary(body) {
  const [min, max] = boundsOf(body.geometry)
  return {
    id: body.id,
    name: body.name,
    op: body.op,
    boundsMm: [round3(min), round3(max)],
    sizeMm: round3([max[0] - min[0], max[1] - min[1], max[2] - min[2]]),
    color: colorOf(body),
    parts: partsOf(body),
  }
}

/**
 * The whole scene, compactly — what every write tool returns after it lands, so the
 * model sees what its call did rather than a bare "ok".
 *
 * @param {WarpDocument} document
 * @returns {SceneSummary}
 */
export function sceneSummary(document) {
  const bodies = document.bodies().map(bodySummary)
  const at = document.rollbackAt()
  return {
    count: bodies.length,
    bodies,
    rolledBack: at === null ? null : { activeSteps: at, totalSteps: document.entries.length },
    inactiveBodies: document.inactiveBodies().map((body) => ({ id: body.id, name: body.name, state: body.state })),
  }
}

/**
 * `value` with `intent` added when there is one (`TODO/ai-003`), unchanged otherwise, so a
 * body or row without intent carries no empty field.
 *
 * @template {object} T
 * @param {T} value
 * @param {string | undefined} intent
 * @returns {T & { intent?: string }}
 */
function withIntent(value, intent) {
  return intent === undefined ? value : { ...value, intent }
}

/**
 * Find a body the model named, or say exactly why it cannot be used.
 *
 * Only an id the document issued, for a body that is on screen now, is accepted
 * (decision 7: "address something the document didn't issue" is refused). The two
 * refusals are told apart because the model's fix differs: an id it made up needs
 * `describe_scene`, while an id that is in the History but not on screen
 * (suppressed, past the rollback marker, consumed by a boolean or group, deleted)
 * needs a different body.
 *
 * @param {WarpDocument} document
 * @param {string} id
 * @returns {{ body: Body, reason?: undefined } | { body?: undefined, reason: string }}
 */
export function findBody(document, id) {
  const body = document.bodies().find((candidate) => candidate.id === id)
  if (body) return { body }
  if (document.recordOf(id) !== undefined || document.entries.some((entry) => entry.record.id === id)) {
    return {
      reason:
        `"${id}" is not a body on screen — it is suppressed, past the rollback marker, ` +
        'consumed by an earlier operation, deleted, or a step rather than a body. Call describe_scene for the bodies there are.',
    }
  }
  return { reason: `The document has no body "${id}". Call describe_scene for the ids there are.` }
}

/**
 * Resolve a list of body ids for a tool that reads geometry (`TODO/ai-007`): every id must be a
 * body on screen, duplicates are dropped, and an empty list is refused with a sentence saying
 * what to pass.
 *
 * @param {WarpDocument} document
 * @param {readonly string[]} ids
 * @returns {{ bodies: Body[], error?: undefined } | { bodies?: undefined, error: string }}
 */
export function resolveBodies(document, ids) {
  if (ids.length === 0) return { error: 'Name at least one body id. Call describe_scene for the ids there are.' }
  /** @type {Body[]} */
  const bodies = []
  for (const id of new Set(ids)) {
    const found = findBody(document, id)
    if (found.reason !== undefined) return { error: found.reason }
    bodies.push(found.body)
  }
  return { bodies }
}

/**
 * The read tools. Two are browser-only: the MCP server edits a closed file, with no
 * human looking at a selection.
 *
 * @returns {Tool[]}
 */
export function createReadTools() {
  return [
    {
      name: 'describe_scene',
      description:
        'List every body in the scene: id, name, the op that made it, world bounds and size in millimetres, colour, its named parts, and why it was made (intent, when recorded). ' +
        'Never returns geometry. Call this first, and whenever you need ids.',
      inputSchema: objectSchema({}),
      transports: ['ai', 'mcp'],
      run: (ctx) => {
        // TODO/ai-003: here, and not in the summary every write returns (which would repeat
        // every intent back on every call), each body says why it exists.
        const scene = sceneSummary(ctx.document)
        return { ...scene, bodies: scene.bodies.map((body) => withIntent(body, latestIntentOf(ctx.document, body.id))) }
      },
    },
    {
      name: 'describe_body',
      description:
        'Describe one body by id: everything describe_scene says, plus the params it was built with, its centre position (mm) and rotation (degrees).',
      inputSchema: objectSchema({ id: { type: 'string', description: 'A body id from describe_scene.' } }, ['id']),
      transports: ['ai', 'mcp'],
      run: (ctx, input) => {
        const found = findBody(ctx.document, input.id)
        if (found.reason !== undefined) return { error: found.reason }
        const { body } = found
        const summary = bodySummary(body)
        const [min, max] = summary.boundsMm
        return {
          ...withIntent(summary, latestIntentOf(ctx.document, body.id)),
          recordId: body.recordId,
          params: body.params,
          positionMm: round3([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]),
          rotationDeg: round3(body.rotationDeg),
        }
      },
    },
    {
      name: 'get_timeline',
      description:
        'List the History: one row per step, in order, with its op, a short label, who wrote it (origin), why it was made (intent, when recorded), and whether it is suppressed, active (before the rollback marker) or broken.',
      inputSchema: objectSchema({}),
      transports: ['ai', 'mcp'],
      run: (ctx) => ({
        rollbackAt: ctx.document.rollbackAt(),
        rows: ctx.document.timeline().map((row) => ({
          step: row.step,
          id: row.id,
          op: row.record.op,
          label: row.label,
          origin: row.origin,
          ...(row.intent === null ? {} : { intent: row.intent }),
          suppressed: row.suppressed,
          active: row.active,
          broken: row.broken,
        })),
      }),
    },
    {
      name: 'get_selection',
      description: 'The bodies the user currently has selected in the viewport, by id and name.',
      inputSchema: objectSchema({}),
      transports: ['ai'],
      run: (ctx) => selectionResult(ctx),
    },
    {
      name: 'select',
      description:
        'Select bodies in the viewport so the user can see which ones you mean. Selection does not change geometry, and operations take ids directly; an empty list clears the selection.',
      inputSchema: objectSchema(
        { ids: { type: 'array', items: { type: 'string' }, description: 'Body ids from describe_scene.' } },
        ['ids']
      ),
      transports: ['ai'],
      run: (ctx, input) => {
        if (!ctx.selection) return { error: 'This transport has no selection to set.' }
        for (const id of input.ids) {
          const found = findBody(ctx.document, id)
          if (found.reason !== undefined) return { error: found.reason }
        }
        ctx.selection.select([...input.ids])
        return selectionResult(ctx)
      },
    },
  ]
}

/**
 * @param {import('./index.js').ToolContext} ctx
 * @returns {Record<string, any>}
 */
function selectionResult(ctx) {
  if (!ctx.selection) return { error: 'This transport has no selection to read.' }
  const ids = ctx.selection.ids()
  const bodies = ctx.document.bodies()
  return {
    ids,
    bodies: ids.flatMap((id) => {
      const body = bodies.find((candidate) => candidate.id === id)
      return body ? [{ id: body.id, name: body.name }] : []
    }),
  }
}
