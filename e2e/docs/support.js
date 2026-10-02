// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Shared helpers for `*.docs.js` specs — Playwright stills that double as the
 * documentation images (`TODO/docs-005`). The baseline directory *is* `docs/screenshots/`
 * (see `playwright.config.js`), so a passing run proves the docs pictures match the UI
 * and `--update-snapshots` rewrites them.
 *
 * Determinism is the whole job: every helper here exists to remove one source of
 * per-run pixel noise.
 */

/** The one place the pixel-diff tolerance lives; override per shot via `shot(..., { maxDiffPixelRatio })`. */
export const MAX_DIFF_PIXEL_RATIO = 0.01

const FIXTURE_DIR = join(process.cwd(), 'e2e', 'docs', 'fixtures')

/**
 * Open `/` and wait until the viewport has rendered a frame and the fonts are in.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function openApp(page) {
  // Desktop Chromium offers the native File System Access picker, which nothing headless
  // can drive; force the `<input type=file>` fallback so File ▸ Open is scriptable.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-webgl', 'ready')
  await expect.poll(async () => Number(await viewport.getAttribute('data-frames-rendered'))).toBeGreaterThan(1)
  await settle(page)
}

/**
 * Put the document in a known state through the real File ▸ Open path (so the shot also
 * exercises persistence) rather than replaying drags, whose timing would leak into stills.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} fixtureName file name under `e2e/docs/fixtures/`
 * @param {number} bodies expected body count once loaded
 */
export async function loadScene(page, fixtureName, bodies) {
  await page.getByTestId('file-menu-button').click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  const chooser = await chooserEvent
  await chooser.setFiles({
    name: fixtureName,
    mimeType: 'text/plain',
    buffer: readFileSync(join(FIXTURE_DIR, fixtureName)),
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(bodies))
  await settle(page)
}

/**
 * Click the canvas at a fraction of its box (a real mouse press, so picking runs for real).
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 */
export async function clickViewportAt(page, fx, fy) {
  const box = await page.getByTestId('viewport-canvas').boundingBox()
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
  await settle(page)
}

/**
 * Wait for everything animated or asynchronous to go quiet, and park the pointer so no
 * hover highlight is baked into the picture.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function settle(page) {
  await page.mouse.move(0, 0)
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  // The kernel worker reports no idle attribute; a body-count-stable pause covers its
  // sub-100ms evaluation of the small docs scenes.
  await page.waitForTimeout(400)
}

/**
 * Capture a still against `docs/screenshots/<name>.png`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name file name including `.png`
 * @param {{ locator?: import('@playwright/test').Locator, mask?: import('@playwright/test').Locator[], maxDiffPixelRatio?: number }} [options]
 */
export async function shot(page, name, options = {}) {
  await settle(page)
  const target = options.locator ?? page
  await expect(target).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    mask: options.mask ?? [page.getByTestId('save-status')],
    maxDiffPixelRatio: options.maxDiffPixelRatio ?? MAX_DIFF_PIXEL_RATIO,
  })
}
