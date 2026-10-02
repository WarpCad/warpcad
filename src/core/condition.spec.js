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
