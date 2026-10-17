// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import batchSource from './batch.js?raw'
import captureSource from './capture.js?raw'
import imageSource from './image.js?raw'
import librarySource from './library.js?raw'
import overlaySource from './overlay.js?raw'
import createSource from './create.js?raw'
import indexSource from './index.js?raw'
import limitsSource from './limits.js?raw'
import operateSource from './operate.js?raw'
import readSource from './read.js?raw'
import repeatSource from './repeat.js?raw'
import schemaSource from './schema.js?raw'
import variablesSource from './variables.js?raw'
import { LIMITS, WRITE_ORIGINS, assertWriteOrigin, createTurn } from './limits.js'

describe('LIMITS — the starting caps from ai-001 decision 7', () => {
  it('holds the accepted starting values', () => {
    expect(LIMITS).toEqual({
      recordsPerCall: 50,
      recordsPerTurn: 200,
      stepsPerTurn: 40,
      consecutiveFailures: 3,
      turnMs: 10 * 60 * 1000,
      repeatTargets: 64,
    })
    expect(Object.isFrozen(LIMITS)).toBe(true)
  })
})

describe('assertWriteOrigin — every write carries the transport’s origin, never local', () => {
  it('accepts exactly ai, mcp and webmcp (TODO/ai-021)', () => {
    expect(WRITE_ORIGINS).toEqual(['ai', 'mcp', 'webmcp'])
    expect(() => assertWriteOrigin('ai')).not.toThrow()
    expect(() => assertWriteOrigin('mcp')).not.toThrow()
    expect(() => assertWriteOrigin('webmcp')).not.toThrow()
  })

  it('refuses local, by name, so an AI record can never land on the user’s own undo stack', () => {
    expect(() => assertWriteOrigin('local')).toThrow(/local/)
  })

  it('refuses anything else, including nothing at all', () => {
    for (const origin of ['', 'remote', undefined, null, 7]) expect(() => assertWriteOrigin(origin)).toThrow()
  })
})

describe('createTurn — the per-turn budget', () => {
  /** A clock the spec moves by hand. */
  function fakeClock() {
    let now = 1_000
    return { now: () => now, advance: (/** @type {number} */ ms) => (now += ms) }
  }

  it('stops at the step cap and says so, and stays stopped', () => {
    const turn = createTurn({ limits: { ...LIMITS, stepsPerTurn: 2 } })
    expect(turn.beginStep('describe_scene')).toBeNull()
    turn.endStep('describe_scene', true)
    expect(turn.beginStep('describe_scene')).toBeNull()
    turn.endStep('describe_scene', true)
    const hit = turn.beginStep('describe_scene')
    expect(hit).toMatchObject({ limit: 'stepsPerTurn', stop: true })
    expect(hit?.error).toMatch(/2 tool calls/)
    expect(turn.beginStep('describe_scene')).toMatchObject({ stop: true })
    expect(turn.stats.stopped).toBe(true)
  })

  it('stops when the wall clock runs out', () => {
    const clock = fakeClock()
    const turn = createTurn({ now: clock.now })
    expect(turn.beginStep('create')).toBeNull()
    turn.endStep('create', true)
    clock.advance(LIMITS.turnMs + 1)
    expect(turn.beginStep('create')).toMatchObject({ limit: 'turnMs', stop: true })
  })

  it('stops after three consecutive failures of the same tool, not before', () => {
    const turn = createTurn()
    for (let index = 0; index < 2; index += 1) {
      turn.beginStep('operate')
      expect(turn.endStep('operate', false)).toBeNull()
    }
    turn.beginStep('operate')
    expect(turn.endStep('operate', false)).toMatchObject({ limit: 'consecutiveFailures', stop: true })
  })

  it('resets the failure streak on a success, or on a failure of a different tool', () => {
    const turn = createTurn()
    turn.beginStep('operate')
    turn.endStep('operate', false)
    turn.beginStep('operate')
    turn.endStep('operate', false)
    turn.beginStep('create')
    expect(turn.endStep('create', false)).toBeNull()
    turn.beginStep('operate')
    expect(turn.endStep('operate', false)).toBeNull()
    turn.beginStep('describe_scene')
    turn.endStep('describe_scene', true)
    expect(turn.stats.consecutiveFailures).toBe(0)
  })

  it('refuses more records in one call than the per-call cap', () => {
    const turn = createTurn()
    expect(turn.canAppend(LIMITS.recordsPerCall)).toBeNull()
    expect(turn.canAppend(LIMITS.recordsPerCall + 1)).toMatchObject({ limit: 'recordsPerCall', stop: true })
  })

  it('refuses the append that would cross the per-turn cap, counting only what landed', () => {
    const turn = createTurn({ limits: { ...LIMITS, recordsPerTurn: 5 } })
    expect(turn.canAppend(3)).toBeNull()
    turn.commitRecords(3)
    expect(turn.canAppend(2)).toBeNull()
    expect(turn.canAppend(3)).toMatchObject({ limit: 'recordsPerTurn', stop: true })
    expect(turn.stats.records).toBe(3)
  })
})

describe('what a tool module can never do (decision 7), checked statically', () => {
  // Read through Vite's `?raw` (the project has no Node `fs` types; see `src/shims.d.ts`).
  // A new module under src/ai/tools/ joins this list in the same change that adds it.
  /** @type {Record<string, string>} */
  const modules = {
    'batch.js': batchSource,
    'capture.js': captureSource,
    'create.js': createSource,
    'image.js': imageSource,
    'library.js': librarySource,
    'overlay.js': overlaySource,
    'index.js': indexSource,
    'limits.js': limitsSource,
    'operate.js': operateSource,
    'read.js': readSource,
    'schema.js': schemaSource,
    'repeat.js': repeatSource,
    'variables.js': variablesSource,
  }

  it('guards every module the registry is built from', () => {
    for (const file of Object.keys(modules)) {
      if (file !== 'index.js') expect(indexSource + batchSource + captureSource, file).toContain(`./${file}`)
    }
  })

  for (const [file, raw] of Object.entries(modules)) {
    it(`${file} references no network API and imports no framework`, () => {
      const source = raw
        // Comments may name what is forbidden; only code is checked.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon/)
      expect(source).not.toMatch(/import\s*\(/)
      expect(source).not.toMatch(/from\s+['"](vue|pinia|three)(\/[^'"]*)?['"]/)
      expect(source).not.toMatch(/\b(window|document\.createElement|localStorage|indexedDB)\b/)
    })
  }
})
