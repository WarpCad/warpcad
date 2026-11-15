// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/ai-035`: skills over the wire. The server is spawned as Claude Code spawns it and
 * spoken to by the SDK's own client over stdio; every assertion is about what a client sees.
 *
 * The server declares SEP-2640's `io.modelcontextprotocol/skills` extension, so it must answer
 * `skills/list` and `skills/get`, serve every skill file through ordinary `resources/read`, and
 * (because hosts can load a skill by URI alone) name the skill URIs in its instructions.
 */
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SKILLS_EXTENSION, loadSkills, parseFrontmatter } from './skills.js'

const SERVER = join(dirname(fileURLToPath(import.meta.url)), 'server.js')

/**
 * A pass-through Standard Schema: the client's custom-method `request` needs one for the result.
 *
 * @type {import('@modelcontextprotocol/client').StandardSchemaV1<unknown, any>}
 */
const ANY = { '~standard': { version: 1, vendor: 'warpcad-spec', validate: (value) => ({ value }) } }

/** @type {string} */
let dir
/** @type {Client} */
let client

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'warpcad-skills-mcp-'))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER, join(dir, 'p.ndjson')],
    env: { PATH: process.env.PATH ?? '' },
    stderr: 'pipe',
  })
  client = new Client({ name: 'skills-spec', version: '0.0.0' })
  await client.connect(transport)
})

afterAll(async () => {
  await client?.close().catch(() => {})
  rmSync(dir, { recursive: true, force: true })
})

/** @param {string} text */
const sha256 = (text) => `sha256:${createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')}`

describe('initialize', () => {
  it('declares the skills extension, with no optional features, beside resources', () => {
    const capabilities = client.getServerCapabilities()
    expect(capabilities?.extensions?.[SKILLS_EXTENSION]).toEqual({})
    expect(capabilities?.resources).toBeDefined()
  })

  it('names every shipped skill’s URI in the instructions, and no URI it does not serve', () => {
    const instructions = client.getInstructions() ?? ''
    const named = instructions.match(/skill:\/\/[^\s,;)]+\/SKILL\.md/g) ?? []
    expect(named.sort()).toEqual(loadSkills().skills.map((skill) => skill.uri).sort())
  })
})

describe('skills/list', () => {
  it('returns every skill as loadSkills sees it: uri, frontmatter, resources with digests', async () => {
    const result = await client.request({ method: 'skills/list', params: {} }, ANY)
    expect(result.skills).toEqual(loadSkills().skills)
    expect(result.skills.map((/** @type {{ uri: string }} */ skill) => skill.uri)).toEqual(
      expect.arrayContaining(['skill://add-clearances/SKILL.md', 'skill://create-enclosure/SKILL.md'])
    )
    expect(result.nextCursor).toBeUndefined()
  })
})

describe('skills/get', () => {
  it('returns one skill’s entry by its SKILL.md URI', async () => {
    const result = await client.request({ method: 'skills/get', params: { uri: 'skill://add-clearances/SKILL.md' } }, ANY)
    expect(result.skill).toEqual(loadSkills().skills.find((skill) => skill.uri === 'skill://add-clearances/SKILL.md'))
  })

  it.each([
    ['an unknown skill', { uri: 'skill://absent/SKILL.md' }],
    ['a non-skill resource', { uri: 'warpcad://guide' }],
    ['no uri at all', {}],
  ])('answers %s with -32602 (Invalid params)', async (_case, params) => {
    await expect(client.request({ method: 'skills/get', params }, ANY)).rejects.toMatchObject({ code: -32602 })
  })
})

describe('resources', () => {
  it('lists every skill file, a SKILL.md with its frontmatter’s name and description, beside the guide', async () => {
    const { resources } = await client.listResources()
    const uris = resources.map((resource) => resource.uri)
    expect(uris).toContain('warpcad://guide')
    for (const skill of loadSkills().skills) {
      for (const file of skill.resources) expect(uris).toContain(file.uri)
      expect(resources.find((resource) => resource.uri === skill.uri)).toMatchObject({
        name: skill.frontmatter.name,
        description: skill.frontmatter.description,
        mimeType: 'text/markdown',
      })
    }
  })

  it('reads a SKILL.md whose bytes match the listed digest and size, and whose frontmatter matches the entry', async () => {
    const { skills } = await client.request({ method: 'skills/list', params: {} }, ANY)
    for (const skill of skills) {
      for (const file of skill.resources) {
        const { contents } = await client.readResource({ uri: file.uri })
        expect(contents).toHaveLength(1)
        const text = /** @type {{ text: string }} */ (contents[0]).text
        expect(sha256(text)).toBe(file.digest)
        expect(Buffer.byteLength(text, 'utf8')).toBe(file.size)
      }
      const { contents } = await client.readResource({ uri: skill.uri })
      expect(contents[0]).toMatchObject({ uri: skill.uri, mimeType: 'text/markdown' })
      expect(parseFrontmatter(/** @type {{ text: string }} */ (contents[0]).text).frontmatter).toEqual(skill.frontmatter)
    }
  })

  it('refuses a skill URI it does not serve', async () => {
    await expect(client.readResource({ uri: 'skill://add-clearances/../../server.js' })).rejects.toThrow()
    await expect(client.readResource({ uri: 'skill://absent/SKILL.md' })).rejects.toThrow()
  })
})
