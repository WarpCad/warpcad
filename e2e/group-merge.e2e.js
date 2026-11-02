// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

import { closeLibrary, isPhone, openLibrary, pointer, sceneBodies, viewportPoint } from './support/humanInput.js'

/**
 * Grouping bodies that have parts (`TODO/core-076`), driven against `/` with a real mouse and, at
 * phone and tablet, trusted touch: the Group popover, its live preview, what a merge keeps, cutting
 * with a hidden part, Undo, and adding to a built-in shape.
 *
 * All three viewports (it is a popover and a phone layout) and all three engines, because it touches
 * the viewport's per-part meshes, the worker transport of a merged value and persistence.
 */

// Desktop Chromium offers the native File System Access picker, which nothing headless can drive;
// force the `<input type=file>` fallback so File ▸ Open is scriptable (`e2e/docs/support.js`).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
})

/** @param {import('@playwright/test').Page} page @param {(locator: import('@playwright/test').Locator) => Promise<void>} press */
async function openObjects(page, press) {
  const list = page.getByTestId('object-list')
  if (await list.isVisible().catch(() => false)) return
  const tab = page.getByTestId('inspector-tab')
  if ((await page.getByTestId('inspector').getAttribute('data-open')) !== 'true' && (await tab.isVisible())) {
    await press(tab)
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'true')
  }
  if (!(await list.isVisible().catch(() => false))) await press(page.getByTestId('inspector-objects-header'))
  await expect(list).toBeVisible()
}

/** @param {import('@playwright/test').Page} page @param {string} name */
const idOf = async (page, name) => {
  const body = (await sceneBodies(page)).find((candidate) => candidate.name === name)
  if (!body) throw new Error(`no body named ${name}`)
  return body.id
}

/**
 * What the viewport reports about one body.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
const facts = (page, name) =>
  page.locator(`[data-testid="scene-bodies"] li[data-body-name="${name}"]`).evaluate((node) => ({
    bounds: node.getAttribute('data-body-bounds'),
    partColors: node.getAttribute('data-body-part-colors'),
    viewHiddenParts: node.getAttribute('data-view-hidden-parts'),
    color: node.getAttribute('data-body-color'),
  }))

/**
 * Select these bodies in this order from the Objects list, the one multi-select a touch screen has.
 *
 * @param {import('@playwright/test').Page} page
 * @param {(locator: import('@playwright/test').Locator) => Promise<void>} press
 * @param {readonly string[]} names
 */
async function selectInOrder(page, press, names) {
  await openObjects(page, press)
  const [first, ...rest] = names
  await press(page.getByTestId(`objects-row-${await idOf(page, first)}`))
  // One selected collapses the section, so reopen it as a person would.
  for (const name of rest) {
    await openObjects(page, press)
    await press(page.getByTestId(`objects-check-${await idOf(page, name)}`))
  }
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', String(names.length))
}

/**
 * Open a project through the real File ▸ Open path.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text NDJSON.
 * @param {number} bodies
 */
async function openProject(page, text, bodies) {
  const menu = page.getByTestId('file-menu-button')
  await menu.click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  const chooser = await chooserEvent
  await chooser.setFiles({ name: 'scene.ndjson', mimeType: 'text/plain', buffer: Buffer.from(text) })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(bodies))
}

/** Two groups of two 20 mm cubes each and a plate under Cube 3, as `ndjson` lines. */
const TWO_GROUPS_AND_PLATE = [
  { id: 'a', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [-60, 0, 10] } },
  { id: 'b', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [20, 20, 20], center: [-30, 0, 10] } },
  { id: 'g1', op: 'group.assemble', name: 'Group 1', target: 'a', operands: ['b'], consumes: ['a', 'b'], params: { names: ['Cube 1', 'Cube 2'] } },
  { id: 'c', op: 'primitive.cuboid', name: 'Cube 3', params: { size: [20, 20, 20], center: [30, 0, 10] } },
  { id: 'd', op: 'primitive.cuboid', name: 'Cube 4', params: { size: [20, 20, 20], center: [60, 0, 10] } },
  { id: 'g2', op: 'group.assemble', name: 'Group 2', target: 'c', operands: ['d'], consumes: ['c', 'd'], params: { names: ['Cube 3', 'Cube 4'] } },
  { id: 'plate', op: 'primitive.cuboid', name: 'Plate', params: { size: [120, 40, 4], center: [40, 0, 10] } },
]
  .map((record) => JSON.stringify(record))
  .join('\n')

