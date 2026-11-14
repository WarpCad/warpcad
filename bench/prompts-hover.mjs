// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Hover-to-painted in the Prompts view, on a real project file (`TODO/ui-092` check 1, driven by
 * `TODO/testing-018`).
 *
 * Pointing at a request row (or one of its part rows) lights its parts in the 3D view: a tint, plus
 * x-ray twins for parts hidden inside another body. This measures, for every hover target of a
 * project, the time from the `pointerover` event's delivery to the frame that follows the one that
 * rendered the change (the viewport's `data-hover-bodies` flips, `data-frames-rendered` advances, then
 * one more animation frame), and every animation-frame delta while the pointer works the rows, against
 * a control that moves over a blank part of the Inspector.
 *
 * The project is a **file path argument**: a person's own project is never committed, so the benchmark
 * is reproducible only against the same file. It is read, never written; the app autosaves into the
 * throwaway browser profile Playwright creates, not the file.
 *
 * Production build, per `perf-benchmark.md` rule 2; the file is loaded through **File ▾ → Open…**.
 * CPU throttling (CDP) stands in for a phone. Headless Chromium uses a software rasterizer: GPU cost is
 * not represented.
 *
 * Usage (a server must already be running):
 *   npm run build && npx vite preview --port 4173 &
 *   node bench/prompts-hover.mjs --url http://127.0.0.1:4173 --file /path/to/project.ndjson --runs 5 --rates 1,4
 *
 * @module bench/prompts-hover
 */

import { chromium } from '@playwright/test'
import { basename } from 'node:path'

const args = process.argv.slice(2)
/** @param {string} flag @param {string} [fallback] */
const option = (flag, fallback) => {
  const index = args.indexOf(flag)
  return index === -1 ? fallback : args[index + 1]
}

const URL_BASE = option('--url', 'http://127.0.0.1:4173')
const FILE = option('--file')
const RUNS = Number(option('--runs', '5'))
/** The tall viewport keeps every request row and part row on screen, clear of the offline toast. */
const RATES = (option('--rates', '1,4') ?? '1,4').split(',').map(Number)
/** Enter-and-leave cycles per hover target, per run. */
const CYCLES = Number(option('--cycles', '25'))
const JSON_OUT = option('--json')
if (!FILE) throw new Error('--file <project.ndjson> is required')

/** @param {number[]} samples */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (/** @type {number} */ q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
  return { n: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), worst: sorted[sorted.length - 1], over16: sorted.filter((value) => value > 25).length }
}
/** @param {number | undefined} value */
const ms = (value) => (value === undefined ? '—' : value.toFixed(1))

const browser = await chromium.launch()
/** @type {Record<string, any>} */
const report = { url: URL_BASE, file: basename(/** @type {string} */ (FILE)), runs: RUNS, cycles: CYCLES, rates: {} }

