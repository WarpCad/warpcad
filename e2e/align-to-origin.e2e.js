import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Inspector's **Align to origin** row (`TODO/ui-050`), driven against `/` —
 * the running app, not a Storybook iframe.
 *
 * Runs the full 3 viewport × 3 engine matrix from `playwright.config.js`,
 * unlike `snap-align-operation.e2e.js`'s Chromium-only DOM/state-logic
 * narrowing: the assertions here read rendered evaluated geometry
 * (`data-body-bounds`), the gizmo's own drag path (the last test), and a
 * brand-new phone-width control (the 3×3 grid) — all three are exactly the
 * WebGL/canvas/touch surface CLAUDE.md's Browser Support section defaults to
 * all three engines for.
 *
 * The load-bearing case is the Pi one: `raspberrypi.bplus.js` snaps `microsd`
 * `outside+` under `mb` (the board), so the whole body's own min Z sits 1.5 mm
 * *below* the board's — "snap the bottom of the motherboard to Z=0" has to
 * measure from `mb` alone while moving the whole Pi, which is `TODO/ui-050`'s
 * entire reason for existing over a plain bounding-box-to-origin control.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'align-to-origin-snapshots')

/**
 * Open the Library if this viewport keeps it behind a tab, and scroll the
 * Raspberry Pi section into view — the same two-step `kit-rpi-library-
 * placement.e2e.js` already needs for a 26-row sheet.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  const section = page.getByTestId('library-rows-raspberrypi')
  if (await section.isVisible().catch(() => false)) await section.scrollIntoViewIfNeeded()
}

/**
 * Put the Library sheet away, if this viewport has one.
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
 * Drag a Library row into the viewport and release inside it — real
 * `PointerEvent`s, matching every other spec in this folder.
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
            pointerId: 7,
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
 * Click at a fraction of the viewport, as a press that does not move.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 * @param {{ shift?: boolean }} [modifiers]
 */
async function clickViewportAt(page, fx, fy, modifiers = {}) {
  await page.evaluate(
    ({ fx, fy, shift }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      const x = box.left + box.width * fx
      const y = box.top + box.height * fy
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 3,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            shiftKey: shift === true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy, shift: modifiers.shift === true },
  )
  await page.waitForTimeout(90)
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, op: string, name: string, center: string, bounds: string }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: node.getAttribute('data-body-center') ?? '',
      bounds: node.getAttribute('data-body-bounds') ?? '',
    })),
  )
}

/**
 * @param {string} bounds `"minX,minY,minZ,maxX,maxY,maxZ"` as `data-body-bounds` renders it.
 * @returns {[[number, number, number], [number, number, number]]}
 */
function parseBounds(bounds) {
  const [minX, minY, minZ, maxX, maxY, maxZ] = bounds.split(',').map(Number)
  return [[minX, minY, minZ], [maxX, maxY, maxZ]]
}

/**
 * @param {string} center `"x,y,z"` as `data-body-center` renders it.
 * @returns {[number, number, number]}
 */
function parseCenter(center) {
  const [x, y, z] = center.split(',').map(Number)
  return [x, y, z]
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @returns {Promise<number>}
 */
async function fieldNumber(page, testId) {
  const raw = await page.getByTestId(testId).inputValue()
  return Number(raw.replace(/[°\s]/g, ''))
}

/** Drop point for the Pi, and the click point that lands on it afterward. */
const PI = { drop: { fx: 0.3, fy: 0.34 }, click: { fx: 0.3, fy: 0.3 } }
/** Same fixture position `snap-align-operation.e2e.js`/`boolean-operations.e2e.js` use for a Cube. */
const CUBE = { drop: { fx: 0.28, fy: 0.42 }, click: { fx: 0.28, fy: 0.38 } }

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the row is absent with nothing selected, and reappears once a Cube is', async ({ page }) => {
  await expect(page.getByTestId('align-origin-row')).toHaveCount(0)

  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await closeLibrary(page)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(page.getByTestId('align-origin-row')).toBeVisible()
  // No named parts on a bare solid — the Reference dropdown does not exist.
  await expect(page.getByTestId('align-origin-reference')).toHaveCount(0)
})

