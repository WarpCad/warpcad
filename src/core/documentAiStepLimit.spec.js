// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/ai-033` — the project's **AI step limit** as document state: a last-writer-wins register
 * like the description (`documentDescription.spec.js`), written in the file's merge section as
 * `merge.aiRecordsPerTurn: [n, stamp]`. Not under `merge.registers`, whose names a released build
 * checks and refuses when unknown; an unknown section key is ignored instead, so an older tab still
 * opens a project that has one (`io-017`, `io-023`).
 *
 * Unlike the description it is set **only** with origin `local`: no agent, on any transport, can
 * write it. An invalid value in a file is dropped with a load warning, never refuses the file.
 */
import { describe, expect, it } from 'vitest'

import { AI_STEP_LIMIT } from './aiBudget.js'
import { createDocument } from './document.js'
import { canonicalJSON } from './merge/state.js'
import { mergeStates } from './merge/merge.js'
import { readMergeSection } from './merge/validate.js'
import { applyMergeUndo, mergeSnapshotOf, planMergeUndo } from './mergeUndo.js'
import { parseProject, serializeProject } from './project.js'

const fixtures = import.meta.glob(['./__fixtures__/description-before.ndjson'], { query: '?raw', import: 'default', eager: true })

const local = { origin: 'local' }
const mcp = { origin: 'mcp' }

/** @param {any} document @param {number} [x] */
function placeCube(document, x = 0) {
  const id = document.nextId('cuboid')
  document.append({ id, op: 'primitive.cuboid', name: document.nextName('Cube'), params: { size: [20, 20, 20], center: [x, 0, 10] } }, mcp)
  return id
}

/**
 * @param {string} text
 * @param {Parameters<typeof createDocument>[0]} [options]
 */
function open(text, options = {}) {
  const parsed = parseProject(text)
  const document = createDocument(options)
  document.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, parsed)
  return document
}

/** @param {string} text */
const stateLineOf = (text) => JSON.parse(/** @type {string} */ (text.trimEnd().split('\n').at(-1)))

/** @param {string} text */
const recordLinesOf = (text) => text.trimEnd().split('\n').filter((line) => !line.includes('"warpcad":"project-state"'))

/**
 * @param {string} text
 * @param {(merge: Record<string, any>) => Record<string, any>} edit
 */
function withMerge(text, edit) {
  const lines = text.trimEnd().split('\n')
  const state = JSON.parse(/** @type {string} */ (lines.at(-1)))
  state.merge = edit(state.merge)
  lines[lines.length - 1] = JSON.stringify(state)
  return lines.join('\n') + '\n'
}

describe('the AI step limit through the command layer', () => {
  it('starts at the default', () => {
    expect(createDocument().aiRecordsPerTurn()).toBe(AI_STEP_LIMIT.default)
  })

  it('refuses every origin but local — ai, mcp, webmcp, merge and none', () => {
    const document = createDocument()
    for (const origin of ['ai', 'mcp', 'webmcp', 'merge', 'remote', '']) {
      expect(() => document.setAiRecordsPerTurn(2000, { origin })).toThrow(/local/)
    }
    expect(() => document.setAiRecordsPerTurn(2000, /** @type {any} */ ({}))).toThrow(/local/)
    expect(() => document.setAiRecordsPerTurn(2000, /** @type {any} */ (undefined))).toThrow(/local/)
    expect(document.aiRecordsPerTurn()).toBe(AI_STEP_LIMIT.default)
  })

  it('refuses a value outside the range, naming it, and changes nothing', () => {
    const document = createDocument()
    for (const bad of [0, 49, 5001, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '2000']) {
      expect(() => document.setAiRecordsPerTurn(/** @type {any} */ (bad), local)).toThrow('Enter a whole number of steps from 50 to 5,000.')
    }
    expect(document.aiRecordsPerTurn()).toBe(AI_STEP_LIMIT.default)
  })

  it('setting the same value is a no-op; a change bumps the version but goes on neither undo stack', () => {
    const document = createDocument()
    placeCube(document)
    document.appendAll([{ id: 'own', op: 'primitive.cuboid', name: 'Mine', params: { size: [5, 5, 5], center: [0, 50, 2.5] } }], local)
    const canUndo = document.canUndo()
    const undoLabel = document.pendingUndo()?.label
    const version = document.version
    document.setAiRecordsPerTurn(AI_STEP_LIMIT.default, local)
    expect(document.version).toBe(version)
    document.setAiRecordsPerTurn(2000, local)
    expect(document.version).toBeGreaterThan(version)
    expect(document.canUndo()).toBe(canUndo)
    expect(document.pendingUndo()?.label).toBe(undoLabel)
    expect(document.canRedo()).toBe(false)
    document.undo()
    expect(document.aiRecordsPerTurn()).toBe(2000)
    expect(document.canRedo()).toBe(true)
    document.redo()
    expect(document.aiRecordsPerTurn()).toBe(2000)
  })
})

