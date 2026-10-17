// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Drag-place a **hardware** part (TODO/ui-030), driven against `/` — the running
 * app, not a Storybook iframe.
 *
 * This is the same gesture `e2e/primitive-placement.e2e.js` already covers, on a
 * different kind of registry entry, and the difference is the whole point of the
 * file: a `primitive.*` op takes a `center` param, so its drop position folds
 * into the record it commits. **No `hardware.*` recipe takes a position at all**
 * — every one of them builds at its own fixed internal origin — so the drop is
 * committed as the recipe's own record *plus* a trailing `transform.translate`
 * that supersedes it. The load-bearing test here is therefore "it lands where it
 * was dropped, not at the origin": the silent failure mode ui-030's Proposed fix
 * exists to prevent is a bolt that appears, correctly built and selectable, at
 * `0,0` however far the user dragged it.
 *
 * Runs the full viewport × engine matrix from `playwright.config.js` for the same
 * reasons the primitive spec gives — the Library is a bottom sheet at phone width
 * (and this section makes it taller, so the phone case is "confirm by driving",
 * not "no change needed"), and the ghost preview, working-plane projection and
 * committed solid are WebGL end to end. Firefox is expected to fail at browser
 * launch in this sandbox for reasons unrelated to this spec — see
 * `TROUBLESHOOTING.md`'s 2026-09-17 entry.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'hardware-placement-snapshots')

