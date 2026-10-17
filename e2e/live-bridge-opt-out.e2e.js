// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { createServer } from 'vite'

import { registeredNames, installFakeWebMcp } from './support/fakeWebMcp.js'

/**
 * `WARPCAD_LIVE_BRIDGE=0` (`TODO/build-008`): the dev live MCP bridge is left out while the app's
 * own WebMCP registration is untouched. The suite's shared dev server has the bridge on, so this
 * spec starts its own from the repo's real `vite.config.js` with the setting in the environment,
 * on a port of its own, and drives `/` on it.
 *
 * Engines: Chromium only — the WebMCP API under test is Chrome's, and nothing here touches WebGL,
 * canvas or persistence. Viewport: laptop only; no layout changes.
 */

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'WebMCP is Chrome-specific')
  test.skip(!testInfo.project.name.endsWith('-laptop'), 'no layout change')
})

test('with the live bridge opted out, /mcp is gone and the app still registers its WebMCP tools', async ({ page }) => {
  test.setTimeout(90_000)
  const previous = process.env.WARPCAD_LIVE_BRIDGE
  process.env.WARPCAD_LIVE_BRIDGE = '0'
  const server = await createServer({ configFile: 'vite.config.js', logLevel: 'silent', server: { port: 5185, strictPort: false } })
  try {
    await server.listen()
    const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, '')
    expect(origin).toBeTruthy()

    const mcp = await page.request.post(`${origin}/mcp`, { data: '{}', headers: { 'content-type': 'application/json' } })
    // Nothing answers MCP: with the bridge on this POST reaches its handler (400/403/200, or 503 without the SDK).
    expect(mcp.status()).toBe(404)

    await installFakeWebMcp(page)
    await page.goto(`${origin}/`)
    await expect(page.getByTestId('viewport')).toBeVisible()
    await expect.poll(() => registeredNames(page)).toContain('create')
  } finally {
    await server.close()
    if (previous === undefined) delete process.env.WARPCAD_LIVE_BRIDGE
    else process.env.WARPCAD_LIVE_BRIDGE = previous
  }
})
