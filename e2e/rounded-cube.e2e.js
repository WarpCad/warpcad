// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'

/**
 * A Cube's **Corner radius** and **Rounded axis** (`TODO/core-080`), driven against `/`: the
 * running app, a Cube dragged from the Library with real pointer events, edited through the
 * Inspector's own fields.
 *
 * **All three engines and all three reference viewports, no `test.skip` pin.** A radius edit
 * rebuilds kernel geometry and re-renders it (WebGL), the reload leg is persistence, and the
 * two new rows sit in the phone's Inspector sheet, which must not start scrolling sideways
 * (`ui-085`). Each project writes a snapshot of the Inspector rows to
 * `test-results/rounded-cube-snapshots/`.
 *
 * What each case guards:
 *
 * - **The rounding is real and Size is not touched.** The measured volume drops by the
 *   corners' material and the canvas changes, while the bounds and the Size fields still read
 *   the full box. One Undo restores the sharp cube exactly.
 * - **The axis moves the rounding.** On a 40 × 40 × 20 box a Z axis and an X axis remove
 *   different amounts (the rounded edges are 20 mm long, then 40 mm), so a select that
 *   changed nothing would show here.
 * - **Too big a radius is refused, not clamped.** Across X the box is 40 × 20, so 12 mm is
 *   refused naming 10 mm, and the body keeps its last good shape.
 * - **Both fields survive a save and a reload.**
 * - **A Cube inside a group has them too** (`TODO/ui-104`). Stepped into from the group's
 *   Parts list, the part's fields edit its own record: the group's outline rounds where the
 *   part is, Size is untouched, the other part does not move, and Undo and a reload behave
 *   as for a whole Cube. Loaded from `e2e/fixtures/rounded-cube-group.ndjson`.
 *
 * Measurements come off `data-body-bounds` / `data-body-volume` (`Viewport.vue`), the
 * evaluated geometry, not the record's own params.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'rounded-cube-snapshots')

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
 * Drag a Library row into the viewport and release inside it, with real `PointerEvent`s.
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
 * The scene's bodies, once each one's volume has been measured.
 *
 * A bare Cube is measured on the spot, but a group's volume is a kernel union, which
 * `TODO/core-029` moved into the evaluation worker: `data-body-volume` is absent until the
 * worker's answer lands, so this waits for it rather than reading `NaN`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, bounds: number[], volumeMm3: number }[]>}
 */
async function sceneBodies(page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((node) => node.hasAttribute('data-body-volume')),
  )
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      bounds: (node.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
      volumeMm3: Number(node.getAttribute('data-body-volume') ?? 'NaN'),
    })),
  )
}

/** @param {{ bounds: number[] }} body */
function sizeOf(body) {
  return [body.bounds[3] - body.bounds[0], body.bounds[4] - body.bounds[1], body.bounds[5] - body.bounds[2]]
}

/**
 * Type into an Inspector field and commit with Enter, the trigger the TODO names.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @param {string | number} value
 */
