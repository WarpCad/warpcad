// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from '@playwright/test'
import { openApp, loadScene, clickViewportAt, shot } from './support.js'

/**
 * Pilot docs stills (`TODO/docs-005`): proves the harness end to end. Laptop only —
 * the phone/tablet projects exist for later media tasks.
 */
test.describe('docs pilot', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'pilot is laptop-only')

  test('empty scene', async ({ page }) => {
    await openApp(page)
    await shot(page, 'empty-scene.png')
  })

  test('one placed cube, selected', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'one-cube.ndjson', 1)
    await clickViewportAt(page, 0.5, 0.5)
    await page.getByTestId('viewport').getAttribute('data-selected-id')
    await shot(page, 'cube-selected.png')
  })
})
