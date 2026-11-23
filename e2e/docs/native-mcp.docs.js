// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { installNativeShell, refuseNativeMcpWifi } from '../fixtures/nativeShell.js'
import { clickAssistant } from '../support/assistantEntry.js'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/mcp.md` "From the iOS app" (`TODO/ai-026`): the Live MCP access sheet in the
 * iPhone app, with **1 hour** enabled and **Allow devices on this Wi-Fi** on, so the address, token
 * and Copy controls show. The fake shell (`e2e/fixtures/nativeShell.js`) stands in for the Tauri
 * webview and the app's MCP server; its address and token are fixed, so the picture is stable.
 * Phone only; Chromium only.
 */
test.describe('docs media: MCP from the iOS app', () => {
  test('native-mcp-sheet still', async ({ page, viewport: size }) => {
    test.skip(size?.width !== 390, 'phone-only')
    await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
    await openApp(page)
    await clickAssistant(page)
    await page.getByTestId('ai-key-connect').click()
    await expect(page.getByTestId('ai-connect-sheet')).toBeVisible()
    await page.getByTestId('ai-connect-lease').selectOption('1h')
    await page.getByTestId('ai-connect-enable').click()
    await expect(page.getByTestId('ai-connect-status')).toHaveAttribute('data-state', 'enabled')
    await page.getByTestId('ai-connect-lan').check()
    await expect(page.getByTestId('ai-connect-lan-url')).toHaveText('http://192.168.1.20:5184/mcp')
    // The expiry time in the status line changes every run: mask it.
    await page.getByTestId('ai-connect-lan-row').scrollIntoViewIfNeeded()
    await shot(page, 'native-mcp-sheet.png', { locator: page.getByTestId('ai-connect-sheet'), mask: [page.getByTestId('ai-connect-status')] })
  })

  // TODO/ai-043: the refusal, for docs/mcp.md "If the switch will not turn on".
  test('native-mcp-wifi-refused still', async ({ page, viewport: size }) => {
    test.skip(size?.width !== 390, 'phone-only')
    await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
    await openApp(page)
    await clickAssistant(page)
    await page.getByTestId('ai-key-connect').click()
    await expect(page.getByTestId('ai-connect-sheet')).toBeVisible()
    await page.getByTestId('ai-connect-lease').selectOption('1h')
    await refuseNativeMcpWifi(page, 'This device’s traffic goes through a VPN (utun3), so WarpCad will not open its MCP port there and Allow devices on this Wi-Fi is off. Turn the VPN off, then turn this on again. Addresses on this device: en0 192.168.1.20, utun3 10.8.0.2.')
    await page.getByTestId('ai-connect-enable').click()
    await expect(page.getByTestId('ai-connect-status')).toHaveAttribute('data-state', 'enabled')
    await page.getByTestId('ai-connect-lan').check()
    await expect(page.getByTestId('ai-connect-lan-error')).toBeVisible()
    await expect(page.getByTestId('ai-connect-lan')).not.toBeChecked()
    await page.getByTestId('ai-connect-lan-row').scrollIntoViewIfNeeded()
    await shot(page, 'native-mcp-wifi-refused.png', { locator: page.getByTestId('ai-connect-sheet'), mask: [page.getByTestId('ai-connect-status')] })
  })
})
