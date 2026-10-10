// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { definePartFromSelection } from './library.js'
import { PART_FILE_FORMAT, parsePartFile, partFileName, serializePartFile } from './userPartFile.js'
import { resetUserParts } from './userPart.js'

/**
 * `TODO/ui-055` — the part file behind Export part file / Import part file…: plain JSON,
 * validated on the way in exactly as a part from a project file is.
 */

const LOCAL = { origin: 'local' }
afterEach(() => resetUserParts())

function standoff() {
  const doc = createDocument()
  doc.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } }, LOCAL)
  doc.append({ id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { height: 20, diameter: 6, center: [8, 0, 10] } }, LOCAL)
  doc.append(
    { id: 'group-1', op: 'group.assemble', name: 'Group 1', target: 'cube-1', operands: ['cyl-1'], consumes: ['cube-1', 'cyl-1'], params: { names: ['Cube 1', 'Cylinder 1'] } },
    LOCAL
  )
  return definePartFromSelection(doc, 'group-1', { name: 'Standoff' })
}

describe('serializePartFile / parsePartFile', () => {
  it('round-trips a part exactly, with its format marker', () => {
    const part = standoff()
    const text = serializePartFile([part])
    expect(JSON.parse(text).format).toBe(PART_FILE_FORMAT)
    const parsed = parsePartFile(text)
    expect(parsed.problems).toEqual([])
    expect(parsed.parts).toEqual([part])
  })

  it('carries a thumbnail along when it is a small PNG data URL, and drops anything else', () => {
    const part = standoff()
    const png = 'data:image/png;base64,iVBORw0KGgo='
    const ok = parsePartFile(serializePartFile([part], { [part.op]: png }))
    expect(ok.thumbnails[part.op]).toBe(png)
    const hostile = parsePartFile(serializePartFile([part], { [part.op]: 'javascript:alert(1)' }))
    expect(hostile.parts).toHaveLength(1)
    expect(hostile.thumbnails[part.op]).toBeUndefined()
  })

  it('names the problem for text that is not JSON, not a part file, or has the wrong version', () => {
    expect(parsePartFile('{nope').problems[0].reason).toMatch(/not valid JSON/i)
    expect(parsePartFile('[]').problems[0].reason).toMatch(/part file/i)
    expect(parsePartFile(JSON.stringify({ format: 'something-else', parts: [] })).problems[0].reason).toMatch(/part file/i)
    expect(parsePartFile(JSON.stringify({ format: PART_FILE_FORMAT, version: 99, parts: [] })).problems[0].reason).toMatch(/newer|version/i)
  })

  it('validates every part as a project file would: a bad one is reported, the good one still loads', () => {
    const good = standoff()
    const bad = { ...good, op: 'user.evil', name: 'Evil', records: [{ id: 'r1', op: 'library.define', params: {} }], result: 'r1' }
    const parsed = parsePartFile(JSON.stringify({ format: PART_FILE_FORMAT, version: 1, parts: [good, bad] }))
    expect(parsed.parts.map((part) => part.op)).toEqual([good.op])
    expect(parsed.problems).toHaveLength(1)
    expect(parsed.problems[0].op).toBe('user.evil')
  })

  it('refuses a file with too many parts, or an oversized one, without parsing it', () => {
    const many = JSON.stringify({ format: PART_FILE_FORMAT, version: 1, parts: Array.from({ length: 65 }, () => ({})) })
    expect(parsePartFile(many).problems[0].reason).toMatch(/64/)
    expect(parsePartFile(' '.repeat(9_000_000)).problems[0].reason).toMatch(/too large/i)
  })
})

describe('partFileName', () => {
  it('is the part’s slug with a .warpcad-part.json suffix', () => {
    expect(partFileName('user.standoff')).toBe('standoff.warpcad-part.json')
    expect(partFileName('user.m3-bracket')).toBe('m3-bracket.warpcad-part.json')
  })
})
