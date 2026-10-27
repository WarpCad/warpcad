// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The project's first real app-level spec: it navigates to `/` — the running
 * app, not a Storybook iframe — and drives the viewport scaffold.
 *
 * It runs across the full 3 viewport × 3 engine matrix from
 * `playwright.config.js`, because this surface is WebGL, canvas and touch input
 * from line one (CLAUDE.md Browser Support: "defaults to all three engines").
 *
 * Camera assertions read `data-camera-*` off the viewport element rather than
 * pixel-picking the canvas: the camera model is the single source of truth that
 * both drags and chrome buttons write to, so asserting on it proves the *same*
 * state moved regardless of which input path produced the change. The rendered
 * pixels get their own separate check ("actually draws something visible")
 * so a correct camera behind a blank canvas still fails.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'viewport-snapshots')

/** @param {import('@playwright/test').Page} page */
async function cameraState(page) {
  const viewport = page.getByTestId('viewport')
  return {
    azimuth: Number(await viewport.getAttribute('data-camera-azimuth')),
    elevation: Number(await viewport.getAttribute('data-camera-elevation')),
    distance: Number(await viewport.getAttribute('data-camera-distance')),
    target: String(await viewport.getAttribute('data-camera-target')),
    dragMode: String(await viewport.getAttribute('data-drag-mode')),
    webgl: String(await viewport.getAttribute('data-webgl')),
  }
}

/**
 * Poll one camera field until it settles.
 *
 * The `data-camera-*` mirror is written from inside the render callback — once
 * per animation frame, deliberately, so a fast drag can't push a DOM update per
 * pointer event. A one-shot `getAttribute` right after a click therefore races
 * the next frame; every post-action assertion has to be retrying.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'azimuth' | 'elevation' | 'distance' | 'target' | 'dragMode' | 'webgl'} field
 */
function camera(page, field) {
  return expect.poll(async () => (await cameraState(page))[field], { timeout: 5000 })
}

/**
 * Drive a pointer drag over the canvas. `pointerType: 'touch'` exercises the
 * same handlers a finger does on a device the runner can't emulate natively.
 *
 * `button`/`shiftKey` exercise `TODO/ui-018`'s desktop pan overrides (Shift+left,
 * or the right mouse button) on top of the existing plain-left-drag path — every
 * `PointerEvent` in the gesture carries them, matching how a real held button and
 * a real held modifier key stay present for a drag's whole duration, not just its
 * `pointerdown`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ dx: number, dy: number, pointerType?: 'mouse' | 'touch', button?: number, shiftKey?: boolean }} options
 */
async function dragCanvas(page, { dx, dy, pointerType = 'mouse', button = 0, shiftKey = false }) {
  await page.evaluate(
    ({ dx, dy, pointerType, button, shiftKey }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      const x = box.left + box.width / 2
      const y = box.top + box.height / 2
      // Bitmask: left = 1, right = 2 (per the `PointerEvent.buttons` spec) — held
      // for `pointermove`, cleared for `pointerup`, mirroring a real press.
      const buttonsBit = button === 2 ? 2 : 1
      /** @param {string} type @param {number} cx @param {number} cy */
      const fire = (type, cx, cy) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType,
            isPrimary: true,
            button,
            buttons: type === 'pointerup' ? 0 : buttonsBit,
            shiftKey,
            clientX: cx,
            clientY: cy,
            bubbles: true,
            cancelable: true,
          }),
        )
      fire('pointerdown', x, y)
      // Two steps, so the handler sees incremental deltas the way a real drag
      // arrives rather than one teleporting jump.
      fire('pointermove', x + dx / 2, y + dy / 2)
      fire('pointermove', x + dx, y + dy)
      fire('pointerup', x + dx, y + dy)
    },
    { dx, dy, pointerType, button, shiftKey },
  )
  await page.waitForTimeout(50)
}

/**
 * Open the Library if this viewport keeps it behind a tab, exactly as
 * `primitive-placement.e2e.js` and `selection-inspector.e2e.js` do — needed here
 * only for the Shift-click-still-selects regression test, which needs a real
 * placed body to click on.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/**
 * Drag a Library row into the viewport and release inside it. Same pattern as
 * `primitive-placement.e2e.js`'s helper of the same name.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number }} options
 */
