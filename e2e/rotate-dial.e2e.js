// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The rotate dial and snapped rotation (`TODO/ui-064`), driven against `/`, the
 * real app.
 *
 * A rotate-ring drag now draws a watchface in the ring's plane (ticks, a start
 * hand, a live hand, a sweep sector) and a digital readout. **Shift** snaps the
 * turn to 5° steps, and on **touch** the step follows drag speed. Release commits
 * exactly the displayed angle as one `transform.rotate`.
 *
 * Runs the full 3 viewport × 3 engine matrix. **Viewports**, because small
 * screens are explicitly *not* "same as desktop": there is no Shift on a phone,
 * and the readout must dodge the finger and stay on screen at 390 px.
 * **Engines**, because pointer capture on an SVG element, touch-type pointer
 * events and the gizmo drag are exactly CLAUDE.md's engine-sensitive surface.
 *
 * ## Timing, and why the step assertions are about bands
 *
 * The touch step depends on event *timestamps*. Each drag phase is dispatched
 * from one in-page `evaluate` with in-browser timers between events, not one
 * Playwright round trip per event, whose latency would swamp the pacing. The
 * spec asserts the *band* (a coarse step was seen while flinging, `0.1°` once
 * slowed and paused), never an exact angle. The exact maths, including the stall
 * decay, is pinned by `src/render/rotateSnap.spec.js` with an injected clock.
 *
 * An rAF poll records what the readout showed on every frame, so "a multiple of
 * 5 at every sampled move" means every frame actually painted, not just the
 * end state.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'rotate-dial-snapshots')

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
 * Drag a Library row into the viewport with real `PointerEvent`s, the same way
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
  return Number(raw.replace(/[°\s]/g, ''))
}

/**
 * Place one cube and leave it selected with the gizmo drawn. Kept in the upper
 * half of the viewport: at phone width a drop much lower misses the grid.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeCube(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.45, fy: 0.4 })
  await closeLibrary(page)
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
  await expect(page.getByTestId('gizmo-grab-ring-z')).toBeAttached()
  await expect(page.getByTestId('inspector-transform')).toBeVisible()
}

/**
 * Press on the Z ring and start an rAF poll recording what the dial shows.
 * The drag's state lives on `window.__ringDrag` so later phases can continue it.
 *
 * The grab is a real vertex a quarter of the way round the ring, never the
 * ring's bounding-box centre, which is the hub (see `gizmo-transform.e2e.js`).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ pointerType: 'mouse' | 'touch', shiftKey?: boolean }} options
 */
async function pressRing(page, { pointerType, shiftKey = false }) {
  await page.evaluate(
    ({ pointerType, shiftKey }) => {
      const el = document.querySelector('[data-testid="gizmo-grab-ring-z"]')
      const view = document.querySelector('[data-testid="viewport"]')
      const gizmo = document.querySelector('[data-testid="transform-gizmo"]')
      if (!el || !view || !gizmo) throw new Error('missing Z ring, viewport or gizmo')
      const rect = view.getBoundingClientRect()
      const [ox, oy] = (gizmo.getAttribute('data-origin') ?? '0,0').split(',').map(Number)
      const pairs = (el.getAttribute('points') ?? '')
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number))
      const [px, py] = pairs[Math.floor(pairs.length / 4)]
      const cx = rect.left + ox
      const cy = rect.top + oy
      const sx = rect.left + px
      const sy = rect.top + py

      /** @type {{ value: string, step: string, stepDeg: number, field: string, box: number[], degenerate: string, ticks: number }[]} */
      const samples = []
      const state = {
        el,
        pointerType,
        cx,
        cy,
        radius: Math.hypot(sx - cx, sy - cy),
        angle: Math.atan2(sy - cy, sx - cx),
        x: sx,
        y: sy,
        samples,
        polling: true,
      }
      // @ts-ignore — test-only handle
      window.__ringDrag = state
      const poll = () => {
        if (!state.polling) return
        const readout = document.querySelector('[data-testid="gizmo-dial-readout"]')
        const dial = document.querySelector('[data-testid="gizmo-dial"]')
        const field = /** @type {HTMLInputElement | null} */ (document.querySelector('[data-testid="inspector-rotation-z"]'))
        if (readout && dial) {
          const box = readout.getBoundingClientRect()
          samples.push({
            value: readout.getAttribute('data-value') ?? '',
            step: readout.getAttribute('data-step') ?? '',
            stepDeg: Number(dial.getAttribute('data-step-deg')),
            field: field?.value ?? '',
            box: [box.left - rect.left, box.top - rect.top, box.right - rect.left, box.bottom - rect.top],
            degenerate: dial.getAttribute('data-degenerate') ?? '',
            ticks: document.querySelectorAll('[data-testid^="gizmo-dial-tick-"]').length,
          })
        }
        requestAnimationFrame(poll)
      }
      requestAnimationFrame(poll)

      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 31,
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
 * Continue the drag round the hub: `sweepDeg` of screen angle in `steps` moves,
 * `intervalMs` apart, all paced in-page.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ sweepDeg: number, steps: number, intervalMs: number, shiftKey?: boolean }} phase
 */
