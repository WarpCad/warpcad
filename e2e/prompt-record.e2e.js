// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { agentCall, installFakeWebMcp, registeredNames } from './support/fakeWebMcp.js'

/**
 * `TODO/ai-031` — an agent records the prompt it was given, against the real app at `/`:
 *
 * - A browser agent (the WebMCP stand-in, `e2e/support/fakeWebMcp.js`) calls **`record_prompt`**
 *   with the user's words, then builds a body. The result echoes the stored text and its id.
 * - Selecting the body shows the Inspector's **Prompt** row, collapsed to one line; a tap shows it
 *   all. The text is inert: markup in a prompt is shown as characters and never runs.
 * - With two produced bodies selected, the row says **2 prompts** and shows no text.
 * - The prompt survives a reload (IndexedDB autosave), so it is in the project, not the session.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three viewports — the row sits in the Inspector, which is a bottom sheet at phone width,
 * where the text must wrap and never scroll the page sideways — with a snapshot at each. All three
 * engines: the prompt is document state persisted through IndexedDB and read back after a reload,
 * and the fake WebMCP API works in each.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'prompt-record-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const DUCT = 'a 140 × 250 mm fan duct, 1.6 mm walls'
const HOSTILE = 'and a tab <img src=x onerror="window.__pwned = 1"> on the side'

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

test('a browser agent records the prompt, builds a body, and the Inspector shows it as a collapsed Prompt row', async ({ page }, testInfo) => {
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

  // The agent records the user's words first; the result echoes what was stored.
  const recorded = await agentCall(page, 'record_prompt', { prompt: `  ${DUCT}  ` })
  expect(recorded.ok, JSON.stringify(recorded)).toBe(true)
  expect(recorded.prompt).toMatchObject({ text: DUCT, truncated: false })
  expect(typeof recorded.prompt.id).toBe('string')

  // Then builds: a duct-sized block. Recording the prompt alone made no body.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  const shell = await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [140, 250, 30] }, rationale: 'the outer shell' })
  expect(shell.ok, JSON.stringify(shell)).toBe(true)
  const shellId = shell.applied[0].bodyId
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  // Select it: the Prompt row shows the words, collapsed to one line.
  await selectFromList(page, shellId)
  const row = page.getByTestId('inspector-prompt')
  await expect(row).toBeVisible()
  await expect(row).toContainText('Prompt')
  await expect(row).toContainText(DUCT)
  await expect(row).toHaveAttribute('aria-expanded', 'false')
  expect(await row.evaluate((el) => getComputedStyle(el.querySelector('.prompt__text') ?? el).whiteSpace)).toBe('nowrap')
  await row.click()
  await expect(row).toHaveAttribute('aria-expanded', 'true')
  expect(await noSidewaysScroll(page)).toBe(true)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `prompt-row-${testInfo.project.name}.png`) })

  // A second request, with markup in it: shown as characters, never run.
  const second = await agentCall(page, 'record_prompt', { prompt: HOSTILE })
  expect(second.ok, JSON.stringify(second)).toBe(true)
  const tab = await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [100, 0, 0], params: { size: [20, 10, 4] } })
  expect(tab.ok, JSON.stringify(tab)).toBe(true)
  const tabId = tab.applied[0].bodyId
  await selectFromList(page, tabId)
  await expect(row).toContainText(HOSTILE)
  expect(await row.locator('img').count()).toBe(0)
  expect(await page.evaluate(() => /** @type {any} */ (window).__pwned)).toBeUndefined()

  // Both selected — the row's check adds to the selection with no keyboard: "2 prompts", no text.
  if (!(await page.getByTestId('object-list').isVisible())) await page.getByTestId('inspector-objects-header').click()
  await page.getByTestId(`objects-check-${shellId}`).click()
  await expect(page.getByTestId('inspector-multi')).toBeVisible()
  await expect(row).toHaveText('2 prompts')
  await expect(row).not.toContainText(DUCT)

  // In the project, not the session: it survives a reload.
  await waitForAutosave(page)
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await selectFromList(page, shellId)
  await expect(page.getByTestId('inspector-prompt')).toContainText(DUCT)
  expect(errors).toEqual([])
})
