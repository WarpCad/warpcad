// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('Split sheet — Place connectors (TODO/ui-067)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  async function manualSheet() {
    const made = setup()
    made.sheet.open()
    await made.sheet.setManual(true)
    return made
  }

  it('is off by default, and Apply writes today’s joint record', () => {
    const { sheet, documentStore } = setup()
    sheet.open()
    expect(sheet.manual).toBe(false)
    expect(sheet.apply()).toBe(true)
    expect(documentStore.raw.records.at(-1)?.params).toMatchObject({ joint: 'pins' })
    expect(documentStore.raw.records.at(-1)?.params?.placements).toBeUndefined()
  })

  it('turning it on starts from what the automatic search found, not from nothing', async () => {
    const { sheet } = await manualSheet()
    expect(sheet.manual).toBe(true)
    expect(sheet.markers.length).toBeGreaterThanOrEqual(1)
    expect(sheet.markers.every((marker) => marker.kind === 'pins')).toBe(true)
    // The 40 × 12 face is narrower than the pin search's best-case spread; the markers are on it.
    for (const marker of sheet.markers) {
      expect(Math.abs(marker.uMm)).toBeLessThanOrEqual(20)
      expect(Math.abs(marker.vMm - 6)).toBeLessThanOrEqual(6)
    }
    await sheet.settled()
    expect(sheet.canApply).toBe(true)
  })

  it('adds a marker of the picked kind where it fits, and the record carries it as a placement', async () => {
    const { sheet, documentStore } = await manualSheet()
    // Clear the seeded posts so the wedge has the middle of the face to itself.
    for (const marker of [...sheet.markers]) sheet.removeMarker(marker.id)
    const before = sheet.markers.length
    await sheet.chooseKind('wedge')
    expect(await sheet.addMarker(-12, 6)).toBe(true)
    expect(sheet.markers).toHaveLength(before + 1)
    expect(sheet.markers.at(-1)).toMatchObject({ kind: 'wedge', uMm: -12, vMm: 6 })
    expect(sheet.selectedMarkerId).toBe(sheet.markers.at(-1)?.id)
    await sheet.settled()
    expect(sheet.apply()).toBe(true)
    const params = documentStore.raw.records.at(-1)?.params
    expect(params?.joint).toBeUndefined()
    expect(params?.placements).toHaveLength(before + 1)
    expect(params?.placements.at(-1)).toEqual({ kind: 'wedge', uMm: -12, vMm: 6 })
  })

  it('refuses a drop off the material with the kernel’s reason, and the list does not change', async () => {
    const { sheet } = await manualSheet()
    const before = JSON.stringify(sheet.markers)
    expect(await sheet.addMarker(19.9, 6)).toBe(false)
    expect(sheet.notice).toMatch(/placement \d+ \(pins at y = 19\.9, z = 6 mm\)/)
    expect(JSON.stringify(sheet.markers)).toBe(before)
  })

  it('a drag to an invalid position reverts without mutating the committed list; a valid one moves it', async () => {
    const { sheet } = await manualSheet()
    const marker = sheet.markers[0]
    const before = JSON.stringify(sheet.markers)
    sheet.dragMarker(marker.id, 19.9, 6)
    expect(sheet.drag).toMatchObject({ id: marker.id, uMm: 19.9, ok: null })
    expect(await sheet.moveMarker(marker.id, 19.9, 6)).toBe(false)
    expect(sheet.drag).toBeNull()
    expect(JSON.stringify(sheet.markers)).toBe(before)
    expect(sheet.notice).not.toBe('')
    expect(await sheet.moveMarker(marker.id, 6, 6)).toBe(true)
    expect(sheet.markers[0]).toMatchObject({ id: marker.id, uMm: 6, vMm: 6 })
    expect(sheet.notice).toBe('')
  })

  it('live drag reports fit or the reason while the committed list stays put', async () => {
    const { sheet } = await manualSheet()
    const marker = sheet.markers[0]
    sheet.dragMarker(marker.id, 19.9, 6)
    await vi.waitFor(() => expect(sheet.drag?.ok).toBe(false))
    expect(sheet.drag?.reason).toMatch(/placement 1/)
    expect(sheet.markers[0].uMm).toBe(marker.uMm)
  })

  it('switching a selected marker’s kind keeps its position; a kind that does not fit is refused', async () => {
    const { sheet } = await manualSheet()
    const marker = sheet.markers[0]
    // Out at the rim a screw boss's wall would break out of piece B: refused, kind unchanged.
    sheet.selectMarker(marker.id)
    expect(await sheet.chooseKind('screwBoss')).toBe(false)
    expect(sheet.notice).toMatch(/placement 1 \(screwBoss at/)
    expect(sheet.markers[0].kind).toBe('pins')
    // Moved onto the middle of the face, the same switch fits and keeps the position.
    expect(await sheet.moveMarker(marker.id, 0, 6)).toBe(true)
    expect(await sheet.chooseKind('screwBoss')).toBe(true)
    expect(sheet.markers[0]).toMatchObject({ id: marker.id, kind: 'screwBoss', uMm: 0, vMm: 6 })
  })

  it('removing the last marker leaves Apply disabled with a reason', async () => {
    const { sheet } = await manualSheet()
    for (const marker of [...sheet.markers]) sheet.removeMarker(marker.id)
    expect(sheet.canApply).toBe(false)
    expect(sheet.problem).toMatch(/at least one/)
  })

  it('turning it back off returns to the automatic joint', async () => {
    const { sheet, documentStore } = await manualSheet()
    await sheet.setManual(false)
    expect(sheet.manual).toBe(false)
    expect(sheet.markers).toEqual([])
    expect(sheet.apply()).toBe(true)
    expect(documentStore.raw.records.at(-1)?.params?.joint).toBe('pins')
  })

  it('a screw boss whose bore would leave piece A before its far face is refused by name and position, not clipped', async () => {
    const made = setup()
    made.documentStore.append(
      { id: 'step', op: 'primitive.cuboid', name: 'Step', params: { size: [200, 20, 20], center: [600, 0, 0] } },
      { origin: 'local' }
    )
    made.documentStore.append(
      { id: 'plate', op: 'primitive.cuboid', name: 'Plate', params: { size: [101, 20, 4], center: [450.5, 0, 0] } },
      { origin: 'local' }
    )
    made.documentStore.append(
      { id: 'stepped', op: 'boolean.union', target: 'step', operands: ['plate'], name: 'Stepped' },
      { origin: 'local' }
    )
    made.selection.select('stepped')
    made.sheet.open()
    made.sheet.offsetMm = 150
    await made.sheet.setManual(true)
    for (const marker of [...made.sheet.markers]) made.sheet.removeMarker(marker.id)
    await made.sheet.chooseKind('screwBoss')
    expect(await made.sheet.addMarker(0, 4)).toBe(false)
    expect(made.sheet.notice).toMatch(/placement 1 \(screwBoss at y = 0, z = 4 mm\).*screw bore.*piece A/)
    expect(made.sheet.markers).toEqual([])
  })
})
