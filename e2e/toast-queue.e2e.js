// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { closeLibrary, isPhone, openLibrary, pointer, viewportPoint } from './support/humanInput.js'

/**
 * **The toast queue** (`TODO/ui-117`), driven against `/`: two toasts raised in quick succession
 * from two different places — **Share → Copy link** and **Save to library…** — both stay on screen,
 * stacked, and neither covers the other. Before the queue each toast sat at the same fixed spot, so
 * the second painted over the first.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`, Browser Support)
 *
 * **Chromium only, at all three viewports** (phone, tablet, laptop): the toast host is plain DOM
 * with no canvas, WASM, touch-gesture or persistence logic of its own (placing the shape uses the
 * viewport, but the claim here is the DOM layout). A snapshot is written at each project
 * (`test-results/toast-queue-snapshots/`).
 *
 * The clipboard and `navigator.share` are mocked at the boundary (`CLAUDE.md`), as `share-link.e2e.js` does.
 */

test.beforeEach(({}, info) => {
  test.skip(!info.project.name.startsWith('chromium'), 'No canvas involvement in the claim; Chromium only (see the header).')
})

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'toast-queue-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const MOCK_BOUNDARY = () => {
  /** @type {any} */ (window).__copied = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (/** @type {string} */ text) => /** @type {any} */ (window).__copied.push(text) },
  })
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined })
}

test('Copy link then Save to library: both toasts are on screen, stacked, neither covering the other', async ({ page }, info) => {
  await page.addInitScript(MOCK_BOUNDARY)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  const input = await pointer(page, info)

  // One body, selected: the precondition for both Copy link (non-empty) and Save to library (one selected).
  await openLibrary(page, input.press)
  const at = isPhone(info) ? [0.3, 0.22] : [0.3, 0.45]
  const p = await viewportPoint(page, at[0], at[1])
  await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await closeLibrary(page, input.press)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')

  // Share → Copy link: the first toast.
  const shareButton = page.getByTestId('share-open')
  if (await shareButton.isVisible()) {
    await input.press(shareButton)
  } else {
    await input.press(page.getByTestId('file-menu-button'))
    await input.press(page.getByTestId('file-share'))
  }
  await expect(page.getByTestId('share-sheet')).toBeVisible()
  await expect(page.getByTestId('share-copy')).toBeEnabled()
  await input.press(page.getByTestId('share-copy'))
  const shareToast = page.getByTestId('share-toast')
  await expect(shareToast).toHaveText(/^Link copied, \d+\.\d KB$/)

  // Save to library…, straight after: the second toast, while the first is still up.
  await input.press(page.getByTestId('op-library-save'))
  await expect(page.getByTestId('save-library-sheet')).toBeVisible()
  await page.getByTestId('save-library-name').fill('Standoff')
  await input.press(page.getByTestId('save-library-submit'))
  const libraryToast = page.getByTestId('library-toast')
  await expect(libraryToast).toHaveText('Saved Standoff')

  // Both are visible at once, in the host, and their boxes do not intersect.
  await expect(shareToast).toBeVisible()
  const a = /** @type {{ x: number, y: number, width: number, height: number }} */ (await shareToast.boundingBox())
  const b = /** @type {{ x: number, y: number, width: number, height: number }} */ (await libraryToast.boundingBox())
  const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  expect(overlap, `share toast ${JSON.stringify(a)} and library toast ${JSON.stringify(b)} overlap`).toBe(false)
  // Both inside the viewport width, at every size.
  const width = /** @type {{ width: number }} */ (page.viewportSize()).width
  for (const box of [a, b]) {
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
  }
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}.png`) })

  // Each leaves on its own clock.
  await expect(shareToast).toBeHidden({ timeout: 9000 })
  await expect(libraryToast).toBeHidden({ timeout: 9000 })
})
