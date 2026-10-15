// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The live bridge's tab side (`TODO/ai-012`, `docs/decisions/ai-partner.md` Decision 11):
 * receives one tool call from Claude Code (relayed by the dev host, `mcp/bridge.js`), runs it
 * through the **same** registry (`createToolRegistry().run`) against the **live** document, and
 * returns the JSON. Framework-free: the app hands in the document, the selection, the capture and
 * "is the user mid-gesture" (`composables/useLiveBridge.js`), and a spec hands in fakes for the
 * clock alone.
 *
 * ## One writer, enforced (Decision 11 point 4)
 *
 * - **Serial.** Calls run one at a time, in arrival order ({@link TabEndpoint.handle} queues).
 * - **Mid-gesture.** A call that arrives while the user is dragging, or has a number field
 *   focused, waits up to {@link GESTURE_WAIT_MS} for the gesture to end, then is refused with
 *   {@link EDITING_REFUSAL} — a sentence the model reads and acts on.
 * - **Stale.** `documentRevision()` is the document's Lamport clock (`mergeClock()`, the M15
 *   contract in Decision 11). It is read when the call arrives and again just before it runs; if
 *   it moved (the gesture committed an edit, a merge landed) the call is refused with
 *   {@link STALE_REFUSAL} and lands nothing. A merge that only advanced the clock is a harmless
 *   false refusal the model retries.
 * - **Paused while running.** The run itself is synchronous — the registry and the fold are — so
 *   no user event can interleave with a call's read-then-write; that is the pause, by
 *   construction, without the History-preview lock `ai-017` retired.
 *
 * ## Landing (Decision 11 point 3)
 *
 * The tools already write as **one atomic batch** under the caller's origin (`batch` +
 * `insertAt`, `src/ai/tools/batch.js`) and roll back whole on a refusal, so a call runs directly
 * on the live document with origin `mcp`: its records mint ids under the **tab's** replica
 * (`data-008`), the command layer stamps them (`data-010`), and they never reach the local undo
 * stack. A refused call lands nothing — the serialised NDJSON is byte-identical (the spec proves
 * it).
 *
 * ## Groups — one **Undo AI turn** per request
 *
 * MCP has no turn boundary. Consecutive writes with the same `request` less than
 * {@link GROUP_IDLE_MS} apart form one group, recorded as one `AiTurn` in `ai-017`'s shape (the
 * project just before the group's first write, just after its latest, and the `change` restricted
 * to what the group's own calls did). {@link TabEndpoint.undoLast} is `ui-062`'s merge inverse
 * (`src/core/mergeUndo.js`) under origin `mcp`: rows the group added go, rows it revised get their
 * old record back, and anything the user did in between stays. It refuses by name when a later
 * step builds on the group (move it back first), and never touches the local undo stack.
 *
 * Caps (`limits.js`, Decision 7) count per call, as the closed-file server does, and the records
 * cap also per group.
 *
 * ## A second transport on the same endpoint (`TODO/ai-021`, Decision 13)
 *
 * WebMCP calls run through **this** object too, so a browser agent's call and a Claude Code call
 * share one queue, one gesture wait and one stale check, and can never interleave. The caller
 * says which transport a call came from with {@link CallVia} (the dev-host bridge passes nothing,
 * so its behaviour is exactly as above): its records carry that origin, its groups are its own —
 * a WebMCP write never joins a Claude Code group — and a WebMCP group is formed by the idle gap
 * alone (`groupBy: 'idle'`), because WebMCP has no request to compare. The endpoint is built
 * without any socket; `composables/useTabEndpoint.js` holds the one instance both transports use.
 *
 * `get_selection` / `select` act on the group's **own** selection, seeded from the user's live
 * selection, exactly as an in-app turn's do (`ai-017`): the model may look at what the user picked,
 * and never changes it.
 *
 * @module ai/bridge/tabEndpoint
 */

import { diffStates } from '../../core/merge/merge.js'
import { applyMergeUndo, mergeSnapshotOf, planMergeUndo } from '../../core/mergeUndo.js'
import { LIMITS, createToolRegistry, createTurn } from '../tools/index.js'
import { EDITING_REFUSAL, GESTURE_WAIT_MS, GROUP_IDLE_MS, STALE_REFUSAL } from './protocol.js'

/** @typedef {import('../../core/document.js').WarpDocument} WarpDocument */
/** @typedef {import('../agent.js').AiTurn} AiTurn */
/** @typedef {ReturnType<typeof diffStates>} Change */

/** How often a waiting call looks again at whether the gesture has ended. */
const GESTURE_POLL_MS = 100

/** Who a group's undo refusal names. */
const WHO = Object.freeze({ mcp: 'Claude Code', webmcp: 'the browser agent' })

