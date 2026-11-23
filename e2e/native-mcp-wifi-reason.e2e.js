// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

import { failNativeMcpAccess, installNativeShell, nativeMcpState, refuseNativeMcpWifi } from './fixtures/nativeShell.js'
import { clickAssistant } from './support/assistantEntry.js'

/**
 * `TODO/ai-043` (Gate 1 F1, "it did not work" on the iPad): when **Allow devices on this Wi-Fi**
 * cannot turn on, the sheet says why, in words the user can see, and never shows an empty address,
 * token or `claude mcp add` line. Driven at `/` with the fake Tauri bridge
 * (`e2e/fixtures/nativeShell.js`) answering as the Rust host does (`warpcad-native/src-tauri/src/mcp/`,
 * whose refusals are tested there):
 *
 *  1. the host refuses the Wi-Fi half with a reason (a VPN route; a bind failure): the reason shows
 *     under the switch as an error (`ai-connect-lan-error`), the switch reads off again, no address,
 *     token or command shows, and this device's loopback endpoint stays; once the network allows
 *     it, the same switch turns on and the error goes;
 *  2. the host rejects `mcp_set_access` outright (no port would open): the sheet's status says so in
 *     the host's words and does not claim access is enabled.
 *
 * Touches the native bridge and the AI surface: Chromium, Firefox and WebKit at phone, tablet and
 * laptop, with a picture of the refused sheet at each.
 *
 *     npm run test:e2e:headless -- e2e/native-mcp-wifi-reason.e2e.js
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'native-mcp-wifi-reason')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const VPN = 'This device’s traffic goes through a VPN (utun3), so WarpCad will not open its MCP port there and Allow devices on this Wi-Fi is off. Turn the VPN off, then turn this on again. Addresses on this device: en0 192.168.1.20, utun3 10.8.0.2.'
const BIND = 'WarpCad could not listen on its Wi-Fi address 192.168.1.20:5184 (Address already in use (os error 48)), so Allow devices on this Wi-Fi is off. Only this device can connect.'
const NO_PORT = 'WarpCad could not open a port for MCP access.'

test.beforeEach(async ({ page }) => {
  await installNativeShell(page, { platform: 'ios' })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

/** @param {import('@playwright/test').Page} page */
async function openSheet(page) {
  await clickAssistant(page)
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  await page.getByTestId('ai-key-connect').click()
  await expect(page.getByTestId('ai-connect-sheet')).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function enable(page) {
  await page.getByTestId('ai-connect-lease').selectOption('1h')
  await page.getByTestId('ai-connect-enable').click()
  await expect(page.getByTestId('ai-connect-status')).toHaveAttribute('data-state', 'enabled')
  await expect(page.getByTestId('ai-connect-endpoint')).toContainText('http://127.0.0.1:5184/mcp')
}

/** @param {import('@playwright/test').Page} page */
async function expectNoWifiValues(page) {
  for (const id of ['ai-connect-lan-url', 'ai-connect-token', 'ai-connect-copy-url', 'ai-connect-copy-token', 'ai-connect-copy-cmd', 'ai-connect-rotate']) {
    await expect(page.getByTestId(id), id).toHaveCount(0)
  }
}

for (const [name, reason] of /** @type {const} */ ([['a VPN route', VPN], ['a bind failure', BIND]])) {
  test(`the Wi-Fi switch refused for ${name} says why, reads off, and shows no address, token or command`, async ({ page }, testInfo) => {
    await refuseNativeMcpWifi(page, reason)
    await openSheet(page)
    await enable(page)

    await page.getByTestId('ai-connect-lan').click()
    const error = page.getByTestId('ai-connect-lan-error')
    await expect(error).toBeVisible()
    await expect(error).toHaveText(reason)
    await expect(error).toHaveAttribute('role', 'alert')
    // The switch follows the host's answer, not the tap.
    await expect(page.getByTestId('ai-connect-lan')).not.toBeChecked()
    await expectNoWifiValues(page)
    // This device's own endpoint is still up.
    await expect(page.getByTestId('ai-connect-endpoint')).toContainText('http://127.0.0.1:5184/mcp')
    await expect(page.getByTestId('ai-connect-status')).toHaveAttribute('data-state', 'enabled')
    // An error, not one more grey note: it does not look like the unencrypted warning beside it.
    const colour = (/** @type {string} */ id) => page.getByTestId(id).evaluate((el) => getComputedStyle(el).color)
    expect(await colour('ai-connect-lan-error')).not.toBe(await colour('ai-connect-lan-unencrypted'))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByTestId('ai-connect-sheet').screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}-${name.replaceAll(' ', '-')}.png`) })

    // On a network that allows it, the same switch turns on and the reason goes.
    await refuseNativeMcpWifi(page, null)
    await page.getByTestId('ai-connect-lan').click()
    await expect(page.getByTestId('ai-connect-lan')).toBeChecked()
    await expect(page.getByTestId('ai-connect-lan-url')).toHaveText('http://192.168.1.20:5184/mcp')
    await expect(page.getByTestId('ai-connect-token')).toHaveText((await nativeMcpState(page)).token)
    await expect(page.getByTestId('ai-connect-lan-error')).toHaveCount(0)
  })
}

test('a host that cannot start says so in the sheet instead of claiming access is enabled', async ({ page }) => {
  await openSheet(page)
  await failNativeMcpAccess(page, NO_PORT)
  await page.getByTestId('ai-connect-lease').selectOption('1h')
  await page.getByTestId('ai-connect-enable').click()

  const status = page.getByTestId('ai-connect-status')
  await expect(status).toContainText(NO_PORT)
  await expect(status).not.toHaveAttribute('data-state', 'enabled')
  await expect(page.getByTestId('ai-connect-lan')).toBeDisabled()
  await expectNoWifiValues(page)
  expect((await nativeMcpState(page)).lease).toBe('off')
})
