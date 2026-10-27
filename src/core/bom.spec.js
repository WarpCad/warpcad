// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { hardwareOf } from './kernel/group.js'
import { splitWithJoint } from './kernel/split.js'

import { tallyBom } from './bom.js'

/** @param {string} op @param {Record<string, any>} params */
const body = (op, params = {}) => ({ op, params })

describe('tallyBom', () => {
  it('collapses three bolts of one spec and length into one row with count 3', () => {
    const rows = tallyBom([
      body('hardware.bolt', { spec: 'm4', length: 12, fit: 'loose' }),
      body('hardware.bolt', { spec: 'm4', length: 12, fit: 'tight' }),
      body('hardware.bolt', { spec: 'm4', length: 12, fit: 'loose' }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: 'Bolt / screw', detail: 'M4 × 12 mm', count: 3 })
  })

  it('splits differing specs and lengths into separate rows', () => {
    const rows = tallyBom([
      body('hardware.bolt', { spec: 'm4', length: 12 }),
      body('hardware.bolt', { spec: 'm4', length: 20 }),
      body('hardware.washer', { spec: 'm6', fit: 'loose' }),
    ])
    expect(rows.map((row) => `${row.label} ${row.detail} ${row.count}`)).toEqual([
      'Bolt / screw M4 × 12 mm 1',
      'Bolt / screw M4 × 20 mm 1',
      'Washer M6 1',
    ])
  })

  it('excludes plain primitives and any other non-hardware body', () => {
    expect(
      tallyBom([body('primitive.cuboid', { size: [1, 1, 1] }), body('text.label', { text: 'x' })]),
    ).toEqual([])
  })

  it('derives a screw key from head, spec and length', () => {
    const rows = tallyBom([body('hardware.screw', { head: 'PanHead', spec: 'm4', length: 8 })])
    expect(rows[0]).toMatchObject({ label: 'Screw', detail: 'M4 PanHead × 8 mm', count: 1 })
  })

  it('tallies kit parts and Pi boards by their identifying params', () => {
    const rows = tallyBom([
      body('kit.board', { width: 40, height: 30, cornerRadius: 3 }),
      body('raspberrypi.bplus', { model: '4' }),
      body('raspberrypi.hat', {}),
    ])
    expect(rows.map((row) => row.label)).toEqual(['Board', 'Raspberry Pi', 'HAT'])
    expect(rows.find((row) => row.op === 'raspberrypi.bplus')?.detail).toBe('Model 4')
    expect(rows.find((row) => row.op === 'kit.board')?.detail).toBe('40 × 30 mm')
    expect(rows.find((row) => row.op === 'raspberrypi.hat')?.detail).toBe('')
  })

  it('returns an empty list for no bodies, and tolerates a body with no params', () => {
    expect(tallyBom([])).toEqual([])
    expect(tallyBom([{ op: 'hardware.nut' }])[0]).toMatchObject({ count: 1, detail: '' })
  })

  describe('one fastener row (TODO/core-060)', () => {
    it('labels every hardware.bolt "Bolt / screw" and names the type in the detail', () => {
      const rows = tallyBom([
        body('hardware.bolt', { type: 'socket', spec: 'm2.5', length: 8, fit: 'loose' }),
        body('hardware.bolt', { type: 'flat', spec: 'm3', length: 10, fit: 'close' }),
        body('hardware.bolt', { type: 'woodFlat', spec: '#8', length: 25, fit: 'softwood' }),
        body('hardware.bolt', { type: 'woodPan', spec: '#6', length: 12 }),
        body('hardware.bolt', { type: 'pan', spec: 'm4', length: 6 }),
      ])
      expect(rows.map((row) => `${row.label} ${row.detail} × ${row.count}`)).toEqual([
        'Bolt / screw M2.5 socket × 8 mm × 1',
        'Bolt / screw M3 flat × 10 mm × 1',
        'Bolt / screw #8 wood flat × 25 mm × 1',
        'Bolt / screw #6 wood pan × 12 mm × 1',
        'Bolt / screw M4 pan × 6 mm × 1',
      ])
    })

    it('a legacy { spec: "m2.5 socket" } and a new { type: "socket", spec: "m2.5" } of one length tally as one line', () => {
      const rows = tallyBom([
        body('hardware.bolt', { spec: 'm2.5 socket', length: 8, fit: 'loose' }),
        body('hardware.bolt', { type: 'socket', spec: 'm2.5', length: 8, fit: 'tap' }),
      ])
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ label: 'Bolt / screw', detail: 'M2.5 socket × 8 mm', count: 2 })
    })

    it('an old hardware.screw keeps its own line and label', () => {
      const rows = tallyBom([
        body('hardware.screw', { head: 'PanHead', spec: 'm4', length: 8 }),
        body('hardware.bolt', { type: 'pan', spec: 'm4', length: 8 }),
      ])
      expect(rows.map((row) => `${row.label} ${row.detail}`)).toEqual(['Screw M4 PanHead × 8 mm', 'Bolt / screw M4 pan × 8 mm'])
    })
  })
})