/**
 * @typedef {object} TabEndpointOptions
 * @property {() => WarpDocument} document The live document, raw (not a reactive proxy).
 * @property {import('../tools/index.js').ToolRegistry} [tools] The real registry by default.
 * @property {import('../tools/index.js').ToolSelection} [selection] The user's selection.
 * @property {() => import('../tools/capture.js').ToolCapture | undefined} [capture] The viewport's
 *   offscreen capture, read per call; absent, `capture_view` says there is no viewport.
 * @property {() => boolean} [isEditing] A drag or a focused field is in progress.
 * @property {() => number} [now]
 * @property {(ms: number) => Promise<void>} [sleep]
 * @property {import('../tools/limits.js').Limits} [limits]
 */

/**
 * Which transport a call came from (`TODO/ai-021`). Omitted, it is the live bridge's: origin `mcp`,
 * grouped by `request`.
 *
 * @typedef {object} CallVia
 * @property {'mcp' | 'webmcp'} [origin] What its records carry, and whose group it joins.
 * @property {'request' | 'idle'} [groupBy] `request`: same request inside the idle gap (the bridge);
 *   `idle`: any write from the same origin inside the idle gap (WebMCP, which has no request).
 */

/**
 * @typedef {object} TabEndpoint
 * @property {(call: import('./protocol.js').CallMessage, via?: CallVia) => Promise<{ type: 'result', id: number, result: Record<string, any> }>} handle
 *   Run one call (queued behind any running one). Never throws: a failure is a result with `error`.
 * @property {readonly AiTurn[]} turns The landed groups not taken back, oldest first.
 * @property {'mcp' | 'webmcp' | null} lastOrigin Who made the newest group, or `null` when there is none.
 * @property {() => void} undoLast **Undo AI turn** for the newest group. Throws the refusal, by
 *   name, and changes nothing.
 * @property {() => void} reset Forget every group (a new project was loaded).
 */

/**
 * @typedef {object} Group
 * @property {'mcp' | 'webmcp'} origin
 * @property {string} request
 * @property {number} lastAt When its latest write landed.
 * @property {import('../../core/merge/state.js').MergeState} baseState
 * @property {AiTurn} turn
 * @property {Change} own What its calls changed, accumulated.
 * @property {import('../tools/limits.js').Turn} budget The group's records cap.
 */

/** @returns {Change} */
function emptyChange() {
  return { added: [], revised: [], removed: [], moved: [], registers: [], parts: [] }
}

/** @param {Change} change */
function isEmpty(change) {
  return Object.values(change).every((list) => list.length === 0)
}

/** @param {Change} a @param {Change} b @returns {Change} */
function union(a, b) {
  /** @param {readonly string[]} x @param {readonly string[]} y */
  const join = (x, y) => [...new Set([...x, ...y])]
  return {
    added: join(a.added, b.added),
    revised: join(a.revised, b.revised),
    removed: join(a.removed, b.removed),
    moved: join(a.moved, b.moved),
    registers: join(a.registers, b.registers),
    parts: join(a.parts, b.parts),
  }
}

/**
 * The net change since the group began, keeping only what the group's own calls touched — so a
 * user edit between two calls is never taken back with the group (`agent.js` `restrictTo`).
 *
 * @param {Change} change
 * @param {Change} own
 * @returns {Change}
 */
function restrictTo(change, own) {
  /** @param {readonly string[]} list @param {readonly string[]} allowed */
  const keep = (list, allowed) => list.filter((id) => allowed.includes(id))
  const touched = [...own.added, ...own.revised, ...own.removed, ...own.moved]
  return {
    added: keep(change.added, own.added),
    revised: keep(change.revised, touched),
    removed: keep(change.removed, own.removed),
    moved: keep(change.moved, touched),
    registers: keep(change.registers, own.registers),
    parts: keep(change.parts, own.parts),
  }
}

/**
 * @param {readonly import('../../core/document.js').DocumentEntry[]} entries
 * @param {readonly string[]} ids
 */
function inLogOrder(entries, ids) {
  const wanted = new Set(ids)
  return entries.flatMap((entry) => (entry.record.id !== undefined && wanted.has(entry.record.id) ? [entry.record.id] : []))
}

/**
 * Build the tab's endpoint over the live document.
 *
 * @param {TabEndpointOptions} options
 * @returns {TabEndpoint}
 */
