// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

/**
 * Deleting a body, or one part of a group (`TODO/ui-051`), driven against `/` — the
 * running app.
 *
 * **Routes.** The Inspector's **Delete** / **Remove part** button is the only route a
 * phone or tablet has (no Delete key), so it is the route asserted at every viewport;
 * the Delete/Backspace keys are asserted at laptop only.
 *
 * **Engines and viewports.** All three reference viewports, with a snapshot of the new
 * control in the Inspector at each (it is a new control in the phone sheet), and all
 * three engines: removing a mesh is a WebGL scene change, the reload leg is persistence,
 * and Delete/Backspace key handling differs on WebKit. Firefox cannot launch in this
 * sandbox (`TROUBLESHOOTING.md`, 2026-09-17) and is not claimed.
 *
 * **Seeding.** The bodies are built through the document store, as
 * `inspector-object-list.e2e.js` does — placement is not what is under test, and a drag
 * snaps bodies together. Every action under test is a real click, tap or key press.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'delete-body-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/**
 * The running app's own store modules — to build the scene and to read back, never to
 * perform the action under test.
 *
 * @param {import('@playwright/test').Page} page
 * @param {(api: any, arg: any) => any} fn
 * @param {any} [arg]
 */
function store(page, fn, arg) {
  return page
    .evaluateHandle(async () => {
      const documentModule = await window.__e2eImport('/src/stores/document.js')
      const selectionModule = await window.__e2eImport('/src/stores/selection.js')
      const api = {
        documentStore: documentModule.useDocumentStore(),
        selection: selectionModule.useSelectionStore(),
      }
      return api
    })
    .then(async (handle) => {
      try {
        return await handle.evaluate(fn, arg)
      } finally {
        await handle.dispose()
      }
    })
}

