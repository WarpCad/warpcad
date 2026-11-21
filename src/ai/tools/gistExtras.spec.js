// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDocument } from '../../core/document.js'
import { GIST_EXTRAS_LIMITS } from '../../core/gistExtras.js'
import { gistBriefOf } from '../../core/gistReadiness.js'
import { gistReadme } from '../../core/gistReadme.js'
import { makeContext } from './__fixtures__/context.js'
import { GET_PUBLISH_READINESS, STAGE_GIST_FILES } from './gistExtras.js'
import { createToolRegistry } from './index.js'

/**
 * `TODO/io-040` — `stage_gist_files` and `get_publish_readiness`: an agent stages the extra files a
 * gist should carry (an ASCII STL of bodies, a Markdown note) and then asks what the next publish
 * would contain and what is still blank. Staging stores names, kinds, body ids and note text —
 * never mesh bytes. Readiness reads only, and builds its README with the same brief and the same
 * `gistReadme()` the publish uses.
 */

const CUBE = { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } }
const PUBLISHED_AT = new Date('2026-11-21T12:00:00Z')

/** @param {string} origin */
function contextFor(origin = 'mcp') {
  return makeContext({ document: createDocument({ replica: 'abcdef' }), origin })
}

/** The same document and origin, a new turn. @param {import('./index.js').ToolContext} ctx */
const freshTurn = (ctx) => makeContext({ document: ctx.document, origin: ctx.origin })

/** @param {import('./index.js').ToolContext} ctx */
function placeCube(ctx, x = 0) {
  const result = createToolRegistry().run(ctx, 'create', { ...CUBE, positionMm: [x, 0, 0] })
  return /** @type {string} */ (result.applied[0].bodyId)
}