export function createTabEndpoint(options) {
  const tools = options.tools ?? createToolRegistry()
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const isEditing = options.isEditing ?? (() => false)
  const limits = options.limits ?? LIMITS
  /** @type {Group[]} */
  const groups = []
  let turnCount = 0
  /** What `select` last picked; `null` until it does. Cleared when a new group starts. */
  /** @type {string[] | null} */
  let picked = null
  /** The running chain: each call starts when the last has finished. */
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve()

  /**
   * The group a write with `request` joins, or `null` for a new one.
   *
   * @param {string} request
   * @param {Required<CallVia>} via
   * @returns {Group | null}
   */
  function openGroupFor(request, via) {
    const last = groups.at(-1)
    if (last === undefined || last.origin !== via.origin || now() - last.lastAt > GROUP_IDLE_MS) return null
    if (via.groupBy === 'request' && last.request !== request) return null
    return last
  }

  /**
   * The selection a call sees: the bridge's own once `select` has picked, the user's otherwise.
   *
   * @returns {import('../tools/index.js').ToolSelection | undefined}
   */
  function selectionFor() {
    const user = options.selection
    if (!user) return undefined
    return {
      ids: () => [...(picked ?? user.ids())],
      select: (ids) => {
        picked = [...ids]
      },
    }
  }

  /**
   * @param {import('./protocol.js').CallMessage} call
   * @param {Required<CallVia>} via
   * @returns {Promise<Record<string, any>>}
   */
  async function run(call, via) {
    const live = options.document()
    const arrived = live.mergeClock()
    const waitStart = now()
    while (isEditing()) {
      if (now() - waitStart >= GESTURE_WAIT_MS) return { error: EDITING_REFUSAL }
      await sleep(GESTURE_POLL_MS)
    }
    if (live.mergeClock() !== arrived) return { error: STALE_REFUSAL }

    const request = call.request ?? ''
    const group = openGroupFor(request, via)
    const budget = group?.budget ?? createTurn({ now, limits: { ...limits, turnMs: Infinity, stepsPerTurn: Infinity, consecutiveFailures: Infinity } })
    const perCall = createTurn({ now, limits })
    /** @type {import('../tools/limits.js').Turn} */
    const turn = {
      beginStep: (name) => perCall.beginStep(name),
      endStep: (name, ok) => perCall.endStep(name, ok),
      canAppend: (count) => budget.canAppend(count) ?? perCall.canAppend(count),
      commitRecords: (count) => {
        budget.commitRecords(count)
        perCall.commitRecords(count)
      },
      get stats() {
        return perCall.stats
      },
    }
    const capture = options.capture?.()
    const selection = selectionFor()
    /** @type {import('../tools/index.js').ToolContext} */
    const ctx = {
      document: live,
      origin: via.origin,
      live: true,
      turn,
      ...(call.request === undefined ? {} : { request: call.request }),
      ...(selection ? { selection } : {}),
      ...(capture ? { capture } : {}),
    }

    const beforeState = live.mergeState()
    const before = mergeSnapshotOf(live)
    const result = tools.run(ctx, call.name, call.input)
    const afterState = live.mergeState()
    const own = diffStates(beforeState, afterState)
    if (isEmpty(own)) return result

    /** @type {Group} */
    const landedIn = group ?? {
      origin: via.origin,
      request,
      lastAt: now(),
      baseState: beforeState,
      own: emptyChange(),
      budget,
      turn: {
        turnId: `${via.origin}-turn-${(turnCount += 1)}`,
        recordIds: [],
        revisedIds: [],
        removedIds: [],
        base: before,
        merged: before,
        change: emptyChange(),
        version: live.version,
      },
    }
    if (group === null) {
      groups.push(landedIn)
      // A new request: what the model picked for the last one no longer stands in for the user's.
      picked = null
    }
    landedIn.lastAt = now()
    landedIn.own = union(landedIn.own, own)
    const change = restrictTo(diffStates(landedIn.baseState, afterState), landedIn.own)
    const gone = new Set([...change.added, ...change.removed])
    landedIn.turn = {
      ...landedIn.turn,
      recordIds: inLogOrder(live.entries, change.added),
      revisedIds: inLogOrder(live.entries, change.revised.filter((id) => !gone.has(id))),
      removedIds: inLogOrder(landedIn.turn.base.entries, change.removed),
      merged: mergeSnapshotOf(live),
      change,
      version: live.version,
    }
    return result
  }

  return {
    handle(call, via = {}) {
      /** @type {Required<CallVia>} */
      const resolved = { origin: via.origin ?? 'mcp', groupBy: via.groupBy ?? 'request' }
      const next = queue.then(async () => {
        /** @type {Record<string, any>} */
        let result
        try {
          result = await run(call, resolved)
        } catch {
          // A bug, not the model: fixed wording, never the error's own text (decision 8).
          result = { error: `${call.name} failed inside WarpCad. The project was not changed by it.` }
        }
        return { type: /** @type {const} */ ('result'), id: call.id, result }
      })
      queue = next.catch(() => undefined)
      return next
    },
    get turns() {
      return groups.map((group) => group.turn)
    },
    get lastOrigin() {
      return groups.at(-1)?.origin ?? null
    },
    undoLast() {
      const group = groups.at(-1)
      if (group === undefined) throw new Error('There is no Claude Code change to take back.')
      const live = options.document()
      const plan = planMergeUndo(group.turn.base, group.turn.merged, mergeSnapshotOf(live), group.turn.change)
      if (!plan.ok) throw new Error(plan.message.replace('after the merge', `after ${WHO[group.origin]} made it`))
      applyMergeUndo(live, plan, { origin: group.origin })
      groups.pop()
    },
    reset() {
      groups.length = 0
    },
  }
}
