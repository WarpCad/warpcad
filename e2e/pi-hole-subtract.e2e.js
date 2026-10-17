// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/core-064`: Subtract with a Raspberry Pi's mounting hole leaves the Pi in the scene, so one
 * Pi drills as many holes as the plate needs. Driven against `/` — the running app.
 *
 * The scene is the docs fixture `plate-and-pi.ndjson` (a 100 x 70 x 3 mm plate and one Pi 5 laid
 * over it, opened through File > Open), so the holes really land in the plate. Then, the way a
 * user would: select the plate, tick `hole1` under the Pi in the Objects list, Subtract; select the
 * drilled plate, tick `hole2` of the SAME Pi, Subtract; once more for `hole3`. After each cut the
 * Pi row is still in Objects, the plate has lost about another hole's volume (a 3.25 mm hole
 * through 3 mm of plate is about 25 mm3; the app exposes no vertex count, so volume is the
 * measurable form of "it gained a hole"), and the Bill of Materials reads Raspberry Pi x 1.
 *
 * The Repeat refusal that goes with this (a cut plate cannot be a Repeat's source) is not
 * reachable from the UI: Repeat starts from a drilled-into part of a body that has parts, and a
 * Subtract result has none. It is unit-tested in `src/core/repeat.spec.js`.
 *
 * Viewports: all three. Engines: all three (Objects-list ticking and a Subtract round trip through
 * the kernel worker to WebGL). Firefox may fail at launch in this sandbox (`TROUBLESHOOTING.md`,
 * 2026-09-17).
 */

const FIXTURE = join(process.cwd(), 'e2e', 'docs', 'fixtures', 'plate-and-pi.ndjson')

/** @param {import('@playwright/test').Page} page */
const viewport = (page) => page.getByTestId('viewport')

test.beforeEach(async ({ page }) => {
  // No File System Access API, so File > Open falls back to the plain <input type=file> chooser.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await expect(viewport(page)).toBeVisible()
})

/** @param {import('@playwright/test').Page} page */
async function openScene(page) {
  await page.getByTestId('file-menu-button').click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  const chooser = await chooserEvent
  await chooser.setFiles({ name: 'plate-and-pi.ndjson', mimeType: 'text/plain', buffer: readFileSync(FIXTURE) })
  await expect(viewport(page)).toHaveAttribute('data-body-count', '2')
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

/**
 * The measured volume of one scene body, once the kernel worker has reported it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} bodyId
 * @returns {Promise<number>}
 */
async function volumeOf(page, bodyId) {
  const item = page.locator(`[data-testid="scene-bodies"] li[data-body-id="${bodyId}"]`)
  await expect(item).toHaveAttribute('data-body-volume', /.+/, { timeout: 30_000 })
  return Number(await item.getAttribute('data-body-volume'))
}

/**
 * Select `plateId` whole, tick the Pi's `hole`, press Subtract, and return the new plate's id.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} plateId
 * @param {string} hole
 * @returns {Promise<string>}
 */
async function drill(page, plateId, hole) {
  await openObjectList(page)
  const row = page.getByTestId(`objects-row-${plateId}`)
  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(viewport(page)).toHaveAttribute('data-selected-id', plateId)
  await openObjectList(page)
  const toggle = page.getByTestId('objects-expand-pi-1')
  await toggle.scrollIntoViewIfNeeded()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  const check = page.getByTestId(`objects-part-check-pi-1-${hole}`)
  await check.scrollIntoViewIfNeeded()
  await check.click()
  await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('operation-operands')).toHaveAttribute('data-subpart', 'true')
  await expect(page.getByTestId('operation-operand-rest')).toContainText(hole)
  await page.getByTestId('operation-subtract').click()
  const cut = page.locator('[data-testid="scene-bodies"] li[data-body-op="boolean.subtract"]')
  await expect(cut).toHaveCount(1, { timeout: 20_000 })
  const id = /** @type {string} */ (await cut.getAttribute('data-body-id'))
  await volumeOf(page, id)
  return id
}

test('one Pi drills several holes: after each Subtract the Pi is still there and the BOM counts one', async ({ page }) => {
  await openScene(page)
  const start = await volumeOf(page, 'plate-1')
  const pi = page.locator('[data-testid="scene-bodies"] li[data-body-op="raspberrypi.bplus"]')
  await expect(pi).toHaveCount(1)

  let plate = 'plate-1'
  let volume = start
  for (const hole of ['hole1', 'hole2', 'hole3']) {
    plate = await drill(page, plate, hole)
    // The Pi stays: two bodies (the drilled plate and the Pi), the Pi row still in Objects.
    await expect(viewport(page)).toHaveAttribute('data-body-count', '2')
    await expect(pi).toHaveCount(1)
    await expect(pi).toHaveAttribute('data-body-id', 'pi-1')
    await openObjectList(page)
    await expect(page.getByTestId('objects-row-pi-1')).toBeVisible()
    // The plate lost about one hole's material: 25 mm3, never zero and never a whole Pi's worth.
    const now = await volumeOf(page, plate)
    expect(volume - now, `${hole} drilled`).toBeGreaterThan(15)
    expect(volume - now, `${hole} drilled`).toBeLessThan(35)
    volume = now
  }
  expect(start - volume).toBeGreaterThan(45)

  // The Pi was placed once, so the Bill of Materials says so (phone: it lives in the Inspector sheet).
  if ((await page.getByTestId('inspector-tab').isVisible()) && (await page.getByTestId('inspector').getAttribute('data-open')) !== 'true') {
    await page.getByTestId('inspector-tab').click()
  }
  const bom = page.locator('[data-testid="bom-row"][data-op="raspberrypi.bplus"]')
  await expect(page.getByTestId('bom')).toBeVisible()
  await expect(bom).toHaveCount(1)
  await expect(bom).not.toContainText('× 2')
  await expect(page.getByTestId('bom-total')).toHaveText('(1)')
})
