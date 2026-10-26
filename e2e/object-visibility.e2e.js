// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

/**
 * Hide and show from the Inspector's Objects list (`TODO/ui-089`), driven against `/` — the
 * running app, not a Storybook iframe. It walks the docs example: place a Cube, Enlarge it to
 * 40 × 90 × 40 mm, Split it across Y with pins, hide `Cube 1 A` from its eye, and then checks
 * every rule a user would trip over — the hidden piece is gone from the canvas and cannot be
 * clicked, the hide survives a reload, Show all brings it back, hiding a selected body empties
 * the selection, and a hidden body ticked from the list is selected with the Inspector's
 * "Hidden in the view" note and no gizmo.
 *
 * **All three reference viewports, all three engines — no `test.skip` pin.** It toggles real
 * WebGL meshes and picking (`src/render/mesh.js`, `src/render/pick.js`) and writes to
 * IndexedDB (autosave), and the eye changes the Objects list's row layout at 390 px, so an
 * Objects-list snapshot is written at every viewport. At phone width in WebKit the Inspector
 * sheet must not scroll sideways (`ui-085`'s Safari failure). Canvas presence is asserted with
 * pixels (`window.__canvasSnaps`, as `inspector-hidden-parts.e2e.js` does), not by trusting the
 * DOM. Firefox is expected to fail at browser launch in this sandbox for reasons unrelated to
 * this spec — see `TROUBLESHOOTING.md`.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'object-visibility-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** High enough to land on the grid rather than under a phone-width sheet. */
const CUBE = { fx: 0.5, fy: 0.4 }
/** A corner of the canvas with nothing on it. */
const EMPTY = { fx: 0.04, fy: 0.06 }

/**
 * Open the Library if this viewport keeps it behind a tab.
 *
 * @param {import('@playwright/test').Page} page
 */
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
            pointerId: 17,
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
 * A press and release on the canvas at a client point — dispatched on the canvas itself, as
 * the sibling specs do, so no overlay above it (a sheet, the gizmo) can take the click.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ x: number, y: number }} point Client pixels.
 */
async function clickCanvasAtClient(page, point) {
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    if (!canvas) throw new Error('no canvas')
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 5,
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
    }
  }, point)
  await page.waitForTimeout(80)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ fx: number, fy: number }} at A fraction of the canvas box.
 */
async function clickCanvasAt(page, { fx, fy }) {
  const box = await page.getByTestId('viewport-canvas').boundingBox()
  if (!box) throw new Error('no canvas box')
  await clickCanvasAtClient(page, { x: box.x + box.width * fx, y: box.y + box.height * fy })
}

/**
 * Where a world point (mm, Z-up) is on screen, from the camera the viewport announces
 * (`data-camera-*`) and its fixed 45° vertical field of view — the same spherical model
 * `src/render/camera.js` draws with.
 *
 * @param {import('@playwright/test').Page} page
 * @param {[number, number, number]} pointMm
 * @returns {Promise<{ x: number, y: number }>}
 */
function clientPointOf(page, pointMm) {
  return page.evaluate(([px, py, pz]) => {
    const view = document.querySelector('[data-testid="viewport"]')
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    if (!view || !canvas) throw new Error('no viewport')
    const DEG = Math.PI / 180
    const az = Number(view.getAttribute('data-camera-azimuth')) * DEG
    const el = Number(view.getAttribute('data-camera-elevation')) * DEG
    const distance = Number(view.getAttribute('data-camera-distance'))
    const [tx, ty, tz] = String(view.getAttribute('data-camera-target')).split(',').map(Number)
    const dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)]
    const eye = [tx + distance * dir[0], ty + distance * dir[1], tz + distance * dir[2]]
    const up = [-Math.sin(el) * Math.cos(az), -Math.sin(el) * Math.sin(az), Math.cos(el)]
    const right = [-Math.sin(az), Math.cos(az), 0]
    const d = [px - eye[0], py - eye[1], pz - eye[2]]
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    const depth = -dot(d, dir)
    const rect = canvas.getBoundingClientRect()
    const half = Math.tan((45 * DEG) / 2)
    const ndcX = dot(d, right) / (depth * half * (rect.width / rect.height))
    const ndcY = dot(d, up) / (depth * half)
    return { x: rect.left + ((ndcX + 1) / 2) * rect.width, y: rect.top + ((1 - ndcY) / 2) * rect.height }
  }, pointMm)
}

