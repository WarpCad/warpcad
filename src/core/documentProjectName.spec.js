// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/io-040` — two project-level registers an agent sets so the project is ready to publish as a
 * gist: the project's **name** (`src/core/projectName.js`) and the **staged gist files**
 * (`src/core/gistExtras.js`). Each is a last-writer-wins register merged exactly like the
 * description (`documentDescription.spec.js`), written in the file's merge section as
 * `merge.name: [text, stamp]` and `merge.gistExtras: [list, stamp]` — never under
 * `merge.registers`, whose names a released build refuses when unknown.
 *
 * Like the description, neither is an undo step for any origin, so an `ai`, `mcp` or `webmcp`
 * write can never land on the local user's undo stack; **Undo AI turn** (an `ai`-origin merge)
 * takes them back through `mergeUndo.js`.
 */
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { GIST_EXTRAS_LIMITS } from './gistExtras.js'
import { canonicalJSON } from './merge/state.js'
import { mergeStates } from './merge/merge.js'
import { readMergeSection } from './merge/validate.js'
import { applyMergeUndo, mergeSnapshotOf, planMergeUndo } from './mergeUndo.js'
import { ProjectFormatError, parseProject, serializeProject } from './project.js'
import { PROJECT_NAME_LIMITS } from './projectName.js'

const local = { origin: 'local' }
const mcp = { origin: 'mcp' }
const ai = { origin: 'ai' }

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

/** Two replicas of one project: A made it, B opened A's file. */
function twoCopies() {
  const a = createDocument({ replica: 'aaaaaa' })
  placeCube(a)
  const b = open(serializeProject(a), { replica: 'bbbbbb' })
  return { a, b }
}

/** @type {import('./gistExtras.js').GistExtra[]} */
const STL = [{ kind: 'stl', name: 'cable-clip.stl', ids: [] }]
/** @type {import('./gistExtras.js').GistExtra[]} */
const NOTE = [{ kind: 'note', name: 'print-settings.md', text: 'PETG, 0.2 mm layers.' }]

describe('the project name through the command layer', () => {
  it('starts empty, needs an origin, and stores one cleaned line', () => {
    const document = createDocument()
    expect(document.name()).toBe('')
    expect(() => document.setName('x', /** @type {any} */ ({}))).toThrow(/origin/)
    document.setName('  Cable\u202E clip\r\nfor   desks\u0007  ', mcp)
    expect(document.name()).toBe('Cable clip for desks')
  })

  it('caps it at the README title’s length, and a non-string is no name', () => {
    const document = createDocument()
    document.setName('n'.repeat(PROJECT_NAME_LIMITS.maxLength + 30), local)
    expect(Array.from(document.name())).toHaveLength(PROJECT_NAME_LIMITS.maxLength)
    expect(document.name().endsWith('…')).toBe(true)
    document.setName(/** @type {any} */ (42), local)
    expect(document.name()).toBe('')
  })

  it('the same name is a no-op; a change bumps the version but is never an undo step', () => {
    const document = createDocument()
    placeCube(document)
    document.setName('Clip', local)
    const version = document.version
    document.setName('Clip', local)
    expect(document.version).toBe(version)
    document.setName('Cable clip', mcp)
    expect(document.version).toBeGreaterThan(version)
    document.appendAll([{ id: 'own', op: 'primitive.cuboid', name: 'Mine', params: { size: [5, 5, 5], center: [0, 50, 2.5] } }], local)
    document.undo()
    expect(document.name()).toBe('Cable clip')
  })

  it('an agent’s name (ai, mcp, webmcp) never lands on the local undo stack', () => {
    for (const origin of ['ai', 'mcp', 'webmcp']) {
      const document = createDocument()
      document.setName('Agent named it', { origin })
      expect(document.canUndo()).toBe(false)
      expect(document.undo()).toBeUndefined()
      expect(document.name()).toBe('Agent named it')
    }
  })
})

