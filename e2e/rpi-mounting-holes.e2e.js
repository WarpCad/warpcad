import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import modeling from '@jscad/modeling'

import { boundsOf, isGroup, volumeOf } from '../src/core/kernel/group.js'
import { evaluateOp } from '../src/core/kernel/index.js'

/**
 * `TODO/core-034`: a Raspberry Pi dragged out of the Library arrives with its mounting
 * holes drilled through the board, driven against `/` — the running app.
 *
 * The app exposes no pixel-picking hook, so "is there a hole here" is asked of the
 * number the app *does* publish per body: `data-body-volume`, the union volume the
 * kernel worker measured. The Node side of this spec evaluates the same recipe two ways
 * — as shipped (drilled) and with each hole's slab put back into the board — and the
 * volume the running app reports must sit on the drilled number, not the undrilled one.
 * Six holes at 3.25 mm x 1.32 mm is about 66 mm^3: small beside the whole board, but the
 * two references are that far apart and the app has to land on one of them.
 *
 * Engines: all three, because this is kernel output reaching WebGL. Firefox is expected
 * to fail at launch in this sandbox (`TROUBLESHOOTING.md`, 2026-09-17).
 */

const { booleans, primitives, transforms } = modeling
const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'rpi-mounting-holes-snapshots')

/**
 * @param {number} model
 * @returns {{ drilled: number, undrilled: number }}
 */
function expectedVolumes(model) {
  const group = evaluateOp('raspberrypi.bplus', { model })
  if (!isGroup(group)) throw new Error('expected a Group')
  const drilled = volumeOf(group)
  const holeNames = ['hole1', 'hole2', 'hole3', 'hole4', ...(model >= 5 ? ['fan1hole', 'fan2hole'] : [])]
  const [boardMin, boardMax] = boundsOf(/** @type {any} */ (group.parts.mb))
  const slabs = holeNames.map((name) => {
    const [min, max] = boundsOf(/** @type {any} */ (group.parts[name]))
    return booleans.intersect(
      /** @type {any} */ (group.parts[name]),
      transforms.translate(
        [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (boardMin[2] + boardMax[2]) / 2],
        primitives.cuboid({ size: [max[0] - min[0] + 1, max[1] - min[1] + 1, boardMax[2] - boardMin[2]] }),
      ),
    )
  })
  const visible = group.names.map((name) => /** @type {any} */ (group.parts[name]))
  const undrilled = volumeOf(booleans.union([...visible, ...slabs]))
  return { drilled, undrilled }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('a Raspberry Pi 5 dropped from the Library is drilled through its mounting holes', async ({ page }, testInfo) => {
  const { drilled, undrilled } = expectedVolumes(5)
  // The two references really are distinguishable, or this spec proves nothing.
  expect(undrilled - drilled).toBeGreaterThan(40)

  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) await page.getByTestId('library-tab').click()
  await page.getByTestId('library-rows-raspberrypi').scrollIntoViewIfNeeded()
  await page.getByTestId('library-choice-raspberrypi.bplus').selectOption('5')

  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="library-row-raspberrypi.bplus"]')
    const view = document.querySelector('[data-testid="viewport"]')
    if (!row || !view) throw new Error('missing row or viewport')
    const from = row.getBoundingClientRect()
    const to = view.getBoundingClientRect()
    const sx = from.left + from.width / 2
    const sy = from.top + from.height / 2
    const ex = to.left + to.width * 0.4
    const ey = to.top + to.height * 0.3
    /** @param {EventTarget} target @param {string} type @param {number} x @param {number} y */
    const fire = (target, type, x, y) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 34, pointerType: 'mouse', isPrimary: true, button: 0,
          buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true,
        }),
      )
    fire(row, 'pointerdown', sx, sy)
    for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', sx + (ex - sx) * t, sy + (ey - sy) * t)
    fire(window, 'pointerup', ex, ey)
  })

  const body = page.locator('[data-testid="scene-bodies"] li[data-body-op="raspberrypi.bplus"]')
  await expect(body).toHaveAttribute('data-body-volume', /.+/, { timeout: 30_000 })
  const reported = Number(await body.getAttribute('data-body-volume'))

  expect(Math.abs(reported - drilled)).toBeLessThan(Math.abs(reported - undrilled))
  expect(Math.abs(reported - drilled)).toBeLessThan(5)

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `pi5-drilled-${testInfo.project.name}.png`) })
})
