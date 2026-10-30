// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createToolRegistry } from '../src/ai/tools/index.js'
import { promptsForBody } from '../src/core/prompt.js'
import { LIVE_SERVER_INSTRUCTIONS } from './liveHttp.js'
import { createProjectSession, loadProjectText, writeToolNames } from './projectFile.js'
import { SERVER_INSTRUCTIONS, mcpToolDefinitions } from './server.js'

/**
 * `TODO/ai-031` over the closed-file MCP server: `record_prompt` writes the file (it changes no
 * record, so the session must notice the prompt itself), and the session remembers the recorded
 * prompt for its later calls — the writes link to it and carry it as their design intent when
 * the client sends no `request` of its own.
 */

vi.setConfig({ testTimeout: 30_000 })

const DUCT = 'a 140 × 250 mm fan duct, 1.6 mm walls'
const CUBE = { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } }

/** @type {string} */
let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'warpcad-prompt-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('the MCP session and record_prompt', () => {
  it('record_prompt writes the file and echoes the stored text and id', async () => {
    const file = join(dir, 'duct.ndjson')
    const session = createProjectSession({ path: file, tools: createToolRegistry() })
    const result = await session.call('record_prompt', { prompt: DUCT })
    expect(result.error).toBeUndefined()
    expect(result.prompt).toEqual({ id: expect.any(String), text: DUCT, truncated: false })
    const saved = loadProjectText(readFileSync(file, 'utf8'), 'duct.ndjson')
    expect(saved.prompts()).toEqual([{ id: result.prompt.id, text: DUCT, produced: [] }])
  })

  it('later writes in the session link to it and carry it as intent', async () => {
    const file = join(dir, 'duct.ndjson')
    const session = createProjectSession({ path: file, tools: createToolRegistry() })
    const recorded = await session.call('record_prompt', { prompt: DUCT })
    const made = await session.call('create', { ...CUBE, rationale: 'outer shell' })
    expect(made.error).toBeUndefined()
    const saved = loadProjectText(readFileSync(file, 'utf8'), 'duct.ndjson')
    expect(saved.promptOf(recorded.prompt.id)?.produced).toEqual(made.applied[0].recordIds)
    expect(saved.entries[0].intent).toBe(`${DUCT}\n— outer shell`)
    expect(promptsForBody(saved, made.applied[0].bodyId).map((p) => p.text)).toEqual([DUCT])
  })

  it('a client’s own request still wins for intent, and the write is still linked', async () => {
    const file = join(dir, 'duct.ndjson')
    const session = createProjectSession({ path: file, tools: createToolRegistry() })
    await session.call('record_prompt', { prompt: DUCT })
    const made = await session.call('create', CUBE, { request: 'just the base' })
    const saved = loadProjectText(readFileSync(file, 'utf8'), 'duct.ndjson')
    expect(saved.entries[0].intent).toBe('just the base')
    expect(saved.prompts()[0].produced).toEqual(made.applied[0].recordIds)
  })

  it('a refused record_prompt writes nothing', async () => {
    const file = join(dir, 'duct.ndjson')
    const session = createProjectSession({ path: file, tools: createToolRegistry() })
    await session.call('create', CUBE)
    const before = readFileSync(file, 'utf8')
    const refused = await session.call('record_prompt', { prompt: '   ' })
    expect(refused.error).toBeDefined()
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('record_prompt takes the file lock like every write, and gets no `request` of its own', () => {
    const tools = createToolRegistry()
    expect(writeToolNames(tools).has('record_prompt')).toBe(true)
    const definition = mcpToolDefinitions(tools).find((d) => d.name === 'record_prompt')
    expect(definition).toBeDefined()
    expect(Object.keys(definition?.inputSchema.properties ?? {})).not.toContain('request')
  })
})

describe('the MCP session and record_response (TODO/ai-032)', () => {
  it('lands the reply in the file under the lock, after record_prompt in an earlier call', async () => {
    const file = join(dir, 'duct.ndjson')
    const session = createProjectSession({ path: file, tools: createToolRegistry() })
    const recorded = await session.call('record_prompt', { prompt: DUCT })
    await session.call('create', CUBE)
    const result = await session.call('record_response', { response: 'Built it.\n\nProblems met: none' })
    expect(result.error).toBeUndefined()
    const saved = loadProjectText(readFileSync(file, 'utf8'), 'duct.ndjson')
    expect(saved.promptOf(recorded.prompt.id)?.responses).toEqual([{ id: result.response.id, text: 'Built it.\n\nProblems met: none' }])
    expect(writeToolNames(createToolRegistry()).has('record_response')).toBe(true)
  })

  it('with no prompt recorded, refuses and writes nothing', async () => {
    const file = join(dir, 'duct.ndjson')
    const session = createProjectSession({ path: file, tools: createToolRegistry() })
    await session.call('create', CUBE)
    const before = readFileSync(file, 'utf8')
    const refused = await session.call('record_response', { response: 'done' })
    expect(refused.error).toMatch(/record_prompt/)
    expect(readFileSync(file, 'utf8')).toBe(before)
  })
})

describe('the instructions name record_prompt, inside the budget', () => {
  for (const [name, text] of /** @type {const} */ ([
    ['SERVER_INSTRUCTIONS', SERVER_INSTRUCTIONS],
    ['LIVE_SERVER_INSTRUCTIONS', LIVE_SERVER_INSTRUCTIONS],
  ])) {
    it(`${name}: one line to call record_prompt first with the user's request, at most 2,048 characters`, () => {
      const lines = text.split('\n').filter((line) => line.includes('record_prompt'))
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatch(/^Call `record_prompt` first with the user’s request/)
      expect(text.length).toBeLessThanOrEqual(2048)
    })
  }
})
