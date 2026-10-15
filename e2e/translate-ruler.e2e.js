// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The translate ruler and stepped moves (`TODO/ui-065`), driven against `/`, the
 * real app.
 *
 * A translate-arm drag now draws a ruler along the arm from where the drag
 * began (ticks, a start mark, a live marker, a span) and a distance readout.
 * **Shift** snaps to 1 mm on any pointer, and **drag speed** picks the step on
 * every pointer type — a mouse as much as a finger. Release commits exactly the
 * displayed distance as one `transform.translate`.
 *
 * Runs the full 3 viewport × 3 engine matrix. **Viewports**, because at 390 px
 * the ruler is short and the readout has to dodge the finger and stay on
 * screen. **Engines**, because pointer capture on an SVG element and touch-type
 * pointer events are CLAUDE.md's engine-sensitive surface.
 *
 * ## Timing, and why the step assertions are about bands
 *
 * As in `rotate-dial.e2e.js`: each drag phase is dispatched from one in-page
 * `evaluate` with in-browser timers between events, and the spec asserts the
 * *band* (a coarse step while moving fast, `0.1 mm` once slowed and paused),
 * never an exact distance. The exact maths, stall decay included, is pinned by
 * `src/render/dragSteps.spec.js` and `translateSnap.spec.js` with an injected
 * clock. An rAF poll records the readout on every painted frame.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'translate-ruler-snapshots')

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

/**
 * Put the Library away so the Inspector can claim the phone's single sheet slot.
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
 * Drag a Library row into the viewport with real `PointerEvent`s, as
 * `gizmo-transform.e2e.js` does, so one helper drives every engine.
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
      /** @param {EventTarget} target @param {string} type @param {number} x @param {number} y */
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
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({ id: node.getAttribute('data-body-id') ?? '' })),
  )
}

/**
 * A Transform field's number, unit suffix stripped.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 */
async function fieldNumber(page, testId) {
  const raw = await page.getByTestId(testId).inputValue()
  return Number(raw.replace(/[°\s]|mm/g, ''))
}

/**
 * Place one cube and leave it selected with the gizmo drawn.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeCube(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.45, fy: 0.4 })
  await closeLibrary(page)
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
  await expect(page.getByTestId('gizmo-grab-arm-x')).toBeAttached()
  await expect(page.getByTestId('inspector-transform')).toBeVisible()
}

/**
 * @typedef {object} RulerSample
 * @property {string} value The readout's `data-value`, e.g. `+12.5 mm`.
 * @property {string} step The readout's `data-step`.
 * @property {number} stepMm The ruler's `data-step-mm`.
 * @property {string} field The Position X field's text.
 * @property {number[]} box The readout's box, viewport-relative `[left, top, right, bottom]`.
 * @property {string} degenerate
 * @property {number} ticks
 */

/**
 * Press on the X arm 70% of the way out and start an rAF poll recording what
 * the ruler shows. The drag's state lives on `window.__armDrag`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ pointerType: 'mouse' | 'touch', shiftKey?: boolean }} options
 */
