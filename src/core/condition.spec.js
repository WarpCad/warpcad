// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { conditionContextOf, describeCondition, evaluateCondition } from './condition.js'

/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

/**
 * @param {OpRecord[]} records
 * @returns {import('./document.js').DocumentEntry[]}
 */
function entriesOf(records) {
  return records.map((record) => ({ record, origin: 'local' }))
}

/** @param {any} model */
const pi = (model) => ({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model } })

/** @param {any[]} values */
const onPi = (values) => ({ ref: 'pi-1', param: 'model', in: values })

const cube = { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [6, 6, 6] } }

/**
 * @param {OpRecord[]} records
 * @param {any} when
 */
function verdict(records, when) {
  const entries = entriesOf(records)
  return evaluateCondition(when, conditionContextOf(entries, entries.length))
}

describe('evaluateCondition — one enum param, membership only (TODO/ui-052)', () => {
  it('`in: [4]` is active on a Pi 4 and inactive on a Pi 5', () => {
    expect(verdict([pi(4), cube], onPi([4])).state).toBe('active')
    expect(verdict([pi(5), cube], onPi([4])).state).toBe('inactive')
  })

  it('`in: [3, 4]` is active on either, and inactive on a Pi 5', () => {
    expect(verdict([pi(3), cube], onPi([3, 4])).state).toBe('active')
    expect(verdict([pi(4), cube], onPi([3, 4])).state).toBe('active')
    expect(verdict([pi(5), cube], onPi([3, 4])).state).toBe('inactive')
  })

  it('reads the ref from the log, so a ref placed *after* the conditioned record still evaluates', () => {
    // Deliberate deviation from the task's ordering rule, stated in its retirement note: a
    // condition reads a *param*, which no condition can change, so a cycle is impossible
    // either way — and "drop the enclosure, then the Pi" is an ordinary order that the
    // ordering rule would have made un-conditionable on the whole body.
    expect(verdict([cube, pi(5)], onPi([4])).state).toBe('inactive')
    expect(verdict([cube, pi(4)], onPi([4])).state).toBe('active')
  })

  it('a deleted ref is reported by name — never read as true or false', () => {
    const tombstone = { id: 'pi-1-delete', op: 'body.delete', target: 'pi-1', supersedes: 'pi-1' }
    const result = verdict([pi(4), cube, tombstone], onPi([4]))
    expect(result.state).toBe('invalid')
    expect(result.reason).toMatch(/Raspberry Pi 1/)
    expect(result.reason).toMatch(/deleted/)
  })

  it('a ref that is not in the document at all is reported by its id', () => {
    const result = verdict([cube], onPi([4]))
    expect(result.state).toBe('invalid')
    expect(result.reason).toMatch(/pi-1/)
  })

  it('a suppressed ref counts as absent', () => {
    const entries = entriesOf([pi(4), cube])
    entries[0] = { ...entries[0], suppressed: true }
    const result = evaluateCondition(onPi([4]), conditionContextOf(entries, entries.length))
    expect(result.state).toBe('invalid')
  })

  it('a param the ref\'s op does not have is reported by name', () => {
    const result = verdict([pi(4), cube], { ref: 'pi-1', param: 'spec', in: ['m10 hex'] })
    expect(result.state).toBe('invalid')
    expect(result.reason).toMatch(/spec/)
  })

  it('a current value no longer in the schema is reported, naming it', () => {
    const result = verdict([pi(7), cube], onPi([4]))
    expect(result.state).toBe('invalid')
    expect(result.reason).toMatch(/7/)
  })

  it('an `in` value that is not in the schema is reported, naming it', () => {
    const result = verdict([pi(4), cube], onPi([4, 9]))
    expect(result.state).toBe('invalid')
    expect(result.reason).toMatch(/9/)
  })

  it('a condition on a number param is refused — enum params only', () => {
    const result = verdict([pi(4), cube], { ref: 'pi-1', param: 'clearance', in: [5] })
    expect(result.state).toBe('invalid')
    expect(result.reason).toMatch(/choice/)
  })

  it('a malformed condition is reported rather than guessed at', () => {
    for (const bad of [null, {}, { ref: 'pi-1', param: 'model' }, { ref: 'pi-1', param: 'model', in: [] }, { ref: 3, param: 'model', in: [4] }]) {
      expect(verdict([pi(4), cube], bad).state).toBe('invalid')
    }
  })
})

