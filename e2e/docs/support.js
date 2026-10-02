// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

/** Where recordings land; `scripts/docs-gifs.mjs` reads from here. Not `test-results/`, which Playwright wipes. */
export const MOVIES_DIR = join(process.cwd(), '.docs-movies')

/**
 * Inject a dot that follows the pointer. Headless video never draws the OS cursor, so
 * without this a drag looks like a part sliding by itself. Docs runs only.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function installCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('docs-cursor')) return
    const dot = document.createElement('div')
    dot.id = 'docs-cursor'
    dot.style.cssText =
      'position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;' +
      'background:rgba(255,200,0,.85);border:2px solid #fff;box-shadow:0 0 0 1px #000;' +
      'pointer-events:none;z-index:2147483647;transition:transform .12s;'
    document.body.appendChild(dot)
    window.addEventListener('pointermove', (e) => {
      dot.style.left = `${e.clientX}px`
      dot.style.top = `${e.clientY}px`
    })
    window.addEventListener('pointerdown', () => (dot.style.transform = 'scale(1.5)'))
    window.addEventListener('pointerup', () => (dot.style.transform = 'scale(1)'))
  })
}

/**
 * Begin recording. Call after `openApp` so the movie starts on a meaningful frame (the
 * screencast API records from this call, not from page load).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name movie name; the GIF becomes `docs/media/<name>.gif`
 */
export async function startMovie(page, name) {
  mkdirSync(MOVIES_DIR, { recursive: true })
  await installCursor(page)
  await page.mouse.move(40, 40)
  await page.screencast.start({ path: join(MOVIES_DIR, `${name}.webm`), size: { width: 960, height: 600 } })
  await page.waitForTimeout(500)
}

/**
 * Stop recording, remove the cursor overlay (so a final-frame still is clean), and write
 * the sidecar `scripts/docs-gifs.mjs` converts from.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name must match the `startMovie` name
 */
export async function endMovie(page, name) {
  await page.waitForTimeout(300)
  await page.screencast.stop()
  await page.evaluate(() => document.getElementById('docs-cursor')?.remove())
  const spec = test.info().file.replace(`${process.cwd()}/`, '')
  writeFileSync(join(MOVIES_DIR, `${name}.json`), JSON.stringify({ name, spec, trim: 0 }))
}

/**
 * A human-paced drag with the real mouse: interpolated, ease-in-out, so a ghost preview
 * visibly follows the pointer.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ x: number, y: number }} from viewport coordinates
 * @param {{ x: number, y: number }} to viewport coordinates
 * @param {{ steps?: number, ms?: number }} [options]
 */
export async function humanDrag(page, from, to, { steps = 30, ms = 1200 } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e)
    await page.waitForTimeout(ms / steps)
  }
  await page.waitForTimeout(250)
  await page.mouse.up()
}
