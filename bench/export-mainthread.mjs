// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * How long an export blocks the main thread, in a real browser (`TODO/perf-001`).
 *
 * `export-benchmark.mjs` measures the *work*; this measures the **freeze** — the gap
 * between animation frames while the export runs, which is what a user actually
 * experiences and what `CLAUDE.md`'s 16 ms frame budget is written against. It drives
 * the real app through the real controls (File ▾ → Export… → Export) and takes the
 * download, so nothing here bypasses the UI.
 *
 * CPU throttling (CDP `Emulation.setCPUThrottlingRate`) stands in for a phone, because
 * `CLAUDE.md`'s Responsive Layout makes a 390×844 phone a first-class target and this
 * machine is 4-6× faster than one. Chromium only — the CDP throttling API is
 * Chromium-specific; WebKit's worker/bundling behaviour is covered by the e2e matrix
 * instead, which is a different question from how fast it is.
 *
 * Usage (the dev server must already be running on 5183, or pass --url):
 *   node bench/export-mainthread.mjs
 *   node bench/export-mainthread.mjs --url http://localhost:4173 --scene union
 *
 * Scenes are seeded through the app's own document store — the same seam
 * `e2e/export-ui.e2e.js` uses, and for the same reason: a 24-body scene is not
 * something a drag can place, and the action under measurement is still a real click.
 *
 * @module bench/export-mainthread
 */

import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
/** @param {string} flag @param {string} [fallback] */
const option = (flag, fallback) => {
  const index = args.indexOf(flag)
  return index === -1 ? fallback : args[index + 1]
}

const URL_BASE = option('--url', 'http://localhost:5183')
const RUNS = Number(option('--runs', '7'))
const RATES = (option('--rates', '1,4,6') ?? '1,4,6').split(',').map(Number)
const FORMATS = (option('--formats', 'stl,glb') ?? 'stl,glb').split(',')
const ONLY = option('--scene')

/**
 * Document records per scene, appended through the store. `union` is what ACCEPTANCE
 * scenario 11 builds by hand; `24-bodies` matches the Node benchmark's row 2.
 *
 * @type {Record<string, { label: string, records: any[] }>}
 */
const SCENES = {
  union: {
    label: 'a Union placed off the origin (scenario 11 step 2)',
    records: [
      { id: 'cyl', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 40, height: 50, center: [-100.89, 66.93, 25] } },
      { id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [-95, 75, 20] } },
    ],
  },
  'pi-board': {
    label: 'one raspberrypi.bplus',
    records: [{ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: {} }],
  },
  // The move carries `consumes` so it absorbs the body it moved: without it a document
  // seeded with 12 + 12 and then moved holds 48 bodies, not 24, and the benchmark would
  // quietly be measuring twice the scene it claims. Laid out on a 150 mm grid so the
  // bodies are genuinely separate solids, matching `export-benchmark.mjs`'s `24-bodies`
  // row body for body (its STL is the same 618,084 bytes).
  '24-bodies': {
    label: '24 bodies (12 Pi boards + 12 bolts)',
    records: Array.from({ length: 12 }, (unused, index) => {
      const at = [(index % 4) * 150, Math.floor(index / 4) * 150, 0]
      return [
        { id: `pi${index}`, op: 'raspberrypi.bplus', name: `Board ${index + 1}`, params: {} },
        {
          id: `pit${index}`,
          op: 'transform.translate',
          name: `Board ${index + 1}`,
          target: `pi${index}`,
          consumes: [`pi${index}`],
          params: { vector: at },
        },
        { id: `bolt${index}`, op: 'hardware.bolt', name: `Bolt ${index + 1}`, params: { spec: 'm10 hex', length: 30 } },
        {
          id: `boltt${index}`,
          op: 'transform.translate',
          name: `Bolt ${index + 1}`,
          target: `bolt${index}`,
          consumes: [`bolt${index}`],
          params: { vector: [at[0] + 70, at[1], 0] },
        },
      ]
    }).flat(),
  },
}