async function pressArm(page, { pointerType, shiftKey = false }) {
  await page.evaluate(
    ({ pointerType, shiftKey }) => {
      const el = document.querySelector('[data-testid="gizmo-grab-arm-x"]')
      const view = document.querySelector('[data-testid="viewport"]')
      if (!el || !view) throw new Error('missing X arm or viewport')
      const rect = view.getBoundingClientRect()
      const x1 = Number(el.getAttribute('x1'))
      const y1 = Number(el.getAttribute('y1'))
      const x2 = Number(el.getAttribute('x2'))
      const y2 = Number(el.getAttribute('y2'))
      const length = Math.hypot(x2 - x1, y2 - y1) || 1
      // The grab line runs from part-way out to the tip, so this is the arm's own direction.
      const ux = (x2 - x1) / length
      const uy = (y2 - y1) / length
      const sx = rect.left + x1 + (x2 - x1) * 0.5
      const sy = rect.top + y1 + (y2 - y1) * 0.5

      /** @type {any[]} */
      const samples = []
      const state = { el, pointerType, ux, uy, x: sx, y: sy, samples, polling: true }
      // @ts-ignore — test-only handle
      window.__armDrag = state
      const poll = () => {
        if (!state.polling) return
        const readout = document.querySelector('[data-testid="gizmo-ruler-readout"]')
        const ruler = document.querySelector('[data-testid="gizmo-ruler"]')
        const field = /** @type {HTMLInputElement | null} */ (document.querySelector('[data-testid="inspector-position-x"]'))
        if (readout && ruler) {
          const box = readout.getBoundingClientRect()
          samples.push({
            value: readout.getAttribute('data-value') ?? '',
            step: readout.getAttribute('data-step') ?? '',
            stepMm: Number(ruler.getAttribute('data-step-mm')),
            field: field?.value ?? '',
            box: [box.left - rect.left, box.top - rect.top, box.right - rect.left, box.bottom - rect.top],
            degenerate: ruler.getAttribute('data-degenerate') ?? '',
            ticks: document.querySelectorAll('[data-testid^="gizmo-ruler-tick-"]').length,
          })
        }
        requestAnimationFrame(poll)
      }
      requestAnimationFrame(poll)

      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 41,
          pointerType,
          isPrimary: true,
          button: 0,
          buttons: 1,
          clientX: sx,
          clientY: sy,
          shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { pointerType, shiftKey },
  )
}

/**
 * Continue the drag along the arm: `px` of travel (negative is toward the hub)
 * in `steps` moves, `intervalMs` apart, paced in-page. Each move also wobbles a
 * little across the arm, which must not count.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ px: number, steps: number, intervalMs: number, shiftKey?: boolean }} phase
 */
async function slideArm(page, { px, steps, intervalMs, shiftKey = false }) {
  await page.evaluate(
    async ({ px, steps, intervalMs, shiftKey }) => {
      // @ts-ignore — test-only handle
      const state = window.__armDrag
      for (let index = 0; index < steps; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
        state.x += (state.ux * px) / steps
        state.y += (state.uy * px) / steps
        const wobble = index % 2 === 0 ? 1.5 : -1.5
        state.el.dispatchEvent(
          new PointerEvent('pointermove', {
            pointerId: 41,
            pointerType: state.pointerType,
            isPrimary: true,
            button: 0,
            buttons: 1,
            clientX: state.x - state.uy * wobble,
            clientY: state.y + state.ux * wobble,
            shiftKey,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    },
    { px, steps, intervalMs, shiftKey },
  )
}

/**
 * Lift the pointer, stop polling, and return what the ruler showed each frame.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ shiftKey?: boolean }} [options]
 * @returns {Promise<RulerSample[]>}
 */
async function releaseArm(page, { shiftKey = false } = {}) {
  const samples = await page.evaluate(
    ({ shiftKey }) => {
      // @ts-ignore — test-only handle
      const state = window.__armDrag
      state.el.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerId: 41,
          pointerType: state.pointerType,
          isPrimary: true,
          button: 0,
          buttons: 0,
          clientX: state.x,
          clientY: state.y,
          shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      )
      state.polling = false
      return state.samples
    },
    { shiftKey },
  )
  await page.waitForTimeout(150)
  return samples
}

/** `+12.5 mm` → 12.5. @param {string} text */
const millimetres = (text) => Number(text.replace(/mm|[+\s]/g, ''))

/** Whether a value sits on a whole millimetre, to the readout's 0.1 mm resolution. @param {number} mm */
const onWholeMm = (mm) => Math.abs(mm - Math.round(mm)) < 1e-6

/**
 * Assert a readout box lies inside the viewport.
 *
 * @param {number[]} box `[left, top, right, bottom]`, viewport-relative.
 * @param {{ width: number, height: number } | null} view
 */
function expectInside(box, view) {
  const [left, top, right, bottom] = box
  expect(left).toBeGreaterThanOrEqual(-0.5)
  expect(top).toBeGreaterThanOrEqual(-0.5)
  expect(right).toBeLessThanOrEqual((view?.width ?? 0) + 0.5)
  expect(bottom).toBeLessThanOrEqual((view?.height ?? 0) + 0.5)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
})

test('an arm drag draws a ruler and a readout, Position X agrees, release commits one body and Undo is one step', async ({
  page,
}, testInfo) => {
  await placeCube(page)
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Place /)
  const startX = await fieldNumber(page, 'inspector-position-x')
  // No ruler at rest: it exists only for the duration of an arm drag.
  await expect(page.getByTestId('gizmo-ruler')).toHaveCount(0)

  await pressArm(page, { pointerType: 'mouse' })
  await slideArm(page, { px: 60, steps: 12, intervalMs: 16 })
  // Rest, so the step settles to fine and the readout tracks the pointer.
  await page.waitForTimeout(200)

  // Mid-drag: the ruler is on screen, in the X arm's colour, with its parts.
  const ruler = page.getByTestId('gizmo-ruler')
  await expect(ruler).toBeVisible()
  await expect(ruler).toHaveAttribute('data-axis', 'X')
  await expect(ruler).toHaveAttribute('data-degenerate', 'false')
  await expect(page.getByTestId('gizmo-ruler-start')).toBeAttached()
  await expect(page.getByTestId('gizmo-ruler-marker')).toBeAttached()
  await expect(page.getByTestId('gizmo-ruler-span')).toBeAttached()
  expect(await page.locator('[data-testid^="gizmo-ruler-tick-"]').count()).toBeGreaterThan(2)
  await expect(page.getByTestId('gizmo-ruler-readout')).toBeVisible()
  await expect(page.getByTestId('gizmo-ruler-step')).toHaveText('fine 0.1 mm')

  // One thing at a time: the dragged arm stays, the other arms and every ring hide.
  await expect(page.getByTestId('gizmo-arm-x')).toBeVisible()
  for (const axis of ['y', 'z']) await expect(page.getByTestId(`gizmo-arm-${axis}`)).toBeHidden()
  for (const axis of ['x', 'y', 'z']) await expect(page.getByTestId(`gizmo-ring-${axis}`)).toBeHidden()

  const value = await page.getByTestId('gizmo-ruler-readout').getAttribute('data-value')
  expect(value).toMatch(/^[+-]\d+\.\d mm$/)
  const shown = millimetres(/** @type {string} */ (value))
  // Dragged toward the tip: a positive distance (the sign the body moves by).
  expect(shown).toBeGreaterThan(0)
  // The Inspector's Position X follows the same number, live (`ui-012`).
  expect(await fieldNumber(page, 'inspector-position-x')).toBeCloseTo(startX + shown, 1)
  // The readout pill is wholly inside the viewport.
  const view = await page.getByTestId('viewport').boundingBox()
  const pill = await page.getByTestId('gizmo-ruler-readout').boundingBox()
  expect(view && pill).toBeTruthy()
  if (view && pill) {
    expectInside([pill.x - view.x, pill.y - view.y, pill.x - view.x + pill.width, pill.y - view.y + pill.height], view)
  }
  await page.screenshot({ path: join(SNAPSHOT_DIR, `ruler-mid-drag-${testInfo.project.name}.png`) })

  const samples = await releaseArm(page)
  expect(samples.length).toBeGreaterThan(0)
  const last = millimetres(samples.at(-1)?.value ?? '')

  // Everything vanishes on release, and the hidden handles come back.
  await expect(page.getByTestId('gizmo-ruler')).toHaveCount(0)
  for (const axis of ['x', 'y', 'z']) await expect(page.getByTestId(`gizmo-ring-${axis}`)).toBeVisible()
  await expect(page.getByTestId('gizmo-arm-y')).toBeVisible()
  // Exactly one body (`ui-012`'s load-bearing check), at the displayed distance.
  expect(await sceneBodies(page)).toHaveLength(1)
  expect(await fieldNumber(page, 'inspector-position-x')).toBeCloseTo(startX + last, 1)
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Move /)

  // Undo is one step: straight back to the placement, where it started.
  await page.getByTestId('undo-button').click()
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Place /)
  await expect.poll(() => fieldNumber(page, 'inspector-position-x')).toBeCloseTo(startX, 1)
  expect(await sceneBodies(page)).toHaveLength(1)
})

