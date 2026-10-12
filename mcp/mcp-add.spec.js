// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/ai-016`: `npm run mcp:add -- <project-file>` registers the WarpCad MCP server with Claude
 * Code using paths it works out itself. Driven as a child process against a fake `claude` that
 * records its argv, then — the check the placeholder command never had — the argv it produced is
 * spawned for real and spoken to with an MCP client.
 */
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadProjectText } from './projectFile.js'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'mcp-add.mjs')
const SERVER = join(dirname(fileURLToPath(import.meta.url)), 'server.js')

/** @type {string} */
let dir
/** @type {string} */
let bin
/** @type {string} */
let log

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'warpcad-mcp-add-'))
  bin = join(dir, 'bin')
  log = join(dir, 'claude-argv.jsonl')
  mkdirSync(bin)
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

/**
 * A `claude` on PATH that appends its argv to a log. `mcp remove` exits 1, as the real CLI does
 * when nothing is registered, unless `registered` says there was an entry.
 *
 * @param {{ registered?: boolean }} [options]
 */
function fakeClaude({ registered = false } = {}) {
  const file = join(bin, 'claude')
  writeFileSync(
    file,
    `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n')
const [, verb] = process.argv.slice(2)
if (verb === 'remove' && ${registered ? 'false' : 'true'}) { console.error('No MCP server found with name: warpcad'); process.exit(1) }
`
  )
  chmodSync(file, 0o755)
}

/** @returns {string[][]} Every argv the fake `claude` saw, in order. */
function calls() {
  return existsSync(log)
    ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : []
}

/**
 * @param {string[]} args
 * @param {{ path?: string, cwd?: string }} [options]
 */
function run(args, { path = `${bin}${delimiter}${dirname(process.execPath)}`, cwd = dir } = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    env: { PATH: path, HOME: dir },
  })
}

describe('mcp:add', () => {
  it('registers the server with absolute paths, replacing an existing registration', () => {
    fakeClaude({ registered: true })
    const result = run(['bracket.ndjson'])
    expect(result.status, result.stderr).toBe(0)

    const all = calls()
    const add = all.find((argv) => argv[0] === 'mcp' && argv[1] === 'add')
    expect(add).toBeDefined()
    // Removed first, so a stale entry (the old placeholder) cannot survive.
    expect(all.findIndex((argv) => argv[1] === 'remove')).toBeGreaterThanOrEqual(0)
    expect(all.findIndex((argv) => argv[1] === 'remove')).toBeLessThan(all.indexOf(/** @type {string[]} */ (add)))

    const argv = /** @type {string[]} */ (add)
    const rest = argv.slice(argv.indexOf('--') + 1)
    expect(rest[0]).toBe('node')
    expect(isAbsolute(rest[1])).toBe(true)
    expect(rest[1]).toBe(SERVER)
    expect(isAbsolute(rest[2])).toBe(true)
    expect(rest[2]).toMatch(/bracket\.ndjson$/)
    // User scope: "start Claude Code in any folder" must work, and the default scope is per-folder.
    expect(add).toContain('user')
    // What it did is printed, with the real paths.
    expect(result.stdout).toContain(SERVER)
    expect(result.stdout).toContain(rest[2])
  })

  it('still adds when nothing was registered (remove fails, which is fine)', () => {
    fakeClaude()
    const result = run(['bracket.ndjson'])
    expect(result.status, result.stderr).toBe(0)
    expect(calls().some((argv) => argv[1] === 'add')).toBe(true)
  })

  it('creates a missing project file, and it loads through projectFile.js', () => {
    fakeClaude()
    const result = run(['new-part.ndjson'])
    expect(result.status, result.stderr).toBe(0)
    const file = join(dir, 'new-part.ndjson')
    expect(existsSync(file)).toBe(true)
    expect(loadProjectText(readFileSync(file, 'utf8'), 'new-part.ndjson').bodies()).toHaveLength(0)
  })

  it('leaves an existing project file untouched', () => {
    fakeClaude()
    const file = join(dir, 'p.ndjson')
    const text = '{"id":"base","op":"primitive.cuboid","name":"Base","params":{"size":[40,40,4],"center":[0,0,2]}}\n'
    writeFileSync(file, text)
    expect(run(['p.ndjson']).status).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe(text)
  })

  it('refuses a file that is not a WarpCad project, registering nothing', () => {
    fakeClaude()
    writeFileSync(join(dir, 'notes.ndjson'), 'this is not a project\n')
    const result = run(['notes.ndjson'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/notes\.ndjson/)
    expect(calls()).toEqual([])
  })

  it('says plainly when the claude CLI is missing', () => {
    const empty = join(dir, 'empty')
    mkdirSync(empty)
    const result = run(['bracket.ndjson'], { path: empty })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/claude/i)
    expect(result.stderr).toMatch(/not found|install|PATH/i)
  })

  it('names the problem when the project file is in a folder that does not exist', () => {
    fakeClaude()
    const result = run(['no-such-folder/part.ndjson'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/no-such-folder/)
    expect(calls()).toEqual([])
  })

  it('needs exactly one project file argument', () => {
    fakeClaude()
    const result = run([])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/usage/i)
  })

  it('produces a command a real MCP client can initialize and list tools against', async () => {
    fakeClaude()
    expect(run(['bracket.ndjson']).status).toBe(0)
    const add = /** @type {string[]} */ (calls().find((argv) => argv[1] === 'add'))
    const [command, ...args] = add.slice(add.indexOf('--') + 1)
    const transport = new StdioClientTransport({
      command: command === 'node' ? process.execPath : command,
      args,
      env: { PATH: process.env.PATH ?? '' },
      stderr: 'pipe',
    })
    const client = new Client({ name: 'mcp-add-spec', version: '0.0.0' })
    try {
      await client.connect(transport)
      const { tools } = await client.listTools()
      expect(tools.map((tool) => tool.name)).toContain('describe_scene')
    } finally {
      await client.close().catch(() => {})
    }
  })
})
