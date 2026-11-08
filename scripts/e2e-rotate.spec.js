// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { allProjects, hasExplicitProject, narrowsRun, pairFor, readIndex, writeIndex } from './e2e-rotate.mjs'

describe('e2e rotation', () => {
  it('lists the nine projects, or six without Firefox', () => {
    expect(allProjects()).toHaveLength(9)
    expect(allProjects({ skipFirefox: true })).toHaveLength(6)
    expect(allProjects({ skipFirefox: true }).some((p) => p.startsWith('firefox'))).toBe(false)
  })

  it('pairs two different projects that differ in both engine and viewport', () => {
    for (let i = 0; i < 9; i++) {
      const [a, b] = pairFor(i)
      const [ea, va] = a.split('-')
      const [eb, vb] = b.split('-')
      expect(ea).not.toBe(eb)
      expect(va).not.toBe(vb)
    }
  })

  it('covers every project within one cycle and wraps around', () => {
    const seen = new Set(Array.from({ length: 9 }, (_, i) => pairFor(i)).flat())
    expect(seen).toEqual(new Set(allProjects()))
    expect(pairFor(9)).toEqual(pairFor(0))
    expect(pairFor(-1)).toEqual(pairFor(8))
  })

  it('covers every project when Firefox is skipped too', () => {
    const projects = allProjects({ skipFirefox: true })
    const seen = new Set(Array.from({ length: 6 }, (_, i) => pairFor(i, projects)).flat())
    expect(seen).toEqual(new Set(projects))
  })

  it('treats --project as the caller choosing for themselves', () => {
    expect(hasExplicitProject(['--project=webkit-phone'])).toBe(true)
    expect(hasExplicitProject(['--project', 'webkit-phone'])).toBe(true)
    expect(hasExplicitProject(['e2e/a.e2e.js', '--workers=2'])).toBe(false)
  })

  it('knows which runs are narrower than the whole suite', () => {
    expect(narrowsRun([])).toBe(false)
    expect(narrowsRun(['--workers', '4', '-u', '--reporter=list'])).toBe(false)
    expect(narrowsRun(['e2e/a.e2e.js'])).toBe(true)
    expect(narrowsRun(['--grep', 'x'])).toBe(true)
    expect(narrowsRun(['--last-failed'])).toBe(true)
    expect(narrowsRun(['--shard=1/2'])).toBe(true)
  })

  describe('state file', () => {
    let dir
    afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

    it('starts at 0, then remembers the next run', () => {
      dir = mkdtempSync(join(tmpdir(), 'rotate-'))
      const file = join(dir, 'sub', 'state.json')
      expect(readIndex(file)).toBe(0)
      writeIndex(3, pairFor(2), file)
      expect(readIndex(file)).toBe(3)
    })
  })
})
