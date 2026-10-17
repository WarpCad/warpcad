// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The chat transcript (`TODO/ai-006`): a **pure reducer** over the agent's events
 * (`src/ai/agent.js`'s `AgentEvent`). The panel renders what this returns; nothing here knows
 * about Vue, the DOM or the document, so every shape — streamed text, a tool row, an error row,
 * a stopped turn — is a unit test, not a browser session.
 *
 * Items are plain data, and {@link applyEvent} returns a new list rather than editing the one it
 * is given, so a store can swap it in and Vue sees one change per event.
 *
 * @module ai/transcript
 */

/**
 * @typedef {{ kind: 'user', text: string, images: number }} UserItem
 * @typedef {{ kind: 'assistant', text: string }} AssistantItem
 * @typedef {object} ToolItem
 * @property {'tool'} kind
 * @property {string} id The provider's tool-call id.
 * @property {string} name
 * @property {string} label What the row says ("Created Cube 1").
 * @property {'running' | 'ok' | 'error' | 'discarded'} status `discarded`: the turn did not
 *   land, so this call's effect was thrown away with it.
 * @property {string[]} bodyIds Bodies the call made or changed, for "tap to select".
 * @property {string} [error] The tool's own reason, for an `error` row.
 * @property {any} [input] Kept so the label can be rebuilt when the result arrives.
 * @property {string} [thumbnail] `capture_view` (`TODO/ai-007`): the captured PNG as a `data:`
 *   URL, so the human sees what the model saw.
 * @property {string} [summary] A check's numbers in one line ("214 × 52 × 18 mm · 64000 mm³").
 * @property {'pass' | 'fail'} [check] A check tool's verdict: `fail` when it found an error or
 *   warning, or two bodies interpenetrate. The row looks different, not only coloured.
 * @typedef {{ kind: 'notice', level: 'stopped' | 'cancelled' | 'failed' | 'info', message: string }} NoticeItem
 * @typedef {object} SaveItem `TODO/ai-008`: a library Save the model proposed. Nothing is saved
 *   until the user taps Confirm on it.
 * @property {'save'} kind
 * @property {string} bodyId
 * @property {string} name
 * @property {string[]} expose `exposableParams` keys.
 * @property {string[]} labels What each exposed size is called.
 * @property {'proposed' | 'saving' | 'saved' | 'cancelled' | 'failed'} status
 * @property {string} [op] The saved part's op, once saved.
 * @property {string} [error] Why the Save failed.
 * @typedef {UserItem | AssistantItem | ToolItem | NoticeItem | SaveItem} TranscriptItem
 */

/** @type {Readonly<Record<string, string>>} */
const READ_LABELS = {
  describe_scene: 'Looked at the scene',
  describe_body: 'Looked at a body',
  get_timeline: 'Read the History',
  get_selection: 'Checked the selection',
  list_ops: 'Checked what operations exist',
  list_variables: 'Read the variables',
  select: 'Selected a body',
}

/**
 * @param {string} op e.g. `boolean.subtract`
 * @returns {string} e.g. `Subtract`
 */
function verbOf(op) {
  const last = op.split('.').at(-1) ?? op
  const spaced = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * @param {any} result
 * @param {string} id
 * @returns {string | undefined}
 */
function sceneNameOf(result, id) {
  const bodies = result?.scene?.bodies
  if (!Array.isArray(bodies)) return undefined
  return bodies.find((body) => body?.id === id)?.name
}

/**
 * What one tool call reads as, in one line. Pure function of the call and its result (and an
 * optional id → name lookup for operands that no longer exist in the result's scene).
 *
 * @param {string} name The tool.
 * @param {any} input
 * @param {any} [result]
 * @param {(id: string) => string | undefined} [nameOf]
 * @returns {string}
 */
export function describeCall(name, input, result, nameOf) {
  if (name in READ_LABELS) return READ_LABELS[name]
  if (name === 'capture_view') {
    if (input?.overlay === 'reference') return 'Compared the top view with the drawing'
    return `Looked at the ${typeof input?.view === 'string' ? input.view : 'iso'} view`
  }
  // `TODO/ai-008`: the drawing tools.
  if (name === 'get_reference_image') return 'Looked at the drawing'
  if (name === 'set_reference_scale') {
    const length = Number(input?.distanceMm)
    const amount = Number.isFinite(length) ? `${length.toFixed(1)} mm` : 'the scale'
    const label = typeof input?.label === 'string' && input.label.trim() !== '' ? ` from “${input.label.trim()}”` : ''
    return `Set scale ${amount}${label}`
  }
  if (name === 'locate_in_image') return `Located “${typeof input?.query === 'string' ? input.query : 'features'}” on the drawing`
  if (name === 'save_to_library') return `Proposed saving “${typeof input?.name === 'string' ? input.name.trim() : 'a part'}” to My parts`
  if (name === 'measure') {
    const ids = Array.isArray(input?.ids) ? input.ids : []
    const names = ids.map((/** @type {string} */ id) => result?.bodies?.find((/** @type {any} */ body) => body?.id === id)?.name ?? nameOf?.(id) ?? String(id))
    return names.length === 0 ? 'Measured' : `Measured ${names.join(', ')}`
  }
  if (name === 'check_printability') return 'Checked printability'
  if (name === 'check_clearance') return 'Checked clearance'
  // `TODO/ai-014`: the project-variable tools.
  const word = (/** @type {unknown} */ value) => (typeof value === 'string' ? value : 'a variable')
  if (name === 'define_variable') return `Defined ${word(input?.name)}`
  if (name === 'set_variable') return `Set ${word(input?.name)} to ${String(input?.value)}`
  if (name === 'bind_param' || name === 'unbind_param') {
    const id = typeof input?.id === 'string' ? input.id : ''
    const subject = `${nameOf?.(id) ?? sceneNameOf(result, id) ?? (id || 'a step')} ${typeof input?.path === 'string' ? input.path : ''}`.trim()
    return name === 'bind_param' ? `Bound ${subject} to ${word(input?.name)}` : `Unbound ${subject}`
  }
  if (name === 'rename_variable') return `Renamed ${word(input?.from)} to ${word(input?.to)}`
  if (name === 'delete_variable') return `Deleted variable ${word(input?.name)}`
  // `TODO/core-061`.
  if (name === 'repeat') {
    const count = Array.isArray(input?.targets) ? input.targets.length : 0
    const source = typeof input?.source === 'string' ? nameOf?.(input.source) ?? sceneNameOf(result, input.source) ?? input.source : 'a part'
    return `Repeated ${source} on ${count} more ${count === 1 ? 'part' : 'parts'}`
  }
  if (name === 'apply_records') {
    const count = Array.isArray(input?.steps) ? input.steps.length : 0
    return `Applied ${count} ${count === 1 ? 'step' : 'steps'}`
  }
  if (name === 'create') {
    const bodyId = result?.applied?.[0]?.bodyId
    const made = typeof bodyId === 'string' ? sceneNameOf(result, bodyId) : undefined
    const op = typeof input?.op === 'string' ? input.op : ''
    return `Created ${made ?? (op === '' ? 'a body' : verbOf(op).toLowerCase())}`
  }
  if (name === 'operate') {
    const op = typeof input?.op === 'string' ? input.op : 'operation'
    const operands = Array.isArray(input?.operands) ? input.operands : []
    const names = operands.map((/** @type {any} */ operand) => {
      const id = typeof operand === 'string' ? operand : operand?.id
      return nameOf?.(id) ?? sceneNameOf(result, id) ?? String(id)
    })
    const joiner = op === 'boolean.subtract' ? ' − ' : op === 'boolean.union' ? ' + ' : ', '
    return names.length === 0 ? verbOf(op) : `${verbOf(op)} ${names.join(joiner)}`
  }
  return `Used ${name}`
}

/** @param {unknown} value @returns {string} */
const plain = (value) => String(Number(Number(value).toFixed(2)))

/**
 * What a check tool's row adds (`TODO/ai-007`): its numbers, its verdict and, for a capture, the
 * picture. Pure, like everything here; an unexpected result shape adds nothing.
 *
 * @param {string} name
 * @param {any} result
 * @returns {Pick<ToolItem, 'thumbnail' | 'summary' | 'check'>}
 */
function checkDetails(name, result) {
  if (name === 'capture_view') {
    const image = result?.image
    if (typeof image?.data !== 'string' || typeof image?.mediaType !== 'string') return {}
    return {
      thumbnail: `data:${image.mediaType};base64,${image.data}`,
      ...(typeof result.warning === 'string' ? { summary: result.warning, check: 'fail' } : {}),
    }
  }
  if (name === 'set_reference_scale') {
    // A printed dimension that disagrees with the scale is something the human should see.
    return typeof result?.warning === 'string' ? { summary: result.warning, check: 'fail' } : {}
  }
  if (name === 'measure') {
    const body = result?.total ?? result?.bodies?.[0]
    if (!Array.isArray(body?.sizeMm) || typeof body?.volumeMm3 !== 'number') return {}
    return { summary: `${body.sizeMm.map(plain).join(' × ')} mm · ${Math.round(body.volumeMm3)} mm³` }
  }
  if (name === 'check_printability') {
    const issues = Array.isArray(result?.issues) ? result.issues : []
    const problem = issues.find((/** @type {any} */ issue) => issue?.severity === 'error' || issue?.severity === 'warning')
    const first = problem ?? issues[0]
    return {
      check: problem ? 'fail' : 'pass',
      ...(typeof first?.message === 'string' ? { summary: first.message } : {}),
    }
  }
  if (name === 'set_variable') {
    // `TODO/ai-014`: how far the change reached, as the Variables panel announces it.
    return typeof result?.summary === 'string' ? { summary: result.summary } : {}
  }
  if (name === 'check_clearance') {
    return {
      check: result?.interpenetrating === true ? 'fail' : 'pass',
      ...(typeof result?.message === 'string' ? { summary: result.message } : {}),
    }
  }
  return {}
}

/**
 * @param {readonly TranscriptItem[]} items
 * @param {string} id
 * @param {(item: ToolItem) => ToolItem} change
 * @returns {TranscriptItem[]}
 */
function changeTool(items, id, change) {
  return items.map((item) => (item.kind === 'tool' && item.id === id ? change(item) : item))
}

/**
 * The transcript after one agent event.
 *
 * @param {readonly TranscriptItem[]} items
 * @param {import('./agent.js').AgentEvent} event
 * @param {(id: string) => string | undefined} [nameOf]
 * @returns {TranscriptItem[]}
 */
export function applyEvent(items, event, nameOf) {
  switch (event.type) {
    case 'text': {
      const last = items.at(-1)
      if (last?.kind === 'assistant') return [...items.slice(0, -1), { kind: 'assistant', text: last.text + event.text }]
      return [...items, { kind: 'assistant', text: event.text }]
    }
    case 'tool_call':
      return [
        ...items,
        {
          kind: 'tool',
          id: event.id,
          name: event.name,
          label: describeCall(event.name, event.input, undefined, nameOf),
          status: 'running',
          bodyIds: [],
          input: event.input,
        },
      ]
    case 'tool_result':
      return changeTool(items, event.id, (item) => {
        if (event.isError) {
          const reason = event.result?.error
          return { ...item, status: 'error', error: typeof reason === 'string' ? reason : 'The call failed.' }
        }
        const applied = Array.isArray(event.result?.applied) ? event.result.applied : []
        return {
          ...item,
          ...checkDetails(item.name, event.result),
          status: 'ok',
          label: describeCall(item.name, item.input, event.result, nameOf),
          bodyIds: applied.map((/** @type {any} */ step) => step?.bodyId).filter((/** @type {unknown} */ id) => typeof id === 'string'),
        }
      })
    case 'notice':
      return [...items, { kind: 'notice', level: event.kind, message: event.message }]
    case 'turn_end': {
      if (event.outcome.status === 'done') return [...items]
      // Nothing from a turn that did not finish was kept — the rows say so.
      return items.map((item) =>
        item.kind === 'tool' && item.status !== 'error' ? { ...item, status: 'discarded' } : item
      )
    }
    default:
      return [...items]
  }
}

/**
 * What the agent did right after an error row — "and then it …" — so a failure is never a dead
 * end on screen.
 *
 * @param {readonly TranscriptItem[]} items
 * @param {number} index The error row.
 * @returns {string | undefined}
 */
export function nextStepAfter(items, index) {
  const next = items[index + 1]
  if (next === undefined) return undefined
  if (next.kind === 'tool') return next.label
  if (next.kind === 'assistant') return 'Replied'
  return undefined
}

/**
 * @param {number} count
 * @returns {string}
 */
function compact(count) {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}

/**
 * The per-turn token count. (`formatReadout` adds the dated cost estimate, `TODO/ai-013`.)
 *
 * @param {import('./client.js').TokenUsage} usage
 * @returns {string} `''` when nothing was used.
 */
export function formatUsage(usage) {
  const input = usage.input + usage.cacheRead + usage.cacheWrite
  if (input === 0 && usage.output === 0) return ''
  return `${compact(input)} in · ${compact(usage.output)} out`
}

/**
 * `TODO/ai-013`: US dollars, to the cent. A real but tiny amount reads "< $0.01", never "$0.00".
 *
 * @param {number | null} dollars
 * @returns {string} `''` for `null`.
 */
export function formatCost(dollars) {
  if (dollars === null || !Number.isFinite(dollars)) return ''
  if (dollars > 0 && dollars < 0.005) return '< $0.01'
  return `$${dollars.toFixed(2)}`
}

/**
 * The chat's one-line readout: tokens, then the turn's estimated cost and the session's. Without
 * a price (an unknown or scripted model) the money is left out and the tokens stay.
 *
 * @param {import('./client.js').TokenUsage} usage
 * @param {number | null} turnCost
 * @param {number} sessionCost
 * @returns {string} `''` when the turn used nothing.
 */
export function formatReadout(usage, turnCost, sessionCost) {
  const tokens = formatUsage(usage)
  if (tokens === '' || turnCost === null) return tokens
  return `${tokens} · ≈ ${formatCost(turnCost)} · session ${formatCost(sessionCost)}`
}
