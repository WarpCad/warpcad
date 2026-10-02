// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Drag-place a **Kit part** and a **Raspberry Pi part** (TODO/ui-031), driven
 * against `/` — the running app, not a Storybook iframe.
 *
 * `ui-030` proved the composite drop mechanism on four fasteners; this is the same
 * gesture across the other fifteen recipes, and two things here are genuinely new
 * rather than a repeat:
 *
 * 1. **A row with a variant.** `raspberrypi.bplus` and `raspberrypi.cameraModule`
 *    are each one registry op parameterised by `model`, per `core-014a`'s "one
 *    factory, not one draggable per revision" decision. The row carries an inline
 *    `<select>`, and the load-bearing test is that changing it changes what the
 *    drop commits **and** what the ghost previews — a variant that only reached
 *    the record would preview one board and place another.
 * 2. **A 26-row sheet at phone width.** `ui-030` confirmed scrolling with eleven
 *    rows; four sections and twenty-six rows in a `max-height: 46vh` sheet is a
 *    materially different UI, which is why `openLibrary` scrolls rather than
 *    assuming and why this spec runs the phone project.
 *
 * Runs the full viewport x engine matrix from `playwright.config.js`: the ghost
 * preview, the working-plane projection and the committed solid are WebGL end to
 * end, and the Library is a bottom sheet at phone width. Firefox is expected to
 * fail at browser launch in this sandbox for reasons unrelated to this spec — see
 * `TROUBLESHOOTING.md`'s 2026-09-17 entry.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'kit-rpi-placement-snapshots')

/**
 * Open the Library if this viewport keeps it behind a tab, and bring a section
 * into view.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} sectionId
 */
async function openLibrary(page, sectionId) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  await page.getByTestId(`library-rows-${sectionId}`).scrollIntoViewIfNeeded()
}

