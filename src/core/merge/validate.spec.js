// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { MERGE_LIMITS, MergeSectionError, readMergeSection } from './validate.js'
import { LEGACY_STAMP } from './state.js'
import { keysBetween } from './positionKey.js'

/**
 * `TODO/data-011`: the merge section is untrusted data from whoever wrote the file. One case
 * per hostile shape — each is refused by name (a {@link MergeSectionError} naming the field),
 * quickly, and never throws anything else.
 */

const IDS = new Set(['op-aaaaaa-1', 'op-aaaaaa-2'])
const STAMP = [12, 'k3f5xa']
const KEY = keysBetween(null, null, 1, { counter: 0, replica: 'legacy' })[0]

/** @param {unknown} section */
const read = (section) => readMergeSection(section, IDS)

/**
 * @param {unknown} section
 * @param {RegExp} message
 */
function refused(section, message) {
  const started = performance.now()
  let error
  try {
    read(section)
  } catch (caught) {
    error = caught
  }
  expect(error).toBeInstanceOf(MergeSectionError)
  expect(/** @type {Error} */ (error).message).toMatch(message)
  expect(performance.now() - started).toBeLessThan(1000)
}

describe('readMergeSection', () => {
  it('reads a well-formed section into an overlay', () => {
    const overlay = read({
      project: 'p-7hq2md',
      clock: 41,
      pos: { 'op-aaaaaa-1': KEY },
      stamps: { 'op-aaaaaa-1': { born: STAMP, rec: [30, 'm42c2z'] } },
      dead: { 'op-gone-1': [41, 'k3f5xa'] },
      registers: { rollbackAfter: [40, 'k3f5xa'] },
      partStamps: { 'user.x': [3, 'k3f5xa'] },
    })
    expect(overlay.projectId).toBe('p-7hq2md')
    expect(overlay.highest).toBe(41)
    expect(overlay.pos.get('op-aaaaaa-1')).toBe(KEY)
    expect(overlay.stamps.get('op-aaaaaa-1')?.rec).toEqual({ counter: 30, replica: 'm42c2z' })
    expect(overlay.dead.get('op-gone-1')).toEqual({ counter: 41, replica: 'k3f5xa' })
    expect(overlay.registers.rollbackAfter).toEqual({ counter: 40, replica: 'k3f5xa' })
  })

  it('reads the legacy stamp as the legacy stamp', () => {
    const overlay = read({ stamps: { 'op-aaaaaa-1': { pos: [0, 'legacy'] } } })
    expect(overlay.stamps.get('op-aaaaaa-1')?.pos).toBe(LEGACY_STAMP)
  })

  it('refuses a counter of 9e15, which would win every merge', () => {
    refused({ stamps: { 'op-aaaaaa-1': { born: [9e15, 'k3f5xa'] } } }, /counter above/)
    refused({ clock: 9e15 }, /clock/)
    refused({ dead: { x: [2 ** 40 + 1, 'k3f5xa'] } }, /counter above/)
  })

  it('refuses a negative or fractional counter', () => {
    refused({ stamps: { 'op-aaaaaa-1': { born: [-1, 'k3f5xa'] } } }, /counter/)
    refused({ stamps: { 'op-aaaaaa-1': { born: [1.5, 'k3f5xa'] } } }, /counter/)
    refused({ clock: -3 }, /clock/)
    refused({ clock: 0.5 }, /clock/)
  })

  it('refuses a replica id that is not six characters of a-z2-7', () => {
    refused({ dead: { x: [1, '__proto__'] } }, /replica/)
    refused({ dead: { x: [1, 'ABCDEF'] } }, /replica/)
    refused({ dead: { x: [1, 'abc'] } }, /replica/)
    refused({ dead: { x: [1, 'legacy'] } }, /legacy/)
  })

  it('refuses a 10 MB position key without scanning it', () => {
    refused({ pos: { 'op-aaaaaa-1': 'a'.repeat(10 * 1024 * 1024) } }, /position key|larger/)
    refused({ pos: { 'op-aaaaaa-1': 'a'.repeat(300) } }, /position key/)
  })

  it('refuses a position key that does not parse', () => {
    refused({ pos: { 'op-aaaaaa-1': 'not a key' } }, /position key/)
    refused({ pos: { 'op-aaaaaa-1': 7 } }, /position key/)
  })

  it('refuses a pos or stamps entry naming no record', () => {
    refused({ pos: { ghost: KEY } }, /not a record/)
    refused({ stamps: { ghost: { born: STAMP } } }, /not a record/)
  })

  it('accepts a tombstone for an id that is not a record (a deleted row)', () => {
    expect(read({ dead: { 'op-gone-1': STAMP } }).dead.size).toBe(1)
  })

  it('accepts a tombstone for a row whose stamp is newer (a revived row)', () => {
    const overlay = read({ stamps: { 'op-aaaaaa-1': { born: [50, 'k3f5xa'] } }, dead: { 'op-aaaaaa-1': [41, 'k3f5xa'] } })
    expect(overlay.dead.has('op-aaaaaa-1')).toBe(true)
  })

  it('refuses more tombstones than the cap, without serialising them', () => {
    /** @type {Record<string, unknown>} */
    const dead = {}
    for (let i = 0; i < 1_000_000; i += 1) dead[`op-${i}`] = [1, 'k3f5xa']
    refused({ dead }, /tombstones/)
    expect(MERGE_LIMITS.maxTombstones).toBe(100_000)
  })

  it('refuses a stamp that is an object, not a pair', () => {
    refused({ stamps: { 'op-aaaaaa-1': { born: { counter: 1, replica: 'k3f5xa' } } } }, /stamp/)
    refused({ dead: { x: { counter: 1, replica: 'k3f5xa' } } }, /stamp/)
    refused({ stamps: { 'op-aaaaaa-1': 'born' } }, /object/)
  })

  it('refuses a section that is an array, null or text', () => {
    refused([], /object/)
    refused(null, /object/)
    refused('merge', /object/)
    refused({ pos: [] }, /map/)
    refused({ dead: 'x' }, /map/)
  })

  it('refuses a register it does not know, and a bad project id', () => {
    refused({ registers: { constructor: STAMP } }, /register/)
    refused({ project: 'A B' }, /project/)
    refused({ project: 7 }, /project/)
  })

  it('refuses a section over the size bound', () => {
    const big = 'x'.repeat(MERGE_LIMITS.maxBytes)
    refused({ partStamps: { [big]: STAMP } }, /part|larger/)
  })

  it('never throws anything but MergeSectionError for odd input', () => {
    for (const odd of [undefined, 0, true, { stamps: null }, { stamps: { 'op-aaaaaa-1': null } }, { clock: 'x' }, { pos: { 'op-aaaaaa-1': null } }]) {
      try {
        read(odd)
      } catch (error) {
        expect(error).toBeInstanceOf(MergeSectionError)
      }
    }
  })
})
