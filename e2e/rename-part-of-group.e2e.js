// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { featherShapedThreeMf } from '../src/io/__fixtures__/threeMf.js'
import { isPhone, pointer, sceneBodies, viewportPoint } from './support/humanInput.js'
import { importModel } from './support/importModel.js'

/**
 * Rename a part of a group (`TODO/ui-094`), driven against `/`.
 *
 * The TODO's own flow on the generated Feather-shaped 3MF (`src/io/__fixtures__/threeMf.js`, whose
 * objects have no names, so they arrive as `Part 1`, `Part 2`, `Part 3`): **File → Import model…**
 * through the real chooser, place it in the view, tap `Part 2` under the Objects list, tap the name at the top
 * of the Inspector, type `ESP-12`, press Enter. The breadcrumb, the Objects list row (still second),
 * History's Undo label and the part's red colour all follow; Undo and Redo keep the selection on the
 * part; a reload keeps the name. A duplicate is refused in the field's helper line with the field
 * left open, and Escape abandons it.
 *
 * Input is real (`support/humanInput.js`): trusted CDP touch at Chromium phone/tablet width, a real
 * mouse elsewhere. All three viewports, with a screenshot each, and all three engines: it changes
 * per-part meshes in WebGL, the Inspector's layout at each width, the touch keyboard path, and
 * persistence.
 */

// Desktop Chromium offers the native File System Access picker, which nothing headless can drive.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

/** @typedef {(locator: import('@playwright/test').Locator) => Promise<void>} Press */

/** @returns {Promise<{ name: string, mimeType: string, buffer: Buffer }>} */
async function featherFile() {
  return { name: 'feather.3mf', mimeType: 'model/3mf', buffer: Buffer.from(await featherShapedThreeMf()) }
}

/**
 * Open the Objects list (through the Inspector sheet where there is one) with the model expanded.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Press} press
 * @param {string} bodyId
 */
async function openParts(page, press, bodyId) {
  const list = page.getByTestId('object-list')
  if (!(await list.isVisible().catch(() => false))) {
    const inspector = page.getByTestId('inspector')
    if ((await page.getByTestId('inspector-tab').isVisible().catch(() => false)) && (await inspector.getAttribute('data-open')) !== 'true') {
      await press(page.getByTestId('inspector-tab'))
      await expect(inspector).toHaveAttribute('data-open', 'true')
    }
    if (!(await list.isVisible().catch(() => false))) await press(page.getByTestId('inspector-objects-header'))
    await expect(list).toBeVisible()
  }
  const expand = page.getByTestId(`objects-expand-${bodyId}`)
  if ((await expand.getAttribute('aria-expanded')) !== 'true') await press(expand)
}

/**
 * The model's part rows in the Objects list, in list order.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} bodyId
 */
async function partRows(page, bodyId) {
  const prefix = `objects-part-item-${bodyId}-`
  const ids = await page.locator(`[data-testid^="${prefix}"]`).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')))
  return ids.map((id) => String(id).slice(prefix.length))
}

/**
 * The model's part colours and eye, as the app's own document reports them.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} bodyId
 */
function documentView(page, bodyId) {
  return page.evaluate(async (id) => {
    const { useDocumentStore } = await /** @type {any} */ (window).__e2eImport('/src/stores/document.js')
    const body = useDocumentStore().bodies.find((/** @type {any} */ candidate) => candidate.id === id)
    return { parts: [...body.partNames, ...body.hiddenPartNames], colors: body.colorOverrides ?? [] }
  }, bodyId)
}

/**
 * Tap the drilled-in part's name, type a new one, press Enter.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Press} press
 * @param {string} name
 */
async function typeName(page, press, name) {
  await press(page.getByTestId('inspector-name-edit'))
  const field = page.getByTestId('inspector-name-input')
  await expect(field).toBeFocused()
  await field.fill(name)
  await page.keyboard.press('Enter')
}

