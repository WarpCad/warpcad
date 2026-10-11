// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/ai-013` — the two ways to use the Assistant, against the real app at `/`:
 *
 * - with **no key**, the key sheet offers **Use my Claude subscription…** beside **Save and
 *   test**; it opens a sheet that says plainly an API key is billed separately, shows the
 *   `claude mcp add` command, and **Copy** puts that exact command on the clipboard ("Copied");
 * - **Use an API key instead** goes back to the key sheet;
 * - with a key, a turn ends with a one-line readout: tokens, an estimated cost and the session
 *   total (`docs/decisions/ai-partner.md` decisions 9 and 10).
 *
 * The Anthropic API is stubbed through Playwright routing; no network, no real key.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three reference viewports with a snapshot of the sheet at each (the command must wrap, not
 * scroll sideways). Chromium only: nothing here touches WebGL or a persistence path beyond the
 * existing key store, and clipboard permission grants are Chromium-only in Playwright.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'ai-subscription-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))
test.skip(({ browserName }) => browserName !== 'chromium', 'clipboard grants are Chromium-only')

const COMMAND = 'claude mcp add warpcad -- node ~/src/WarpCad/mcp/server.js ~/parts/bracket.ndjson'
const KEY = 'sk-ant-api03-E2ESUBSENTINEL-0123456789-abcdefghij'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const FORCE_FALLBACK = () => {
  Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
}

/** @param {object} data */
const frame = (data) => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`

/** One text-only streamed reply: 1,200 tokens in, 340 out on Opus 5.5 (≈ $0.0116). */
function reply() {
  return (
    frame({ type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 1200, output_tokens: 1 } } }) +
    frame({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
    frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Nothing to change yet.' } }) +
    frame({ type: 'content_block_stop', index: 0 }) +
    frame({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 340 } }) +
    frame({ type: 'message_stop' })
  )
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(FORCE_FALLBACK)
  await page.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.url().endsWith('/count_tokens')) {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"input_tokens":8}' })
    }
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: reply() })
  })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('no key: the subscription route is offered, shows the command and copies it', async ({ page }, info) => {
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  await expect(page.getByTestId('ai-key-billing')).toContainText('billed as API usage')

  await page.getByTestId('ai-key-subscription').click()
  await expect(page.getByTestId('ai-key-sheet')).toBeHidden()
  const sheet = page.getByTestId('ai-subscription-sheet')
  await expect(sheet).toBeVisible()
  await expect(page.getByTestId('ai-subscription-command')).toHaveText(COMMAND)

  await page.getByTestId('ai-subscription-copy').click()
  await expect(page.getByTestId('ai-subscription-status')).toHaveText('Copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(COMMAND)

  // The command wraps: the page and the sheet never scroll sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const box = await page.getByTestId('ai-subscription-copy').boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(43)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `sheet-${info.project.name}.png`) })

  await page.getByTestId('ai-subscription-back').click()
  await expect(sheet).toBeHidden()
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  await expect(page.getByTestId('ai-key-input')).toBeVisible()
})

test('with a key: a turn shows tokens, an estimated cost and the session total', async ({ page }) => {
  await page.getByTestId('assistant-button').click()
  await page.getByTestId('ai-key-input').fill(KEY)
  await page.getByTestId('ai-key-save').click()
  await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
  // A stored key has no subscription button: that's for the no-key state.
  await page.getByTestId('ai-key-done').click()
  await expect(page.getByTestId('assistant-panel')).toBeVisible()

  await page.getByTestId('ai-input').fill('hello')
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('ai-assistant-message').last()).toHaveText('Nothing to change yet.')
  await expect(page.getByTestId('ai-usage')).toHaveText('1.2k in · 340 out · ≈ $0.01 · session $0.01')

  await page.getByTestId('ai-input').fill('again')
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('ai-usage')).toHaveText('1.2k in · 340 out · ≈ $0.01 · session $0.02')
})
