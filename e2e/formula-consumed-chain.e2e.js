// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

/**
 * `TODO/FIND-ui-106`: a name one live body holds is that body's, even when earlier steps of its
 * history (a rename, then two group merges that consumed it) carry the same name. Driven against
 * `/` with `e2e/fixtures/cutter-colour-selected.ndjson`, a copy of the owner's project: one live
 * body, `esp8266 feather`, whose two consumed ancestors share the name.
 *
 * Touches the worker result and the Variables form: chromium and webkit at the pair's viewport.
 */

// Force the `<input type=file>` fallback so File ▸ Open is scriptable.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('a Formula variable names the one live body whose consumed ancestors share its name', async ({ page }) => {
  await page.getByTestId('file-menu-button').click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  const chooser = await chooserEvent
  await chooser.setFiles({
    name: 'feather.ndjson',
    mimeType: 'text/plain',
    buffer: readFileSync(join(process.cwd(), 'e2e/fixtures/cutter-colour-selected.ndjson')),
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  // Variables → + → Formula, named boardWidth.
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
  const variablesTab = page.getByTestId('inspector-view-variables')
  if (await variablesTab.isVisible()) await variablesTab.click()
  await expect(page.getByTestId('inspector-variables')).toBeVisible()
  await page.getByTestId('variable-add').click()
  await page.getByTestId('variable-add-kind').selectOption('formula')
  await page.getByTestId('variable-add-name').fill('boardWidth')
  const create = page.getByTestId('variable-add-create')
  await expect(create).toBeDisabled()

  const preview = page.getByTestId('variable-formula-preview')
  await page.getByTestId('variable-formula-input').click()
  await page.keyboard.type('[esp8266 feather].width')
  await expect(preview).toHaveAttribute('data-ok', 'true')
  await expect(preview).not.toContainText('bodies are named')
  await expect(preview).toContainText('mm')
  await expect(create).toBeEnabled()
  await create.click()

  const row = page.getByTestId('variable-row-boardWidth')
  await expect(row).toHaveAttribute('data-kind', 'formula')
  await expect(page.getByTestId('variable-value-boardWidth')).toHaveText(/^\d+(\.\d+)? mm$/)
})
