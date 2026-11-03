// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { runWorkedExample } from '../../scripts/agent-example.mjs'
import { agentCall, installFakeWebMcp, registeredNames } from '../support/fakeWebMcp.js'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/agent-prompting.md` (`TODO/docs-029`): the worked example's result, built
 * the way the page says, by a stand-in browser agent over WebMCP. The calls are the ones
 * `scripts/agent-example.mjs` runs against the registry (the page's own results), replayed here
 * against the real app so the picture cannot show anything the page does not. The shot is the viewport
 * with the box and its lid, and History open with each row marked **via webmcp**. Laptop, Chromium only.
 */
test.describe('docs media: prompting an agent', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('agent-prompting-result still', async ({ page }) => {
    const example = runWorkedExample()
    const [define, batch] = example.steps
    await installFakeWebMcp(page)
    await openApp(page)
    await expect.poll(() => registeredNames(page)).toContain('apply_records')

    expect((await agentCall(page, define.tool, define.input)).ok).toBe(true)
    const built = await agentCall(page, batch.tool, batch.input)
    expect(built.ok, JSON.stringify(built)).toBe(true)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
    const bound = await agentCall(page, 'bind_param', { id: built.applied[3].bodyId, path: 'size.2', name: 'wall' })
    expect(bound.ok, JSON.stringify(bound)).toBe(true)

    await page.getByTestId('timeline-toggle').click()
    await expect(page.getByTestId('timeline-panel')).toBeVisible()
    await expect(page.getByTestId('ai-working-chip')).toHaveCount(0)
    await shot(page, 'agent-prompting-result.png')
  })
})
