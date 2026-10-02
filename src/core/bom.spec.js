// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

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
    expect(rows[0]).toMatchObject({ label: 'Bolt', detail: 'M4 × 12 mm', count: 3 })
  })

  it('splits differing specs and lengths into separate rows', () => {
    const rows = tallyBom([
      body('hardware.bolt', { spec: 'm4', length: 12 }),
      body('hardware.bolt', { spec: 'm4', length: 20 }),
      body('hardware.washer', { spec: 'm6', fit: 'loose' }),
    ])
    expect(rows.map((row) => `${row.label} ${row.detail} ${row.count}`)).toEqual([
      'Bolt M4 × 12 mm 1',
      'Bolt M4 × 20 mm 1',
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
})
