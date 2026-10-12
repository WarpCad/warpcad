// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FIXTURE, PART_NAME, SUB_PARTS, scriptedDrawingProvider } from './support/drawingProvider.js'

/**
 * `TODO/ai-008` — from a drawing to a library group, against the real app at `/`, with the
 * Anthropic API **stubbed** as a scripted provider (never a live model, never a real key). The
 * script plays what a model would do with `e2e/fixtures/drawing-board-85x56.png` — a mechanical
 * drawing of a FICTIONAL 85 × 56 board at 10 px/mm — and the app does everything else for real:
 * the sanitiser, the image tools, the sketch with its reference photo, the group, the offscreen
 * overlay render, the proposal and the user's Confirm.
 *
 * What it proves (the spec's Testing list):
 * - **attach goes through the sanitiser**: an SVG with a script is refused in the composer and
 *   never sent; the fixture PNG is accepted;
 * - **the scale is established** from the printed 85 mm (the activity row says so) and the model
 *   is told the image's id;
 * - **the group's sub-parts** carry the names the model gave, and the group is selected;
 * - **the overlay thumbnail is not blank** (pixel variance), and the model got the PNG back;
 * - **Save needs Confirm**: nothing reaches My parts until the tap, and then the part is there;
 * - **the key** never appears in the page or in any request body.
 *
 * The API is routed on the **context**, not the page (`e2e/csp.e2e.js`: the production build's
 * service worker can issue the request itself, and a page route never sees it).
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three reference viewports with a snapshot at each (the half-height chat sheet must show the
 * proposal readably at phone width), and all three engines: the path is canvas decode/re-encode
 * (the sanitiser), a WebGL texture upload and an offscreen render, and IndexedDB (the library) —
 * every one engine-sensitive. Firefox may fail to launch in this sandbox (`TROUBLESHOOTING.md`).
 * The drop-onto-the-viewport attach is desktop-only (laptop project).
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'ai-drawing-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const KEY = 'sk-ant-api03-E2EDRAWINGSENTINEL-0123456789-abcdefghij'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

/** @param {import('@playwright/test').Page} page */
async function connect(page) {
  await page.getByTestId('assistant-button').click()
  await page.getByTestId('ai-key-input').fill(KEY)
  await page.getByTestId('ai-key-save').click()
  await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
  await page.getByTestId('ai-key-done').click()
  await expect(page.getByTestId('assistant-panel')).toBeVisible()
}

/**
 * Luma spread and distinct colours of a `data:` image — the non-blank check (`SECOND-ATTEMPT.md`:
 * "the scene is too dark to see" shipped with green tests).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} src
 */
async function imageStats(page, src) {
  return page.evaluate(async (url) => {
    const img = document.createElement('img')
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
    context.drawImage(img, 0, 0)
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    let sum = 0
    let squares = 0
    const colours = new Set()
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      sum += luma
      squares += luma * luma
      colours.add((data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4))
    }
    const count = data.length / 4
    const mean = sum / count
    return { width: canvas.width, height: canvas.height, lumaStdDev: Math.sqrt(Math.max(0, squares / count - mean * mean)), colours: colours.size }
  }, src)
}

const partNames = (/** @type {import('@playwright/test').Page} */ page) =>
  page.$$eval('[data-testid="inspector-parts"] li', (nodes) => nodes.map((node) => (node.textContent ?? '').trim()))

