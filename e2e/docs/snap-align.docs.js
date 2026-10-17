// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, humanDrag, shot, settle } from './support.js'

/**
 * Docs media for `docs/snap-align.md` (`TODO/docs-012`, re-recorded for the one Align tool by
 * `TODO/ui-060`): the Align popover as a still, then Snap, Align, Align-to-origin and
 * Align-against-a-named-part as movies. Laptop, Chromium only.
 *
 * Every movie selects with real mouse clicks and ends by asserting its end state against
 * the kernel's own measurements: after Snap the two bodies share a face plane within 0.01 mm
 * and neither merged (still two bodies), after Align the lug's centre equals the plate's on
 * the chosen axis and nothing else moved, and the sub-part movie checks the screw's centre
 * against the Inspector's own reading of the hole it was snapped to. The wait for the
 * kernel's re-measure (a changed `data-body-bounds`) comes before every result frame. Not
 * an acceptance check: scenario 3 is driven by hand.
 */
test.describe('docs media: align', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** Face-plane tolerance, mm: the kernel works in doubles, the attribute prints two decimals. */
  const TOL = 0.01

  /**
   * Canvas fractions from pixel positions in a 1440x900 laptop screenshot (the viewport
   * canvas is 950x847 at 210,53), so each point is readable against the picture.
   *
   * @param {number} x
   * @param {number} y
   */
  const at = (x, y) => ({ fx: (x - 210) / 950, fy: (y - 53) / 847 })

  // plate-and-lug.ndjson at the default camera.
  const LUG = at(930, 540)
  const PLATE = at(520, 470)
  // pi-and-screw.ndjson: the screw's shank.
  const SCREW = at(505, 530)

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

  const openScene = async (page, fixture, count = 2) => {
    await openApp(page)
    await loadScene(page, fixture, count)
  }

  /** The Objects list, opened (it is already open when nothing is selected). */
  const openObjectList = async (page) => {
    const list = page.getByTestId('object-list')
    if (await list.isVisible()) return
    await page.getByTestId('inspector-objects-header').click()
    await expect(list).toBeVisible()
  }

  /** The scene's bodies once the kernel worker has measured every one (volume attribute lands last). */
  const bodies = async (page) => {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((n) => n.hasAttribute('data-body-volume')),
    )
    const list = await page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
      nodes.map((n) => ({
        id: n.getAttribute('data-body-id'),
        op: n.getAttribute('data-body-op'),
        center: (n.getAttribute('data-body-center') ?? '').split(',').map(Number),
        bounds: (n.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
      })),
    )
    return Object.fromEntries(list.map((b) => [b.id, b]))
  }

  /** Wait for a body's bounds to change from `before` (the kernel re-measure), then return the scene. */
  const afterMove = async (page, id, before) => {
    await expect
      .poll(async () => (await bodies(page))[id].bounds.join(','), { timeout: 10000 })
      .not.toBe(before[id].bounds.join(','))
    await settle(page)
    return bodies(page)
  }

  /** Click the lug (moving, first), Shift-click the plate (reference, second). */
  const selectLugThenPlate = async (page) => {
    await click(page, LUG)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', 'lug-1')
    await click(page, PLATE, { shift: true })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    await expect(page.getByTestId('operation-align')).toBeEnabled()
  }

  /** Tap one popover button and wait for the moving body's re-measure. */
  const tapAndSettle = async (page, testId, id, before) => {
    await press(page, testId)
    return afterMove(page, id, before)
  }

  test('snap-popover still', async ({ page }) => {
    await openScene(page, 'plate-and-lug.ndjson')
    await selectLugThenPlate(page)
    await press(page, 'operation-align')
    await expect(page.getByTestId('align-popover')).toBeVisible()
    await expect(page.getByTestId('align-popover')).toHaveAttribute('data-target', 'second')
    await expect(page.getByTestId('align-operands')).toContainText('Lug 1')
    await expect(page.getByTestId('align-operands')).toContainText('Plate 1')
    await shot(page, 'snap-popover.png', { locator: page.getByTestId('align-popover') })
  })

  test('snap-operation', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'plate-and-lug.ndjson')
    const before = await bodies(page)
    await startMovie(page, 'snap-operation')
    await selectLugThenPlate(page)
    await page.waitForTimeout(400)
    await press(page, 'operation-align')
    const popover = page.getByTestId('align-popover')
    await expect(popover).toBeVisible()
    await page.waitForTimeout(700)
    // Outside, + side on X: the lug ends up on the plate's +X side (`outside-`). One tap commits.
    const after = await tapAndSettle(page, 'align-x-snap-plus', 'lug-1', before)
    // Two bodies still: Snap moves one against the other and merges nothing.
    await expect(viewport(page)).toHaveAttribute('data-body-count', '2')
    expect(after['plate-1'].bounds).toEqual(before['plate-1'].bounds) // the reference never moved
    // The lug's low-X face now lies in the plate's high-X face plane.
    expect(Math.abs(after['lug-1'].bounds[0] - after['plate-1'].bounds[3])).toBeLessThan(TOL)
    // Only X was checked: Y and Z are where they were.
    expect(after['lug-1'].center[1]).toBeCloseTo(before['lug-1'].center[1], 2)
    expect(after['lug-1'].center[2]).toBeCloseTo(before['lug-1'].center[2], 2)
    await page.waitForTimeout(1200)
    await endMovie(page, 'snap-operation', { fps: 10, width: 640 })
  })

  test('align-operation', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'plate-and-lug.ndjson')
    const before = await bodies(page)
    await startMovie(page, 'align-operation')
    await selectLugThenPlate(page)
    await page.waitForTimeout(400)
    await press(page, 'operation-align')
    const popover = page.getByTestId('align-popover')
    await expect(popover).toHaveAttribute('data-target', 'second')
    await page.waitForTimeout(700)
    const after = await tapAndSettle(page, 'align-y-center', 'lug-1', before)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '2')
    expect(after['plate-1'].bounds).toEqual(before['plate-1'].bounds)
    // Centred on the plate along Y; X and Z (unchecked) did not move.
    expect(Math.abs(after['lug-1'].center[1] - after['plate-1'].center[1])).toBeLessThan(TOL)
    expect(after['lug-1'].center[0]).toBeCloseTo(before['lug-1'].center[0], 2)
    expect(after['lug-1'].center[2]).toBeCloseTo(before['lug-1'].center[2], 2)
    await page.waitForTimeout(1200)
    await endMovie(page, 'align-operation', { fps: 10, width: 640 })
  })

  /**
   * `TODO/ui-060`: Align to the **World origin**, the Inspector row's old movie moved into
   * the toolbar popover. A Pi set well away from the origin; Measure from `mb`; the one-tap
   * drop shortcut. Checked against the kernel's own bounds afterwards.
   */
  test('align-to-origin-popover', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'pi-away.ndjson', 1)
    await openObjectList(page)
    await page.getByTestId('objects-row-pi-1').click()
    await expect(viewport(page)).toHaveAttribute('data-selected-id', 'pi-1')
    const before = await bodies(page)
    await startMovie(page, 'align-to-origin-popover')
    await press(page, 'operation-align')
    await expect(page.getByTestId('align-popover')).toHaveAttribute('data-target', 'origin')
    await expect(page.getByTestId('align-operands')).toContainText('World origin')
    await page.waitForTimeout(500)
    await page.getByTestId('align-reference').selectOption('mb')
    await page.waitForTimeout(600)
    await press(page, 'align-drop')
    const after = await afterMove(page, 'pi-1', before)
    // Centred on the origin in X and Y, the board's underside on the grid (the SD card hangs
    // a little below it), so the whole body's low Z is within 2 mm of 0.
    expect(Math.abs(after['pi-1'].center[0])).toBeLessThan(3)
    expect(Math.abs(after['pi-1'].center[1])).toBeLessThan(3)
    expect(after['pi-1'].bounds[2]).toBeLessThan(0.01)
    expect(after['pi-1'].bounds[2]).toBeGreaterThan(-2)
    await page.waitForTimeout(1200)
    await endMovie(page, 'align-to-origin-popover', { fps: 10, width: 640 })
  })

  test('snap-subpart-operand', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'pi-and-screw.ndjson')
    const before = await bodies(page)
    const num = async (testId) => Number((await page.getByTestId(testId).inputValue()).replace(/[^\d.+-]/g, ''))

    // Read the hole's own position from the Inspector first (setup, not recorded): a hole is
    // hidden inside the board, so the Objects list is the way to reach it.
    await openObjectList(page)
    await page.getByTestId('objects-expand-pi-1').click()
    const holeRow = page.getByTestId('objects-part-item-pi-1-hole1')
    await holeRow.scrollIntoViewIfNeeded()
    await page.getByTestId('objects-part-pi-1-hole1').click()
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('hole1')
    const hole = { x: await num('inspector-position-x'), y: await num('inspector-position-y') }
    await click(page, at(1000, 770))
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '0')
    // Close the Pi's parts again so the movie starts from the collapsed list.
    await page.getByTestId('objects-expand-pi-1').click()
    await expect(holeRow).toHaveCount(0)

    await startMovie(page, 'snap-subpart-operand')
    // The screw first: it is the one that moves.
    await click(page, SCREW)
    await expect(viewport(page)).toHaveAttribute('data-selected-id', 'screw-1')
    await page.waitForTimeout(300)
    // Open the Objects list, open the Pi's parts and tick the hole: the second operand.
    await press(page, 'inspector-objects-header')
    await expect(page.getByTestId('object-list')).toBeVisible()
    await press(page, 'objects-expand-pi-1')
    await holeRow.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    await press(page, 'objects-part-check-pi-1-hole1')
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    await page.waitForTimeout(250)
    await press(page, 'operation-align')
    const popover = page.getByTestId('align-popover')
    await expect(popover).toHaveAttribute('data-target', 'second')
    // The popover names the part it will measure against.
    await expect(page.getByTestId('align-operands')).toContainText('Screw 1')
    await expect(page.getByTestId('align-operands')).toContainText('hole1')
    await page.waitForTimeout(500)
    await press(page, 'align-x-center')
    await page.waitForTimeout(400)
    await press(page, 'align-y-center')
    await expect
      .poll(async () => {
        const c = (await bodies(page))['screw-1'].center
        return Math.max(Math.abs(c[0] - hole.x), Math.abs(c[1] - hole.y))
      }, { timeout: 10000 })
      .toBeLessThan(0.02)
    const after = await bodies(page)
    await expect(viewport(page)).toHaveAttribute('data-body-count', '2')
    // The screw's axis is on the hole's axis (the Inspector's own reading of hole1), and it
    // did not move in Z. The Pi, the reference, stayed put.
    expect(Math.abs(after['screw-1'].center[0] - hole.x)).toBeLessThan(0.02)
    expect(Math.abs(after['screw-1'].center[1] - hole.y)).toBeLessThan(0.02)
    expect(after['screw-1'].center[2]).toBeCloseTo(before['screw-1'].center[2], 2)
    expect(after['pi-1'].bounds).toEqual(before['pi-1'].bounds)
    await page.waitForTimeout(900)
    await endMovie(page, 'snap-subpart-operand', { fps: 8, width: 640 })
  })

  /**
   * `TODO/ui-063`: a part on **both** sides. The Pi's `hole1` aligned onto the screen's
   * `piMountingPost1` in plan, then the Pi's `mb` snapped onto the post's top (Outside, + side). Recorded at
   * a brisk pace (two commits fit the 18 s budget), then checked against the Inspector's
   * own readings of the parts once the recording has stopped.
   */
  test('snap-subpart-both-sides', { tag: '@movie' }, async ({ page }) => {
    await openScene(page, 'pi-and-screen.ndjson')
    const before = await bodies(page)
    const num = async (testId) => Number((await page.getByTestId(testId).inputValue()).replace(/[^\d.+-]/g, ''))
    const quick = async (testId) => {
      const el = page.getByTestId(testId)
      await el.scrollIntoViewIfNeeded()
      const b = await el.boundingBox()
      await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
      await el.click()
      await page.waitForTimeout(150)
    }
    const showList = async () => {
      if (!(await page.getByTestId('object-list').isVisible())) await quick('inspector-objects-header')
      await expect(page.getByTestId('object-list')).toBeVisible()
    }
    const showParts = async (id) => {
      await showList()
      if ((await page.getByTestId(`objects-expand-${id}`).getAttribute('aria-expanded')) !== 'true') {
        await quick(`objects-expand-${id}`)
      }
    }
    /** Inspector reading of one part: centre and size, with that part selected. */
    const inspect = async (id, part) => {
      await openObjectList(page)
      const toggle = page.getByTestId(`objects-expand-${id}`)
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
      await page.getByTestId(`objects-part-${id}-${part}`).scrollIntoViewIfNeeded()
      await page.getByTestId(`objects-part-${id}-${part}`).click()
      await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText(part)
      const read = async (kind) => Promise.all(['x', 'y', 'z'].map((axis) => num(`inspector-${kind}-${axis}`)))
      return { centre: await read('position'), size: await read('size') }
    }
    const popover = page.getByTestId('align-popover')

    await startMovie(page, 'snap-subpart-both-sides')
    // The Pi at hole1 (a plain tap on the part row), then the screen at its first post
    // (the part row's check, which adds rather than replaces).
    await showParts('pi-1')
    await quick('objects-part-pi-1-hole1')
    await showParts('screen-1')
    await quick('objects-part-check-screen-1-piMountingPost1')
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    await quick('operation-align')
    await expect(popover).toHaveAttribute('data-target', 'second')
    await expect(page.getByTestId('align-operand-moving')).toHaveText('Raspberry Pi 1 › hole1')
    await expect(page.getByTestId('align-operand-target')).toHaveText('Touchscreen 2 1 › piMountingPost1')
    await page.waitForTimeout(700)
    await quick('align-x-center')
    const afterX = await afterMove(page, 'pi-1', before)
    await quick('align-y-center')
    const aligned = await afterMove(page, 'pi-1', afterX)
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    await page.waitForTimeout(500)

    // Re-address the Pi at mb, add the post again, and Snap on Z with Outside minus.
    await showParts('pi-1')
    await quick('objects-part-pi-1-mb')
    await showParts('screen-1')
    await quick('objects-part-check-screen-1-piMountingPost1')
    await quick('operation-align')
    await expect(popover).toHaveAttribute('data-target', 'second')
    await expect(page.getByTestId('align-operand-moving')).toHaveText('Raspberry Pi 1 › mb')
    await page.waitForTimeout(500)
    // Outside, + side on Z (`outside-`): the board's underside on the post's top.
    await quick('align-z-snap-plus')
    await afterMove(page, 'pi-1', aligned)
    await page.waitForTimeout(1000)
    await endMovie(page, 'snap-subpart-both-sides', { fps: 8, width: 640 })
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)

    // Checked after the recording: hole1 on the post's axis, mb on the post's top.
    const hole = await inspect('pi-1', 'hole1')
    const mb = await inspect('pi-1', 'mb')
    const post = await inspect('screen-1', 'piMountingPost1')
    expect(Math.abs(hole.centre[0] - post.centre[0])).toBeLessThan(0.02)
    expect(Math.abs(hole.centre[1] - post.centre[1])).toBeLessThan(0.02)
    expect(Math.abs(mb.centre[2] - mb.size[2] / 2 - (post.centre[2] + post.size[2] / 2))).toBeLessThan(0.02)
  })
  /**
   * `TODO/ui-069`: **⟳ Repeat**. Shared by the still and the movie: the Pi already seated on the
   * screen's posts (a fixture), `hole1` drilled into, Repeat pressed, then one M2.5 bolt made the
   * ordinary way — dragged in, turned head-up, Align X/Y to `hole1`, Snap Z Inside against `mb`
   * with Offset -5. This returns the paced helpers the walk is made of.
   *
   * @param {import('@playwright/test').Page} page
   * @param {{ pace?: number }} options `pace` is the pause after each action, ms.
   */
  const repeatAFourthBolt = async (page, { pace = 150 }) => {
    const pause = () => page.waitForTimeout(pace)
    const quick = async (testId) => {
      const el = page.getByTestId(testId)
      await el.scrollIntoViewIfNeeded()
      const b = await el.boundingBox()
      await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
      await el.click()
      await pause()
    }
    const typeQuick = async (testId, text) => {
      const el = page.getByTestId(testId)
      await el.click()
      await el.fill(text)
      await el.press('Enter')
      await pause()
    }
    const afterMeasure = async (id, before) => {
      await expect
        .poll(async () => (await bodies(page))[id].bounds.join(','), { timeout: 15000 })
        .not.toBe(before)
      return (await bodies(page))[id].bounds.join(',')
    }
    const popover = page.getByTestId('align-popover')
    return { pause, quick, typeQuick, afterMeasure, popover }
  }

  /** The fixture's Pi, seated; the Library's Bolt row set to an M2.5 socket cap, 12 mm. */
  const setUpRepeatScene = async (page) => {
    await openScene(page, 'pi-on-screen.ndjson')
    await page.getByTestId('library-choice-hardware.bolt').selectOption('socket')
    await page.getByTestId('library-choice-hardware.bolt-spec').selectOption('m2.5')
    await openObjectList(page)
    await page.getByTestId('objects-expand-pi-1').click()
    await page.getByTestId('objects-part-pi-1-hole1').scrollIntoViewIfNeeded()
    await page.getByTestId('objects-part-pi-1-hole1').click()
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('hole1')
  }

  /** Drag the Bolt row to an empty patch of the canvas, left of the panel. */
  const dragBoltIn = async (page) => {
    const row = page.getByTestId('library-row-hardware.bolt')
    await row.scrollIntoViewIfNeeded()
    const from = await row.boundingBox()
    const canvas = await page.getByTestId('viewport-canvas').boundingBox()
    await humanDrag(
      page,
      { x: from.x + from.width / 2, y: from.y + from.height / 2 },
      { x: canvas.x + canvas.width * 0.3, y: canvas.y + canvas.height * 0.5 },
      { steps: 20, ms: 700 },
    )
    const bolt = page.locator('[data-testid="scene-bodies"] li[data-body-op="hardware.bolt"]')
    await expect(bolt).toHaveAttribute('data-body-volume', /.+/, { timeout: 30000 })
    return /** @type {string} */ (await bolt.getAttribute('data-body-id'))
  }

  /** The Objects list with the Pi's parts showing (it collapses while a body's params are up). */
  const showPiParts = async (page) => {
    await openObjectList(page)
    const toggle = page.getByTestId('objects-expand-pi-1')
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  }

  /** Turn the bolt head-up and give it its steps: Align X/Y to hole1, Snap Z Inside against mb. */
  const makeTheBolt = async (page, bolt, helpers) => {
    const { pause, quick, typeQuick, afterMeasure, popover } = helpers
    await typeQuick('inspector-param-length', '12')
    await typeQuick('inspector-rotation-x', '180')
    let bounds = (await bodies(page))[bolt].bounds.join(',')
    // The bolt (first) and the Pi's hole1 (second).
    await showPiParts(page)
    await quick('objects-part-check-pi-1-hole1')
    await quick('operation-align')
    await expect(popover).toHaveAttribute('data-target', 'second')
    await quick('align-x-center')
    bounds = await afterMeasure(bolt, bounds)
    await quick('align-y-center')
    bounds = await afterMeasure(bolt, bounds)
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    // Back to the bolt alone, then the Pi's mb as the second part.
    await showPiParts(page)
    await quick(`objects-row-${bolt}`)
    await showPiParts(page)
    await quick('objects-part-check-pi-1-mb')
    await quick('operation-align')
    await expect(popover).toHaveAttribute('data-target', 'second')
    await page.getByTestId('align-relation').selectOption('inside')
    await page.getByTestId('align-offset').fill('-5')
    await pause()
    await quick('align-z-snap-minus')
    await afterMeasure(bolt, bounds)
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
  }

  test('repeat-sheet still', async ({ page }) => {
    await setUpRepeatScene(page)
    await press(page, 'op-repeat')
    await expect(page.getByTestId('repeat-sheet')).toBeVisible()
    const helpers = await repeatAFourthBolt(page, {})
    const bolt = await dragBoltIn(page)
    await makeTheBolt(page, bolt, helpers)
    await expect(page.getByTestId('repeat-step')).toHaveCount(5)
    await expect(page.getByTestId('repeat-apply')).toBeEnabled()
    await shot(page, 'repeat-sheet.png', { locator: page.getByTestId('repeat-sheet'), maxDiffPixelRatio: 0.03 })
  })

  test('repeat-placement', { tag: '@movie' }, async ({ page }) => {
    await setUpRepeatScene(page)
    // The scene and the Bolt row are ready; the camera is the default.
    await startMovie(page, 'repeat-placement')
    const helpers = await repeatAFourthBolt(page, { pace: 90 })
    const { quick, typeQuick, pause } = helpers
    await quick('op-repeat')
    await expect(page.getByTestId('repeat-sheet')).toBeVisible()
    await page.waitForTimeout(900)
    const bolt = await dragBoltIn(page)
    await makeTheBolt(page, bolt, helpers)
    await page.waitForTimeout(700)
    await quick('repeat-apply')
    await expect(page.getByTestId('repeat-toast-text')).toHaveText('Repeated Bolt / screw 1 on 3 more holes')
    await page.waitForTimeout(900)
    // Bolt 1's Length 12 -> 16: all four follow.
    await quick(`objects-row-${bolt}`)
    await typeQuick('inspector-param-length', '16')
    await expect
      .poll(async () => {
        const b = (await bodies(page))
        const repeatBody = Object.values(b).find((body) => body.op === 'pattern.repeat')
        return repeatBody ? repeatBody.bounds[5] - repeatBody.bounds[2] : 0
      }, { timeout: 15000 })
      .toBeGreaterThan(18)
    await page.waitForTimeout(1500)
    await endMovie(page, 'repeat-placement', { fps: 8, width: 640 })
  })
})
