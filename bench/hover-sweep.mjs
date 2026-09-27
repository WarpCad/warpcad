/**
 * What the object list's hover highlight costs while a pointer sweeps down a fully
 * expanded Raspberry Pi's part rows (`TODO/ui-049`).
 *
 * The hover repaints at **change** rate, not pointer rate: each row fires `pointerenter`
 * once, the store refuses a repeat write, and the viewport adds/removes one set of x-ray
 * twins (plus, for a hidden part, one transient mesh) per change. This measures whether
 * that holds in a real browser: a real mouse (`page.mouse.move` in small steps, so the
 * browser dispatches genuine pointer events) sweeps down and back up all 23 part rows of
 * a Pi standing inside a case — the scene the list exists for — and every animation-frame
 * delta during the sweep is recorded.
 *
 * **Control:** the identical pointer path, shifted onto the Library column, where moving
 * the pointer changes nothing. The difference between the two distributions is the
 * hover's own cost.
 *
 * Also recorded per run: how many hover changes the sweep produced (should be ~2 per row
 * crossed, a leave and an enter, never one per pointer event), the change-to-next-frame
 * latency, and the JS heap before and after ten sweeps (twins and transient meshes are
 * created and disposed on every change; a heap that climbs across identical sweeps is a
 * leak).
 *
 * Production build, per `perf-benchmark.md` rule 2; the scene is loaded through
 * **File ▾ → Open…**. CPU throttling (CDP) stands in for a phone and is Chromium-only.
 * Headless Chromium uses a software rasterizer: GPU cost is not represented.
 *
 * Usage (a server must already be running):
 *   npm run build && npx vite preview --port 4173 &
 *   node bench/hover-sweep.mjs --url http://localhost:4173 --runs 5 --rates 1,4,6
 *
 * @module bench/hover-sweep
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
const RATES = (option('--rates', '1,4,6') ?? '1,4,6').split(',').map(Number)
/** Pointer-move steps between two adjacent row centres (a slow, human-ish sweep). */
const STEPS_PER_ROW = Number(option('--steps', '6'))
const HEAP_SWEEPS = Number(option('--heap-sweeps', '10'))

/** A 100 x 70 x 40 case with a Raspberry Pi B+ entirely inside it. */
const RECORDS = [
  { id: 'shell', op: 'primitive.cuboid', name: 'Shell 1', params: { size: [100, 70, 40], center: [42, 27, 10] } },
  { id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: {} },
]

/** @param {number[]} samples */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (/** @type {number} */ q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
  return {
    n: sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    worst: sorted[sorted.length - 1],
    over16: sorted.filter((value) => value > 16.7).length,
  }
}

/** @param {number} value */
const ms = (value) => (value === undefined ? '—' : value.toFixed(1))

/**
 * Sweep the mouse through `points` (down, then back up), `STEPS_PER_ROW` moves per gap.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ x: number, y: number }[]} points
 */
async function sweep(page, points) {
  const path = [...points, ...[...points].reverse()]
  await page.mouse.move(path[0].x, path[0].y)
  for (let index = 1; index < path.length; index += 1) {
    await page.mouse.move(path[index].x, path[index].y, { steps: STEPS_PER_ROW })
  }
}

const browser = await chromium.launch()
/** @type {Record<string, any>} */
const report = { url: URL_BASE, runs: RUNS, stepsPerRow: STEPS_PER_ROW, rates: {} }

