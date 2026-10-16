// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { connectMcpClient } from '../../mcp/claudeCodeStandIn.js'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/mcp.md`'s *Live mode* (`TODO/ai-023`): the Assistant's **MCP agent ·
 * connected** chip with the two rows the client placed in History, each marked **via mcp**. The
 * user explicitly enables a timed lease in WarpCad before the ordinary MCP client calls tools.
 * No movie: the interesting part happens in a second program. Laptop, Chromium only.
 */
test.describe('docs media: live bridge', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('ai-live-bridge still', async ({ page, baseURL }) => {
    await openApp(page)
    const client = await connectMcpClient(`${baseURL}/mcp`)
    try {
      const request = 'add a 40 mm cube and a 20 mm sphere on top of it'
      const off = await client.call('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], request })
      expect(off.isError).toBe(true)
      await page.getByTestId('assistant-button').click()
      await page.getByTestId('ai-key-connect').click()
      await page.getByTestId('ai-connect-lease').selectOption('15m')
      await page.getByTestId('ai-connect-enable').click()
      await expect(page.getByTestId('ai-connect-status')).toContainText('enabled until')
      await page.getByTestId('ai-connect-done').click()

      expect((await client.call('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], request })).isError).toBe(false)
      expect((await client.call('create', { op: 'primitive.sphere', positionMm: [0, 0, 40], params: { diameter: 20 }, request })).isError).toBe(false)
      await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
      await page.getByTestId('timeline-toggle').click()
      await expect(page.getByTestId('timeline-panel')).toBeVisible()
      await expect(page.getByTestId('ai-bridge-chip')).toHaveText('MCP agent · connected')
      // The working chip lingers a moment after a call; let it go so the picture is steady.
      await expect(page.getByTestId('ai-working-chip')).toHaveCount(0)
      await shot(page, 'ai-live-bridge.png')
    } finally {
      await client.close()
    }
  })
})