describe('the AI step limit in the file', () => {
  it('a project that never changed it writes nothing new', () => {
    const document = createDocument()
    placeCube(document)
    expect(serializeProject(document)).not.toContain('aiRecordsPerTurn')
  })

  it('an existing file saved by the previous build round-trips byte-identical, at the default', () => {
    const before = /** @type {string} */ (fixtures['./__fixtures__/description-before.ndjson'])
    expect(before).toBeTypeOf('string')
    const document = open(before)
    expect(document.aiRecordsPerTurn()).toBe(AI_STEP_LIMIT.default)
    expect(serializeProject(document)).toBe(before)
  })

  it('rides in merge.aiRecordsPerTurn as [n, stamp]; record lines stay byte-identical', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    const before = serializeProject(document)
    document.setAiRecordsPerTurn(2000, local)
    const text = serializeProject(document)
    expect(recordLinesOf(text)).toEqual(recordLinesOf(before))
    const state = stateLineOf(text)
    expect(state.version).toBe(2)
    expect(state.merge.aiRecordsPerTurn[0]).toBe(2000)
    expect(state.merge.aiRecordsPerTurn[1][1]).toBe('aaaaaa')
    expect(state.merge.registers?.aiRecordsPerTurn).toBeUndefined()
    const reopened = open(text)
    expect(reopened.aiRecordsPerTurn()).toBe(2000)
    expect(serializeProject(reopened)).toBe(text)
  })

  it('a value set back to the default is still written, so it keeps beating an older raise', () => {
    const a = createDocument({ replica: 'aaaaaa' })
    placeCube(a)
    a.setAiRecordsPerTurn(3000, local)
    const b = open(serializeProject(a), { replica: 'bbbbbb' })
    b.setAiRecordsPerTurn(AI_STEP_LIMIT.default, local)
    const lowered = serializeProject(b)
    expect(stateLineOf(lowered).merge.aiRecordsPerTurn[0]).toBe(AI_STEP_LIMIT.default)
    a.mergeFrom(open(lowered).mergeState(), { origin: 'merge' })
    expect(a.aiRecordsPerTurn()).toBe(AI_STEP_LIMIT.default)
  })

  it('an invalid value is ignored with a load warning, and the load still succeeds', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    document.setAiRecordsPerTurn(2000, local)
    const text = serializeProject(document)
    for (const value of [999999, 0, 1.5, '2000', null, [2000], [2000, 'nope'], [2000, [1, 'not-a-replica']], 'x']) {
      const hostile = withMerge(text, (merge) => ({ ...merge, aiRecordsPerTurn: Array.isArray(value) && value.length === 2 ? value : [value, merge.aiRecordsPerTurn[1]] }))
      const parsed = parseProject(hostile)
      expect(parsed.warnings.some((warning) => /AI step limit/.test(warning.message))).toBe(true)
      expect(open(hostile).aiRecordsPerTurn()).toBe(AI_STEP_LIMIT.default)
    }
  })

  it('an older reader ignores merge.aiRecordsPerTurn: an unknown section key, not a register (io-017, io-023)', () => {
    expect(() => readMergeSection({ aiRecordsPerTurn: [2000, [1, 'aaaaaa']] }, new Set())).not.toThrow()
    expect(() => readMergeSection({ registers: { aiRecordsPerTurn: [3, 'aaaaaa'] } }, new Set())).toThrow(/not a register/)
  })
})