for (const rate of RATES) {
  /** @type {{ hover: number[], control: number[], latency: number[], changes: number[], moves: number[], heapDeltaKb: number[] }} */
  const acc = { hover: [], control: [], latency: [], changes: [], moves: [], heapDeltaKb: [] }

  for (let run = 0; run < RUNS; run += 1) {
    // Tall enough that all 23 part rows are on screen at once — a pointer cannot hover a
    // row scrolled out of view, and scrolling mid-sweep would measure the scroll instead.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1800 } })
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
    const chooser = await chooserEvent
    const text = RECORDS.map((record) => JSON.stringify(record)).join('\n') + '\n'
    await chooser.setFiles({ name: 'hover-sweep.ndjson', mimeType: 'text/plain', buffer: Buffer.from(text) })
    await page.waitForFunction(() => document.querySelector('[data-testid="viewport"]')?.getAttribute('data-body-count') === '2')
    // Loading a file leaves nothing selected: the Inspector *is* the object list.
    await page.getByTestId('object-list').waitFor()
    await page.getByTestId('objects-expand-pi').click()
    await page.getByTestId('objects-part-item-pi-hole4').waitFor()

    // Frame deltas and hover changes, recorded in the page; only arrays come back.
    await page.evaluate(() => {
      const watch = { on: false, last: performance.now(), deltas: /** @type {number[]} */ ([]), changes: 0, latency: /** @type {number[]} */ ([]), pendingChangeAt: -1 }
      Object.assign(window, { __hoverWatch: watch })
      const tick = () => {
        const now = performance.now()
        if (watch.on) {
          watch.deltas.push(now - watch.last)
          if (watch.pendingChangeAt >= 0) {
            watch.latency.push(now - watch.pendingChangeAt)
            watch.pendingChangeAt = -1
          }
        }
        watch.last = now
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      const viewport = document.querySelector('[data-testid="viewport"]')
      new MutationObserver(() => {
        if (!watch.on) return
        watch.changes += 1
        if (watch.pendingChangeAt < 0) watch.pendingChangeAt = performance.now()
      }).observe(/** @type {Element} */ (viewport), { attributes: true, attributeFilter: ['data-hover'] })
      let moves = 0
      window.addEventListener('pointermove', () => {
        if (watch.on) moves += 1
      }, { capture: true })
      Object.assign(watch, { moves: () => moves, resetMoves: () => { moves = 0 } })
    })

    const rows = await page.$$eval('[data-testid^="objects-part-item-pi-"]', (nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect()
        return { x: box.left + box.width * 0.6, y: box.top + box.height / 2 }
      }),
    )
    if (rows.length !== 23) throw new Error(`expected 23 part rows, found ${rows.length}`)
    const library = await page.getByTestId('library-panel').boundingBox()
    const controlPath = rows.map((point) => ({ x: /** @type {any} */ (library).x + 100, y: point.y }))

    await page.waitForTimeout(1000)
    if (rate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate })

    // Warm-up pass, discarded (perf-benchmark.md: warm up before recording).
    await sweep(page, rows)
    await page.mouse.move(4, 4)
    await page.waitForTimeout(300)

    /** @param {{ x: number, y: number }[]} path */
    const measured = async (path) => {
      await page.evaluate(() => {
        const watch = /** @type {any} */ (window).__hoverWatch
        watch.deltas = []
        watch.latency = []
        watch.changes = 0
        watch.pendingChangeAt = -1
        watch.resetMoves()
        watch.last = performance.now()
        watch.on = true
      })
      await sweep(page, path)
      await page.mouse.move(4, 4)
      await page.waitForTimeout(200)
      return page.evaluate(() => {
        const watch = /** @type {any} */ (window).__hoverWatch
        watch.on = false
        return { deltas: watch.deltas, latency: watch.latency, changes: watch.changes, moves: watch.moves() }
      })
    }

    const control = await measured(controlPath)
    const hovered = await measured(rows)
    acc.control.push(...control.deltas.slice(3))
    acc.hover.push(...hovered.deltas.slice(3))
    acc.latency.push(...hovered.latency)
    acc.changes.push(hovered.changes)
    acc.moves.push(hovered.moves)

    // Leak check: heap after GC, before and after N more identical sweeps.
    await session.send('HeapProfiler.enable')
    await session.send('HeapProfiler.collectGarbage')
    const before = (await session.send('Runtime.getHeapUsage')).usedSize
    for (let index = 0; index < HEAP_SWEEPS; index += 1) {
      await sweep(page, rows)
      await page.mouse.move(4, 4)
    }
    await page.waitForTimeout(300)
    await session.send('HeapProfiler.collectGarbage')
    const after = (await session.send('Runtime.getHeapUsage')).usedSize
    acc.heapDeltaKb.push((after - before) / 1024)

    if (rate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await context.close()
  }

  const hover = stats(acc.hover)
  const control = stats(acc.control)
  const latency = stats(acc.latency)
  report.rates[rate] = { hover, control, latency, changes: acc.changes, pointerMoves: acc.moves, heapDeltaKb: acc.heapDeltaKb }
  console.log(`\n## CPU ${rate}x — ${RUNS} runs, 23 rows down and back up, ${STEPS_PER_ROW} moves per row`)
  console.log(`| sweep | frames | p50 | p95 | p99 | worst | frames > 16.7 ms |`)
  console.log(`|---|---|---|---|---|---|---|`)
  console.log(`| control (Library column) | ${control.n} | ${ms(control.p50)} | ${ms(control.p95)} | ${ms(control.p99)} | ${ms(control.worst)} | ${control.over16} |`)
  console.log(`| hover (Pi part rows) | ${hover.n} | ${ms(hover.p50)} | ${ms(hover.p95)} | ${ms(hover.p99)} | ${ms(hover.worst)} | ${hover.over16} |`)
  console.log(`hover change -> next frame: p50 ${ms(latency.p50)} ms, p95 ${ms(latency.p95)} ms, worst ${ms(latency.worst)} ms (${latency.n} changes)`)
  console.log(`hover changes per sweep: ${acc.changes.join(', ')}; pointer moves per sweep: ${acc.moves.join(', ')}`)
  console.log(`heap delta after ${HEAP_SWEEPS} more sweeps (KB, after GC): ${acc.heapDeltaKb.map((kb) => kb.toFixed(0)).join(', ')}`)
}

await browser.close()
const jsonOut = option('--json')
if (jsonOut) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(jsonOut, JSON.stringify(report, null, 2))
}
