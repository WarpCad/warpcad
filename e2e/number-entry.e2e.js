// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * `TODO/ui-115`: one number field. The same dimension typed the same way must behave the same in
 * the Fillet popover (once a native `type="number"`), the Split sheet's offset (the same) and the
 * Inspector's width (always tolerant text). Each gets the three entries the task names:
 * a comma decimal, a value with its unit, and text that is not a number.
 *
 * Runs against `/` at the phone, tablet and laptop projects on all three engines: text entry and
 * `inputmode` differ by engine, and the typed value goes through the kernel.
 */

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag a Library row into the viewport with real pointer events, as every spec here does.
 *
 * @param {import('@playwright/test').Page} page
 */
async function dragCube(page) {
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="library-row-primitive.cuboid"]')
    const view = document.querySelector('[data-testid="viewport"]')
    if (!row || !view) throw new Error('missing row or viewport')
    const from = row.getBoundingClientRect()
    const to = view.getBoundingClientRect()
    const startX = from.left + from.width / 2
    const startY = from.top + from.height / 2
    const endX = to.left + to.width * 0.5
    const endY = to.top + to.height * 0.38
    const fire = (target, type, x, y) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 7,
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
  })
  await page.waitForTimeout(120)
}

/**
 * Place one Cube (40 mm on every axis) and leave it selected.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeCube(page) {
  await openLibrary(page)
  await dragCube(page)
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
}

/**
 * Type into a field the way a person does (click, replace, Enter).
 *
 * @param {import('@playwright/test').Locator} field
 * @param {string} text
 */
async function typeAndEnter(field, text) {
  await field.click()
  await field.fill(text)
  await field.press('Enter')
}

/**
 * The History rows' text, opening the panel for the read and putting it away again so it never
 * covers the controls under test at phone width.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
async function historyRows(page) {
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
  const rows = await page.$$eval('[data-testid="timeline-rows"] .row__text', (nodes) =>
    nodes.map((node) => node.textContent?.trim() ?? ''),
  )
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toHaveCount(0)
  return rows
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('Fillet radius: 2,5 and 3 mm are accepted, abc restores the field and adds no History step', async ({ page }) => {
  await placeCube(page)
  await page.getByTestId('operation-fillet').click()
  const popover = page.getByTestId('fillet-chamfer-popover')
  await expect(popover).toBeVisible()
  const radius = page.getByTestId('fillet-chamfer-radius')

  // The field is text with a decimal keypad, not a native number input that refuses the comma.
  await expect(radius).toHaveAttribute('type', 'text')
  await expect(radius).toHaveAttribute('inputmode', 'decimal')

  await page.getByTestId('fillet-chamfer-face').selectOption('z+')
  await typeAndEnter(radius, '2,5')
  await expect(radius).toHaveValue('2.5')
  await expect(page.getByTestId('fillet-chamfer-commit')).toBeEnabled()
  await page.getByTestId('fillet-chamfer-commit').click()
  await expect(popover).toHaveCount(0)
  const afterFillet = await historyRows(page)
  expect(afterFillet).toHaveLength(2)
  expect(afterFillet[1]).toMatch(/Fillet.*\b2\.5 mm/)

  // A second pass: a unit suffix is accepted and shown as the bare number.
  await page.getByTestId('operation-fillet').click()
  await expect(popover).toBeVisible()
  await page.getByTestId('fillet-chamfer-face').selectOption('z-')
  await typeAndEnter(radius, '3 mm')
  await expect(radius).toHaveValue('3')

  // Text that is not a number puts the last good value back and writes nothing.
  await typeAndEnter(radius, 'abc')
  await expect(radius).toHaveValue('3')
  await page.getByTestId('fillet-chamfer-cancel').click()
  await expect(popover).toHaveCount(0)
  expect(await historyRows(page)).toEqual(afterFillet)

  await expect(page).toHaveScreenshot('number-entry-fillet.png', { maxDiffPixelRatio: 0.02 })
})

test('Split offset: the same three entries behave the same, and the cut plane follows the number', async ({ page }) => {
  await placeCube(page)
  await page.getByTestId('op-split').click()
  await expect(page.getByTestId('split-sheet')).toBeVisible()
  const offset = page.getByTestId('split-offset')
  const plane = page.getByTestId('cut-plane')
  await expect(offset).toHaveAttribute('type', 'text')
  await expect(offset).toHaveAttribute('inputmode', 'decimal')

  /** @returns {Promise<number>} the cut plane's world position along the axis, mm */
  const cutMm = async () => Number(await plane.getAttribute('data-cut-mm'))

  await typeAndEnter(offset, '2,5')
  await expect(offset).toHaveValue('2.5')
  await expect.poll(cutMm).not.toBeNaN()
  const atTwoPointFive = await cutMm()

  // 30 mm is 27.5 mm further along the axis than 2.5 mm: the plane follows the typed number.
  await typeAndEnter(offset, '30 mm')
  await expect(offset).toHaveValue('30')
  await expect.poll(cutMm).toBeCloseTo(atTwoPointFive + 27.5, 1)
  const atThirty = await cutMm()

  await typeAndEnter(offset, 'abc')
  await expect(offset).toHaveValue('30')
  expect(await cutMm()).toBeCloseTo(atThirty, 2)

  await expect(page).toHaveScreenshot('number-entry-split.png', { maxDiffPixelRatio: 0.02 })
})

test('Inspector width: the field it always was, behaving as the two above now do', async ({ page }) => {
  await placeCube(page)
  const width = page.getByTestId('inspector-param-size-x')
  await expect(width).toBeVisible()
  await expect(width).toHaveAttribute('type', 'text')

  await typeAndEnter(width, '2,5')
  await expect(width).toHaveValue('2.5')
  await typeAndEnter(width, '3 mm')
  await expect(width).toHaveValue('3')
  await typeAndEnter(width, 'abc')
  await expect(width).toHaveValue('3')

  await expect(page).toHaveScreenshot('number-entry-inspector.png', { maxDiffPixelRatio: 0.02 })
})
