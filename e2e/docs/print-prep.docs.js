// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { openApp, loadScene, startMovie, endMovie, shot, settle } from './support.js'

/**
 * Docs media for `docs/print-prep.md` (`TODO/io-007`): the Split sheet with its cut plane
 * as a still, the Export popover's Print pieces list as a still, and "split the wing and
 * export its pieces" as a movie. Laptop, Chromium only.
 *
 * The scene is a 300 x 40 x 12 mm bar named Wing, loaded through File > Open. The movie drags
 * the cut plane's handle with the real mouse (so hit-testing runs for real), then types the
 * exact offset, applies, and asserts a real `download` of `wing-print-pieces.zip` whose two
 * STLs are read back by a parser that shares nothing with the serializer and checked closed
 * (the `io-004` / `io-005` / `io-006` repro, against the very files the movie shows).
 * Not an acceptance check: scenarios 4 and 11 are driven by hand.
 */
test.describe('docs media: print prep', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')

  const glideTo = async (page, point) => {
    await page.mouse.move(point.x, point.y, { steps: 14 })
    await page.waitForTimeout(200)
  }
  const centreOf = async (locator) => {
    const b = await locator.boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  const press = async (page, testId) => {
    const el = page.getByTestId(testId)
    await glideTo(page, await centreOf(el))
    await page.waitForTimeout(150)
    await el.click()
  }

  /** A human-paced real click on the canvas selects the body under it. */
  const selectWing = async (page) => {
    const b = await page.getByTestId('viewport-canvas').boundingBox()
    await glideTo(page, { x: b.x + b.width * 0.5, y: b.y + b.height * 0.55 })
    await page.mouse.down()
    await page.waitForTimeout(80)
    await page.mouse.up()
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    await page.waitForTimeout(300)
  }

  /** Unpack a stored-only zip by hand. */
  const unzip = (bytes) => {
    const entries = []
    let at = 0
    while (bytes.readUInt32LE(at) === 0x04034b50) {
      const size = bytes.readUInt32LE(at + 18)
      const nameLength = bytes.readUInt16LE(at + 26)
      const extraLength = bytes.readUInt16LE(at + 28)
      const name = bytes.subarray(at + 30, at + 30 + nameLength).toString('utf8')
      const start = at + 30 + nameLength + extraLength
      entries.push({ name, bytes: bytes.subarray(start, start + size) })
      at = start + size
    }
    return entries
  }

  /** Triangle count and how many undirected edges are not shared by two opposite faces. */
  const measureStl = (bytes) => {
    const triangles = bytes.readUInt32LE(80)
    expect(bytes.length).toBe(84 + triangles * 50)
    const key = (x, y, z) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`
    const directed = new Map()
    for (let t = 0; t < triangles; t += 1) {
      const base = 84 + t * 50 + 12
      const v = [0, 1, 2].map((i) => {
        const o = base + i * 12
        return key(bytes.readFloatLE(o), bytes.readFloatLE(o + 4), bytes.readFloatLE(o + 8))
      })
      for (let i = 0; i < 3; i += 1) {
        const edge = `${v[i]}>${v[(i + 1) % 3]}`
        directed.set(edge, (directed.get(edge) ?? 0) + 1)
      }
    }
    let unmatched = 0
    for (const [edge, uses] of directed) {
      const [a, b] = edge.split('>')
      if (uses !== 1 || directed.get(`${b}>${a}`) !== 1) unmatched += 1
    }
    return { triangles, unmatched }
  }

  const openSplit = async (page) => {
    await press(page, 'op-split')
    await expect(page.getByTestId('split-sheet')).toBeVisible()
    await expect(page.getByTestId('cut-plane')).toBeVisible()
    await page.waitForTimeout(400)
  }

  test('split-sheet still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'long-wing.ndjson', 1)
    await selectWing(page)
    await page.getByTestId('op-split').click()
    await expect(page.getByTestId('split-sheet')).toBeVisible()
    await page.getByTestId('split-offset').fill('150')
    await page.getByTestId('split-joint').selectOption('tongue')
    await expect(page.getByTestId('split-piece-fit').nth(1)).toHaveAttribute('data-fit', 'fits')
    await shot(page, 'split-sheet.png')
  })

  /**
   * Look square at the cut face and zoom until it is about 4-5 px per millimetre, the way a
   * person would with the wheel; wheel events are fired on the canvas so the zoom is exact.
   */
  const faceOn = async (page) => {
    await page.getByTestId('gizmo-view-right').click()
    for (let i = 0; i < 40; i += 1) {
      await page.waitForTimeout(120)
      const scale = await page.evaluate(() =>
        Number(document.querySelector('[data-testid="cut-plane"]')?.getAttribute('data-face-u')?.split(',')[0])
      )
      if (scale >= 3.5 && scale <= 5.5) return
      await page.evaluate((deltaY) => {
        const canvas = document.querySelector('[data-testid="viewport"] canvas')
        const box = canvas.getBoundingClientRect()
        canvas.dispatchEvent(
          new WheelEvent('wheel', { deltaY, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, bubbles: true, cancelable: true })
        )
      }, scale < 3.5 ? -60 : 60)
    }
    throw new Error('could not zoom the cut face to a tappable size')
  }

  /** Face millimetres to client pixels, from the overlay's own map. */
  const faceToClient = (page, uMm, vMm) =>
    page.evaluate(
      ({ uMm, vMm }) => {
        const svg = document.querySelector('[data-testid="cut-plane"]')
        const pair = (name) => svg.getAttribute(name).split(',').map(Number)
        const [uX, uY] = pair('data-face-u')
        const [vX, vY] = pair('data-face-v')
        const [cu, cv] = pair('data-face-centre')
        const [hx, hy] = pair('data-handle')
        const box = svg.getBoundingClientRect()
        return { x: box.left + hx + (uMm - cu) * uX + (vMm - cv) * vX, y: box.top + hy + (uMm - cu) * uY + (vMm - cv) * vY }
      },
      { uMm, vMm }
    )

  const markerCentre = async (marker) => centreOf(marker.locator('.marker__hit'))
  const markerFace = async (marker) => ({
    uMm: Number(await marker.getAttribute('data-u-mm')),
    vMm: Number(await marker.getAttribute('data-v-mm')),
  })

  /** A real-mouse drag from `from` to `to`, human-paced. */
  const dragMouse = async (page, from, to, steps = 16) => {
    await page.mouse.move(from.x, from.y, { steps: 8 })
    await page.waitForTimeout(200)
    await page.mouse.down()
    for (let i = 1; i <= steps; i += 1) {
      await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
      await page.waitForTimeout(30)
    }
    await page.mouse.up()
  }

  test('split-sheet-manual-joints still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'long-wing.ndjson', 1)
    await selectWing(page)
    await page.getByTestId('gizmo-view-right').click()
    await page.getByTestId('op-split').click()
    await expect(page.getByTestId('split-sheet')).toBeVisible()
    await page.getByTestId('split-offset').fill('150')
    await page.getByTestId('split-manual-joints').check()
    await expect(page.getByTestId('connector-marker').first()).toBeVisible()
    await expect(page.getByTestId('connector-marker').first()).toHaveAttribute('data-state', 'ok')
    await faceOn(page)
    await page.getByTestId('split-connector-kind-screwBoss').click()
    await expect(page.getByTestId('split-piece-fit').nth(1)).toHaveAttribute('data-fit', 'fits')
    await shot(page, 'split-sheet-manual-joints.png')
  })

  test('print-pieces still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'long-wing.ndjson', 1)
    await selectWing(page)
    await page.getByTestId('op-split').click()
    await page.getByTestId('split-offset').fill('150')
    await page.getByTestId('split-joint').selectOption('tongue')
    await page.getByTestId('split-apply').click()
    await expect(page.getByTestId('split-sheet')).toHaveCount(0)
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('file-export').click()
    await expect(page.getByTestId('export-popover')).toBeVisible()
    await page.getByTestId('export-print-pieces').click()
    await expect(page.getByTestId('export-print-piece')).toHaveCount(2)
    await shot(page, 'print-pieces-popover.png', { locator: page.getByTestId('export-popover') })
  })

  test('print-prep-split', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'long-wing.ndjson', 1)
    await startMovie(page, 'print-prep-split')

    await selectWing(page)
    await openSplit(page)

    // Drag the plane's handle with the real mouse: the number follows.
    const handle = page.getByTestId('cut-plane-handle')
    const from = await centreOf(handle)
    const plane = page.getByTestId('cut-plane')
    const axisX = Number(await plane.getAttribute('data-axis-x'))
    const axisY = Number(await plane.getAttribute('data-axis-y'))
    const before = Number(await page.getByTestId('split-offset').inputValue())
    await page.mouse.move(from.x, from.y, { steps: 10 })
    await page.mouse.down()
    for (let i = 1; i <= 20; i += 1) {
      await page.mouse.move(from.x + axisX * 0.6 * i, from.y + axisY * 0.6 * i)
      await page.waitForTimeout(40)
    }
    await page.mouse.up()
    expect(Number(await page.getByTestId('split-offset').inputValue())).not.toBeCloseTo(before, 0)
    await page.waitForTimeout(300)

    // Then the exact numbers.
    await page.getByTestId('split-offset').click()
    await page.getByTestId('split-offset').fill('')
    await page.getByTestId('split-offset').pressSequentially('150', { delay: 50 })
    await page.waitForTimeout(300)
    await page.getByTestId('split-joint').selectOption('tongue')
    await expect(page.getByTestId('split-piece-fit').nth(0)).toHaveAttribute('data-fit', 'fits')
    await expect(page.getByTestId('split-piece-fit').nth(1)).toHaveAttribute('data-fit', 'fits')
    await page.waitForTimeout(500)
    await press(page, 'split-apply')
    await expect(page.getByTestId('split-sheet')).toHaveCount(0)
    await page.waitForTimeout(400)

    await press(page, 'file-menu-button')
    await expect(page.getByTestId('file-menu')).toBeVisible()
    await page.waitForTimeout(300)
    await press(page, 'file-export')
    await expect(page.getByTestId('export-popover')).toBeVisible()
    await page.waitForTimeout(500)
    const downloadEvent = page.waitForEvent('download')
    await press(page, 'export-print-pieces')
    const download = await downloadEvent
    expect(download.suggestedFilename()).toBe('wing-print-pieces.zip')
    await expect(page.getByTestId('export-print-piece')).toHaveCount(2)
    await page.waitForTimeout(1200)
    await endMovie(page, 'print-prep-split', { fps: 8, width: 600 })

    const entries = unzip(readFileSync(await download.path()))
    expect(entries.map((e) => e.name)).toEqual(['wing-a.stl', 'wing-b.stl'])
    for (const entry of entries) {
      const { triangles, unmatched } = measureStl(entry.bytes)
      expect(triangles).toBeGreaterThan(12)
      expect(unmatched, `${entry.name} has open edges`).toBe(0)
    }
    await settle(page)
  })

  test('print-prep-manual-joint', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'long-wing.ndjson', 1)
    await startMovie(page, 'print-prep-manual-joint')

    await selectWing(page)
    await press(page, 'gizmo-view-right')
    await page.waitForTimeout(500)
    await press(page, 'op-split')
    await expect(page.getByTestId('split-sheet')).toBeVisible()
    await page.waitForTimeout(400)
    await page.getByTestId('split-offset').click()
    await page.getByTestId('split-offset').fill('')
    await page.getByTestId('split-offset').pressSequentially('150', { delay: 30 })
    await page.waitForTimeout(300)

    // Place connectors: the search's own posts become markers, over the dimmed rim.
    await press(page, 'split-manual-joints')
    const markers = page.getByTestId('connector-marker')
    await expect(markers.first()).toBeVisible()
    await expect(markers.first()).toHaveAttribute('data-state', 'ok')
    await faceOn(page)
    await page.waitForTimeout(400)

    // Pick Screw boss, then drag the first marker 10 mm along the face, with the real mouse.
    await press(page, 'split-connector-kind-screwBoss')
    const first = markers.first()
    const at = await markerFace(first)
    const target = await faceToClient(page, at.uMm - 10, 6)
    await dragMouse(page, await markerCentre(first), target)
    await expect(first).toHaveAttribute('data-dragging', 'false')
    await expect(first).toHaveAttribute('data-state', 'ok')
    await page.waitForTimeout(300)
    await expect(first).toHaveAttribute('data-selected', 'true')
    await press(page, 'split-connector-kind-screwBoss')
    await expect(first).toHaveAttribute('data-kind', 'screwBoss')
    await page.waitForTimeout(300)

    // A drag toward the rim turns red and snaps back, with the reason.
    const here = await markerFace(first)
    const rim = await faceToClient(page, 19.5, 6)
    const start = await markerCentre(first)
    await page.mouse.move(start.x, start.y, { steps: 8 })
    await page.mouse.down()
    for (let i = 1; i <= 14; i += 1) {
      await page.mouse.move(start.x + ((rim.x - start.x) * i) / 14, start.y + ((rim.y - start.y) * i) / 14)
      await page.waitForTimeout(30)
    }
    await expect(first).toHaveAttribute('data-state', 'bad')
    await page.waitForTimeout(400)
    await page.mouse.up()
    await expect(page.getByTestId('split-notice')).toBeVisible()
    await expect(first).toHaveAttribute('data-state', 'ok')
    expect(await markerFace(first)).toEqual(here)
    await page.waitForTimeout(300)

    await press(page, 'split-apply')
    await expect(page.getByTestId('split-sheet')).toHaveCount(0)
    await page.waitForTimeout(500)
    await endMovie(page, 'print-prep-manual-joint', { fps: 8, width: 600 })
    await settle(page)
  })
})