describe('stock dowels from a split (TODO/core-075 stage 1)', () => {
  /** @param {'steel' | 'filament'} stock */
  const splitBar = (stock) =>
    splitWithJoint(modeling.primitives.cuboid({ size: [300, 20, 20], center: [150, 0, 0] }), {
      axis: 'x',
      offsetMm: 150,
      joint: 'dowel',
      jointOptions: { stock },
      clearanceMm: 0.2,
      names: ['Bar A', 'Bar B'],
    })

  it('counts a split’s bought steel pins as one line per size, across bodies', () => {
    const hardware = hardwareOf(splitBar('steel'))
    expect(hardware.length).toBe(1)
    const [pin] = hardware
    const body = { op: 'primitive.cuboid', params: { size: [300, 20, 20] }, hardware }
    const rows = tallyBom([body, body])
    expect(rows).toEqual([
      {
        key: `stock.dowel|steel|Ø${pin.diameterMm} × ${pin.lengthMm} mm`,
        op: 'modify.splitWithJoint',
        label: 'Steel dowel pin',
        detail: `Ø${pin.diameterMm} × ${pin.lengthMm} mm`,
        count: 2 * pin.count,
      },
    ])
  })

  it('lists filament as lengths to cut, and printed dowels not at all (they are in the zip)', () => {
    const [filament] = tallyBom([{ op: 'primitive.cuboid', params: {}, hardware: hardwareOf(splitBar('filament')) }])
    expect(filament.label).toBe('1.75 mm filament')
    expect(filament.detail).toMatch(/^Ø1\.75 × [\d.]+ mm lengths$/)
    const printed = splitWithJoint(modeling.primitives.cuboid({ size: [300, 20, 20], center: [150, 0, 0] }), {
      axis: 'x',
      offsetMm: 150,
      joint: 'dowel',
      clearanceMm: 0.2,
    })
    expect(hardwareOf(printed)).toEqual([])
    expect(tallyBom([{ op: 'primitive.cuboid', params: {}, hardware: hardwareOf(printed) }])).toEqual([])
  })
})

describe('butterfly keys from a split (TODO/core-075 stage 2)', () => {
  it('need nothing bought: they are printed parts, in the Print pieces zip, not BOM lines', () => {
    const group = splitWithJoint(modeling.primitives.cuboid({ size: [300, 120, 10], center: [150, 0, 5] }), {
      axis: 'x',
      offsetMm: 150,
      joint: 'butterfly',
      jointOptions: { side: 'v+', depthMm: 5 },
      clearanceMm: 0.2,
      names: ['Plank A', 'Plank B'],
    })
    expect(hardwareOf(group)).toEqual([])
    const rows = tallyBom([{ op: 'primitive.cuboid', params: { size: [300, 120, 10] }, hardware: hardwareOf(group) }])
    expect(rows.filter((row) => row.key.startsWith('stock.'))).toEqual([])
  })
})
