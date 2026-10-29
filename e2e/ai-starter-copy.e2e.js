// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { STARTER_CLAUDE_CODE } from '../src/ai/mcpPrompts.js'

/**
 * `TODO/ai-029`: **Copy starter for Claude Code** in the subscription sheet, on every engine.
 *
 * The clipboard is stubbed in the page (permission grants exist only in Chromium), which is all
 * the copy handler touches: what is written, the "Copied" label, and the blocked-clipboard note.
 * With a hostile project open, the copied text is still the constant.
 */

const HOSTILE = readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'hostile-intent.ndjson'))

/** In the page: a clipboard that records writes (`ok`) or rejects them. */
const stubClipboard = (/** @type {boolean} */ ok) => {
  const written = /** @type {string[]} */ ([])
  Object.defineProperty(window, '__copied', { value: written })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (/** @type {string} */ text) => (ok ? void written.push(text) : Promise.reject(new Error('denied'))) },
  })
}

/** @param {import('@playwright/test').Page} page */
async function openSubscriptionSheet(page) {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await page.getByTestId('assistant-button').click()
  await page.getByTestId('ai-key-subscription').click()
  await expect(page.getByTestId('ai-subscription-sheet')).toBeVisible()
}

test('Copy starter copies exactly the slash command and says Copied', async ({ page }, info) => {
  await page.addInitScript(stubClipboard, true)
  await openSubscriptionSheet(page)
  await expect(page.getByTestId('ai-subscription-starter')).toHaveText('/mcp__warpcad__start')

  await page.getByTestId('ai-subscription-copy-starter').click()
  await expect(page.getByTestId('ai-subscription-copy-starter')).toHaveText('Copied')
  expect(await page.evaluate(() => /** @type {any} */ (window).__copied)).toEqual([STARTER_CLAUDE_CODE])

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect((await page.getByTestId('ai-subscription-copy-starter').boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43)
  await page.screenshot({ path: join(process.cwd(), 'test-results', `starter-${info.project.name}.png`) })
})

test('a blocked clipboard shows the note and leaves the text selectable', async ({ page }) => {
  await page.addInitScript(stubClipboard, false)
  await openSubscriptionSheet(page)
  await page.getByTestId('ai-subscription-copy-starter').click()
  await expect(page.getByTestId('ai-subscription-copy-starter-status')).toContainText('Couldn’t copy')
  await expect(page.getByTestId('ai-subscription-copy-starter')).not.toHaveText('Copied')
  const selectable = await page.getByTestId('ai-subscription-starter').evaluate((el) => getComputedStyle(el).userSelect)
  expect(['all', 'text', 'auto']).toContain(selectable)
})

test('with a hostile project open the copied text is still the constant', async ({ page }) => {
  await page.addInitScript(stubClipboard, true)
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await page.getByTestId('file-menu-button').click()
  await expect(page.getByTestId('file-menu')).toBeVisible()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  const chooser = await chooserEvent
  await chooser.setFiles({ name: 'from-a-stranger.ndjson', mimeType: 'text/plain', buffer: HOSTILE })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  await page.getByTestId('assistant-button').click()
  await page.getByTestId('ai-key-subscription').click()
  await page.getByTestId('ai-subscription-copy-starter').click()
  expect(await page.evaluate(() => /** @type {any} */ (window).__copied)).toEqual([STARTER_CLAUDE_CODE])
})
