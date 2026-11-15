// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Pixel snapshots of the WebGL canvas, kept in page memory (`window.__canvasSnaps`) and compared
 * with `changedPixels`. Lifted out of `inspector-hidden-parts.e2e.js`, `object-visibility.e2e.js`
 * and `part-default-hidden.e2e.js`, which each carried a copy (`TODO/testing-039`).
 */

/** @param {import('@playwright/test').Page} page */
export const nextFrames = (page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

/**
 * Decode a PNG buffer into `window.__canvasSnaps[key]` inside the page.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Buffer} png
 * @param {string} key
 */
async function storeSnapshot(page, png, key) {
  await page.evaluate(
    async ({ b64, key }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const surface = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = surface.getContext('2d')
      context.drawImage(bitmap, 0, 0)
      window.__canvasSnaps = window.__canvasSnaps ?? {}
      window.__canvasSnaps[key] = context.getImageData(0, 0, bitmap.width, bitmap.height)
    },
    { b64: png.toString('base64'), key },
  )
}

/**
 * Photograph the WebGL canvas alone (every overlay hidden) into page memory under `key`.
 *
 * The Inspector is hidden too: at phone width its bottom sheet is drawn over the canvas's box, so an
 * element screenshot of the canvas would otherwise photograph the sheet. `visibility`, not `display`,
 * so nothing reflows between snapshots. `filter` and `backdrop-filter` are switched off on the hidden
 * overlays as well (`TODO/render-007`): Firefox still paints a `visibility:hidden` SVG element's CSS
 * `drop-shadow`, so the selection gizmo's Z arm left two faint grey bars in every Firefox snapshot.
 * Neither property affects layout.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 */
export async function snapshotCanvas(page, key) {
  await nextFrames(page)
  const handle = await page.addStyleTag({
    content:
      '[data-testid=viewport] > :not(canvas),[data-testid=inspector]{visibility:hidden !important}' +
      '[data-testid=viewport] > :not(canvas),[data-testid=viewport] > :not(canvas) *{filter:none !important;backdrop-filter:none !important}',
  })
  try {
    await storeSnapshot(page, await page.getByTestId('viewport-canvas').screenshot(), key)
  } finally {
    await handle.evaluate((node) => node.remove())
  }
}

/**
 * Photograph what a person sees: the part of the viewport not covered by the Inspector (the sheet
 * at phone and tablet width, the column at laptop width), with the gizmo, navigation chrome and
 * scale readout all on screen. A real page screenshot, so the overlays are in it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 * @returns {Promise<{ width: number, height: number }>} the clipped size, so a spec can assert it is not empty
 */
export async function snapshotVisibleViewport(page, key) {
  await nextFrames(page)
  const clip = await page.evaluate(() => {
    const view = document.querySelector('[data-testid="viewport"]').getBoundingClientRect()
    let { left, top, right, bottom } = view
    const sheet = document.querySelector('[data-testid="inspector"]')?.getBoundingClientRect()
    if (sheet && sheet.width > 0 && sheet.height > 0 && sheet.left < right && sheet.right > left && sheet.top < bottom && sheet.bottom > top) {
      // A bottom sheet spans (nearly) the whole width; a column spans (nearly) the whole height.
      if (sheet.width >= view.width * 0.8) bottom = Math.min(bottom, sheet.top)
      else right = Math.min(right, sheet.left)
    }
    return { x: Math.floor(left), y: Math.floor(top), width: Math.floor(right - left), height: Math.floor(bottom - top) }
  })
  await storeSnapshot(page, await page.screenshot({ clip }), key)
  return { width: clip.width, height: clip.height }
}

/**
 * How many pixels differ visibly (summed RGB difference above 24) between two stored snapshots.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} a
 * @param {string} b
 * @returns {Promise<number>} the count, or -1 when the two are different sizes
 */
export function changedPixels(page, a, b) {
  return page.evaluate(
    ({ a, b }) => {
      const first = window.__canvasSnaps[a]
      const second = window.__canvasSnaps[b]
      if (first.width !== second.width || first.height !== second.height) return -1
      let changed = 0
      for (let index = 0; index < first.data.length; index += 4) {
        const delta =
          Math.abs(first.data[index] - second.data[index]) +
          Math.abs(first.data[index + 1] - second.data[index + 1]) +
          Math.abs(first.data[index + 2] - second.data[index + 2])
        if (delta > 24) changed += 1
      }
      return changed
    },
    { a, b },
  )
}
