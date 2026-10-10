// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'
import { useSplitSheetStore } from './splitSheet.js'

/**
 * The Split sheet's state and rules (`TODO/io-007`): what it opens with, the record Apply
 * writes, and what stays on screen when the kernel refuses. Real kernel, real document store —
 * nothing here is a boundary that needs faking.
 */

function setup() {
  setActivePinia(createPinia())
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  documentStore.append(
    { id: 'wing', op: 'primitive.cuboid', name: 'Wing', params: { size: [300, 40, 12], center: [150, 0, 6] } },
    { origin: 'local' }
  )
  selection.select('wing')
  return { documentStore, selection, sheet: useSplitSheetStore() }
}

describe('Split sheet', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('opens on the selected body, cutting across its longest axis at the middle', () => {
    const { sheet } = setup()
    expect(sheet.open()).toBe(true)
    expect(sheet.isOpen).toBe(true)
    expect(sheet.bodyId).toBe('wing')
    expect(sheet.axis).toBe('x')
    expect(sheet.offsetMm).toBeCloseTo(150, 9)
    expect(sheet.joint).toBe('pins')
    expect(sheet.clearanceMm).toBeCloseTo(0.2, 9)
    expect(sheet.cutMm).toBeCloseTo(150, 9)
    expect(sheet.extent).toEqual({ minMm: 0, maxMm: 300 })
  })

  it('will not open without exactly one body selected', () => {
    const { sheet, selection } = setup()
    selection.clear()
    expect(sheet.open()).toBe(false)
    expect(sheet.isOpen).toBe(false)
  })

  it('Apply writes one supersedes record naming the parts after the body, and keeps it selected', () => {
    const { sheet, documentStore, selection } = setup()
    sheet.open()
    sheet.joint = 'tongue'
    expect(sheet.apply()).toBe(true)
    const record = documentStore.raw.records.at(-1)
    expect(record).toMatchObject({
      op: 'modify.splitWithJoint',
      target: 'wing',
      supersedes: 'wing',
      params: { axis: 'x', offsetMm: 150, joint: 'tongue', clearanceMm: 0.2, names: ['Wing A', 'Wing B'] },
    })
    expect(record?.name).toBeUndefined()
    expect(sheet.isOpen).toBe(false)
    expect(selection.ids).toEqual(['wing'])
    const body = documentStore.bodies.find((candidate) => candidate.id === 'wing')
    expect(body?.partNames).toEqual(['Wing A', 'Wing B'])
  })

  it('a second split keeps the crossed part’s name and gives the new piece the next letter', () => {
    const { sheet, documentStore } = setup()
    sheet.open()
    sheet.joint = 'none'
    sheet.apply()
    sheet.open()
    sheet.joint = 'none'
    sheet.offsetMm = 225
    expect(sheet.apply()).toBe(true)
    const body = documentStore.bodies.find((candidate) => candidate.id === 'wing')
    expect(body?.partNames).toEqual(['Wing A', 'Wing B', 'Wing C'])
  })

  it('a refusal stays in the sheet, by name, and nothing is written', () => {
    const { sheet, documentStore } = setup()
    sheet.open()
    const before = documentStore.raw.records.length
    sheet.offsetMm = 400
    expect(sheet.canApply).toBe(false)
    expect(sheet.problem).toMatch(/outside the body/)
    expect(sheet.apply()).toBe(false)
    expect(documentStore.raw.records.length).toBe(before)
    expect(sheet.isOpen).toBe(true)
  })

  it('zero clearance warns but still applies', () => {
    const { sheet } = setup()
    sheet.open()
    sheet.clearanceMm = 0
    expect(sheet.warnings).toEqual([expect.stringMatching(/[Zz]ero clearance/)])
    expect(sheet.canApply).toBe(true)
  })

  it('previews each piece’s fit against the project build volume before Apply', () => {
    const { sheet } = setup()
    sheet.open()
    expect(sheet.pieceFits.map((piece) => piece.verdict)).toEqual(['fits', 'fits'])
    sheet.offsetMm = 20
    expect(sheet.pieceFits[1].verdict).toBe('too-large')
  })
})
