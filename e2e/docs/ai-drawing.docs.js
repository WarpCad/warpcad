// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

import { FIXTURE, scriptedDrawingProvider } from '../support/drawingProvider.js'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/ai-partner.md`'s *Making a part from a drawing or photo* (`TODO/ai-008`):
 * the overlay the Assistant checks its part against, and the Save proposal waiting for Confirm in
 * the phone's half-height sheet. The model is the scripted provider in
 * `e2e/support/drawingProvider.js` (a fictional board's drawing; no network, no real key — the
 * key typed here is made up and never shown).
 */

const KEY = 'sk-ant-api03-made-up-for-the-picture'

/** @param {import('@playwright/test').Page} page */
async function buildFromDrawing(page) {
  await scriptedDrawingProvider(page)
  await openApp(page)
  await page.getByTestId('assistant-button').click()
  await page.getByTestId('ai-key-input').fill(KEY)
  await page.getByTestId('ai-key-save').click()
  await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
  await page.getByTestId('ai-key-done').click()
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
