// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { devFlagDefines, shellTarget } from './native-build.mjs'

describe('shellTarget', () => {
  it('uses WARPCAD_SHELL when the caller names a target', () => {
    expect(shellTarget({ WARPCAD_SHELL: 'tauri-ios', TAURI_ENV_PLATFORM: 'darwin' })).toBe('tauri-ios')
  })

  it('derives the target from the platform the Tauri CLI passes', () => {
    expect(shellTarget({ TAURI_ENV_PLATFORM: 'ios' })).toBe('tauri-ios')
    expect(shellTarget({ TAURI_ENV_PLATFORM: 'android' })).toBe('tauri-android')
    expect(shellTarget({ TAURI_ENV_PLATFORM: 'windows' })).toBe('tauri-windows')
  })

  it('names macOS `macos`, not the `darwin` the CLI reports', () => {
    expect(shellTarget({ TAURI_ENV_PLATFORM: 'darwin' })).toBe('tauri-macos')
  })

  it('falls back to a bare `tauri` when nothing says which platform', () => {
    expect(shellTarget({})).toBe('tauri')
    expect(shellTarget({ WARPCAD_SHELL: '', TAURI_ENV_PLATFORM: '' })).toBe('tauri')
  })
})

describe('devFlagDefines', () => {
  it('forces both development-only flags to empty in the native mode', () => {
    expect(devFlagDefines('native')).toEqual({
      'import.meta.env.VITE_E2E_HOOKS': '""',
      'import.meta.env.VITE_LIVE_BRIDGE': '""',
    })
  })

  it('leaves the other modes to the environment', () => {
    expect(devFlagDefines('production')).toEqual({})
  })
})
