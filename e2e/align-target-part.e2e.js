// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'

/**
 * `TODO/ui-097`: Align measured the whole esp8266 feather (hidden `board` part included) when its
 * `Battery-Connector` part was meant, so the cutter landed 0.256 mm past the connector.
 *
 * Driven against `/` with `e2e/fixtures/align-target-part.ndjson`, a copy of the owner's project
 * (the feather's user parts ride in its state line, and the two clearance cutters are the same
 * ones). The cutter is the moving body; the feather is the target. Three routes, one answer:
 *
 * 1. Tick the part's check twice: the second tick removes the feather (it used to step up to the
 *    whole body and stay selected, which is how Align measured it whole).
 * 2. Tick the part once, Align, Y outside +: the cutter's low-Y face sits on the connector's
 *    high-Y face (14.087), not on the whole feather's (14.343).
 * 3. Tick the feather whole, Align, **Measure to** Battery-Connector: the same result.
 *
 * Viewports: all three (the Objects list is a sheet at phone width, the popover a bottom sheet).
 * Engines: all three (WebGL scene, touch input, list ticking).
 */

const CUTTER = 'cuboid-iehsuz-947'
const FEATHER = 'esp8266-feather-1-v5jezw-917'
const PART = 'Battery-Connector'
/** The connector's high-Y face and the whole feather's, measured from the owner's file. */
const CONNECTOR_MAX_Y = 14.087
const WHOLE_MAX_Y = 14.343
const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'align-target-part-snapshots')

/** @param {import('@playwright/test').Page} page */
async function openFixture(page) {
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
    name: 'align-target-part.ndjson',
    mimeType: 'text/plain',
    buffer: readFileSync(join(process.cwd(), 'e2e/fixtures/align-target-part.ndjson')),
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3', { timeout: 60_000 })
}

/** @param {import('@playwright/test').Page} page */
async function openObjectList(page) {
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

/** @param {import('@playwright/test').Page} page */
async function tapCutter(page) {
  await openObjectList(page)
  const row = page.getByTestId(`objects-row-${CUTTER}`)
  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await openObjectList(page)
}

/** @param {import('@playwright/test').Page} page */
async function partCheck(page) {
  await openObjectList(page)
  const toggle = page.getByTestId(`objects-expand-${FEATHER}`)
  await toggle.scrollIntoViewIfNeeded()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  const check = page.getByTestId(`objects-part-check-${FEATHER}-${PART}`)
  await check.scrollIntoViewIfNeeded()
  return check
}

/** @param {import('@playwright/test').Page} page */
async function cutterMinY(page) {
  const bounds = await page
    .locator(`[data-testid="scene-bodies"] li[data-body-id="${CUTTER}"]`)
    .getAttribute('data-body-bounds')
  return Number((bounds ?? '').split(',')[1])
}

/**
 * Open Align, optionally pick Measure to, tap Y outside +, and read the cutter's low-Y face.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string | null} measureTo
 */
async function alignOutsidePlusY(page, measureTo) {
  await page.getByTestId('operation-align').click()
  await expect(page.getByTestId('align-popover')).toHaveAttribute('data-target', 'second')
  if (measureTo) {
    await page.getByTestId('align-reference-target').selectOption(measureTo)
    await expect(page.getByTestId('align-operand-target')).toHaveText(`esp8266 feather › ${measureTo}`)
  }
  const item = page.locator(`[data-testid="scene-bodies"] li[data-body-id="${CUTTER}"]`)
  const before = await item.getAttribute('data-body-bounds')
  await page.getByTestId('align-y-outside-plus').click()
  await expect(page.getByTestId('align-error')).toHaveCount(0)
  await expect.poll(() => item.getAttribute('data-body-bounds'), { timeout: 15_000 }).not.toBe(before)
  return cutterMinY(page)
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000)
  await openFixture(page)
})

test('ticking the addressed part a second time removes the feather from the selection (TODO/ui-097)', async ({ page }) => {
  await tapCutter(page)
  let check = await partCheck(page)
  await check.click()
  await expect(check).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  check = await partCheck(page)
  await check.click()
  await expect(check).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId(`objects-check-${FEATHER}`)).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(page.getByTestId('objects-count')).toContainText('1 selected')
})

test('Align to the ticked connector lands on its face, not on the whole feather (TODO/ui-097)', async ({ page }, testInfo) => {
  await tapCutter(page)
  await (await partCheck(page)).click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  const minY = await alignOutsidePlusY(page, null)
  expect(Math.abs(minY - CONNECTOR_MAX_Y)).toBeLessThan(0.01)
  expect(Math.abs(minY - WHOLE_MAX_Y)).toBeGreaterThan(0.1)
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `ticked-part-${testInfo.project.name}.png`) })
})

test('Measure to Battery-Connector gives the same face from a whole-body selection (TODO/ui-097)', async ({ page }, testInfo) => {
  await tapCutter(page)
  await openObjectList(page)
  const body = page.getByTestId(`objects-check-${FEATHER}`)
  await body.scrollIntoViewIfNeeded()
  await body.click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await page.getByTestId('operation-align').click()
  await expect(page.getByTestId('align-operand-whole')).toContainText('whole object')
  await page.keyboard.press('Escape')
  const minY = await alignOutsidePlusY(page, PART)
  expect(Math.abs(minY - CONNECTOR_MAX_Y)).toBeLessThan(0.01)
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `measure-to-${testInfo.project.name}.png`) })
})
