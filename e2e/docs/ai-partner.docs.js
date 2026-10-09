// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/ai-partner.md` (`TODO/ai-004`): the Assistant key sheet before a key is
 * pasted, and after Save and test succeeds. The Anthropic API is stubbed through Playwright
 * routing, so nothing here touches a network and the pasted "key" is a made-up string that is
 * never shown (the field is a password field and the sheet never shows a key back). Laptop,
 * Chromium only.
 */
test.describe('docs media: assistant key', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test.beforeEach(async ({ page }) => {
    await page.route('https://api.anthropic.com/**', async (route) => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      return route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'application/json' }, body: '{"input_tokens":8}' })
    })
  })

  test('assistant-key-sheet still', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('assistant-button').click()
    const sheet = page.getByTestId('ai-key-sheet')
    await expect(sheet).toBeVisible()
    await page.getByTestId('ai-key-input').fill('sk-ant-api03-made-up-for-the-picture')
    await shot(page, 'assistant-key-sheet.png', { locator: sheet })
  })

  test('assistant-connected still', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('assistant-button').click()
    await page.getByTestId('ai-key-input').fill('sk-ant-api03-made-up-for-the-picture')
    await page.getByTestId('ai-key-save').click()
    const sheet = page.getByTestId('ai-key-sheet')
    await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
    await shot(page, 'assistant-connected.png', { locator: sheet })
  })
})
