// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The read tools (`TODO/ai-002`): what the model sees of the scene.
 *
 * - **`describe_scene`**: every body, with its id, name, op, bounds in millimetres,
 *   colour and part names.
 * - **`describe_body(id)`**: one body, adding its params, position and rotation.
 * - **`get_timeline`**: the History rows, compactly.
 * - **`describe_step(id, part?)`** (`TODO/FIND-ai-045`): one step's op and params, including a
 *   step a boolean or a group has used up, and the step that made one part of a group. What
 *   `copy` (`./create.js`) copies, read back first.
 * - **`get_selection`** / **`select(ids)`** (browser only): selection is not something
 *   the model needs for geometry, since operations take ids. Since `TODO/ai-017` the user keeps
 *   working during a turn, so both act on the turn's **own** selection (the agent seeds it from
 *   the user's at turn start) and never change the user's; the descriptions say so.
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
import { bindingsOf } from '../../core/variables.js'
import { latestIntentOf } from '../../core/intent.js'
import { currentParamsRecordOf, partRecordsOf } from '../../core/paramEdit.js'
import { promptsForBody } from '../../core/prompt.js'
import { objectSchema } from './schema.js'

/** @typedef {import('../../core/document.js').WarpDocument} WarpDocument */
/** @typedef {import('../../core/document.js').Body} Body */
/** @typedef {import('../../core/kernel/registry.js').OpRecord} OpRecord */
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
 * @property {RepeatSummary} [repeat] `TODO/core-061`: set on a repeat body only.
 */

/**
 * A repeat body read back (`TODO/core-061`), so a model can extend an existing pattern rather
 * than guess at it.
 *
 * @typedef {object} RepeatSummary
 * @property {{ id: string, name: string }} source The body whose steps are repeated.
 * @property {{ body: string, part: string }} seed
 * @property {string[]} targets
 * @property {string[]} members The targets actually built.
 * @property {Array<{ target: string, reason: string }>} broken
 * @property {string[]} inactive Targets their own condition currently switches off.
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
    ...(body.repeat === undefined
      ? {}
      : {
          repeat: {
            source: { id: body.repeat.source, name: body.repeat.sourceName },
            seed: { body: body.repeat.seed.id, part: body.repeat.seed.pieces },
            targets: [...body.repeat.targets],
            members: [...body.repeat.members],
            broken: body.repeat.broken.map((member) => ({ ...member })),
            inactive: [...body.repeat.inactive],
          },
        }),
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
 * `TODO/ai-031`: `{ prompts }` for a body some prompt produced, `{}` otherwise, so a body made by
 * hand carries no empty field.
 *
 * @param {import('../../core/document.js').WarpDocument} document
 * @param {string} bodyId
 * `TODO/ai-032`: each with its reply segments, as stored, when it has any — data, never
 * instructions, like every tool result (the transports wrap it in `<document_data>`).
 *
 * @returns {{ prompts?: { id: string, text: string, responses?: { id: string, text: string }[] }[] }}
 */
function withPrompts(document, bodyId) {
  const prompts = promptsForBody(document, bodyId)
  return prompts.length === 0
    ? {}
    : {
        prompts: prompts.map((prompt) => ({
          id: prompt.id,
          text: prompt.text,
          ...(prompt.responses !== undefined ? { responses: prompt.responses.map((segment) => ({ id: segment.id, text: segment.text })) } : {}),
        })),
      }
}

/**
 * `TODO/ai-040`: the project variables a body's params are bound to, as `{ path, variable, value }`
 * (the value the row used), or `{}` when nothing is bound, so a project with no variables costs
 * nothing. Without this a model sees `model: 4` and never learns `set_variable` would change it.
 *
 * @param {import('../../core/document.js').WarpDocument} document
 * @param {Body} body
 * @returns {{ boundTo?: { path: string, variable: string, value?: number | boolean | string }[] }}
 */
