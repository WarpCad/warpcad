// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The project's `gist` field (`TODO/io-017`, Stage 2): which GitHub gist this project is
 * published as — `{ id, public, lastRevision, owner }` — so the short link survives a reload and
 * a Download copy, and **Update gist** knows which gist and which revision it last wrote.
 *
 * What this file pins down:
 *
 * 1. **The command layer.** `setGist(value | null, { origin })` is the one way in: origin
 *    required, validated, a version bump, a no-op for the same value. It records an external
 *    fact, so it is **not** an undo step and Undo never reaches it.
 * 2. **The file.** It rides in the state line's merge section as `merge.gist: [value | null,
 *    stamp]`, next to `merge.project` — never under `merge.registers`, which a released build
 *    refuses by name for anything it does not know. Record lines stay byte-identical, and a file
 *    without the field serialises exactly as before.
 * 3. **Merge.** Last writer wins, as one register (`docs/decisions/document-sync.md`): a later
 *    set or clear beats an earlier one in both merge orders, and the stamp survives the file.
 * 4. **Hostile input.** A malformed `merge.gist` refuses the file by name, like any other
 *    malformed merge-section field.
 * 5. **A copy is not the owner.** `withoutGist` (and so `withProjectId`, which **Make my own copy
 *    to edit** uses) drops the field, never touching the original records.
 */
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { normalizeGistField } from './gistField.js'
import { diffStates } from './merge/merge.js'
import { readMergeSection } from './merge/validate.js'
import { parseNdjson, serializeNdjson } from './ndjson.js'
import { ProjectFormatError, parseProject, serializeProject } from './project.js'
import { projectIdOfRecords, withProjectId, withoutGist } from './shareCopy.js'

// Real project files, read through Vite (`src/` is typed for the browser).
const fixtures = import.meta.glob(['../../examples/*.ndjson', '../../e2e/docs/fixtures/*.ndjson'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const local = { origin: 'local' }
const GIST_ORIGIN = { origin: 'gist' }

const G1 = Object.freeze({ id: 'aa11bb22cc33dd44ee55ff6677889900', public: false, lastRevision: 'a'.repeat(40), owner: 'octocat' })
const G2 = Object.freeze({ id: 'bb22cc33dd44ee55ff66778899001122', public: true, lastRevision: 'b'.repeat(40), owner: 'octocat' })

/** @param {any} document @param {number} [x] */
function placeCube(document, x = 0) {
  const id = document.nextId('cuboid')
  document.append(
    { id, op: 'primitive.cuboid', name: document.nextName('Cube'), params: { size: [20, 20, 20], center: [x, 0, 10] } },
    local,
  )
  return id
}

/**
 * Open a project file's text in a fresh document — the app's Open, minus the UI.
 *
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

describe('the gist field through the command layer', () => {
  it('starts empty, and setGist needs a transaction origin (nothing changes without one)', () => {
    const document = createDocument()
    placeCube(document)
    expect(document.gist()).toBeNull()
    const version = document.version
    expect(() => document.setGist(G1, /** @type {any} */ ({}))).toThrow(/origin/)
    expect(() => document.setGist(G1, /** @type {any} */ (undefined))).toThrow(/origin/)
    expect(document.gist()).toBeNull()
    expect(document.version).toBe(version)
  })

  it('sets and clears, bumps the version once per change, and is a no-op for the same value', () => {
    const document = createDocument()
    placeCube(document)
    const before = document.version
    document.setGist(G1, GIST_ORIGIN)
    expect(document.gist()).toEqual(G1)
    expect(document.version).toBe(before + 1)
    document.setGist({ ...G1 }, GIST_ORIGIN)
    expect(document.version).toBe(before + 1)
    document.setGist(null, GIST_ORIGIN)
    expect(document.gist()).toBeNull()
    expect(document.version).toBe(before + 2)
    document.setGist(null, GIST_ORIGIN)
    expect(document.version).toBe(before + 2)
  })

  it('hands out a copy: changing what gist() returned changes nothing', () => {
    const document = createDocument()
    document.setGist(G1, GIST_ORIGIN)
    const read = /** @type {any} */ (document.gist())
    read.id = 'ff'.repeat(16)
    expect(document.gist()).toEqual(G1)
  })

  it.each([
    ['an id that is not a gist id', { ...G1, id: '../../user' }],
    ['an uppercase id', { ...G1, id: G1.id.toUpperCase() }],
    ['a revision that is not a sha', { ...G1, lastRevision: 'HEAD' }],
    ['a missing revision', { id: G1.id, public: false, owner: 'octocat' }],
    ['public that is not a boolean', { ...G1, public: 'no' }],
    ['an owner that is not a GitHub login', { ...G1, owner: 'octo cat/../x' }],
    ['a missing owner', { id: G1.id, public: false, lastRevision: G1.lastRevision }],
    ['not an object', 'aa11bb22cc33dd44ee55ff6677889900'],
  ])('refuses %s, and keeps what it had', (_label, value) => {
    const document = createDocument()
    document.setGist(G1, GIST_ORIGIN)
    const version = document.version
    expect(() => document.setGist(/** @type {any} */ (value), GIST_ORIGIN)).toThrow()
    expect(document.gist()).toEqual(G1)
    expect(document.version).toBe(version)
  })

  it('keeps only the four named fields (nothing else a caller passes is stored)', () => {
    const document = createDocument()
    document.setGist(/** @type {any} */ ({ ...G1, token: 'ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE', note: 'x' }), GIST_ORIGIN)
    expect(document.gist()).toEqual(G1)
    expect(normalizeGistField({ ...G1, extra: 1 })).toEqual(G1)
  })

  it('is not an undo step: Undo takes back the geometry and never the gist, and Redo leaves it', () => {
    const document = createDocument()
    placeCube(document)
    const label = document.pendingUndo()?.label
    document.setGist(G1, GIST_ORIGIN)
    expect(document.pendingUndo()?.label).toBe(label)
    document.undo()
    expect(document.entries).toHaveLength(0)
    expect(document.gist()).toEqual(G1)
    document.redo()
    expect(document.entries).toHaveLength(1)
    expect(document.gist()).toEqual(G1)
    document.setGist(null, GIST_ORIGIN)
    expect(document.canRedo()).toBe(false)
    expect(document.pendingUndo()?.label).toBe(label)
  })
})

describe('the gist field in the project file', () => {
  it('rides in merge.gist with its stamp, never in merge.registers, and every record line is unchanged', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    const without = serializeProject(document)
    document.setGist(G1, GIST_ORIGIN)
    const text = serializeProject(document)
    const state = stateLineOf(text)
    expect(state.version).toBe(2)
    expect(state.merge.gist[0]).toEqual(G1)
    expect(state.merge.gist[1]).toEqual([expect.any(Number), 'aaaaaa'])
    expect(state.merge.registers?.gist).toBeUndefined()
    // No top-level state-line field either: the value lives only in the merge section.
    expect(state.gist).toBeUndefined()
    expect(recordLinesOf(text)).toEqual(recordLinesOf(without))
  })

  it('round-trips through save and load, and the reopened file re-saves byte-identically', () => {
    const document = createDocument()
    placeCube(document)
    document.setGist(G1, GIST_ORIGIN)
    const text = serializeProject(document)
    const reopened = open(text)
    expect(reopened.gist()).toEqual(G1)
    expect(serializeProject(reopened)).toBe(text)
  })

  it('a clear is written too, so it still beats an older set after a reload', () => {
    const document = createDocument()
    placeCube(document)
    document.setGist(G1, GIST_ORIGIN)
    document.setGist(null, GIST_ORIGIN)
    const text = serializeProject(document)
    expect(stateLineOf(text).merge.gist[0]).toBeNull()
    const reopened = open(text)
    expect(reopened.gist()).toBeNull()
    expect(serializeProject(reopened)).toBe(text)
  })

  it('a project published without a project id (a legacy file) still carries it', () => {
    const legacy = createDocument({
      actions: [{ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } }],
    })
    legacy.setGist(G1, GIST_ORIGIN)
    const text = serializeProject(legacy)
    expect(stateLineOf(text).merge.project).toBeUndefined()
    expect(open(text).gist()).toEqual(G1)
  })

  it.each(Object.entries(fixtures))('%s, which has no gist, opens and re-saves byte-identically', (_path, text) => {
    expect(text).not.toContain('"gist"')
    expect(parseProject(text).merge?.gist).toBeUndefined()
    const reopened = open(text)
    expect(reopened.gist()).toBeNull()
    expect(serializeProject(reopened)).toBe(text)
  })

  it('a document that never touched it writes no trace of it', () => {
    const document = createDocument()
    placeCube(document)
    expect(serializeProject(document)).not.toContain('gist')
  })

  it.each([
    ['not a pair', { gist: G1 }],
    ['a bad stamp', { gist: [G1, 'yesterday'] }],
    ['a bad id', { gist: [{ ...G1, id: 'not-a-gist' }, [3, 'aaaaaa']] }],
    ['public as text', { gist: [{ ...G1, public: 'true' }, [3, 'aaaaaa']] }],
    ['a value that is a list', { gist: [[G1.id], [3, 'aaaaaa']] }],
  ])('a hostile merge.gist (%s) refuses the whole file by name', (_label, extra) => {
    const document = createDocument()
    placeCube(document)
    document.setGist(G1, GIST_ORIGIN)
    const text = serializeProject(document)
    const state = stateLineOf(text)
    state.merge = { ...state.merge, ...extra }
    const lines = text.trimEnd().split('\n')
    lines[lines.length - 1] = JSON.stringify(state)
    const hostile = lines.join('\n') + '\n'
    expect(() => parseProject(hostile)).toThrow(ProjectFormatError)
    expect(() => parseProject(hostile)).toThrow(/gist/)
  })

  it('why it is not under merge.registers: a reader that does not know a register refuses the file', () => {
    // A released build reads `registers` exactly like this; `gist` written there would cost an
    // older tab the whole file, where an unknown section key is simply ignored.
    expect(() => readMergeSection({ registers: { gist: [3, 'aaaaaa'] } }, new Set())).toThrow(/not a register/)
    expect(() => readMergeSection({ somethingNewer: [1, 2, 3] }, new Set())).not.toThrow()
  })
})

describe('the gist field merges last-writer-wins', () => {
  /** Two replicas of one project: A made it, B opened A's file. */
  function twoCopies() {
    const a = createDocument({ replica: 'aaaaaa' })
    placeCube(a)
    const b = open(serializeProject(a), { replica: 'bbbbbb' })
    return { a, b }
  }

  it('a later set wins in both merge orders, and survives a trip through the file', () => {
    const { a, b } = twoCopies()
    b.setGist(G1, GIST_ORIGIN)
    // A has seen B's write, so A's set is later.
    a.mergeFrom(open(serializeProject(b)).mergeState(), { origin: 'merge' })
    expect(a.gist()).toEqual(G1)
    a.setGist(G2, GIST_ORIGIN)
    b.mergeFrom(open(serializeProject(a)).mergeState(), { origin: 'merge' })
    expect(b.gist()).toEqual(G2)
    a.mergeFrom(open(serializeProject(b)).mergeState(), { origin: 'merge' })
    expect(a.gist()).toEqual(G2)
  })

  it('a later clear (Stop sharing) beats an older set; an older set never revives it', () => {
    const { a, b } = twoCopies()
    a.setGist(G1, GIST_ORIGIN)
    b.mergeFrom(a.mergeState(), { origin: 'merge' })
    expect(b.gist()).toEqual(G1)
    a.setGist(null, GIST_ORIGIN)
    // B still holds the older set; merging A's clear in clears it…
    const stale = b.mergeState()
    b.mergeFrom(a.mergeState(), { origin: 'merge' })
    expect(b.gist()).toBeNull()
    // …and merging the stale set into A changes nothing.
    a.mergeFrom(stale, { origin: 'merge' })
    expect(a.gist()).toBeNull()
  })

  it('a merge reports the gist register as changed, and never touches either undo stack', () => {
    const { a, b } = twoCopies()
    const label = b.pendingUndo()?.label
    a.setGist(G1, GIST_ORIGIN)
    const before = b.mergeState()
    b.mergeFrom(a.mergeState(), { origin: 'merge' })
    expect(diffStates(before, b.mergeState()).registers).toContain('gist')
    expect(b.pendingUndo()?.label).toBe(label)
  })
})

describe('a copy never inherits the gist (Make my own copy to edit)', () => {
  function publishedRecords() {
    const document = createDocument({ mintProjectId: () => 'senderproject0001' })
    placeCube(document)
    document.setGist(G1, GIST_ORIGIN)
    return parseNdjson(serializeProject(document)).records
  }

  it('withoutGist drops the field and leaves the original records untouched', () => {
    const records = publishedRecords()
    const snapshot = JSON.parse(JSON.stringify(records))
    const copy = withoutGist(records)
    expect(JSON.stringify(copy)).not.toContain('"gist"')
    expect(records).toEqual(snapshot)
    // Every other record is the same object; only the state line is new.
    expect(copy.slice(0, -1)).toEqual(records.slice(0, -1))
    expect(copy[0]).toBe(records[0])
    expect(projectIdOfRecords(copy)).toBe('senderproject0001')
    expect(open(serializeNdjson(copy)).gist()).toBeNull()
  })

  it('withProjectId (the copy a recipient makes) drops it as well, and so does a legacy copy', () => {
    const records = publishedRecords()
    const copy = withProjectId(records, 'mycopy0000000001')
    expect(projectIdOfRecords(copy)).toBe('mycopy0000000001')
    expect(open(serializeNdjson(copy)).gist()).toBeNull()
    expect(open(serializeNdjson(records)).gist()).toEqual(G1)

    const legacy = createDocument({
      actions: [{ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } }],
    })
    legacy.setGist(G1, GIST_ORIGIN)
    const legacyRecords = parseNdjson(serializeProject(legacy)).records
    const legacyCopy = withProjectId(legacyRecords, 'mycopy0000000001')
    expect(projectIdOfRecords(legacyCopy)).toBeNull()
    expect(open(serializeNdjson(legacyCopy)).gist()).toBeNull()
  })

  it('records without a gist come back as they were', () => {
    const document = createDocument()
    placeCube(document)
    const records = parseNdjson(serializeProject(document)).records
    expect(withoutGist(records)).toEqual(records)
  })
})
