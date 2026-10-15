// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * `TODO/io-010` (builds on `TODO/ai-009`) — the app and **the real MCP server** edit one file,
 * against `/`. The app opens a project file; the real server (`node mcp/server.js <file>`, spoken
 * to over stdio by the SDK's own client, exactly as Claude Code does) edits that file on disk;
 * the app regains focus and **merges the change in**: no dialog, a toast, the user's unsaved
 * work still there, and the next Save writes both. A second case forces a conflict (the banner);
 * a third asks for the dialog the way a different project does.
 *
 * ## What is real and what is not
 *
 * Real: the app, its merge, the real `mcp/server.js` child process and its file locking and
 * atomic rename, the file on disk. Not real: the OS file picker — nothing headless can drive a
 * File System Access dialog — so `showOpenFilePicker` is replaced by an init script whose handle
 * reads and writes **the real file on disk** through `page.exposeFunction`: the bytes the app
 * sees are the bytes the server wrote. The fallback route (`<input type=file>` and **File ▾ →
 * Merge file…**) is driven for real with Playwright's file chooser. Also not real: Claude Code
 * itself — the server is driven by the SDK client with the same tool calls it would make.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`, Browser Support)
 *
 * - The **handle path is Chromium only by platform**: File System Access (a handle the app can
 *   read again on focus) exists only in desktop Chromium, so those cases `test.skip` on Firefox
 *   and WebKit, and run at the laptop viewport. An injected handle proves the app's watch and
 *   merge logic, not that an engine ships the API; `docs/mcp.md` states which engines have it.
 * - The **Merge file… fallback** case is what Safari, Firefox and every phone use, so it runs on
 *   all three engines at all three viewports, with a snapshot at each.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'mcp-merge-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const NAME = 'bracket.ndjson'
const REQUEST = 'add a 20 mm sphere beside the bracket'
const BRACKET = '{"id":"bracket","op":"primitive.cuboid","name":"Bracket","params":{"size":[30,10,20],"center":[0,0,13]}}\n'
/** A different project that reuses the id `bracket` for another body. */
const OTHER_PROJECT = '{"id":"bracket","op":"primitive.sphere","name":"Ball","params":{"diameter":30,"center":[0,0,15]}}\n'
const MOVE = { id: 'move-1', op: 'transform.translate', target: 'bracket', supersedes: 'bracket', params: { vector: [30, 0, 0] } }

/** The MCP SDK client lives in `mcp/node_modules` (`docs/decisions/ai-partner.md` decision 3). */
const mcpRequire = createRequire(join(process.cwd(), 'mcp', 'package.json'))
const { Client } = mcpRequire('@modelcontextprotocol/client')
const { StdioClientTransport } = mcpRequire('@modelcontextprotocol/client/stdio')

/**
 * Start the real server on `file`, make the tool calls, and stop it.
 *
 * @param {string} file
 * @param {{ name: string, args: Record<string, unknown> }[]} calls
 * @returns {Promise<string[]>} Each call's result text.
 */
async function mcpCalls(file, calls) {
  const client = new Client({ name: 'mcp-merge-e2e', version: '0.0.0' })
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [join(process.cwd(), 'mcp', 'server.js'), file], stderr: 'ignore' })
  )
  try {
    /** @type {string[]} */
    const texts = []
    for (const { name, args } of calls) {
      const response = /** @type {any} */ (await client.callTool({ name, arguments: args }))
      expect(response.isError ?? false, `${name} ${JSON.stringify(response.content)}`).toBe(false)
      texts.push(String(response.content?.[0]?.text ?? ''))
    }
    return texts
  } finally {
    await client.close()
  }
}

/** A sphere beside the bracket, as Claude Code would ask for it. */
const addSphere = (/** @type {string} */ file) =>
  mcpCalls(file, [
    { name: 'create', args: { op: 'primitive.sphere', positionMm: [60, 0, 0], params: { diameter: 20 }, request: REQUEST } },
  ])

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

/** What the browser does when the user switches back from the terminal. @param {import('@playwright/test').Page} page */
async function focusBack(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

/**
 * Run `fn` against the page's document store — the command layer, never a raw mutation.
 *
 * @param {import('@playwright/test').Page} page
 * @param {(api: any, arg: any) => any} fn
 * @param {any} [arg]
 */
function withStore(page, fn, arg) {
  return page.evaluate(
    async ({ source, arg }) => {
      const documentModule = await import('/src/stores/document.js')
      const api = { documentStore: documentModule.useDocumentStore() }
      return await new Function('api', 'arg', `return (${source})(api, arg)`)(api, arg)
    },
    { source: fn.toString(), arg },
  )
}

/** @param {import('@playwright/test').TestInfo} info */
const handlePathOnly = (info) => {
  test.skip(info.project.name !== 'chromium-laptop', 'File System Access (a handle the app can re-read) is desktop Chromium only; laptop viewport')
}

/** The bracket moved, unsaved, in the app. @param {import('@playwright/test').Page} page */
async function moveBracket(page) {
  await withStore(page, (api, move) => api.documentStore.append(move), MOVE)
  await expect(page.getByTestId('scene-bodies').locator('[data-body-name="Bracket"]')).toHaveAttribute('data-body-center', '30.00,0.00,13.00')
}

test('the server adds a sphere while a move is unsaved here: focus merges it, a toast says so, no dialog, and Save writes both', async ({ page }, testInfo) => {
  handlePathOnly(testInfo)
  await useRealDisk(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await openNative(page)

  // Nothing changed yet: focus is silent.
  await focusBack(page)
  await page.waitForTimeout(200)
  await expect(page.getByTestId('disk-change')).toHaveCount(0)
  await expect(page.getByTestId('merge-toast')).toHaveCount(0)

  await moveBracket(page)
  await addSphere(file)
  await focusBack(page)

  // Both are there; the toast names the source; the user was never asked anything.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const bodies = page.getByTestId('scene-bodies')
  await expect(bodies.locator('[data-body-name="Bracket"]')).toHaveAttribute('data-body-center', '30.00,0.00,13.00')
  await expect(page.getByTestId('merge-toast-text')).toHaveText('Merged 1 step from Claude Code')
  await expect(page.getByTestId('merge-undo')).toBeVisible()
  await expect(page.getByTestId('disk-change')).toHaveCount(0)
  await expect(page.getByTestId('merge-banner')).toHaveCount(0)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `toast-${testInfo.project.name}.png`) })

  // History shows the row as the server's, with its intent.
  await openHistory(page)
  const row = page.locator('li.row-wrap', { has: page.locator('[data-step-id]:not([data-step-id="bracket"]):not([data-step-id="move-1"])') })
  await expect(row.getByTestId('chip-origin')).toHaveText('via mcp')
  await row.getByTestId('timeline-intent-toggle').click()
  await expect(row.getByTestId('timeline-intent')).toContainText(REQUEST)

  // In step with the file: another focus changes nothing and asks nothing.
  await focusBack(page)
  await page.waitForTimeout(200)
  await expect(page.getByTestId('disk-change')).toHaveCount(0)

  // Save writes the merged project — and the server then reads a file with both changes.
  await openFileMenu(page)
  await page.getByTestId('file-save').click()
  await expect(page.getByTestId('save-status')).toHaveAttribute('aria-label', /^Saved to bracket\.ndjson/)
  await expect(page.getByTestId('disk-change')).toHaveCount(0)
  await expect.poll(() => readFileSync(file, 'utf8')).toContain('transform.translate')
  const written = readFileSync(file, 'utf8')
  expect(written).toContain('primitive.sphere')
  const [scene] = await mcpCalls(file, [{ name: 'describe_scene', args: {} }])
  expect(scene).toMatch(/"count":\s*2/)
  expect(scene).toContain('30')
  // And the server's next write lands on top of the app's save, still one coherent file.
  await mcpCalls(file, [
    { name: 'create', args: { op: 'primitive.cuboid', positionMm: [0, 60, 0], params: { size: [10, 10, 10] }, request: 'add a spacer' } },
  ])
  await focusBack(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  await expect(bodies.locator('[data-body-name="Bracket"]')).toHaveAttribute('data-body-center', '30.00,0.00,13.00')
})

test('a move here against a fillet from the server: the conflict banner naming both steps, not a dialog', async ({ page }, testInfo) => {
  handlePathOnly(testInfo)
  await useRealDisk(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await openNative(page)

  await moveBracket(page)
  // Several server writes, so its stamps are later than the move's; the last one is the fillet.
  await mcpCalls(file, [
    { name: 'create', args: { op: 'primitive.sphere', positionMm: [60, 0, 0], params: { diameter: 20 }, request: 'a ball' } },
    { name: 'create', args: { op: 'primitive.sphere', positionMm: [90, 0, 0], params: { diameter: 20 }, request: 'another ball' } },
    { name: 'operate', args: { op: 'modify.filletRim', operands: [{ id: 'bracket' }], params: { orientation: 'z+', radius: 2 }, request: 'round the top edge' } },
  ])
  await focusBack(page)

  await expect(page.getByTestId('merge-banner')).toBeVisible()
  await expect(page.getByTestId('merge-banner-text')).toContainText('conflicted')
  await expect(page.getByTestId('merge-undo')).toBeVisible()
  await expect(page.getByTestId('disk-change')).toHaveCount(0)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `banner-${testInfo.project.name}.png`) })

  // Exactly one of the two competing steps is kept and the other is flagged, never re-parented.
  // *Which* one is not fixed: the two writers' clocks tie at 1, so the random replica ids order
  // the two runs of rows (`docs/decisions/document-sync.md`, same-gap order), and the run that
  // folds second is the one flagged. Assert the documented outcome for either order.
  await page.getByTestId('merge-banner-show').click()
  await expect(page.getByTestId('chip-broken')).toHaveCount(1)
  const reason = await page.getByTestId('timeline-broken-reason').textContent()
  expect(reason).toMatch(/^conflicts with step \d+ \((Move|Fillet) Bracket/)
  const moveWon = /\(Move Bracket/.test(reason ?? '')
  await expect(page.getByTestId('scene-bodies').locator('[data-body-name="Bracket"]')).toHaveAttribute(
    'data-body-center',
    moveWon ? '30.00,0.00,13.00' : '0.00,0.00,13.00',
  )
})

test('a different project in the file still asks: the dialog says why, Save asks instead of overwriting, Overwrite is explicit', async ({ page }, testInfo) => {
  handlePathOnly(testInfo)
  await useRealDisk(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await openNative(page)
  writeFileSync(file, OTHER_PROJECT)

  await focusBack(page)
  const dialog = page.getByTestId('disk-change')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-label', `${NAME} changed on disk and can't be merged.`)
  await expect(page.getByTestId('disk-change-reason')).toContainText('is a different project')
  await expect(page.getByTestId('save-status')).toHaveAttribute('aria-label', 'File changed on disk — Reload')
  await expect(page.getByTestId('disk-change-cancel')).toBeFocused()
  for (const id of ['disk-change-reload', 'disk-change-overwrite', 'disk-change-cancel']) {
    const r = await reach(page, id)
    expect(r, id).toMatchObject({ found: true, onScreen: true, topmost: true })
    expect(r.height, `${id} height`).toBeGreaterThanOrEqual(44)
  }
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  await page.getByTestId('disk-change-cancel').click()
  await expect(dialog).toHaveCount(0)
  // The same change does not nag on every focus; the chip asks again.
  await focusBack(page)
  await page.waitForTimeout(200)
  await expect(dialog).toHaveCount(0)
  await page.getByTestId('save-status').click()
  await expect(dialog).toBeVisible()
  await page.getByTestId('disk-change-cancel').click()

  // Save would overwrite the other project: it asks instead, and the file is untouched.
  await openFileMenu(page)
  await page.getByTestId('file-save').click()
  await expect(dialog).toBeVisible()
  expect(readFileSync(file, 'utf8')).toBe(OTHER_PROJECT)

  await page.getByTestId('disk-change-overwrite').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('save-status')).toHaveAttribute('aria-label', /^Saved to bracket\.ndjson/)
  await expect.poll(() => readFileSync(file, 'utf8')).toBe(BRACKET)
})

