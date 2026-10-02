// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { ReplayRejection, createDocument } from './document.js'
import { boundsOf } from './kernel/group.js'
import { ProjectFormatError, parseProject, serializeProject } from './project.js'
import { serializeNdjson } from './ndjson.js'

/**
 * `TODO/io-001` — the on-storage / on-disk form of a whole document.
 *
 * One format for autosave and for a saved file ("a manual Save As is just the
 * same bytes autosave already writes"), so everything here is asserted on the
 * text, not on either transport. Real kernel geometry throughout: "restore is
 * faithful" is a claim about millimetres, and a fake registry returning
 * `{tag:'box'}` could satisfy the bookkeeping while the geometry came back wrong.
 */

const local = { origin: 'local' }

/** Two cuboids, unioned-by-consumption target left alone, plus one moved. */
function scenario() {
  const document = createDocument()
  document.append(
    { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } },
    local,
  )
  document.append(
    { id: 'cube-2', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [6, 6, 6], center: [20, 0, 3] } },
    local,
  )
  document.append(
    { id: 'cube-2-move', op: 'transform.translate', supersedes: 'cube-2', target: 'cube-2', params: { vector: [5, 0, 0], rotation: [0, 0, 0] } },
    local,
  )
  return document
}

/** @param {any} document */
function bodySummary(document) {
  return document.bodies().map((/** @type {any} */ body) => ({
    id: body.id,
    name: body.name,
    bounds: boundsOf(body.geometry),
  }))
}

describe('serializeProject', () => {
  it('is exactly the NDJSON action log when nothing is suppressed, rolled back or non-local', () => {
    const document = scenario()
    expect(serializeProject(document)).toBe(serializeNdjson(document.records))
  })

  it('is the empty string for an empty document', () => {
    expect(serializeProject(createDocument())).toBe('')
  })

  it('appends one state line when a row is suppressed', () => {
    const document = scenario()
    document.setSuppressed('cube-2-move', true, local)
    const lines = serializeProject(document).trim().split('\n')
    expect(lines).toHaveLength(4)
    expect(JSON.parse(lines[3])).toEqual({
      warpcad: 'project-state',
      version: 1,
      suppressed: ['cube-2-move'],
    })
  })

  it('records the rollback marker as a count of active entries', () => {
    const document = scenario()
    document.rollBackTo('cube-2', local)
    const state = JSON.parse(serializeProject(document).trim().split('\n').pop() ?? '')
    expect(state.rollbackAt).toBe(2)
  })

  it('records a non-local origin, and only those', () => {
    const document = createDocument()
    document.append({ id: 'a', op: 'primitive.cuboid', params: { size: [1, 1, 1], center: [0, 0, 0] } }, local)
    document.append({ id: 'b', op: 'primitive.cuboid', params: { size: [1, 1, 1], center: [5, 0, 0] } }, { origin: 'mcp' })
    const state = JSON.parse(serializeProject(document).trim().split('\n').pop() ?? '')
    expect(state.origins).toEqual({ b: 'mcp' })
  })
})

