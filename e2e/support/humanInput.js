// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect } from '@playwright/test'

/**
 * Human-paced pointer helpers for `*.e2e.js` specs that drive the Library and the viewport
 * (lifted from `user-library.e2e.js`, `TODO/ui-055`): trusted CDP touch where the project is
 * Chromium at phone/tablet width, a real wobbling mouse everywhere else, and a hit test at
 * every press so a covered control fails the spec instead of passing a synthetic event.
 */

/** @param {import('@playwright/test').TestInfo} info */
export const isPhone = (info) => info.project.name.endsWith('-phone')
/** @param {import('@playwright/test').TestInfo} info */
export const usesTrustedTouch = (info) => info.project.name.startsWith('chromium') && !info.project.name.endsWith('-laptop')

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const wobble = (n) => (Math.random() - 0.5) * n

/**
 * Pointer helpers bound to one page: real mouse, or trusted CDP touch where the project has it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} info
 */
export async function pointer(page, info) {
  const cdp = usesTrustedTouch(info) ? await page.context().newCDPSession(page) : null
  const touchTap = info.project.use.hasTouch && !info.project.name.startsWith('firefox')

  /** The element under (x, y) must be (inside) the target — the hit test a synthetic event skips. */
  async function expectHit(x, y, testid) {
    const hit = await page.evaluate(
      ([px, py, id]) => {
        const el = document.elementFromPoint(px, py)
        return { ok: !!el && !!el.closest(`[data-testid="${id}"]`), what: el ? `${el.tagName}[${el.getAttribute('data-testid') ?? ''}]` : 'nothing' }
      },
      [x, y, testid],
    )
    expect(hit.ok, `${testid} at ${Math.round(x)},${Math.round(y)} is covered by ${hit.what}`).toBe(true)
  }

  /**
   * Scroll only the target's nearest scroller (as a finger would) so it sits in the upper part of its sheet (clear of any tab stacked over the bottom), and return its centre.
   * @param {import('@playwright/test').Locator} locator
   */
  async function centreOf(locator) {
    await locator.evaluate((el) => {
      let a = el.parentElement
      while (a && !(a.scrollHeight > a.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(a).overflowY))) a = a.parentElement
      if (!a) return
      const er = el.getBoundingClientRect()
      const ar = a.getBoundingClientRect()
      a.scrollTop += er.top + er.height / 2 - (ar.top + ar.height * 0.35)
    })
    await sleep(80)
    const b = await locator.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    })
    return { x: b.x + b.width / 2 + wobble(Math.min(6, b.width / 3)), y: b.y + b.height / 2 + wobble(Math.min(6, b.height / 3)) }
  }

  /** @param {import('@playwright/test').Locator} locator */
  async function press(locator) {
    const testid = await locator.getAttribute('data-testid')
    const { x, y } = await centreOf(locator)
    await expectHit(x, y, String(testid))
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
      await sleep(60)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } else if (touchTap) {
      await page.touchscreen.tap(x, y)
    } else {
      await page.mouse.move(x - 12, y - 6, { steps: 4 })
      await page.mouse.move(x, y, { steps: 3 })
      await page.mouse.down()
      await sleep(50)
      await page.mouse.up()
    }
    await sleep(160)
  }

  /**
   * Drag a Library row to (ex, ey): press, glide with wobble, hold, release.
   * @param {import('@playwright/test').Locator} row
   */
  async function dragRow(row, ex, ey) {
    const testid = await row.getAttribute('data-testid')
    const start = await centreOf(row)
    await expectHit(start.x, start.y, String(testid))
    const steps = 22
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 1 }] })
      await sleep(110)
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: start.x + (ex - start.x) * t + (i < steps ? wobble(3) : 0), y: start.y + (ey - start.y) * t + (i < steps ? wobble(3) : 0), id: 1 }],
        })
        await sleep(14)
      }
      await sleep(110)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } else {
      await page.mouse.move(start.x, start.y, { steps: 3 })
      await page.mouse.down()
      await sleep(90)
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps
        await page.mouse.move(start.x + (ex - start.x) * t + (i < steps ? wobble(3) : 0), start.y + (ey - start.y) * t + (i < steps ? wobble(3) : 0))
        await sleep(12)
      }
      await sleep(110)
      await page.mouse.up()
    }
    await sleep(350)
  }

  return { press, dragRow }
}

/** @param {import('@playwright/test').Page} page @param {number} fx @param {number} fy */
export async function viewportPoint(page, fx, fy) {
  const box = await page.getByTestId('viewport-canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  return { x: box.x + box.width * fx, y: box.y + box.height * fy }
}

/** @param {import('@playwright/test').Page} page */
export async function openLibrary(page, press) {
  const tab = page.getByTestId('library-tab')
  if ((await tab.isVisible()) && (await page.getByTestId('library-panel').getAttribute('data-open')) !== 'true') {
    await press(tab)
    await expect(page.getByTestId('library-panel')).toHaveAttribute('data-open', 'true')
  }
}

/** @param {import('@playwright/test').Page} page */
export async function closeLibrary(page, press) {
  const tab = page.getByTestId('library-tab')
  if ((await tab.isVisible()) && (await page.getByTestId('library-panel').getAttribute('data-open')) === 'true') {
    await press(tab)
    await expect(page.getByTestId('library-panel')).toHaveAttribute('data-open', 'false')
  }
}

/** @param {import('@playwright/test').Page} page */
export const sceneBodies = (page) =>
  page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((n) => ({ id: n.getAttribute('data-body-id') ?? '', op: n.getAttribute('data-body-op') ?? '', name: n.getAttribute('data-body-name') ?? '' })),
  )