describe('stage_gist_files', () => {
  it('both tools are offered to the in-app assistant, over MCP and over WebMCP', () => {
    const tools = createToolRegistry()
    expect(STAGE_GIST_FILES).toBe('stage_gist_files')
    expect(GET_PUBLISH_READINESS).toBe('get_publish_readiness')
    for (const transport of /** @type {const} */ (['ai', 'mcp', 'webmcp'])) {
      const names = tools.definitions(transport).map((definition) => definition.name)
      expect(names).toContain('stage_gist_files')
      expect(names).toContain('get_publish_readiness')
    }
  })

  it('offers only the kinds a gist can carry as text: ASCII STL and a note, no 3MF', () => {
    const definition = createToolRegistry().definitions('mcp').find((d) => d.name === 'stage_gist_files')
    const kinds = /** @type {any} */ (definition?.inputSchema.properties?.files).items.properties.kind.enum
    expect(kinds).toEqual(['stl', 'note'])
    expect(definition?.description).toMatch(/ASCII STL/)
    expect(definition?.description).toMatch(/never publishes|does not publish/i)
  })

  it('stages an STL of the whole scene by default, named after the project, and writes no row', () => {
    const ctx = contextFor()
    const tools = createToolRegistry()
    placeCube(ctx)
    tools.run(ctx, 'set_project_name', { name: 'Cable clip' })
    const rows = ctx.document.entries.length
    const result = tools.run(ctx, 'stage_gist_files', { files: [{ kind: 'stl' }] })
    expect(result.error).toBeUndefined()
    expect(result.staged).toEqual([{ kind: 'stl', name: 'cable-clip.stl', ids: [] }])
    expect(result.previous).toEqual([])
    expect(ctx.document.gistExtras()).toEqual([{ kind: 'stl', name: 'cable-clip.stl', ids: [] }])
    expect(ctx.document.entries).toHaveLength(rows)
    expect(ctx.document.canUndo()).toBe(false)
  })

  it('slugs file names the way the project file is slugged, and strips a typed extension', () => {
    const ctx = contextFor()
    const tools = createToolRegistry()
    const id = placeCube(ctx)
    const result = tools.run(ctx, 'stage_gist_files', {
      files: [
        { kind: 'stl', ids: [id], name: 'Café Clip.STL' },
        { kind: 'note', name: '../Print\u202E settings', text: 'PETG\u0007, 0.2 mm layers.' },
      ],
    })
    expect(result.staged.map((/** @type {any} */ file) => file.name)).toEqual(['cafe-clip.stl', 'print-settings.md'])
    const note = /** @type {any} */ (ctx.document.gistExtras()[1])
    expect(note.text).toBe('PETG, 0.2 mm layers.')
    expect(result.staged[1]).toEqual({ kind: 'note', name: 'print-settings.md', chars: 20 })
  })

  it('replaces the staged list, and an empty list clears it', () => {
    const ctx = contextFor()
    const tools = createToolRegistry()
    placeCube(ctx)
    tools.run(ctx, 'stage_gist_files', { files: [{ kind: 'stl', name: 'a' }, { kind: 'note', name: 'b', text: 'x' }] })
    const replaced = tools.run(ctx, 'stage_gist_files', { files: [{ kind: 'note', name: 'c', text: 'y' }] })
    expect(replaced.previous).toEqual(['a.stl', 'b.md'])
    expect(ctx.document.gistExtras().map((extra) => extra.name)).toEqual(['c.md'])
    const cleared = tools.run(ctx, 'stage_gist_files', { files: [] })
    expect(cleared.staged).toEqual([])
    expect(cleared.previous).toEqual(['c.md'])
    expect(ctx.document.gistExtras()).toEqual([])
  })

  it(`refuses more than ${GIST_EXTRAS_LIMITS.maxFiles} files, and stages nothing`, () => {
    const ctx = contextFor()
    const files = Array.from({ length: GIST_EXTRAS_LIMITS.maxFiles + 1 }, (_, i) => ({ kind: 'note', name: `n${i}`, text: 'x' }))
    const result = createToolRegistry().run(ctx, 'stage_gist_files', { files })
    expect(result.error).toMatch(new RegExp(`at most ${GIST_EXTRAS_LIMITS.maxFiles}`))
    expect(ctx.document.gistExtras()).toEqual([])
  })

  it(`refuses a note over ${GIST_EXTRAS_LIMITS.maxNoteChars.toLocaleString('en-US')} characters, an empty note, and the wrong fields for a kind`, () => {
    const ctx = contextFor()
    const tools = createToolRegistry()
    const id = placeCube(ctx)
    const cases = [
      [{ kind: 'note', name: 'long', text: 'x'.repeat(GIST_EXTRAS_LIMITS.maxNoteChars + 1) }, /20,000/],
      [{ kind: 'note', name: 'empty', text: '  \u202E ' }, /empty|no text/],
      [{ kind: 'note', name: 'missing' }, /text/],
      [{ kind: 'note', name: 'with ids', text: 'x', ids: [id] }, /ids/],
      [{ kind: 'stl', name: 'with text', text: 'x' }, /text/],
    ]
    for (const [file, reason] of cases) {
      // A fresh turn each time: three refusals in a row would stop one turn (limits.js).
      const result = tools.run(freshTurn(ctx), 'stage_gist_files', { files: [file] })
      expect(result.error, JSON.stringify(file).slice(0, 60)).toMatch(/** @type {RegExp} */ (reason))
    }
    expect(ctx.document.gistExtras()).toEqual([])
  })

  it('refuses a name that collides with README.md (any letter case) or another staged file', () => {
    const ctx = contextFor()
    const tools = createToolRegistry()
    for (const name of ['README', 'readme.md', 'ReadMe.MD']) {
      const result = tools.run(freshTurn(ctx), 'stage_gist_files', { files: [{ kind: 'note', name, text: 'x' }] })
      expect(result.error, name).toMatch(/README\.md/)
    }
    const twice = tools.run(freshTurn(ctx), 'stage_gist_files', { files: [{ kind: 'note', name: 'Notes', text: 'x' }, { kind: 'note', name: 'notes', text: 'y' }] })
    expect(twice.error).toMatch(/notes\.md/)
    expect(ctx.document.gistExtras()).toEqual([])
  })

  it('refuses a body id that is not on screen, naming it', () => {
    const ctx = contextFor()
    placeCube(ctx)
    const result = createToolRegistry().run(ctx, 'stage_gist_files', { files: [{ kind: 'stl', ids: ['cuboid-nope-9'] }] })
    expect(result.error).toMatch(/cuboid-nope-9/)
    expect(result.error).toMatch(/describe_scene/)
    expect(ctx.document.gistExtras()).toEqual([])
  })

  it('refuses an STL of an empty scene', () => {
    const ctx = contextFor()
    const result = createToolRegistry().run(ctx, 'stage_gist_files', { files: [{ kind: 'stl' }] })
    expect(result.error).toMatch(/no bodies/)
  })
})