for (const rate of RATES) {
  /** @type {Record<string, { enter: number[], mutation: number[], render: number[], leave: number[], twins: number[], lit: number[], transient: number }>} */
  const byTarget = {}
  /** @type {number[]} */
  const hoverDeltas = []
  /** @type {number[]} */
  const controlDeltas = []

  for (let run = 0; run < RUNS; run += 1) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1300 } })
    const page = await context.newPage()
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    })
    const session = await context.newCDPSession(page)
    await page.goto(URL_BASE)
    await page.waitForSelector('[data-testid="viewport"][data-webgl="ready"]')
    await page.getByTestId('file-menu-button').click()
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('file-open').click()
    await (await chooserEvent).setFiles(/** @type {string} */ (FILE))
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="viewport"]')?.getAttribute('data-body-count')) > 0, null, { timeout: 90_000 })
    await page.waitForTimeout(8000)
    await page.getByTestId('inspector-prompts-open').click()
    await page.getByTestId('prompts-view').waitFor()

    // Watcher in the page: pointerover time, hover change, the render that follows, the next frame.
    await page.evaluate(() => {
      const viewport = /** @type {Element} */ (document.querySelector('[data-testid="viewport"]'))
      const watch = { on: false, last: performance.now(), deltas: /** @type {number[]} */ ([]), over: -1, results: /** @type {any[]} */ ([]) }
      Object.assign(window, { __w: watch })
      const frames = () => Number(viewport.getAttribute('data-frames-rendered'))
      const tick = () => {
        const now = performance.now()
        if (watch.on) watch.deltas.push(now - watch.last)
        watch.last = now
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      /**
       * One hover change: a one-shot frame chain started when the attribute flips. The first callback
       * that finds `data-frames-rendered` advanced is the frame that drew the change; the callback after
       * it is the next vsync (its timestamp is the frame's start), by which the drawn frame has been
       * presented. Input is delivered ahead of the frame's animation callbacks, so the change is usually
       * drawn in the frame it arrived in.
       */
      const follow = (/** @type {any} */ p) => {
        requestAnimationFrame((now) => {
          if (!p.rendered) {
            if (frames() > p.framesAtChange) {
              p.rendered = true
              p.renderMs = performance.now() - p.t0
            }
            follow(p)
          } else {
            watch.results.push({ lit: p.lit, twins: p.twins, transient: p.transient, ms: now - p.t0, renderMs: p.renderMs, mutationMs: p.mutationMs })
          }
        })
      }
      document.addEventListener('pointerover', (event) => { if (watch.on) watch.over = performance.now() }, true)
      // `performance.now()` at delivery, not `event.timeStamp`: Chromium delivers input aligned to a frame, so
      // the stamp predates delivery by up to one frame, which is the browser's cost and not the app's.
      // A leave changes the hover on `pointerout`, before the next element's `pointerover`.
      document.addEventListener('pointerout', (event) => { if (watch.on) watch.over = performance.now() }, true)
      new MutationObserver(() => {
        if (!watch.on || watch.over < 0) return
        const lit = (viewport.getAttribute('data-hover-bodies') ?? '').split(',').filter(Boolean).length
        const transient = (viewport.getAttribute('data-hover-transient') ?? '').length > 0
        const p = { t0: watch.over, mutationMs: performance.now() - watch.over, framesAtChange: frames(), rendered: false, renderMs: 0, lit, twins: Number(viewport.getAttribute('data-hover-twins')), transient }
        watch.over = -1
        follow(p)
      }).observe(viewport, { attributes: true, attributeFilter: ['data-hover-bodies', 'data-hover-transient'] })
    })

    // Hover targets: each collapsed request row, then each part row of the first expanded request.
    const rowBoxes = await page.getByTestId('prompts-row').evaluateAll((nodes) => nodes.map((node) => { const b = node.getBoundingClientRect(); return { x: b.left + b.width * 0.5, y: b.top + b.height / 2 } }))
    /** @type {{ name: string, x: number, y: number }[]} */
    const targets = rowBoxes.map((box, index) => ({ name: `request row ${index + 1} (collapsed)`, ...box }))
    await page.getByTestId('prompts-row').first().click()
    await page.waitForTimeout(400)
    await page.mouse.move(4, 4)
    const partBoxes = await page.getByTestId('prompts-part').evaluateAll((nodes) => nodes.map((node) => { const b = node.getBoundingClientRect(); return { x: b.left + b.width * 0.5, y: b.top + b.height / 2 } }))
    partBoxes.forEach((box, index) => targets.push({ name: `part row ${index + 1} of request 1`, ...box }))
    // Expanded rows light their parts without a pointer; park the pointer and collapse so the baseline is clean.
    await page.getByTestId('prompts-row').first().click()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(500)
    // After collapsing, part rows are gone; re-expand only for part-row targets (below).

    if (rate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate })

    /** @param {{ x: number, y: number, name: string }} target @param {boolean} measureFrames */
    const cycle = async (target, measureFrames) => {
      await page.mouse.move(target.x - 3, target.y, { steps: 2 })
      await page.mouse.move(target.x, target.y, { steps: 2 })
      await page.waitForTimeout(160)
      await page.mouse.move(4, 4, { steps: 3 })
      await page.waitForTimeout(160)
      void measureFrames
    }

    for (const target of targets) {
      const partTarget = target.name.startsWith('part row')
      // Part rows exist only while the first request is expanded.
      if (partTarget) {
        await page.getByTestId('prompts-row').first().click()
        await page.waitForTimeout(300)
        await page.mouse.move(4, 4)
        await page.waitForTimeout(200)
      }
      const fresh = partTarget
        ? await page.getByTestId('prompts-part').evaluateAll((nodes) => nodes.map((node) => { const b = node.getBoundingClientRect(); return { x: b.left + b.width * 0.5, y: b.top + b.height / 2 } }))
        : null
      const where = partTarget && fresh ? { ...target, ...fresh[Number(target.name.split(' ')[2]) - 1] } : target
      // Warm-up cycles, discarded.
      for (let i = 0; i < 3; i += 1) await cycle(where, false)
      await page.evaluate(() => { const w = /** @type {any} */ (window).__w; w.results = []; w.deltas = []; w.over = -1; w.last = performance.now(); w.on = true })
      for (let i = 0; i < CYCLES; i += 1) await cycle(where, true)
      const got = await page.evaluate(() => { const w = /** @type {any} */ (window).__w; w.on = false; return { results: w.results, deltas: w.deltas } })
      const entry = (byTarget[target.name] ??= { enter: [], mutation: [], render: [], leave: [], twins: [], lit: [], transient: 0 })
      for (const result of got.results) {
        if (partTarget ? result.lit === 1 : result.lit > 0 || result.transient) { if (result.transient) entry.transient += 1; entry.mutation.push(result.mutationMs); entry.render.push(result.renderMs); entry.enter.push(result.ms); entry.twins.push(result.twins); entry.lit.push(result.lit) } else entry.leave.push(result.ms)
      }
      hoverDeltas.push(...got.deltas.slice(3))
      if (partTarget) {
        await page.getByTestId('prompts-row').first().click()
        await page.mouse.move(4, 4)
        await page.waitForTimeout(200)
      }
    }

    // Control: the same number of pointer moves over a part of the Inspector where nothing hovers.
    await page.evaluate(() => { const w = /** @type {any} */ (window).__w; w.deltas = []; w.last = performance.now(); w.on = true })
    const blank = await page.getByTestId('library-panel').boundingBox()
    for (let i = 0; i < CYCLES * targets.length; i += 1) {
      await page.mouse.move(/** @type {any} */ (blank).x + 60, /** @type {any} */ (blank).y + 120, { steps: 2 })
      await page.mouse.move(/** @type {any} */ (blank).x + 120, /** @type {any} */ (blank).y + 180, { steps: 2 })
      await page.waitForTimeout(20)
    }
    const control = await page.evaluate(() => { const w = /** @type {any} */ (window).__w; w.on = false; return w.deltas })
    controlDeltas.push(...control.slice(3))
    if (rate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await context.close()
  }

  const slow = (/** @type {any} */ row) => row.slow
  const rows = Object.entries(byTarget).map(([name, entry]) => ({ name, mutation: stats(entry.mutation), slow: entry.enter.filter((value) => value > 50).length, enter: stats(entry.enter), render: stats(entry.render), transient: entry.transient, leave: stats(entry.leave), twinsMax: Math.max(0, ...entry.twins), litMax: Math.max(0, ...entry.lit) }))
  const hover = stats(hoverDeltas)
  const control = stats(controlDeltas)
  report.rates[rate] = { rows, hover, control }
  console.log(`\n## CPU ${rate}x — ${RUNS} runs, ${CYCLES} enter/leave cycles per target per run`)
  console.log('| target | lit bodies | x-ray twins | transient hovers | pointerover→attribute p50 | enter→drawn p50 | p95 | enter→next vsync after the draw p50 | p95 | p99 | worst | enters > 50 ms | leave→painted p95 | leave worst |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const row of rows) console.log(`| ${row.name} | ${row.litMax} | ${row.twinsMax} | ${row.transient} | ${ms(row.mutation.p50)} | ${ms(row.render.p50)} | ${ms(row.render.p95)} | ${ms(row.enter.p50)} | ${ms(row.enter.p95)} | ${ms(row.enter.p99)} | ${ms(row.enter.worst)} | ${slow(row)} of ${row.enter.n} | ${ms(row.leave.p95)} | ${ms(row.leave.worst)} |`)
  console.log(`frame deltas while hovering: n=${hover.n} p50 ${ms(hover.p50)} p95 ${ms(hover.p95)} p99 ${ms(hover.p99)} worst ${ms(hover.worst)} frames > 25 ms ${hover.over16}`)
  console.log(`frame deltas, control:       n=${control.n} p50 ${ms(control.p50)} p95 ${ms(control.p95)} p99 ${ms(control.p99)} worst ${ms(control.worst)} frames > 25 ms ${control.over16}`)
}

await browser.close()
if (JSON_OUT) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(JSON_OUT, JSON.stringify(report, null, 2))
}
