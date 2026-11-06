// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { connectMcpClient } from '../mcp/claudeCodeStandIn.js'
import { clickAssistant } from './support/assistantEntry.js'

/**
 * The live MCP bridge on the **preview** host (`docs/decisions/ai-partner.md`, Decision 11, amended
 * 2026-11-06): the same user flow as `ai-mcp-agent-pairing.e2e.js`, against a production build made
 * with `VITE_LIVE_BRIDGE=1` and served by `vite preview`. The tab reaches the host over Server-Sent
 * Events and `POST`, not Vite's HMR socket, so this is the only spec that exercises that path in a
 * real browser. Runs only in the preview project (`E2E_PREVIEW=1`, set by `playwright.config.js`).
 *
 * Engines: Chromium only here. The route is plain same-origin HTTP, so WebKit and Firefox are not
 * expected to differ, but nothing in this repo has shown that yet; that is still open.
 */

const REQUEST = 'add a 40 mm cube and a 20 mm sphere on top'

test('a preview build lets an MCP client use live access once the user enables it', async ({ page }, testInfo) => {
  const baseURL = 'http://127.0.0.1:5185'
  test.skip(process.env.E2E_PREVIEW !== '1', 'the preview bridge exists only in the flagged preview build: E2E_PREVIEW=1 npx playwright test e2e/ai-live-bridge-preview.e2e.js')
  test.skip(testInfo.project.name !== 'chromium-laptop', 'The preview bridge is verified once at the laptop target and in Chromium; layout is covered elsewhere.')
  test.setTimeout(90_000)

  await page.goto(`${baseURL}/`)
  await expect(page.getByTestId('viewport')).toBeVisible()
  const client = await connectMcpClient(`${baseURL}/mcp`)
  try {
    const refused = await client.call('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], request: REQUEST })
    expect(refused.isError).toBe(true)
    expect(refused.text).toMatch(/live MCP access is off/i)

    await clickAssistant(page)
    await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
    await page.getByTestId('ai-key-connect').click()
    await expect(page.getByTestId('ai-connect-sheet')).toBeVisible()
    await page.getByTestId('ai-connect-lease').selectOption('15m')
    await page.getByTestId('ai-connect-enable').click()
    await expect(page.getByTestId('ai-connect-status')).toHaveAttribute('data-state', /^(enabled|connected)$/)
    await page.getByTestId('ai-connect-done').click()

    const cube = await client.call('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [40, 40, 40] }, request: REQUEST })
    expect(cube.isError, cube.text).toBe(false)
    const sphere = await client.call('create', { op: 'primitive.sphere', positionMm: [0, 0, 50], request: REQUEST })
    expect(sphere.isError, sphere.text).toBe(false)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
    await expect(page.getByTestId('ai-bridge-chip')).toHaveText('MCP agent · connected')
  } finally {
    await client.close()
  }
})
