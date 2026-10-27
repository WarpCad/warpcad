// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { parseNdjson } from './ndjson.js'
import { parseProject, serializeProject } from './project.js'
import { projectIdOfRecords, shareFileName, withProjectId } from './shareCopy.js'

/**
 * `TODO/io-016`: a recipient's **Make my own copy to edit** is a new project (`TODO/data-013`),
 * and a link for the project already open here is recognised by its id.
 */

const cube = { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } }

/** Records of a project made here, so it has minted its id on its first change. */
function projectRecords() {
  const doc = createDocument({ mintProjectId: () => 'senderproject0001' })
  doc.append(cube, { origin: 'local' })
  return parseNdjson(serializeProject(doc)).records
}

describe('projectIdOfRecords', () => {
  it('reads the id from the state line a project made here carries', () => {
    expect(projectIdOfRecords(projectRecords())).toBe('senderproject0001')
  })

  it('is null for a legacy project with no state line, and for an empty project', () => {
    expect(projectIdOfRecords([cube])).toBeNull()
    expect(projectIdOfRecords([])).toBeNull()
  })

  it('is null for a state line without a merge section, or with a malformed one', () => {
    expect(projectIdOfRecords([cube, { warpcad: 'project-state', version: 1 }])).toBeNull()
    expect(projectIdOfRecords([cube, { warpcad: 'project-state', version: 2, merge: null }])).toBeNull()
    expect(projectIdOfRecords([cube, { warpcad: 'project-state', version: 2, merge: { project: 42 } }])).toBeNull()
    expect(projectIdOfRecords([cube, { warpcad: 'project-state', version: 2, merge: { project: '' } }])).toBeNull()
  })
})

describe('withProjectId', () => {
  it('gives the copy the new id, and it still loads through the Open path with that id', () => {
    const records = projectRecords()
    const copy = withProjectId(records, 'recipientcopy002')
    expect(projectIdOfRecords(copy)).toBe('recipientcopy002')
    const parsed = parseProject(copy.map((record) => JSON.stringify(record)).join('\n') + '\n')
    expect(parsed.merge?.projectId).toBe('recipientcopy002')
    expect(parsed.entries.map((entry) => entry.record.id)).toEqual(['cube-1'])
  })

  it('never mutates the records it was given', () => {
    const records = projectRecords()
    const before = JSON.stringify(records)
    withProjectId(records, 'recipientcopy002')
    expect(JSON.stringify(records)).toBe(before)
  })

  it('leaves a legacy project unchanged (it has no id to replace and never mints one here)', () => {
    const records = [cube, { warpcad: 'project-state', version: 1, suppressed: [] }]
    expect(withProjectId(records, 'recipientcopy002')).toEqual(records)
  })
})

describe('shareFileName', () => {
  it('makes a readable project file name from a title', () => {
    expect(shareFileName('Phone stand')).toBe('Phone stand.ndjson')
  })

  it('replaces path separators, reserved and control characters, and leading dots (hostile titles)', () => {
    expect(shareFileName('../../etc/passwd')).toBe('etc-passwd.ndjson')
    expect(shareFileName('a\\b:c*d?"e<f>g|h')).toBe('a-b-c-d-e-f-g-h.ndjson')
    expect(shareFileName('line\nbreak\u0000')).toBe('line-break-.ndjson')
    expect(shareFileName('.hidden')).toBe('hidden.ndjson')
  })

  it('cuts a very long title and falls back when nothing is left', () => {
    expect(shareFileName('x'.repeat(10_000))).toBe(`${'x'.repeat(80)}.ndjson`)
    expect(shareFileName('   ')).toBe('warpcad-project.ndjson')
    expect(shareFileName('///')).toBe('warpcad-project.ndjson')
  })

  it('keeps emoji and right-to-left text', () => {
    expect(shareFileName('Stand 📱')).toBe('Stand 📱.ndjson')
    expect(shareFileName('حامل الهاتف')).toBe('حامل الهاتف.ndjson')
  })
})
