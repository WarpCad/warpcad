// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — the bridge here is a duck-typed fake of `__TAURI_INTERNALS__`.
import { describe, expect, it, vi } from 'vitest'

import { createFakeTauriFs } from '../native/__fixtures__/fakeFs.js'
import { AUTOSAVE_MIRROR_PATH, LIBRARY_MIRROR_FOLDER, createNativeAutosaveMirror, createNativeLibraryMirror } from './nativeMirror.js'

/**
 * `TODO/io-015`: the app-data copy of the autosave and of My parts. Mocked at the boundary with
 * the in-memory fake of `tauri-plugin-fs`; no real Tauri.
 */

function shell({ platform = 'ios' } = {}) {
  const fs = createFakeTauriFs()
  const invoke = vi.fn((cmd, args, options) => (cmd === 'shell_info' ? Promise.resolve({ platform, version: '1.13.0' }) : fs.invoke(cmd, args, options)))
  return { fs, invoke, global: { __TAURI_INTERNALS__: { invoke } } }
}

describe('the autosave mirror', () => {
  it('writes the NDJSON project to Application Support/autosave.ndjson, and reads it back', async () => {
    const { fs, global } = shell()
    const mirror = createNativeAutosaveMirror({ global })
    expect(await mirror.read()).toBeNull()
    await mirror.write({ text: '{"k":"state"}\n', savedAt: 5 })
    expect(AUTOSAVE_MIRROR_PATH).toBe('autosave.ndjson')
    expect(fs.appText('autosave.ndjson')).toBe('{"k":"state"}\n')
    expect(await mirror.read()).toBe('{"k":"state"}\n')
  })

  it('does nothing outside the iOS app: no write, no read', async () => {
    const { fs, invoke, global } = shell({ platform: 'macos' })
    const mirror = createNativeAutosaveMirror({ global })
    await mirror.write({ text: 'x', savedAt: 1 })
    expect(await mirror.read()).toBeNull()
    expect(fs.appData()).toEqual([])
    expect(invoke.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd !== 'shell_info')).toEqual([])
  })
})

describe('the library mirror', () => {
  it('keeps one file per part under library/, replaces it, and removes it', async () => {
    const { fs, global } = shell()
    const mirror = createNativeLibraryMirror({ global })
    await mirror.write('user.bolt', 'one')
    await mirror.write('user.bolt', 'two')
    await mirror.write('user.nut', 'n')
    expect(LIBRARY_MIRROR_FOLDER).toBe('library')
    expect(fs.appData()).toEqual(['library/user.bolt.ndjson', 'library/user.nut.ndjson'])
    expect(fs.appText('library/user.bolt.ndjson')).toBe('two')
    expect(await mirror.list()).toEqual([
      { file: 'user.bolt.ndjson', text: 'two' },
      { file: 'user.nut.ndjson', text: 'n' },
    ])
    await mirror.remove('user.bolt')
    expect(fs.appData()).toEqual(['library/user.nut.ndjson'])
  })

  it('does nothing outside the iOS app', async () => {
    const { fs, global } = shell({ platform: 'windows' })
    const mirror = createNativeLibraryMirror({ global })
    await mirror.write('user.bolt', 'x')
    await mirror.remove('user.bolt')
    expect(await mirror.list()).toEqual([])
    expect(fs.appData()).toEqual([])
  })
})