describe('the AI step limit merges as a register', () => {
  function twoCopies() {
    const a = createDocument({ replica: 'aaaaaa' })
    placeCube(a)
    const b = open(serializeProject(a), { replica: 'bbbbbb' })
    return { a, b }
  }

  it('the later write wins, in both merge orders and through the file', () => {
    const { a, b } = twoCopies()
    a.setAiRecordsPerTurn(1500, local)
    b.setAiRecordsPerTurn(2500, local)
    b.setAiRecordsPerTurn(3500, local)
    const sa = open(serializeProject(a)).mergeState()
    const sb = open(serializeProject(b)).mergeState()
    expect(canonicalJSON(mergeStates(sa, sb))).toBe(canonicalJSON(mergeStates(sb, sa)))
    a.mergeFrom(sb, { origin: 'merge' })
    b.mergeFrom(sa, { origin: 'merge' })
    expect(a.aiRecordsPerTurn()).toBe(b.aiRecordsPerTurn())
    expect(open(serializeProject(a)).aiRecordsPerTurn()).toBe(a.aiRecordsPerTurn())
  })

  it('a value set on one side only is kept by the other', () => {
    const { a, b } = twoCopies()
    b.setAiRecordsPerTurn(400, local)
    a.mergeFrom(open(serializeProject(b)).mergeState(), { origin: 'merge' })
    expect(a.aiRecordsPerTurn()).toBe(400)
  })

  it('a failed merge puts the value back', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    document.setAiRecordsPerTurn(800, local)
    const other = createDocument({ replica: 'cccccc' })
    placeCube(other)
    other.setAiRecordsPerTurn(4000, local)
    expect(() => document.mergeFrom(other.mergeState(), { origin: 'merge' })).toThrow()
    expect(document.aiRecordsPerTurn()).toBe(800)
  })

  it('Undo merge takes a merged-in value back, as it does the description', () => {
    const { a, b } = twoCopies()
    a.setAiRecordsPerTurn(600, local)
    b.setAiRecordsPerTurn(3000, local)
    b.setAiRecordsPerTurn(4000, local)
    const base = mergeSnapshotOf(a)
    const result = a.mergeFrom(open(serializeProject(b)).mergeState(), { origin: 'merge' })
    expect(a.aiRecordsPerTurn()).toBe(4000)
    const plan = planMergeUndo(base, mergeSnapshotOf(a), mergeSnapshotOf(a), result.change)
    expect(plan.ok).toBe(true)
    applyMergeUndo(a, /** @type {any} */ (plan), { origin: 'merge' })
    expect(a.aiRecordsPerTurn()).toBe(600)
  })

  it('an AI turn landing never moves it, so its Undo AI turn has nothing to put back', () => {
    const { a, b } = twoCopies()
    a.setAiRecordsPerTurn(700, local)
    const fork = open(serializeProject(a), { replica: 'ffffff' })
    placeCube(fork, 60)
    const base = mergeSnapshotOf(a)
    const result = a.mergeFrom(fork.mergeState(), { origin: 'ai' })
    expect(result.change.registers).not.toContain('aiRecordsPerTurn')
    const plan = planMergeUndo(base, mergeSnapshotOf(a), mergeSnapshotOf(a), result.change)
    expect(plan.ok).toBe(true)
    // Applied under an agent's origin, the plan must not reach the local-only setter.
    expect(() => applyMergeUndo(a, /** @type {any} */ (plan), { origin: 'ai' })).not.toThrow()
    expect(a.aiRecordsPerTurn()).toBe(700)
    expect(b.aiRecordsPerTurn()).toBe(AI_STEP_LIMIT.default)
  })
})
