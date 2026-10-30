// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { agentCall, installFakeWebMcp, registeredNames } from '../support/fakeWebMcp.js'
import { shot } from './support.js'

/**
 * Docs media for `docs/design-intent.md`'s "The prompt is saved with the part" (`TODO/ai-031`)
 * and `docs/ai-partner.md`'s "The reply is saved with your request" (`TODO/ai-032`): the
 * Inspector's Prompt row for a body a (stand-in) browser agent built after recording the page's
 * own example request, with the reply it saved last (`record_response`) under it, collapsed.
 * Laptop, Chromium only.
 */

const REPLY = [
  'Built the fan duct: 140 × 250 mm outside, 1.6 mm walls, 30 mm deep.',
  '',
  '## Problems met',
  '- check_printability flagged an overhang at the lip; added a 45° chamfer.',
  '- The 1.6 mm wall is 4 nozzle widths; kept it as asked.',
].join('\n')
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
    const replied = await agentCall(page, 'record_response', { response: REPLY })
    expect(replied.ok, JSON.stringify(replied)).toBe(true)
    await expect(page.getByTestId('prompt-reply-text')).toContainText('Built the fan duct')
    await expect(page.getByTestId('prompt-reply-add')).toBeVisible()
    await shot(page, 'agent-prompt-row.png', { locator: inspector })
  })
})
