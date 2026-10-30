// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

import { FIXTURE, scriptedDrawingProvider } from '../support/drawingProvider.js'
import { endMovie, openApp, shot, startMovie } from './support.js'

/**
 * Docs media for `docs/ai-partner.md`'s *Making a part from a drawing or photo* (`TODO/ai-008`):
 * the overlay the Assistant checks its part against, and the Save proposal waiting for Confirm in
 * the phone's half-height sheet. The model is the scripted provider in
 * `e2e/support/drawingProvider.js` (a fictional board's drawing; no network, no real key — the
 * key typed here is made up and never shown).
 */

const KEY = 'sk-ant-api03-made-up-for-the-picture'

/**
 * The Assistant connected (made-up key, scripted API) and its panel open, nothing sent yet.
 *
 * @param {import('@playwright/test').Page} page
 */
async function connected(page) {
  await scriptedDrawingProvider(page)
  await openApp(page)
  await page.getByTestId('assistant-button').click()
  await page.getByTestId('ai-key-input').fill(KEY)
  await page.getByTestId('ai-key-save').click()
  await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
  await page.getByTestId('ai-key-done').click()
}

/** @param {import('@playwright/test').Page} page */
async function buildFromDrawing(page) {
  await connected(page)
  await page.getByTestId('ai-attach-input').setInputFiles({ name: 'board.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE) })
  await expect(page.getByTestId('ai-attachments').locator('img')).toHaveCount(1)
  await page.getByTestId('ai-input').fill('This is a Raspberry Pi 5-style board, make a library part.')
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('ai-save-proposal')).toBeVisible({ timeout: 30_000 })
}

test('assistant-drawing-overlay still', async ({ page }, info) => {
  test.skip(info.project.name !== 'docs-laptop', 'laptop-only')
  await buildFromDrawing(page)
  const line = page.getByTestId('ai-transcript').locator('li').filter({ has: page.getByTestId('ai-activity-label').filter({ hasText: 'Compared the top view with the drawing' }) })
  await line.getByTestId('ai-activity-thumbnail').click()
  await expect(line.getByTestId('ai-activity-thumbnail')).toHaveAttribute('aria-expanded', 'true')
  await line.scrollIntoViewIfNeeded()
  await shot(page, 'assistant-drawing-overlay.png', { locator: line })
})

test('assistant-save-proposal still', async ({ page }, info) => {
  test.skip(info.project.name !== 'docs-phone', 'phone-only: the half-height sheet is the point')
  await buildFromDrawing(page)
  await shot(page, 'assistant-save-proposal.png')
})

/**
 * `TODO/docs-020`: the whole of ACCEPTANCE scenario 18 as one movie — attach the drawing, ask for a
 * library part, the Assistant builds a named group on it and proposes saving it, **Confirm**, and
 * the part is in My parts. Scripted provider only (no network, a made-up key set up before the
 * recording starts, so it is never on film).
 */
test('ai-drawing-to-group', { tag: '@movie' }, async ({ page }, info) => {
  test.skip(info.project.name !== 'docs-laptop', 'laptop-only')
  await connected(page)
  await expect(page.getByTestId('library-user-count')).toHaveText('0')
  await startMovie(page, 'ai-drawing-to-group')
  await page.getByTestId('ai-attach-input').setInputFiles({ name: 'board.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE) })
  await expect(page.getByTestId('ai-attachments').locator('img')).toHaveCount(1)
  await page.waitForTimeout(700)
  const input = page.getByTestId('ai-input')
  await input.click()
  await page.keyboard.type('This is a Raspberry Pi 5-style board, make a library part.', { delay: 25 })
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('ai-save-proposal')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await page.waitForTimeout(1500)
  // Nothing is in My parts until Confirm.
  await expect(page.getByTestId('library-user-count')).toHaveText('0')
  const confirm = page.getByTestId('ai-save-confirm')
  const b = await confirm.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 })
  await page.waitForTimeout(400)
  await confirm.click()
  await expect(page.getByTestId('ai-save-status')).toHaveText('Saved to My parts.')
  await expect(page.getByTestId('library-user-count')).toHaveText('1')
  await page.waitForTimeout(1500)
  await endMovie(page, 'ai-drawing-to-group', { fps: 8, width: 720 })
})
