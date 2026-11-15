// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { parseArgs } from './bundle-load-args.mjs'

describe('bundle-load argument parsing', () => {
  it('keeps the local defaults unchanged when --url is absent', () => {
    const config = parseArgs([])
    expect(config.url).toBeNull()
    expect(config.runs).toBe(7)
    expect(config.warmup).toBe(1)
    expect(config.engines).toEqual(['chromium', 'firefox', 'webkit'])
    expect(config.profiles).toEqual(['none', 'slow4g', 'slow4g-cpu4'])
    expect(config.check).toBe(false)
    expect(config.builds).toEqual([{ name: 'baseline', dist: resolve('dist') }])
  })

  it('reads repeated --build flags in local mode', () => {
    const config = parseArgs(['--build', 'a=dist', '--build', 'b=/tmp/x/dist', '--runs', '3'])
    expect(config.builds).toEqual([
      { name: 'a', dist: resolve('dist') },
      { name: 'b', dist: '/tmp/x/dist' },
    ])
    expect(config.runs).toBe(3)
  })

  it('--url selects deployed mode: no local builds, Chromium only, trailing slash added', () => {
    const config = parseArgs(['--url', 'https://app.warpcad.com'])
    expect(config.url).toBe('https://app.warpcad.com/')
    expect(config.builds).toEqual([])
    expect(config.engines).toEqual(['chromium'])
  })

  it('--url keeps a path and drops a query and hash', () => {
    expect(parseArgs(['--url', 'https://example.test/app?x=1#/y']).url).toBe('https://example.test/app/')
  })

  it('--url still honours --runs, --profiles and --json', () => {
    const config = parseArgs(['--url', 'https://app.warpcad.com/', '--runs', '5', '--profiles', 'slow4g', '--json', '/tmp/o.json'])
    expect(config.runs).toBe(5)
    expect(config.profiles).toEqual(['slow4g'])
    expect(config.json).toBe('/tmp/o.json')
  })

  it('rejects --url without a value, with a non-http(s) value, or that is not a URL', () => {
    expect(() => parseArgs(['--url'])).toThrow(/--url needs/)
    expect(() => parseArgs(['--url', 'ftp://x.test/'])).toThrow(/http/)
    expect(() => parseArgs(['--url', 'not a url'])).toThrow(/not a valid URL/)
  })

  it('rejects --url combined with --build, --check, or a non-Chromium engine', () => {
    expect(() => parseArgs(['--url', 'https://x.test/', '--build', 'a=dist'])).toThrow(/--build/)
    expect(() => parseArgs(['--url', 'https://x.test/', '--check'])).toThrow(/--check/)
    expect(() => parseArgs(['--url', 'https://x.test/', '--engines', 'firefox'])).toThrow(/Chromium/)
    expect(parseArgs(['--url', 'https://x.test/', '--engines', 'chromium']).engines).toEqual(['chromium'])
  })
})
