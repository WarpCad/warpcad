// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { agentCall, installFakeWebMcp, registeredNames } from './support/fakeWebMcp.js'

/**
 * `TODO/ai-032` — **Add reply…** on a prompt that has none (the Fan Duct shape), against the real
 * app at `/`:
 *
 * - A browser agent (the WebMCP stand-in) records a prompt and builds one body, and never replies:
 *   the project holds a request with no answer, like a file saved before replies existed.
 * - Selecting the body shows the Inspector's **Prompt** row with **Add reply…** under it, a
 *   full-width tap target. It opens a text area; pasted text and **Add** show the reply under the
 *   request, collapsed with **Show all**. The text is inert: markup is shown as characters.
 * - **Undo** takes it back; the request stays.
 * - Added again, it survives a reload (IndexedDB autosave): it is in the project.
 * - An agent's own `record_response` is refused before `record_prompt`, then shows under the
 *   request at once — it adds no row, so this is the store refresh for a row-less write — and is
 *   autosaved.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three viewports — the control sits in the Inspector, a bottom sheet at phone width, where it
 * must fill the width and never scroll the page sideways — with a snapshot at each. All three
 * engines: the reply is document state persisted through IndexedDB and read back after a reload.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'prompt-response-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const DUCT = 'a 140 × 250 mm fan duct, 1.6 mm walls'
const REPLY = [
  'Built the fan duct: 140 × 250 mm outside, 1.6 mm walls, 30 mm deep.',
  '',
  '## Problems met',
  '- The 1.6 mm wall is 4 nozzle widths; kept it. <img src=x onerror="window.__pwned = 1">',
  '- check_printability flagged an overhang at the lip; added a 45° chamfer.',
  '- Nothing else.',
].join('\n')

/**
 * Select a body from the Inspector's object list, the way a user who cannot see it would.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
async function selectFromList(page, id) {
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
  if (!(await page.getByTestId('object-list').isVisible())) await page.getByTestId('inspector-objects-header').click()
  await page.getByTestId(`objects-row-${id}`).click()
  await expect(page.getByTestId('inspector-name')).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function waitForAutosave(page) {
  await expect(page.getByTestId('save-status-text')).toHaveText(/^Saved · \d\d:\d\d$/, { timeout: 10_000 })
}

/** @param {import('@playwright/test').Page} page */
const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test('Add reply… on a prompt with none: paste, Add, shown under the request; Undo takes it back; it survives a reload', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => {
    throw new Error(`unexpected ${dialog.type()} dialog: ${dialog.message()}`)
  })
  await installFakeWebMcp(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect.poll(() => registeredNames(page)).toContain('record_prompt')

  // Seed: a request and the body built for it — and no reply.
  expect((await agentCall(page, 'record_prompt', { prompt: DUCT })).ok).toBe(true)
  const shell = await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [140, 250, 30] } })
  expect(shell.ok, JSON.stringify(shell)).toBe(true)
  const shellId = shell.applied[0].bodyId

  await selectFromList(page, shellId)
  await expect(page.getByTestId('inspector-prompt')).toContainText(DUCT)
  await expect(page.getByTestId('prompt-reply-text')).toHaveCount(0)

  // Add reply…: a full-width tap target under the request.
  const add = page.getByTestId('prompt-reply-add')
  await add.scrollIntoViewIfNeeded()
  await expect(add).toBeVisible()
  const [addBox, rowBox] = await Promise.all([add.boundingBox(), page.getByTestId('inspector-prompt').boundingBox()])
  expect(addBox && rowBox && addBox.width >= rowBox.width - 1, 'Add reply… fills the row').toBe(true)
  expect(addBox && addBox.height >= 44, 'Add reply… is a tap target').toBe(true)
  await add.click()
  const input = page.getByTestId('prompt-reply-input')
  await expect(input).toBeFocused()
  await expect(page.getByTestId('prompt-reply-submit')).toBeDisabled()
  await input.fill(REPLY)
  await page.getByTestId('prompt-reply-submit').click()

  // Shown under the request, collapsed, as characters.
  const reply = page.getByTestId('prompt-reply-text')
  await expect(page.getByTestId('prompt-reply-form')).toHaveCount(0)
  await expect(reply).toContainText('Built the fan duct')
  await expect(reply).toContainText('<img src=x onerror="window.__pwned = 1">')
  expect(await page.getByTestId('prompt-reply').locator('img').count()).toBe(0)
  expect(await page.evaluate(() => /** @type {any} */ (window).__pwned)).toBeUndefined()
  const toggle = page.getByTestId('prompt-reply-toggle')
  await expect(toggle).toHaveText('Show all')
  await toggle.click()
  await expect(toggle).toHaveText('Show less')
  await expect(reply).toContainText('Nothing else.')
  expect(await noSidewaysScroll(page)).toBe(true)
  await reply.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(SNAPSHOT_DIR, `prompt-reply-${testInfo.project.name}.png`) })

  // Undo takes it back; the request and the body stay, and so does the selection.
  await expect(page.getByTestId('undo-button')).toBeEnabled()
  await page.getByTestId('undo-button').click()
  await expect(reply).toHaveCount(0)
  await expect(page.getByTestId('inspector-prompt')).toContainText(DUCT)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  // Added again, it is in the project: it survives a reload.
  await page.getByTestId('prompt-reply-add').click()
  await page.getByTestId('prompt-reply-input').fill(REPLY)
  await page.getByTestId('prompt-reply-submit').click()
  await expect(reply).toContainText('Built the fan duct')
  await waitForAutosave(page)
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await selectFromList(page, shellId)
  await expect(page.getByTestId('prompt-reply-text')).toContainText('Built the fan duct')
  expect(errors).toEqual([])
})

test('an agent’s record_response shows under the request at once, and is saved', async ({ page }) => {
  test.setTimeout(90_000)
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await installFakeWebMcp(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect.poll(() => registeredNames(page)).toContain('record_response')

  // No request recorded yet: refused, nothing written.
  const early = await agentCall(page, 'record_response', { response: 'done' })
  expect(early.ok).toBe(false)
  expect(JSON.stringify(early)).toMatch(/record the request first/)

  expect((await agentCall(page, 'record_prompt', { prompt: DUCT })).ok).toBe(true)
  const shell = await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [140, 250, 30] } })
  const shellId = shell.applied[0].bodyId
  await selectFromList(page, shellId)
  await expect(page.getByTestId('prompt-reply-text')).toHaveCount(0)

  // The agent's last call: its final message, which lands with no new row.
  const saved = await agentCall(page, 'record_response', { response: REPLY })
  expect(saved.ok, JSON.stringify(saved)).toBe(true)
  await expect(page.getByTestId('prompt-reply-text')).toContainText('Built the fan duct')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  await waitForAutosave(page)
  await page.reload()
  await selectFromList(page, shellId)
  await expect(page.getByTestId('prompt-reply-text')).toContainText('Problems met')
  expect(errors).toEqual([])
})