test('with Shift held the readout only ever shows whole millimetres, and so does the commit', async ({ page }) => {
  await placeCube(page)
  const startX = await fieldNumber(page, 'inspector-position-x')

  await pressArm(page, { pointerType: 'mouse', shiftKey: true })
  // 0.7 px per move, moving fast: a 1 mm snap must win over both the fine and the coarse speed steps.
  await slideArm(page, { px: 30, steps: 6, intervalMs: 16, shiftKey: true })
  await slideArm(page, { px: 14, steps: 20, intervalMs: 16, shiftKey: true })
  await expect(page.getByTestId('gizmo-ruler-step')).toHaveText('1 mm steps')
  const samples = await releaseArm(page, { shiftKey: true })

  expect(samples.length).toBeGreaterThan(5)
  for (const sample of samples) {
    expect(onWholeMm(millimetres(sample.value)), `readout ${sample.value}`).toBe(true)
    expect(sample.stepMm).toBe(1)
  }
  const last = millimetres(samples.at(-1)?.value ?? '')
  expect(Math.abs(last)).toBeGreaterThanOrEqual(1)

  const moved = (await fieldNumber(page, 'inspector-position-x')) - startX
  expect(moved).toBeCloseTo(last, 1)
  expect(Math.abs(moved - Math.round(moved))).toBeLessThan(0.011)
  expect(await sceneBodies(page)).toHaveLength(1)
})

