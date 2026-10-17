// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

/**
 * Naming a placed part or group in the Inspector (`TODO/ui-056`), driven against `/`.
 *
 * The user-facing claim: drop two bolts, name them, and read the right names back in the
 * Inspector header, the object list and the phone tab — also after a reload — with Undo
 * restoring the generated name, a gizmo drag leaving the name alone, and a group renamed
 * the same way.
 *
 * **Engines and viewports.** All three reference viewports with a snapshot at each (the
 * field is a full-width row at phone width) and all three engines (persistence on reload
 * and the touch keyboard path). The touch case uses Playwright's trusted `tap`, which
 * focuses the input and raises the keyboard the way a finger does, and skips where the
 * project has no touch emulation.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'rename-part-snapshots')

const BOLT_A = { fx: 0.28, fy: 0.42 }
const BOLT_B = { fx: 0.72, fy: 0.3 }
const CUBE_A = { drop: { fx: 0.28, fy: 0.42 }, click: { fx: 0.28, fy: 0.38 } }
const CUBE_B = { drop: { fx: 0.72, fy: 0.3 }, click: { fx: 0.72, fy: 0.26 } }

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
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 11,
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
  await page.waitForTimeout(140)
}

/**
 * Real `PointerEvent`s on the canvas, the way every spec here clicks a solid.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 * @param {{ shift?: boolean }} [modifiers]
 */
async function clickViewportAt(page, fx, fy, modifiers = {}) {
  await page.evaluate(
    ({ fx, fy, shift }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      const box = canvas.getBoundingClientRect()
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 3,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            shiftKey: shift === true,
            clientX: box.left + box.width * fx,
            clientY: box.top + box.height * fy,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy, shift: modifiers.shift === true },
  )
  await page.waitForTimeout(90)
}

/** @param {import('@playwright/test').Page} page */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: (node.getAttribute('data-body-center') ?? '').split(',').map(Number),
    })),
  )
}

/** @param {import('@playwright/test').Page} page */
async function names(page) {
  return (await sceneBodies(page)).map((body) => body.name).sort()
}

