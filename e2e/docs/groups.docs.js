// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, settle, MAX_DIFF_PIXEL_RATIO } from './support.js'

/**
 * Docs media for `docs/groups.md` (`TODO/docs-012`): Group as a movie, drilling into a
 * grouped body's parts as a movie, and a Group-versus-Union comparison still. Laptop,
 * Chromium only.
 *
 * Every movie selects with real mouse clicks and ends by asserting its end state (the group
 * is one selectable body whose op is `group.assemble`; the group's gizmo drag moves both
 * cubes together, shown by an unchanged combined width; the breadcrumb names each part), so
 * a click that silently did nothing fails instead of publishing a GIF of a still scene. Not
 * an acceptance check: scenario 6 is driven by hand.
 */
test.describe('docs media: groups', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /**
   * Canvas fractions from pixel positions in a 1440x900 laptop screenshot (the viewport
   * canvas is 950x847 at 210,53), so each point is readable against the picture.
   *
   * @param {number} x
   * @param {number} y
   */
  const at = (x, y) => ({ fx: (x - 210) / 950, fy: (y - 53) / 847 })

  // two-cubes.ndjson at the default camera: each cube's visible front-left face, and Cube 2's top.
  const CUBE_1 = at(470, 450)
  const CUBE_2 = at(790, 570)
  const CUBE_2_TOP = at(880, 430)
  const EMPTY = at(1000, 770)
  // cubes-red-blue.ndjson: the red cube's lower left, the blue cube's lower right (clear of each gizmo).
  const RED = at(470, 540)
  const BLUE = at(900, 570)

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')

  const canvasPoint = async (page, { fx, fy }) => {
    const b = await page.getByTestId('viewport-canvas').boundingBox()
    return { x: b.x + b.width * fx, y: b.y + b.height * fy }
  }

  const glideTo = async (page, point) => {
    await page.mouse.move(point.x, point.y, { steps: 10 })
    await page.waitForTimeout(150)
  }

  /** A human-paced real click on the canvas; Shift held for an added selection. */
  const click = async (page, at, { shift = false } = {}) => {
    await glideTo(page, await canvasPoint(page, at))
    if (shift) await page.keyboard.down('Shift')
    await page.mouse.down()
    await page.waitForTimeout(80)
    await page.mouse.up()
    if (shift) await page.keyboard.up('Shift')
    await page.waitForTimeout(350)
  }

  /** Glide to a control and press it with the real mouse. */
  const press = async (page, testId) => {
    const el = page.getByTestId(testId)
    const b = await el.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await page.waitForTimeout(200)
    await el.click()
  }

  const openScene = async (page, fixture) => {
    await openApp(page)
    await loadScene(page, fixture, 2)
  }

  /** Click the first body, Shift-click the second, assert the count. */
  const selectPair = async (page, first, second) => {
    await click(page, first)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    await click(page, second, { shift: true })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
  }

  /** The scene's bodies once the kernel worker has measured every one (volume attribute lands last). */
  const bodies = async (page) => {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((n) => n.hasAttribute('data-body-volume')),
    )
    return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
      nodes.map((n) => ({
        id: n.getAttribute('data-body-id'),
        op: n.getAttribute('data-body-op'),
        bounds: (n.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
        volume: Number(n.getAttribute('data-body-volume')),
      })),
    )
  }

  /** Group the current pair and wait for the single group body, selected. */
  const groupSelected = async (page) => {
    await expect(page.getByTestId('operation-group')).toBeEnabled()
    await press(page, 'operation-group')
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    const list = await bodies(page)
    expect(list).toHaveLength(1)
    expect(list[0].op).toBe('group.assemble')
    await expect(viewport(page)).toHaveAttribute('data-selected-id', list[0].id)
    await settle(page)
    return list[0]
  }

  /** Screen position of a point along a gizmo arm, read from the overlay's own line. */
  const armPoint = async (page, testId, fraction) => {
    await expect(page.getByTestId(testId)).toBeAttached()
    return page.evaluate(
      ({ testId, fraction }) => {
        const el = document.querySelector(`[data-testid="${testId}"]`)
        const rect = document.querySelector('[data-testid="viewport"]').getBoundingClientRect()
        const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(el.getAttribute(a)))
        return { x: rect.left + x1 + (x2 - x1) * fraction, y: rect.top + y1 + (y2 - y1) * fraction }
      },
      { testId, fraction },
    )
  }

  test('group-combine', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'two-cubes.ndjson')
    await startMovie(page, 'group-combine')
    await selectPair(page, CUBE_1, CUBE_2_TOP)
    await expect(page.getByTestId('operations-count')).toContainText('2 selected')
    await page.waitForTimeout(250)
    const before = await groupSelected(page)
    // The group is one body spanning both cubes (two 40 mm cubes 75 mm apart along X).
    const width = before.bounds[3] - before.bounds[0]
    expect(width).toBeCloseTo(40 + 75, 0)
    await page.waitForTimeout(250)
    // Drag its gizmo's X arm: both cubes travel together, so the combined width is unchanged.
    const from = await armPoint(page, 'gizmo-grab-arm-x', 0.7)
    const hub = await page.evaluate(() => {
      const rect = document.querySelector('[data-testid="viewport"]').getBoundingClientRect()
      const [ox, oy] = document.querySelector('[data-testid="transform-gizmo"]').getAttribute('data-origin').split(',').map(Number)
      return { x: rect.left + ox, y: rect.top + oy }
    })
    const len = Math.hypot(from.x - hub.x, from.y - hub.y) || 1
    const to = { x: from.x + ((from.x - hub.x) / len) * 80, y: from.y + ((from.y - hub.y) / len) * 80 }
    await glideTo(page, from)
    await page.mouse.down()
    for (let i = 1; i <= 20; i++) {
      const t = i / 20
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e)
      await page.waitForTimeout(30)
    }
    await page.waitForTimeout(250)
    await page.mouse.up()
    await expect(viewport(page)).toHaveAttribute('data-transforming', 'false')
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    const [after] = await bodies(page)
    expect(after.op).toBe('group.assemble')
    expect(Math.abs(after.bounds[0] - before.bounds[0])).toBeGreaterThan(5) // it moved
    expect(after.bounds[3] - after.bounds[0]).toBeCloseTo(width, 2) // both parts moved by the same amount
    await page.waitForTimeout(400)
    await endMovie(page, 'group-combine', { fps: 10, width: 640 })
  })

  test('group-subpart-select', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'two-cubes.ndjson')
    // Set up the group before recording: the movie is about looking inside it.
    await selectPair(page, CUBE_1, CUBE_2_TOP)
    await groupSelected(page)
    await click(page, EMPTY)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '0')
    await startMovie(page, 'group-subpart-select')
    // First click: the whole group, never a part.
    await click(page, CUBE_1)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    await expect(page.getByTestId('inspector-name')).toContainText('Group 1')
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
    await page.waitForTimeout(650)
    // Second click on the same cube: drill into it.
    await click(page, CUBE_1)
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Cube 1')
    await page.waitForTimeout(650)
    // The other cube goes straight there, without stepping back up.
    await click(page, CUBE_2)
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Cube 2')
    await page.waitForTimeout(650)
    // The breadcrumb's group segment steps back up to the whole group.
    await press(page, 'inspector-breadcrumb-group')
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
    await expect(page.getByTestId('inspector-name')).toContainText('Group 1')
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    await page.waitForTimeout(650)
    await endMovie(page, 'group-subpart-select', { fps: 10, width: 640 })
  })

  test('group-vs-union still', async ({ page }) => {
    await openScene(page, 'cubes-overlap.ndjson')
    const box = await page.getByTestId('viewport-canvas').boundingBox()
    // The scene without the toolbar or nav chrome in the way: the middle of the canvas, plus
    // the top of the Inspector, which is where the two results differ.
    const sceneClip = { x: box.x + box.width * 0.18, y: box.y + box.height * 0.24, width: box.width * 0.64, height: box.height * 0.56 }
    const inspectorClip = { x: box.x + box.width, y: box.y, width: 1440 - box.x - box.width, height: 150 }
    const capture = async () => {
      await settle(page)
      const scene = (await page.screenshot({ clip: sceneClip })).toString('base64')
      const inspector = (await page.screenshot({ clip: inspectorClip })).toString('base64')
      return { scene, inspector }
    }

    // Left: the two overlapping cubes grouped, then one click inside it. Group kept both
    // cubes whole, so a second click opens one of them.
    await selectPair(page, RED, BLUE)
    const group = await groupSelected(page)
    expect(group.op).toBe('group.assemble')
    await click(page, EMPTY)
    await click(page, RED)
    await click(page, RED)
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Cube 1')
    const grouped = await capture()

    // Right: the same two cubes unioned. One merged volume with nothing inside to open.
    await click(page, EMPTY)
    await press(page, 'undo-button')
    await expect(viewport(page)).toHaveAttribute('data-body-count', '2')
    await selectPair(page, RED, BLUE)
    await press(page, 'operation-union')
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    const [union] = await bodies(page)
    expect(union.op).toBe('boolean.union')
    // The overlap (12 x 26 x 34 mm) is counted once in the merged volume.
    expect(union.volume).toBeCloseTo(2 * 64000 - 12 * 26 * 34, -2)
    await click(page, EMPTY)
    await click(page, RED)
    await click(page, RED) // a second click on a union is still the whole union
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', union.id)
    const merged = await capture()

    // Compose the comparison in a tiny harness page inside this run: no image tooling needed.
    await page.setViewportSize({ width: 960, height: 520 })
    const figure = (title, { scene, inspector }) => `<figure><figcaption>${title}</figcaption>
      <img alt="" src="data:image/png;base64,${scene}"><img class="inspector" alt="" src="data:image/png;base64,${inspector}"></figure>`
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:#f4f6fa;font:600 15px system-ui,sans-serif;color:#1d2330}
      #sheet{display:flex;gap:16px;padding:16px;width:928px}
      figure{margin:0;flex:1;min-width:0}
      figcaption{padding:0 0 8px}
      img{display:block;width:100%;border:1px solid #c9cfda;border-radius:6px}
      img.inspector{margin-top:8px;width:60%}
    </style></head><body><div id="sheet">
      ${figure('Group: click inside to reach Cube 1', grouped)}
      ${figure('Union: one solid, nothing inside', merged)}
    </div></body></html>`)
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
    await expect(page.locator('#sheet')).toHaveScreenshot('group-vs-union.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    })
  })
})