describe('get_publish_readiness', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(PUBLISHED_AT)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads only: nothing changes, not even the version', () => {
    const ctx = contextFor()
    placeCube(ctx)
    const version = ctx.document.version
    const result = createToolRegistry().run(ctx, 'get_publish_readiness', {})
    expect(result.error).toBeUndefined()
    expect(ctx.document.version).toBe(version)
  })

  it('names what is blank on a fresh project: no name and no description', () => {
    const ctx = contextFor()
    placeCube(ctx)
    const result = createToolRegistry().run(ctx, 'get_publish_readiness', {})
    expect(result.name).toBe('')
    expect(result.description).toBe('')
    expect(result.files).toEqual([])
    expect(result.gaps.some((/** @type {string} */ gap) => /no name/.test(gap) && /set_project_name/.test(gap))).toBe(true)
    expect(result.gaps.some((/** @type {string} */ gap) => /no description/.test(gap) && /set_description/.test(gap))).toBe(true)
  })

  it('an empty project says it cannot be published yet', () => {
    const result = createToolRegistry().run(contextFor(), 'get_publish_readiness', {})
    expect(result.gaps.some((/** @type {string} */ gap) => /no bodies/.test(gap))).toBe(true)
  })

  it('names a variable meant to be changed that has no min/max, and a request with no reply', () => {
    const ctx = contextFor()
    const tools = createToolRegistry()
    tools.run(ctx, 'record_prompt', { prompt: 'a 40 mm cable clip' })
    placeCube(ctx)
    tools.run(ctx, 'define_variable', { name: 'wall', kind: 'number', value: 2, unit: 'mm' })
    tools.run(ctx, 'define_variable', { name: 'width', kind: 'number', value: 40, unit: 'mm', min: 20, max: 80 })
    const result = tools.run(ctx, 'get_publish_readiness', {})
    const gaps = /** @type {string[]} */ (result.gaps)
    expect(gaps.some((gap) => /"wall"/.test(gap) && /min\/max/.test(gap))).toBe(true)
    expect(gaps.some((gap) => /"width"/.test(gap))).toBe(false)
    expect(gaps.some((gap) => /reply/.test(gap) && /record_response/.test(gap))).toBe(true)
    tools.run(ctx, 'record_response', { response: 'Made a clip.' })
    const after = /** @type {string[]} */ (tools.run(ctx, 'get_publish_readiness', {}).gaps)
    expect(after.some((gap) => /reply/.test(gap))).toBe(false)
  })

  it('a finished project has no gaps, and lists its files with approximate sizes', () => {
    const ctx = contextFor()
    const tools = createToolRegistry()
    placeCube(ctx)
    tools.run(ctx, 'set_project_name', { name: 'Cable clip' })
    tools.run(ctx, 'set_description', { description: 'A clip for desk cables.' })
    tools.run(ctx, 'stage_gist_files', { files: [{ kind: 'stl' }, { kind: 'note', name: 'notes', text: 'PETG.' }] })
    const result = tools.run(ctx, 'get_publish_readiness', {})
    expect(result.gaps).toEqual([])
    expect(result.name).toBe('Cable clip')
    expect(result.description).toBe('A clip for desk cables.')
    expect(result.files).toEqual([
      { name: 'cable-clip.stl', kind: 'stl', approxBytes: expect.any(Number) },
      { name: 'notes.md', kind: 'note', approxBytes: 5 },
    ])
    // A cube is 12 triangles; an ASCII STL facet is well over 100 bytes.
    expect(result.files[0].approxBytes).toBeGreaterThan(12 * 100)
    expect(result.files[0].approxBytes).toBeLessThan(12 * 400)
  })

  it('a staged body that is no longer on screen is named, and an STL with none left is dropped', () => {
    const ctx = contextFor()
    const tools = createToolRegistry()
    const kept = placeCube(ctx)
    const gone = placeCube(ctx, 40)
    tools.run(ctx, 'stage_gist_files', { files: [{ kind: 'stl', name: 'both', ids: [kept, gone] }, { kind: 'stl', name: 'gone', ids: [gone] }] })
    tools.run(ctx, 'delete_bodies', { ids: [gone] })
    const result = tools.run(ctx, 'get_publish_readiness', {})
    expect(result.files).toEqual([
      { name: 'both.stl', kind: 'stl', approxBytes: expect.any(Number), missingIds: [gone] },
      { name: 'gone.stl', kind: 'stl', approxBytes: 0, missingIds: [gone] },
    ])
    const gaps = /** @type {string[]} */ (result.gaps)
    expect(gaps.some((gap) => gap.includes('both.stl') && gap.includes(gone) && /no longer/.test(gap))).toBe(true)
    expect(gaps.some((gap) => gap.includes('gone.stl') && /left out/.test(gap))).toBe(true)
    // Still staged as it was: readiness never writes.
    expect(ctx.document.gistExtras()).toHaveLength(2)
  })

  it('its readme is exactly what gistReadme() writes for the same state, prompts included', () => {
    const ctx = contextFor()
    const tools = createToolRegistry()
    tools.run(ctx, 'record_prompt', { prompt: 'a 40 mm cable clip' })
    placeCube(ctx)
    tools.run(ctx, 'set_project_name', { name: 'Cable clip' })
    tools.run(ctx, 'set_description', { description: 'A **clip**.' })
    tools.run(ctx, 'define_variable', { name: 'wall', kind: 'number', value: 2, unit: 'mm', min: 1, max: 4 })
    tools.run(ctx, 'record_response', { response: 'Made a clip.' })
    const result = tools.run(ctx, 'get_publish_readiness', {})
    const expected = gistReadme({ name: 'Cable clip', ...gistBriefOf(ctx.document, {}), publishedAt: PUBLISHED_AT, id: null })
    expect(result.readme).toBe(expected)
    expect(result.readme).toContain('a 40 mm cable clip')
    expect(result.readme).toContain('wall')
  })

  it('returns project text as data: a hostile name reaches the README escaped', () => {
    const ctx = contextFor()
    const tools = createToolRegistry()
    placeCube(ctx)
    tools.run(ctx, 'set_project_name', { name: '[x](javascript:alert(1)) <img>' })
    const result = tools.run(ctx, 'get_publish_readiness', {})
    expect(result.readme).not.toContain('<img>')
    expect(result.readme).not.toContain('](javascript')
  })
})
