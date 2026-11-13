// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck
import { describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import { CLEARED_DATA_MESSAGE } from '../storage/persistentStorage.js'
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

/** `TODO/io-028`: ask for persistent storage after a save with content; notice a cleared database. */
describe('bootStorage persistence (io-028)', () => {
  function setup({ flag = false, restoreKind = 'empty', native = false, persistResult = true } = {}) {
    const persistence = reactive({
      restoreKind: '',
      savedAt: 0,
      start: async () => {
        persistence.restoreKind = restoreKind
      },
      hasContent: () => persistence.content,
      content: false,
      reportStorageCleared: vi.fn(),
    })
    const hosted = { start: async () => {} }
    const manager = { persist: vi.fn(async () => persistResult) }
    const items = new Map(flag ? [['warpcad.savedBefore', '1']] : [])
    const flagStorage = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v) }
    return { persistence, hosted, manager, flagStorage, native }
  }

  it('does not ask at boot, nor after a save with no content', async () => {
    const t = setup()
    await bootStorage(t)
    expect(t.manager.persist).not.toHaveBeenCalled()
    t.persistence.savedAt = 1
    await nextTick()
    expect(t.manager.persist).not.toHaveBeenCalled()
  })

  it('asks exactly once, after the first save that has content, and sets the flag', async () => {
    const t = setup()
    await bootStorage(t)
    t.persistence.content = true
    t.persistence.savedAt = 1
    await nextTick()
    t.persistence.savedAt = 2
    await nextTick()
    expect(t.manager.persist).toHaveBeenCalledTimes(1)
    expect(t.flagStorage.getItem('warpcad.savedBefore')).toBe('1')
  })

  it('shows the cleared-data notice only when the flag is set and the database is empty', async () => {
    const cleared = setup({ flag: true, restoreKind: 'empty' })
    await bootStorage(cleared)
    expect(cleared.persistence.reportStorageCleared).toHaveBeenCalledWith(CLEARED_DATA_MESSAGE)
    expect(cleared.persistence.reportStorageCleared).toHaveBeenCalledTimes(1)

    const fresh = setup({ flag: false, restoreKind: 'empty' })
    await bootStorage(fresh)
    expect(fresh.persistence.reportStorageCleared).not.toHaveBeenCalled()

    const found = setup({ flag: true, restoreKind: 'found' })
    await bootStorage(found)
    expect(found.persistence.reportStorageCleared).not.toHaveBeenCalled()
  })

  it('does nothing inside the native shell', async () => {
    const t = setup({ flag: true, native: true })
    await bootStorage(t)
    t.persistence.content = true
    t.persistence.savedAt = 1
    await nextTick()
    expect(t.manager.persist).not.toHaveBeenCalled()
    expect(t.persistence.reportStorageCleared).not.toHaveBeenCalled()
  })

  it('a restored session counts as a save with content', async () => {
    const t = setup({ restoreKind: 'found' })
    await bootStorage(t)
    expect(t.manager.persist).toHaveBeenCalledTimes(1)
  })
})