describe('parseProject → loadEntries round trip', () => {
  it('reproduces the same bodies at the same millimetre positions, byte for byte', () => {
    const original = scenario()
    const text = serializeProject(original)

    const restored = createDocument()
    const { entries, rollbackAt } = parseProject(text)
    restored.loadEntries(entries, rollbackAt)

    expect(bodySummary(restored)).toEqual(bodySummary(original))
    // Byte-identical: serialising the restored document gives back the same text.
    expect(serializeProject(restored)).toBe(text)
  })

  it('restores a suppressed row as suppressed, not as active and not as deleted', () => {
    const original = scenario()
    original.setSuppressed('cube-2-move', true, local)
    const text = serializeProject(original)

    const restored = createDocument()
    const { entries, rollbackAt } = parseProject(text)
    restored.loadEntries(entries, rollbackAt)

    expect(restored.timeline().map((row) => row.suppressed)).toEqual([false, false, true])
    expect(bodySummary(restored)).toEqual(bodySummary(original))
    expect(serializeProject(restored)).toBe(text)
  })

  it('restores a rolled-back document with its inactive tail intact', () => {
    const original = scenario()
    original.rollBackTo('cube-1', local)
    expect(original.bodies()).toHaveLength(1)
    const text = serializeProject(original)

    const restored = createDocument()
    const { entries, rollbackAt } = parseProject(text)
    restored.loadEntries(entries, rollbackAt)

    expect(restored.rollbackAt()).toBe(1)
    expect(restored.records).toHaveLength(3)
    expect(restored.timeline().map((row) => row.active)).toEqual([true, false, false])
    expect(bodySummary(restored)).toEqual(bodySummary(original))

    // And it is not stuck: rolling forward brings the tail back.
    restored.rollForward(local)
    expect(restored.bodies()).toHaveLength(2)
  })

  it('keeps a non-local origin on the entry it belonged to', () => {
    const original = createDocument()
    original.append({ id: 'a', op: 'primitive.cuboid', params: { size: [1, 1, 1], center: [0, 0, 0] } }, { origin: 'mcp' })
    const restored = createDocument()
    const { entries, rollbackAt } = parseProject(serializeProject(original))
    restored.loadEntries(entries, rollbackAt)
    expect(restored.originOf('a')).toBe('mcp')
  })

  it('accepts an empty file as an empty project', () => {
    expect(parseProject('')).toEqual({ entries: [], rollbackAt: null, resolution: 'normal', warnings: [] })
    expect(parseProject('\n\n')).toEqual({ entries: [], rollbackAt: null, resolution: 'normal', warnings: [] })
  })

  it('accepts a plain action log with no state line, as written by every earlier reader', () => {
    const { entries, rollbackAt } = parseProject(
      '{"id":"a","op":"primitive.cuboid","params":{"size":[1,1,1],"center":[0,0,0]}}\n',
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].origin).toBe('local')
    expect(rollbackAt).toBeNull()
  })
})

describe('parseProject refuses, by name, before anything is loaded', () => {
  it('names the line of invalid JSON', () => {
    const text = '{"op":"primitive.cuboid","id":"a"}\nthis is not json\n'
    expect(() => parseProject(text)).toThrow(ProjectFormatError)
    expect(() => parseProject(text)).toThrow(/line 2/)
  })

  it('refuses a line that is JSON but not a record', () => {
    expect(() => parseProject('[1,2,3]\n')).toThrow(/line 1.*record/i)
    expect(() => parseProject('{"id":"a"}\n')).toThrow(/line 1.*op/i)
  })

  it('refuses a file from a newer version by the state line’s version, never half-loading it', () => {
    const text =
      '{"id":"a","op":"primitive.cuboid","params":{"size":[1,1,1],"center":[0,0,0]}}\n' +
      '{"warpcad":"project-state","version":2}\n'
    expect(() => parseProject(text)).toThrow(/newer version/i)
  })

  it('refuses a control line of a kind it does not know', () => {
    expect(() => parseProject('{"warpcad":"mystery"}\n')).toThrow(/mystery/)
  })

  it('refuses two state lines', () => {
    const state = '{"warpcad":"project-state","version":1}\n'
    expect(() => parseProject(state + state)).toThrow(/more than one/i)
  })

  it('refuses a duplicate record id, including one hidden by suppression', () => {
    const a = '{"id":"a","op":"primitive.cuboid","params":{"size":[1,1,1],"center":[0,0,0]}}\n'
    expect(() => parseProject(a + a)).toThrow(/duplicate.*"a"/i)
  })

  it('refuses a suppressed id that names no record', () => {
    const text =
      '{"id":"a","op":"primitive.cuboid","params":{"size":[1,1,1],"center":[0,0,0]}}\n' +
      '{"warpcad":"project-state","version":1,"suppressed":["ghost"]}\n'
    expect(() => parseProject(text)).toThrow(/ghost/)
  })

  it.each([0, 3, 1.5, -1, '2'])('refuses an impossible rollback marker (%j)', (marker) => {
    const text =
      '{"id":"a","op":"primitive.cuboid","params":{"size":[1,1,1],"center":[0,0,0]}}\n' +
      '{"id":"b","op":"primitive.cuboid","params":{"size":[1,1,1],"center":[4,0,0]}}\n' +
      `{"warpcad":"project-state","version":1,"rollbackAt":${JSON.stringify(marker)}}\n`
    // 2 entries: a legal marker is exactly 1. (0 would evaluate nothing; 2 is "no tail".)
    expect(() => parseProject(text)).toThrow(/rollback/i)
  })
})

