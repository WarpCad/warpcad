// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { openApp, loadScene, startMovie, endMovie, shot, settle } from './support.js'

/**
 * Docs media for `docs/export.md` (`TODO/docs-016`): the Export popover as a still, and
 * "export an STL" as a movie. Laptop, Chromium only.
 *
 * The scene is a cube-and-cylinder Union (the shape `io-004`/`io-005` found open edges on),
 * loaded through File > Open. The movie asserts a real `download` event with the expected
 * `.stl` name, then reads the downloaded bytes with a parser that shares no code with the
 * serializer and checks the surface is closed (every undirected edge used by exactly two
 * faces, in opposite directions) - the `io-004` repro, run against the very mesh the movie
 * shows. Not an acceptance check: scenario 11 is driven by hand.
 */
test.describe('docs media: export', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  const UNION_AT = { fx: 0.38, fy: 0.7 }

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
  const selectUnion = async (page) => {
    const b = await page.getByTestId('viewport-canvas').boundingBox()
    await glideTo(page, { x: b.x + b.width * UNION_AT.fx, y: b.y + b.height * UNION_AT.fy })
    await page.mouse.down()
    await page.waitForTimeout(80)
    await page.mouse.up()
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    await page.waitForTimeout(300)
  }

  const openExport = async (page) => {
    await press(page, 'file-menu-button')
    await expect(page.getByTestId('file-menu')).toBeVisible()
    await page.waitForTimeout(400)
    await press(page, 'file-export')
    await expect(page.getByTestId('export-popover')).toBeVisible()
  }

  /**
   * Read a binary STL and report its triangle count and how many undirected edges are not
   * shared by exactly two faces in opposite directions.
   *
   * @param {Buffer} bytes
   */
  const measureStl = (bytes) => {
    const triangles = bytes.readUInt32LE(80)
    expect(bytes.length).toBe(84 + triangles * 50)
    const key = (x, y, z) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`
    /** @type {Map<string, number>} directed edge -> uses */
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

  test('export-popover still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'cube-cylinder-union.ndjson', 1)
    await selectUnion(page)
    await openExport(page)
    const popover = page.getByTestId('export-popover')
    await expect(page.getByTestId('export-format-stl')).toBeChecked()
    await expect(page.getByTestId('export-format-obj')).toBeVisible()
    await expect(page.getByTestId('export-format-glb')).toBeVisible()
    await expect(page.getByTestId('export-resolution')).toBeVisible()
    await expect(page.getByTestId('export-summary')).toContainText('union-1.stl')
    await shot(page, 'export-popover.png', { locator: popover })
  })

  test('export-download', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'cube-cylinder-union.ndjson', 1)
    await startMovie(page, 'export-download')

    await selectUnion(page)
    await openExport(page)
    await expect(page.getByTestId('export-format-stl')).toBeChecked()
    await expect(page.getByTestId('export-summary')).toContainText('Exports Union 1 as union-1.stl')
    await page.waitForTimeout(900)

    const downloadEvent = page.waitForEvent('download')
    await press(page, 'export-commit')
    const download = await downloadEvent
    expect(download.suggestedFilename()).toBe('union-1.stl')
    // The popover closes and the status line names the file it wrote.
    await expect(page.getByTestId('export-popover')).toHaveCount(0)
    await expect(page.getByTestId('save-status')).toContainText('Exported union-1.stl')
    await page.waitForTimeout(1800)
    await endMovie(page, 'export-download', { fps: 8, width: 600 })

    // io-004 / io-005 repro, against the very file the movie shows: a closed surface.
    const path = await download.path()
    const { triangles, unmatched } = measureStl(readFileSync(path))
    expect(triangles).toBeGreaterThan(50)
    expect(unmatched, 'the exported STL has open edges').toBe(0)
    await settle(page)
  })
})
