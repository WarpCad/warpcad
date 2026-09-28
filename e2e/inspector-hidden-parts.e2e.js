import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

/**
 * The Inspector's **Show hidden parts** toggle (`TODO/ui-047`), now inside the **Parts**
 * section that `TODO/ui-049` made of `ui-047`'s hidden-only list, driven against `/` — the
 * running app, not a Storybook iframe. Requested by the user right after `render-004`
 * hid `hardware.bolt`'s `tap` clearance by default: with nothing on screen saying it
 * exists any more, this section is the discoverability route back to it.
 *
 * **All three reference viewports, all three engines — no `test.skip` pin.** The
 * toggle builds and paints real translucent `Mesh`es (`src/render/mesh.js`), which is
 * exactly the WebGL material/picking surface CLAUDE.md's Browser Support section says
 * defaults to every engine. Firefox is expected to fail at browser launch in this
 * sandbox for reasons unrelated to this spec — see `TROUBLESHOOTING.md`.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'inspector-hidden-parts-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/**
 * Open the Library if this viewport keeps it behind a tab, and scroll the Hardware
 * section into view — the same precondition `hardware-library-placement.e2e.js` drives.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  await page.getByTestId('library-rows-hardware').scrollIntoViewIfNeeded()
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag a Library row into the viewport with real `PointerEvent`s.
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
            pointerId: 13,
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
 * Make the Inspector's contents reachable: a no-op where it is a persistent column,
 * and a tap on its tab if the phone/tablet sheet is not already open.
 *
 * @param {import('@playwright/test').Page} page
 */
async function showInspector(page) {
  await closeLibrary(page)
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
  }
}

/**
 * The scene list's view of each body.
 *
 * @param {import('@playwright/test').Page} page
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
    })),
  )
}

/**
 * Photograph the WebGL canvas alone (every overlay hidden) into page memory under `key`.
 *
 * The Inspector is hidden too: at phone width its bottom sheet is drawn over the canvas's
 * box, so an element screenshot of the canvas would otherwise photograph the sheet — and
 * `.check()` on the toggle scrolls that sheet when `ui-051`'s pinned Delete row covers the
 * toggle, which read as thousands of "canvas" pixels changing when the 3D view had not.
 * `visibility`, not `display`, so nothing reflows between snapshots.
 */
async function snapshotCanvas(page, key) {
  const handle = await page.addStyleTag({
    content:
      '[data-testid=viewport] > :not(canvas),[data-testid=inspector]{visibility:hidden !important}',
  })
  try {
    const png = await page.getByTestId('viewport-canvas').screenshot()
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
  } finally {
    await handle.evaluate((node) => node.remove())
  }
}

/**
 * How many pixels differ visibly between two stored snapshots.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} a
 * @param {string} b
 * @returns {Promise<number>}
 */
function changedPixels(page, a, b) {
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

// High enough to land on the grid rather than under a phone-width sheet.
const BOLT = { fx: 0.45, fy: 0.4 }

/**
 * Drop a Bolt, select it, and open the Inspector.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeAndSelectBolt(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'hardware.bolt', ...BOLT })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const [bolt] = await sceneBodies(page)
  // A freshly dropped body is already the selection (`ui-010`) — no click needed,
  // and a click here would land as the *second* click on the same body and drill
  // into whichever part is under the pointer (`ui-016`'s pick-depth contract).
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bolt.id)
  await showInspector(page)
  return bolt
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('a selected Bolt lists every part under Parts, tap labelled hidden; a selected Cube has no Parts section', async ({ page }) => {
  await placeAndSelectBolt(page)
  await expect(page.getByTestId('inspector-parts')).toBeVisible()
  // All the parts, visible ones first — not only the hidden ones (ui-049).
  await expect(page.getByTestId('inspector-parts').locator('[data-testid^="inspector-part-item-"]')).toHaveCount(6)
  await expect(page.getByTestId('inspector-part-head')).toBeVisible()
  await expect(page.getByTestId('inspector-part-hidden-head')).toHaveCount(0)
  await expect(page.getByTestId('inspector-part-tap')).toBeVisible()
  await expect(page.getByTestId('inspector-part-hidden-tap')).toHaveText('hidden')
  await expect(page.getByTestId('inspector-hidden-parts-toggle')).not.toBeChecked()

  // A plain Cube has nothing hidden — the section is absent, not disabled. A
  // fresh drop is already the selection, so no click is needed (and one here
  // would land as a second click on the bolt still selected underneath it).
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.7, fy: 0.3 })
  await closeLibrary(page)
  const bodies = await sceneBodies(page)
  const cube = bodies.find((body) => body.op === 'primitive.cuboid')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)
  await showInspector(page)
  await expect(page.getByTestId('inspector-name')).toBeVisible()
  await expect(page.getByTestId('inspector-parts')).toHaveCount(0)
})

test('toggling Show hidden parts draws a translucent overlay, and toggling off reverts it', async ({ page }) => {
  await placeAndSelectBolt(page)
  await snapshotCanvas(page, 'before')

  await page.getByTestId('inspector-hidden-parts-toggle').check()
  await expect(page.getByTestId('inspector-hidden-parts-toggle')).toBeChecked()
  // Two animation frames so the rebuilt meshes have actually been drawn.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await snapshotCanvas(page, 'shown')

  const shownDiff = await changedPixels(page, 'before', 'shown')
  expect(shownDiff, 'canvas pixels changed once the clearance is drawn').toBeGreaterThan(50)

  await page.getByTestId('inspector-hidden-parts-toggle').uncheck()
  await expect(page.getByTestId('inspector-hidden-parts-toggle')).not.toBeChecked()
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await snapshotCanvas(page, 'hidden-again')

  const revertedDiff = await changedPixels(page, 'before', 'hidden-again')
  // 40 is this project's own precedent for "back to normal" (ACCEPTANCE.md scenario
  // 5's `ui-041` re-drive: "~1 186 changed pixels... back to <40 after deselecting").
  expect(revertedDiff, 'toggling off reverts the canvas to how it looked before').toBeLessThan(40)
})

test('tapping a listed hidden part drills in, reading the breadcrumb "Objects ▸ Bolt 1 ▸ tap"', async ({ page }) => {
  await placeAndSelectBolt(page)
  await page.getByTestId('inspector-part-tap').click()
  await expect(page.getByTestId('inspector-breadcrumb')).toBeVisible()
  await expect(page.getByTestId('inspector-breadcrumb-group')).toHaveText('Bolt 1')
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('tap')
  await expect(page.getByTestId('inspector-breadcrumb-root')).toHaveText('Objects')
  // Drilled in: the Parts section is gone (a part has no parts of its own), exactly
  // like Transform and Parameters freezing at that depth.
  await expect(page.getByTestId('inspector-parts')).toHaveCount(0)
})

test('the toggle row and each part row are full-size tap targets, and nothing overflows the page', async ({
  page,
}) => {
  await placeAndSelectBolt(page)
  const toggleRow = await page.getByTestId('inspector-hidden-parts-toggle-row').boundingBox()
  expect(toggleRow?.height ?? 0, 'toggle row height').toBeGreaterThanOrEqual(44)

  const partRow = await page.getByTestId('inspector-part-tap').boundingBox()
  expect(partRow?.height ?? 0, 'tap row height').toBeGreaterThanOrEqual(44)
  const partCheck = await page.getByTestId('inspector-part-check-tap').boundingBox()
  expect(partCheck?.height ?? 0, 'tap check height').toBeGreaterThanOrEqual(44)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
