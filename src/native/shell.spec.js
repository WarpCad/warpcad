// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { invoke, isNativeShell, probeShell, shellInfo } from './shell.js'

describe('isNativeShell', () => {
  it('is false on the web: no target and no bridge', () => {
    expect(isNativeShell({ target: '' })).toBe(false)
  })

  it('is true when the build is stamped with a native target', () => {
    expect(isNativeShell({ target: 'tauri-ios' })).toBe(true)
  })

  it('is true when the bridge is present even on an unstamped build', () => {
    expect(isNativeShell({ target: '', internals: {} })).toBe(true)
  })

  it('treats a stamped build with no bridge as native, not as the web', () => {
    expect(isNativeShell({ target: 'tauri-macos', internals: undefined })).toBe(true)
  })
})

describe('probeShell', () => {
  it('reads the bridge from the global object and the target from the argument', () => {
    const bridge = { invoke: () => Promise.resolve(null) }
    const probe = probeShell({ __TAURI_INTERNALS__: bridge }, 'tauri-ios')
    expect(probe).toEqual({ target: 'tauri-ios', internals: bridge })
    expect(isNativeShell(probe)).toBe(true)
  })

  it('reports the web when neither fact is present', () => {
    expect(probeShell({}, '')).toEqual({ target: '', internals: undefined })
  })
})

describe('shellInfo', () => {
  it('names the target and whether the page is native', () => {
    expect(shellInfo({ target: 'tauri-android' })).toEqual({ native: true, target: 'tauri-android' })
    expect(shellInfo({ target: '' })).toEqual({ native: false, target: '' })
  })
})

describe('invoke', () => {
  it('rejects with a clear message when there is no bridge, instead of throwing', async () => {
    await expect(invoke('save_file', {}, {})).rejects.toThrow('native command "save_file" needs the native shell')
  })

  it('rejects when the bridge exists but has no invoke function', async () => {
    await expect(invoke('save_file', {}, { __TAURI_INTERNALS__: {} })).rejects.toThrow(/needs the native shell/)
  })

  it('forwards the command and arguments to the bridge and returns its result', async () => {
    /** @type {Array<[string, Record<string, unknown>]>} */
    const calls = []
    const global = {
      __TAURI_INTERNALS__: {
        invoke: (/** @type {string} */ cmd, /** @type {Record<string, unknown>} */ args) => {
          calls.push([cmd, args])
          return Promise.resolve('ok')
        },
      },
    }
    await expect(invoke('ping', { n: 1 }, global)).resolves.toBe('ok')
    expect(calls).toEqual([['ping', { n: 1 }]])
  })
})
