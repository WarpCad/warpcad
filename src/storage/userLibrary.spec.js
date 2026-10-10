// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — drives a hand-written duck-typed fake of `idb`'s `openDB`, as indexeddb.spec.js
// does; the module under test is fully typed and checked by `npm run typecheck`.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { effectiveUserPart, resetUserParts } from '../core/userPart.js'
import { PARTS_DB_NAME, PARTS_STORE, createUserLibrary, loadUserLibrary } from './userLibrary.js'

/**
 * `TODO/core-037` — the user's local part library, in IndexedDB.
 *
 * Mocked at the boundary: `idb`'s `openDB` is injected, and the fake implements only the
 * slice of its surface the module may touch (`transaction(store, mode)` → `{ store, done }`
 * with `get`/`getAll`/`put`/`delete`). Real-engine behaviour belongs to the e2e matrix,
 * when `ui-055` gives the library a control to drive.
 */

function fakeOpen(initial = []) {
  /** @type {Map<string, any>} */
  const data = new Map(initial)
  const calls = { names: [], stores: [], modes: [] }
  const open = vi.fn(async (name, _version, hooks) => {
    calls.names.push(name)
    hooks?.upgrade?.({
      objectStoreNames: { contains: () => false },
      createObjectStore(store) {
        calls.stores.push(store)
      },
    })
    return {
      close() {},
      transaction(store, mode) {
        calls.modes.push([store, mode])
        return {
          store: {
            async get(key) {
              return data.get(key)
            },
            async getAll() {
              return [...data.values()]
            },
            async getAllKeys() {
              return [...data.keys()]
            },
            async put(value, key) {
              data.set(key, structuredClone(value))
            },
            async delete(key) {
              data.delete(key)
            },
          },
          done: Promise.resolve(),
        }
      },
    }
  })
  return { open, data, calls }
}

function part(overrides = {}) {
  return {
    op: 'user.bracket',
    name: 'Bracket',
    version: 1,
    result: 'r1',
    records: [{ id: 'r1', op: 'primitive.cuboid', params: { size: [10, 4, 2] } }],
    params: [],
    ...overrides,
  }
}

afterEach(() => {
  resetUserParts()
})

describe('createUserLibrary', () => {
  it('opens its own database, not the autosave one, and creates its store', async () => {
    const fake = fakeOpen()
    const library = createUserLibrary({ open: fake.open })
    await library.list()
    expect(fake.calls.names).toEqual([PARTS_DB_NAME])
    expect(PARTS_DB_NAME).not.toBe('warpcad')
    expect(fake.calls.stores).toEqual([PARTS_STORE])
  })

  it('saves a valid part keyed by its op and lists it back', async () => {
    const fake = fakeOpen()
    const library = createUserLibrary({ open: fake.open, now: () => 1234 })
    await library.save(part())
    expect([...fake.data.keys()]).toEqual(['user.bracket'])
    expect(fake.data.get('user.bracket').savedAt).toBe(1234)
    const { parts, problems } = await library.list()
    expect(problems).toEqual([])
    expect(parts.map((p) => [p.op, p.version])).toEqual([['user.bracket', 1]])
  })

  it('refuses to save an invalid part, by name, and stores nothing', async () => {
    const fake = fakeOpen()
    const library = createUserLibrary({ open: fake.open })
    await expect(library.save(part({ records: [{ id: 'r1', op: 'body.delete' }] }))).rejects.toThrow(/not allowed in a part/)
    expect(fake.data.size).toBe(0)
  })

  it('refuses to save a part that nests one the library does not have', async () => {
    const fake = fakeOpen()
    const library = createUserLibrary({ open: fake.open })
    await expect(library.save(part({ records: [{ id: 'r1', op: 'user.missing', params: {} }] }))).rejects.toThrow(/user\.missing/)
  })

  it('skips a stored entry that no longer validates, reporting it instead of throwing', async () => {
    const fake = fakeOpen([
      ['user.bracket', { definition: part(), savedAt: 1 }],
      ['user.evil', { definition: part({ op: 'user.evil', records: [{ id: 'r1', op: 'library.define' }] }), savedAt: 1 }],
      ['user.garbage', 'not a record'],
    ])
    const { parts, problems } = await createUserLibrary({ open: fake.open }).list()
    expect(parts.map((p) => p.op)).toEqual(['user.bracket'])
    expect(problems.map((p) => p.op).sort()).toEqual(['user.evil', 'user.garbage'])
  })

  it('removes a part', async () => {
    const fake = fakeOpen([['user.bracket', { definition: part(), savedAt: 1 }]])
    const library = createUserLibrary({ open: fake.open })
    await library.remove('user.bracket')
    expect(fake.data.size).toBe(0)
  })
})

describe('thumbnails (TODO/ui-055)', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo='

  it('stores a small PNG data URL beside the definition and lists it back by op', async () => {
    const fake = fakeOpen()
    const library = createUserLibrary({ open: fake.open })
    await library.save(part(), { thumbnail: PNG })
    expect(fake.data.get('user.bracket').thumbnail).toBe(PNG)
    const listed = await library.list()
    expect(listed.thumbnails).toEqual({ 'user.bracket': PNG })
  })

  it('never stores or returns anything that is not a small PNG data URL (it is untrusted, like the rest)', async () => {
    const fake = fakeOpen([['user.bracket', { definition: part(), savedAt: 1, thumbnail: 'javascript:alert(1)' }]])
    const library = createUserLibrary({ open: fake.open })
    expect((await library.list()).thumbnails).toEqual({})
    await library.save(part(), { thumbnail: 'https://example.com/x.png' })
    expect(fake.data.get('user.bracket').thumbnail).toBeUndefined()
    await library.save(part(), { thumbnail: `data:image/png;base64,${'A'.repeat(70_000)}` })
    expect(fake.data.get('user.bracket').thumbnail).toBeUndefined()
  })

  it('lists when each part was last saved, so My parts can put the newest first', async () => {
    const fake = fakeOpen()
    let clock = 100
    const library = createUserLibrary({ open: fake.open, now: () => (clock += 1) })
    await library.save(part())
    await library.save(part({ op: 'user.other', name: 'Other' }))
    expect((await library.list()).savedAt).toEqual({ 'user.bracket': 101, 'user.other': 102 })
  })

  it('re-saving without a thumbnail keeps the one already stored (a rename must not blank the row)', async () => {
    const fake = fakeOpen()
    const library = createUserLibrary({ open: fake.open })
    await library.save(part(), { thumbnail: PNG })
    await library.save(part({ name: 'Renamed' }))
    expect(fake.data.get('user.bracket').thumbnail).toBe(PNG)
  })
})

describe('loadUserLibrary', () => {
  it('registers every listed part as the library layer, so the registry can build it', async () => {
    const fake = fakeOpen([['user.bracket', { definition: part(), savedAt: 1 }]])
    const { problems } = await loadUserLibrary(createUserLibrary({ open: fake.open }))
    expect(problems).toEqual([])
    expect(effectiveUserPart('user.bracket')?.version).toBe(1)
  })

  it('never rejects: unreadable storage means an empty library, with the reason reported', async () => {
    const open = vi.fn(async () => {
      throw new Error('SecurityError: insecure')
    })
    const { problems } = await loadUserLibrary(createUserLibrary({ open }))
    expect(problems).toEqual([expect.objectContaining({ reason: expect.stringMatching(/insecure/) })])
    expect(effectiveUserPart('user.bracket')).toBeUndefined()
  })
})
