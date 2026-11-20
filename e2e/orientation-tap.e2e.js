// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { mmToCssPx, scatterTaps, seededRng } from '../bench/tap-scatter.mjs'
import { sleep } from './support/humanInput.js'

/**
 * `TODO/ui-134`, `TODO/ui-148`: a fingertip's scatter around an orientation-dial cap lands on that cap,
 * not a neighbour. Driven against `/`, at the tablet viewport (the enlarged 190 px dial) and the phone
 * viewport (a tap on the compact dial opens the large six-face picker, whose cells are the targets).
 *
 * Each round resets the camera with Home, aims at one cap's centre, scatters the tap as a finger
 * would (Gaussian, sigma 3.5 mm), then reads which view the camera snapped to. The views are
 * learned first by tapping each cap's exact centre, so no angle is hard-coded here.
 */

const VIEWS = ['top', 'bottom', 'front', 'back', 'left', 'right']
const SIGMA_PX = mmToCssPx(3.5)
const PER_CAP = 25
/**
 * Wrong-cap share allowed. Measured 4 % (6 of 150) on the 190 px dial; before the fix 22-35 %. The
 * finding aims at 2 %, which at 13 px of scatter needs caps about 54 px apart (a dial near 240 px,
 * too big for a 390 px phone). The bound is the measurement plus sampling room, not the aim.
 */
const MAX_WRONG = 0.06
/** The phone picker has no overlap and 64 px cells, so it is held to the finding's 2 % aim plus sampling room. */
const MAX_WRONG_PHONE = 0.03

/** @param {import('@playwright/test').Page} page */
const readView = (page) =>
  page.getByTestId('orientation-gizmo').evaluate((el) => `${Number(el.dataset.azimuth).toFixed(0)}/${Number(el.dataset.elevation).toFixed(0)}`)

test.describe('orientation dial taps', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name.endsWith('-laptop'), 'the touch dial layouts are tablet and phone (TODO/ui-134, TODO/ui-148)')
    // Firefox has no touch emulation here (`hasTouch` is off), so `pointer: coarse` never matches.
    test.skip(!info.project.use.hasTouch, 'the touch layout needs a coarse pointer')
  })

  test('a scattered fingertip fires the cap it aimed at', async ({ page }, info) => {
    test.setTimeout(240_000)
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
      Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
    })
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
    const gizmo = page.getByTestId('orientation-gizmo')
    await expect(gizmo).toBeVisible()

    const tap = async (x, y) => {
      if (info.project.use.hasTouch && !info.project.name.startsWith('firefox')) await page.touchscreen.tap(x, y)
      else await page.mouse.click(x, y)
      await sleep(60)
    }
    const centre = async (testid) => {
      const b = await page.getByTestId(testid).boundingBox()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }
    const home = async () => {
      const c = await centre('gizmo-view-home')
      await tap(c.x, c.y)
      await expect.poll(() => readView(page)).not.toBe('')
      await sleep(250)
    }

    const phone = info.project.name.endsWith('-phone')
    if (!phone) {
      // The dial is the enlarged touch layout: caps are 44 px.
      const box = await page.getByTestId('gizmo-view-top').boundingBox()
      expect(box.width).toBeGreaterThanOrEqual(44)
    } else {
      await expect(gizmo).toHaveAttribute('data-touch-picker', 'true')
    }
    /** Where a tap aims for a view: the dial's cap on a tablet, the picker's cell on a phone (opened by a tap on the dial). */
    const aimFor = async (view) => {
      if (!phone) return centre(`gizmo-view-${view}`)
      if (!(await page.getByTestId('gizmo-picker').isVisible())) {
        const d = await page.getByTestId('orientation-dial').boundingBox()
        await tap(d.x + d.width / 2, d.y + d.height / 2)
        await expect(page.getByTestId('gizmo-picker')).toBeVisible()
      }
      return centre(`gizmo-picker-view-${view}`)
    }

    // Learn each view's orientation by tapping its cap's exact centre.
    const expected = {}
    for (const view of VIEWS) {
      await home()
      const c = await aimFor(view)
      await tap(c.x, c.y)
      await sleep(300)
      expected[view] = await readView(page)
    }

    const rng = seededRng(134)
    let wrong = 0
    let total = 0
    const report = {}
    for (const view of VIEWS) {
      let wrongHere = 0
      for (let i = 0; i < PER_CAP; i++) {
        await home()
        const aim = await aimFor(view)
        const [p] = scatterTaps(aim, SIGMA_PX, 1, rng)
        const before = await readView(page)
        await tap(p.x, p.y)
        await sleep(300)
        const after = await readView(page)
        total++
        // A tap on the dial's rim or off it changes nothing; only a different cap counts as wrong.
        if (after !== before && after !== expected[view]) {
          wrong++
          wrongHere++
        }
      }
      report[view] = wrongHere
    }
    expect(wrong / total, `wrong-cap taps per view ${JSON.stringify(report)} of ${PER_CAP} each`).toBeLessThanOrEqual(phone ? MAX_WRONG_PHONE : MAX_WRONG)
  })

  test('every phone picker cell is the top control at its corners and centre', async ({ page }, info) => {
    test.skip(!info.project.name.endsWith('-phone') || !info.project.use.hasTouch, 'the picker is the phone touch layout (TODO/ui-148)')
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
    const d = await page.getByTestId('orientation-dial').boundingBox()
    await page.touchscreen.tap(d.x + d.width / 2, d.y + d.height / 2)
    await expect(page.getByTestId('gizmo-picker')).toBeVisible()
    for (const view of VIEWS) {
      const b = await page.getByTestId(`gizmo-picker-view-${view}`).boundingBox()
      expect(b.width, `${view} cell width`).toBeGreaterThanOrEqual(60)
      expect(b.height, `${view} cell height`).toBeGreaterThanOrEqual(60)
      for (const [fx, fy] of [[0.5, 0.5], [0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94]]) {
        const hit = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
          [b.x + b.width * fx, b.y + b.height * fy],
        )
        expect(hit, `${view} cell at ${fx},${fy}`).toBe(`gizmo-picker-view-${view}`)
      }
    }
  })

  test('the caps do not overlap at the Home orientation', async ({ page }, info) => {
    test.skip(info.project.name.endsWith('-phone'), 'the phone dial is a readout; taps go through the picker (TODO/ui-148)')
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
    const boxes = []
    for (const view of VIEWS) boxes.push(await page.getByTestId(`gizmo-view-${view}`).boundingBox())
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const d = Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2))
        // Top and Bottom (or any opposite pair) can share a centre only in an axis-on view, never at Home.
        expect(d, `${VIEWS[i]} and ${VIEWS[j]} centres`).toBeGreaterThan(30)
      }
    }
  })
})
