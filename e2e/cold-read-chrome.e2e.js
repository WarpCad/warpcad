// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * TODO/ui-128: the chrome two cold users could not read. Share sits near the top of File, the
 * folded navigation toggle names itself, and the Size bind buttons carry their axis. Drives the
 * real app at `/`, with the real mouse where a gesture matters.
 */

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function placeCube(page) {
  await openLibrary(page)
  const row = page.getByTestId('library-row-primitive.cuboid')
  await row.scrollIntoViewIfNeeded()
  const from = await row.boundingBox()
  const to = await page.getByTestId('viewport').boundingBox()
  if (!from || !to) throw new Error('no library row or viewport')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width * 0.5, to.y + to.height * 0.4 - 30, { steps: 8 })
  await page.mouse.move(to.x + to.width * 0.5, to.y + to.height * 0.4, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('File ▾ lists Share and Export in its first rows, and an empty project says what to do', async ({ page }) => {
  await page.getByTestId('file-menu-button').click()
  const ids = await page.$$eval('[data-testid="file-menu"] [role="menuitem"]', (nodes) => nodes.map((node) => node.getAttribute('data-testid')))
  expect(ids.indexOf('file-share')).toBeGreaterThan(-1)
  expect(ids.indexOf('file-share')).toBeLessThan(6)
  expect(ids.indexOf('file-export')).toBe(ids.indexOf('file-share') + 1)
  expect(ids.indexOf('file-share')).toBeLessThan(ids.indexOf('file-open'))
  await expect(page.getByTestId('file-share-reason')).toHaveText('Add a shape first')
})

test('the Size bind buttons name X, Y and Z, one per column', async ({ page }) => {
  await placeCube(page)
  if (!(await page.getByTestId('param-bind-size-x').isVisible())) await page.getByTestId('inspector-tab').click()
  await expect(page.getByTestId('param-bind-size-x')).toBeVisible()
  const buttons = ['x', 'y', 'z'].map((axis) => page.getByTestId(`param-bind-size-${axis}`))
  for (const [index, button] of buttons.entries()) {
    await expect(button.getByTestId('param-bind-axis')).toHaveText('XYZ'[index])
  }
  const xs = []
  for (const button of buttons) xs.push((await button.boundingBox())?.x ?? -1)
  expect(xs[0]).toBeLessThan(xs[1])
  expect(xs[1]).toBeLessThan(xs[2])
})

test('the folded navigation toggle says View, not only ✥', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('-phone'), 'the toggle only shows on a raised phone cluster')
  await placeCube(page)
  await page.getByTestId('inspector-tab').click()
  const toggle = page.getByTestId('nav-expand-toggle')
  await expect(toggle).toBeVisible()
  await expect(page.getByTestId('nav-expand-word')).toHaveText('View')
  const box = await toggle.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(38)
})
