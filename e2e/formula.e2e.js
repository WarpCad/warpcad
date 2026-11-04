// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

/**
 * Calculated variables (`TODO/FIND-core-078`, Part 4) — the Documentation example of
 * `docs/variables.md`'s **Formulas** section, driven against `/`, the running app, with real
 * input: drag three cubes out of the Library, name two of them, type a formula (part by keyboard,
 * part by **Insert…**), watch the preview name an error and then a value, bind the third cube's
 * Size X to it, change `Base`, Undo once, save, reload, and find the chip still there.
 *
 * **Engines and viewports.** It ends in the IndexedDB save/load path and rebuilds the viewport, so
 * it runs at all three viewports with a snapshot at each (`test-results/formula-snapshots/`) and on
 * all three engines. The phone project matters most: the form lives in the Variables tab of the
 * Inspector's bottom sheet, and Insert… and the bind list are bottom sheets of their own.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'formula-snapshots')

test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag a Library row into the viewport with real `PointerEvent`s (`variables.e2e.js`'s helper).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number }} options
 */
async function dragRowIntoViewport(page, { op, fx, fy }) {
  await page.evaluate(
    ({ op, fx, fy }) => {
      const row = document.querySelector(`[data-testid="library-row-${op}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error(`missing row ${op} or viewport`)
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const startX = from.left + from.width / 2
      const startY = from.top + from.height / 2
      const endX = to.left + to.width * fx
      const endY = to.top + to.height * fy
      const fire = (/** @type {EventTarget} */ target, /** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 41,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      fire(row, 'pointerdown', startX, startY)
      for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      fire(window, 'pointerup', endX, endY)
    },
    { op, fx, fy },
  )
  await page.waitForTimeout(400)
}

/** @param {import('@playwright/test').Page} page @param {number} count */
async function expectBodyCount(page, count) {
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(count))
}

/** @param {import('@playwright/test').Page} page */
async function openInspector(page) {
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
}

/** At phone width the sheet has views; put the Inspector one up. @param {import('@playwright/test').Page} page */
async function showInspectorView(page) {
  await openInspector(page)
  const tab = page.getByTestId('inspector-view-inspector')
  if (await tab.isVisible()) await tab.click()
}

/** The Variables section on screen: its tab at phone width, simply there otherwise. @param {import('@playwright/test').Page} page */
async function showVariables(page) {
  await openInspector(page)
  const tab = page.getByTestId('inspector-view-variables')
  if (await tab.isVisible()) await tab.click()
  await expect(page.getByTestId('inspector-variables')).toBeVisible()
}

/** Select a body from the object list — the no-raycast route every device has. @param {import('@playwright/test').Page} page @param {string} name */
async function selectByName(page, name) {
  await showInspectorView(page)
  const list = page.getByTestId('object-list')
  if (!(await list.isVisible())) await page.getByTestId('inspector-objects-header').click()
  await list.getByText(name, { exact: true }).first().click()
  await expect(page.getByTestId('inspector-name')).toHaveText(name)
}

/** @param {import('@playwright/test').Page} page */
async function clearSelection(page) {
  await page.keyboard.press('Escape')
  await page.evaluate(async () => {
    const { useSelectionStore } = await window.__e2eImport('/src/stores/selection.js')
    useSelectionStore().clear()
  })
}

/** Rename the selection through the name field. @param {import('@playwright/test').Page} page @param {string} name */
async function renameSelected(page, name) {
  await page.getByTestId('inspector-name-edit').click()
  const input = page.getByTestId('inspector-name-input')
  await expect(input).toBeFocused()
  await input.fill(name)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('inspector-name')).toHaveText(name)
}

/** Type into a numeric Inspector field and commit with Enter. @param {import('@playwright/test').Page} page @param {string} testId @param {string} value */
async function setField(page, testId, value) {
  const field = page.getByTestId(testId)
  await field.click()
  await field.fill(value)
  await page.keyboard.press('Enter')
}

/** @param {import('@playwright/test').Page} page */
async function noHorizontalScroll(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

/** Drag a cube in; it becomes the selection. @param {import('@playwright/test').Page} page @param {number} fx @param {number} count */
async function placeCube(page, fx, count) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx, fy: 0.3 })
  await closeLibrary(page)
  await expectBodyCount(page, count)
  await showInspectorView(page)
}

/** Steps 1 of the example: Base (Size X 60) and Lid (Size X left at 40). @param {import('@playwright/test').Page} page */
async function placeBaseAndLid(page) {
  await placeCube(page, 0.25, 1)
  await renameSelected(page, 'Base')
  await setField(page, 'inspector-param-size-x', '60')
  await expect(page.getByTestId('inspector-param-size-x')).toHaveValue('60')
  await placeCube(page, 0.5, 2)
  await renameSelected(page, 'Lid')
  await expect(page.getByTestId('inspector-param-size-x')).toHaveValue('40')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the Formulas example: type and Insert… a formula, see the error then the value, bind, change Base, Undo once, save, reload', async ({
  page,
}, testInfo) => {
  // 1. Base and Lid.
  await placeBaseAndLid(page)

  // 2. With nothing selected, Variables → + → Formula, named overhang.
  await clearSelection(page)
  await showVariables(page)
  await page.getByTestId('variable-add').click()
  await page.getByTestId('variable-add-kind').selectOption('formula')
  await page.getByTestId('variable-add-name').fill('overhang')
  const box = page.getByTestId('variable-formula-input')
  const preview = page.getByTestId('variable-formula-preview')
  const create = page.getByTestId('variable-add-create')
  await expect(create).toHaveText('Create')
  await expect(create).toBeDisabled()

  // 3. Type the first half; the preview names the error, with its position, and Create stays off.
  await box.click()
  await page.keyboard.type('Base.width - (')
  await expect(preview).toHaveAttribute('data-ok', 'false')
  await expect(preview).toContainText('at character')
  await expect(create).toBeDisabled()

  // Insert… the Lid's width at the caret, no brackets or syntax typed.
  await page.getByTestId('variable-formula-insert').click()
  const list = page.getByTestId('formula-insert-list')
  await expect(list).toBeVisible()
  await list.getByText('Lid', { exact: true }).click()
  await expect(list).toHaveAttribute('data-stage', 'quantity')
  await page.getByTestId('formula-insert-quantity-width').click()
  await expect(list).toHaveCount(0)
  await expect(box).toHaveValue('Base.width - (Lid.width')
  await expect(box).toBeFocused()
  await page.keyboard.type(' / 2)')
  await expect(box).toHaveValue('Base.width - (Lid.width / 2)')
  await expect(preview).toHaveText('= 40 mm')
  await expect(create).toBeEnabled()
  await noHorizontalScroll(page)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `formula-form-${testInfo.project.name}.png`) })
  await create.click()

  const row = page.getByTestId('variable-row-overhang')
  await expect(row).toHaveAttribute('data-kind', 'formula')
  await expect(page.getByTestId('variable-value-overhang')).toHaveText('40 mm')
  await expect(page.getByTestId('variable-formula-overhang')).toHaveText('Base.width - Lid.width / 2')

  // 4. A third cube; bind its Size X to overhang. The field becomes a chip reading 40.
  await placeCube(page, 0.75, 3)
  await expect(page.getByTestId('inspector-name')).toHaveText('Cube 3')
  await page.getByTestId('param-bind-size-x').click()
  await expect(page.getByTestId('param-bind-popover')).toBeVisible()
  await expect(page.getByTestId('param-bind-new-formula')).toBeVisible()
  await page.getByTestId('param-bind-option-overhang').click()
  const chip = page.getByTestId('param-chip-size-x')
  await expect(chip).toHaveAttribute('data-variable', 'overhang')
  await expect(chip.getByTestId('param-chip-value')).toHaveText('40')
  await noHorizontalScroll(page)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `formula-chip-${testInfo.project.name}.png`) })

  // 5. Select Base and change Size X to 80: the third cube follows to 60, and a line says so.
  await selectByName(page, 'Base')
  await setField(page, 'inspector-param-size-x', '80')
  await expect(page.getByTestId('inspector-param-size-x')).toHaveValue('80')
  await showVariables(page)
  await expect(page.getByTestId('variable-value-overhang')).toHaveText('60 mm')
  await expect(page.getByTestId('variable-announcement')).toHaveText('overhang 40 mm → 60 mm — 1 parameter on 1 part changed')
  await selectByName(page, 'Cube 3')
  await expect(page.getByTestId('param-chip-size-x').getByTestId('param-chip-value')).toHaveText('60')

  // One Undo returns it to 40.
  await page.getByTestId('undo-button').click()
  await selectByName(page, 'Cube 3')
  await expect(page.getByTestId('param-chip-size-x').getByTestId('param-chip-value')).toHaveText('40')
  await selectByName(page, 'Base')
  await expect(page.getByTestId('inspector-param-size-x')).toHaveValue('60')

  // History names the formula's own step.
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-rows')).toContainText('Calculate overhang')
  await page.getByTestId('timeline-close').click()

  // Save, reload: the formula and the chip come back.
  await expect(page.getByTestId('save-status-text')).toHaveText(/^Saved · \d\d:\d\d$/)
  await page.reload()
  await expect(page.getByTestId('app-root')).toBeVisible()
  await expectBodyCount(page, 3)
  await selectByName(page, 'Cube 3')
  await expect(page.getByTestId('param-chip-size-x')).toHaveAttribute('data-variable', 'overhang')
  await expect(page.getByTestId('param-chip-size-x').getByTestId('param-chip-value')).toHaveText('40')
  await showVariables(page)
  await expect(page.getByTestId('variable-value-overhang')).toHaveText('40 mm')
  await noHorizontalScroll(page)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `formula-reloaded-${testInfo.project.name}.png`) })
})

test('New formula from this value… seeds the field’s number; editing the formula is one Undo step; ⋯ renames it', async ({ page }) => {
  await placeBaseAndLid(page)
  // Lid is selected. Its Size Y becomes a formula, starting from its own 40.
  await page.getByTestId('param-bind-size-y').click()
  await page.getByTestId('param-bind-new-formula').click()
  await expect(page.getByTestId('variable-formula-input')).toHaveValue('40')
  await expect(page.getByTestId('variable-formula-preview')).toHaveText('= 40 mm')
  await page.getByTestId('param-bind-new-formula-name').fill('lidDepth')
  await page.getByTestId('param-bind-new-formula-create').click()
  await expect(page.getByTestId('param-chip-size-y')).toHaveAttribute('data-variable', 'lidDepth')
  await expect(page.getByTestId('param-chip-size-y').getByTestId('param-chip-value')).toHaveText('40')

  // Tap the formula text to edit it: half of Base's width, through Insert….
  await clearSelection(page)
  await showVariables(page)
  await page.getByTestId('variable-formula-lidDepth').click()
  const box = page.getByTestId('variable-formula-input')
  await box.fill('')
  await page.getByTestId('variable-formula-insert').click()
  await page.getByTestId('formula-insert-list').getByText('Base', { exact: true }).click()
  await page.getByTestId('formula-insert-quantity-width').click()
  await box.press('End')
  await page.keyboard.type(' / 2')
  await expect(page.getByTestId('variable-formula-preview')).toHaveText('= 30 mm')
  await page.getByTestId('variable-formula-save-lidDepth').click()
  await expect(page.getByTestId('variable-value-lidDepth')).toHaveText('30 mm')
  await expect(page.getByTestId('variable-announcement')).toHaveText('lidDepth 40 mm → 30 mm — 1 parameter on 1 part changed')

  // A loop through itself is named in the preview, and Save stays off.
  await page.getByTestId('variable-formula-lidDepth').click()
  await box.fill('lidDepth + 1')
  await expect(page.getByTestId('variable-formula-preview')).toContainText('circle')
  await expect(page.getByTestId('variable-formula-save-lidDepth')).toBeDisabled()
  await page.getByTestId('variable-formula-cancel-lidDepth').click()

  // One Undo puts the old formula back.
  await page.getByTestId('undo-button').click()
  await showVariables(page)
  await expect(page.getByTestId('variable-value-lidDepth')).toHaveText('40 mm')

  // ⋯ → Rename carries the binding.
  await page.getByTestId('variable-menu-lidDepth').click()
  await page.getByTestId('variable-rename-lidDepth').click()
  await page.getByTestId('variable-rename-input-lidDepth').fill('lidY')
  await page.getByTestId('variable-rename-save-lidDepth').click()
  await expect(page.getByTestId('variable-row-lidY')).toBeVisible()
  await selectByName(page, 'Lid')
  await expect(page.getByTestId('param-chip-size-y')).toHaveAttribute('data-variable', 'lidY')
  await noHorizontalScroll(page)
})