test('a drawing becomes a named group, checked against the picture, saved to My parts only on Confirm', async ({ page }, info) => {
  const api = await scriptedDrawingProvider(page)
  await connect(page)

  // A hostile image never becomes an attachment: the sanitiser refuses an SVG carrying a script.
  await page.getByTestId('ai-attach-input').setInputFiles({
    name: 'board.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  })
  await expect(page.getByTestId('ai-attach-error')).toContainText(/PNG, JPEG or WebP/)
  await expect(page.getByTestId('ai-attachments')).toHaveCount(0)

  // The drawing, through the composer's Attach.
  await page.getByTestId('ai-attach-input').setInputFiles({ name: 'board.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE) })
  await expect(page.getByTestId('ai-attachments').locator('img')).toHaveCount(1)
  await expect(page.getByTestId('ai-attach-error')).toHaveCount(0)
  await page.getByTestId('ai-input').fill('Here is a drawing of a raspberry pi 7 create a group object to be added to the library.')
  await page.getByTestId('ai-send').click()

  // The turn ends with a proposal, not a save.
  const proposal = page.getByTestId('ai-save-proposal')
  await expect(proposal).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('assistant-panel')).toHaveAttribute('data-running', 'false')

  // Privacy: said once, the first time an image goes out in this project.
  await expect(page.getByTestId('ai-notice').filter({ hasText: 'Image sent' })).toHaveCount(1)
  // The model was told the image's id and was sent the sanitised copy.
  expect(api.requests[0]).toContain('attachment-1')
  expect(api.requests[0]).toContain('"type":"image"')

  // The scale was established from the printed 85 mm.
  await expect(page.getByTestId('ai-transcript')).toContainText('Set scale 85.0 mm from “board length”')
  await expect(page.getByTestId('ai-transcript')).toContainText('Located “board outline” on the drawing')

  // One group, selected, its sub-parts named as the model named them.
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-body-count', '1')
  await expect(viewport).toHaveAttribute('data-selected-id', /^group-(?:[a-z2-7]{6}-)?\d+$/)
  await expect.poll(() => partNames(page)).toEqual(SUB_PARTS)

  // The overlay: a real picture, and the model got it back.
  // The thumbnail sits beside the row's button, in the same transcript line.
  const overlayRow = page.getByTestId('ai-transcript').locator('li').filter({ has: page.getByTestId('ai-activity-label').filter({ hasText: 'Compared the top view with the drawing' }) })
  await expect(overlayRow).toHaveCount(1)
  const thumb = overlayRow.getByTestId('ai-activity-thumbnail-img')
  await expect(thumb).toHaveCount(1)
  const src = /** @type {string} */ (await thumb.getAttribute('src'))
  expect(src.startsWith('data:image/png;base64,')).toBe(true)
  // Kept beside the snapshots, so a person can look at what the model was shown.
  writeFileSync(join(SNAPSHOT_DIR, `overlay-${info.project.name}.png`), Buffer.from(src.slice(src.indexOf(',') + 1), 'base64'))
  const stats = await imageStats(page, src)
  expect(stats.width).toBeGreaterThan(100)
  expect(stats.lumaStdDev).toBeGreaterThan(8)
  expect(stats.colours).toBeGreaterThan(8)
  expect(api.requests[4]).toMatch(/"tool_result"[\s\S]*"type":"image"/)

  // Save needs Confirm: nothing in My parts yet.
  await expect(page.getByTestId('ai-save-name')).toHaveText(PART_NAME)
  await expect(page.getByTestId('ai-save-status')).toContainText('until you tap Confirm')
  await expect(page.getByTestId('library-user-count')).toHaveText('0')
  await page.screenshot({ path: join(SNAPSHOT_DIR, `proposal-${info.project.name}.png`) })

  await page.getByTestId('ai-save-confirm').click()
  await expect(page.getByTestId('ai-save-status')).toHaveText('Saved to My parts.')
  await expect(page.getByTestId('ai-save-confirm')).toHaveCount(0)
  await expect(page.getByTestId('library-toast')).toHaveText(`Saved ${PART_NAME}`)
  await expect(page.getByTestId('library-user-count')).toHaveText('1')

  // It is in My parts after a reload (IndexedDB), and it is the group, not the drawing.
  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('library-user-count')).toHaveText('1')
  expect(await page.locator('[data-testid="library-row-user.wc-85-board"]').count()).toBe(1)

  // The key: only ever in the request header, never in the page or a request body.
  expect(await page.content()).not.toContain(KEY)
  for (const body of api.requests) expect(body).not.toContain(KEY)
  expect(api.headers[0]['x-api-key']).toBe(KEY)
})

test('Not now drops the proposal and saves nothing', async ({ page }) => {
  await scriptedDrawingProvider(page)
  await connect(page)
  await page.getByTestId('ai-attach-input').setInputFiles({ name: 'board.png', mimeType: 'image/png', buffer: readFileSync(FIXTURE) })
  await page.getByTestId('ai-input').fill('Make this board a library part.')
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('ai-save-proposal')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('ai-save-cancel').click()
  await expect(page.getByTestId('ai-save-status')).toHaveText('Not saved.')
  await expect(page.getByTestId('ai-save-confirm')).toHaveCount(0)
  await expect(page.getByTestId('library-user-count')).toHaveText('0')
})

test('drop an image file onto the viewport to attach it (desktop)', async ({ page }, info) => {
  test.skip(!info.project.name.includes('laptop'), 'desktop-only: a phone has no file drag')
  await scriptedDrawingProvider(page)
  await connect(page)
  await page.getByTestId('assistant-close').click()
  const base64 = readFileSync(FIXTURE).toString('base64')
  const transfer = await page.evaluateHandle((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'board.png', { type: 'image/png' }))
    return dt
  }, base64)
  const viewport = page.getByTestId('viewport')
  await viewport.dispatchEvent('dragover', { dataTransfer: transfer })
  await expect(viewport).toHaveAttribute('data-image-drop', 'true')
  await viewport.dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.getByTestId('assistant-panel')).toBeVisible()
  await expect(page.getByTestId('ai-attachments').locator('img')).toHaveCount(1)
  await expect(viewport).toHaveAttribute('data-image-drop', 'false')
})
