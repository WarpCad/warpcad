// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Operations toolbar's one **Align** tool (`TODO/ui-060`), driven against `/` — the
 * running app, not a Storybook iframe. It absorbed the Inspector's Align to origin row
 * (`TODO/ui-050`, this file's original subject) and the Snap and Align buttons
 * (`TODO/ui-026`), so this file covers all three through the one popover: World origin with
 * 1 body, World origin with 2 (the first moves alone), and Second selected with `◇ ctr`
 * and each Snap **Relation**. Every two-body case asserts the second body did not move.
 *
 * Runs the full 3 viewport × 3 engine matrix from `playwright.config.js`: the assertions
 * read rendered evaluated geometry (`data-body-bounds`), the gizmo's own drag path, and a
 * phone-width popover of 44 px buttons — the WebGL/canvas/touch surface CLAUDE.md's
 * Browser Support section defaults to all three engines for.
 *
 * The load-bearing origin case is the Pi: `raspberrypi.bplus.js` snaps `microsd`
 * `outside+` under `mb` (the board), so the whole body's own min Z sits 1.5 mm *below*
 * the board's — "snap the bottom of the motherboard to Z=0" has to measure from `mb` alone
 * while moving the whole Pi, which is `TODO/ui-050`'s entire reason for **Measure from**.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'align-to-origin-snapshots')

/**
 * Open the Library if this viewport keeps it behind a tab, and scroll the
 * Raspberry Pi section into view — the same two-step `kit-rpi-library-
 * placement.e2e.js` already needs for a 26-row sheet.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  const section = page.getByTestId('library-rows-raspberrypi')
  if (await section.isVisible().catch(() => false)) await section.scrollIntoViewIfNeeded()
}

/**
 * Put the Library sheet away, if this viewport has one.
 *
 * @param {import('@playwright/test').Page} page
 */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag a Library row into the viewport and release inside it — real
 * `PointerEvent`s, matching every other spec in this folder.
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
      for (const t of [0.25, 0.5, 0.75, 1]) {
        fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      }
      fire(window, 'pointerup', endX, endY)
    },
    { op, fx, fy },
  )
  await page.waitForTimeout(120)
}

/**
 * Click at a fraction of the viewport, as a press that does not move.
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
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      const x = box.left + box.width * fx
      const y = box.top + box.height * fy
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 3,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            shiftKey: shift === true,
            clientX: x,
            clientY: y,
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

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, op: string, name: string, center: string, bounds: string }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: node.getAttribute('data-body-center') ?? '',
      bounds: node.getAttribute('data-body-bounds') ?? '',
    })),
  )
}

/**
 * @param {string} bounds `"minX,minY,minZ,maxX,maxY,maxZ"` as `data-body-bounds` renders it.
 * @returns {[[number, number, number], [number, number, number]]}
 */
function parseBounds(bounds) {
  const [minX, minY, minZ, maxX, maxY, maxZ] = bounds.split(',').map(Number)
  return [[minX, minY, minZ], [maxX, maxY, maxZ]]
}

/**
 * @param {string} center `"x,y,z"` as `data-body-center` renders it.
 * @returns {[number, number, number]}
 */
function parseCenter(center) {
  const [x, y, z] = center.split(',').map(Number)
  return [x, y, z]
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @returns {Promise<number>}
 */
async function fieldNumber(page, testId) {
  const raw = await page.getByTestId(testId).inputValue()
  return Number(raw.replace(/[°\s]/g, ''))
}

/** Drop point for the Pi, and the click point that lands on it afterward. */
const PI = { drop: { fx: 0.3, fy: 0.34 }, click: { fx: 0.3, fy: 0.3 } }
/** Same fixture position `snap-align-operation.e2e.js`/`boolean-operations.e2e.js` use for a Cube. */
const CUBE = { drop: { fx: 0.28, fy: 0.42 }, click: { fx: 0.28, fy: 0.38 } }

/** The second body for the two-body cases, where the snap-align spec drops its Cylinder. */
const CYLINDER = { drop: { fx: 0.72, fy: 0.3 }, click: { fx: 0.72, fy: 0.26 } }

/**
 * Open the Align popover from the Operations toolbar.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openAlign(page) {
  await page.getByTestId('operation-align').click()
  await expect(page.getByTestId('align-popover')).toBeVisible()
}

/**
 * Close the Align popover the way a user does: Escape (the backdrop works too).
 *
 * @param {import('@playwright/test').Page} page
 */
async function closeAlign(page) {
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('align-popover')).toHaveCount(0)
}