describe('the staged gist files through the command layer', () => {
  it('start empty, need an origin, and are returned as fresh copies', () => {
    const document = createDocument()
    expect(document.gistExtras()).toEqual([])
    expect(() => document.setGistExtras(STL, /** @type {any} */ ({}))).toThrow(/origin/)
    document.setGistExtras(STL, mcp)
    const read = /** @type {any[]} */ (document.gistExtras())
    expect(read).toEqual(STL)
    read[0].ids.push('tampered')
    expect(document.gistExtras()).toEqual(STL)
  })

  it('are cleaned on the way in: no bytes, no unknown kind, capped', () => {
    const document = createDocument()
    document.setGistExtras(
      /** @type {any} */ ([
        { kind: 'stl', name: 'a.stl', ids: [], bytes: [1, 2, 3] },
        { kind: '3mf', name: 'b.3mf', ids: [] },
        { kind: 'note', name: 'n.md', text: 'x'.repeat(GIST_EXTRAS_LIMITS.maxNoteChars + 10) },
        ...Array.from({ length: GIST_EXTRAS_LIMITS.maxFiles + 3 }, (_, i) => ({ kind: 'stl', name: `f${i}.stl`, ids: [] })),
      ]),
      mcp,
    )
    const extras = document.gistExtras()
    expect(extras).toHaveLength(GIST_EXTRAS_LIMITS.maxFiles)
    expect(extras[0]).toEqual({ kind: 'stl', name: 'a.stl', ids: [] })
    expect(extras.some((extra) => /** @type {string} */ (extra.kind) === '3mf')).toBe(false)
    const note = /** @type {any} */ (extras.find((extra) => extra.kind === 'note'))
    expect(Array.from(note.text)).toHaveLength(GIST_EXTRAS_LIMITS.maxNoteChars)
  })

  it('an empty list clears them; neither set nor clear is an undo step', () => {
    const document = createDocument()
    document.setGistExtras(NOTE, ai)
    const version = document.version
    document.setGistExtras(NOTE, ai)
    expect(document.version).toBe(version)
    document.setGistExtras([], ai)
    expect(document.gistExtras()).toEqual([])
    expect(document.version).toBeGreaterThan(version)
    expect(document.canUndo()).toBe(false)
  })
})

describe('the name and the staged files in the file', () => {
  it('ride in merge.name and merge.gistExtras as [value, stamp]; record lines stay byte-identical', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    const before = serializeProject(document)
    document.setName('Cable clip', mcp)
    document.setGistExtras(STL, mcp)
    const text = serializeProject(document)
    expect(recordLinesOf(text)).toEqual(recordLinesOf(before))
    const state = stateLineOf(text)
    expect(state.merge.name[0]).toBe('Cable clip')
    expect(state.merge.name[1][1]).toBe('aaaaaa')
    expect(state.merge.gistExtras[0]).toEqual(STL)
    expect(state.merge.registers?.name).toBeUndefined()
    expect(state.merge.registers?.gistExtras).toBeUndefined()
    const reopened = open(text)
    expect(reopened.name()).toBe('Cable clip')
    expect(reopened.gistExtras()).toEqual(STL)
  })

  it('a project with neither writes neither key', () => {
    const document = createDocument()
    placeCube(document)
    const text = serializeProject(document)
    expect(stateLineOf(text).merge?.name).toBeUndefined()
    expect(stateLineOf(text).merge?.gistExtras).toBeUndefined()
  })

  it('a clear is written with its stamp and beats an older set after a reload', () => {
    const a = createDocument({ replica: 'aaaaaa' })
    placeCube(a)
    a.setName('old', local)
    a.setGistExtras(NOTE, local)
    const b = open(serializeProject(a), { replica: 'bbbbbb' })
    b.setName('', local)
    b.setGistExtras([], local)
    const cleared = serializeProject(b)
    expect(stateLineOf(cleared).merge.name[0]).toBe('')
    expect(stateLineOf(cleared).merge.gistExtras[0]).toEqual([])
    a.mergeFrom(open(cleared).mergeState(), { origin: 'merge' })
    expect(a.name()).toBe('')
    expect(a.gistExtras()).toEqual([])
  })

  it('cleans a hostile file on load: the name to one capped line, the list to valid entries only', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    document.setName('x', local)
    document.setGistExtras(NOTE, local)
    const text = withMerge(serializeProject(document), (merge) => ({
      ...merge,
      name: ['a\u202Eb\nc' + 'z'.repeat(PROJECT_NAME_LIMITS.maxLength), merge.name[1]],
      gistExtras: [
        [
          { kind: 'note', name: '../../README.md', text: 'collides with the README' },
          { kind: 'note', name: '../Print notes', text: 'hi\u202E' },
          { kind: 'stl', name: 'ok.stl', ids: ['cuboid-1', 7] },
          { kind: 'exe', name: 'run.exe' },
          'nonsense',
        ],
        merge.gistExtras[1],
      ],
    }))
    const loaded = open(text)
    expect(loaded.name().startsWith('ab c')).toBe(true)
    expect(Array.from(loaded.name())).toHaveLength(PROJECT_NAME_LIMITS.maxLength)
    const extras = loaded.gistExtras()
    expect(extras.map((extra) => extra.name)).toEqual(['print-notes.md', 'ok.stl'])
    expect(/** @type {any} */ (extras[0]).text).toBe('hi')
    expect(/** @type {any} */ (extras[1]).ids).toEqual(['cuboid-1'])
  })

  it('refuses the file, by name, when name or gistExtras is not [value, stamp]', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    document.setName('x', local)
    document.setGistExtras(NOTE, local)
    const text = serializeProject(document)
    for (const name of ['x', 3, null, [3, [1, 'aaaaaa']], ['x', 'nope'], ['x']]) {
      const hostile = withMerge(text, (merge) => ({ ...merge, name }))
      expect(() => parseProject(hostile)).toThrow(ProjectFormatError)
      expect(() => parseProject(hostile)).toThrow(/name/)
    }
    for (const gistExtras of ['x', [{}, [1, 'aaaaaa']], [[], 'nope'], [[]]]) {
      const hostile = withMerge(text, (merge) => ({ ...merge, gistExtras }))
      expect(() => parseProject(hostile)).toThrow(ProjectFormatError)
      expect(() => parseProject(hostile)).toThrow(/gistExtras/)
    }
  })

  it('an older reader ignores both: unknown section keys, not registers', () => {
    expect(() => readMergeSection({ somethingNewer: ['x', [1, 'aaaaaa']] }, new Set())).not.toThrow()
    expect(() => readMergeSection({ registers: { name: [3, 'aaaaaa'] } }, new Set())).toThrow(/not a register/)
    expect(() => readMergeSection({ registers: { gistExtras: [3, 'aaaaaa'] } }, new Set())).toThrow(/not a register/)
  })
})