test('with 2 bodies selected the row does not exist in the DOM', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.72, fy: 0.3 })
  await closeLibrary(page)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await clickViewportAt(page, 0.72, 0.26, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('align-origin-row')).toHaveCount(0)
})

test('tapping X max on a Cube changes only X', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await closeLibrary(page)
  const [cube] = await sceneBodies(page)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)

  const before = parseCenter(cube.center)
  await page.getByTestId('align-origin-x-max').click()

  const [after] = await sceneBodies(page)
  const afterCenter = parseCenter(after.center)
  const [, afterMax] = parseBounds(after.bounds)
  expect(afterMax[0]).toBeCloseTo(0, 1)
  expect(afterCenter[1]).toBeCloseTo(before[1], 1)
  expect(afterCenter[2]).toBeCloseTo(before[2], 1)
})

test('drop a Pi, align by "mb" with the shortcut: centred X/Y, the board flush on Z, one History step, one Undo restores', async ({
  page,
}) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'raspberrypi.bplus', ...PI.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  // Read the History step count *before* touching selection at all — the
  // Timeline panel is one of the overlays (`AppView.vue`'s own
  // `sheetSlotClaimed = libraryOpen || timeline.open`) that
  // shares the Inspector's single phone-width sheet slot, and opening it
  // collapses the Inspector to its tab. Reading the count here, then closing
  // Timeline again straight away, keeps that contention from firing while
  // the Inspector's own controls need to be genuinely visible below.
  const timelineToggle = page.getByTestId('timeline-toggle')
  const usesTimelineToggle = await timelineToggle.isVisible()
  if (usesTimelineToggle) await timelineToggle.click()
  const stepsBefore = await page.getByTestId('timeline-count').textContent()
  const stepCountBefore = Number(String(stepsBefore).match(/\d+/)?.[0] ?? '0')
  if (usesTimelineToggle) await timelineToggle.click()

  const [piBefore] = await sceneBodies(page)
  // A just-dropped body is already selected (`ui-010`'s own contract), so the
  // very first click here would land as the *second* click on that same body
  // — exactly the "narrow to the clicked part" gesture `pickAt`'s own doc
  // comment describes — and drill straight into whichever part is under the
  // cursor. Deselecting first makes the click below the real first click.
  await clickViewportAt(page, 0.04, 0.06)
  await clickViewportAt(page, PI.click.fx, PI.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', piBefore.id)
  await expect(page.getByTestId('align-origin-row')).toBeVisible()

  const reference = page.getByTestId('align-origin-reference')
  await expect(reference).toBeVisible()
  await reference.selectOption('mb')

  await page.getByTestId('align-origin-drop').click()

  // Re-open Timeline now that the tap itself is done — its own doc comment
  // above explains why this couldn't happen while `align-origin-drop` still
  // needed to be visible and clickable.
  if (usesTimelineToggle) await timelineToggle.click()
  const stepsAfter = await page.getByTestId('timeline-count').textContent()
  const stepCountAfter = Number(String(stepsAfter).match(/\d+/)?.[0] ?? '0')
  expect(stepCountAfter).toBe(stepCountBefore + 1)
  // The History panel's own row label — `src/core/timelineLabel.js`'s richer
  // `describeRow`, not the Undo button's shallower per-record tooltip — is
  // where `params.alignedTo` is meant to read "Align to origin" instead of
  // the plain "Move" (`TODO/ui-050`'s own Step 2 decision).
  await expect(page.locator('[data-testid^="timeline-row-"] .row__text').last()).toHaveText(
    /Align to origin/,
  )
  if (usesTimelineToggle) await timelineToggle.click()

  const [piAfter] = await sceneBodies(page)
  const [minAfter, maxAfter] = parseBounds(piAfter.bounds)
  // The **board's own** footprint is centred on the origin in X/Y — the
  // *whole* body's own bounding-box centre (what the Position field shows) is
  // not exactly (0, 0), because the whole body's box is not symmetric about
  // `mb`'s box (connectors overhang unevenly on each side by a couple of
  // millimetres) — the spec's own docs example calls this out by name for Z,
  // and the same asymmetry is real, if smaller, on X/Y too. A wide-ish
  // tolerance here checks "genuinely near the origin, not still off in a
  // corner where the pre-align drop point put it", not bit-exact centring of
  // a box this test has no per-part hook to measure directly.
  const positionX = await fieldNumber(page, 'inspector-position-x')
  const positionY = await fieldNumber(page, 'inspector-position-y')
  expect(Math.abs(positionX)).toBeLessThan(3)
  expect(Math.abs(positionY)).toBeLessThan(3)
  // The board's underside sits on Z=0, and the whole Pi's own min Z is 1.5 mm
  // *below* it — the microsd, snapped `outside+` under `mb` — which is the
  // exact, load-bearing reason this control measures from a named part rather
  // than the whole bounding box.
  expect(minAfter[2]).toBeCloseTo(-1.5, 1)
  expect(maxAfter[2]).toBeGreaterThan(0)

  await page.getByTestId('undo-button').click()
  const [piUndone] = await sceneBodies(page)
  expect(piUndone.center).toBe(piBefore.center)
})