async function dragRowIntoViewport(page, { op, fx, fy }) {
  await page.evaluate(
    ({ op, fx, fy }) => {
      const row = document.querySelector(`[data-testid="library-row-${op}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error(`missing row ${op} or viewport`)
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const startX = from.left + from.width / 2
      const startY = from.top + from.height / 2
      const endX = to.left + to.width * fx
      const endY = to.top + to.height * fy
      /** @param {EventTarget} target @param {string} type @param {number} x @param {number} y */
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      fire(row, 'pointerdown', startX, startY)
      for (const t of [0.25, 0.5, 0.75, 1]) {
        fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      }
      fire(window, 'pointerup', endX, endY)
    },
    { op, fx, fy },
  )
  await page.waitForTimeout(120)
}

/**
 * Click at a fraction of the viewport, as a press that does not move — the
 * additive-select path `onPointerUp` fires when travel stays under
 * `CLICK_SLOP_PX`, per `TODO/ui-018`'s own click-vs-drag distinction. Same
 * pattern as `primitive-placement.e2e.js`'s helper of the same name.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 * @param {{ shift?: boolean }} [modifiers]
 */
async function clickViewportAt(page, fx, fy, modifiers = {}) {
  await page.evaluate(
    ({ fx, fy, shift }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      const x = box.left + box.width * fx
      const y = box.top + box.height * fy
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 9,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            shiftKey: shift === true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy, shift: modifiers.shift === true },
  )
  await page.waitForTimeout(90)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  // Wait for the first rendered frame so camera readouts are populated.
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-frames-rendered', '0')
})

test('the root view mounts the viewport, grid readout, gizmo and nav chrome', { tag: '@smoke' }, async ({ page }) => {
  await expect(page.getByTestId('app-root')).toBeVisible()
  await expect(page.getByTestId('viewport-canvas')).toBeVisible()
  await expect(page.getByTestId('orientation-gizmo')).toBeVisible()
  await expect(page.getByTestId('navigation-chrome')).toBeVisible()
  await expect(page.getByTestId('grid-scale-readout')).toBeVisible()

  const canvas = await page.getByTestId('viewport-canvas').boundingBox()
  expect(canvas?.width ?? 0).toBeGreaterThan(200)
  expect(canvas?.height ?? 0).toBeGreaterThan(200)
})

test('the grid labels its own dimensions without opening any panel', async ({ page }) => {
  // CLAUDE.md's grid rule: real-world size must be readable off the grid itself.
  await expect(page.getByTestId('grid-legend')).toContainText('10 mm')
  await expect(page.getByTestId('grid-legend')).toContainText('50 mm')

  const label = await page.getByTestId('grid-scale-label').textContent()
  expect(label).toMatch(/^\d+(\.\d+)? (mm|m)$/)

  const bar = await page.getByTestId('grid-scale-bar').boundingBox()
  expect(bar?.width ?? 0).toBeGreaterThan(4)
  expect(bar?.width ?? 0).toBeLessThanOrEqual(115)
})

test('the scale readout follows the zoom level', async ({ page }) => {
  const readout = page.getByTestId('grid-scale-readout')
  const read = async () => Number(await readout.getAttribute('data-scale-mm'))
  // The canvas is still resizing as the panel grid settles after load, and the readout follows its
  // width, so a baseline read straight after `goto` can be a pre-layout value. Wait until it holds.
  let before = await read()
  await expect
    .poll(async () => {
      const last = before
      await page.waitForTimeout(250)
      before = await read()
      return before === last
    })
    .toBe(true)
  for (let i = 0; i < 6; i += 1) await page.getByTestId('nav-zoom-in').click()
  await expect.poll(read).toBeLessThan(before)
})

test('WebGL actually draws a visible grid, not a blank or black rectangle', { tag: '@smoke' }, async ({ page }) => {
  // The direct guard against SECOND-ATTEMPT.md's "the scene is very dark" — a
  // bug that shipped twice under passing tests because nothing ever looked at a
  // pixel.
  const state = await cameraState(page)
  expect(state.webgl, 'WebGL context should start on every supported engine').toBe('ready')

  const readStats = () =>
    page.evaluate(() => {
      const source = /** @type {HTMLCanvasElement} */ (
        document.querySelector('[data-testid="viewport-canvas"]')
      )
      const size = 96
      const off = document.createElement('canvas')
      off.width = size
      off.height = size
      const ctx = off.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      ctx.drawImage(source, 0, 0, size, size)
      const { data } = ctx.getImageData(0, 0, size, size)
      const colors = new Set()
      let min = 255
      let max = 0
      let sum = 0
      for (let i = 0; i < data.length; i += 4) {
        const luma = (data[i] + data[i + 1] + data[i + 2]) / 3
        min = Math.min(min, luma)
        max = Math.max(max, luma)
        sum += luma
        colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
      }
      return { min, max, mean: sum / (data.length / 4), colors: colors.size }
    })
  // Without preserveDrawingBuffer a read between composites can come back as one flat colour on a
  // slow frame; retry briefly. A scene that really is blank or black never gets past this.
  let stats = await readStats()
  for (let i = 0; i < 20 && stats.colors <= 3; i += 1) {
    await page.waitForTimeout(100)
    stats = await readStats()
  }

  expect(stats.colors, 'grid lines and background should be distinguishable').toBeGreaterThan(3)
  expect(stats.mean, 'the scene must not render essentially black').toBeGreaterThan(8)
  expect(stats.max - stats.min, 'the frame must not be a flat fill').toBeGreaterThan(10)
})

test('the rendered scene follows the browser colour scheme', async ({ page }) => {
  // Found by looking at a screenshot from the hand-driven acceptance pass, not
  // by any DOM assertion: the overlays follow `prefers-color-scheme` through CSS
  // custom properties, so the canvas has to as well or the app renders light
  // chrome around a dark 3D scene.
  /** @returns {Promise<number>} mean luminance of the rendered canvas */
  const canvasLuma = () =>
    page.evaluate(() => {
      const source = /** @type {HTMLCanvasElement} */ (
        document.querySelector('[data-testid="viewport-canvas"]')
      )
      const off = document.createElement('canvas')
      off.width = 64
      off.height = 64
      const ctx = off.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      ctx.drawImage(source, 0, 0, 64, 64)
      const { data } = ctx.getImageData(0, 0, 64, 64)
      let sum = 0
      for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3
      return sum / (data.length / 4)
    })

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-theme', 'dark')
  await page.waitForTimeout(120)
  const dark = await canvasLuma()

  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-theme', 'light')
  await page.waitForTimeout(120)
  const light = await canvasLuma()

  expect(dark, 'dark scene should be dark but not black').toBeGreaterThan(8)
  expect(dark, 'dark scene should be dark').toBeLessThan(90)
  expect(light, 'light scene should be light').toBeGreaterThan(150)
})

test('the orientation gizmo snaps the camera to standard views', async ({ page }) => {
  await page.getByTestId('gizmo-view-top').click()
  // Z-up: the top view looks straight down the Z axis.
  await camera(page, 'elevation').toBeCloseTo(90, 1)
  await camera(page, 'azimuth').toBeCloseTo(-90, 1)

  await page.getByTestId('gizmo-view-front').click()
  await camera(page, 'elevation').toBeCloseTo(0, 1)
  await camera(page, 'azimuth').toBeCloseTo(-90, 1)

  await page.getByTestId('gizmo-view-right').click()
  await camera(page, 'azimuth').toBeCloseTo(0, 1)

  await page.getByTestId('gizmo-view-bottom').click()
  await camera(page, 'elevation').toBeCloseTo(-90, 1)

  await page.getByTestId('gizmo-view-home').click()
  await camera(page, 'elevation').toBeCloseTo(35.26, 1)
  await camera(page, 'azimuth').toBeCloseTo(-45, 1)
})

test('the orientation gizmo dial is a snapshot target for cap/triad visual weight (TODO/ui-025)', async ({
  page,
  browserName,
}, testInfo) => {
  // Purely a look-at-it-yourself artifact, not a pixel diff (same reasoning as
  // the transform gizmo's `shaded-gizmo-*` snapshot in gizmo-transform.e2e.js):
  // the caps'/spokes' relative visual weight is a legibility judgment call, not
  // something a numeric assertion can usefully encode. Chromium-only is
  // acceptable per the TODO's own Testing section — this is a DOM/SVG overlay,
  // not WebGL, so there's no cross-engine rendering risk to catch here.
  test.skip(browserName !== 'chromium', 'DOM/SVG overlay — no cross-engine rendering risk')

  await expect(page.getByTestId('orientation-gizmo')).toBeVisible()

  // Confirm the dial actually holds all six caps plus a visible hub — the
  // structural check a snapshot alone can't guarantee survived a CSS edit.
  const dial = page.getByTestId('orientation-gizmo').locator('.gizmo__dial')
  for (const view of ['right', 'left', 'back', 'front', 'top', 'bottom']) {
    await expect(page.getByTestId(`gizmo-view-${view}`)).toBeVisible()
  }
  await expect(dial.locator('.gizmo__hub')).toBeVisible()
  await expect(dial.locator('.gizmo__spoke')).toHaveCount(6)

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const file = join(SNAPSHOT_DIR, `orientation-gizmo-${testInfo.project.name}.png`)
  await dial.screenshot({ path: file })
  await testInfo.attach(`orientation-gizmo-${testInfo.project.name}`, {
    path: file,
    contentType: 'image/png',
  })
})

test('the gizmo triad re-projects as the camera moves', async ({ page }) => {
  const xCap = page.getByTestId('gizmo-view-right') // the +X axis cap
  const zCap = page.getByTestId('gizmo-view-top') // the +Z axis cap

  await page.getByTestId('gizmo-view-front').click()
  await camera(page, 'azimuth').toBeCloseTo(-90, 1)
  const fromFront = { x: await xCap.boundingBox(), z: await zCap.boundingBox() }

  // Swinging the camera 90° in azimuth swings +X across the dial…
  await page.getByTestId('gizmo-view-right').click()
  await camera(page, 'azimuth').toBeCloseTo(0, 1)
  const fromRight = await xCap.boundingBox()
  expect(Math.abs((fromFront.x?.x ?? 0) - (fromRight?.x ?? 0))).toBeGreaterThan(10)

  // …and tipping it up to the pole pulls +Z in toward the hub, since it now
  // points at the viewer rather than up the screen.
  await page.getByTestId('gizmo-view-top').click()
  await camera(page, 'elevation').toBeCloseTo(90, 1)
  const fromTop = await zCap.boundingBox()
  expect(Math.abs((fromFront.z?.y ?? 0) - (fromTop?.y ?? 0))).toBeGreaterThan(10)
})

test('nav chrome orbits, pans and zooms without a keyboard or a drag', { tag: '@smoke' }, async ({ page }) => {
  const start = await cameraState(page)
  expect(start.dragMode).toBe('orbit')

  await page.getByTestId('nav-step-left').click()
  await camera(page, 'azimuth').toBeCloseTo(start.azimuth - 15, 1)

  await page.getByTestId('nav-step-up').click()
  await camera(page, 'elevation').toBeCloseTo(start.elevation + 15, 1)

  await page.getByTestId('nav-zoom-in').click()
  await camera(page, 'distance').toBeLessThan(start.distance)

  await page.getByTestId('nav-zoom-out').click()
  await page.getByTestId('nav-zoom-out').click()
  await camera(page, 'distance').toBeGreaterThan(start.distance)

  // Pan is independently reachable — the exact gap SECOND-ATTEMPT.md's stop note
  // reports ("clicking dragging in the 3D viewport just rotates the base grid").
  await page.getByTestId('nav-mode-pan').click()
  await camera(page, 'dragMode').toBe('pan')
  const beforePan = await cameraState(page)
  await page.getByTestId('nav-step-right').click()
  await camera(page, 'target').not.toBe(beforePan.target)
  await camera(page, 'azimuth').toBeCloseTo(beforePan.azimuth, 1)

  await page.getByTestId('nav-reset').click()
  await camera(page, 'target').toBe('0.00,0.00,0.00')
  await camera(page, 'azimuth').toBeCloseTo(start.azimuth, 1)
  await camera(page, 'distance').toBeCloseTo(start.distance, 1)
})

test('the direction pad relabels itself for the active drag mode', async ({ page }) => {
  await expect(page.getByTestId('nav-step-up')).toHaveAttribute('aria-label', 'Orbit camera up')
  await page.getByTestId('nav-mode-pan').click()
  await expect(page.getByTestId('nav-step-up')).toHaveAttribute('aria-label', 'Pan camera up')
})

test('mouse drag orbits, and pans once the mode is switched', async ({ page }) => {
  const start = await cameraState(page)
  // Plain left-drag with no Shift, chrome mode still 'orbit': unchanged
  // (`TODO/ui-018`'s Testing item 4 — the new logic must not swallow this case).
  await dragCanvas(page, { dx: 100, dy: 0 })
  await camera(page, 'azimuth').toBeCloseTo(start.azimuth - 40, 0)
  await camera(page, 'target').toBe(start.target)
  const orbited = await cameraState(page)

  // Shift+left-drag pans regardless of the chrome mode (`TODO/ui-018` item 1):
  // azimuth stays put, only the target moves. The chrome's own toggle is never
  // touched by this gesture.
  await dragCanvas(page, { dx: 0, dy: 80, shiftKey: true })
  await camera(page, 'target').not.toBe(orbited.target)
  await camera(page, 'azimuth').toBeCloseTo(orbited.azimuth, 1)
  await camera(page, 'dragMode').toBe('orbit')
  const shiftPanned = await cameraState(page)

  // Right-button drag pans too, no modifier needed (`TODO/ui-018` item 2) — and
  // its release must not pop the browser's native context menu (the task's
  // "second real gap").
  await dragCanvas(page, { dx: 40, dy: 0, button: 2 })
  await camera(page, 'target').not.toBe(shiftPanned.target)
  await camera(page, 'azimuth').toBeCloseTo(shiftPanned.azimuth, 1)
  await camera(page, 'dragMode').toBe('orbit')
  const contextMenuPrevented = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    canvas.dispatchEvent(evt)
    return evt.defaultPrevented
  })
  expect(contextMenuPrevented).toBe(true)

  // The pre-existing chrome-toggle pan path (unchanged by this task).
  await page.getByTestId('nav-mode-pan').click()
  await camera(page, 'dragMode').toBe('pan')
  await dragCanvas(page, { dx: 0, dy: 80 })
  await camera(page, 'target').not.toBe(shiftPanned.target)
  await camera(page, 'azimuth').toBeCloseTo(shiftPanned.azimuth, 1)
})

test('the settings gear opens a mouse-nav preset list, marks the active choice, and switching preset changes drag behavior on the very next drag (TODO/ui-019)', async ({
  page,
}) => {
  const gear = page.getByTestId('nav-settings-gear')
  const panel = page.getByTestId('nav-settings-panel')
  await expect(gear).toBeVisible()
  // Closed by default — the control adds nothing to the chrome's on-screen
  // footprint until the user actually opens it.
  await expect(panel).toHaveCount(0)

  await gear.click()
  await expect(panel).toBeVisible()
  // The out-of-the-box default (`ui-018`'s scheme) is marked active before
  // anyone has ever picked anything — re-opening never shows a blank picker.
  await expect(page.getByTestId('nav-preset-shift-or-right-pans')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('nav-preset-left-pans')).toHaveAttribute('aria-pressed', 'false')

  await page.getByTestId('nav-preset-left-pans').click()
  await expect(panel).toHaveCount(0)

  const start = await cameraState(page)
  // Plain left-drag, no modifier: pans under the alternate preset (it orbited
  // under the default — see the 'mouse drag orbits...' test above).
  await dragCanvas(page, { dx: 0, dy: 80 })
  await camera(page, 'target').not.toBe(start.target)
  await camera(page, 'azimuth').toBeCloseTo(start.azimuth, 1)
  const panned = await cameraState(page)

  // Right-button drag: orbits under the alternate preset — the mirror image
  // of the default, where right-button always panned.
  await dragCanvas(page, { dx: 100, dy: 0, button: 2 })
  await camera(page, 'azimuth').toBeCloseTo(panned.azimuth - 40, 0)
  await camera(page, 'target').toBe(panned.target)

  // Re-opening the list shows the current choice.
  await gear.click()
  await expect(page.getByTestId('nav-preset-left-pans')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('nav-preset-shift-or-right-pans')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test('a touch drag still orbits under the alternate mouse-nav preset (TODO/ui-019 — the preset is moot on touch)', async ({
  page,
}) => {
  // `ui-019`'s own Interaction model section: mouse-button conventions have no
  // touch equivalent (no Shift key, no right button), so a touch drag must
  // keep following the chrome's Orbit/Pan toggle exactly as it did before this
  // task, regardless of which mouse preset is selected.
  await page.getByTestId('nav-settings-gear').click()
  await page.getByTestId('nav-preset-left-pans').click()

  const start = await cameraState(page)
  await dragCanvas(page, { dx: 60, dy: 0, pointerType: 'touch' })
  await camera(page, 'azimuth').toBeCloseTo(start.azimuth - 24, 0)
  await camera(page, 'target').toBe(start.target)
})

test('the chosen mouse-nav preset survives a real reload, without reselecting it (TODO/ui-019)', async ({
  page,
}) => {
  await page.getByTestId('nav-settings-gear').click()
  await page.getByTestId('nav-preset-left-pans').click()

  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-frames-rendered', '0')

  // The UI shows the persisted choice without the user picking it again...
  await page.getByTestId('nav-settings-gear').click()
  await expect(page.getByTestId('nav-preset-left-pans')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('nav-settings-gear').click()
  await expect(page.getByTestId('nav-settings-panel')).toHaveCount(0)

  // ...and the actual drag behavior carried over, not just the list's marking.
  const start = await cameraState(page)
  await dragCanvas(page, { dx: 0, dy: 80 })
  await camera(page, 'target').not.toBe(start.target)
  await camera(page, 'azimuth').toBeCloseTo(start.azimuth, 1)
})

test('Shift-clicking a body still selects it additively, without dragging (TODO/ui-018 regression)', async ({
  page,
}) => {
  // The real conflict TODO/ui-018 names: Shift+left is already meaningful on a
  // *click* (additive multi-select). A Shift+left press that never exceeds
  // CLICK_SLOP_PX must still fire that path, not be swallowed as a pan.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.28, fy: 0.42 })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.72, fy: 0.3 })
  const viewport = page.getByTestId('viewport')

  await clickViewportAt(page, 0.28, 0.38)
  await expect(viewport).toHaveAttribute('data-selected-count', '1')

  await clickViewportAt(page, 0.72, 0.26, { shift: true })
  await expect(viewport).toHaveAttribute('data-selected-count', '2')
})

test('drag and the on-screen pad drive the same camera state', async ({ page }) => {
  // One camera model, two input paths — not two parallel implementations.
  await page.getByTestId('gizmo-view-front').click()
  await camera(page, 'azimuth').toBeCloseTo(-90, 1)
  await dragCanvas(page, { dx: -37.5, dy: 0 }) // -(-37.5) * 0.4 = +15°
  await camera(page, 'azimuth').toBeCloseTo(-75, 1)
  const dragged = await cameraState(page)

  await page.getByTestId('gizmo-view-front').click()
  await camera(page, 'azimuth').toBeCloseTo(-90, 1)
  await page.getByTestId('nav-step-right').click() // +15°
  await camera(page, 'azimuth').toBeCloseTo(dragged.azimuth, 1)
})

test('touch input orbits the viewport, including on a vertical drag', async ({ page }) => {
  // The previous attempt shipped an iPad bug where only horizontal orbit
  // worked, because vertical drags were being taken by page scrolling.
  const start = await cameraState(page)
  await dragCanvas(page, { dx: 0, dy: 60, pointerType: 'touch' })
  await camera(page, 'elevation').toBeCloseTo(start.elevation + 24, 0)

  await dragCanvas(page, { dx: 60, dy: 0, pointerType: 'touch' })
  await camera(page, 'azimuth').toBeCloseTo(start.azimuth - 24, 0)
})

test('a two-finger pinch zooms', async ({ page }) => {
  const start = await cameraState(page)
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    if (!canvas) throw new Error('no canvas')
    const box = canvas.getBoundingClientRect()
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    /** @param {string} type @param {number} id @param {number} x @param {number} y */
    const fire = (type, id, x, y) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: 'touch',
          isPrimary: id === 1,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      )
    fire('pointerdown', 1, cx - 40, cy)
    fire('pointerdown', 2, cx + 40, cy)
    // Fingers spread apart → zoom in.
    fire('pointermove', 1, cx - 90, cy)
    fire('pointermove', 2, cx + 90, cy)
    fire('pointerup', 1, cx - 90, cy)
    fire('pointerup', 2, cx + 90, cy)
  })
  await camera(page, 'distance').toBeLessThan(start.distance)
})

test('taps land on the gizmo and the chrome on touch-capable projects', async ({
  page,
  browserName,
  hasTouch,
}) => {
  test.skip(!hasTouch, `${browserName} project has no touch emulation`)
  await page.getByTestId('gizmo-view-top').tap()
  await camera(page, 'elevation').toBeCloseTo(90, 1)

  await page.getByTestId('nav-zoom-out').tap()
  await camera(page, 'distance').toBeGreaterThan(420)
})

test('the overlays stay on screen and tappable, and the page never scrolls sideways', async ({
  page,
}, testInfo) => {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)

  const pageBox = page.viewportSize()
  for (const id of [
    'orientation-gizmo',
    'navigation-chrome',
    'grid-scale-readout',
    'gizmo-view-home',
  ]) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box, id).not.toBeNull()
    expect(box?.x ?? -1, `${id} off the left edge`).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0), `${id} off the right edge`).toBeLessThanOrEqual(
      (pageBox?.width ?? 0) + 1,
    )
  }

  // Tap targets stay usable at 390px (CLAUDE.md Responsive Layout).
  for (const id of ['nav-step-up', 'nav-zoom-in', 'nav-reset']) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box?.height ?? 0, id).toBeGreaterThanOrEqual(36)
    expect(box?.width ?? 0, id).toBeGreaterThanOrEqual(36)
  }
  for (const id of ['gizmo-view-top', 'gizmo-view-front']) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box?.height ?? 0, id).toBeGreaterThanOrEqual(28)
  }

  // TODO/ui-019: the settings gear adds nothing to the chrome's footprint
  // while closed (already covered by the `navigation-chrome` bounds check
  // above, which includes it), but opening its preset popover must not push
  // it — or any of the other chrome/gizmo controls it sits beside — off
  // screen, at the tightest reference viewport included in this test's own
  // matrix.
  await page.getByTestId('nav-settings-gear').click()
  const panel = page.getByTestId('nav-settings-panel')
  await expect(panel).toBeVisible()
  const panelBox = await panel.boundingBox()
  expect(panelBox?.x ?? -1, 'nav-settings-panel off the left edge').toBeGreaterThanOrEqual(0)
  expect(
    (panelBox?.x ?? 0) + (panelBox?.width ?? 0),
    'nav-settings-panel off the right edge',
  ).toBeLessThanOrEqual((pageBox?.width ?? 0) + 1)
  for (const id of ['orientation-gizmo', 'gizmo-view-home', 'grid-scale-readout']) {
    const box = await page.getByTestId(id).boundingBox()
    // Standard axis-aligned rectangle intersection: two boxes overlap unless
    // one is entirely to the left/right/above/below the other on some axis.
    const overlaps =
      box &&
      panelBox &&
      box.x < panelBox.x + panelBox.width &&
      box.x + box.width > panelBox.x &&
      box.y < panelBox.y + panelBox.height &&
      box.y + box.height > panelBox.y
    // These sit far enough from the bottom-left chrome cluster that an
    // upward-opening popover there should never reach them.
    expect(overlaps, `nav-settings-panel crowds ${id}`).toBe(false)
  }
  await page.getByTestId('nav-settings-gear').click()
  await expect(panel).toHaveCount(0)

  // Visual snapshot per viewport × engine project. Captured as an artifact
  // rather than pixel-diffed: WebGL output legitimately differs between engines
  // and GPUs, so a golden-image assertion here would be flaky by construction.
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const file = join(SNAPSHOT_DIR, `${testInfo.project.name}.png`)
  await page.screenshot({ path: file })
  await testInfo.attach(`viewport-${testInfo.project.name}`, { path: file, contentType: 'image/png' })
})