/** @param {number[]} samples */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
  return { n: sorted.length, min: sorted[0], median: at(0.5), p95: at(0.95), worst: sorted[sorted.length - 1] }
}

const fixed = (value) => value.toFixed(1)

const browser = await chromium.launch()
const rows = []

for (const name of ONLY ? [ONLY] : Object.keys(SCENES)) {
  const scene = SCENES[name]
  if (!scene) throw new Error(`unknown scene "${name}"`)

  for (const rate of RATES) {
    for (const format of FORMATS) {
      /** @type {number[]} */
      const blocks = []
      /** @type {number[]} */
      const totals = []
      let pendingSeen = 0
      let bytes = 0

      for (let run = 0; run < RUNS; run += 1) {
        // A FRESH context every run: `io-001` restores the last document from IndexedDB,
        // so a reload would inherit the previous run's scene instead of starting empty.
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        const page = await context.newPage()
        const session = await context.newCDPSession(page)
        await page.goto(URL_BASE)
        await page.waitForSelector('[data-testid="viewport"]')

        await page.evaluate(async (records) => {
          const { useDocumentStore } = await import('/src/stores/document.js')
          const store = useDocumentStore()
          for (const record of records) store.append(record)
        }, scene.records)
        await page.waitForFunction(
          (expected) =>
            Number(document.querySelector('[data-testid="viewport"]')?.getAttribute('data-body-count')) >= expected,
          1,
        )

        // Watch the animation-frame gap: the longest one spanning the export is the
        // freeze, and it is the number the 16 ms budget is about. Watch the pending
        // state the same way — by whether it ever actually appeared in the DOM, not by
        // asking the store, because a state that cannot paint is not feedback.
        await page.evaluate(() => {
          window.__gapWatch = { worst: 0, last: performance.now(), on: false }
          const tick = () => {
            const now = performance.now()
            if (window.__gapWatch.on) {
              window.__gapWatch.worst = Math.max(window.__gapWatch.worst, now - window.__gapWatch.last)
            }
            window.__gapWatch.last = now
            if (document.querySelector('[data-testid="export-pending"]')) window.__exportPendingSeen = true
            requestAnimationFrame(tick)
          }
          window.__exportPendingSeen = false
          requestAnimationFrame(tick)
          new MutationObserver(() => {
            if (document.querySelector('[data-testid="export-pending"]')) window.__exportPendingSeen = true
          }).observe(document.body, { childList: true, subtree: true })
        })

        await page.getByTestId('file-menu-button').click()
        await page.getByTestId('file-export').click()
        await page.waitForSelector('[data-testid="export-popover"]')
        await page.getByTestId(`export-format-${format}`).check()

        if (rate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate })
        await page.evaluate(() => {
          window.__gapWatch.worst = 0
          window.__gapWatch.last = performance.now()
          window.__gapWatch.on = true
        })

        const started = Date.now()
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.getByTestId('export-commit').click(),
        ])
        // Did a pending state ever become visible during this export?
        pendingSeen += (await page.evaluate(() => (window.__exportPendingSeen ? 1 : 0))) ?? 0
        totals.push(Date.now() - started)
        blocks.push(await page.evaluate(() => window.__gapWatch.worst))
        if (rate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 })

        const path = await download.path()
        const { statSync } = await import('node:fs')
        bytes = statSync(path).size
        await context.close()
      }

      const block = stats(blocks)
      const total = stats(totals)
      rows.push({ scene: name, rate, format, block, total, bytes, pendingSeen })
      console.log(
        `${name.padEnd(10)} cpu ${String(rate).padStart(2)}x ${format.padEnd(3)} | worst frame gap median ${fixed(block.median).padStart(7)} ms (min ${fixed(block.min)}, p95 ${fixed(block.p95)}, worst ${fixed(block.worst)}) | click→download median ${fixed(total.median)} ms | ${bytes} B | pending seen ${pendingSeen}/${RUNS}`,
      )
    }
  }
}

await browser.close()
console.log(`\nn=${RUNS} per cell · ${URL_BASE} · Chromium ${chromium.name()} · laptop viewport 1440x900`)
