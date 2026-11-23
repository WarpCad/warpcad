// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { mmToCssPx, scatterTaps, seededRng } from '../bench/tap-scatter.mjs'
import { sleep } from './support/humanInput.js'
import { snapViaGizmo } from './support/snapViaGizmo.js'

/**
 * The view cube (`TODO/ui-158`), driven against `/` on every engine and viewport: the faces turned
 * toward the viewer snap to their views, the faces turned away take no pointer, **Views** reaches
 * any face (the only way off a face-on view), and the cube turns against the camera as it orbits.
 *
 * Then `TODO/ui-134` / `TODO/ui-148`'s fingertip measurement against faces instead of caps: each
 * round resets with Home, aims at a visible face's centre, scatters the tap as a finger would
 * (Gaussian, sigma 3.5 mm) and reads which view the camera snapped to.
 */

const SIX = ['top', 'bottom', 'front', 'back', 'left', 'right']
/** What the camera reads after each snap, as `az/el` rounded to whole degrees. */
const EXPECTED = { top: '-90/90', front: '-90/0', right: '0/0', home: '-45/35' }
/** The world normal of each face: a face looks at the viewer when the to-camera vector has a positive component along it. */
const NORMAL = { right: [1, 0, 0], left: [-1, 0, 0], back: [0, 1, 0], front: [0, -1, 0], top: [0, 0, 1], bottom: [0, 0, -1] }

const SIGMA_PX = mmToCssPx(3.5)
const PER_FACE = 50
/**
 * Wrong-face share allowed at tablet width, where a coarse pointer gets a 64 px cube side
 * (`TODO/ui-161`, down from 96 px). It is the phone's bound: a face is the quick target and **Views**
 * is the exact path (its cells are 68x64 px and never miss), so a fingertip that lands on the
 * neighbouring face costs one more tap, not a dead end.
 */
const MAX_WRONG_TABLET = 0.2
/**
 * Wrong-face share allowed on a phone, where the cube must stay about 96 px across to fit beside the
 * Operations toolbar. A 55 px face puts its centre 19.5 px (1.5 sigma) from each shared edge, which a
 * Gaussian finger crosses about 12 % of the time by the same Monte Carlo (`TODO/OWNER.md`, the ui-158
 * assumption). The Views grid is the precise path there: its 68x64 px cells, gap-free, are checked above.
 */
const MAX_WRONG_PHONE = 0.2

/** @param {import('@playwright/test').Page} page */
const readView = (page) =>
  page.getByTestId('orientation-gizmo').evaluate((el) => `${Number(el.dataset.azimuth).toFixed(0)}/${Number(el.dataset.elevation).toFixed(0)}`)

/** @param {import('@playwright/test').Page} page @returns {Promise<string[]>} */
const facingSet = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="gizmo-view-"][data-facing="true"]')].map((el) => el.getAttribute('data-testid')?.slice('gizmo-view-'.length) ?? '').sort(),
  )

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} testid
 */