/** Two drop points, clear of the phone's Library sheet and toolbar. */
const DROPS = (/** @type {import('@playwright/test').TestInfo} */ info) =>
  isPhone(info) ? [[0.3, 0.22], [0.7, 0.2]] : [[0.3, 0.45], [0.6, 0.38]]

/** @param {import('@playwright/test').Page} page @param {(locator: import('@playwright/test').Locator) => Promise<void>} press */
async function openPopover(page, press) {
  await press(page.getByTestId('operation-group'))
  await expect(page.getByTestId('group-merge-popover')).toBeVisible()
}

test('two groups are built by hand, and plain solids stay one click', async ({ page }, info) => {
  await page.goto('/')
  const { press, dragRow } = await pointer(page, info)
  await openLibrary(page, press)
  const row = page.getByTestId('library-row-primitive.cuboid')
  for (const [fx, fy] of DROPS(info)) {
    const point = await viewportPoint(page, fx, fy)
    await dragRow(row, point.x, point.y)
  }
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await closeLibrary(page, press)
  await openObjects(page, press)
  await press(page.locator('[data-testid^="objects-check-"]').first())
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await press(page.getByTestId('operation-group'))
  // No popover: this is the common case, and it must not gain a step.
  await expect(page.getByTestId('group-merge-popover')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect((await sceneBodies(page))[0].op).toBe('group.assemble')
})

test('a recoloured solid keeps its colour through a one-click Group, and Undo restores it (TODO/core-077)', async ({ page }, info) => {
  await page.goto('/')
  const { press } = await pointer(page, info)
  await openProject(
    page,
    [
      { id: 'a', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [-30, 0, 10] } },
      { id: 'b', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [20, 20, 20], center: [30, 0, 10] } },
    ]
      .map((record) => JSON.stringify(record))
      .join('\n'),
    2,
  )
  await selectInOrder(page, press, ['Cube 1'])
  await page.getByTestId('inspector-color-input').fill('#ff0000')
  await expect(page.getByTestId('inspector-color-value')).toHaveText('#ff0000')
  await selectInOrder(page, press, ['Cube 1', 'Cube 2'])
  await press(page.getByTestId('operation-group'))
  await expect(page.getByTestId('group-merge-popover')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const colorOf = (name) =>
    page.evaluate(async (partName) => {
      const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
      return useDocumentStore().raw.bodies()[0]?.geometry.colors?.[partName]
    }, name)
  expect(await colorOf('Cube 1')).toEqual({ color: 0xff0000, alpha: 1 })
  expect(await colorOf('Cube 2')).toBeUndefined()
  await press(page.getByTestId('undo-button'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
})

test('merge two groups, one prefixed and hidden; cut with a hidden part; Undo, Redo, reload', async ({ page }, info) => {
  test.setTimeout(150_000)
  await page.goto('/')
  const { press } = await pointer(page, info)
  await openProject(page, TWO_GROUPS_AND_PLATE, 3)
  const groupOne = await idOf(page, 'Group 1')
  const groupTwo = await idOf(page, 'Group 2')

  // A recolour and a Hide in the view, which live outside the Group value and must survive.
  await page.evaluate(
    async ({ one, two }) => {
      const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
      const store = useDocumentStore()
      store.setColorOverride(two, { color: 0xff0000 })
      store.setViewHidden(one, { subPart: 'Cube 2', hidden: true })
    },
    { one: groupOne, two: groupTwo },
  )
  const before = await facts(page, 'Group 1')

  await selectInOrder(page, press, ['Group 1', 'Group 2'])
  await openPopover(page, press)
  const popover = page.getByTestId('group-merge-popover')
  await expect(page.getByTestId('group-merge-summary-0')).toHaveText('Group 1 · 2 parts · keeps its names')
  await expect(page.getByTestId('group-merge-summary-1')).toHaveText('Group 2 · 2 parts')
  // The first merging row has no prefix or Hide field.
  await expect(page.getByTestId('group-merge-prefix-0')).toHaveCount(0)
  await expect(page.getByTestId('group-merge-hide-0')).toHaveCount(0)

  const prefix = page.getByTestId('group-merge-prefix-1')
  const commit = page.getByTestId('group-merge-commit')
  await prefix.fill('a,b')
  await expect(page.getByTestId('group-merge-error')).toContainText('comma')
  await expect(commit).toBeDisabled()
  await prefix.fill('clearance-')
  await expect(page.getByTestId('group-merge-error')).toHaveCount(0)
  await expect(page.getByTestId('group-merge-preview-1')).toHaveText('clearance-Cube 3, +1 more')
  await press(page.getByTestId('group-merge-hide-1'))
  await expect(page.getByTestId('group-merge-hide-1')).toBeChecked()

  // The page never scrolls sideways, and commit is on screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(commit).toBeInViewport()
  await expect(popover).toHaveScreenshot('group-merge-popover.png', { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.03 })

  await press(commit)
  await expect(popover).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  const merged = await facts(page, 'Group 1')
  // Hidden parts do not count, so the size is the first group's.
  expect(merged.bounds).toBe(before.bounds)
  expect(merged.viewHiddenParts).toBe('Cube 2')
  const mergedId = await idOf(page, 'Group 1')
  // Baked into the recipe tier, which the scene list's user-override attributes do not announce.
  const bakedColor = await page.evaluate(async (id) => {
    const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
    return useDocumentStore().raw.bodies().find((body) => body.id === id)?.geometry.colors['clearance-Cube 3']
  }, mergedId)
  expect(bakedColor).toEqual({ color: 0xff0000, alpha: 1 })
  expect((await sceneBodies(page)).find((body) => body.id === mergedId)?.op).toBe('group.merge')

  // Every part in the Inspector, hidden ones labelled and reachable.
  await expect(page.getByTestId('inspector-part-item-Cube 1')).toHaveAttribute('data-hidden', 'false')
  await expect(page.getByTestId('inspector-part-item-clearance-Cube 3')).toHaveAttribute('data-hidden', 'true')
  await expect(page.getByTestId('inspector-part-item-clearance-Cube 4')).toHaveAttribute('data-hidden', 'true')
  await expect(page.getByTestId('inspector-hidden-parts-toggle')).toBeVisible()
  await expect(page.getByTestId('inspector-params-note')).toContainText('History')

  // Cut the plate with one hidden part: the pocket exists and the group stays.
  const volumeOf = (name) =>
    page.locator(`[data-testid="scene-bodies"] li[data-body-name="${name}"]`).getAttribute('data-body-volume')
  await expect.poll(() => volumeOf('Plate')).not.toBeNull()
  const plateVolume = Number(await volumeOf('Plate'))
  await openObjects(page, press)
  await press(page.getByTestId(`objects-row-${await idOf(page, 'Plate')}`))
  await openObjects(page, press)
  await press(page.getByTestId(`objects-expand-${mergedId}`))
  await press(page.getByTestId(`objects-part-check-${mergedId}-clearance-Cube 3`))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await press(page.getByTestId('operation-subtract'))
  await expect.poll(async () => (await sceneBodies(page)).map((body) => body.name).sort()).toEqual(['Group 1', 'Subtract 1'])
  await expect.poll(() => volumeOf('Subtract 1')).not.toBeNull()
  expect(Number(await volumeOf('Subtract 1'))).toBeCloseTo(plateVolume - 20 * 20 * 4, 0)

  // Cut a second clearance with the same group.
  await openObjects(page, press)
  await press(page.getByTestId(`objects-row-${await idOf(page, 'Subtract 1')}`))
  await openObjects(page, press)
  const expanded = page.getByTestId(`objects-part-check-${mergedId}-clearance-Cube 4`)
  if (!(await expanded.isVisible().catch(() => false))) await press(page.getByTestId(`objects-expand-${mergedId}`))
  await press(expanded)
  await press(page.getByTestId('operation-subtract'))
  await expect.poll(async () => (await sceneBodies(page)).map((body) => body.name).sort()).toEqual(['Group 1', 'Subtract 2'])

  // Undo three times: each cut, then the merge, with both groups as they were.
  const undo = page.getByTestId('undo-button')
  await press(undo)
  await press(undo)
  await expect(undo).toHaveAttribute('title', /Undo: Merge/)
  await press(undo)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  expect((await facts(page, 'Group 1')).viewHiddenParts).toBe('Cube 2')
  expect((await facts(page, 'Group 2')).color).not.toBeNull()

  const redo = page.getByTestId('redo-button')
  await press(redo)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  expect((await facts(page, 'Group 1')).viewHiddenParts).toBe('Cube 2')

  // Reload: the merged body comes back from the autosave.
  await page.waitForTimeout(800)
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  expect((await facts(page, 'Group 1')).viewHiddenParts).toBe('Cube 2')
})

test('unticking Merge parts on every row gives today’s two-part result', async ({ page }, info) => {
  await page.goto('/')
  const { press } = await pointer(page, info)
  await openProject(page, TWO_GROUPS_AND_PLATE, 3)
  await selectInOrder(page, press, ['Group 1', 'Group 2'])
  await openPopover(page, press)
  await press(page.getByTestId('group-merge-keep-0'))
  await press(page.getByTestId('group-merge-keep-1'))
  await expect(page.getByTestId('group-merge-summary-0')).toHaveText('Group 1 · one part')
  await press(page.getByTestId('group-merge-commit'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const bodies = await sceneBodies(page)
  expect(bodies.find((body) => body.name === 'Group 3')?.op).toBe('group.assemble')
})

test('add to a built-in: a hidden Cube joins a Pi, hole1 still cuts, and Model edits from History', async ({ page }, info) => {
  test.setTimeout(120_000)
  await page.goto('/')
  const { press } = await pointer(page, info)
  // A 2 mm plate across the board, centred on its mounting holes, so `hole1` really cuts it.
  const plate = JSON.stringify({ id: 'plate', op: 'primitive.cuboid', name: 'Plate', params: { size: [120, 90, 2], center: [42.5, 28, 0] } })
  const scene = `${readFileSync(join(process.cwd(), 'e2e/docs/fixtures/pi-and-cube.ndjson'), 'utf8').trimEnd()}\n${plate}`
  await openProject(page, scene, 3)
  const piName = (await sceneBodies(page)).find((body) => body.op === 'raspberrypi.bplus' || body.name.startsWith('Raspberry'))?.name
  const cubeName = (await sceneBodies(page)).find((body) => body.op === 'primitive.cuboid')?.name
  // The Cube first, so the first-picked body is not the target.
  await selectInOrder(page, press, [String(cubeName), String(piName)])
  await openPopover(page, press)
  await expect(page.getByTestId('group-merge-summary-1')).toContainText('parts · keeps its names')
  await expect(page.getByTestId('group-merge-summary-0')).toHaveText(`${cubeName} · 1 part`)
  await expect(page.getByTestId('group-merge-keep-0')).toHaveCount(0)
  await press(page.getByTestId('group-merge-hide-0'))
  await press(page.getByTestId('group-merge-commit'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const mergedId = await idOf(page, String(piName))
  await expect(page.getByTestId(`inspector-part-item-${cubeName}`)).toHaveAttribute('data-hidden', 'true')
  await expect(page.getByTestId('inspector-part-item-hole1')).toHaveAttribute('data-hidden', 'true')

  // Merging did not take the Pi's drilling away: `hole1` cuts the plate, and the Pi stays.
  await openObjects(page, press)
  await press(page.getByTestId(`objects-row-${await idOf(page, 'Plate')}`))
  await openObjects(page, press)
  await press(page.getByTestId(`objects-expand-${mergedId}`))
  await press(page.getByTestId(`objects-part-check-${mergedId}-hole1`))
  await press(page.getByTestId('operation-subtract'))
  await expect.poll(async () => (await sceneBodies(page)).map((body) => body.name).sort()).toEqual([String(piName), 'Subtract 1'].sort())

  // The Pi's Model moved to its own row in History, and changing it keeps the Cube.
  await page.getByTestId('timeline-toggle').click()
  await page.locator('[data-step-id="pi-1"]').click()
  await page.getByTestId('timeline-edit').click()
  await page.getByTestId('timeline-field-model').selectOption({ label: 'Pi 3' })
  await page.getByTestId('timeline-apply').click()
  await expect(page.getByTestId('timeline-edit-form')).toHaveCount(0)
  await expect.poll(async () => (await sceneBodies(page)).map((body) => body.name).sort()).toEqual([String(piName), 'Subtract 1'].sort())
})

test('two bolts open with a suggested prefix; clearing it is a collision that disables commit', async ({ page }, info) => {
  await page.goto('/')
  const { press, dragRow } = await pointer(page, info)
  await openLibrary(page, press)
  const row = page.getByTestId('library-row-hardware.bolt')
  for (const [fx, fy] of DROPS(info)) {
    const point = await viewportPoint(page, fx, fy)
    await dragRow(row, point.x, point.y)
  }
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await closeLibrary(page, press)
  await openObjects(page, press)
  await press(page.locator('[data-testid^="objects-check-"]').first())
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await openPopover(page, press)

  const prefix = page.getByTestId('group-merge-prefix-1')
  const suggested = await prefix.inputValue()
  // Bolt 2 was placed last, so it is picked first and keeps its names: the row is Bolt 1's.
  expect(suggested).toBe('Bolt / screw 1-')
  await expect(page.getByTestId('group-merge-commit')).toBeEnabled()
  await prefix.fill('')
  await expect(page.getByTestId('group-merge-error')).toContainText('is already a part of')
  await expect(page.getByTestId('group-merge-commit')).toBeDisabled()
  await prefix.fill(suggested)
  await press(page.getByTestId('group-merge-commit'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId(`inspector-part-item-${suggested}head`)).toBeVisible()
})
