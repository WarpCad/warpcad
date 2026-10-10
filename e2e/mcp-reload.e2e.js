// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * `TODO/ai-009` — the app side of the MCP server, against `/`: the app opens a project file,
 * **the real MCP server** (`node mcp/server.js <file>`, spoken to over stdio by the SDK's own
 * client, exactly as Claude Code does) appends a step to that file on disk, the app regains
 * focus, and the `File changed on disk — Reload` dialog appears; Reload brings the new History
 * row in with its `via mcp` chip and its intent.
 *
 * ## The one thing not real: the OS file picker
 *
 * Nothing headless can drive a File System Access dialog, so `showOpenFilePicker` is replaced
 * by an init script whose handle reads and writes **the real file on disk** through
 * `page.exposeFunction` — the bytes the app sees are the bytes the server wrote. The fallback
 * path (`<input type=file>`) is driven for real with Playwright's file chooser.
 *
 * ## Engines and viewports, stated
 *
 * All three reference viewports (a new dialog sheet over the 390px header). Chromium and
 * WebKit; Firefox cannot launch in this sandbox (`TROUBLESHOOTING.md`, 2026-09-17), so the
 * claim is those two. The native-handle tests run the app's watch logic in both engines against
 * the injected handle; *which engine really has File System Access* (desktop Chromium only) is
 * not something an injected API can prove, and is stated in `docs/mcp.md` instead.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'mcp-reload-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const NAME = 'bracket.ndjson'
const REQUEST = 'add a 3 mm base plate under the bracket'
const BRACKET = '{"id":"bracket","op":"primitive.cuboid","name":"Bracket","params":{"size":[30,10,20],"center":[0,0,13]}}\n'

/** The MCP SDK client lives in `mcp/node_modules` (`docs/decisions/ai-partner.md` decision 3). */
const mcpRequire = createRequire(join(process.cwd(), 'mcp', 'package.json'))
const { Client } = mcpRequire('@modelcontextprotocol/client')
const { StdioClientTransport } = mcpRequire('@modelcontextprotocol/client/stdio')

/**
 * Start the real server on `file`, make one tool call, and stop it.
 *
 * @param {string} file
 * @param {string} name
 * @param {Record<string, unknown>} args
 */
async function mcpCall(file, name, args) {
  const client = new Client({ name: 'mcp-reload-e2e', version: '0.0.0' })
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [join(process.cwd(), 'mcp', 'server.js'), file], stderr: 'ignore' })
  )
  try {
    const response = await client.callTool({ name, arguments: args })
    expect(response.isError ?? false).toBe(false)
    return response
  } finally {
    await client.close()
  }
}

/** A plate under the bracket, as Claude Code would ask for it. */
const addPlate = (/** @type {string} */ file) =>
  mcpCall(file, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [60, 40, 3] }, request: REQUEST })

/**
 * File System Access whose one handle is the real file on disk, through two exposed functions.
 */
const FAKE_NATIVE = () => {
  const handle = {
    kind: 'file',
    name: 'bracket.ndjson',
    async getFile() {
      const disk = await window.__diskRead()
      return new File([disk.text], 'bracket.ndjson', { type: 'text/plain', lastModified: disk.lastModified })
    },
    async createWritable() {
      let buffer = ''
      return {
        async write(/** @type {string} */ text) {
          buffer += text
        },
        async close() {
          await window.__diskWrite(buffer)
        },
      }
    },
  }
  Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [handle] })
  Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => handle })
}

const FORCE_FALLBACK = () => {
  Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
}

/** @type {string} */
let dir
/** @type {string} */
let file

test.beforeEach(async ({ page }) => {
  dir = mkdtempSync(join(tmpdir(), 'warpcad-mcp-e2e-'))
  file = join(dir, NAME)
  writeFileSync(file, BRACKET)
  page.on('dialog', (dialog) => {
    throw new Error(`unexpected ${dialog.type()} dialog: ${dialog.message()}`)
  })
})

test.afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** @param {import('@playwright/test').Page} page */
async function useRealDisk(page) {
  await page.exposeFunction('__diskRead', () => ({ text: readFileSync(file, 'utf8'), lastModified: Math.floor(statSync(file).mtimeMs) }))
  await page.exposeFunction('__diskWrite', (/** @type {string} */ text) => writeFileSync(file, text))
  await page.addInitScript(FAKE_NATIVE)
}

/** @param {import('@playwright/test').Page} page */
async function openFileMenu(page) {
  await page.getByTestId('file-menu-button').click()
  await expect(page.getByTestId('file-menu')).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function openNative(page) {
  await openFileMenu(page)
  await page.getByTestId('file-open').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('save-status')).toHaveAttribute('aria-label', `Opened ${NAME} · 1 step`)
}

/** What the browser does when the user switches back from the terminal. @param {import('@playwright/test').Page} page */
async function focusBack(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

/**
 * Height and on-screen-ness of a control, and whether a tap at its centre lands on it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 */
async function reach(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return { found: false, height: 0, onScreen: false, topmost: false }
    const box = el.getBoundingClientRect()
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return {
      found: true,
      height: box.height,
      onScreen: box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight,
      topmost: top !== null && (el === top || el.contains(top)),
    }
  }, testId)
}

/** @param {import('@playwright/test').Page} page */
async function openHistory(page) {
  if (await page.getByTestId('timeline-panel').isVisible()) return
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
}

