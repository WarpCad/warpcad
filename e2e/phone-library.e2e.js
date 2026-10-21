// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The phone Library row (`TODO/core-057`), driven against `/` — the running app.
 *
 * One row, two dropdowns beside it (**Model** and **Case**, chosen *before* the drag, the way
 * the Raspberry Pi row's Model is), a group whose parts (`body`, `plateau`) are separately
 * selectable, an Inspector that edits the model and the case in place, an enlarge field, and a
 * Subtract that cuts the plateau's pocket alone.
 *
 * **All three engines, all three viewports**: the Library drag and the rendered group are
 * WebGL/canvas surfaces, and the two dropdowns sit under the row at 390 px (`CLAUDE.md`
 * Responsive Layout and Browser Support).
 *
 * Setup for the Subtract is seeded through the app's own document store (the placement drag is
 * the first test's claim); the selection and the Subtract button are driven as a user drives
 * them, through the object list's part checks.
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} sectionId
 */
async function openLibrary(page, sectionId) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  await page.getByTestId(`library-rows-${sectionId}`).scrollIntoViewIfNeeded()
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
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
    { op, fx, fy },
  )
  await page.waitForTimeout(400)
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, op: string, name: string, bounds: number[], volume: number }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      bounds: (node.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
      volume: Number(node.getAttribute('data-body-volume') ?? 'NaN'),
    })),
  )
}

/** @param {{ bounds: number[] }} body */
const sizeOf = (body) => [
  body.bounds[3] - body.bounds[0],
  body.bounds[4] - body.bounds[1],
  body.bounds[5] - body.bounds[2],
]

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @param {string | number} value
 */
async function typeIntoField(page, testId, value) {
  const field = page.getByTestId(testId)
  await field.scrollIntoViewIfNeeded()
  await field.click()
  await field.fill(String(value))
  await field.press('Enter')
  await page.waitForTimeout(250)
}

/** @param {import('@playwright/test').Page} page */
async function openInspector(page) {
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the phone row has Model and Case dropdowns, and a drop is a named group of body and plateau', async ({
  page,
}) => {
  await openLibrary(page, 'kit')
  const model = page.getByTestId('library-choice-kit.phone')
  const caseSelect = page.getByTestId('library-choice-kit.phone-case')
  await expect(model).toBeVisible()
  await expect(caseSelect).toBeVisible()
  // Opens on the iPhone 17 Pro in a Slim case, and offers the handsets and the five presets.
  await expect(model).toHaveValue('iphone-17-pro')
  await expect(caseSelect).toHaveValue('slim')
  await expect(model.locator('option')).toHaveCount(13)
  await expect(caseSelect.locator('option')).toHaveText(['None', 'Slim', 'Protective', 'Rugged', 'TechWeave', 'Custom'])

  await model.selectOption('iphone-16')
  await caseSelect.selectOption('protective')
  await dragRowIntoViewport(page, { op: 'kit.phone', fx: 0.4, fy: 0.3 })

  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-body-count', '1')
  const [phone] = await sceneBodies(page)
  expect(phone.name).toBe('iPhone 16 in Protective case 1')
  // iPhone 16 is 71.6 x 147.6 mm; Protective adds 6 mm to each of width and length.
  const [w, l] = sizeOf(phone)
  expect(w).toBeCloseTo(71.6 + 6, 1)
  expect(l).toBeCloseTo(147.6 + 6, 1)

  await closeLibrary(page)
  await openInspector(page)
  // Both parts are separately selectable from the Inspector.
  await expect(page.getByTestId('inspector-part-body')).toBeVisible()
  await expect(page.getByTestId('inspector-part-plateau')).toBeVisible()
  await expect(page.getByTestId('inspector-param-model')).toHaveValue('iphone-16')
  await expect(page.getByTestId('inspector-param-case')).toHaveValue('protective')
})