describe('createDocument.loadEntries — atomic, and it clears history like the seed loop', () => {
  it('refuses an op the app does not know, by step and name, leaving the document untouched', () => {
    const document = scenario()
    const before = serializeProject(document)
    const { entries } = parseProject(
      '{"id":"a","op":"primitive.cuboid","params":{"size":[1,1,1],"center":[0,0,0]}}\n' +
        '{"id":"b","op":"future.warp","params":{}}\n',
    )
    let thrown
    try {
      document.loadEntries(entries, null)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ReplayRejection)
    expect(/** @type {Error} */ (thrown).message).toMatch(/Step 2/)
    expect(/** @type {Error} */ (thrown).message).toMatch(/future\.warp/)
    expect(serializeProject(document)).toBe(before)
    expect(document.canUndo()).toBe(true) // history was not cleared by the refusal
  })

  it('empties both undo and redo stacks on success, so history never survives a load', () => {
    const document = scenario()
    document.undo()
    expect(document.canUndo()).toBe(true)
    expect(document.canRedo()).toBe(true)

    const { entries, rollbackAt } = parseProject(serializeProject(scenario()))
    document.loadEntries(entries, rollbackAt)

    expect(document.canUndo()).toBe(false)
    expect(document.canRedo()).toBe(false)
  })

  it('bumps the version so watchers re-read the document', () => {
    const document = createDocument()
    const before = document.version
    document.loadEntries(parseProject(serializeProject(scenario())).entries, null)
    expect(document.version).toBeGreaterThan(before)
  })

  it('does not hand out an id already in the loaded log, and the first edit after restore is undoable', () => {
    const document = createDocument()
    document.loadEntries(parseProject(serializeProject(scenario())).entries, null)
    const id = document.nextId('cube')
    expect(document.records.some((record) => record.id === id)).toBe(false)

    document.append(
      { id, op: 'primitive.cuboid', params: { size: [2, 2, 2], center: [40, 0, 1] } },
      local,
    )
    expect(document.canUndo()).toBe(true)
    document.undo()
    expect(document.bodies()).toHaveLength(2)
  })

  it('replaces the previous log wholesale rather than appending to it', () => {
    const document = scenario()
    document.loadEntries(
      parseProject('{"id":"solo","op":"primitive.cuboid","params":{"size":[1,1,1],"center":[0,0,0]}}\n').entries,
      null,
    )
    expect(document.records.map((record) => record.id)).toEqual(['solo'])
    expect(document.bodies()).toHaveLength(1)
  })
})

describe('the design resolution on the state line (TODO/core-035)', () => {
  /** @param {string} resolution */
  function cylinderDocument(resolution) {
    const document = createDocument({ resolution })
    document.append(
      { id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 50, height: 10 } },
      local,
    )
    return document
  }

  it('an old file with no resolution field loads as legacy', () => {
    const text = serializeNdjson([{ id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 50, height: 10 } }])
    expect(parseProject(text).resolution).toBe('legacy')
    const loaded = createDocument({ resolution: 'normal' })
    const parsed = parseProject(text)
    loaded.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution)
    expect(loaded.resolution()).toBe('legacy')
  })

  it('a legacy document writes no resolution — its bytes are exactly what they were before', () => {
    const document = cylinderDocument('legacy')
    expect(serializeProject(document)).toBe(serializeNdjson(document.records))
  })

  it('round-trips a non-legacy resolution, and the reloaded geometry is the same', () => {
    const document = cylinderDocument('fine')
    const text = serializeProject(document)
    expect(text).toContain('"resolution":"fine"')
    const parsed = parseProject(text)
    expect(parsed.resolution).toBe('fine')
    const reloaded = createDocument()
    reloaded.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution)
    expect(reloaded.resolution()).toBe('fine')
    expect(serializeProject(reloaded)).toBe(text)
    expect(bodySummary(reloaded)).toEqual(bodySummary(document))
  })

  it('round-trips alongside the other state-line fields', () => {
    const document = cylinderDocument('print')
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [5, 5, 5] } }, local)
    document.setSuppressed('cube-1', true, local)
    const parsed = parseProject(serializeProject(document))
    expect(parsed.resolution).toBe('print')
    expect(parsed.entries[1].suppressed).toBe(true)
  })

  it('an empty document at the new-document default writes nothing, as an empty document always has', () => {
    expect(serializeProject(createDocument({ resolution: 'normal' }))).toBe('')
  })

  it('an empty file is a new document, so it reads as the new-document default, not legacy', () => {
    // `legacy` exists to keep old geometry unchanged; an empty file has none to keep. Without
    // this, an emptied project autosaved as '' would come back from a reload as Legacy.
    expect(parseProject('').resolution).toBe('normal')
  })

  it('an empty document at a chosen non-default resolution keeps it', () => {
    const text = serializeProject(createDocument({ resolution: 'fine' }))
    expect(parseProject(text).resolution).toBe('fine')
  })

  it('refuses an unknown preset by name, with a ProjectFormatError', () => {
    const text = serializeNdjson([
      { id: 'a', op: 'primitive.cuboid', params: { size: [1, 1, 1] } },
      { warpcad: 'project-state', version: 1, resolution: 'ultra' },
    ])
    expect(() => parseProject(text)).toThrow(ProjectFormatError)
    expect(() => parseProject(text)).toThrow(/resolution.*ultra/)
  })

  it('refuses a non-string resolution', () => {
    const text = serializeNdjson([
      { id: 'a', op: 'primitive.cuboid', params: { size: [1, 1, 1] } },
      { warpcad: 'project-state', version: 1, resolution: 32 },
    ])
    expect(() => parseProject(text)).toThrow(ProjectFormatError)
  })
})