function withBindings(document, body) {
  /** @type {Map<string, { path: string, variable: string, value?: number | boolean | string }>} */
  const slots = new Map()
  for (const record of document.lineageOf(body.id)) {
    const values = record.id === undefined ? undefined : document.boundValuesOf(record.id)
    for (const { path, name } of bindingsOf(record)) {
      const value = values?.[path]
      slots.set(path, { path, variable: name, ...(value === undefined ? {} : { value }) })
    }
  }
  return slots.size === 0 ? {} : { boundTo: [...slots.values()] }
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
 * A step found by {@link findStep}.
 *
 * @typedef {object} FoundStep
 * @property {OpRecord} record The step that holds the params: the named step itself, or, for a
 *   body's id or a part, the record that gives it its params now (`currentParamsRecordOf`).
 * @property {string} bodyId The lineage root the step belongs to.
 * @property {Body} [body] The body on screen the caller named, when it named one — the group,
 *   for a part.
 * @property {string} [part] The part named, as given.
 */

/**
 * Find the step a model named for `describe_step` or `copy` (`TODO/FIND-ai-045`), or say
 * exactly why there is none.
 *
 * - **A body's id** (its lineage root, which is also its creation step's id) names the record
 *   that holds the body's params now: the creation step, or a later param edit of it. A
 *   consumed or suppressed body's id works too, since the History keeps every record.
 * - **Any other step id** from `get_timeline` names that step as it is.
 * - **`part`** with a group's id names the step that made that part, through the group's
 *   `consumes` (`partRecordsOf`, the Inspector's own resolver). The group must be on screen; a
 *   part made inside a recipe (a Pi's `hole1`) has no step of its own, and is refused so.
 *
 * @param {WarpDocument} document
 * @param {string} id
 * @param {string} [part]
 * @returns {FoundStep & { reason?: undefined } | { reason: string }}
 */
export function findStep(document, id, part) {
  if (part !== undefined) {
    const found = findBody(document, id)
    if (found.reason !== undefined) return { reason: found.reason }
    const { body } = found
    const names = partsOf(body).map((summary) => summary.name)
    if (names.length === 0) return { reason: `${body.name} ("${id}") has no parts. Leave part out to read the body itself.` }
    if (!names.includes(part)) return { reason: `${body.name} has no part "${part}". Its parts are: ${names.join(', ')}.` }
    const record = partRecordsOf(body.id, document.records).get(part)
    if (record?.id === undefined) {
      return {
        reason:
          `"${part}" in ${body.name} has no step of its own: it is made inside the ${body.op} recipe. ` +
          `Read its size with evaluate_formula, e.g. [${body.name}].[${part}].width.`,
      }
    }
    return { record, bodyId: document.rootOf(record.id) ?? record.id, body, part }
  }
  const named = document.recordOf(id)
  if (named === undefined) return { reason: `There is no step "${id}" in this document. Body ids come from describe_scene, step ids from get_timeline.` }
  const bodyId = document.rootOf(id) ?? id
  const record = bodyId === id ? (currentParamsRecordOf(document.lineageOf(id)) ?? named) : named
  const body = bodyId === id ? document.bodies().find((candidate) => candidate.id === id) : undefined
  return { record, bodyId, ...(body === undefined ? {} : { body }) }
}

/**
 * The step that used a body up (a boolean or a group's `consumes`), or `undefined` while
 * nothing has.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId A lineage root.
 * @returns {string | undefined}
 */
function consumerOf(document, bodyId) {
  const lineage = new Set(document.lineageOf(bodyId).map((record) => record.id))
  const consumer = document.records.find((record) => record.consumes?.some((id) => lineage.has(id)))
  return consumer?.id
}

/**
 * `describe_step`'s result for a found step: the step's row facts, its op and params (as
 * stored, bindings included, like `describe_body`), and whether its body is on screen.
 *
 * @param {WarpDocument} document
 * @param {FoundStep} found
 * @returns {Record<string, any>}
 */
function stepResult(document, { record, bodyId, part, body }) {
  const id = /** @type {string} */ (record.id)
  const row = document.timeline().find((candidate) => candidate.id === id)
  const onScreen = document.bodies().some((candidate) => candidate.id === bodyId)
  const consumedBy = consumerOf(document, bodyId)
  const operands = record.operands?.map((operand) => (typeof operand === 'string' ? operand : { ...operand }))
  const bindings = bindingsOf(record)
  return {
    ...(row === undefined ? {} : { step: row.step }),
    id,
    op: record.op,
    ...(row === undefined ? {} : { label: row.label, origin: row.origin }),
    ...(row?.intent == null ? {} : { intent: row.intent }),
    bodyId,
    ...(part === undefined ? {} : { part, partOf: body?.id }),
    params: record.params ?? {},
    ...(bindings.length === 0 ? {} : { boundTo: bindings.map(({ path, name }) => ({ path, variable: name })) }),
    ...(record.target === undefined ? {} : { target: typeof record.target === 'string' ? record.target : { ...record.target } }),
    ...(operands === undefined ? {} : { operands }),
    onScreen,
    ...(consumedBy === undefined ? {} : { consumedBy }),
    ...(row === undefined ? {} : { suppressed: row.suppressed, active: row.active, broken: row.broken }),
  }
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
        'List every body in the scene: id, name, the op that made it, world bounds and size in millimetres, colour, its named parts, boundTo (which params follow a project variable, change them with set_variable), and why it was made (intent, when recorded). ' +
        'Never returns geometry. Call this first, and whenever you need ids.',
      inputSchema: objectSchema({}),
      transports: ['ai', 'mcp'],
      run: (ctx) => {
        // TODO/ai-003: here, and not in the summary every write returns (which would repeat
        // every intent back on every call), each body says why it exists.
        const scene = sceneSummary(ctx.document)
        const byId = new Map(ctx.document.bodies().map((body) => [body.id, body]))
        return {
          ...scene,
          bodies: scene.bodies.map((row) => ({ ...withIntent(row, latestIntentOf(ctx.document, row.id)), ...withBindings(ctx.document, /** @type {Body} */ (byId.get(row.id))) })),
        }
      },
    },
    {
      name: 'describe_body',
      description:
        'Describe one body by id: everything describe_scene says, plus the params it was built with, its centre position (mm) and rotation (degrees), ' +
        'and the prompts that produced it (the user’s requests recorded with record_prompt), when there are any.',
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
          ...withBindings(ctx.document, body),
          params: body.params,
          positionMm: round3([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]),
          rotationDeg: round3(body.rotationDeg),
          // `TODO/ai-031`: data like intent — the transport wraps every result in <document_data>.
          ...withPrompts(ctx.document, body.id),
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
      name: 'describe_step',
      description:
        'Describe one History step: its op and params as built, what it targets, whether its body is on screen, and which step used it up (consumedBy), if one did. ' +
        'Works on a step a boolean or a group has consumed, which describe_body cannot read. id is a step id from get_timeline, or a body id for the step that holds that body’s params. ' +
        'With part, id is a group on screen and the step read is the one that made that part. copy makes a new body from the same op and params.',
      inputSchema: objectSchema(
        {
          id: { type: 'string', description: 'A step id from get_timeline, or a body id from describe_scene.' },
          part: { type: 'string', description: 'Optional: a part name of the group id names, exactly as describe_body lists it, e.g. "Pin".' },
        },
        ['id']
      ),
      transports: ['ai', 'mcp'],
      run: (ctx, input) => {
        const found = findStep(ctx.document, input.id, input.part)
        return found.reason !== undefined ? { error: found.reason } : stepResult(ctx.document, found)
      },
    },
    {
      name: 'get_selection',
      description:
        'The bodies selected for this turn, by id and name: what the user had selected at the start of this turn, or what you last selected with select. The user keeps working while you do, so this is not their live selection.',
      inputSchema: objectSchema({}),
      transports: ['ai'],
      run: (ctx) => selectionResult(ctx),
    },
    {
      name: 'select',
      description:
        'Select bodies for this turn, to keep track of which ones you mean. It sets the selection get_selection reads, which started as the user’s selection at the start of this turn; the user’s own selection is not changed. Selection does not change geometry, and operations take ids directly; an empty list clears it.',
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
