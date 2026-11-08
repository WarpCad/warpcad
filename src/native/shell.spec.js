// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  SHELL_INFO_COMMAND,
  invoke,
  isNativeShell,
  loadShellDetails,
  nativeVersionLine,
  platformName,
  platformOfTarget,
  probeShell,
  shellInfo,
} from './shell.js'

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
    expect(shellInfo({ target: 'tauri-android' })).toEqual({ native: true, target: 'tauri-android', platform: 'android' })
    expect(shellInfo({ target: '' })).toEqual({ native: false, target: '', platform: '' })
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

describe('platformOfTarget and platformName', () => {
  it('reads the OS out of each of the four targets', () => {
    expect(platformOfTarget('tauri-ios')).toBe('ios')
    expect(platformOfTarget('tauri-macos')).toBe('macos')
    expect(platformOfTarget('tauri-android')).toBe('android')
    expect(platformOfTarget('tauri-windows')).toBe('windows')
  })

  it('gives no platform for the web, a bare `tauri`, or a target it does not know', () => {
    expect(platformOfTarget('')).toBe('')
    expect(platformOfTarget('tauri')).toBe('')
    expect(platformOfTarget('tauri-linux')).toBe('')
    expect(platformOfTarget('tauri-constructor')).toBe('')
  })

  it('writes each platform the way the UI shows it', () => {
    expect(['ios', 'macos', 'android', 'windows'].map(platformName)).toEqual(['iOS', 'macOS', 'Android', 'Windows'])
    expect(platformName('')).toBe('Native')
    expect(platformName('toString')).toBe('Native')
  })
})

describe('nativeVersionLine', () => {
  it('names the release, the commit, the platform and the shell version', () => {
    expect(nativeVersionLine({ version: '1.13.0', commit: 'a1b2c3d', platform: 'ios', shellVersion: '1.13.0' })).toBe(
      'WarpCad 1.13.0 (a1b2c3d) · iOS app 1.13.0',
    )
    expect(nativeVersionLine({ version: '1.13.0', commit: 'a1b2c3d', platform: 'macos', shellVersion: '0.2.0' })).toBe(
      'WarpCad 1.13.0 (a1b2c3d) · macOS app 0.2.0',
    )
  })

  it('leaves the shell version off while it is unknown, rather than guessing', () => {
    expect(nativeVersionLine({ version: '1.13.0', commit: 'dev', platform: 'android', shellVersion: '' })).toBe('WarpCad 1.13.0 (dev) · Android app')
  })

  it('reads the 0.0.0 placeholder as `dev`, like the header label', () => {
    expect(nativeVersionLine({ version: '0.0.0', commit: 'dev', platform: 'windows', shellVersion: '0.1.0' })).toBe('WarpCad dev (dev) · Windows app 0.1.0')
  })

  it('says `Native app` when the platform is unknown', () => {
    expect(nativeVersionLine({ version: '1.13.0', commit: 'a1b2c3d', platform: '', shellVersion: '' })).toBe('WarpCad 1.13.0 (a1b2c3d) · Native app')
  })
})

describe('loadShellDetails', () => {
  /** @param {(cmd: string, args: Record<string, unknown>) => Promise<unknown>} fn */
  const bridge = (fn) => ({ __TAURI_INTERNALS__: { invoke: fn } })

  it('asks the shell with its `shell_info` command and returns what it reports', async () => {
    /** @type {string[]} */
    const asked = []
    const global = bridge((cmd) => {
      asked.push(cmd)
      return Promise.resolve({ platform: 'ios', version: '1.13.0' })
    })
    await expect(loadShellDetails({ target: '' }, global)).resolves.toEqual({ platform: 'ios', version: '1.13.0' })
    expect(asked).toEqual([SHELL_INFO_COMMAND])
  })

  it('falls back to the build target and no version when the command fails', async () => {
    const global = bridge(() => Promise.reject(new Error('command shell_info not found')))
    await expect(loadShellDetails({ target: 'tauri-macos' }, global)).resolves.toEqual({ platform: 'macos', version: '' })
  })

  it('falls back when there is no bridge at all', async () => {
    await expect(loadShellDetails({ target: 'tauri-ios' }, {})).resolves.toEqual({ platform: 'ios', version: '' })
  })

  it('ignores an answer of the wrong shape', async () => {
    const global = bridge(() => Promise.resolve({ platform: 7, version: null }))
    await expect(loadShellDetails({ target: 'tauri-android' }, global)).resolves.toEqual({ platform: 'android', version: '' })
    const empty = bridge(() => Promise.resolve(null))
    await expect(loadShellDetails({ target: '' }, empty)).resolves.toEqual({ platform: '', version: '' })
  })
})