/**
 * Tap one popover button and wait until a body's bounds actually change.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @param {string} bodyId
 */
async function tapAndSettle(page, testId, bodyId) {
  const item = page.locator(`[data-testid="scene-bodies"] li[data-body-id="${bodyId}"]`)
  const before = await item.getAttribute('data-body-bounds')
  await page.getByTestId(testId).click()
  await expect(page.getByTestId('align-error')).toHaveCount(0)
  await expect.poll(() => item.getAttribute('data-body-bounds'), { timeout: 15_000 }).not.toBe(before)
}

/**
 * The History step count and the last row's label, read with the Timeline opened and put
 * back as it was — on a phone the Timeline shares the Inspector's sheet slot.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ steps: number, lastLabel: string }>}
 */
async function readHistory(page) {
  const toggle = page.getByTestId('timeline-toggle')
  const usesToggle = await toggle.isVisible()
  if (usesToggle) await toggle.click()
  const text = await page.getByTestId('timeline-count').textContent()
  const rows = page.locator('[data-testid^="timeline-row-"] .row__text')
  const lastLabel = (await rows.count()) > 0 ? ((await rows.last().textContent()) ?? '') : ''
  if (usesToggle) await toggle.click()
  return { steps: Number(String(text).match(/\d+/)?.[0] ?? '0'), lastLabel }
}

/**
 * Drop a Cube and a Cylinder and select them Cube first.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeCubeThenCylinder(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', ...CYLINDER.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const [cube, cylinder] = await sceneBodies(page)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await clickViewportAt(page, CYLINDER.click.fx, CYLINDER.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  return { cube, cylinder }
}

/** @param {import('@playwright/test').Page} page */
async function expectNoInspectorAlignRow(page) {
  // The guard against the old Inspector row coming back (`TODO/ui-060`).
  await expect(page.locator('[data-testid^="align-origin-"]')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('Align is disabled with nothing selected; with one Cube it opens on World origin; the Inspector has no Align to origin row', async ({
  page,
}) => {
  await expect(page.getByTestId('operation-align')).toBeDisabled()
  await expectNoInspectorAlignRow(page)

  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await closeLibrary(page)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expectNoInspectorAlignRow(page)

  await openAlign(page)
  await expect(page.getByTestId('align-popover')).toHaveAttribute('data-target', 'origin')
  await expect(page.getByTestId('align-operands')).toHaveText(/to World origin$/)
  // One body: no Target dropdown, no Snap row, no offset; no Measure from on a bare solid.
  await expect(page.getByTestId('align-target')).toHaveCount(0)
  await expect(page.getByTestId('align-relation')).toHaveCount(0)
  await expect(page.getByTestId('align-offset')).toHaveCount(0)
  await expect(page.getByTestId('align-reference')).toHaveCount(0)
  await expect(page.getByTestId('align-drop')).toBeEnabled()
})

test('tapping X max on a Cube changes only X, and the popover stays open for the next tap', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await closeLibrary(page)
  const [cube] = await sceneBodies(page)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)

  const before = parseCenter(cube.center)
  await openAlign(page)
  await tapAndSettle(page, 'align-x-max', cube.id)
  await expect(page.getByTestId('align-popover')).toBeVisible()

  const [after] = await sceneBodies(page)
  const afterCenter = parseCenter(after.center)
  const [, afterMax] = parseBounds(after.bounds)
  expect(afterMax[0]).toBeCloseTo(0, 1)
  expect(afterCenter[1]).toBeCloseTo(before[1], 1)
  expect(afterCenter[2]).toBeCloseTo(before[2], 1)
})