test('the MCP server appends to the open file: focus asks to Reload, and the row arrives via mcp with its intent', async ({ page }, testInfo) => {
  await useRealDisk(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await openNative(page)

  // Nothing changed yet: focus is silent.
  await focusBack(page)
  await page.waitForTimeout(200)
  await expect(page.getByTestId('disk-change')).toHaveCount(0)

  await addPlate(file)
  await focusBack(page)

  const dialog = page.getByTestId('disk-change')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-label', `${NAME} changed on disk since you opened or saved it.`)
  await expect(page.getByTestId('save-status')).toHaveAttribute('aria-label', 'File changed on disk — Reload')
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'warn')
  // Cancel is the default: a stray Enter replaces nothing.
  await expect(page.getByTestId('disk-change-cancel')).toBeFocused()
  // The project is untouched until the user answers.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  for (const id of ['disk-change-reload', 'disk-change-overwrite', 'disk-change-cancel']) {
    const r = await reach(page, id)
    expect(r, id).toMatchObject({ found: true, onScreen: true, topmost: true })
    expect(r.height, `${id} height`).toBeGreaterThanOrEqual(44)
  }
  const viewportWidth = /** @type {{ width: number }} */ (page.viewportSize()).width
  if (viewportWidth <= 390) {
    const box = /** @type {{ width: number }} */ (await dialog.boundingBox())
    expect(box.width).toBeGreaterThanOrEqual(390 - 16 - 1)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `prompt-${testInfo.project.name}.png`) })

  await page.getByTestId('disk-change-reload').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('save-status')).toHaveAttribute('aria-label', `Opened ${NAME} · 2 steps`)

  await openHistory(page)
  const row = page.locator('li.row-wrap', { has: page.getByTestId('timeline-row-2') })
  await expect(row.getByTestId('chip-origin')).toHaveText('via mcp')
  await expect(page.getByTestId('timeline-row-1').getByTestId('chip-origin')).toHaveCount(0)
  await row.getByTestId('timeline-intent-toggle').click()
  await expect(row.getByTestId('timeline-intent')).toContainText(REQUEST)
  await expect(row.getByTestId('timeline-intent-origin')).toHaveText('via mcp')
  await page.screenshot({ path: join(SNAPSHOT_DIR, `history-${testInfo.project.name}.png`) })

  // In step with the file again: another focus asks nothing.
  await focusBack(page)
  await page.waitForTimeout(200)
  await expect(dialog).toHaveCount(0)
})

test('Cancel keeps asking from the chip and the File menu; Save asks instead of overwriting; Overwrite is explicit', async ({ page }) => {
  await useRealDisk(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await openNative(page)
  await addPlate(file)
  const changed = readFileSync(file)

  await focusBack(page)
  await page.getByTestId('disk-change-cancel').click()
  await expect(page.getByTestId('disk-change')).toHaveCount(0)
  await expect(page.getByTestId('save-status')).toHaveAttribute('aria-label', 'File changed on disk — Reload')
  // The same change does not nag on every focus.
  await focusBack(page)
  await page.waitForTimeout(200)
  await expect(page.getByTestId('disk-change')).toHaveCount(0)

  // The File menu row — the 44px way back in on a phone, where the chip is a dot.
  await openFileMenu(page)
  await expect(page.getByTestId('file-menu-status')).toHaveText('File changed on disk — Reload')
  const r = await reach(page, 'file-disk-reload')
  expect(r).toMatchObject({ found: true, onScreen: true, topmost: true })
  expect(r.height).toBeGreaterThanOrEqual(44)
  await page.getByTestId('file-disk-reload').click()
  await expect(page.getByTestId('disk-change')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('disk-change')).toHaveCount(0)

  // The chip itself asks again.
  await page.getByTestId('save-status').click()
  await expect(page.getByTestId('disk-change')).toBeVisible()
  await page.getByTestId('disk-change-cancel').click()

  // Save would overwrite the server's step: it asks instead, and the file is untouched.
  await openFileMenu(page)
  await page.getByTestId('file-save').click()
  await expect(page.getByTestId('disk-change')).toBeVisible()
  expect(readFileSync(file).equals(changed)).toBe(true)

  // Only the explicit answer overwrites.
  await page.getByTestId('disk-change-overwrite').click()
  await expect(page.getByTestId('disk-change')).toHaveCount(0)
  await expect(page.getByTestId('save-status')).toHaveAttribute('aria-label', /^Saved to bracket\.ndjson/)
  await expect.poll(() => readFileSync(file, 'utf8')).toBe(BRACKET)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
})

test('a file broken on disk is refused by name on Reload, and the project is left alone', async ({ page }) => {
  await useRealDisk(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await openNative(page)
  await addPlate(file)
  const text = readFileSync(file, 'utf8')
  writeFileSync(file, text.slice(0, BRACKET.length + 25)) // a copy cut off mid-line

  await focusBack(page)
  await page.getByTestId('disk-change-reload').click()
  await expect(page.getByTestId('save-status')).toHaveAttribute('aria-label', /^Couldn't open bracket\.ndjson: line 2 is not valid JSON/)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
})

test('the fallback path cannot see the disk, says nothing false, and File ▸ Open… brings the rows in', async ({ page }) => {
  await page.addInitScript(FORCE_FALLBACK)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()

  await openFileMenu(page)
  let chooser = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  await (await chooser).setFiles(file)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  await addPlate(file)
  await focusBack(page)
  await page.waitForTimeout(300)
  await expect(page.getByTestId('disk-change')).toHaveCount(0)
  await expect(page.getByTestId('save-status')).not.toHaveAttribute('aria-label', 'File changed on disk — Reload')

  await openFileMenu(page)
  chooser = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  await page.getByTestId('file-open-confirm-replace').click()
  await (await chooser).setFiles(file)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await openHistory(page)
  const row = page.locator('li.row-wrap', { has: page.getByTestId('timeline-row-2') })
  await expect(row.getByTestId('chip-origin')).toHaveText('via mcp')
  await row.getByTestId('timeline-intent-toggle').click()
  await expect(row.getByTestId('timeline-intent')).toContainText(REQUEST)
})
