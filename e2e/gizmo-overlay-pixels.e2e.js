// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { changedPixels, nextFrames, snapshotCanvas, snapshotVisibleViewport } from './support/canvasSnapshot.js'
import { closeLibrary, isPhone, openLibrary, pointer, sceneBodies, viewportPoint } from './support/humanInput.js'
import { openObjectList } from './support/importModel.js'

/**
 * Pixel checks on the viewport, graduated from `TODO/VERIFY.md` (`TODO/testing-039`), driven
 * against `/` — the running app — with real WebGL.
 *
 * **Part 1 — `render-007`: Show hidden parts, off again, leaves nothing behind.** Both halves of
 * what `inspector-hidden-parts.e2e.js` does not measure: the comparison with the gizmo, navigation
 * chrome and scale readout *on screen* (what a person sees, the part of the viewport above the
 * Inspector sheet), and the Subtract-with-the-bolt's-`tap` path, checked against a forced full
 * redraw (a one-pixel resize and back). All three engines, all three viewports.
 *
 * **Part 2 — `ui-048` #4: the move arrows keep a lit and a dark flank, and X, Y, Z stay red,
 * green, blue.** Pixels sampled across each shaft and cone, in both colour schemes. Laptop only
 * (the arrows are the same drawing at every width; the point is each engine's SVG gradient paint),
 * on all three engines.
 */

/** Pixels that may differ before a snapshot no longer counts as "the same" (`ACCEPTANCE.md` scenario 5). */
const SAME = 40

/** @param {import('@playwright/test').Page} page */
async function start(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
}

/**
 * Open the Inspector's sheet where it is a sheet (a no-op at laptop width).
 *
 * @param {import('@playwright/test').Page} page
 * @param {(locator: import('@playwright/test').Locator) => Promise<void>} press
 */
async function openInspector(page, press) {
  const tab = page.getByTestId('inspector-tab')
  if ((await page.getByTestId('inspector').getAttribute('data-open')) !== 'true' && (await tab.isVisible())) {
    await press(tab)
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'true')
  }
}

/**
 * Drop a Cube, then a Bolt over it, at the same spot, high enough to clear a phone's sheet.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} info
 */
