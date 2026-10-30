// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/io-023` — the project's **description** (`src/core/description.js`) as document state: a
 * last-writer-wins register like the gist (`documentGist.spec.js`), written in the file's merge
 * section as `merge.description: [text, stamp]`. Not under `merge.registers`, whose names a
 * released build checks and refuses when unknown; an unknown section key is ignored instead, so
 * a v1.4.0 tab still opens a project that has a description (and drops it if it saves — a merge
 * brings it back).
 *
 * The fixtures were made by running real code, not by hand:
 *
 * 1. `description-before.ndjson` — **v1.4.0** (`git archive v1.4.0 src package.json` into a
 *    scratch folder, this repo's `node_modules` linked in): two cubes, a prompt and standing
 *    instructions, then that release's `serializeProject` (replica `aaaaaa`).
 * 2. `description-written.ndjson` — this build: file 1 opened, `setDescription`, then
 *    `serializeProject` (replica `bbbbbb`).
 * 3. `description-saved-by-v1.4.0.ndjson` — v1.4.0's own `parseProject`,
 *    `createDocument().loadEntries(…)` and `serializeProject` on file 2. It opened with no warning.
 *
 * Regenerate them the same way if the format changes; never edit them by hand.
 */
import { describe, expect, it } from 'vitest'

import { DESCRIPTION_LIMITS } from './description.js'
import { createDocument } from './document.js'
import { canonicalJSON } from './merge/state.js'
import { mergeStates } from './merge/merge.js'
import { readMergeSection } from './merge/validate.js'
import { applyMergeUndo, mergeSnapshotOf, planMergeUndo } from './mergeUndo.js'
import { parseNdjson, serializeNdjson } from './ndjson.js'
import { ProjectFormatError, parseProject, serializeProject } from './project.js'
import { withProjectId, withoutGist } from './shareCopy.js'

const fixtures = import.meta.glob(['./__fixtures__/description-*.ndjson'], { query: '?raw', import: 'default', eager: true })

const local = { origin: 'local' }
const mcp = { origin: 'mcp' }

/** @param {any} document @param {number} [x] */
function placeCube(document, x = 0) {
  const id = document.nextId('cuboid')
  document.append(
    { id, op: 'primitive.cuboid', name: document.nextName('Cube'), params: { size: [20, 20, 20], center: [x, 0, 10] } },
    mcp,
  )
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

describe('the description through the command layer', () => {
  it('stores cleaned text, needs an origin, and starts empty', () => {
    const document = createDocument()
    expect(document.description()).toBe('')
    expect(() => document.setDescription('x', /** @type {any} */ ({}))).toThrow(/origin/)
    document.setDescription('  A **wall** duct\u202E.\r\n\nSecond.  ', local)
    expect(document.description()).toBe('A **wall** duct.\n\nSecond.')
  })

  it('caps it, and a non-string is no text', () => {
    const document = createDocument()
    document.setDescription('d'.repeat(DESCRIPTION_LIMITS.maxLength + 50), local)
    expect(Array.from(document.description())).toHaveLength(DESCRIPTION_LIMITS.maxLength)
    document.setDescription(/** @type {any} */ (42), local)
    expect(document.description()).toBe('')
  })

  it('setting the same text is a no-op; a change bumps the version but is not an undo step', () => {
    const document = createDocument()
    placeCube(document)
    document.setDescription('one', local)
    const version = document.version
    document.setDescription('one', local)
    expect(document.version).toBe(version)
    document.setDescription('two', mcp)
    expect(document.version).toBeGreaterThan(version)
    document.appendAll([{ id: 'own', op: 'primitive.cuboid', name: 'Mine', params: { size: [5, 5, 5], center: [0, 50, 2.5] } }], local)
    document.undo()
    expect(document.description()).toBe('two')
  })
})

describe('the description in the file', () => {
  it('rides in merge.description as [text, stamp] on a version-2 line; record lines stay byte-identical', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    const before = serializeProject(document)
    document.setDescription('A wall duct.', local)
    const text = serializeProject(document)
    expect(recordLinesOf(text)).toEqual(recordLinesOf(before))
    const state = stateLineOf(text)
    expect(state.version).toBe(2)
    expect(state.merge.description[0]).toBe('A wall duct.')
    expect(state.merge.description[1][1]).toBe('aaaaaa')
    expect(state.merge.registers?.description).toBeUndefined()
    expect(open(text).description()).toBe('A wall duct.')
  })

  it('survives a recipient’s copy and a share without the gist: only the id and the gist change', () => {
    const document = createDocument()
    placeCube(document)
    document.setDescription('keep me', local)
    const records = parseNdjson(serializeProject(document)).records
    const copy = serializeNdjson(withProjectId(withoutGist(/** @type {any} */ (records)), 'other-project-id'))
    expect(open(copy).description()).toBe('keep me')
  })

  it('a project with no description writes no description key', () => {
    const document = createDocument()
    placeCube(document)
    expect(serializeProject(document)).not.toContain('"description"')
  })

  it('a clear is written as an empty text with its stamp, and beats an older set after a reload', () => {
    const a = createDocument({ replica: 'aaaaaa' })
    placeCube(a)
    a.setDescription('old', local)
    const b = open(serializeProject(a), { replica: 'bbbbbb' })
    b.setDescription('', local)
    const cleared = serializeProject(b)
    expect(stateLineOf(cleared).merge.description[0]).toBe('')
    a.mergeFrom(open(cleared).mergeState(), { origin: 'merge' })
    expect(a.description()).toBe('')
  })

  it('cleans a hostile description on load: bidi and controls stripped, capped', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    document.setDescription('x', local)
    const text = withMerge(serializeProject(document), (merge) => ({
      ...merge,
      description: ['a\u202Eb\u0007c' + 'z'.repeat(DESCRIPTION_LIMITS.maxLength), merge.description[1]],
    }))
    const loaded = open(text).description()
    expect(loaded.startsWith('abc')).toBe(true)
    expect(Array.from(loaded)).toHaveLength(DESCRIPTION_LIMITS.maxLength)
  })

  it('refuses the file, by name, when description is not [text, stamp]', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    document.setDescription('x', local)
    const text = serializeProject(document)
    for (const description of ['x', 3, null, [3, [1, 'aaaaaa']], ['x', 'nope'], ['x']]) {
      const hostile = withMerge(text, (merge) => ({ ...merge, description }))
      expect(() => parseProject(hostile)).toThrow(ProjectFormatError)
      expect(() => parseProject(hostile)).toThrow(/description/)
    }
  })

  it('an older reader ignores merge.description: an unknown section key, not a register', () => {
    expect(() => readMergeSection({ somethingNewer: ['x', [1, 'aaaaaa']] }, new Set())).not.toThrow()
    expect(() => readMergeSection({ registers: { description: [3, 'aaaaaa'] } }, new Set())).toThrow(/not a register/)
  })
})

