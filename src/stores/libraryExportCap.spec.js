// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives a hand-written in-memory fake of the library backend.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The cap lowered to a size a small part reaches, so the refusal is reachable without building
// an 8-million-character part (the importer's own caps keep a real one just under it).
vi.mock('../core/userPartFile.js', async (importOriginal) => ({
  ...(await importOriginal()),
  MAX_PART_FILE_CHARS: 400,
}))

import { resetUserParts, setLibraryParts } from '../core/userPart.js'
import { useLibraryStore } from './library.js'

/**
 * `TODO/io-009`: **Export part file** must not hand over a file that **Import part file…**
 * would refuse as too large — it says why and writes nothing.
 */
const definition = {
  op: 'user.standoff',
  name: 'Standoff',
  version: 1,
  result: 'a',
  params: [],
  records: [{ id: 'a', op: 'primitive.cuboid', params: { size: [1, 2, 3], center: [0, 0, 0] } }],
}

beforeEach(() => resetUserParts())
afterEach(() => resetUserParts())

describe('Export part file over MAX_PART_FILE_CHARS', () => {
  it('refuses with a reason and does not download', () => {
    setActivePinia(createPinia())
    const library = useLibraryStore()
    const downloads = []
    library.useBackend({ async list() { return { parts: [], problems: [], thumbnails: {}, savedAt: {} } }, async save() {}, async remove() {}, close() {} }, {
      download: (text, name) => downloads.push({ text, name }),
    })
    setLibraryParts([definition])
    expect(library.exportPart('user.standoff')).toBe(false)
    expect(downloads).toHaveLength(0)
    expect(library.toast.text).toMatch(/Could not export Standoff/)
    expect(library.toast.text).toMatch(/Import part file/)
  })
})
