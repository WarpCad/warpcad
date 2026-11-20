// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { mmToCssPx, scatterTaps, seededRng } from '../bench/tap-scatter.mjs'

/**
 * `TODO/ui-149`: a fingertip's scatter around the navigation chrome's Orbit, Pan, Select and gear buttons
 * lands on that button, not a neighbouring control. Driven against `/` at the phone and tablet viewports.
 *
 * Each button gets a seeded Gaussian scatter (sigma 3.5 mm, the one `ui-135` measured with) around its
 * centre. For every point the page reports which control the browser's hit test puts under it, which is
 * what a tap fires. A tap that lands on nothing is not "a different control" here (it is the finding's
 * other number, the hit rate); a tap on any other button is.
 */

const CONTROLS = ['nav-mode-orbit', 'nav-mode-pan', 'nav-mode-select', 'nav-settings-gear']
const SIGMA_PX = mmToCssPx(3.5)
const TAPS = 400
/** The finding's aim: at most this share of taps fires a different control. */
const MAX_WRONG = 0.02

test.describe('navigation chrome mode-row taps', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name.endsWith('-laptop'), 'the touch layouts are phone and tablet (TODO/ui-149)')
  })

  test('a scattered fingertip rarely fires a different control than the one it aimed at', async ({ page }, info) => {
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
    await expect(page.getByTestId('nav-mode-orbit')).toBeVisible()

    const rng = seededRng(149)
    const report = {}
    for (const id of CONTROLS) {
      const b = await page.getByTestId(id).boundingBox()
      const aim = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
      const points = scatterTaps(aim, SIGMA_PX, TAPS, rng)
      const landed = await page.evaluate(
        (pts) =>
          pts.map(({ x, y }) => {
            const el = document.elementFromPoint(x, y)
            const control = el?.closest('button, [role="button"], a, input, select')
            return control ? (control.getAttribute('data-testid') ?? control.tagName) : null
          }),
        points,
      )
      const wrong = landed.filter((l) => l !== null && l !== id).length
      const hits = landed.filter((l) => l === id).length
      const where = {}
      for (const l of landed) if (l !== null && l !== id) where[l] = (where[l] ?? 0) + 1
      report[id] = { wrong: wrong / TAPS, hit: hits / TAPS, where }
    }
    console.log(`nav-chrome-tap ${info.project.name}: ${JSON.stringify(report)}`)
    for (const id of CONTROLS) {
      expect(report[id].wrong, `${id}: share of taps firing a different control ${JSON.stringify(report)}`).toBeLessThanOrEqual(MAX_WRONG)
    }
  })
})
