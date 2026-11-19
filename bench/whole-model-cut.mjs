// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The whole-model Subtract of a dense 3MF, measured on the main thread (`TODO/core-085`).
 * Run through `evaluation-mainthread.mjs --only whole-model-cut`; see that file's header for
 * what is measured and how the window is split into the **click** and **landing** moments.
 *
 * @module bench/whole-model-cut
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { denseThreeMf } from '../src/io/__fixtures__/threeMf.js'
import { importModel, openObjectList } from '../e2e/support/importModel.js'
import { closeLibrary, openLibrary, pointer, viewportPoint } from '../e2e/support/humanInput.js'

/** What `e2e/support/humanInput.js` needs to know of a Playwright project: laptop, real mouse. */
const LAPTOP = /** @type {any} */ ({ project: { name: 'chromium-laptop', use: {} } })

/** @param {number[]} samples */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (/** @type {number} */ q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
  return { n: sorted.length, min: sorted[0], median: at(0.5), worst: sorted[sorted.length - 1] }
}

/**
 * Install the page-side watchers: zero-delay timer gaps, animation-frame gaps and Long Tasks,
 * each with its start time, so the window can be split after the fact.
 *
 * @param {import('@playwright/test').Page} page
 */
async function installWatch(page) {
  await page.evaluate(() => {
    const watch = { on: false, timer: /** @type {number[][]} */ ([]), frame: /** @type {number[][]} */ ([]), long: /** @type {number[][]} */ ([]), clickAt: 0, rowAt: 0 }
    Object.assign(window, { __cutWatch: watch })
    let lastTimer = performance.now()
    const tick = () => {
      const now = performance.now()
      if (watch.on && now - lastTimer > 4) watch.timer.push([lastTimer, now - lastTimer])
      lastTimer = now
      setTimeout(tick, 0)
    }
    setTimeout(tick, 0)
    let lastFrame = performance.now()
    const frame = () => {
      const now = performance.now()
      if (watch.on) watch.frame.push([lastFrame, now - lastFrame])
      lastFrame = now
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      new PerformanceObserver((list) => {
        if (watch.on) for (const entry of list.getEntries()) watch.long.push([entry.startTime, entry.duration])
      }).observe({ type: 'longtask' })
    }
    // The moment the cut row appears in the scene list: the landing has happened by then.
    const list = document.querySelector('[data-testid="scene-bodies"]')
    if (list) {
      new MutationObserver(() => {
        if (watch.on && watch.rowAt === 0 && list.querySelector('li[data-body-op="boolean.subtract"]')) watch.rowAt = performance.now()
      }).observe(list, { childList: true, subtree: true, attributes: true })
    }
  })
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {{ url: string, runs: number, rates: number[], mesh?: string, profileDir?: string, warmCube?: boolean, cubeTarget?: boolean }} options
 * @returns {Promise<any[]>} One row per CPU rate.
 */
export async function wholeModelCut(browser, options) {
  const bytes = options.mesh ? readFileSync(options.mesh) : Buffer.from(await denseThreeMf())
  const name = options.mesh ? basename(options.mesh) : 'dense.3mf'
  const file = { name, mimeType: 'model/3mf', buffer: bytes }
  console.log(`whole-model-cut: ${name}, ${(bytes.length / 1e6).toFixed(2)} MB${options.mesh ? '' : ' (generated: denseThreeMf)'}`)
  const rows = []
  for (const rate of options.rates) {
    /** @type {Record<string, number[]>} */
    const samples = { clickTimer: [], clickFrame: [], clickLong: [], landTimer: [], landFrame: [], landLong: [], pending: [], idleTimer: [], idleFrame: [], redrawTimer: [], redrawFrame: [] }
    for (let run = 0; run < options.runs; run += 1) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await context.newPage()
      const session = await context.newCDPSession(page)
      await page.goto(options.url)
      await page.waitForSelector('[data-testid="viewport"]')
      const input = await pointer(page, LAPTOP)
      const ids = []
      // `--cube-target`: the e2e's scene — the model once, a Cube dropped on it, the whole model cut
      // from the Cube (the result is small, so the landing is the app's share, not the rasteriser's).
      for (const at of options.cubeTarget ? [[0.45, 0.5]] : [[0.3, 0.5], [0.7, 0.5]]) {
        await importModel(page, input.press, file)
        await page.getByTestId('placement-chip').waitFor({ timeout: 120_000 })
        const p = await viewportPoint(page, at[0], at[1])
        await input.placeArmed(p.x, p.y)
        await page.getByTestId('placement-chip').waitFor({ state: 'detached', timeout: 120_000 })
        await page.waitForFunction((count) => Number(document.querySelector('[data-testid="viewport"]')?.getAttribute('data-body-count')) === count, ids.length + 1, { timeout: 120_000 })
        ids.push(await page.$$eval('[data-testid="scene-bodies"] > li', (items) => items.at(-1)?.getAttribute('data-body-id')))
      }
      if (options.cubeTarget) {
        await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="scene-bodies"] > li')].every((item) => item.hasAttribute('data-body-volume')), null, { timeout: 300_000, polling: 200 })
        await openLibrary(page, input.press)
        const onModel = await viewportPoint(page, 0.45, 0.5)
        await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), onModel.x, onModel.y)
        await page.waitForFunction(() => Number(document.querySelector('[data-testid="viewport"]')?.getAttribute('data-body-count')) === 2, null, { timeout: 60_000 })
        await closeLibrary(page, input.press)
        ids.unshift(await page.$$eval('[data-testid="scene-bodies"] > li', (items) => items.find((item) => item.getAttribute('data-body-op') === 'primitive.cuboid')?.getAttribute('data-body-id')))
      }
      if (options.warmCube) {
        // `--warm-cube`: a Cube placed well away from the models first, so the plain body material
        // the cut's result draws with has been drawn once already.
        await openLibrary(page, input.press)
        const corner = await viewportPoint(page, 0.9, 0.85)
        await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), corner.x, corner.y)
        await page.waitForFunction(() => Number(document.querySelector('[data-testid="viewport"]')?.getAttribute('data-body-count')) === 3, null, { timeout: 60_000 })
        await closeLibrary(page, input.press)
      }
      // Let both models' measurements land (the worker unions each), and the autosave drain.
      await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="scene-bodies"] > li')].every((item) => item.hasAttribute('data-body-volume')), null, { timeout: 300_000, polling: 200 })
      await openObjectList(page, input.press)
      await input.press(page.getByTestId(`objects-row-${ids[0]}`))
      await openObjectList(page, input.press)
      await input.press(page.getByTestId(`objects-check-${ids[1]}`))
      await page.waitForFunction(() => document.querySelector('[data-testid="viewport"]')?.getAttribute('data-selected-count') === '2')
      await installWatch(page)
      const heapMb = await page.evaluate(() => Math.round((/** @type {any} */ (performance).memory?.usedJSHeapSize ?? 0) / 1e6))
      await page.waitForTimeout(2000)
      if (rate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate })
      if (options.profileDir) {
        await session.send('Profiler.enable')
        await session.send('Profiler.setSamplingInterval', { interval: 200 })
        await session.send('Profiler.start')
      }
      // The redraw floor: one wheel notch over the canvas, which only redraws the scene. On a
      // software rasteriser a frame of two dense models is far from free, and the landing has to
      // draw one too; read the landing against this.
      const canvas = await page.getByTestId('viewport-canvas').boundingBox()
      if (!canvas) throw new Error('no canvas')
      await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.15)
      const redrawFrom = await page.evaluate(() => {
        const watch = /** @type {any} */ (window).__cutWatch
        watch.on = true
        return performance.now()
      })
      await page.mouse.wheel(0, 120)
      await page.waitForTimeout(800)
      const redraw = await page.evaluate((from) => {
        const watch = /** @type {any} */ (window).__cutWatch
        watch.on = false
        const worst = (/** @type {number[][]} */ list) => Math.max(0, ...list.filter(([start]) => start >= from).map(([, length]) => length))
        const result = { timer: worst(watch.timer), frame: worst(watch.frame) }
        watch.timer = []
        watch.frame = []
        watch.long = []
        return result
      }, redrawFrom)
      samples.redrawTimer.push(redraw.timer)
      samples.redrawFrame.push(redraw.frame)
      await page.waitForTimeout(500)
      const button = page.getByTestId('operation-subtract')
      const box = await button.boundingBox()
      if (!box) throw new Error('no Subtract button')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 })
      await page.evaluate(() => {
        const watch = /** @type {any} */ (window).__cutWatch
        watch.on = true
        watch.clickAt = performance.now()
      })
      await page.mouse.down()
      await page.mouse.up()
      await page.waitForFunction(() => {
        const cut = document.querySelector('[data-testid="scene-bodies"] li[data-body-op="boolean.subtract"]')
        return cut?.hasAttribute('data-body-volume') && !document.querySelector('[data-testid="operation-pending"]')
      }, null, { timeout: 600_000, polling: 100 })
      await page.waitForTimeout(1000)
      const watch = await page.evaluate(() => {
        const state = /** @type {any} */ (window).__cutWatch
        state.on = false
        return state
      })
      if (options.profileDir) {
        const { profile } = await session.send('Profiler.stop')
        mkdirSync(options.profileDir, { recursive: true })
        writeFileSync(join(options.profileDir, `whole-model-cut-${rate}x-run${run + 1}.cpuprofile`), JSON.stringify(profile))
      }
      if (rate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      const split = (watch.clickAt + watch.rowAt) / 2
      const worst = (/** @type {number[][]} */ list, /** @type {boolean} */ landing) =>
        Math.max(0, ...list.filter(([start]) => (landing ? start >= split : start < split)).map(([, length]) => length))
      samples.clickTimer.push(worst(watch.timer, false))
      samples.clickFrame.push(worst(watch.frame, false))
      samples.clickLong.push(worst(watch.long, false))
      samples.landTimer.push(worst(watch.timer, true))
      samples.landFrame.push(worst(watch.frame, true))
      samples.landLong.push(worst(watch.long, true))
      samples.pending.push(watch.rowAt - watch.clickAt)
      // The floor this browser sets on its own: the worst gaps while the worker computes and the
      // main thread has nothing of the cut's to do (1.5 s clear of both moments). On a software
      // rasteriser a frame of two dense models is not free, so read the moments against this.
      const quiet = (/** @type {number[][]} */ list) =>
        Math.max(0, ...list.filter(([start]) => start > watch.clickAt + 1500 && start < watch.rowAt - 1500).map(([, length]) => length))
      samples.idleTimer.push(quiet(watch.timer))
      samples.idleFrame.push(quiet(watch.frame))
      const longs = (/** @type {boolean} */ landing) =>
        watch.long.filter(([start]) => (landing ? start >= split : start < split)).map(([, length]) => length.toFixed(0)).join(', ') || 'none'
      console.log(
        `  run ${run + 1} cpu ${rate}x: click timer gap ${samples.clickTimer.at(-1).toFixed(0)} ms, frame gap ${samples.clickFrame.at(-1).toFixed(0)} ms, long tasks [${longs(false)}]` +
          ` | landing timer gap ${samples.landTimer.at(-1).toFixed(0)} ms, frame gap ${samples.landFrame.at(-1).toFixed(0)} ms, long tasks [${longs(true)}] | click→row ${samples.pending.at(-1).toFixed(0)} ms | idle floor: timer gap ${samples.idleTimer.at(-1).toFixed(0)} ms, frame gap ${samples.idleFrame.at(-1).toFixed(0)} ms | redraw floor: timer gap ${samples.redrawTimer.at(-1).toFixed(0)} ms, frame gap ${samples.redrawFrame.at(-1).toFixed(0)} ms | JS heap before the click ${heapMb} MB`,
      )
      await context.close()
    }
    const row = { scene: name, rate, interaction: 'whole-model-cut', ...Object.fromEntries(Object.entries(samples).map(([key, list]) => [key, stats(list)])) }
    rows.push(row)
    console.log(
      `${name} cpu ${rate}x whole-model-cut | click: timer gap median ${row.clickTimer.median.toFixed(0)} ms (worst ${row.clickTimer.worst.toFixed(0)}), longest long task median ${row.clickLong.median.toFixed(0)} ms` +
        ` | landing: timer gap median ${row.landTimer.median.toFixed(0)} ms (worst ${row.landTimer.worst.toFixed(0)}), longest long task median ${row.landLong.median.toFixed(0)} ms | click→row median ${row.pending.median.toFixed(0)} ms | idle floor: timer gap median ${row.idleTimer.median.toFixed(0)} ms, frame gap median ${row.idleFrame.median.toFixed(0)} ms | redraw floor: timer gap median ${row.redrawTimer.median.toFixed(0)} ms, frame gap median ${row.redrawFrame.median.toFixed(0)} ms`,
    )
  }
  return rows
}
