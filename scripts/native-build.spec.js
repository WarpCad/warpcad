// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  NATIVE_WEB_ONLY_FILES,
  devFlagDefines,
  removeWebOnlyFiles,
  shellTarget,
  stripCspMeta,
} from './native-build.mjs'

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

const PAGE = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <!-- Content-Security-Policy: a comment that mentions the tag by name, which stays. -->
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; connect-src 'self' https://api.github.com"
    />
    <meta name="viewport" content="width=device-width" />
  </head>
  <body></body>
</html>`

describe('stripCspMeta (TODO/build-032)', () => {
  it('removes the page policy in the native mode, so the shell header is the only policy', () => {
    const out = stripCspMeta(PAGE, 'native')
    expect(out).not.toMatch(/http-equiv\s*=\s*["']Content-Security-Policy/i)
    expect(out).not.toContain('connect-src')
    expect(out).toContain('<meta charset="UTF-8" />')
    expect(out).toContain('<meta name="viewport"')
  })

  it('leaves the page untouched in the production mode', () => {
    expect(stripCspMeta(PAGE, 'production')).toBe(PAGE)
  })

  it('is a no-op on a page with no policy', () => {
    const bare = '<html><head><meta charset="UTF-8" /></head></html>'
    expect(stripCspMeta(bare, 'native')).toBe(bare)
  })
})

describe('removeWebOnlyFiles (TODO/build-032)', () => {
  it('deletes the files the web site needs and the app never reads, and keeps the rest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'native-out-'))
    try {
      for (const name of [...NATIVE_WEB_ONLY_FILES, 'index.html', 'llms.txt']) writeFileSync(join(dir, name), 'x')
      removeWebOnlyFiles(dir)
      for (const name of NATIVE_WEB_ONLY_FILES) expect(existsSync(join(dir, name))).toBe(false)
      expect(existsSync(join(dir, 'index.html'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('names exactly the four files the finding lists', () => {
    expect([...NATIVE_WEB_ONLY_FILES].sort()).toEqual(
      ['CNAME', 'github-social-preview.png', 'github-social-preview.svg', 'llms-full.txt'].sort(),
    )
  })
})
