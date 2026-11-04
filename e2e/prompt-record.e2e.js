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
 * - Selecting the body shows the Inspector's **Prompt** row, since `TODO/ui-092` part 5 a compact
 *   link: **Made by** and the request's first line, ellipsised to one line. A tap opens the Prompts
 *   view with that request expanded, all of it shown. The text is inert: markup in a prompt is
 *   shown as characters and never runs.
 * - With two produced bodies selected, the link says **2 prompts** and shows no text.
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

/**
 * Back from the Prompts view to the Inspector: **‹ Inspector** at tablet and laptop width, the
 * sheet's **Inspector** tab at phone width (`TODO/ui-092`).
 *
 * @param {import('@playwright/test').Page} page
 */
async function backToInspector(page) {
  const back = page.getByTestId('prompts-view-back')
  if (await back.isVisible()) await back.click()
  else await page.getByTestId('inspector-view-inspector').click()
  await expect(page.getByTestId('prompts-view')).toHaveCount(0)
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

  // Select it: the Prompt row is the link — Made by and the words, ellipsised to one line, and
  // nothing else of the request in the Inspector (TODO/ui-092, part 5).
  await selectFromList(page, shellId)
  const row = page.getByTestId('inspector-prompt')
  await expect(row).toBeVisible()
  await expect(row.getByTestId('inspector-prompt-link-lead')).toHaveText('Made by')
  await expect(row).toContainText(DUCT)
  await expect(row.getByTestId('inspector-prompt-link-text')).toHaveText(DUCT)
  await expect(page.getByTestId('prompt-reply')).toHaveCount(0)
  expect(await row.getByTestId('inspector-prompt-link-text').evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap')
  expect((await row.getByTestId('inspector-prompt-link').boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await noSidewaysScroll(page)).toBe(true)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `prompt-row-${testInfo.project.name}.png`) })
  // A tap shows it all: the Prompts view, that request expanded.
  await row.getByTestId('inspector-prompt-link').click()
  await expect(page.getByTestId('prompts-view')).toBeVisible()
  const expanded = page.locator('[data-testid="prompts-item"][data-expanded="true"]')
  await expect(expanded).toHaveCount(1)
  await expect(expanded.getByTestId('prompts-row')).toHaveAttribute('aria-expanded', 'true')
  await expect(expanded.getByTestId('prompts-row-full')).toHaveText(DUCT)
  expect(await noSidewaysScroll(page)).toBe(true)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `prompt-row-open-${testInfo.project.name}.png`) })
  await backToInspector(page)

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
  await expect(row.getByTestId('inspector-prompt-link-lead')).toHaveText('2 prompts')
  await expect(row.getByTestId('inspector-prompt-link-text')).toHaveCount(0)
  await expect(row).not.toContainText(DUCT)
  await expect(row).not.toContainText(HOSTILE)

  // In the project, not the session: it survives a reload.
  await waitForAutosave(page)
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await selectFromList(page, shellId)
  await expect(page.getByTestId('inspector-prompt')).toContainText(DUCT)
  expect(errors).toEqual([])
})
