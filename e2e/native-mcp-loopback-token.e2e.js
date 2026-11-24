// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

import { installNativeShell, nativeMcpState } from './fixtures/nativeShell.js'
import { clickAssistant } from './support/assistantEntry.js'

/**
 * `TODO/ai-042`: on iOS and Android the app's MCP server requires the token from a client on this
 * device's loopback address too, since any other app on the device could reach it. The host says so
 * (`loopbackNeedsToken`), and the Live MCP access sheet then shows the token beside the loopback
 * address with a `claude mcp add` line that carries the `Authorization` header, while the Wi-Fi
 * switch is still off. On a Mac nothing new shows. Driven at `/` with the fake Tauri bridge
 * (`e2e/fixtures/nativeShell.js`), which follows the Rust host's rule by platform; the refusal
 * itself is tested in Rust (`warpcad-native/src-tauri/src/mcp/gate_tests.rs`, `host_tests.rs`).
 *
 *  1. iPad: **Enable access** for 1 hour, Wi-Fi off: the loopback row shows the address and token,
 *     **Copy token** and **Copy Claude Code command**; the Wi-Fi address and token stay hidden.
 *     **Turn off** hides the row.
 *  2. Mac: **Enable access**: no loopback row and no token.
 *
 * Touches the native bridge: Chromium, Firefox and WebKit at phone, tablet and laptop, with a
 * picture of the sheet at each.
 *
 *     npm run test:e2e:headless -- e2e/native-mcp-loopback-token.e2e.js
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'native-mcp-loopback-token')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** @param {import('@playwright/test').Page} page @param {string} platform */
async function openSheet(page, platform) {
  await installNativeShell(page, { platform })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await clickAssistant(page)
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  await page.getByTestId('ai-key-connect').click()
  await expect(page.getByTestId('ai-connect-sheet')).toBeVisible()
}

test('on an iPad the sheet shows the token beside the loopback address, with the header in the command', async ({ page }, testInfo) => {
  await openSheet(page, 'ios')
  await expect(page.getByTestId('ai-connect-loopback-row')).toHaveCount(0)
  await page.getByTestId('ai-connect-lease').selectOption('1h')
  await page.getByTestId('ai-connect-enable').click()
  await expect(page.getByTestId('ai-connect-status')).toHaveAttribute('data-state', 'enabled')

  const { token } = await nativeMcpState(page)
  const row = page.getByTestId('ai-connect-loopback-row')
  await expect(row).toBeVisible()
  await expect(row.getByTestId('ai-connect-loopback-url')).toHaveText('http://127.0.0.1:5184/mcp')
  await expect(row.getByTestId('ai-connect-loopback-token')).toHaveText(token)
  await expect(row.getByTestId('ai-connect-copy-loopback-token')).toBeVisible()
  await expect(row.getByTestId('ai-connect-copy-loopback-cmd')).toBeVisible()
  // The same address the sheet's endpoint line names.
  await expect(page.getByTestId('ai-connect-endpoint')).toHaveAttribute('data-endpoint', 'http://127.0.0.1:5184/mcp')
  // The Wi-Fi switch is still off: its address and token are not shown.
  await expect(page.getByTestId('ai-connect-lan')).not.toBeChecked()
  await expect(page.getByTestId('ai-connect-lan-url')).toHaveCount(0)
  await expect(page.getByTestId('ai-connect-token')).toHaveCount(0)
  // Tap targets stay at tap size, and nothing scrolls sideways.
  const box = await row.getByTestId('ai-connect-copy-loopback-cmd').boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByTestId('ai-connect-sheet').screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}.png`) })

  await page.getByTestId('ai-connect-disable').click()
  await expect(page.getByTestId('ai-connect-loopback-row')).toHaveCount(0)
})

test('the loopback Copy command carries the Authorization header', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'reading the clipboard back needs Chromium’s clipboard permission')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await openSheet(page, 'ios')
  await page.getByTestId('ai-connect-enable').click()
  const { token } = await nativeMcpState(page)
  await page.getByTestId('ai-connect-copy-loopback-cmd').click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    `claude mcp add --transport http warpcad http://127.0.0.1:5184/mcp --header "Authorization: Bearer ${token}"`
  )
})

test('on a Mac the loopback address needs no token, so no token shows with it', async ({ page }) => {
  await openSheet(page, 'macos')
  await page.getByTestId('ai-connect-enable').click()
  await expect(page.getByTestId('ai-connect-status')).toHaveAttribute('data-state', 'enabled')
  await expect(page.getByTestId('ai-connect-endpoint')).toHaveAttribute('data-endpoint', 'http://127.0.0.1:5184/mcp')
  await expect(page.getByTestId('ai-connect-loopback-row')).toHaveCount(0)
  await expect(page.getByTestId('ai-connect-token')).toHaveCount(0)
})