test('drilling into the Pi’s "usb1" part and stepping back up preselects it as Reference', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'raspberrypi.bplus', ...PI.drop })
  await closeLibrary(page)
  const [pi] = await sceneBodies(page)

  // Drill in through the Inspector's Parts section (`TODO/ui-049`) — deterministic
  // regardless of camera projection, unlike guessing a screen point over one small
  // connector. A just-dropped body is already the selection, so its parts are listed.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', pi.id)
  await page.getByTestId('inspector-part-usb1').click()
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('usb1')
  // Sub-part depth: the row is absent, per its own precondition.
  await expect(page.getByTestId('align-origin-row')).toHaveCount(0)

  // Step back up via the Inspector's own breadcrumb link.
  await page.getByTestId('inspector-breadcrumb-group').click()
  await expect(page.getByTestId('align-origin-row')).toBeVisible()
  await expect(page.getByTestId('align-origin-reference')).toHaveValue('usb1')
})

test('after aligning, dragging the gizmo still keeps the Position fields and the mesh in sync', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await closeLibrary(page)
  const [cube] = await sceneBodies(page)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)

  await page.getByTestId('align-origin-z-min').click()
  const [bodyAfterAlign] = await sceneBodies(page)
  const [minAfterAlign] = parseBounds(bodyAfterAlign.bounds)
  // Z's *min face* is on the grid, not the Position field's own centre —
  // Position is the bounding-box centre (per the Inspector's own convention),
  // so a 40 mm cube sitting on Z=0 reads Position Z = 20, not 0.
  expect(minAfterAlign[2]).toBeCloseTo(0, 0)

  // A small drag on the gizmo's X arm — real PointerEvents on the hit target,
  // matching `gizmo-transform.e2e.js`'s own drag technique.
  const handle = page.getByTestId('gizmo-grab-arm-x')
  const box = await handle.boundingBox()
  if (!box) throw new Error('no gizmo handle box — is the gizmo attached?')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 40, startY, { steps: 4 })
  await page.mouse.up()

  const fieldX = await fieldNumber(page, 'inspector-position-x')
  const [afterDrag] = await sceneBodies(page)
  const meshCenter = parseCenter(afterDrag.center)
  expect(fieldX).toBeCloseTo(meshCenter[0], 0)
})

test('the row and its shortcut fit 390px width without horizontal page scroll, with a snapshot at each reference viewport', async ({
  page,
}) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'raspberrypi.bplus', ...PI.drop })
  await closeLibrary(page)
  // See the note in the previous test: a fresh drop is already selected, so
  // deselect first or this click drills straight into a part.
  await clickViewportAt(page, 0.04, 0.06)
  await clickViewportAt(page, PI.click.fx, PI.click.fy)
  const row = page.getByTestId('align-origin-row')
  await expect(row).toBeVisible()

  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)

  const shortcut = page.getByTestId('align-origin-drop')
  const shortcutBox = await shortcut.boundingBox()
  expect(shortcutBox).not.toBeNull()
  expect(shortcutBox.height).toBeGreaterThanOrEqual(44)

  for (const testId of ['align-origin-x-min', 'align-origin-y-center', 'align-origin-z-max']) {
    const box = await page.getByTestId(testId).boundingBox()
    expect(box).not.toBeNull()
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${test.info().project.name}.png`) })
})
