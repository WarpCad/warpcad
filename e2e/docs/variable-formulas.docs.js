// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, shot } from './support.js'

/**
 * Docs media for the **Formulas** section of `docs/variables.md` (`TODO/FIND-core-078`): the
 * formula form with its preview showing a value, and the same form naming an error. Laptop only,
 * Chromium only, stills only (no movie).
 *
 * A spec of its own rather than more tests in `variables.docs.js`: a movie's manifest entry is
 * hashed per spec file, so editing that file would mark `pi-model-switch.gif` stale for two stills
 * that have nothing to do with it.
 *
 * The scene (`base-and-lid.ndjson`: Base 60 mm wide, Lid 40 mm) is loaded through File ▸ Open;
 * the formula is typed with the keyboard, as the page tells a reader to.
 */
test.describe('docs media: formulas', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** Open the Formula form with the name filled in. @param {import('@playwright/test').Page} page */
  async function openForm(page) {
    await openApp(page)
    await loadScene(page, 'base-and-lid.ndjson', 2)
    await page.evaluate(async () => {
      const { useSelectionStore } = await window.__e2eImport('/src/stores/selection.js')
      useSelectionStore().clear()
    })
    await page.getByTestId('variable-add').click()
    await page.getByTestId('variable-add-kind').selectOption('formula')
    await page.getByTestId('variable-add-name').fill('overhang')
    await page.getByTestId('variable-formula-input').click()
  }

  test('variable-formula-editor still', async ({ page }) => {
    await openForm(page)
    await page.keyboard.type('Base.width - (Lid.width / 2)')
    await expect(page.getByTestId('variable-formula-preview')).toHaveText('= 40 mm')
    await expect(page.getByTestId('variable-add-create')).toBeEnabled()
    await page.getByTestId('variable-add-name').focus()
    await shot(page, 'variable-formula-editor.png', { locator: page.getByTestId('variable-add-form') })
  })

  test('variable-formula-error still', async ({ page }) => {
    await openForm(page)
    await page.keyboard.type('Base.width - (Lid.width / 2')
    await expect(page.getByTestId('variable-formula-preview')).toContainText('at character 28')
    await expect(page.getByTestId('variable-add-create')).toBeDisabled()
    await page.getByTestId('variable-add-name').focus()
    await shot(page, 'variable-formula-error.png', { locator: page.getByTestId('variable-add-form') })
  })
})
