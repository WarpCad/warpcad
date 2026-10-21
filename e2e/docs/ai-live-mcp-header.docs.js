// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/ai-partner.md`'s *live mode* phone route (`TODO/docs-025`): the phone
 * header with the **Live MCP access** button (⇄) left of **Assistant**, after access is turned on
 * so the corner ring shows. Phone only (390x844), Chromium only; the button does not exist at
 * other widths or on a hosted copy.
 */
test.describe('docs media: live MCP header button', () => {
  test.skip(process.env.E2E_PREVIEW === '1', 'the live bridge is dev-only: E2E_DEV=1 npm run docs:screenshots -- e2e/docs/ai-live-mcp-header.docs.js')
  test.skip(({ viewport }) => viewport?.width !== 390, 'phone-only')

  test('ai-live-mcp-header still', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('live-mcp-button').click()
    await page.getByTestId('ai-connect-lease').selectOption('15m')
    await page.getByTestId('ai-connect-enable').click()
    await expect(page.getByTestId('ai-connect-status')).toContainText('enabled until')
    await page.getByTestId('ai-connect-done').click()
    await expect(page.getByTestId('live-mcp-button')).toHaveAttribute('data-state', 'enabled')
    await shot(page, 'ai-live-mcp-header.png', { locator: page.getByTestId('app-header') })
  })
})