async function sweepRing(page, { sweepDeg, steps, intervalMs, shiftKey = false }) {
  await page.evaluate(
    async ({ sweepDeg, steps, intervalMs, shiftKey }) => {
      // @ts-ignore — test-only handle
      const state = window.__ringDrag
      const perStep = ((sweepDeg / steps) * Math.PI) / 180
      for (let index = 0; index < steps; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
        state.angle += perStep
        state.x = state.cx + state.radius * Math.cos(state.angle)
        state.y = state.cy + state.radius * Math.sin(state.angle)
        state.el.dispatchEvent(
          new PointerEvent('pointermove', {
            pointerId: 31,
            pointerType: state.pointerType,
            isPrimary: true,
            button: 0,
            buttons: 1,
            clientX: state.x,
            clientY: state.y,
            shiftKey,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
      // One more frame, so the last move has been painted and polled.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    },
    { sweepDeg, steps, intervalMs, shiftKey },
  )
}

/**
 * Lift the pointer, stop polling, and return what the dial showed on each frame.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ shiftKey?: boolean }} [options]
 * @returns {Promise<{ value: string, step: string, stepDeg: number, field: string, box: number[], degenerate: string, ticks: number }[]>}
 */
async function releaseRing(page, { shiftKey = false } = {}) {
  const samples = await page.evaluate(
    ({ shiftKey }) => {
      // @ts-ignore — test-only handle
      const state = window.__ringDrag
      state.el.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerId: 31,
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

/** `+37.5°` → 37.5. @param {string} text */
const degrees = (text) => Number(text.replace(/[°+\s]/g, ''))

/** Equal as rotations about one axis: `a ≡ b (mod 360)`. @param {number} a @param {number} b */
function sameTurn(a, b, tolerance = 0.06) {
  const d = (((a - b) % 360) + 540) % 360 - 180
  return Math.abs(d) <= tolerance
}

/** Whether `deg` sits on a 5° step (to the readout's 0.1° resolution). @param {number} deg */
const onFiveDegreeStep = (deg) => Math.abs(deg / 5 - Math.round(deg / 5)) < 1e-6

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
})

test('a ring drag draws a dial and a readout, the Rotation field agrees, release commits one body and Undo is one step', async ({
  page,
}, testInfo) => {
  await placeCube(page)
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Place /)
  // No dial at rest: it exists only for the duration of a ring drag.
  await expect(page.getByTestId('gizmo-dial')).toHaveCount(0)

  await pressRing(page, { pointerType: 'mouse' })
  await sweepRing(page, { sweepDeg: 50, steps: 10, intervalMs: 16 })

  // Mid-drag: the dial is on screen, in the Z ring's colour, with its readout.
  await expect(page.getByTestId('gizmo-dial')).toBeVisible()
  await expect(page.getByTestId('gizmo-dial')).toHaveAttribute('data-axis', 'Z')
  await expect(page.getByTestId('gizmo-dial-hand')).toBeAttached()
  await expect(page.getByTestId('gizmo-dial-readout')).toBeVisible()
  // Only the ring being turned stays on screen: the other two are hidden.
  await expect(page.getByTestId('gizmo-ring-z')).toBeVisible()
  await expect(page.getByTestId('gizmo-ring-x')).toBeHidden()
  await expect(page.getByTestId('gizmo-ring-y')).toBeHidden()
  // ...and so are the translate arms.
  for (const axis of ['x', 'y', 'z']) await expect(page.getByTestId(`gizmo-arm-${axis}`)).toBeHidden()
  const readout = await page.getByTestId('gizmo-dial-readout').getAttribute('data-value')
  expect(readout).toMatch(/^[+-]\d+\.\d°$/)
  const shown = degrees(/** @type {string} */ (readout))
  // A mouse without Shift picks its step from drag speed, as a finger does
  // (`ui-066`). This sweep is brisk, so the band is not asserted exactly, only
  // that the readout tracks the 50° screen sweep to within a coarse step...
  expect(Math.abs(Math.abs(shown) - 50)).toBeLessThanOrEqual(10)
  // ...and that a step is in force, so the step line is shown on a mouse too.
  await expect(page.getByTestId('gizmo-dial-step')).toHaveCount(1)
  await expect(page.getByTestId('gizmo-dial-step')).toHaveText(/steps|fine/)
  // The Inspector's Rotation Z follows the same number, live (`ui-012`).
  expect(sameTurn(await fieldNumber(page, 'inspector-rotation-z'), shown)).toBe(true)
  // The readout pill is wholly inside the viewport.
  const view = await page.getByTestId('viewport').boundingBox()
  const pill = await page.getByTestId('gizmo-dial-readout').boundingBox()
  expect(view && pill).toBeTruthy()
  if (view && pill) {
    expect(pill.x).toBeGreaterThanOrEqual(view.x - 0.5)
    expect(pill.y).toBeGreaterThanOrEqual(view.y - 0.5)
    expect(pill.x + pill.width).toBeLessThanOrEqual(view.x + view.width + 0.5)
    expect(pill.y + pill.height).toBeLessThanOrEqual(view.y + view.height + 0.5)
  }
  await page.screenshot({ path: join(SNAPSHOT_DIR, `dial-mid-drag-${testInfo.project.name}.png`) })

  const samples = await releaseRing(page)
  expect(samples.length).toBeGreaterThan(0)
  // Seen face-on enough at the home view that the full dial was drawn.
  expect(samples.at(-1)?.degenerate).toBe('false')
  expect(samples.at(-1)?.ticks).toBe(24)
  const last = degrees(samples.at(-1)?.value ?? '')

  // Everything vanishes on release.
  await expect(page.getByTestId('gizmo-dial')).toHaveCount(0)
  // ...and the two hidden rings come back.
  await expect(page.getByTestId('gizmo-ring-x')).toBeVisible()
  await expect(page.getByTestId('gizmo-ring-y')).toBeVisible()
  await expect(page.getByTestId('gizmo-arm-x')).toBeVisible()
  // Exactly one body (`ui-012`'s load-bearing check), at the displayed angle.
  expect(await sceneBodies(page)).toHaveLength(1)
  expect(sameTurn(await fieldNumber(page, 'inspector-rotation-z'), last)).toBe(true)
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Rotate /)

  // Undo is one step: straight back to the placement, unrotated.
  await page.getByTestId('undo-button').click()
  await expect(page.getByTestId('undo-button')).toHaveAttribute('aria-label', /^Undo: Place /)
  await expect.poll(() => fieldNumber(page, 'inspector-rotation-z')).toBe(0)
  expect(await sceneBodies(page)).toHaveLength(1)
})

test('with Shift held the readout only ever shows 5° steps, and the commit is a 5° step too', async ({
  page,
}) => {
  await placeCube(page)

  await pressRing(page, { pointerType: 'mouse', shiftKey: true })
  // 3° per move: a continuous drag would show non-multiples of 5 almost every frame.
  await sweepRing(page, { sweepDeg: 63, steps: 21, intervalMs: 16, shiftKey: true })
  await expect(page.getByTestId('gizmo-dial-step')).toHaveText('5° steps')
  const samples = await releaseRing(page, { shiftKey: true })

  expect(samples.length).toBeGreaterThan(5)
  for (const sample of samples) {
    expect(onFiveDegreeStep(degrees(sample.value)), `readout ${sample.value}`).toBe(true)
    expect(sample.stepDeg).toBe(5)
  }
  const last = degrees(samples.at(-1)?.value ?? '')
  expect(Math.abs(last)).toBeGreaterThanOrEqual(55)

  const committed = await fieldNumber(page, 'inspector-rotation-z')
  expect(onFiveDegreeStep(committed)).toBe(true)
  expect(sameTurn(committed, last)).toBe(true)
  expect(await sceneBodies(page)).toHaveLength(1)
})

test('pressing and releasing Shift mid-drag snaps and unsnaps at once, without moving the pointer', async ({
  page,
}) => {
  await placeCube(page)
  await pressRing(page, { pointerType: 'mouse' })
  // 22° of sweep at ~50°/s: the 1° band (or 0.1° once paused), so not on a 5° step.
  await sweepRing(page, { sweepDeg: 22, steps: 11, intervalMs: 40 })
  const value = page.getByTestId('gizmo-dial-readout')
  const raw = degrees((await value.getAttribute('data-value')) ?? '')
  expect(onFiveDegreeStep(raw)).toBe(false)

  await page.keyboard.down('Shift')
  await expect.poll(async () => onFiveDegreeStep(degrees((await value.getAttribute('data-value')) ?? ''))).toBe(true)
  await expect(page.getByTestId('gizmo-dial-step')).toHaveText('5° steps')

  await page.keyboard.up('Shift')
  await expect.poll(async () => degrees((await value.getAttribute('data-value')) ?? '')).toBeCloseTo(raw, 1)
  await expect(page.getByTestId('gizmo-dial-step')).not.toHaveText('5° steps')

  await releaseRing(page)
  expect(sameTurn(await fieldNumber(page, 'inspector-rotation-z'), raw, 0.1)).toBe(true)
  expect(await sceneBodies(page)).toHaveLength(1)
})

// The same gesture on a finger and on a mouse: speed picks the step either way
// (`ui-066` made the mouse row match `ui-064`'s touch row).
for (const pointerType of /** @type {const} */ (['touch', 'mouse'])) {
test(`on ${pointerType}, a fast drag steps coarsely and slowing down falls to 0.1° steps, without orbiting the camera`, async ({
  page,
}, testInfo) => {
  await placeCube(page)
  const viewport = page.getByTestId('viewport')
  const cameraBefore = [
    await viewport.getAttribute('data-camera-azimuth'),
    await viewport.getAttribute('data-camera-elevation'),
  ]

  await pressRing(page, { pointerType })
  // Fling: ~15° of screen angle per 16 ms frame.
  await sweepRing(page, { sweepDeg: 120, steps: 8, intervalMs: 16 })
  // Creep: 0.2° per 40 ms.
  await sweepRing(page, { sweepDeg: 3, steps: 15, intervalMs: 40 })
  // Then rest the finger: stalling counts as slow.
  await page.waitForTimeout(200)
  await expect(page.getByTestId('gizmo-dial-step')).toHaveText('fine 0.1°')
  await page.screenshot({ path: join(SNAPSHOT_DIR, `dial-${pointerType}-fine-${testInfo.project.name}.png`) })
  const samples = await releaseRing(page)

  const coarse = samples.filter((sample) => sample.stepDeg >= 5)
  expect(coarse.length, `steps seen: ${[...new Set(samples.map((s) => s.stepDeg))].join(', ')}`).toBeGreaterThan(0)
  // Coarse first, fine last — the order a "fling, then land on it" gesture has.
  const firstCoarse = samples.findIndex((sample) => sample.stepDeg >= 5)
  const lastFine = samples.map((sample) => sample.stepDeg).lastIndexOf(0.1)
  expect(firstCoarse).toBeLessThan(lastFine)
  expect(samples.at(-1)?.step).toBe('fine 0.1°')

  // Every frame's readout was on screen: up and away from the finger, clamped
  // inside the viewport even at 390 px.
  const box = await viewport.boundingBox()
  for (const sample of samples) {
    const [left, top, right, bottom] = sample.box
    expect(left).toBeGreaterThanOrEqual(-0.5)
    expect(top).toBeGreaterThanOrEqual(-0.5)
    expect(right).toBeLessThanOrEqual((box?.width ?? 0) + 0.5)
    expect(bottom).toBeLessThanOrEqual((box?.height ?? 0) + 0.5)
  }

  // Committed at the readout's last value, one body, and the camera never moved.
  const last = degrees(samples.at(-1)?.value ?? '')
  expect(sameTurn(await fieldNumber(page, 'inspector-rotation-z'), last)).toBe(true)
  expect(await sceneBodies(page)).toHaveLength(1)
  expect([
    await viewport.getAttribute('data-camera-azimuth'),
    await viewport.getAttribute('data-camera-elevation'),
  ]).toEqual(cameraBefore)
  await expect(page.getByTestId('gizmo-dial')).toHaveCount(0)
})
}