async function dropBoltOverCube(page, info) {
  const { press, dragRow } = await pointer(page, info)
  const point = await viewportPoint(page, 0.45, isPhone(info) ? 0.22 : 0.4)
  await openLibrary(page, press)
  await dragRow(page.getByTestId('library-row-primitive.cuboid'), point.x, point.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await page.getByTestId('library-rows-hardware').scrollIntoViewIfNeeded()
  await dragRow(page.getByTestId('library-row-hardware.bolt'), point.x, point.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await closeLibrary(page, press)
  const bolt = (await sceneBodies(page)).find((body) => body.op === 'hardware.bolt')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bolt.id)
  await openInspector(page, press)
  return { press, bolt }
}

/**
 * Take the canvas and the visible viewport under `key`, with the pointer parked on neutral ground so no
 * hover highlight differs between two pictures.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 */
async function snapshotBoth(page, key) {
  await page.mouse.move(1, 1)
  await snapshotCanvas(page, `canvas-${key}`)
  const { width, height } = await snapshotVisibleViewport(page, `seen-${key}`)
  expect(width * height, 'the visible part of the viewport is not empty').toBeGreaterThan(40_000)
}

/**
 * Poll until two stored snapshots (taken by `take`) differ in fewer than `SAME` pixels. Polls because
 * the overlay's meshes are torn down asynchronously and a loaded worker can still show the old frame.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} base
 * @param {string} now
 * @param {string} message
 */
async function expectSame(page, base, now, message) {
  await expect
    .poll(
      async () => {
        await snapshotBoth(page, now)
        const canvas = await changedPixels(page, `canvas-${base}`, `canvas-${now}`)
        const seen = await changedPixels(page, `seen-${base}`, `seen-${now}`)
        // -1 is "different sizes", which would otherwise read as under the limit.
        return canvas < 0 || seen < 0 ? Infinity : Math.max(canvas, seen)
      },
      { message, timeout: 20_000 },
    )
    .toBeLessThan(SAME)
}

test.describe('Show hidden parts, off again, leaves nothing behind (render-007)', () => {
  test('canvas alone and the view with its overlays both return to the first picture', async ({ page }, info) => {
    test.setTimeout(150_000)
    await start(page)
    const { press } = await dropBoltOverCube(page, info)
    await snapshotBoth(page, 'before')

    await press(page.getByTestId('inspector-hidden-parts-toggle'))
    await expect(page.getByTestId('inspector-hidden-parts-toggle')).toBeChecked()
    await nextFrames(page)
    await snapshotBoth(page, 'shown')
    // The guard that makes "unchanged" mean something: the overlay really was drawn.
    expect(await changedPixels(page, 'canvas-before', 'canvas-shown'), 'the clearance is drawn on the canvas').toBeGreaterThan(50)
    expect(await changedPixels(page, 'seen-before', 'seen-shown'), 'and in the view a person sees').toBeGreaterThan(50)

    await press(page.getByTestId('inspector-hidden-parts-toggle'))
    await expect(page.getByTestId('inspector-hidden-parts-toggle')).not.toBeChecked()
    await expectSame(page, 'before', 'off', 'toggling off leaves the canvas and the visible view as they were')
  })

  test('Subtract with the bolt’s tap matches a forced full redraw', async ({ page }, info) => {
    test.setTimeout(150_000)
    await start(page)
    const { press, bolt } = await dropBoltOverCube(page, info)
    const cube = (await sceneBodies(page)).find((body) => body.op === 'primitive.cuboid')
    await snapshotBoth(page, 'whole')

    await press(page.getByTestId('inspector-hidden-parts-toggle'))
    await expect(page.getByTestId('inspector-hidden-parts-toggle')).toBeChecked()

    // The docs flow: tick the Cube (the base), then the Bolt's tap (the tool) from the Objects list.
    await openObjectList(page, press)
    await press(page.getByTestId(`objects-check-${cube.id}`))
    await press(page.getByTestId(`objects-expand-${bolt.id}`))
    await press(page.getByTestId(`objects-part-check-${bolt.id}-tap`))
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
    await press(page.getByTestId('operation-subtract'))
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    await expect(page.getByTestId('operation-error')).toHaveCount(0)
    // The Bolt is consumed, so the toggle it offered is gone with it.
    await expect(page.getByTestId('inspector-hidden-parts-toggle')).toHaveCount(0)

    await nextFrames(page)
    await snapshotBoth(page, 'subtracted')
    expect(await changedPixels(page, 'canvas-whole', 'canvas-subtracted'), 'Subtract changed what is drawn').toBeGreaterThan(50)

    // A one-pixel resize and back forces a full redraw; the view must not change by it.
    const size = page.viewportSize()
    await page.setViewportSize({ width: size.width - 1, height: size.height })
    await nextFrames(page)
    await page.setViewportSize(size)
    await nextFrames(page)
    await expectSame(page, 'subtracted', 'redrawn', 'a forced full redraw draws what the Subtract left on screen')
  })
})

test.describe('move arrows keep their colour and shading (ui-048)', () => {
  for (const scheme of /** @type {const} */ (['dark', 'light'])) {
    test.describe(`${scheme} scheme`, () => {
      test.use({ colorScheme: scheme })

      test(`X, Y, Z read red, green, blue with a lit and a dark flank, ${scheme}`, async ({ page }, info) => {
        test.skip(!info.project.name.endsWith('-laptop'), 'laptop only: the arrows are the same drawing at every width')
        test.setTimeout(90_000)
        await start(page)
        const { press, dragRow } = await pointer(page, info)
        const point = await viewportPoint(page, 0.45, 0.4)
        await openLibrary(page, press)
        await dragRow(page.getByTestId('library-row-primitive.cuboid'), point.x, point.y)
        await closeLibrary(page, press)
        await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
        for (const axis of ['x', 'y', 'z']) {
          // Counted, not `toBeVisible`: a perfectly vertical shaft (Z) has a zero-width box, which Playwright
          // reads as hidden although it is drawn 3 px wide.
          await expect(page.getByTestId(`gizmo-arm-${axis}`)).toHaveCount(1)
          await expect(page.getByTestId(`gizmo-head-${axis}`)).toHaveCount(1)
        }
        await page.mouse.move(1, 1)
        await nextFrames(page)

        // Where to look, in page pixels, through each shape's own screen transform.
        const spots = await page.evaluate(() => {
          const toPage = (el, x, y) => {
            const m = el.getScreenCTM()
            return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, scale: Math.hypot(m.a, m.b) }
          }
          const out = {}
          for (const axis of ['x', 'y', 'z']) {
            const arm = document.querySelector(`[data-testid="gizmo-arm-${axis}"]`)
            const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((name) => Number(arm.getAttribute(name)))
            const a = toPage(arm, x1, y1)
            const b = toPage(arm, x2, y2)
            const length = Math.hypot(b.x - a.x, b.y - a.y)
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
            const across = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
            // The shaft is only a few pixels wide, so walk across it in half-pixel steps and keep every
            // sample: the lit and the dark flank are the brightest and darkest of them.
            const half = (Number(arm.getAttribute('stroke-width')) * a.scale) / 2 - 0.5
            const across_ = [-0.7, -0.35, 0, 0.35, 0.7].map((t) => ({ x: mid.x + across.x * half * t, y: mid.y + across.y * half * t }))
            out[`arm-${axis}`] = { length, centre: mid, flanks: across_ }
            const head = document.querySelector(`[data-testid="gizmo-head-${axis}"]`)
            const [tip, h1, h2] = head
              .getAttribute('points')
              .trim()
              .split(/\s+/)
              .map((pair) => {
                const [x, y] = pair.split(',').map(Number)
                return toPage(head, x, y)
              })
            const centre = { x: (tip.x + h1.x + h2.x) / 3, y: (tip.y + h1.y + h2.y) / 3 }
            const toward = (p) => ({ x: centre.x + (p.x - centre.x) * 0.45, y: centre.y + (p.y - centre.y) * 0.45 })
            out[`head-${axis}`] = { length: Math.hypot(h1.x - tip.x, h1.y - tip.y), centre, flanks: [toward(h1), toward(h2)] }
          }
          return out
        })

        const png = await page.screenshot({ scale: 'css' })
        const colours = await page.evaluate(
          async ({ b64, spots }) => {
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
            const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
            const surface = new OffscreenCanvas(bitmap.width, bitmap.height)
            const context = surface.getContext('2d')
            context.drawImage(bitmap, 0, 0)
            const read = (p) => Array.from(context.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data.slice(0, 3))
            const out = {}
            for (const [name, spot] of Object.entries(spots)) out[name] = { centre: read(spot.centre), flanks: spot.flanks.map(read) }
            return out
          },
          { b64: png.toString('base64'), spots },
        )

        const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
        const spread = (flanks) => Math.max(...flanks.map(luma)) - Math.min(...flanks.map(luma))
        const DOMINANT = { x: 0, y: 1, z: 2 }
        for (const axis of ['x', 'y', 'z']) {
          for (const shape of ['arm', 'head']) {
            const name = `${shape}-${axis}`
            const { centre, flanks } = colours[name]
            const note = `${name}: centre ${centre}, flanks ${flanks.map((f) => `[${f}]`).join(' ')}`
            expect(spots[name].length, `${name} is long enough on screen to sample`).toBeGreaterThan(12)
            const channel = DOMINANT[axis]
            const others = [0, 1, 2].filter((index) => index !== channel)
            for (const other of others) {
              expect(centre[channel] - centre[other], `${axis.toUpperCase()} stays its own colour (${note})`).toBeGreaterThan(15)
            }
            // A lit flank and a dark flank: the two sides of the shape are not the same shade.
            expect(spread(flanks), `a lit and a dark flank (${note})`).toBeGreaterThanOrEqual(8)
          }
        }
      })
    })
  }
})
