// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, shot } from './support.js'

/**
 * Docs media for `docs/variables.md` (`TODO/ui-059`): the Variables section, the bind popover,
 * a bound field's chip, and one movie of the Pi example (steps 2-5 of the page): bind Model
 * with **New variable from this value…**, give the cube a variable condition, change `piModel`
 * from 4 to 5 in one place, and Undo once. Laptop only, Chromium only.
 *
 * Every movie asserts its end state (a body count, a variable's value), so a click that
 * silently did nothing fails instead of publishing a GIF of nothing happening. The scene is
 * loaded through File ▸ Open (`pi-and-cube.ndjson`); everything that is *claimed* is driven
 * with the mouse.
 */
test.describe('docs media: variables', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** @param {import('@playwright/test').Page} page */
  async function openScene(page) {
    await openApp(page)
    await loadScene(page, 'pi-and-cube.ndjson', 2)
  }

  /** Select a body by its object-list row. @param {import('@playwright/test').Page} page @param {string} id */
  async function select(page, id) {
    await page.getByTestId(`objects-row-${id}`).click()
    await expect(page.getByTestId('inspector-name')).toBeVisible()
  }

  /** Bind the selected Pi's Model to a new variable. @param {import('@playwright/test').Page} page */
  async function bindModel(page) {
    await page.getByTestId('param-bind-model').click()
    await page.getByTestId('param-bind-new').click()
    await page.getByTestId('param-bind-new-name').fill('piModel')
    await page.getByTestId('param-bind-new-create').click()
    await expect(page.getByTestId('param-chip-model')).toHaveAttribute('data-variable', 'piModel')
  }

  /** The cube exists only on a Pi 4. @param {import('@playwright/test').Page} page */
  async function conditionCube(page) {
    await page.getByTestId('inspector-condition-add').click()
    await page.getByTestId('inspector-condition-option-4').check()
    await page.getByTestId('inspector-condition-save').click()
    await expect(page.getByTestId('inspector-condition-text')).toContainText('piModel is Pi 4')
  }

  test('variables-panel still', async ({ page }) => {
    await openScene(page)
    await select(page, 'pi-1')
    await bindModel(page)
    await page.getByTestId('inspector-breadcrumb-root').click()
    await select(page, 'cube-1')
    await conditionCube(page)
    await page.getByTestId('inspector-breadcrumb-root').click()
    await page.evaluate(async () => {
      const { useSelectionStore } = await import('/src/stores/selection.js')
      useSelectionStore().clear()
    })
    await expect(page.getByTestId('variable-row-piModel')).toBeVisible()
    await shot(page, 'variables-panel.png', { locator: page.getByTestId('inspector-variables') })
  })

  test('variable-bind-popover still', async ({ page }) => {
    await openScene(page)
    await select(page, 'pi-1')
    await page.getByTestId('param-bind-model').click()
    await expect(page.getByTestId('param-bind-popover')).toBeVisible()
    await shot(page, 'variable-bind-popover.png', { locator: page.getByTestId('param-bind-popover') })
  })

  test('variable-bound-chip still', async ({ page }) => {
    await openScene(page)
    await select(page, 'pi-1')
    await bindModel(page)
    await expect(page.getByTestId('param-chip-model').getByTestId('param-chip-value')).toHaveText('Pi 4')
    await shot(page, 'variable-bound-chip.png', { locator: page.getByTestId('param-chip-model') })
  })

  test('pi-model-switch', { tag: '@movie' }, async ({ page }) => {
    await openScene(page)
    await startMovie(page, 'pi-model-switch')

    // 2. Bind the Pi's Model.
    await select(page, 'pi-1')
    await bindModel(page)
    // 3. The cube only exists on a Pi 4.
    await page.getByTestId('inspector-breadcrumb-root').click()
    await select(page, 'cube-1')
    await conditionCube(page)
    await page.getByTestId('inspector-breadcrumb-root').click()
    await page.evaluate(async () => {
      const { useSelectionStore } = await import('/src/stores/selection.js')
      useSelectionStore().clear()
    })
    // 4. Change piModel in one place.
    await page.getByTestId('variable-value-piModel').selectOption('5')
    await expect(page.getByTestId('variable-announcement')).toContainText('piModel 4 → 5')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    await page.waitForTimeout(900)
    // 5. One Undo returns the Pi 4 and the cube.
    await page.getByTestId('undo-button').click()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
    await expect(page.getByTestId('variable-row-piModel')).toHaveAttribute('data-value', '4')
    await page.waitForTimeout(600)
    await endMovie(page, 'pi-model-switch')
  })
})
