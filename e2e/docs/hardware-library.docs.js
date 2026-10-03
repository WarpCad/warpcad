// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, humanDrag, shot, settle } from './support.js'

/**
 * Docs media for `docs/hardware-library.md` (`TODO/docs-014`): the Hardware, Kit Parts and
 * Raspberry Pi Library sections as stills, a drag-a-bolt-and-edit-it movie, the bolt's hidden
 * tap-clearance part, the screw heads, a placed Pi, its mounting holes drilled into a plate by
 * a sub-part Subtract, and the 7-inch display's keep-out volume. Laptop, Chromium only.
 *
 * Deviation from the TODO's inventory: there is **no Screw row in the Library** (`hardware.screw`
 * has no `ui` block, see `registry.js`), so `hardware-screw-family` is loaded from a fixture
 * through File > Open, and the page says so rather than inventing a drag.
 *
 * The Pi shots are the heaviest renders in the docs (hundreds of solids per board), so they wait
 * for the worker to report every body measured (`data-body-volume`) and then a longer settle, and
 * use a larger `maxDiffPixelRatio` (software GL antialiases many small facets differently from
 * run to run). Every movie asserts its end state; not an acceptance check — scenarios 2, 3, 5
 * are driven by hand.
 */
test.describe('docs media: hardware, kit and Raspberry Pi library', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** Heavy Pi renders: larger tolerance than the 1% default, see the header. */
  const PI_DIFF = 0.03

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')

  const glideTo = async (page, point) => {
    await page.mouse.move(point.x, point.y, { steps: 10 })
    await page.waitForTimeout(150)
  }
  const press = async (page, testId) => {
    const el = page.getByTestId(testId)
    const b = await el.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await page.waitForTimeout(200)
    await el.click()
  }
  const typeInto = async (page, testId, text) => {
    const el = page.getByTestId(testId)
    const b = await el.boundingBox()
    await glideTo(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    await el.click()
    await el.fill('')
    await el.pressSequentially(text, { delay: 60 })
    await page.keyboard.press('Enter')
  }

  /** Every body once the kernel worker has measured it all. */
  const bodies = async (page) => {
    await page.waitForFunction(
      () => [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((n) => n.hasAttribute('data-body-volume')),
      null,
      { timeout: 60000 },
    )
    const list = await page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
      nodes.map((n) => ({
        id: n.getAttribute('data-body-id'),
        bounds: (n.getAttribute('data-body-bounds') ?? '').split(',').map(Number),
      })),
    )
    return Object.fromEntries(list.map((b) => [b.id, b]))
  }

  /** Wait for a body's measured bounds to differ from `before`, then return the scene. */
  const afterChange = async (page, id, before) => {
    await expect
      .poll(async () => (await bodies(page))[id].bounds.join(','), { timeout: 20000 })
      .not.toBe(before[id].bounds.join(','))
    await settle(page)
    return bodies(page)
  }

  /** The Pi shots' longer wait: every body measured, then a quarter-second-plus of quiet. */
  const heavySettle = async (page) => {
    await bodies(page)
    await page.waitForTimeout(1500)
    await settle(page)
  }

  const openObjectList = async (page) => {
    const list = page.getByTestId('object-list')
    if (await list.isVisible()) return
    await page.getByTestId('inspector-objects-header').click()
    await expect(list).toBeVisible()
  }

  /** Scroll a Library heading to the top of the panel, so a still shows its section from the first row. */
  const scrollToSection = async (page, id) => {
    await page.getByTestId(`library-heading-${id}`).evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await settle(page)
  }

  /** Open the app and scroll a Library section into view, checking the rows exist (read from the DOM). */
  const prepSection = async (page, id, minRows) => {
    await openApp(page)
    const rows = await page.$$eval(`[data-testid="library-rows-${id}"] [data-op]`, (n) => n.map((x) => x.getAttribute('data-label')))
    expect(rows.length).toBeGreaterThanOrEqual(minRows)
    await scrollToSection(page, id)
    return page.getByTestId('library-panel')
  }

  // The picture names are literals on purpose: `docs-media.spec.js` finds them by scanning for `shot(..., 'x.png')`.
  test('library-hardware-section still', async ({ page }) => {
    const locator = await prepSection(page, 'hardware', 4)
    await shot(page, 'library-hardware-section.png', { locator })
  })

  test('library-kit-section still', async ({ page }) => {
    const locator = await prepSection(page, 'kit', 3)
    await shot(page, 'library-kit-section.png', { locator })
  })

  test('library-rpi-section still', async ({ page }) => {
    const locator = await prepSection(page, 'raspberrypi', 12)
    await shot(page, 'library-rpi-section.png', { locator })
  })

  test('hardware-drag-bolt', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await startMovie(page, 'hardware-drag-bolt')
    const row = page.getByTestId('library-row-hardware.bolt')
    await row.scrollIntoViewIfNeeded()
    const rb = await row.boundingBox()
    const vb = await viewport(page).boundingBox()
    await humanDrag(page, { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }, { x: vb.x + vb.width * 0.5, y: vb.y + vb.height * 0.62 })
    await expect(viewport(page)).toHaveAttribute('data-body-count', '1')
    await expect(viewport(page)).toHaveAttribute('data-placing', 'false')
    // A dropped part is selected: the Inspector shows its parameters.
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    const id = await viewport(page).getAttribute('data-selected-id')
    let scene = await bodies(page)
    await expect(page.getByTestId('inspector-param-spec')).toHaveValue('m10 hex')
    await expect(page.getByTestId('inspector-param-length')).toHaveValue('20')
    await page.waitForTimeout(400)

    const pick = page.getByTestId('inspector-param-spec')
    const pb = await pick.boundingBox()
    await glideTo(page, { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 })
    await pick.selectOption('m12 hex')
    scene = await afterChange(page, id, scene)
    await expect(pick).toHaveValue('m12 hex')
    await page.waitForTimeout(300)

    const before = scene
    await typeInto(page, 'inspector-param-length', '30')
    scene = await afterChange(page, id, before)
    await expect(page.getByTestId('inspector-param-length')).toHaveValue('30')
    // 30 mm of thread under the head: taller than the 20 mm bolt it started as.
    expect(scene[id].bounds[5] - scene[id].bounds[2]).toBeGreaterThan(before[id].bounds[5] - before[id].bounds[2] - 0.01)
    await expect(page.getByTestId('bom-row')).toContainText('M12 hex')
    await expect(page.getByTestId('bom-row')).toContainText('30 mm')
    await page.waitForTimeout(500)
    await endMovie(page, 'hardware-drag-bolt', { fps: 10, width: 640 })
  })

  test('hardware-bolt-fit still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'bolt.ndjson', 1)
    await openObjectList(page)
    await page.getByTestId('objects-row-bolt-1').click()
    await expect(page.getByTestId('inspector-parts')).toBeVisible()
    await page.getByTestId('inspector-hidden-parts-toggle').check()
    await expect(page.getByTestId('inspector-hidden-parts-toggle')).toBeChecked()
    // Pick the hidden `tap` part itself, so the picture highlights the clearance envelope.
    const tap = page.getByTestId('inspector-part-tap')
    await tap.scrollIntoViewIfNeeded()
    await tap.click()
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('tap')
    await page.getByTestId('nav-zoom-in').click()
    await shot(page, 'hardware-bolt-fit.png')
  })

  test('hardware-screw-family still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'screw-family.ndjson', 4)
    await bodies(page)
    await shot(page, 'hardware-screw-family.png')
  })

  test('rpi-board-placed still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'pi-5.ndjson', 1)
    await page.getByTestId('nav-zoom-in').click()
    await heavySettle(page)
    await shot(page, 'rpi-board-placed.png', { maxDiffPixelRatio: PI_DIFF })
  })

  test('rpi-keepout still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'touch-display.ndjson', 1)
    await openObjectList(page)
    await page.getByTestId('objects-row-display-1').click()
    await expect(page.getByTestId('inspector-parts')).toBeVisible()
    await page.getByTestId('inspector-hidden-parts-toggle').check()
    const keepout = page.getByTestId('inspector-part-noGoPower')
    await keepout.scrollIntoViewIfNeeded()
    await keepout.click()
    await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('noGoPower')
    await heavySettle(page)
    await shot(page, 'rpi-keepout.png', { maxDiffPixelRatio: PI_DIFF })
  })

  test('rpi-mounting-holes', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'plate-and-pi.ndjson', 2)
    const before = await bodies(page)
    await heavySettle(page)
    const plateVolume = Number(await page.getByTestId('scene-bodies').locator('li[data-body-id="plate-1"]').getAttribute('data-body-volume'))
    await startMovie(page, 'rpi-mounting-holes')
    // The plate is the base (first), the Pi's hole1 the tool (second).
    await press(page, 'objects-row-plate-1')
    await expect(viewport(page)).toHaveAttribute('data-selected-id', 'plate-1')
    await page.waitForTimeout(300)
    // With something selected the Inspector shows its parameters; the Objects list is a header away.
    await press(page, 'inspector-objects-header')
    await expect(page.getByTestId('object-list')).toBeVisible()
    await press(page, 'objects-expand-pi-1')
    const check = page.getByTestId('objects-part-check-pi-1-hole1')
    await check.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    await press(page, 'objects-part-check-pi-1-hole1')
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    await expect(page.getByTestId('operation-operands')).toHaveAttribute('data-subpart', 'true')
    await expect(page.getByTestId('operation-operand-base')).toHaveText('Plate 1')
    await expect(page.getByTestId('operation-operand-rest')).toContainText('hole1')
    await page.waitForTimeout(500)
    await press(page, 'operation-subtract')
    // Subtract consumes both operands into one body: the plate, same outline, one hole short of
    // its volume (a 3.25 mm hole through 3 mm of plate is about 25 mm3; the app exposes no
    // vertex count, and the volume drop is the measurable form of "it gained a hole").
    await expect.poll(async () => Number(await viewport(page).getAttribute('data-body-count')), { timeout: 20000 }).toBe(1)
    await bodies(page)
    const result = await page.$eval('[data-testid="scene-bodies"] li', (n) => ({
      bounds: n.getAttribute('data-body-bounds'),
      volume: Number(n.getAttribute('data-body-volume')),
    }))
    expect(result.bounds).toBe(before['plate-1'].bounds.map((v) => v.toFixed(2)).join(','))
    expect(plateVolume - result.volume).toBeGreaterThan(15)
    expect(plateVolume - result.volume).toBeLessThan(35)
    await page.waitForTimeout(1200)
    await endMovie(page, 'rpi-mounting-holes', { fps: 8, width: 640 })
  })
})