/**
 * Put the Library sheet away, if this viewport has one — at phone width the
 * Library and the Inspector share one bottom-sheet slot.
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
 * Real `PointerEvent`s rather than Playwright's mouse API, so one helper drives
 * mouse and touch alike and the drop lands at an exact fraction of the canvas
 * wherever the panel happens to sit.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} options
 * @param {string} options.op Registry key, e.g. `kit.board`.
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
            pointerId: 21,
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
  // Longer than the hardware spec's 140ms: a Pi board folds ~50 parts through the
  // kernel on its first drag, and the ghost is built synchronously on first hover.
  await page.waitForTimeout(400)
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

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the Library panel shows Kit Parts and Raspberry Pi sections with every recipe', async ({
  page,
}, testInfo) => {
  // Reachability, per CLAUDE.md: all fifteen of these have been complete,
  // registered and kernel-verified since M2/M4 and unreachable from the app the
  // whole time.
  await openLibrary(page, 'kit')
  await expect(page.getByTestId('library-heading-kit')).toHaveText('Kit Parts')
  const kit = await page.$$eval('[data-testid="library-rows-kit"] [data-op]', (nodes) =>
    nodes.map((node) => node.getAttribute('data-label')),
  )
  expect(kit).toEqual(['Board', 'Board Frame', 'Anchor'])

  await openLibrary(page, 'raspberrypi')
  await expect(page.getByTestId('library-heading-raspberrypi')).toHaveText('Raspberry Pi')
  const rpi = await page.$$eval('[data-testid="library-rows-raspberrypi"] [data-op]', (nodes) =>
    nodes.map((node) => node.getAttribute('data-op')),
  )
  expect(rpi).toHaveLength(12)
  expect(rpi[0]).toBe('raspberrypi.bplus')

  // The two sections that already existed are untouched — creation families stay
  // separate lists, never one undifferentiated dropdown.
  const primitives = await page.$$eval('[data-testid="library-rows"] [data-op]', (nodes) =>
    nodes.map((node) => node.getAttribute('data-label')),
  )
  expect(primitives).toEqual(['Cube', 'Cylinder', 'Cone', 'Hexagon', 'Triangle', 'Tube', 'Sketch', 'Sphere'])
  const hardware = await page.$$eval('[data-testid="library-rows-hardware"] [data-op]', (nodes) =>
    nodes.map((node) => node.getAttribute('data-label')),
  )
  expect(hardware).toEqual(['Bolt', 'Nut', 'Washer', 'Bearing'])

  // The 26-row sheet, captured at every reference viewport — the phone case is
  // "confirm by driving", not "no change needed".
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `sections-${testInfo.project.name}.png`) })
})

test('dragging a Kit Board into the viewport places it at the drop point, not at the origin', async ({
  page,
}) => {
  await openLibrary(page, 'kit')
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-body-count', '0')

  await dragRowIntoViewport(page, { op: 'kit.board', fx: 0.36, fy: 0.3 })

  await expect(viewport).toHaveAttribute('data-body-count', '1')
  const [board] = await sceneBodies(page)
  expect(board.op).toBe('kit.board')
  expect(board.name).toBe('Board 1')
  const [x, y, z] = centerParts(board.center)
  expect(Math.hypot(x, y)).toBeGreaterThan(1)
  expect(z).toBeGreaterThan(0)
  await expect(viewport).toHaveAttribute('data-selected-id', board.id)
})

test('the Raspberry Pi row places the model its own dropdown is set to', async ({
  page,
}, testInfo) => {
  // The task's real new ground: one row, a variant chosen before the drag, per
  // core-014a's "one factory, not one draggable per revision" decision.
  await openLibrary(page, 'raspberrypi')
  const choice = page.getByTestId('library-choice-raspberrypi.bplus')
  await expect(choice).toBeVisible()
  // Defaults to the current-generation board, not the recipe's own V1-era model 2.
  await expect(choice).toHaveValue('4')

  await choice.selectOption('5')
  await dragRowIntoViewport(page, { op: 'raspberrypi.bplus', fx: 0.35, fy: 0.3 })

  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(1)
  expect(bodies[0].op).toBe('raspberrypi.bplus')
  expect(bodies[0].name).toBe('Raspberry Pi 1')

  // The chosen model actually reached the document, not just the <select>.
  await closeLibrary(page)
  const model = page.getByTestId('inspector-param-model')
  await expect(model).toBeVisible()
  await expect(model).toHaveValue('5')
  // Since `TODO/ui-052` the Model is an editable dropdown after placement too, offering
  // the same options as the Library's pre-drag picker (`e2e/composite-param-edit.e2e.js`
  // covers changing it).
  await expect(model).toHaveJSProperty('tagName', 'SELECT')
  await expect(model).toBeEnabled()

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `pi5-${testInfo.project.name}.png`) })
})

test('two different models from the same row place two different boards', async ({ page }) => {
  await openLibrary(page, 'raspberrypi')
  const choice = page.getByTestId('library-choice-raspberrypi.bplus')

  await choice.selectOption('2')
  await dragRowIntoViewport(page, { op: 'raspberrypi.bplus', fx: 0.26, fy: 0.28 })
  await openLibrary(page, 'raspberrypi')
  await choice.selectOption('5')
  await dragRowIntoViewport(page, { op: 'raspberrypi.bplus', fx: 0.7, fy: 0.28 })

  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(2)
  expect(bodies.map((body) => body.name)).toEqual(['Raspberry Pi 1', 'Raspberry Pi 2'])
  // Both still there, at their own places: the second drop did not replace the
  // first, and the variant did not leak backwards into it.
  expect(bodies[0].center).not.toBe(bodies[1].center)
  // A Pi 5 is taller than a Pi 2; if the variant never reached the second drop
  // the two resting heights would be identical.
  const [, , z1] = centerParts(bodies[0].center)
  const [, , z2] = centerParts(bodies[1].center)
  expect(z1).not.toBeCloseTo(z2, 2)
})

test('a Camera Module dropped after a Pi board leaves the board alone (core-020 repro, via the UI)', async ({
  page,
}) => {
  // `TODO/done/core-020`'s reproduction — an earlier body, then a composite —
  // driven through the real drag-drop UI against two of the new composite kinds.
  // A closed finding's subsystem is a standing regression surface (CLAUDE.md's
  // Verification section).
  await openLibrary(page, 'raspberrypi')
  await dragRowIntoViewport(page, { op: 'raspberrypi.bplus', fx: 0.3, fy: 0.34 })
  const [pi] = await sceneBodies(page)

  await openLibrary(page, 'raspberrypi')
  await dragRowIntoViewport(page, { op: 'raspberrypi.cameraModule', fx: 0.72, fy: 0.3 })

  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(2)
  expect(bodies[0].id).toBe(pi.id)
  expect(bodies[0].name).toBe('Raspberry Pi 1')
  // Unmoved, not merely still listed.
  expect(bodies[0].center).toBe(pi.center)
  expect(bodies[1].name).toBe('Camera Module 1')
})

test('every Kit row places its own kind of part', async ({ page }) => {
  // The generic-mechanism claim: one drop path parameterised by the row's op,
  // with nothing per-recipe anywhere in the component.
  await openLibrary(page, 'kit')
  const ops = await page.$$eval('[data-testid="library-rows-kit"] [data-op]', (nodes) =>
    nodes.map((node) => node.getAttribute('data-op') ?? ''),
  )
  let column = 0
  for (const op of ops) {
    column += 1
    await openLibrary(page, 'kit')
    await dragRowIntoViewport(page, { op, fx: 0.2 + column * 0.18, fy: 0.3 })
  }
  const bodies = await sceneBodies(page)
  expect(bodies.map((body) => body.op)).toEqual(ops)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(ops.length))
  const centers = new Set(bodies.map((body) => body.center))
  expect(centers.size).toBe(ops.length)
})

test('selecting a placed Raspberry Pi accessory shows its recipe parameters, read-only', async ({
  page,
}) => {
  await openLibrary(page, 'raspberrypi')
  await dragRowIntoViewport(page, { op: 'raspberrypi.hatStandoff', fx: 0.42, fy: 0.3 })
  await closeLibrary(page)

  const params = page.getByTestId('inspector-params')
  await expect(params).toBeVisible()
  await expect(params).toHaveAttribute('data-editable', 'false')
})

test('a touch drag places a Raspberry Pi part too', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'this project has no touch emulation')
  await openLibrary(page, 'raspberrypi')
  await dragRowIntoViewport(page, {
    op: 'raspberrypi.activeCoolingFan',
    fx: 0.5,
    fy: 0.28,
    pointerType: 'touch',
  })
  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(1)
  expect(bodies[0].op).toBe('raspberrypi.activeCoolingFan')
  const [x, y] = centerParts(bodies[0].center)
  expect(Math.hypot(x, y)).toBeGreaterThan(1)
})