async function centre(page, testid) {
  // A face's box is the bounding box of its projected parallelogram, whose centre is the face's centre.
  const b = await page.getByTestId(testid).boundingBox()
  if (!b) throw new Error(`${testid} has no box`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** @param {import('@playwright/test').Page} page @param {number} x @param {number} y */
const hitAt = (page, x, y) => page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('[data-testid]')?.getAttribute('data-testid') ?? null, [x, y])

/** @param {import('@playwright/test').TestInfo} info */
const touchTaps = (info) => !!info.project.use.hasTouch && !info.project.name.startsWith('firefox')

test.describe('view cube', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
      Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
    })
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
    await expect(page.getByTestId('view-cube')).toBeVisible()
  })

  test('at Home each visible face snaps to its view, and the three turned away take no pointer', async ({ page }, info) => {
    const tap = async (/** @type {{x: number, y: number}} */ p) => {
      if (touchTaps(info)) await page.touchscreen.tap(p.x, p.y)
      else await page.mouse.click(p.x, p.y)
    }
    await snapViaGizmo(page, 'home')
    await expect.poll(() => readView(page)).toBe(EXPECTED.home)
    await expect.poll(() => facingSet(page)).toEqual(['front', 'right', 'top'])

    for (const view of ['bottom', 'back', 'left']) {
      const face = page.getByTestId(`gizmo-view-${view}`)
      await expect(face).toHaveAttribute('aria-hidden', 'true')
      await expect(face).toBeHidden()
      expect(await face.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
    }

    for (const view of ['top', 'front', 'right']) {
      await snapViaGizmo(page, 'home')
      await expect.poll(() => readView(page)).toBe(EXPECTED.home)
      const c = await centre(page, `gizmo-view-${view}`)
      expect(await hitAt(page, c.x, c.y), `${view} face centre`).toBe(`gizmo-view-${view}`)
      await tap(c)
      await expect.poll(() => readView(page), { message: view }).toBe(EXPECTED[view])
      // The cube turns so the snapped face looks at the viewer square-on, and only it shows.
      await expect.poll(() => facingSet(page)).toEqual([view])
    }
  })

  test('each face prints its name and signed axis upright, inside its face, after a snap to Top, Front and Right (TODO/ui-162)', async ({ page }) => {
    const WANT = { top: ['TOP', '+Z'], front: ['FRONT', '−Y'], right: ['RIGHT', '+X'] }
    for (const [view, [name, axis]] of Object.entries(WANT)) {
      await snapViaGizmo(page, view)
      await expect.poll(() => readView(page)).toBe(EXPECTED[view])
      await expect.poll(() => facingSet(page)).toEqual([view])
      const face = page.getByTestId(`gizmo-view-${view}`)
      await expect(face.locator('.gizmo__face-name')).toHaveText(name)
      await expect(face.locator('.gizmo__face-axis')).toHaveText(axis)
      // Face-on, the matrix is the identity: an unmirrored label's box is unrotated and the name sits
      // above the axis. Layout widths ignore the transform, so they say whether the text fits.
      const m = await face.evaluate((el) => {
        const side = el.clientWidth
        const n = /** @type {HTMLElement} */ (el.querySelector('.gizmo__face-name'))
        const a = /** @type {HTMLElement} */ (el.querySelector('.gizmo__face-axis'))
        const fr = el.getBoundingClientRect()
        const nr = n.getBoundingClientRect()
        const ar = a.getBoundingClientRect()
        return {
          side,
          nameFont: parseFloat(getComputedStyle(n).fontSize),
          nameWidth: n.scrollWidth,
          nameAboveAxis: nr.bottom <= ar.top + 1,
          inside: nr.left >= fr.left - 0.5 && nr.right <= fr.right + 0.5 && ar.left >= fr.left - 0.5 && ar.right <= fr.right + 0.5 && ar.bottom <= fr.bottom + 0.5 && nr.top >= fr.top - 0.5,
          tall: nr.height > 0 && ar.height > 0,
        }
      })
      expect(m.tall, `${view} label has a box`).toBe(true)
      expect(m.nameAboveAxis, `${view} name sits above its axis`).toBe(true)
      expect(m.inside, `${view} label stays inside its face (${JSON.stringify(m)})`).toBe(true)
      expect(m.nameWidth, `${view} name fits in ${m.side}px at ${m.nameFont}px (${JSON.stringify(m)})`).toBeLessThanOrEqual(m.side - 4)
      expect(m.nameFont, 'name stays legible').toBeGreaterThanOrEqual(8)
    }
  })

  test('a nearly edge-on face keeps its label inside it, and a hidden one takes no tap (TODO/ui-162, TODO/ui-158)', async ({ page }) => {
    await snapViaGizmo(page, 'front')
    // Orbit to 85 degrees elevation with nav steps is slow; set the view through the camera hook the
    // chrome uses: step the elevation up so Top is a thin sliver while Front is still showing.
    for (let i = 0; i < 5; i++) await page.getByTestId('nav-step-up').click()
    await expect.poll(() => facingSet(page)).toContain('top')
    const r = await page.getByTestId('gizmo-view-top').evaluate((el) => {
      const f = el.getBoundingClientRect()
      const l = /** @type {HTMLElement} */ (el.querySelector('.gizmo__face-label')).getBoundingClientRect()
      return { overflow: getComputedStyle(el).overflow, outside: l.top < f.top - 1 || l.bottom > f.bottom + 1 || l.left < f.left - 1 || l.right > f.right + 1 }
    })
    expect(r.overflow).toBe('hidden')
    expect(r.outside, 'label rect within the squashed face').toBe(false)
    // A face turned away still takes no pointer, label or not.
    for (const view of ['bottom', 'back', 'left']) {
      expect(await page.getByTestId(`gizmo-view-${view}`).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
    }
  })

  test('from face-on Front, Views reaches Top, and Home comes back', async ({ page }) => {
    await snapViaGizmo(page, 'front')
    await expect.poll(() => readView(page)).toBe(EXPECTED.front)
    await expect.poll(() => facingSet(page)).toEqual(['front'])
    // Top is edge-on now: zero area, and no pointer.
    await expect(page.getByTestId('gizmo-view-top')).toBeHidden()

    await page.getByTestId('gizmo-views').click()
    await expect(page.getByTestId('gizmo-picker')).toBeVisible()
    await page.getByTestId('gizmo-picker-view-top').click()
    await expect(page.getByTestId('gizmo-picker')).toHaveCount(0)
    await expect.poll(() => readView(page)).toBe(EXPECTED.top)
    await expect.poll(() => facingSet(page)).toEqual(['top'])

    await page.getByTestId('gizmo-view-home').click()
    await expect.poll(() => readView(page)).toBe(EXPECTED.home)
    await expect.poll(() => facingSet(page)).toEqual(['front', 'right', 'top'])
  })

  test('orbiting the view turns the cube against the camera', async ({ page }) => {
    await snapViaGizmo(page, 'home')
    await expect.poll(() => facingSet(page)).toEqual(['front', 'right', 'top'])
    const vp = await page.getByTestId('viewport').boundingBox()
    if (!vp) throw new Error('viewport has no box')
    const start = { x: vp.x + vp.width / 2, y: vp.y + vp.height / 2 }
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [start.x, start.y])).toBe('CANVAS')

    // Drag the empty canvas sideways until the camera has swung far enough round for Front to turn away.
    let set = await facingSet(page)
    for (let i = 0; i < 12 && set.includes('front'); i++) {
      await page.mouse.move(start.x - 60, start.y)
      await page.mouse.down()
      await page.mouse.move(start.x + 60, start.y, { steps: 8 })
      await page.mouse.up()
      await sleep(50)
      set = await facingSet(page)
    }
    expect(set, 'an orbit changed which faces show').not.toEqual(['front', 'right', 'top'])

    // Whatever the camera now reads, the faces marked facing are exactly those the camera can see.
    const { az, el } = await page.getByTestId('orientation-gizmo').evaluate((g) => ({ az: Number(g.dataset.azimuth), el: Number(g.dataset.elevation) }))
    const rad = Math.PI / 180
    const toCam = [Math.cos(el * rad) * Math.cos(az * rad), Math.cos(el * rad) * Math.sin(az * rad), Math.sin(el * rad)]
    const expected = SIX.filter((v) => NORMAL[v].reduce((s, n, k) => s + n * toCam[k], 0) > 1e-3).sort()
    await expect.poll(() => facingSet(page)).toEqual(expected)
  })

  test('the Views grid has a large cell per face, each the top control at its corners and centre', async ({ page }) => {
    await page.getByTestId('gizmo-views').click()
    await expect(page.getByTestId('gizmo-picker')).toBeVisible()
    for (const view of SIX) {
      const b = await page.getByTestId(`gizmo-picker-view-${view}`).boundingBox()
      if (!b) throw new Error(`${view} cell has no box`)
      expect(b.width, `${view} cell width`).toBeGreaterThanOrEqual(60)
      expect(b.height, `${view} cell height`).toBeGreaterThanOrEqual(60)
      for (const [fx, fy] of [[0.5, 0.5], [0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94]]) {
        expect(await hitAt(page, b.x + b.width * fx, b.y + b.height * fy), `${view} cell at ${fx},${fy}`).toBe(`gizmo-picker-view-${view}`)
      }
    }
    await page.getByTestId('gizmo-picker-close').click()
    await expect(page.getByTestId('gizmo-picker')).toHaveCount(0)
  })

  test('the gizmo block stays inside the box the axis triad took', async ({ page }, info) => {
    const gizmo = page.getByTestId('orientation-gizmo')
    const tier = await gizmo.getAttribute('data-chrome-tier')
    const width = page.viewportSize()?.width ?? 0
    // The old footprints (`stores/panelLayout.js`): full 130×177, compact (and phone) 106×138, and
    // the ui-134 touch dial at tablet width, 190 px plus the card's padding and border.
    const limit = touchTaps(info) && width >= 600 ? { w: 130, h: 180 } : tier === 'full' && width > 480 ? { w: 130, h: 177 } : { w: 106, h: 138 }
    const b = await gizmo.boundingBox()
    if (!b) throw new Error('gizmo has no box')
    expect(b.width).toBeLessThanOrEqual(limit.w)
    expect(b.height).toBeLessThanOrEqual(limit.h)
    // A corner-on face stays a fingertip across its short diagonal (Top's box height at Home).
    if (touchTaps(info)) {
      const top = await page.getByTestId('gizmo-view-top').boundingBox()
      expect(top?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
  })

  test('on a landscape iPad the gizmo block stays small and clear of the Operations toolbar (ui-161)', async ({ page }, info) => {
    test.skip(!info.project.name.endsWith('-tablet'), 'the landscape iPad case runs in the tablet project')
    await page.setViewportSize({ width: 1180, height: 820 })
    const gizmo = page.getByTestId('orientation-gizmo')
    await expect(gizmo).toBeVisible()
    await sleep(300)
    const b = await gizmo.boundingBox()
    if (!b) throw new Error('gizmo has no box')
    expect(b.width, 'gizmo block width').toBeLessThanOrEqual(130)
    expect(b.height, 'gizmo block height').toBeLessThanOrEqual(180)
    const t = await page.getByTestId('operations-toolbar').boundingBox()
    if (t) {
      const meets = b.x < t.x + t.width && t.x < b.x + b.width && b.y < t.y + t.height && t.y < b.y + b.height
      expect(meets, 'the gizmo meets the Operations toolbar').toBe(false)
    }
  })

  test('a scattered fingertip fires the face it aimed at', async ({ page }, info) => {
    test.skip(!touchTaps(info), 'a fingertip needs touch emulation (Firefox has none here, laptop is a mouse)')
    test.setTimeout(300_000)
    const phone = info.project.name.endsWith('-phone')
    const home = async () => {
      const c = await centre(page, 'gizmo-view-home')
      await page.touchscreen.tap(c.x, c.y)
      await expect.poll(() => readView(page)).toBe(EXPECTED.home)
      await expect.poll(() => facingSet(page)).toEqual(['front', 'right', 'top'])
    }

    const rng = seededRng(158)
    let wrong = 0
    let total = 0
    /** @type {Record<string, number>} */
    const report = {}
    for (const view of ['top', 'front', 'right']) {
      let wrongHere = 0
      for (let i = 0; i < PER_FACE; i++) {
        await home()
        const aim = await centre(page, `gizmo-view-${view}`)
        const [p] = scatterTaps(aim, SIGMA_PX, 1, rng)
        await page.touchscreen.tap(p.x, p.y)
        await sleep(120)
        const after = await readView(page)
        total++
        // A tap off the cube changes nothing; only a different face counts as wrong.
        if (after !== EXPECTED.home && after !== EXPECTED[view]) {
          wrong++
          wrongHere++
        }
      }
      report[view] = wrongHere
    }
    const rate = wrong / total
    await info.attach('wrong-face-rate', { body: JSON.stringify({ rate, report, perFace: PER_FACE }), contentType: 'application/json' })
    expect(rate, `wrong-face taps per face ${JSON.stringify(report)} of ${PER_FACE} each`).toBeLessThanOrEqual(phone ? MAX_WRONG_PHONE : MAX_WRONG_TABLET)
  })
})