async function typeIntoField(page, testId, value) {
  const field = page.getByTestId(testId)
  await field.scrollIntoViewIfNeeded()
  await expect(field).toBeVisible()
  await field.click()
  await field.fill(String(value))
  await field.press('Enter')
  await page.waitForTimeout(160)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 */
async function fieldNumber(page, testId) {
  const raw = await page.getByTestId(testId).inputValue()
  return Number(raw.replace(/\s/g, '').replace(/mm$/i, ''))
}

/** @param {import('@playwright/test').Page} page */
async function sizeFields(page) {
  return [
    await fieldNumber(page, 'inspector-param-size-x'),
    await fieldNumber(page, 'inspector-param-size-y'),
    await fieldNumber(page, 'inspector-param-size-z'),
  ]
}

/** What the canvas shows right now, as bytes. @param {import('@playwright/test').Page} page */
function canvasPixels(page) {
  return page.getByTestId('viewport-canvas').screenshot({ animations: 'disabled' })
}

/**
 * Wait until the canvas no longer matches `before`: the rebuilt body has actually been drawn.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Buffer} before
 */
async function expectCanvasChanged(page, before) {
  await expect.poll(async () => (await canvasPixels(page)).equals(before), { timeout: 8000 }).toBe(false)
}

/**
 * `x·y·z − (4 − π)·r²·L`, short by the chorded arcs and no more. The four quarter-arcs make one
 * `segments`-gon inscribed in a circle of radius r, so the shortfall is exactly
 * `(π − (n/2)·sin(2π/n))·r²·L` (the same formula `registry.spec.js` pins at 32 segments).
 *
 * `segments` is the count the default Normal resolution picks for this radius
 * (`segmentsFor`: 24 at r 5, 20 at r 4), so the check is exact, not a loose percentage.
 *
 * @param {number} volume
 * @param {number[]} size
 * @param {number} r
 * @param {number} along The side length the rounded edges run along.
 * @param {number} segments The corner arc's segment count at the default resolution.
 */
function expectRoundedVolume(volume, size, r, along, segments) {
  const ideal = size[0] * size[1] * size[2] - (4 - Math.PI) * r * r * along
  const shortfall = (Math.PI - (segments / 2) * Math.sin((2 * Math.PI) / segments)) * r * r * along
  expect(volume).toBeLessThanOrEqual(ideal + 1e-3)
  expect(volume).toBeCloseTo(ideal - shortfall, 1)
}

const DROP = { fx: 0.5, fy: 0.38 }

/**
 * Place a Cube and leave it selected, the Inspector open on it.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeCube(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...DROP })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(page.getByTestId('inspector-params')).toBeVisible()
  return (await sceneBodies(page))[0]
}

/**
 * @param {import('@playwright/test').Locator} locator
 * @param {import('@playwright/test').TestInfo} testInfo
 */
async function press(locator, testInfo) {
  if (testInfo.project.use.hasTouch) await locator.tap()
  else await locator.click()
}

/**
 * Select a body from the Inspector's object list, the route every width has.
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

/**
 * The per-project snapshot of the Inspector rows, and the phone sheet's no-sideways-scroll rule.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} label
 */
async function snapshot(page, testInfo, label) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.getByTestId('inspector-param-roundAxis').scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${label}-${testInfo.project.name}.png`) })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const params = await page.getByTestId('inspector-params').boundingBox()
  const select = await page.getByTestId('inspector-param-roundAxis').boundingBox()
  expect(params).not.toBeNull()
  expect(select).not.toBeNull()
  if (params && select) expect(select.x + select.width).toBeLessThanOrEqual(params.x + params.width + 1)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('a placed Cube shows Corner radius 0 and Rounded axis Z; a radius rounds it without touching Size, and one Undo restores it', async ({
  page,
}, testInfo) => {
  const sharp = await placeCube(page)
  expect(sharp.volumeMm3).toBeCloseTo(64000, 0)
  await expect(page.getByTestId('inspector-params')).toHaveAttribute('data-editable', 'true')
  expect(await fieldNumber(page, 'inspector-param-roundRadius')).toBe(0)
  await expect(page.getByTestId('inspector-param-roundAxis')).toHaveValue('z')
  await expect(page.getByTestId('inspector-param-roundAxis').locator('option')).toHaveText(['X', 'Y', 'Z'])

  const before = await canvasPixels(page)
  await typeIntoField(page, 'inspector-param-roundRadius', 5)
  await expect(page.getByTestId('inspector-param-error')).toHaveCount(0)
  await expectCanvasChanged(page, before)

  const [rounded] = await sceneBodies(page)
  expect(rounded.id).toBe(sharp.id)
  expectRoundedVolume(rounded.volumeMm3, [40, 40, 40], 5, 40, 24)
  // Size is the box's full extent, measured and in the fields alike.
  for (const [axis, extent] of sizeOf(rounded).entries()) expect(extent, `axis ${axis}`).toBeCloseTo(40, 3)
  expect(await sizeFields(page)).toEqual([40, 40, 40])
  expect(await fieldNumber(page, 'inspector-param-roundRadius')).toBeCloseTo(5, 3)
  await snapshot(page, testInfo, 'radius')

  // One edit, one Undo step: straight back to the sharp cube.
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo:/)
  await press(page.getByTestId('undo-button'), testInfo)
  await expect.poll(async () => (await sceneBodies(page))[0]?.volumeMm3).toBeCloseTo(64000, 0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
})

test('Rounded axis moves the rounding to the edges along it, and a radius too big across that axis is refused by name', async ({
  page,
}, testInfo) => {
  await placeCube(page)
  await typeIntoField(page, 'inspector-param-size-z', 20)
  await typeIntoField(page, 'inspector-param-roundRadius', 5)
  const [aboutZ] = await sceneBodies(page)
  // About Z the rounded edges are the 20 mm uprights.
  expectRoundedVolume(aboutZ.volumeMm3, [40, 40, 20], 5, 20, 24)

  const before = await canvasPixels(page)
  await page.getByTestId('inspector-param-roundAxis').selectOption('x')
  await expect(page.getByTestId('inspector-param-roundAxis')).toHaveValue('x')
  await expect(page.getByTestId('inspector-param-error')).toHaveCount(0)
  await expectCanvasChanged(page, before)
  const [aboutX] = await sceneBodies(page)
  // About X they are the four 40 mm edges that run left to right: more material comes off.
  expectRoundedVolume(aboutX.volumeMm3, [40, 40, 20], 5, 40, 24)
  expect(aboutX.volumeMm3).toBeLessThan(aboutZ.volumeMm3)
  const [sx, sy, sz] = sizeOf(aboutX)
  expect(sx).toBeCloseTo(40, 3)
  expect(sy).toBeCloseTo(40, 3)
  expect(sz).toBeCloseTo(20, 3)
  expect(await sizeFields(page)).toEqual([40, 40, 20])

  // Across X the box is 40 × 20, so half the shorter side is 10 mm: 12 is refused, not clamped.
  await typeIntoField(page, 'inspector-param-roundRadius', 12)
  await expect(page.getByTestId('inspector-param-error')).toContainText(
    'roundRadius must be smaller than half the shortest side (10 mm), got 12',
  )
  // TODO/ui-100: the reason sits next to the edited field, in view, not under the Delete bar.
  const radiusField = page.getByTestId('inspector-param-roundRadius')
  await expect(radiusField).toHaveAttribute('aria-invalid', 'true')
  const errorBox = page.getByTestId('inspector-param-error')
  const fieldRect = await radiusField.boundingBox()
  const errorRect = await errorBox.boundingBox()
  expect(fieldRect).not.toBeNull()
  expect(errorRect).not.toBeNull()
  if (fieldRect && errorRect) {
    expect(errorRect.y).toBeGreaterThanOrEqual(fieldRect.y)
    expect(errorRect.y - (fieldRect.y + fieldRect.height)).toBeLessThan(40)
  }
  const viewportSize = page.viewportSize()
  if (errorRect && viewportSize) {
    expect(errorRect.y).toBeGreaterThanOrEqual(0)
    expect(errorRect.y + errorRect.height).toBeLessThanOrEqual(viewportSize.height)
  }
  const coveredByDelete = await errorBox.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return !!hit && !!hit.closest('[data-testid="inspector-delete"]')
  })
  expect(coveredByDelete).toBe(false)
  const [refused] = await sceneBodies(page)
  expect(refused.volumeMm3).toBeCloseTo(aboutX.volumeMm3, 3)
  expect(refused.bounds).toEqual(aboutX.bounds)
  expect(await fieldNumber(page, 'inspector-param-roundRadius')).toBeCloseTo(5, 3)
  await snapshot(page, testInfo, 'refused')
})

test('Corner radius and Rounded axis come back after a save and a reload', async ({ page }, testInfo) => {
  const placed = await placeCube(page)
  await typeIntoField(page, 'inspector-param-roundRadius', 4)
  await page.getByTestId('inspector-param-roundAxis').selectOption('y')
  await expect(page.getByTestId('inspector-param-roundAxis')).toHaveValue('y')
  const [edited] = await sceneBodies(page)
  expectRoundedVolume(edited.volumeMm3, [40, 40, 40], 4, 40, 20)
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })

  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const [reloaded] = await sceneBodies(page)
  expect(reloaded.volumeMm3).toBeCloseTo(edited.volumeMm3, 3)

  await selectFromList(page, placed.id, testInfo)
  await expect(page.getByTestId('inspector-params')).toBeVisible()
  expect(await fieldNumber(page, 'inspector-param-roundRadius')).toBeCloseTo(4, 3)
  await expect(page.getByTestId('inspector-param-roundAxis')).toHaveValue('y')
  expect(await sizeFields(page)).toEqual([40, 40, 40])
})

/**
 * Open `e2e/fixtures/rounded-cube-group.ndjson` through File ▸ Open: Group 1 holds a
 * 10 mm Cube 1 at the origin and a 40 × 40 × 20 Cube 2 at X 60.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openGroupFixture(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await page.getByTestId('file-menu-button').click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  const chooser = await chooserEvent
  await chooser.setFiles({
    name: 'rounded-cube-group.ndjson',
    mimeType: 'text/plain',
    buffer: readFileSync(join(process.cwd(), 'e2e/fixtures/rounded-cube-group.ndjson')),
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1', { timeout: 60_000 })
}

/**
 * Select Group 1, then step into Cube 2 from the Inspector's Parts list.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 */
async function stepIntoCube2(page, testInfo) {
  await selectFromList(page, 'group-1', testInfo)
  // The Inspector's Parts list names its rows `inspector-part-<name>` (`ObjectList.vue`, parts mode).
  const row = page.getByTestId('inspector-parts').getByTestId('inspector-part-Cube 2')
  await row.scrollIntoViewIfNeeded()
  await press(row, testInfo)
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-sub-part', 'Cube 2')
  await expect(page.getByTestId('inspector-params')).toBeVisible()
}

/** The two cubes' volumes, sharp: 10³ + 40·40·20. */
const SHARP_GROUP_MM3 = 1000 + 32000

test('a Cube inside a group takes a Corner radius and Rounded axis; Size, the other part, Undo and a reload all hold (TODO/ui-104)', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  await openGroupFixture(page)
  const [sharp] = await sceneBodies(page)
  expect(sharp.volumeMm3).toBeCloseTo(SHARP_GROUP_MM3, 0)

  await stepIntoCube2(page, testInfo)
  // The part's own fields, editable, with the defaults shown; no gizmo on a part.
  await expect(page.getByTestId('inspector-params')).toHaveAttribute('data-editable', 'true')
  await expect(page.getByTestId('inspector-params-part-note')).toBeVisible()
  expect(await fieldNumber(page, 'inspector-param-roundRadius')).toBe(0)
  await expect(page.getByTestId('inspector-param-roundAxis')).toHaveValue('z')
  await expect(page.getByTestId('inspector-position-x')).toHaveAttribute('readonly', '')

  const before = await canvasPixels(page)
  await typeIntoField(page, 'inspector-param-roundRadius', 2)
  await expect(page.getByTestId('inspector-param-error')).toHaveCount(0)
  await page.getByTestId('inspector-param-roundAxis').selectOption('x')
  await expect(page.getByTestId('inspector-param-roundAxis')).toHaveValue('x')
  await expect(page.getByTestId('inspector-param-error')).toHaveCount(0)
  await expectCanvasChanged(page, before)

  // The viewport and the Inspector agree: about X, the four 40 mm edges lose (4 − π)·r²·40,
  // less the chorded arcs' shortfall; the group's box and the part's Size are unchanged.
  // The canvas can change on the radius edit alone, so wait for the about-X rebuild to land:
  // about Z (the 20 mm uprights) at most (4 − π)·4·20 ≈ 68.7 mm³ goes, short of 80.
  await expect.poll(async () => SHARP_GROUP_MM3 - ((await sceneBodies(page))[0]?.volumeMm3 ?? NaN)).toBeGreaterThan(80)
  const [rounded] = await sceneBodies(page)
  // Cube 2's share is the group less Cube 1's 10³ (the two do not overlap). The chorded arc
  // sits inside the true circle, so it removes *more* than (4 − π)·r²·L = 137.35 mm³, never
  // less. The fixture declares no resolution, so it opens as `legacy` (`project.js`: a file
  // with records and no setting is the old fixed 32 segments), not Normal's 16 at r 2:
  // 137.35 + (π − 16·sin(π/16))·4·40 ≈ 137.35 + 3.22 = 140.57 mm³ removed.
  expectRoundedVolume(rounded.volumeMm3 - 1000, [40, 40, 20], 2, 40, 32)
  expect(rounded.bounds).toEqual(sharp.bounds)
  expect(await sizeFields(page)).toEqual([40, 40, 20])
  expect(await fieldNumber(page, 'inspector-size-x')).toBeCloseTo(40, 3)
  expect(await fieldNumber(page, 'inspector-size-z')).toBeCloseTo(20, 3)
  expect(await fieldNumber(page, 'inspector-param-roundRadius')).toBeCloseTo(2, 3)
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-sub-part', 'Cube 2')
  await snapshot(page, testInfo, 'group-part')

  // Two edits, two Undo steps: back to the sharp cube, then forward again.
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Edit Cube 2/)
  await press(page.getByTestId('undo-button'), testInfo)
  await press(page.getByTestId('undo-button'), testInfo)
  await expect.poll(async () => (await sceneBodies(page))[0]?.volumeMm3).toBeCloseTo(SHARP_GROUP_MM3, 0)
  await press(page.getByTestId('redo-button'), testInfo)
  await press(page.getByTestId('redo-button'), testInfo)
  await expect.poll(async () => (await sceneBodies(page))[0]?.volumeMm3).toBeCloseTo(rounded.volumeMm3, 3)
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })

  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1', { timeout: 60_000 })
  await expect.poll(async () => (await sceneBodies(page))[0]?.volumeMm3).toBeCloseTo(rounded.volumeMm3, 3)
  await stepIntoCube2(page, testInfo)
  expect(await fieldNumber(page, 'inspector-param-roundRadius')).toBeCloseTo(2, 3)
  await expect(page.getByTestId('inspector-param-roundAxis')).toHaveValue('x')
})