test('clicking the plateau drills into it, the breadcrumb says so, and the group steps back out', async ({
  page,
}) => {
  await openLibrary(page, 'kit')
  await dragRowIntoViewport(page, { op: 'kit.phone', fx: 0.4, fy: 0.3 })
  await closeLibrary(page)
  await openInspector(page)

  await page.getByTestId('inspector-part-plateau').scrollIntoViewIfNeeded()
  await page.getByTestId('inspector-part-plateau').click()
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('plateau')

  await page.getByTestId('inspector-breadcrumb-group').click()
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
})

test('changing the model in the Inspector rebuilds the same parts in place; Case enlarge adds exactly its value', async ({
  page,
}) => {
  await openLibrary(page, 'kit')
  await dragRowIntoViewport(page, { op: 'kit.phone', fx: 0.4, fy: 0.3 })
  await closeLibrary(page)
  await openInspector(page)
  const viewport = page.getByTestId('viewport')
  const [before] = await sceneBodies(page)
  const id = before.id

  await page.getByTestId('inspector-param-model').selectOption('iphone-17-pro-max')
  await expect
    .poll(async () => sizeOf((await sceneBodies(page))[0])[0], { timeout: 20000 })
    .toBeCloseTo(78.0 + 3, 1)
  // Same body, same two parts: rebuilt in place, not replaced.
  await expect(viewport).toHaveAttribute('data-body-count', '1')
  expect((await sceneBodies(page))[0].id).toBe(id)
  await expect(page.getByTestId('inspector-part-body')).toBeVisible()
  await expect(page.getByTestId('inspector-part-plateau')).toBeVisible()

  const widthBefore = sizeOf((await sceneBodies(page))[0])
  await typeIntoField(page, 'inspector-param-caseEnlarge', 1)
  await expect
    .poll(async () => sizeOf((await sceneBodies(page))[0])[0], { timeout: 20000 })
    .toBeCloseTo(widthBefore[0] + 1, 1)
  const after = sizeOf((await sceneBodies(page))[0])
  expect(after[1]).toBeCloseTo(widthBefore[1] + 1, 1)
  expect(after[2]).toBeCloseTo(widthBefore[2] + 1, 1)
})

test('Subtract with the plate and only the plateau leaves a pocket, not a phone-shaped hole', async ({
  page,
}) => {
  // A 120 x 220 x 10 plate, top face at z = 0, and the TechWeave phone's slab underside level
  // with it, so only the 74 x 46 x 4 plateau is inside the plate.
  await page.evaluate(async () => {
    const documentModule = await window.__e2eImport('/src/stores/document.js')
    const store = documentModule.useDocumentStore()
    store.append({
      id: 'plate',
      op: 'primitive.cuboid',
      name: 'Plate 1',
      params: { size: [120, 220, 10], center: [0, 0, -5] },
    })
    store.append({
      id: 'phone',
      op: 'kit.phone',
      name: 'Phone 1',
      params: { model: 'iphone-17-pro', case: 'techweave', center: [0, 0, 2.5] },
    })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  await openInspector(page)
  const list = page.getByTestId('object-list')
  if (!(await list.isVisible())) {
    await page.getByTestId('inspector-objects-header').click()
  }
  await expect(list).toBeVisible()
  await page.getByTestId('objects-check-plate').click()
  await page.getByTestId('objects-expand-phone').click()
  await page.getByTestId('objects-part-check-phone-plateau').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')

  await page.getByTestId('operation-subtract').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('operation-error')).toHaveCount(0)

  const [result] = await sceneBodies(page)
  const plateVolume = 120 * 220 * 10
  // 74 x 46 rounded rectangle, radius 10, 4 mm deep.
  const pocket = (74 * 46 - (4 - Math.PI) * 100) * 4
  expect(plateVolume - result.volume).toBeGreaterThan(pocket * 0.98)
  expect(plateVolume - result.volume).toBeLessThan(pocket * 1.02)
  // The plate's top is still flat at z = 0: the slab was not subtracted.
  expect(result.bounds[5]).toBeCloseTo(0, 2)
})