test('drop a Pi, Measure from "mb": X ctr, Y ctr, Z min are three steps and three Undos; the shortcut is one step', async ({
  page,
}) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'raspberrypi.bplus', ...PI.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const stepsBefore = (await readHistory(page)).steps

  const [piBefore] = await sceneBodies(page)
  // A just-dropped body is already selected (`ui-010`), so the first click here would be
  // the *second* click on it and drill into a part. Deselect first.
  await clickViewportAt(page, 0.04, 0.06)
  await clickViewportAt(page, PI.click.fx, PI.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', piBefore.id)

  await openAlign(page)
  await expect(page.getByTestId('align-operands')).toHaveText(/to World origin$/)
  const measureFrom = page.getByTestId('align-reference')
  await expect(measureFrom).toBeVisible()
  await measureFrom.selectOption('mb')

  // X then Y then Z without reopening: the popover stays open between taps.
  await tapAndSettle(page, 'align-x-center', piBefore.id)
  await tapAndSettle(page, 'align-y-center', piBefore.id)
  await tapAndSettle(page, 'align-z-min', piBefore.id)
  await closeAlign(page)

  expect((await readHistory(page)).steps).toBe(stepsBefore + 3)
  const [piAligned] = await sceneBodies(page)
  const [minAligned, maxAligned] = parseBounds(piAligned.bounds)
  // The board's underside is on Z = 0; the microSD under it puts the whole Pi's floor at
  // −1.5 — the reason this measures from a named part, not the whole box.
  expect(minAligned[2]).toBeCloseTo(-1.5, 1)
  expect(maxAligned[2]).toBeGreaterThan(0)
  // Near the origin in plan (the whole box is not symmetric about `mb`, so not exactly 0).
  expect(Math.abs(await fieldNumber(page, 'inspector-position-x'))).toBeLessThan(3)
  expect(Math.abs(await fieldNumber(page, 'inspector-position-y'))).toBeLessThan(3)

  for (let step = 0; step < 3; step += 1) await page.getByTestId('undo-button').click()
  await expect.poll(async () => (await sceneBodies(page))[0].center).toBe(piBefore.center)

  // The one-step form: the same placement, one History step.
  await openAlign(page)
  await expect(page.getByTestId('align-reference')).toHaveValue('mb') // remembered for the session
  await tapAndSettle(page, 'align-drop', piBefore.id)
  await closeAlign(page)
  const history = await readHistory(page)
  expect(history.steps).toBe(stepsBefore + 1)
  // `params.alignedTo` labels the step "Align to origin", not a plain "Move" (`ui-050`).
  expect(history.lastLabel).toMatch(/Align to origin/)
  const [piDropped] = await sceneBodies(page)
  expect(parseBounds(piDropped.bounds)[0][2]).toBeCloseTo(-1.5, 1)
})

test('drilled into the Pi’s "usb1", the top line names the part; stepping back up preselects it as Measure from', async ({
  page,
}) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'raspberrypi.bplus', ...PI.drop })
  await closeLibrary(page)
  const [pi] = await sceneBodies(page)

  // Drill in through the Inspector's Parts section (`TODO/ui-049`), deterministic
  // regardless of camera projection.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', pi.id)
  await page.getByTestId('inspector-part-usb1').click()
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('usb1')

  // At part depth the address *is* what is measured: the top line says so, and there is
  // no Measure from to disagree with it.
  await openAlign(page)
  await expect(page.getByTestId('align-operand-moving')).toHaveText(/› usb1$/)
  await expect(page.getByTestId('align-reference')).toHaveCount(0)
  await closeAlign(page)

  await page.getByTestId('inspector-breadcrumb-group').click()
  await openAlign(page)
  await expect(page.getByTestId('align-reference')).toHaveValue('usb1')
})

test('after aligning, dragging the gizmo still keeps the Position fields and the mesh in sync', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await closeLibrary(page)
  const [cube] = await sceneBodies(page)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)

  await openAlign(page)
  await tapAndSettle(page, 'align-x-min', cube.id)
  await closeAlign(page)
  const [bodyAfterAlign] = await sceneBodies(page)
  const [minAfterAlign] = parseBounds(bodyAfterAlign.bounds)
  expect(minAfterAlign[0]).toBeCloseTo(0, 0)

  // A small drag on the gizmo's X arm — real PointerEvents on the hit target, matching
  // `gizmo-transform.e2e.js`'s own drag technique.
  const handle = page.getByTestId('gizmo-grab-arm-x')
  const box = await handle.boundingBox()
  if (!box) throw new Error('no gizmo handle box — is the gizmo attached?')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 40, startY, { steps: 4 })
  await page.mouse.up()

  const fieldX = await fieldNumber(page, 'inspector-position-x')
  const [afterDrag] = await sceneBodies(page)
  const meshCenter = parseCenter(afterDrag.center)
  expect(fieldX).toBeCloseTo(meshCenter[0], 0)
})