/**
 * Open the Library if this viewport keeps it behind a tab, and make sure the
 * Hardware section is actually in view.
 *
 * Scrolling is a real precondition at phone width once there are eleven rows in a
 * `max-height: 46vh` sheet, which is exactly what ui-030's Small-screen-behavior
 * bullet asks to be confirmed by driving rather than assumed from the CSS.
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

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the Library panel shows a Hardware section with all four fastener rows', async ({ page }) => {
  // Reachability, per CLAUDE.md: every one of these recipes has been complete and
  // registered since M2/M4 and unreachable from the app the whole time.
  await openLibrary(page)
  const labels = await page.$$eval('[data-testid="library-rows-hardware"] [data-op]', (nodes) =>
    nodes.map((node) => node.getAttribute('data-label')),
  )
  expect(labels).toEqual(['Bolt / screw', 'Nut', 'Washer', 'Bearing'])
  await expect(page.getByTestId('library-heading-hardware')).toHaveText('Hardware')

  // Creation and operation stay separate lists, and so do the two creation
  // families: the primitives section is untouched.
  const primitives = await page.$$eval('[data-testid="library-rows"] [data-op]', (nodes) =>
    nodes.map((node) => node.getAttribute('data-label')),
  )
  expect(primitives).toEqual(['Cube', 'Cylinder', 'Cone', 'Hexagon', 'Triangle', 'Tube', 'Sketch', 'Sphere'])
})

test('dragging Bolt into the viewport places it at the drop point, not at the origin', async ({
  page,
}, testInfo) => {
  await openLibrary(page)
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-body-count', '0')

  await dragRowIntoViewport(page, { op: 'hardware.bolt', fx: 0.34, fy: 0.3 })

  await expect(viewport).toHaveAttribute('data-body-count', '1')
  const [bolt] = await sceneBodies(page)
  expect(bolt.op).toBe('hardware.bolt')
  expect(bolt.name).toBe('Bolt / screw 1')
  // The regression this whole task's Option 2 exists to prevent: a composite
  // committed at the recipe's own internal origin however far it was dragged.
  const [x, y, z] = centerParts(bolt.center)
  expect(Math.hypot(x, y)).toBeGreaterThan(1)
  // And resting on the grid rather than half-buried in it.
  expect(z).toBeGreaterThan(0)

  // Selected on drop, exactly like a primitive.
  await expect(viewport).toHaveAttribute('data-selected-id', bolt.id)
  expect(bolt.selected).toBe('true')

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `bolt-${testInfo.project.name}.png`) })
})

test('two hardware rows dropped at different points land at different places', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'hardware.bolt', fx: 0.28, fy: 0.32 })
  const afterFirst = await sceneBodies(page)
  expect(afterFirst).toHaveLength(1)

  await dragRowIntoViewport(page, { op: 'hardware.bearing', fx: 0.68, fy: 0.26 })
  const afterSecond = await sceneBodies(page)

  expect(afterSecond).toHaveLength(2)
  expect(afterSecond.map((body) => body.op)).toEqual(['hardware.bolt', 'hardware.bearing'])
  expect(afterSecond.map((body) => body.name)).toEqual(['Bolt / screw 1', 'Bearing 1'])
  // Unmoved, not merely still listed — ACCEPTANCE scenario 1's own claim, on the
  // path that commits two records per drop instead of one.
  expect(afterSecond[0].id).toBe(afterFirst[0].id)
  expect(afterSecond[0].center).toBe(afterFirst[0].center)
  expect(afterSecond[1].center).not.toBe(afterFirst[0].center)
})

test('a composite placed after a primitive leaves the primitive alone (core-020 repro, via the UI)', async ({
  page,
}) => {
  // `TODO/done/core-020`'s original reproduction — a plate, then a bolt — driven
  // through the real drag-drop UI for the first time rather than through
  // `document.append` directly. A closed finding's subsystem is a standing
  // regression surface (CLAUDE.md's Verification section).
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.3, fy: 0.36 })
  const [cube] = await sceneBodies(page)

  await dragRowIntoViewport(page, { op: 'hardware.bolt', fx: 0.7, fy: 0.3 })

  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(2)
  // The cube is still its own body, with its own name and its own position —
  // not swallowed into the bolt's group, which is what core-020 did.
  expect(bodies[0].id).toBe(cube.id)
  expect(bodies[0].name).toBe('Cube 1')
  expect(bodies[0].center).toBe(cube.center)
  expect(bodies[1].name).toBe('Bolt / screw 1')
})

test('every hardware row places its own kind of part', async ({ page }) => {
  // The generic-mechanism claim again: one drop path parameterised by the row's
  // op, across a 6-record recipe (bolt), two 1-record ones and a 2-record one.
  await openLibrary(page)
  const ops = await page.$$eval('[data-testid="library-rows-hardware"] [data-op]', (nodes) =>
    nodes.map((node) => node.getAttribute('data-op') ?? ''),
  )
  let column = 0
  for (const op of ops) {
    column += 1
    await dragRowIntoViewport(page, { op, fx: 0.18 + column * 0.12, fy: 0.3 })
  }
  const bodies = await sceneBodies(page)
  expect(bodies.map((body) => body.op)).toEqual(ops)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(ops.length))
  // Each landed somewhere of its own, so "one mechanism" did not mean "one place".
  const centers = new Set(bodies.map((body) => body.center))
  expect(centers.size).toBe(ops.length)
})

test('selecting a placed bolt shows its recipe parameters, editable (TODO/ui-052)', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'hardware.bolt', fx: 0.4, fy: 0.3 })
  // At phone width the Inspector is behind the same bottom-sheet slot the
  // Library occupies, so this step is the user's, not the spec's.
  await closeLibrary(page)

  const params = page.getByTestId('inspector-params')
  await expect(params).toBeVisible()
  // Read-only until `ui-052`, which gave `spec`/`fit` the dropdown `ui-029` scoped out and
  // made `length` an ordinary editable number (`composite-param-edit.e2e.js` drives them).
  for (const key of ['type', 'spec', 'fit']) {
    const field = page.getByTestId(`inspector-param-${key}`)
    await expect(field).toBeVisible()
    await expect(field).toHaveJSProperty('tagName', 'SELECT')
    await expect(field).toBeEnabled()
  }
  const length = page.getByTestId('inspector-param-length')
  await expect(length).toBeVisible()
  await expect(length).not.toHaveAttribute('readonly', '')
  await expect(params).toHaveAttribute('data-editable', 'true')
  await expect(page.getByTestId('inspector-param-type')).toHaveValue('hex')
  await expect(page.getByTestId('inspector-param-spec')).toHaveValue('m10')
  await expect(length).toHaveValue('20')
})

test('a placed bolt offers the small metric sizes, and picking one updates the BOM (TODO/core-052)', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'hardware.bolt', fx: 0.4, fy: 0.3 })
  await closeLibrary(page)

  const spec = page.getByTestId('inspector-param-spec')
  const optionValues = () =>
    spec.locator('option').evaluateAll((options) => options.map((o) => /** @type {HTMLOptionElement} */ (o).value))
  // The Size list follows the Type (core-060): the default hex head offers the hex sizes, including the
  // imperial 1/4, and the metric socket sizes appear once Type is Socket cap.
  expect(await optionValues()).toContain('1/4')
  await page.getByTestId('inspector-param-type').selectOption('socket')
  const values = await optionValues()
  // Sizes that did not exist before core-052 (the table had m10 hex, m12 hex, 1/4 socket).
  for (const size of ['m2', 'm2.5', 'm3', '1/4']) expect(values).toContain(size)
  // Numeric order, not lexicographic: m2 comes before m10.
  expect(values.indexOf('m2')).toBeLessThan(values.indexOf('m10'))

  await spec.selectOption('m2.5')
  await expect(spec).toHaveValue('m2.5')
  await expect(page.getByTestId('bom-row')).toContainText('M2.5 socket')
  await expect(page.getByTestId('bom-row')).toContainText('20 mm')
})

test('the ghost preview shows the real part before the drop commits anything', async ({ page }) => {
  await openLibrary(page)
  const viewport = page.getByTestId('viewport')

  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="library-row-hardware.bolt"]')
    const box = row.getBoundingClientRect()
    row.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 13,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(viewport).toHaveAttribute('data-placing', 'true')
  await expect(viewport).toHaveAttribute('data-ghost', 'hidden')

  await page.evaluate(() => {
    const view = document.querySelector('[data-testid="viewport"]')
    const box = view.getBoundingClientRect()
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 13,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: box.left + box.width / 2,
        // Upper third: at phone width the Library sheet covers the lower half.
        clientY: box.top + box.height * 0.3,
        bubbles: true,
      }),
    )
  })
  await expect(viewport).toHaveAttribute('data-ghost', 'visible')
  // Still a preview, not a commitment.
  await expect(viewport).toHaveAttribute('data-body-count', '0')

  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent('pointercancel', { pointerId: 13, pointerType: 'mouse', bubbles: true }),
    )
  })
  await expect(viewport).toHaveAttribute('data-body-count', '0')
})