describe('retired sketch.line records (TODO/sketch-001) — skipped with a warning, never a refused load', () => {
  // ui-020 shipped loose `sketch.line` records. sketch-001 removed that op: a sketch is now
  // a `primitive.sketch` body. A file or autosave written in between must still open —
  // refusing it would throw away every *other* body in it — so the retired records are
  // dropped at parse time, each named in a warning, and no migration is attempted.
  /** @param {string} id @param {Record<string, unknown>} [extra] */
  const line = (id, extra = {}) =>
    JSON.stringify({ id, op: 'sketch.line', name: 'Line 1', params: { start: [0, 0], end: [10, 0] }, ...extra })
  /** @param {string} id @param {number} x */
  const cube = (id, x) =>
    JSON.stringify({ id, op: 'primitive.cuboid', name: id, params: { size: [10, 10, 10], center: [x, 0, 5] } })

  it('drops every sketch.* record, warns once per record by id and op, and loads the rest', () => {
    const text = [cube('cube-1', 0), line('sketch-1'), line('sketch-2', { supersedes: 'sketch-1' }), cube('cube-2', 30)].join('\n')
    const parsed = parseProject(text)
    expect(parsed.entries.map((entry) => entry.record.id)).toEqual(['cube-1', 'cube-2'])
    expect(parsed.warnings).toEqual([
      { id: 'sketch-1', op: 'sketch.line', message: expect.stringMatching(/no longer supported — redraw them in a Sketch primitive/) },
      { id: 'sketch-2', op: 'sketch.line', message: expect.stringMatching(/no longer supported/) },
    ])
    const document = createDocument()
    document.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution)
    expect(document.bodies().map((body) => body.id)).toEqual(['cube-1', 'cube-2'])
  })

  it('reports no warnings for a file with nothing retired', () => {
    expect(parseProject(cube('cube-1', 0)).warnings).toEqual([])
  })

  it('keeps the state line consistent: a suppressed retired id is forgotten, and the rollback marker shifts', () => {
    const state = JSON.stringify({ warpcad: 'project-state', version: 1, suppressed: ['sketch-1'], rollbackAt: 2 })
    const text = [line('sketch-1'), cube('cube-1', 0), cube('cube-2', 30), state].join('\n')
    const parsed = parseProject(text)
    expect(parsed.entries.map((entry) => entry.record.id)).toEqual(['cube-1', 'cube-2'])
    expect(parsed.entries.some((entry) => entry.suppressed)).toBe(false)
    // Two active steps before the marker became one: the dropped line was one of them.
    expect(parsed.rollbackAt).toBe(1)
  })

  it('drops a marker that would no longer fit rather than refusing the file', () => {
    const state = JSON.stringify({ warpcad: 'project-state', version: 1, rollbackAt: 1 })
    const text = [line('sketch-1'), cube('cube-1', 0), state].join('\n')
    expect(parseProject(text).rollbackAt).toBeNull()
  })
})
