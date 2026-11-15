// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { agentCall, installFakeWebMcp, registeredNames } from './support/fakeWebMcp.js'

/**
 * `TODO/ui-125`: header Undo refused because a browser agent's step builds on the user's, driven
 * against `/` at every viewport project. The refusal is worded from History labels and says where
 * to go; it shows in the save-status chip (`role="alert"`), not in a second header block; the cube
 * stays and Undo stays enabled.
 */

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function placeCubeByHand(page) {
  await openLibrary(page)
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="library-row-primitive.cuboid"]')
    const view = document.querySelector('[data-testid="viewport"]')
    if (!row || !view) throw new Error('missing row or viewport')
    const from = row.getBoundingClientRect()
    const to = view.getBoundingClientRect()
    const sx = from.left + from.width / 2
    const sy = from.top + from.height / 2
    const ex = to.left + to.width * 0.4
    const ey = to.top + to.height * 0.45
    const fire = (/** @type {EventTarget} */ target, /** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y) =>
      target.dispatchEvent(
        new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true }),
      )
    fire(row, 'pointerdown', sx, sy)
    for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', sx + (ex - sx) * t, sy + (ey - sy) * t)
    fire(window, 'pointerup', ex, ey)
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
}

test('Undo refused by an agent step: a readable message in the status chip, cube stays, Undo stays enabled', async ({ page }, testInfo) => {
  await installFakeWebMcp(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect.poll(() => registeredNames(page)).toContain('operate')

  await placeCubeByHand(page)
  const bodyId = await page.evaluate(() => {
    const first = document.querySelector('[data-testid="scene-bodies"] > *')
    return first?.getAttribute('data-body-id') ?? ''
  })
  expect(bodyId).not.toBe('')
  const moved = await agentCall(page, 'operate', { op: 'transform.translate', operands: [{ id: bodyId }], params: { deltaMm: [30, 0, 0] } })
  expect(moved.ok, JSON.stringify(moved)).toBe(true)

  await page.getByTestId('undo-button').click()

  const expected = /^Can't undo Place Cube 1: a step added by a browser agent \(Move Cube 1\) builds on it\. Open History to suppress that step first\.$/
  const chip = page.getByTestId('save-status')
  await expect(chip).toHaveAttribute('role', 'alert')
  await expect(page.getByTestId('save-status-text')).toHaveText(expected)
  // The same words for a screen reader, and no second red block in the header bar.
  await expect(chip).toHaveAttribute('aria-label', expected)
  await expect(page.getByTestId('history-refusal')).toHaveCount(0)

  // Readable: the whole sentence is on screen (not ellipsised, not clipped off the viewport edge).
  const fit = await page.getByTestId('save-status-text').evaluate((el) => {
    const box = el.getBoundingClientRect()
    return { fullyInside: box.left >= 0 && box.right <= window.innerWidth, truncated: el.scrollWidth > el.clientWidth, width: box.width, height: box.height }
  })
  expect(fit.fullyInside).toBe(true)
  expect(fit.truncated).toBe(false)
  expect(fit.width).toBeGreaterThan(100)
  await expect(page.getByTestId('save-status-text')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // A snapshot at each viewport project, for a human to look at.
  const dir = join(process.cwd(), 'test-results', 'undo-refusal-snapshots')
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: join(dir, `${testInfo.project.name}.png`) })

  // Nothing was taken back.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('undo-button')).toBeEnabled()
})
