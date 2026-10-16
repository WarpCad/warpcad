// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The six Raspberry Pi screens behind **one** Library row with a **Screen model** dropdown
 * (`TODO/core-058`), driven against `/` — the running app.
 *
 * Two claims, both the way a user makes them: choosing each model before the drag drops
 * exactly that screen, named and parted as its own row used to drop it; and changing the
 * model in the Inspector afterwards rebuilds the same body as the new screen.
 *
 * **Chromium only, all three viewports.** This task adds no rendering, kernel or
 * persistence path — the dispatcher returns each screen's existing records unchanged, and
 * the drag gesture is already covered on every engine by `kit-rpi-library-placement.e2e.js`.
 * The viewports still matter: at phone width the Library is a bottom sheet sharing its
 * slot with the Inspector.
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'no new engine-sensitive path — see the file header')

/** Each model, the label its row had, and the parts its own recipe builds. */
const SCREENS = [
  { model: 'touchDisplay7inch', label: '7-inch Touch Display', parts: ['lens', 'backPlate', 'screenMountingPad1', 'piMountingPad1'] },
  { model: 'touchScreen2', label: 'Touchscreen 2', parts: ['lens', 'overHang', 'backPlateCover', 'piMountingPost1'] },
  { model: 'hyperPixel4Rectangular', label: 'HyperPixel 4', parts: ['mb', 'lcd', 'pad1'] },
  { model: 'miniPiTFT', label: 'Mini PiTFT', parts: ['board', 'screen', 'display', 'button1'] },
  { model: 'piTFT22', label: 'PiTFT 2.2', parts: ['gpio', 'mb', 'lcd', 'button4'] },
  { model: 'piTFT24', label: 'PiTFT 2.4', parts: ['mb', 'gpio', 'lcdbevel', 'buttons'] },
]

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  await page.getByTestId('library-rows-raspberrypi').scrollIntoViewIfNeeded()
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag the Screen row into the viewport with real pointer events, releasing at a fraction
 * of the canvas.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 */
async function dragScreenRow(page, fx, fy) {
  await page.evaluate(
    ({ fx, fy }) => {
      const row = document.querySelector('[data-testid="library-row-raspberrypi.screen"]')
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error('missing the Screen row or the viewport')
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const startX = from.left + from.width / 2
      const startY = from.top + from.height / 2
      const endX = to.left + to.width * fx
      const endY = to.top + to.height * fy
      /** @param {EventTarget} target @param {string} type @param {number} x @param {number} y */
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 31,
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
      for (const t of [0.25, 0.5, 0.75, 1]) {
        fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      }
      fire(window, 'pointerup', endX, endY)
    },
    { fx, fy },
  )
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, op: string, name: string, volume: string }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      volume: node.getAttribute('data-body-volume') ?? '',
    })),
  )
}

/** @param {import('@playwright/test').Page} page */
async function openObjectList(page) {
  await closeLibrary(page)
  const list = page.getByTestId('object-list')
  if (await list.isVisible()) return
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
  if (!(await list.isVisible())) await page.getByTestId('inspector-objects-header').click()
  await expect(list).toBeVisible()
}

/**
 * The part names the object list shows under one body.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} bodyId
 * @returns {Promise<string[]>}
 */
async function partNames(page, bodyId) {
  await openObjectList(page)
  const toggle = page.getByTestId(`objects-expand-${bodyId}`)
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  const names = page.locator(`[data-testid^="objects-part-name-${bodyId}-"]`)
  await expect(names.first()).toBeVisible()
  return names.allTextContents()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('one Screen row offers all six screens, and each drops as exactly that screen (TODO/core-058)', async ({ page }) => {
  test.setTimeout(120_000)
  await openLibrary(page)
  // One row, not six.
  for (const old of ['touchDisplay7inch', 'touchScreen2', 'hyperPixel4Rectangular', 'miniPiTFT', 'piTFT22', 'piTFT24']) {
    await expect(page.getByTestId(`library-row-raspberrypi.${old}`)).toHaveCount(0)
  }
  const row = page.getByTestId('library-row-raspberrypi.screen')
  await expect(row).toContainText('Raspberry Pi Screen')
  const select = page.getByTestId('library-choice-raspberrypi.screen')
  await expect(select).toHaveAttribute('aria-label', 'Screen model for Raspberry Pi Screen')
  await expect(select.locator('option')).toHaveText(SCREENS.map((screen) => screen.label))
  await expect(select).toHaveValue('touchDisplay7inch')
  // The very control the Pi board's Model dropdown is, at the same size — ui-031's 32 px
  // setting under a 44 px row, not a new control of its own.
  const box = await select.boundingBox()
  const piBox = await page.getByTestId('library-choice-raspberrypi.bplus').boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(32)
  expect(box?.height).toBeCloseTo(piBox?.height ?? 0, 0)

  for (const [index, screen] of SCREENS.entries()) {
    await openLibrary(page)
    await page.getByTestId('library-choice-raspberrypi.screen').selectOption(screen.model)
    // The upper part of the canvas: at phone width the reopened Library sheet covers
    // the lower half, and a release over the sheet is (rightly) no drop.
    await dragScreenRow(page, 0.15 + 0.14 * index, 0.18 + 0.03 * index)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(index + 1), { timeout: 15_000 })
    const placed = (await sceneBodies(page)).find((body) => body.name === `${screen.label} 1`)
    expect(placed, screen.model).toBeDefined()
    expect(placed?.op).toBe('raspberrypi.screen')
    const names = await partNames(page, /** @type {any} */ (placed).id)
    for (const part of screen.parts) expect(names, `${screen.model} ${part}`).toContain(part)
  }
})

test('changing the Screen model in the Inspector rebuilds the placed screen in place (TODO/core-058)', async ({ page }) => {
  test.setTimeout(90_000)
  await openLibrary(page)
  await page.getByTestId('library-choice-raspberrypi.screen').selectOption('touchScreen2')
  await dragScreenRow(page, 0.5, 0.45)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1', { timeout: 15_000 })
  const [before] = await sceneBodies(page)
  expect(before.name).toBe('Touchscreen 2 1')
  expect(await partNames(page, before.id)).toContain('piMountingPost1')

  await openObjectList(page)
  await page.getByTestId(`objects-row-${before.id}`).click()
  const model = page.getByTestId('inspector-param-model')
  await expect(model).toHaveJSProperty('tagName', 'SELECT')
  await expect(model).toHaveValue('touchScreen2')
  await expect(model.locator('option')).toHaveText(SCREENS.map((screen) => new RegExp(screen.label)))
  await model.selectOption('miniPiTFT')

  // Same body, one body, rebuilt as the Mini PiTFT.
  await expect.poll(async () => (await sceneBodies(page))[0]?.volume, { timeout: 15_000 }).not.toBe(before.volume)
  const after = await sceneBodies(page)
  expect(after).toHaveLength(1)
  expect(after[0].id).toBe(before.id)
  const names = await partNames(page, before.id)
  expect(names).toContain('display')
  expect(names).not.toContain('piMountingPost1')
})
