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
    await expect(page.getByTestId('inspector-prompt-link')).toContainText('fan duct')
    const replied = await agentCall(page, 'record_response', { response: REPLY })
    expect(replied.ok, JSON.stringify(replied)).toBe(true)
    await shot(page, 'agent-prompt-row.png', { locator: inspector })
    await page.getByTestId('inspector-prompt-link').click()
    const row = page.getByTestId('prompts-view').getByTestId('prompts-row').first()
    // The link opens its request already expanded; expanding it again would fold it.
    if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click()
    await expect(page.getByTestId('prompt-reply-text')).toContainText('Built the fan duct')
    await expect(page.getByTestId('prompt-reply-add')).toBeVisible()
  })
})

/**
 * `TODO/ui-092` part 3: the Prompts view, for `docs/design-intent.md` ("The prompt is saved with the
 * part") and `docs/ai-partner.md`. Two requests: the first made two cubes, the second a third one.
 * The first row is expanded, so its parts are lit in the 3D view.
 */
const FIRST = 'Two 20 mm cubes side by side'
const SECOND = 'A third cube, to the right of the others'

/** @param {import('@playwright/test').Page} page */
async function twoRequests(page) {
  await installFakeWebMcp(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect.poll(() => registeredNames(page)).toContain('record_prompt')
  await agentCall(page, 'record_prompt', { prompt: FIRST })
  await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [-15, 0, 0], params: { size: [20, 20, 20] } })
  await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [15, 0, 0], params: { size: [20, 20, 20] } })
  await agentCall(page, 'record_prompt', { prompt: SECOND })
  await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [45, 0, 0], params: { size: [20, 20, 20] } })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
}

test.describe('docs media: prompts view', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('prompts-view still', async ({ page }) => {
    await twoRequests(page)
    await page.getByTestId('inspector-prompts-open').click()
    const view = page.getByTestId('prompts-view')
    await expect(view).toBeVisible()
    await view.getByTestId('prompts-row').first().click()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-bodies', /.+/)
    await shot(page, 'prompts-view.png', { locator: page.getByTestId('inspector') })
  })
})

test.describe('docs media: prompts view on a phone', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'phone-only')

  test('prompts-view-phone still', async ({ page }) => {
    await twoRequests(page)
    const inspector = page.getByTestId('inspector')
    if ((await inspector.getAttribute('data-open')) !== 'true') await page.getByTestId('inspector-tab').click()
    await page.getByTestId('inspector-view-prompts').click()
    const view = page.getByTestId('prompts-view')
    await expect(view).toBeVisible()
    await view.getByTestId('prompts-row').first().click()
    await shot(page, 'prompts-view-phone.png', { locator: inspector })
  })
})