describe('the description merges as a register', () => {
  /** Two replicas of one project: A made it, B opened A's file. */
  function twoCopies() {
    const a = createDocument({ replica: 'aaaaaa' })
    placeCube(a)
    const b = open(serializeProject(a), { replica: 'bbbbbb' })
    return { a, b }
  }

  it('the later write wins, in both merge orders and through the file', () => {
    const { a, b } = twoCopies()
    a.setDescription('from A', local)
    b.setDescription('from B', local)
    b.setDescription('from B, later', local)
    const sa = open(serializeProject(a)).mergeState()
    const sb = open(serializeProject(b)).mergeState()
    expect(canonicalJSON(mergeStates(sa, sb))).toBe(canonicalJSON(mergeStates(sb, sa)))
    a.mergeFrom(sb, { origin: 'merge' })
    b.mergeFrom(sa, { origin: 'merge' })
    expect(a.description()).toBe(b.description())
    expect(open(serializeProject(a)).description()).toBe(a.description())
  })

  it('a description set on one side only is kept by the other', () => {
    const { a, b } = twoCopies()
    b.setDescription('only B', local)
    a.mergeFrom(open(serializeProject(b)).mergeState(), { origin: 'merge' })
    expect(a.description()).toBe('only B')
  })

  it('a failed merge puts the description back', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    document.setDescription('mine', local)
    const other = createDocument({ replica: 'cccccc' })
    placeCube(other)
    other.setDescription('theirs', local)
    expect(() => document.mergeFrom(other.mergeState(), { origin: 'merge' })).toThrow()
    expect(document.description()).toBe('mine')
  })

  it('Undo merge takes a merged-in description back', () => {
    const { a, b } = twoCopies()
    a.setDescription('before', local)
    b.setDescription('merged in', local)
    b.setDescription('merged in, later', local)
    const base = mergeSnapshotOf(a)
    const result = a.mergeFrom(open(serializeProject(b)).mergeState(), { origin: 'merge' })
    expect(a.description()).toBe('merged in, later')
    const merged = mergeSnapshotOf(a)
    const plan = planMergeUndo(base, merged, mergeSnapshotOf(a), result.change)
    expect(plan.ok).toBe(true)
    applyMergeUndo(a, /** @type {any} */ (plan), { origin: 'merge' })
    expect(a.description()).toBe('before')
  })
})

describe('an older build (v1.4.0) meets the description', () => {
  const before = /** @type {string} */ (fixtures['./__fixtures__/description-before.ndjson'])
  const written = /** @type {string} */ (fixtures['./__fixtures__/description-written.ndjson'])
  const savedByOlder = /** @type {string} */ (fixtures['./__fixtures__/description-saved-by-v1.4.0.ndjson'])

  it('the fixtures are present', () => {
    expect(before).toBeTypeOf('string')
    expect(written).toBeTypeOf('string')
    expect(savedByOlder).toBeTypeOf('string')
  })

  it('a file the previous build saved loads unchanged: no description, and it saves byte-identical', () => {
    const document = open(before)
    expect(document.description()).toBe('')
    expect(document.prompts().length).toBeGreaterThan(0)
    expect(document.standingInstructions()).not.toBe('')
    expect(serializeProject(document)).toBe(before)
  })

  it('the previous build opened a file with a description and saved it, dropping only the description', () => {
    expect(stateLineOf(written).merge.description[0]).not.toBe('')
    expect(recordLinesOf(savedByOlder)).toEqual(recordLinesOf(written))
    expect(JSON.stringify(stateLineOf(savedByOlder))).not.toContain('"description"')
    expect(open(savedByOlder).description()).toBe('')
  })

  it('merging the newer copy back restores the description', () => {
    const older = open(savedByOlder, { replica: 'dddddd' })
    older.mergeFrom(open(written).mergeState(), { origin: 'merge' })
    expect(older.description()).toBe(open(written).description())
  })
})
