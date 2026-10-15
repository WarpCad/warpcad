// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { settle, shot } from './support.js'

/**
 * Docs media for `docs/mcp.md` (`TODO/ai-009`, `TODO/io-010`): the note the app shows after the
 * MCP server edits the open file — **Merged 1 step from Claude Code**, with Undo merge — beside
 * the History row it brought in, marked `via mcp` with its intent. No dialog: the change merges
 * on focus. The edit is made by **the real server** (`mcp/server.js`
 * over stdio, as Claude Code drives it), on a real file the page reads through a File System
 * Access handle backed by `page.exposeFunction` — the one thing nothing headless can click is
 * the OS picker. Laptop, Chromium only.
 */

const NAME = 'bracket.ndjson'
const BRACKET = '{"id":"bracket","op":"primitive.cuboid","name":"Bracket","params":{"size":[30,10,20],"center":[0,0,13]}}\n'
const mcpRequire = createRequire(join(process.cwd(), 'mcp', 'package.json'))
const { Client } = mcpRequire('@modelcontextprotocol/client')
const { StdioClientTransport } = mcpRequire('@modelcontextprotocol/client/stdio')

/** @param {string} file */
async function addBasePlate(file) {
  const client = new Client({ name: 'docs-media', version: '0.0.0' })
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [join(process.cwd(), 'mcp', 'server.js'), file], stderr: 'ignore' })
  )
  try {
    await client.callTool({
      name: 'create',
      arguments: {
        op: 'primitive.cuboid',
        positionMm: [0, 0, 0],
        params: { size: [60, 40, 3] },
        rationale: 'Base plate',
        request: 'add a 3 mm base plate under the bracket',
      },
    })
  } finally {
    await client.close()
  }
}

const FAKE_NATIVE = () => {
  const handle = {
    kind: 'file',
    name: 'bracket.ndjson',
    async getFile() {
      const disk = await window.__diskRead()
      return new File([disk.text], 'bracket.ndjson', { type: 'text/plain', lastModified: disk.lastModified })
    },
    async createWritable() {
      throw new DOMException('docs media never writes', 'NotAllowedError')
    },
  }
  Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [handle] })
  Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => handle })
}

test.describe('docs media: MCP server', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** @type {string} */
  let dir
  /** @type {string} */
  let file
  test.beforeEach(async ({ page }) => {
    dir = mkdtempSync(join(tmpdir(), 'warpcad-mcp-docs-'))
    file = join(dir, NAME)
    writeFileSync(file, BRACKET)
    await page.exposeFunction('__diskRead', () => ({ text: readFileSync(file, 'utf8'), lastModified: Math.floor(statSync(file).mtimeMs) }))
    await page.addInitScript(FAKE_NATIVE)
    await page.goto('/')
    const viewport = page.getByTestId('viewport')
    await expect(viewport).toHaveAttribute('data-webgl', 'ready')
    await expect.poll(async () => Number(await viewport.getAttribute('data-frames-rendered'))).toBeGreaterThan(1)
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('file-open').click()
    await expect(viewport).toHaveAttribute('data-body-count', '1')
    await addBasePlate(file)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByTestId('merge-toast')).toBeVisible()
    await expect(viewport).toHaveAttribute('data-body-count', '2')
    await page.getByTestId('timeline-toggle').click()
    await expect(page.getByTestId('timeline-panel')).toBeVisible()
    await page.getByTestId('timeline-intent-toggle').click()
    await expect(page.getByTestId('timeline-intent')).toContainText('add a 3 mm base plate under the bracket')
    await settle(page)
  })
  // `afterEach` also runs for a test the laptop-only skip above skipped, when `dir` was never set.
  test.afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('mcp-merged still', async ({ page }) => {
    await shot(page, 'mcp-merged.png')
  })
})
