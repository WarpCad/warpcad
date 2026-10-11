// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/ai-partner.md` (`TODO/ai-013`): the "Use your Claude subscription" sheet
 * that the key sheet opens when no key is stored. Nothing is stubbed because nothing here
 * touches the network. Laptop, Chromium only.
 */
test.describe('docs media: assistant subscription route', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('assistant-subscription-route still', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('assistant-button').click()
    await page.getByTestId('ai-key-subscription').click()
    const sheet = page.getByTestId('ai-subscription-sheet')
    await expect(sheet).toBeVisible()
    await shot(page, 'assistant-subscription-route.png', { locator: sheet })
  })
})