test('two selected, World origin: only the first-picked body moves, and the second loses its role colour', async ({
  page,
}) => {
  const { cube, cylinder } = await placeCubeThenCylinder(page)
  await expectNoInspectorAlignRow(page)
  await openAlign(page)
  const target = page.getByTestId('align-target')
  await expect(target).toHaveValue('second')
  const cylinderRow = page.locator(`[data-testid="scene-bodies"] li[data-body-id="${cylinder.id}"]`)
  await expect(cylinderRow).toHaveAttribute('data-selection-role', 'secondary')

  await target.selectOption('origin')
  await expect(page.getByTestId('align-operands')).toHaveText(/to World origin$/)
  await expect(page.getByTestId('align-relation')).toHaveCount(0)
  await expect(cylinderRow).toHaveAttribute('data-selection-role', 'none')

  await tapAndSettle(page, 'align-drop', cube.id)
  const after = await sceneBodies(page)
  const [cubeMin] = parseBounds(after.find((body) => body.id === cube.id).bounds)
  expect(cubeMin[2]).toBeCloseTo(0, 1)
  expect(after.find((body) => body.id === cylinder.id).center).toBe(cylinder.center)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')

  await closeAlign(page)
  await expect(cylinderRow).toHaveAttribute('data-selection-role', 'secondary')
})

test('two selected, Second selected: ◇ ctr centres on the second; each Snap Relation lands where its + side label says; the second never moves', async ({
  page,
}) => {
  const { cube, cylinder } = await placeCubeThenCylinder(page)
  const [cylMin, cylMax] = parseBounds(cylinder.bounds)
  const cylCentreX = (cylMin[0] + cylMax[0]) / 2

  await openAlign(page)
  await expect(page.getByTestId('align-popover')).toHaveAttribute('data-target', 'second')
  await expect(page.getByTestId('align-drop')).toBeDisabled()

  /** @returns {Promise<[[number, number, number], [number, number, number]]>} */
  const cubeBounds = async () => parseBounds((await sceneBodies(page)).find((body) => body.id === cube.id).bounds)

  // ◇ ctr on X is the old Align: centre on the cylinder.
  await tapAndSettle(page, 'align-x-center', cube.id)
  let [min, max] = await cubeBounds()
  expect((min[0] + max[0]) / 2).toBeCloseTo(cylCentreX, 1)

  // Outside, + side: the cube's − face on the cylinder's + face.
  await page.getByTestId('align-relation').selectOption('outside')
  await tapAndSettle(page, 'align-x-snap-plus', cube.id)
  ;[min] = await cubeBounds()
  expect(min[0]).toBeCloseTo(cylMax[0], 1)

  // Inside, + face: the cube's + face flush with the cylinder's + face.
  await page.getByTestId('align-relation').selectOption('inside')
  await tapAndSettle(page, 'align-x-snap-plus', cube.id)
  ;[, max] = await cubeBounds()
  expect(max[0]).toBeCloseTo(cylMax[0], 1)

  // Center, + half: the cube's − face on the cylinder's centre.
  await page.getByTestId('align-relation').selectOption('center')
  await tapAndSettle(page, 'align-x-snap-plus', cube.id)
  ;[min] = await cubeBounds()
  expect(min[0]).toBeCloseTo(cylCentreX, 1)

  const after = await sceneBodies(page)
  expect(after.find((body) => body.id === cylinder.id).center).toBe(cylinder.center)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
})

test('the popover fits 390px width without horizontal page scroll at ≥44px tap targets, with a snapshot at each reference viewport', async ({
  page,
}) => {
  await placeCubeThenCylinder(page)
  await openAlign(page)
  const popover = page.getByTestId('align-popover')

  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
  const box = await popover.boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(clientWidth + 1)

  for (const testId of ['align-drop', 'align-x-min', 'align-y-center', 'align-z-max', 'align-x-snap-minus', 'align-z-snap-plus']) {
    const control = await page.getByTestId(testId).boundingBox()
    expect(control, testId).not.toBeNull()
    expect(control.width).toBeGreaterThanOrEqual(44)
    expect(control.height).toBeGreaterThanOrEqual(44)
  }

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${test.info().project.name}.png`) })
})