/**
 * The body's world bounds, from the scene list.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @returns {Promise<{ min: number[], max: number[] }>}
 */
async function boundsOf(page, id) {
  const raw = String(await page.getByTestId(`scene-body-${id}`).getAttribute('data-body-bounds'))
  const values = raw.split(',').map(Number)
  return { min: values.slice(0, 3), max: values.slice(3, 6) }
}

/**
 * Make the Inspector's contents reachable: a no-op where it is a persistent column, a tap on
 * its tab where the phone/tablet sheet is closed.
 *
 * @param {import('@playwright/test').Page} page
 */
async function showInspector(page) {
  await closeLibrary(page)
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
  }
  await expect(page.getByTestId('inspector-sheet')).toBeVisible()
}

/**
 * The Objects list itself, open: the Inspector's whole content at 0 selected, a folded
 * section at 1 (`ui-049`).
 *
 * @param {import('@playwright/test').Page} page
 */
async function showObjectList(page) {
  await showInspector(page)
  const list = page.getByTestId('object-list')
  if (await list.isVisible()) return
  await page.getByTestId('inspector-objects-header').click()
  await expect(list).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
const nextFrames = (page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

/**
 * Photograph the WebGL canvas alone (every overlay hidden) into page memory under `key`.
 * `visibility`, not `display`, so nothing reflows between snapshots.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 */
async function snapshotCanvas(page, key) {
  await nextFrames(page)
  const handle = await page.addStyleTag({
    content: '[data-testid=viewport] > :not(canvas),[data-testid=inspector]{visibility:hidden !important}',
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

/**
 * Steps 1 of the docs example: drop a Cube, Enlarge it by 50 mm on Y (40 → 90), and Split it
 * with the sheet's defaults (across Y, the longest axis, at the middle, with pins).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>} The body's id.
 */
async function placeEnlargeAndSplit(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE })
  await closeLibrary(page)
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-body-count', '1')
  await expect(viewport).toHaveAttribute('data-selected-count', '1')
  const id = String(await viewport.getAttribute('data-selected-id'))

  await page.getByTestId('operation-enlarge').click()
  await expect(page.getByTestId('resize-popover')).toHaveAttribute('data-op', 'modify.enlarge')
  await page.getByTestId('resize-enlarge-dy').fill('50')
  await page.getByTestId('resize-commit').click()
  await expect(page.getByTestId('resize-popover')).toHaveCount(0)
  await expect
    .poll(async () => {
      const { min, max } = await boundsOf(page, id)
      return Math.round(max[1] - min[1])
    })
    .toBe(90)

  await page.getByTestId('op-split').click()
  await expect(page.getByTestId('split-sheet')).toBeVisible()
  await expect(page.getByTestId('split-axis')).toHaveValue('y')
  await expect(page.getByTestId('split-joint')).toHaveValue('pins')
  await page.getByTestId('split-apply').click()
  await expect(page.getByTestId('split-sheet')).toHaveCount(0)
  await expect(viewport).toHaveAttribute('data-selected-id', id)
  return id
}

/** @param {import('@playwright/test').Page} page */
async function expectSaved(page) {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('hide one piece of a split from its eye: gone from the canvas, unclickable, kept over a reload, back with Show all', async ({
  page,
}, testInfo) => {
  const viewport = page.getByTestId('viewport')
  const id = await placeEnlargeAndSplit(page)
  const row = (name) => page.getByTestId(`objects-part-item-${id}-${name}`)
  const eye = (name) => page.getByTestId(`objects-part-eye-${id}-${name}`)

  // Where piece A is: the centre of its −Y face, the face the home camera (looking from −Y)
  // sees. A ray through it runs inside A and leaves through A's −X side, so with A hidden it
  // meets nothing — B starts 45 mm further along Y.
  const { min, max } = await boundsOf(page, id)
  const aFace = await clientPointOf(page, [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2])

  // Control, with A shown: that point is on the body.
  await clickCanvasAt(page, EMPTY)
  await expect(viewport).toHaveAttribute('data-selected-count', '0')
  await clickCanvasAtClient(page, aFace)
  await expect(viewport).toHaveAttribute('data-selected-id', id)
  await clickCanvasAt(page, EMPTY)
  await expect(viewport).toHaveAttribute('data-selected-count', '0')
  await snapshotCanvas(page, 'both')

  // Step 2: expand the row and hide Cube 1 A.
  await showObjectList(page)
  await page.getByTestId(`objects-expand-${id}`).click()
  await expect(row('Cube 1 A')).toBeVisible()
  await expect(eye('Cube 1 A')).toHaveAttribute('aria-label', 'Hide Cube 1 A')
  await eye('Cube 1 A').click()
  await expect(eye('Cube 1 A')).toHaveAttribute('data-eye', 'hidden')
  await expect(eye('Cube 1 A')).toHaveAttribute('aria-label', 'Show Cube 1 A')
  await expect(row('Cube 1 A')).toHaveAttribute('data-view-hidden', 'true')
  await expect(row('Cube 1 B')).toHaveAttribute('data-view-hidden', 'false')
  await expect(page.getByTestId(`objects-eye-${id}`)).toHaveAttribute('data-eye', 'mixed')
  await expect(page.getByTestId('objects-count')).toContainText('1 hidden')
  await expect(page.getByTestId('objects-show-all')).toBeVisible()
  await expect(page.getByTestId(`scene-body-${id}`)).toHaveAttribute('data-view-hidden-parts', 'Cube 1 A')

  // The Objects list at this viewport (the eye changes row layout at 390 px).
  await page.getByTestId('inspector').screenshot({ path: join(SNAPSHOT_DIR, `objects-${testInfo.project.name}.png`) })
  // Every eye is a full tap target, and the sheet does not scroll sideways (`ui-085`). The
  // 0.1 px slack is layout float rounding (WebKit reports 43.99998 for a 44 px box), not a size miss.
  for (const target of [eye('Cube 1 A'), page.getByTestId(`objects-eye-${id}`)]) {
    const box = await target.boundingBox()
    expect(box?.width ?? 0, 'eye width').toBeGreaterThanOrEqual(43.9)
    expect(box?.height ?? 0, 'eye height').toBeGreaterThanOrEqual(43.9)
  }
  if (testInfo.project.name.startsWith('webkit') && testInfo.project.name.endsWith('-phone')) {
    const sheet = await page
      .getByTestId('inspector-sheet')
      .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
    expect(sheet.scroll, 'Inspector sheet scrollWidth === clientWidth').toBe(sheet.client)
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // The canvas lost piece A.
  await expect
    .poll(
      async () => {
        await snapshotCanvas(page, 'a-hidden')
        return changedPixels(page, 'both', 'a-hidden')
      },
      { message: 'hiding Cube 1 A changes the canvas', timeout: 20000 },
    )
    .toBeGreaterThan(50)

  // Step 3: a click where A was selects nothing, or B — never Cube 1 A.
  await clickCanvasAtClient(page, aFace)
  await clickCanvasAtClient(page, aFace)
  const count = await viewport.getAttribute('data-selected-count')
  if (count !== '0') {
    await expect(viewport).toHaveAttribute('data-selected-id', id)
    await expect(page.getByTestId('inspector-breadcrumb-part')).not.toHaveText('Cube 1 A')
  }
  await clickCanvasAt(page, EMPTY)
  await expect(viewport).toHaveAttribute('data-selected-count', '0')

  // Step 4: reload — A is still hidden.
  await expectSaved(page)
  await page.reload()
  await expect(viewport).toHaveAttribute('data-webgl', 'ready')
  await expect(viewport).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId(`scene-body-${id}`)).toHaveAttribute('data-view-hidden-parts', 'Cube 1 A')
  await showObjectList(page)
  await expect(page.getByTestId('objects-count')).toContainText('1 hidden')
  await page.getByTestId(`objects-expand-${id}`).click()
  await expect(eye('Cube 1 A')).toHaveAttribute('data-eye', 'hidden')
  await snapshotCanvas(page, 'reloaded')

  // Step 5: Show all — both pieces are back.
  await page.getByTestId('objects-show-all').click()
  await expect(page.getByTestId('objects-show-all')).toHaveCount(0)
  await expect(page.getByTestId('objects-count')).not.toContainText('hidden')
  await expect(page.getByTestId(`scene-body-${id}`)).not.toHaveAttribute('data-view-hidden-parts', /.+/)
  await expect(eye('Cube 1 A')).toHaveAttribute('data-eye', 'shown')
  await expect
    .poll(
      async () => {
        await snapshotCanvas(page, 'all-shown')
        return changedPixels(page, 'reloaded', 'all-shown')
      },
      { message: 'Show all draws Cube 1 A again', timeout: 20000 },
    )
    .toBeGreaterThan(50)
})

test('hiding a selected body empties the selection; ticking a hidden body selects it with the note and no gizmo', async ({
  page,
}) => {
  const viewport = page.getByTestId('viewport')
  const id = await placeEnlargeAndSplit(page)

  // Step 6: a selected body, hidden from its eye, leaves the selection.
  await expect(viewport).toHaveAttribute('data-selected-count', '1')
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
  await showObjectList(page)
  await page.getByTestId(`objects-eye-${id}`).click()
  await expect(page.getByTestId(`objects-eye-${id}`)).toHaveAttribute('data-eye', 'hidden')
  await expect(page.getByTestId(`objects-item-${id}`)).toHaveAttribute('data-view-hidden', 'true')
  await expect(page.getByTestId(`scene-body-${id}`)).toHaveAttribute('data-view-hidden', 'true')
  await expect(viewport).toHaveAttribute('data-selected-count', '0')
  await expect(page.getByTestId('objects-count')).not.toContainText('selected')
  await expect(page.getByTestId('objects-count')).toContainText('1 hidden')

  // Step 7: tick it from the list — selected, with the note, and nothing drawn for it.
  await showObjectList(page)
  await page.getByTestId(`objects-check-${id}`).click()
  await expect(viewport).toHaveAttribute('data-selected-id', id)
  await expect(page.getByTestId('inspector-view-hidden')).toHaveText('Hidden in the view · Show')
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(0)
  await expect(viewport).toHaveAttribute('data-xray-twins', '0')

  // The note's Show does what the eye does; the gizmo comes back with the body.
  await page.getByTestId('inspector-view-hidden-show').click()
  await expect(page.getByTestId('inspector-view-hidden')).toHaveCount(0)
  await expect(page.getByTestId(`scene-body-${id}`)).not.toHaveAttribute('data-view-hidden', 'true')
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
})

test('H hides the selection and Shift+H shows everything again', async ({ page }) => {
  const viewport = page.getByTestId('viewport')
  const id = await placeEnlargeAndSplit(page)
  // The body is still selected after Split. No text field may hold focus, or the key is typing.
  await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur())
  await expect(viewport).toHaveAttribute('data-selected-id', id)
  await page.keyboard.press('h')
  await expect(page.getByTestId(`scene-body-${id}`)).toHaveAttribute('data-view-hidden', 'true')
  await expect(viewport).toHaveAttribute('data-selected-count', '0')
  await page.keyboard.press('Shift+H')
  await expect(page.getByTestId(`scene-body-${id}`)).not.toHaveAttribute('data-view-hidden', 'true')
})