describe('the name and the staged files merge as registers', () => {
  it('the later write wins, in both merge orders and through the file', () => {
    const { a, b } = twoCopies()
    a.setName('from A', local)
    a.setGistExtras(STL, local)
    b.setName('from B', local)
    b.setGistExtras(NOTE, local)
    b.setName('from B, later', local)
    const sa = open(serializeProject(a)).mergeState()
    const sb = open(serializeProject(b)).mergeState()
    expect(canonicalJSON(mergeStates(sa, sb))).toBe(canonicalJSON(mergeStates(sb, sa)))
    a.mergeFrom(sb, { origin: 'merge' })
    b.mergeFrom(sa, { origin: 'merge' })
    expect(a.name()).toBe('from B, later')
    expect(b.name()).toBe(a.name())
    expect(a.gistExtras()).toEqual(b.gistExtras())
    expect(open(serializeProject(a)).name()).toBe(a.name())
    expect(open(serializeProject(a)).gistExtras()).toEqual(a.gistExtras())
  })

  it('concurrent edits from two replicas: each register takes its own latest writer', () => {
    const { a, b } = twoCopies()
    a.setName('A’s name', mcp)
    b.setGistExtras(NOTE, mcp)
    a.mergeFrom(open(serializeProject(b)).mergeState(), { origin: 'merge' })
    b.mergeFrom(open(serializeProject(a)).mergeState(), { origin: 'merge' })
    for (const document of [a, b]) {
      expect(document.name()).toBe('A’s name')
      expect(document.gistExtras()).toEqual(NOTE)
    }
  })

  it('a failed merge puts both back', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    document.setName('mine', local)
    document.setGistExtras(STL, local)
    const other = createDocument({ replica: 'cccccc' })
    placeCube(other)
    other.setName('theirs', local)
    other.setGistExtras(NOTE, local)
    expect(() => document.mergeFrom(other.mergeState(), { origin: 'merge' })).toThrow()
    expect(document.name()).toBe('mine')
    expect(document.gistExtras()).toEqual(STL)
  })

  it('Undo AI turn (an ai-origin merge undo) takes a name and staged files set in the turn back', () => {
    const live = createDocument({ replica: 'aaaaaa' })
    placeCube(live)
    live.setName('the person’s', local)
    // The turn's fork: a replica of the live document that the agent writes to.
    const fork = open(serializeProject(live), { replica: 'ffffff' })
    fork.setName('the agent’s', ai)
    fork.setGistExtras(STL, ai)
    const base = mergeSnapshotOf(live)
    const result = live.mergeFrom(fork.mergeState(), ai)
    expect(live.name()).toBe('the agent’s')
    expect(live.gistExtras()).toEqual(STL)
    expect(live.canUndo()).toBe(false)
    const merged = mergeSnapshotOf(live)
    const plan = planMergeUndo(base, merged, mergeSnapshotOf(live), result.change)
    expect(plan.ok).toBe(true)
    applyMergeUndo(live, /** @type {any} */ (plan), ai)
    expect(live.name()).toBe('the person’s')
    expect(live.gistExtras()).toEqual([])
    expect(live.canUndo()).toBe(false)
  })

  it('Undo AI turn leaves a name the person changed after the turn alone', () => {
    const live = createDocument({ replica: 'aaaaaa' })
    placeCube(live)
    const fork = open(serializeProject(live), { replica: 'ffffff' })
    fork.setName('the agent’s', ai)
    const base = mergeSnapshotOf(live)
    const result = live.mergeFrom(fork.mergeState(), ai)
    const merged = mergeSnapshotOf(live)
    live.setName('the person’s, later', local)
    const plan = planMergeUndo(base, merged, mergeSnapshotOf(live), result.change)
    applyMergeUndo(live, /** @type {any} */ (plan), ai)
    expect(live.name()).toBe('the person’s, later')
  })
})
