// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck
import { describe, expect, it, vi } from 'vitest'

import { bootStorage } from './useStorageBoot.js'

/**
 * `TODO/ui-033`, carried-forward flag 1: `io-002` deliberately did NOT call `hosted.start()`,
 * so a restored connection with auto-push on could never push. Booting it is this task's job,
 * and it must happen AFTER the local restore has landed — §11 rule 3 decides "is the restored
 * document ahead of what was last pushed?" by hashing the document, which is the empty scene
 * until the restore finishes.
 */
describe('bootStorage', () => {
  it('restores the local session first, then starts the hosted connection', async () => {
    const order = []
    let releaseRestore
    const persistence = {
      start: () =>
        new Promise((resolve) => {
          order.push('persistence:start')
          releaseRestore = () => {
            order.push('persistence:restored')
            resolve()
          }
        }),
    }
    const hosted = { start: vi.fn(async () => order.push('hosted:start')) }

    const booting = bootStorage({ persistence, hosted })
    await Promise.resolve()
    expect(hosted.start).not.toHaveBeenCalled() // not before the restore
    releaseRestore()
    await booting
    expect(order).toEqual(['persistence:start', 'persistence:restored', 'hosted:start'])
  })

  it('still starts the hosted connection when the local restore fails', async () => {
    const persistence = { start: vi.fn(async () => { throw new Error('IndexedDB blocked') }) }
    const hosted = { start: vi.fn(async () => {}) }
    await bootStorage({ persistence, hosted })
    expect(hosted.start).toHaveBeenCalledTimes(1)
  })

  it('never rejects, so a broken credential store cannot break first paint', async () => {
    const persistence = { start: async () => {} }
    const hosted = { start: vi.fn(async () => { throw new Error('credential store blocked') }) }
    await expect(bootStorage({ persistence, hosted })).resolves.toBeUndefined()
  })
})