/** @param {import('@playwright/test').Page} page */
async function seedTwoCubes(page) {
  await store(page, (api) => {
    api.documentStore.append({ id: 'c1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [30, 30, 30], center: [-40, 0, 15] } })
    api.documentStore.append({ id: 'c2', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [30, 30, 30], center: [40, 0, 15] } })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
}

/** @param {import('@playwright/test').Page} page */
async function seedPi(page) {
  await store(page, (api) => {
    api.documentStore.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
}

/** @param {import('@playwright/test').Page} page */
function recordCount(page) {
  return store(page, (api) => api.documentStore.raw.records.length)
}

/** @param {import('@playwright/test').Page} page */
function bodyNames(page) {
  return store(page, (api) => api.documentStore.bodies.map((/** @type {any} */ body) => body.name))
}

/**
 * A finger on a touch project, a mouse click elsewhere.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {import('@playwright/test').TestInfo} testInfo
 */
async function press(locator, testInfo) {
  if (testInfo.project.use.hasTouch) await locator.tap()
  else await locator.click()
}

/**
 * Select a body the way a user can at any width: open the Inspector's object list (the
 * phone tab reads `Objects (n)` with nothing selected) and tap the row.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @param {import('@playwright/test').TestInfo} testInfo
 */
async function selectFromList(page, id, testInfo) {
  const list = page.getByTestId('object-list')
  if (!(await list.isVisible())) {
    const inspector = page.getByTestId('inspector')
    if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
      await press(page.getByTestId('inspector-tab'), testInfo)
    }
    if (!(await list.isVisible())) await press(page.getByTestId('inspector-objects-header'), testInfo)
  }
  await press(page.getByTestId(`objects-row-${id}`), testInfo)
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-selected-id', id)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('the Inspector Delete button removes the selected body, one History step; Undo brings it back, reselected', async ({
  page,
}, testInfo) => {
  await seedTwoCubes(page)
  const before = await recordCount(page)
  await selectFromList(page, 'c2', testInfo)

  const button = page.getByTestId('inspector-delete')
  // Visible without scrolling the sheet: it is pinned to the bottom of the Inspector.
  await expect(button).toBeInViewport()
  const box = await button.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  expect(box?.width).toBeGreaterThanOrEqual(44)
  await page.getByTestId('inspector').screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}.png`) })

  await press(button, testInfo)

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect(await bodyNames(page)).toEqual(['Cube 1'])
  expect(await recordCount(page)).toBe(before + 1)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-state', 'empty')
  // At phone width deleting closes the sheet, as deselecting does — no sheet left open
  // describing a body that no longer exists.
  if (testInfo.project.name.endsWith('-phone')) {
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'false')
  }
  await expect(page.getByTestId('undo-button')).toHaveAttribute('data-undo-label', 'Delete Cube 2')

  await press(page.getByTestId('undo-button'), testInfo)

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  expect(await bodyNames(page)).toEqual(['Cube 1', 'Cube 2'])
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-selected-id', 'c2')
  expect(await recordCount(page)).toBe(before)
})

test('the Delete key does the same, and Backspace too — laptop keyboard route', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('-laptop'), 'a phone or tablet has no Delete key; the button is its route')
  await seedTwoCubes(page)
  await selectFromList(page, 'c2', testInfo)
  // Focus is on the row button just tapped — not a text field, so the window-level
  // listener takes the key.
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect(await bodyNames(page)).toEqual(['Cube 1'])
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-selected-id', 'c2')

  await page.keyboard.press('Backspace')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
})

test('Backspace while typing in a Position field edits the field and deletes nothing', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('-laptop'), 'keyboard route')
  await seedTwoCubes(page)
  await selectFromList(page, 'c2', testInfo)
  const field = page.getByTestId('inspector-position-x')
  await field.click()
  await field.press('End')
  const typed = await field.inputValue()
  await field.press('Backspace')
  await expect(field).toHaveValue(typed.slice(0, -1))
  await field.press('Delete')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-selected-id', 'c2')
})

test('two selected: Subtract is enabled; Delete removes both as one step and Subtract re-gates off', async ({
  page,
}, testInfo) => {
  await seedTwoCubes(page)
  await store(page, (api) => api.documentStore.append({ id: 'c3', op: 'primitive.cuboid', name: 'Cube 3', params: { size: [20, 20, 20], center: [0, 60, 10] } }))
  // ui-049's two-operand route: with nothing selected the list is open (on a phone, from
  // the `Objects (n)` tab), and a check leaves it open for the next one.
  if (!(await page.getByTestId('object-list').isVisible())) await press(page.getByTestId('inspector-tab'), testInfo)
  await press(page.getByTestId('objects-check-c1'), testInfo)
  await press(page.getByTestId('objects-check-c2'), testInfo)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('operation-subtract')).toBeEnabled()

  await press(page.getByTestId('inspector-delete'), testInfo)

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect(await bodyNames(page)).toEqual(['Cube 3'])
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  await expect(page.getByTestId('operation-subtract')).toBeDisabled()
  await expect(page.getByTestId('undo-button')).toHaveAttribute('data-undo-label', 'Delete 2 objects')

  await press(page.getByTestId('undo-button'), testInfo)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('operation-subtract')).toBeEnabled()
})

test('drill into a Pi part and Remove part: the Pi stays, without that part; Undo restores it, drilled in', async ({
  page,
}, testInfo) => {
  await seedPi(page)
  await selectFromList(page, 'pi', testInfo)
  await press(page.getByTestId('inspector-part-usb1'), testInfo)
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-sub-part', 'usb1')
  await expect(page.getByTestId('inspector-delete')).toHaveCount(0)
  const remove = page.getByTestId('inspector-remove-part')
  await expect(remove).toHaveText(/Remove part/)
  await expect(remove).toBeInViewport()

  await press(remove, testInfo)

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-selected-id', 'pi')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-sub-part', '')
  await expect(page.getByTestId('inspector-part-usb1')).toHaveCount(0)
  await expect(page.getByTestId('inspector-part-usb2')).toHaveCount(1)
  await expect(page.getByTestId('undo-button')).toHaveAttribute('data-undo-label', 'Remove usb1 from Raspberry Pi 1')

  await press(page.getByTestId('undo-button'), testInfo)
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-sub-part', 'usb1')
  await press(page.getByTestId('inspector-breadcrumb-group'), testInfo)
  await expect(page.getByTestId('inspector-part-usb1')).toHaveCount(1)
})

test('the last visible part of a group cannot be removed, and the button says what to do instead', async ({
  page,
}, testInfo) => {
  await seedTwoCubes(page)
  await store(page, (api) =>
    api.documentStore.append({
      id: 'g',
      op: 'group.assemble',
      name: 'Group 1',
      target: 'c1',
      operands: ['c2'],
      consumes: ['c1', 'c2'],
      params: { names: ['Cube 1', 'Cube 2'] },
    }),
  )
  await selectFromList(page, 'g', testInfo)
  await press(page.getByTestId('inspector-part-Cube 2'), testInfo)
  await press(page.getByTestId('inspector-remove-part'), testInfo)
  await expect(page.getByTestId('inspector-part-Cube 2')).toHaveCount(0)

  await press(page.getByTestId('inspector-part-Cube 1'), testInfo)
  const remove = page.getByTestId('inspector-remove-part')
  await expect(remove).toBeDisabled()
  await expect(page.getByTestId('inspector-delete-reason')).toHaveText('Last visible part: delete Group 1 instead')
})

test('Delete is not an Operations-toolbar button', async ({ page }, testInfo) => {
  await seedTwoCubes(page)
  await selectFromList(page, 'c1', testInfo)
  await expect(page.getByTestId('operations-toolbar').locator('[data-testid*="delete"]')).toHaveCount(0)
})

test('a deleted body stays deleted after a reload', async ({ page }, testInfo) => {
  await seedTwoCubes(page)
  await selectFromList(page, 'c1', testInfo)
  await press(page.getByTestId('inspector-delete'), testInfo)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })

  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect(await bodyNames(page)).toEqual(['Cube 2'])
})

test('a hover on the deleted body clears with it, and does not come back wrong after Undo', async ({ page }, testInfo) => {
  test.skip(Boolean(testInfo.project.use.hasTouch), 'hover is a pointer affordance; touch invents none (ui-049)')
  await seedTwoCubes(page)
  await selectFromList(page, 'c2', testInfo)
  await press(page.getByTestId('inspector-objects-header'), testInfo)
  await page.getByTestId('objects-line-c2').hover()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover', 'c2')
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover', '')
  await page.mouse.move(4, 4)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover', '')
})