/**
 * Select a body from the object list — the route that works at every width.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
async function selectFromList(page, id) {
  const header = page.getByTestId('inspector-objects-header')
  if (!(await page.getByTestId(`objects-row-${id}`).isVisible())) {
    if (!(await header.isVisible())) await page.getByTestId('inspector-tab').click()
    if ((await header.getAttribute('aria-expanded')) === 'false') await header.click()
  }
  await page.getByTestId(`objects-row-${id}`).click()
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-selected-id', id)
}

/**
 * Rename the selection through the field with the real mouse and keyboard.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function renameSelected(page, name) {
  await page.getByTestId('inspector-name-edit').click()
  const input = page.getByTestId('inspector-name-input')
  await expect(input).toBeFocused()
  await input.fill(name)
  await page.keyboard.press('Enter')
  await expect(input).toHaveCount(0)
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function placeTwoBolts(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'hardware.bolt', ...BOLT_A })
  await dragRowIntoViewport(page, { op: 'hardware.bolt', ...BOLT_B })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-root')).toBeVisible()
})

test('name two bolts with the mouse: header, object list and scene all read the new names; Undo restores', async ({
  page,
}, testInfo) => {
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await placeTwoBolts(page)
  const [first, second] = await sceneBodies(page)
  expect([first.name, second.name].sort()).toEqual(['Bolt / screw 1', 'Bolt / screw 2'])

  // The part that just arrived is selected: the field is right there, not pre-selected
  // for typing (nothing steals an arrow-key nudge), and the pencil is always visible.
  await expect(page.getByTestId('inspector-name-edit')).toBeVisible()
  await renameSelected(page, 'Screen bolt')
  await expect(page.getByTestId('inspector-name')).toHaveText('Screen bolt')
  // Selection survived the commit (the lost-selection class, ui-029).
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-selected-id', second.id)

  await selectFromList(page, first.id)
  await renameSelected(page, 'Pi camera bolt')
  await expect(page.getByTestId('inspector-name')).toHaveText('Pi camera bolt')
  expect(await names(page)).toEqual(['Pi camera bolt', 'Screen bolt'])

  // Object list rows and the tab read the same names.
  const header = page.getByTestId('inspector-objects-header')
  if ((await header.getAttribute('aria-expanded')) === 'false') await header.click()
  await expect(page.getByTestId('objects-row-name')).toHaveText(['Pi camera bolt', 'Screen bolt'])
  await expect(page.getByTestId('inspector-tab')).toHaveAttribute('title', 'Pi camera bolt')

  await page.screenshot({ path: join(SNAPSHOT_DIR, `renamed-${testInfo.project.name}.png`) })

  // Undo (keyboard, focus not in a field) restores the generated name.
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(150)
  await expect.poll(() => names(page)).toEqual(['Bolt / screw 1', 'Screen bolt'])
})

test('Escape in the field reverts and a blank entry restores the generated name', async ({ page }) => {
  await placeTwoBolts(page)
  const [, second] = await sceneBodies(page)
  const generated = second.name

  await page.getByTestId('inspector-name-edit').click()
  const input = page.getByTestId('inspector-name-input')
  await input.fill('Throwaway')
  await page.keyboard.press('Escape')
  await expect(input).toHaveCount(0)
  await expect(page.getByTestId('inspector-name')).toHaveText(generated)

  await renameSelected(page, 'Case bolt')
  await expect(page.getByTestId('inspector-name')).toHaveText('Case bolt')
  await renameSelected(page, '   ')
  await expect(page.getByTestId('inspector-name')).toHaveText(generated)
  await expect(page.getByTestId('inspector-name-help')).toContainText(generated)
})

test('a duplicate name shows a hint and still commits; F2 starts editing', async ({ page }) => {
  await placeTwoBolts(page)
  const bodies = await sceneBodies(page)
  const other = bodies[0].name
  await page.keyboard.press('F2')
  const input = page.getByTestId('inspector-name-input')
  await expect(input).toBeFocused()
  await input.fill(other)
  await expect(page.getByTestId('inspector-name-hint')).toHaveText('Another part is already called this')
  await page.keyboard.press('Enter')
  expect((await names(page)).filter((name) => name === other)).toHaveLength(2)
})

test('the name survives a gizmo drag and a reload', async ({ page }) => {
  await placeTwoBolts(page)
  const [, second] = await sceneBodies(page)
  await renameSelected(page, 'Case bolt')
  await expect(page.getByTestId('save-status-text')).toHaveText(/^Saved/, { timeout: 15000 })

  // Drag the selected body's X arm with real pointer events.
  const arm = page.locator('[data-testid="gizmo-grab-arm-x"]')
  await expect(arm).toBeAttached()
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="gizmo-grab-arm-x"]')
    const box = el.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const fire = (type, dx) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 21,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x + dx,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      )
    fire('pointerdown', 0)
    for (const dx of [15, 30, 45, 60]) fire('pointermove', dx)
    fire('pointerup', 60)
  })
  await page.waitForTimeout(150)
  await expect(page.getByTestId('inspector-name')).toHaveText('Case bolt')
  expect(await names(page)).toContain('Case bolt')
  await expect(page.getByTestId('save-status-text')).toHaveText(/^Saved/, { timeout: 15000 })

  await page.reload()
  await expect(page.getByTestId('app-root')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  expect(await names(page)).toContain('Case bolt')
  expect((await sceneBodies(page)).find((body) => body.name === 'Case bolt')?.id).toBe(second.id)
})

test('a group renames like a body, and the name survives drilling into a sub-part and back out', async ({
  page,
}) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_B.drop })
  await closeLibrary(page)
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await clickViewportAt(page, CUBE_B.click.fx, CUBE_B.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  // No name field for a multi-selection.
  await expect(page.getByTestId('inspector-name-edit')).toHaveCount(0)
  await page.getByTestId('operation-group').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('inspector-name-edit')).toBeVisible()

  await renameSelected(page, 'Mounting block')
  expect(await names(page)).toEqual(['Mounting block'])

  // Drill into a sub-part (via the Parts list), where there is no name field…
  const [group] = await sceneBodies(page)
  const header = page.getByTestId('inspector-objects-header')
  if ((await header.getAttribute('aria-expanded')) === 'false') await header.click()
  await page.getByTestId(`objects-expand-${group.id}`).click()
  await page.locator(`[data-testid^="objects-parts-${group.id}"] button[data-testid]`).first().click()
  await expect(page.getByTestId('inspector-breadcrumb-part')).toBeVisible()
  await expect(page.getByTestId('inspector-name-edit')).toHaveCount(0)

  // …and stepping back out shows the group's own name, field present again.
  await page.getByTestId('inspector-breadcrumb-group').click()
  await expect(page.getByTestId('inspector-name')).toHaveText('Mounting block')
  await expect(page.getByTestId('inspector-name-edit')).toBeVisible()
})

test('with a touchscreen: tap the name, type, tap away commits', async ({ page, hasTouch, browserName }, testInfo) => {
  test.skip(!hasTouch, 'this project has no touch emulation')
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await placeTwoBolts(page)
  await expect(page.getByTestId('inspector-name-edit')).toBeVisible()

  // Full-width row, at least a tap target tall.
  const name = page.getByTestId('inspector-name')
  await name.tap()
  const input = page.getByTestId('inspector-name-input')
  await expect(input).toBeFocused()
  const box = await input.boundingBox()
  expect(box.height).toBeGreaterThanOrEqual(43)
  await input.fill('Pi camera bolt')
  await page.screenshot({ path: join(SNAPSHOT_DIR, `touch-editing-${testInfo.project.name}.png`) })
  // Tap away: a Bill-of-materials row is plain text, not a control, so blur is the only commit path exercised.
  await page.getByTestId('bom-row').first().tap()
  await expect(input).toHaveCount(0)
  await expect(page.getByTestId('inspector-name')).toHaveText('Pi camera bolt')
  expect(await names(page)).toContain('Pi camera bolt')
  void browserName
})