test('a file broken on disk is refused by name on Reload, and the project is left alone', async ({ page }, testInfo) => {
  handlePathOnly(testInfo)
  await useRealDisk(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await openNative(page)
  await addSphere(file)
  const text = readFileSync(file, 'utf8')
  writeFileSync(file, text.slice(0, BRACKET.length + 25)) // a copy cut off mid-line

  await focusBack(page)
  await expect(page.getByTestId('disk-change-reason')).toContainText("Couldn't read bracket.ndjson: line 2 is not valid JSON")
  await page.getByTestId('disk-change-reload').click()
  await expect(page.getByTestId('save-status')).toHaveAttribute('aria-label', /^Couldn't open bracket\.ndjson: line 2 is not valid JSON/)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
})

test('File ▾ → Reload from disk is still there: discard what is here, take the file', async ({ page }, testInfo) => {
  handlePathOnly(testInfo)
  await useRealDisk(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await openNative(page)
  await moveBracket(page)
  await addSphere(file)
  await focusBack(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  await openFileMenu(page)
  const r = await reach(page, 'file-disk-reload')
  expect(r).toMatchObject({ found: true, onScreen: true, topmost: true })
  expect(r.height).toBeGreaterThanOrEqual(44)
  await page.getByTestId('file-disk-reload').click()
  await expect(page.getByTestId('disk-change')).toBeVisible()
  await expect(page.getByTestId('disk-change-reason')).toContainText('Reload replaces this project')
  await page.getByTestId('disk-change-reload').click()
  // The file never had the move: the bracket is back where the file says it is.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('scene-bodies').locator('[data-body-name="Bracket"]')).toHaveAttribute('data-body-center', '0.00,0.00,13.00')
  await expect(page.getByTestId('save-status')).toHaveAttribute('aria-label', `Opened ${NAME} · 2 steps`)
})

test('without a handle (Safari, Firefox, a phone) the page cannot watch the file: File ▾ → Merge file… brings the server\'s step in', async ({ page }, testInfo) => {
  await page.addInitScript(FORCE_FALLBACK)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()

  await openFileMenu(page)
  let chooser = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  await (await chooser).setFiles(file)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  await moveBracket(page)
  await addSphere(file)
  await focusBack(page)
  await page.waitForTimeout(300)
  // Nothing can be seen from here, and nothing false is claimed.
  await expect(page.getByTestId('disk-change')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('save-status')).not.toHaveAttribute('aria-label', 'File changed on disk — Reload')

  await openFileMenu(page)
  const item = page.getByTestId('file-merge')
  await expect(item).toBeVisible()
  chooser = page.waitForEvent('filechooser')
  await item.click()
  await (await chooser).setFiles(file)

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('scene-bodies').locator('[data-body-name="Bracket"]')).toHaveAttribute('data-body-center', '30.00,0.00,13.00')
  await expect(page.getByTestId('merge-toast-text')).toHaveText(`Merged 1 step from ${NAME}`)
  await expect(page.getByTestId('disk-change')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `merge-file-${testInfo.project.name}.png`) })

  await openHistory(page)
  const row = page.locator('li.row-wrap', { has: page.locator('[data-step-id]:not([data-step-id="bracket"]):not([data-step-id="move-1"])') })
  await expect(row.getByTestId('chip-origin')).toHaveText('via mcp')
  await page.getByTestId('merge-undo').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
})
