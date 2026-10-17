// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { endMovie, openApp, settle, shot, startMovie } from './support.js'

/**
 * Docs media for the chat panel in `docs/ai-partner.md` (*Asking for a part*, `TODO/ai-006`,
 * `TODO/ai-010`; swept by `TODO/docs-020`): the airfoil-and-wing prompt (ACCEPTANCE scenario 17)
 * played by the **scripted provider** (`src/ai/providers/scripted.js`, the transcript
 * `e2e/fixtures/ai/airfoil-wing.json`), never a model, a key or the network — any request to the
 * Anthropic API fails the test. The panel wears its **Scripted** badge in these pictures, which
 * is honest: the replies are a recording of what the tools do, not of what a model would choose.
 *
 *  - `ai-chat-panel` still (laptop): the panel after the turn, the part beside it.
 *  - `ai-chat-overlay-tablet` / `ai-chat-overlay-phone` stills: the panel over the viewport at
 *    narrow widths (CLAUDE.md: the chat overlays the 3D view there, it never pushes it off screen).
 *  - `ai-wing-airfoil` movie (laptop): the prompt typed, the turn running, four bodies landed.
 */

const WING_PROMPT = 'Use the sketch tool to create an airfoil for a model plane wing, create the wing then the rest of the model so I can 3D print it.'

/** @param {import('@playwright/test').Page} page */
async function scriptedApp(page) {
  const script = JSON.parse(readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'ai', 'airfoil-wing.json'), 'utf8'))
  await page.addInitScript((value) => {
    /** @type {any} */ (window).__WARPCAD_SCRIPTED__ = value
  }, script)
  await page.context().route('https://api.anthropic.com/**', (route) => {
    throw new Error(`the scripted provider must not reach the network: ${route.request().url()}`)
  })
  await openApp(page)
}

/** @param {import('@playwright/test').Page} page @param {number} typingMs per-key delay, 0 for none */
async function askForWing(page, typingMs = 0) {
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('assistant-panel')).toBeVisible()
  await expect(page.getByTestId('ai-scripted-badge')).toBeVisible()
  const input = page.getByTestId('ai-input')
  if (typingMs > 0) {
    await input.click()
    await page.keyboard.type(WING_PROMPT, { delay: typingMs })
  } else {
    await input.fill(WING_PROMPT)
  }
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('assistant-panel')).toHaveAttribute('data-running', 'false', { timeout: 30_000 })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '4')
  await expect(page.getByTestId('ai-transcript')).toContainText('all on the bed')
  // The wing is 200 mm of span: step the camera back with the on-screen zoom-out so the whole
  // model sits in view above (or beside) the panel, as a person would.
  const zoomOut = page.getByTestId('nav-zoom-out')
  if (!(await zoomOut.isVisible())) await page.getByTestId('nav-expand-toggle').click()
  for (let i = 0; i < 5; i++) {
    await zoomOut.click()
    await page.waitForTimeout(150)
  }
}

test.describe('docs media: the chat panel (scripted provider)', () => {
  test('ai-chat-panel still', async ({ page }, info) => {
    test.skip(info.project.name !== 'docs-laptop', 'laptop-only')
    await scriptedApp(page)
    await askForWing(page)
    await shot(page, 'ai-chat-panel.png')
  })

  test('ai-chat-overlay-tablet still', async ({ page }, info) => {
    test.skip(info.project.name !== 'docs-tablet', 'tablet-only')
    await scriptedApp(page)
    await askForWing(page)
    await shot(page, 'ai-chat-overlay-tablet.png')
  })

  test('ai-chat-overlay-phone still', async ({ page }, info) => {
    test.skip(info.project.name !== 'docs-phone', 'phone-only')
    await scriptedApp(page)
    await askForWing(page)
    await shot(page, 'ai-chat-overlay-phone.png')
  })

  test('ai-wing-airfoil', { tag: '@movie' }, async ({ page }, info) => {
    test.skip(info.project.name !== 'docs-laptop', 'laptop-only')
    await scriptedApp(page)
    await startMovie(page, 'ai-wing-airfoil')
    await askForWing(page, 18)
    await settle(page)
    await page.getByTestId('ai-transcript').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await page.waitForTimeout(1800)
    await endMovie(page, 'ai-wing-airfoil', { fps: 10, width: 720 })
  })
})
