// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Frame time during a continuous mouse orbit of the 3D view (`TODO/render-008`: the theme bridge
 * must not cost a frame). A real left-drag circles the canvas for `--seconds`; every
 * requestAnimationFrame delta is recorded after a warm-up, and the p50 / p95 / p99 / worst frame
 * are reported per run and pooled. Production build; headless Chromium uses a software rasterizer,
 * so GPU cost is not represented.
 *
 * Usage (a server must already be running):
 *   npm run build && npx vite preview --port 4173 &
 *   node bench/orbit-frame-time.mjs --url http://localhost:4173 --runs 5 --label after
 *
 * @module bench/orbit-frame-time
 */

import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
/** @param {string} flag @param {string} [fallback] */
const option = (flag, fallback) => {
  const index = args.indexOf(flag)
  return index === -1 ? fallback : args[index + 1]
}
const URL_BASE = option('--url', 'http://localhost:4173')
const RUNS = Number(option('--runs', '5'))
const SECONDS = Number(option('--seconds', '5'))
const LABEL = option('--label', 'run')

const RECORDS = [
  { id: 'a', op: 'primitive.cuboid', name: 'Box', params: { size: [40, 30, 20], center: [0, 0, 10] } },
  { id: 'b', op: 'primitive.cuboid', name: 'Block', params: { size: [30, 30, 30], center: [50, 0, 15] } },
]

/** @param {number[]} samples */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (/** @type {number} */ q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
  return { n: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), worst: sorted[sorted.length - 1], over16: sorted.filter((v) => v > 16.7).length }
}
const f = (/** @type {number} */ v) => v.toFixed(1)

const browser = await chromium.launch()
/** @type {number[]} */
const pooled = []
for (let run = 0; run < RUNS; run += 1) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
  await page.goto(URL_BASE)
  await page.waitForSelector('[data-testid="viewport"][data-webgl="ready"]')
  await page.getByTestId('file-menu-button').click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  const chooser = await chooserEvent
  const text = RECORDS.map((r) => JSON.stringify(r)).join('\n') + '\n'
  await chooser.setFiles({ name: 'orbit.ndjson', mimeType: 'text/plain', buffer: Buffer.from(text) })
  await page.waitForFunction(() => document.querySelector('[data-testid="viewport"]')?.getAttribute('data-body-count') === '2')

  await page.evaluate(() => {
    const watch = { on: false, last: performance.now(), deltas: /** @type {number[]} */ ([]) }
    Object.assign(window, { __orbitWatch: watch })
    const tick = () => {
      const now = performance.now()
      if (watch.on) watch.deltas.push(now - watch.last)
      watch.last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const box = await page.getByTestId('viewport').boundingBox()
  if (!box) throw new Error('no viewport box')
  const cx = box.x + box.width * 0.6
  const cy = box.y + box.height * 0.5
  const radius = Math.min(box.width, box.height) * 0.2
  await page.mouse.move(cx + radius, cy)
  await page.mouse.down()
  // warm-up: 30 frames' worth of orbit, then record
  const t0 = Date.now()
  let angle = 0
  let recording = false
  while (Date.now() - t0 < SECONDS * 1000 + 600) {
    angle += 0.08
    await page.mouse.move(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle))
    if (!recording && Date.now() - t0 > 600) {
      recording = true
      await page.evaluate(() => { /** @type {any} */ (window).__orbitWatch.on = true })
    }
  }
  await page.mouse.up()
  const deltas = await page.evaluate(() => { const w = /** @type {any} */ (window).__orbitWatch; w.on = false; return w.deltas })
  pooled.push(...deltas)
  const s = stats(deltas)
  console.log(`${LABEL} run ${run + 1}: n=${s.n} p50=${f(s.p50)} p95=${f(s.p95)} p99=${f(s.p99)} worst=${f(s.worst)} over16.7=${s.over16}`)
  await context.close()
}
const s = stats(pooled)
console.log(`${LABEL} POOLED: n=${s.n} p50=${f(s.p50)} p95=${f(s.p95)} p99=${f(s.p99)} worst=${f(s.worst)} over16.7=${s.over16}`)
await browser.close()