test('name an imported model’s Part 2: everywhere follows, Undo/Redo keep the part selected, reload keeps the name', async ({ page }, info) => {
  test.setTimeout(150_000)
  const { press, placeArmed } = await pointer(page, info)
  // File → Import model… (TODO/ui-107): the model comes into the project, placed in the view.
  await importModel(page, press, await featherFile())
  const at = isPhone(info) ? [0.5, 0.3] : [0.45, 0.5]
  const point = await viewportPoint(page, at[0], at[1])
  await placeArmed(point.x, point.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const featherId = /** @type {string} */ ((await sceneBodies(page)).find((body) => body.op === 'user.feather')?.id)

  // Colour Part 2 red first, so the rename has a colour to carry (the colour UI is ui-037's spec).
  await page.evaluate(async (id) => {
    const { useDocumentStore } = await /** @type {any} */ (window).__e2eImport('/src/stores/document.js')
    useDocumentStore().setColorOverride(id, { color: 0xff0000, subPart: 'Part 2' })
  }, featherId)

  // Tap Part 2 under the model: the Inspector names it with the same editable field a body has.
  await openParts(page, press, featherId)
  expect(await partRows(page, featherId)).toEqual(['Part 1', 'Part 2', 'Part 3'])
  await press(page.getByTestId(`objects-part-${featherId}-Part 2`))
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Part 2')
  await expect(page.getByTestId('inspector-name')).toHaveText('Part 2')
  await expect(page.getByTestId('inspector-name-edit')).toBeVisible()

  await typeName(page, press, 'ESP-12')
  await expect(page.getByTestId('inspector-name-input')).toHaveCount(0)
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('ESP-12')
  await expect(page.getByTestId('inspector-name')).toHaveText('ESP-12')
  await expect(page.getByTestId('undo-button')).toHaveAttribute('data-undo-label', 'Rename Part 2 to ESP-12 on feather 1')
  expect(await documentView(page, featherId)).toEqual({ parts: ['Part 1', 'ESP-12', 'Part 3'], colors: [{ color: 0xff0000, subPart: 'ESP-12' }] })
  await openParts(page, press, featherId)
  expect(await partRows(page, featherId)).toEqual(['Part 1', 'ESP-12', 'Part 3'])
  await info.attach(`rename-part-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

  // One Undo puts the old name back, still selected; Redo brings the new one, still selected.
  await press(page.getByTestId('undo-button'))
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Part 2')
  expect((await documentView(page, featherId)).colors).toEqual([{ color: 0xff0000, subPart: 'Part 2' }])
  await press(page.getByTestId('redo-button'))
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('ESP-12')
  expect((await documentView(page, featherId)).colors).toEqual([{ color: 0xff0000, subPart: 'ESP-12' }])

  // Reload: still ESP-12, still red, still second.
  await page.waitForTimeout(800)
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect(await documentView(page, featherId)).toEqual({ parts: ['Part 1', 'ESP-12', 'Part 3'], colors: [{ color: 0xff0000, subPart: 'ESP-12' }] })
})

test('a duplicate name is refused in the field, which stays open; Escape abandons it', async ({ page }, info) => {
  test.setTimeout(120_000)
  const { press, placeArmed } = await pointer(page, info)
  // File → Import model… (TODO/ui-107): the model comes into the project, placed in the view.
  await importModel(page, press, await featherFile())
  const at = isPhone(info) ? [0.5, 0.3] : [0.45, 0.5]
  const point = await viewportPoint(page, at[0], at[1])
  await placeArmed(point.x, point.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const featherId = /** @type {string} */ ((await sceneBodies(page)).find((body) => body.op === 'user.feather')?.id)

  await openParts(page, press, featherId)
  await press(page.getByTestId(`objects-part-${featherId}-Part 1`))
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Part 1')
  await typeName(page, press, 'Part 3')
  await expect(page.getByTestId('inspector-name-help')).toHaveText('This group already has a part called Part 3 — "Part 3 1" is free')
  await expect(page.getByTestId('inspector-name-input')).toHaveValue('Part 3')
  await info.attach(`rename-part-refused-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('inspector-name-input')).toHaveCount(0)
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Part 1')
  expect((await documentView(page, featherId)).parts).toEqual(['Part 1', 'Part 2', 'Part 3'])
  await expect(page.getByTestId('undo-button')).not.toHaveAttribute('data-undo-label', /Rename/)
})