describe('describeCondition — the words the chip and the Inspector use', () => {
  it('names the body, the param label and the option labels', () => {
    const entries = entriesOf([pi(5), cube])
    const text = describeCondition(onPi([4]), conditionContextOf(entries, entries.length))
    expect(text.sentence).toBe("Only when Raspberry Pi 1's Model is Pi 4")
    expect(text.chip).toBe('if Raspberry Pi 1 = Pi 4')
  })

  it('joins several values with "or"', () => {
    const entries = entriesOf([pi(5), cube])
    const text = describeCondition(onPi([3, 4]), conditionContextOf(entries, entries.length))
    expect(text.sentence).toBe("Only when Raspberry Pi 1's Model is Pi 3 or Pi 4")
    expect(text.chip).toBe('if Raspberry Pi 1 = Pi 3 or Pi 4')
  })
})

describe('`{ var, in }` — a condition that reads a project variable (TODO/core-050)', () => {
  const piModel = {
    id: 'var-1',
    op: 'var.define',
    params: { name: 'piModel', kind: 'enum', value: 4, label: 'Pi model', options: [{ value: 4, label: 'Pi 4' }, { value: 5, label: 'Pi 5' }] },
  }
  const fan = { id: 'var-2', op: 'var.define', params: { name: 'fan', kind: 'boolean', value: false } }
  const wall = { id: 'var-3', op: 'var.define', params: { name: 'wall', kind: 'number', value: 2, unit: 'mm' } }

  it('is active while the variable holds one of `in`, inactive otherwise', () => {
    expect(verdict([piModel, cube], { var: 'piModel', in: [4] }).state).toBe('active')
    expect(verdict([piModel, cube], { var: 'piModel', in: [5] }).state).toBe('inactive')
    expect(verdict([fan, cube], { var: 'fan', in: [true] }).state).toBe('inactive')
    expect(verdict([fan, cube], { var: 'fan', in: [false] }).state).toBe('active')
  })

  it('reads the variable from the log, wherever it is defined', () => {
    expect(verdict([cube, piModel], { var: 'piModel', in: [4] }).state).toBe('active')
  })

  it('is invalid, by name, for a missing variable, a number variable, or a value it does not offer', () => {
    const missing = verdict([cube], { var: 'piModel', in: [4] })
    expect(missing.state).toBe('invalid')
    expect(missing.reason).toMatch(/piModel/)
    const number = verdict([wall, cube], { var: 'wall', in: [2] })
    expect(number.state).toBe('invalid')
    expect(number.reason).toMatch(/choice/)
    const stranger = verdict([piModel, cube], { var: 'piModel', in: [9] })
    expect(stranger.state).toBe('invalid')
    expect(stranger.reason).toMatch(/9/)
  })

  it('refuses a condition that mixes the two forms, or names no variable', () => {
    for (const bad of [{ var: 'piModel', ref: 'pi-1', param: 'model', in: [4] }, { var: '', in: [4] }, { var: 'piModel', in: [] }]) {
      expect(verdict([piModel, cube], bad).state).toBe('invalid')
    }
  })

  it('a ref condition still works when the body reads its param from a variable', () => {
    const bound = { ...pi({ $var: 'piModel' }) }
    expect(verdict([piModel, bound, cube], onPi([4])).state).toBe('active')
    expect(verdict([piModel, bound, cube], onPi([5])).state).toBe('inactive')
  })

  it('describes itself with the variable\'s label and option labels', () => {
    const entries = entriesOf([piModel, cube])
    const text = describeCondition(/** @type {any} */ ({ var: 'piModel', in: [4] }), conditionContextOf(entries, entries.length))
    expect(text.sentence).toBe('Only when Pi model is Pi 4')
    expect(text.chip).toBe('if piModel = Pi 4')
  })
})