test('pressing and releasing Shift mid-drag snaps and unsnaps at once, without moving the pointer', async ({ page }) => {
  await placeCube(page)
  await pressArm(page, { pointerType: 'mouse' })
  // 0.35 px a move: lands between whole millimetres almost anywhere.
  await slideArm(page, { px: 23.3, steps: 12, intervalMs: 40 })
  await page.waitForTimeout(200)
  const value = page.getByTestId('gizmo-ruler-readout')
  await expect(page.getByTestId('gizmo-ruler-step')).toHaveText('fine 0.1 mm')
  const raw = millimetres((await value.getAttribute('data-value')) ?? '')

  await page.keyboard.down('Shift')
  await expect.poll(async () => onWholeMm(millimetres((await value.getAttribute('data-value')) ?? ''))).toBe(true)
  await expect(page.getByTestId('gizmo-ruler-step')).toHaveText('1 mm steps')

  await page.keyboard.up('Shift')
  await expect.poll(async () => millimetres((await value.getAttribute('data-value')) ?? '')).toBeCloseTo(raw, 1)
  await expect(page.getByTestId('gizmo-ruler-step')).toHaveText('fine 0.1 mm')

  await releaseArm(page)
  expect(await sceneBodies(page)).toHaveLength(1)
})

for (const pointerType of /** @type {const} */ (['mouse', 'touch'])) {
  test(`with a ${pointerType}, a fast drag steps coarsely and slowing down falls to 0.1 mm, without orbiting the camera`, async ({
    page,
  }, testInfo) => {
    await placeCube(page)
    const viewport = page.getByTestId('viewport')
    const startX = await fieldNumber(page, 'inspector-position-x')
    const cameraBefore = [
      await viewport.getAttribute('data-camera-azimuth'),
      await viewport.getAttribute('data-camera-elevation'),
    ]

    await pressArm(page, { pointerType })
    // Fling: 16 px per 16 ms frame, about 1000 px/s along the arm.
    await slideArm(page, { px: 160, steps: 10, intervalMs: 16 })
    // Creep: half a pixel per 40 ms.
    await slideArm(page, { px: 7.5, steps: 15, intervalMs: 40 })
    // Then rest: stalling counts as slow.
    await page.waitForTimeout(200)
    await expect(page.getByTestId('gizmo-ruler-step')).toHaveText('fine 0.1 mm')
    await page.screenshot({ path: join(SNAPSHOT_DIR, `ruler-${pointerType}-fine-${testInfo.project.name}.png`) })
    const samples = await releaseArm(page)

    const steps = [...new Set(samples.map((sample) => sample.stepMm))]
    const firstCoarse = samples.findIndex((sample) => sample.stepMm >= 5)
    expect(firstCoarse, `steps seen: ${steps.join(', ')}`).toBeGreaterThanOrEqual(0)
    // Coarse first, fine last: the order a "fling, then land on it" gesture has.
    const lastFine = samples.map((sample) => sample.stepMm).lastIndexOf(0.1)
    expect(firstCoarse).toBeLessThan(lastFine)
    expect(samples.at(-1)?.step).toBe('fine 0.1 mm')

    // Every frame's readout was on screen, clamped inside the viewport even at 390 px.
    const box = await viewport.boundingBox()
    for (const sample of samples) expectInside(sample.box, box)

    // Committed at the readout's last value, one body, and the camera never moved.
    const last = millimetres(samples.at(-1)?.value ?? '')
    expect((await fieldNumber(page, 'inspector-position-x')) - startX).toBeCloseTo(last, 1)
    expect(await sceneBodies(page)).toHaveLength(1)
    expect([
      await viewport.getAttribute('data-camera-azimuth'),
      await viewport.getAttribute('data-camera-elevation'),
    ]).toEqual(cameraBefore)
    await expect(page.getByTestId('gizmo-ruler')).toHaveCount(0)
  })
}
