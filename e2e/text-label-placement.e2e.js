// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * Drag-place a **Text** label (TODO/render-002), driven against `/` — the running
 * app, not a Storybook iframe — then retype its wording in the Inspector.
 *
 * `text.label` is a native op that takes `center` like a primitive, so this is the
 * `primitive-placement` gesture on a new section. What is specific to it: the drop must
 * land where released (not at the origin), the label must be a real solid with the
 * default 2 mm thickness, and the one free-text Inspector field must rebuild the body
 * with *wider* geometry when the string grows and refuse an empty string.
 *
 * Runs the full viewport × engine matrix from `playwright.config.js` (WebGL canvas,
 * touch drag, bottom sheet at phone width). Firefox launch failures in this sandbox are
 * unrelated — see `TROUBLESHOOTING.md`'s 2026-09-17 entry.
 */

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  await page.getByTestId('library-rows-text').scrollIntoViewIfNeeded()
}

/**
 * Put the Library sheet away, if this viewport has one.
 *
 * At phone width the Library and the Inspector share one bottom-sheet slot, so
 * the Inspector is genuinely not on screen until the Library is closed — a real
 * step a phone user performs, not a test artefact, and the same one
 * `e2e/inspector-param-edit.e2e.js` drives. A no-op at tablet and laptop width.
 *
 * @param {import('@playwright/test').Page} page
 */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag a Library row into the viewport and release at a point inside it.
 *
 * Real `PointerEvent`s rather than Playwright's mouse API, for the same reason
 * the primitive spec gives: one helper drives mouse and touch alike, and the drop
 * lands at an exact fraction of the canvas wherever the panel sits.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} options
 * @param {string} options.op Registry key, e.g. `hardware.bolt`.
 * @param {number} options.fx Horizontal drop point, as a fraction of the viewport.
 * @param {number} options.fy Vertical drop point, as a fraction of the viewport.
 * @param {'mouse' | 'touch'} [options.pointerType]
 */
async function dragRowIntoViewport(page, { op, fx, fy, pointerType = 'mouse' }) {
  await page.evaluate(
    ({ op, fx, fy, pointerType }) => {
      const row = document.querySelector(`[data-testid="library-row-${op}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error(`missing row ${op} or viewport`)
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const startX = from.left + from.width / 2
      const startY = from.top + from.height / 2
      const endX = to.left + to.width * fx
      const endY = to.top + to.height * fy

      /**
       * @param {EventTarget} target
       * @param {string} type
       * @param {number} x
       * @param {number} y
       */
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 11,
            pointerType,
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
    { op, fx, fy, pointerType },
  )
  await page.waitForTimeout(140)
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, op: string, name: string, center: string, selected: string }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: node.getAttribute('data-body-center') ?? '',
      selected: node.getAttribute('data-selected') ?? '',
    })),
  )
}

/** @param {string} center `"x,y,z"` as the scene list reports it. */
function centerParts(center) {
  return center.split(',').map(Number)
}

/** @param {string} bounds `"x0,y0,z0,x1,y1,z1"` as the scene list reports it. */
function extents(bounds) {
  const [x0, y0, z0, x1, y1, z1] = bounds.split(',').map(Number)
  return { w: x1 - x0, d: y1 - y0, h: z1 - z0 }
}

/** @param {import('@playwright/test').Page} page */
async function onlyBodyBounds(page) {
  return page.$eval('[data-testid="scene-bodies"] li', (node) => node.getAttribute('data-body-bounds') ?? '')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the Library panel has a Text section with one Text row', async ({ page }) => {
  await openLibrary(page)
  await expect(page.getByTestId('library-heading-text')).toHaveText('Text')
  const labels = await page.$$eval('[data-testid="library-rows-text"] [data-op]', (nodes) =>
    nodes.map((node) => node.getAttribute('data-label')),
  )
  expect(labels).toEqual(['Text'])
})

test('dragging Text into the viewport places a 2 mm label at the drop point, selected', async ({ page }) => {
  await openLibrary(page)
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-body-count', '0')

  await dragRowIntoViewport(page, { op: 'text.label', fx: 0.4, fy: 0.3 })

  await expect(viewport).toHaveAttribute('data-body-count', '1')
  const [label] = await sceneBodies(page)
  expect(label.op).toBe('text.label')
  expect(label.name).toBe('Text 1')
  const [x, y, z] = label.center.split(',').map(Number)
  expect(Math.hypot(x, y)).toBeGreaterThan(1)
  expect(z).toBeCloseTo(1, 1)
  expect(extents(await onlyBodyBounds(page)).h).toBeCloseTo(2, 1)
  await expect(viewport).toHaveAttribute('data-selected-id', label.id)
})

test('a touch drag places a label too', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'this project has no touch emulation')
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'text.label', fx: 0.5, fy: 0.3, pointerType: 'touch' })
  expect(await sceneBodies(page)).toHaveLength(1)
})

test('a label placed after a cube leaves the cube alone (scenario 1 shape)', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.3, fy: 0.36 })
  const [cube] = await sceneBodies(page)
  await dragRowIntoViewport(page, { op: 'text.label', fx: 0.7, fy: 0.3 })
  const bodies = await sceneBodies(page)
  expect(bodies.map((b) => b.op)).toEqual(['primitive.cuboid', 'text.label'])
  expect(bodies[0].id).toBe(cube.id)
  expect(bodies[0].center).toBe(cube.center)
})

test('retyping the label in the Inspector rebuilds it wider; an empty string is refused', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'text.label', fx: 0.4, fy: 0.3 })
  await closeLibrary(page)
  const before = extents(await onlyBodyBounds(page))

  const field = page.getByTestId('inspector-param-text')
  await expect(field).toBeVisible()
  await expect(field).toHaveValue('Label')
  await expect(field).not.toHaveAttribute('readonly', '')
  await field.click()
  await field.fill('Label Longer')
  await field.press('Enter')
  await expect.poll(async () => extents(await onlyBodyBounds(page)).w).toBeGreaterThan(before.w * 1.5)
  await expect(field).toHaveValue('Label Longer')

  await field.click()
  await field.fill('')
  await field.press('Enter')
  await expect(page.getByTestId('inspector-param-error')).toBeVisible()
  await expect(field).toHaveValue('Label Longer')
})
