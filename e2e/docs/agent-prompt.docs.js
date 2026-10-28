// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { agentCall, installFakeWebMcp, registeredNames } from '../support/fakeWebMcp.js'
import { shot } from './support.js'

/**
 * Docs media for `docs/design-intent.md`'s "The prompt is saved with the part" (`TODO/ai-031`):
 * the Inspector's Prompt row for a body a (stand-in) browser agent built after recording the
 * page's own example request. Laptop, Chromium only.
 */
test.describe('docs media: agent prompt', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('agent-prompt-row still', async ({ page }) => {
    await installFakeWebMcp(page)
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toBeVisible()
    await expect.poll(() => registeredNames(page)).toContain('record_prompt')
    await agentCall(page, 'record_prompt', { prompt: 'a 140 × 250 mm fan duct, 1.6 mm walls' })
    const made = await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [140, 250, 30] } })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    if (!(await page.getByTestId('object-list').isVisible())) await page.getByTestId('inspector-objects-header').click()
    await page.getByTestId(`objects-row-${made.applied[0].bodyId}`).click()
    const inspector = page.getByTestId('inspector')
    await expect(page.getByTestId('inspector-prompt')).toContainText('fan duct')
    await shot(page, 'agent-prompt-row.png', { locator: inspector })
  })
})