test('a touch drag places a hardware part too', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'this project has no touch emulation')
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'hardware.washer', fx: 0.5, fy: 0.3, pointerType: 'touch' })
  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(1)
  expect(bodies[0].op).toBe('hardware.washer')
  const [x, y] = centerParts(bodies[0].center)
  expect(Math.hypot(x, y)).toBeGreaterThan(1)
})

/**
 * The mean colour of a small patch of the rendered canvas, around a fraction of
 * its size — what the renderer actually drew there. Mirrors
 * `e2e/inspector-color-control.e2e.js`'s own helper of the same name.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 * @returns {Promise<{ r: number, g: number, b: number }>}
 */
async function sampleCanvas(page, fx, fy) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  return page.evaluate(
    ({ fx, fy }) => {
      const source = /** @type {HTMLCanvasElement} */ (document.querySelector('[data-testid="viewport-canvas"]'))
      const off = document.createElement('canvas')
      off.width = source.width
      off.height = source.height
      const ctx = off.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      ctx.drawImage(source, 0, 0)
      const radius = 4
      const cx = Math.round(source.width * fx)
      const cy = Math.round(source.height * fy)
      const { data } = ctx.getImageData(cx - radius, cy - radius, radius * 2 + 1, radius * 2 + 1)
      let r = 0
      let g = 0
      let b = 0
      const n = data.length / 4
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
      }
      return { r: r / n, g: g / n, b: b / n }
    },
    { fx, fy },
  )
}

/**
 * Grayscale-ish (channels close together) and dark enough not to be background —
 * a washer's V1 `gray`, unlike the theme's blue-biased default body colour
 * (`BODY_COLORS`, every entry has `b` well above `r`) or a bright background/grid
 * pixel (measured well above 200 per channel in this light-theme run).
 *
 * @param {{ r: number, g: number, b: number }} c
 */
const isGrayish = (c) => {
  const max = Math.max(c.r, c.g, c.b)
  const min = Math.min(c.r, c.g, c.b)
  return max - min < 25 && max < 200
}

test('a dropped Washer renders in V1 s gray, not the theme s default body colour (TODO/render-003)', async ({
  page,
}) => {
  // Zoomed in well past the default, because a ~12mm washer next to a 40mm
  // primitive's default camera framing renders as only a few pixels
  // (`TODO/VERIFY.md`'s ui-030 entry) — too few to sample reliably. Dollying
  // toward the fixed orbit target changes only how much world a screen fraction
  // covers, not which screen fraction a given drop point lands at, so the drop
  // point below is still where to sample afterward.
  for (let i = 0; i < 10; i += 1) await page.getByTestId('nav-zoom-in').click()

  await openLibrary(page)
  // Upper area, not the screen centre: at phone width the Library sheet covers
  // the lower half of this same viewport element (other specs' own convention).
  const DROP = { fx: 0.5, fy: 0.28 }
  await dragRowIntoViewport(page, { op: 'hardware.washer', ...DROP })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  // Deselect first: a freshly-dropped body is auto-selected, and a *selected*
  // recoloured body keeps its own colour with a warm emissive tint on top
  // (`TODO/ui-037`'s `OVERRIDE_HIGHLIGHT_INTENSITY`) — measured to shift a
  // neutral gray materially warmer, which would make this assertion about the
  // *unselected* recipe colour instead.
  await clickViewportAt(page, 0.05, 0.05)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')

  // The washer is a torus: its exact centre is the hole, which shows whatever
  // is behind it rather than the part's own material — sampling a small ring
  // of offsets around the drop point and taking the darkest (the material,
  // always measured well under the light-theme background here) is robust to
  // exactly where the rim lands relative to the drop point, across
  // viewports/engines, without hardcoding one fragile offset.
  const offsets = [
    [DROP.fx, DROP.fy - 0.04],
    [DROP.fx, DROP.fy + 0.04],
    [DROP.fx - 0.04, DROP.fy],
    [DROP.fx + 0.04, DROP.fy],
  ]
  const samples = []
  for (const [fx, fy] of offsets) samples.push(await sampleCanvas(page, fx, fy))
  const darkest = samples.reduce((a, b) => (a.r + a.g + a.b < b.r + b.g + b.b ? a : b))

  expect(isGrayish(darkest), `expected V1's gray, darkest sample: ${JSON.stringify(darkest)}, all: ${JSON.stringify(samples)}`).toBe(true)
})

/**
 * Click the canvas at a fraction of its size, to deselect whatever is selected.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 */
async function clickViewportAt(page, fx, fy) {
  await page.evaluate(
    ({ fx, fy }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      const x = box.left + box.width * fx
      const y = box.top + box.height * fy
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 5,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy },
  )
  await page.waitForTimeout(90)
}
