// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * How long the **production build** takes to become usable, per build, per engine, cold and
 * repeat (`TODO/perf-002`).
 *
 * The build reports a >500 kB initial chunk. That warning is about bytes; this measures what a
 * user waits for. Each build directory is served by **`vite preview`** (Vite's own `preview()`,
 * the same server `npx vite preview` starts: on-the-fly gzip, ETags, SPA fallback), never the dev
 * server, and loaded at the laptop reference viewport (1440×900) in Chromium, Firefox and WebKit.
 *
 * ## What "usable" means
 *
 * Measured inside the page, from navigation start (`performance.now()` of the loaded document),
 * by a `MutationObserver` installed before any page script runs. **Usable** is the first moment
 * when all of these hold:
 *
 * 1. `[data-testid="viewport"]` has `data-webgl="ready"` and `data-frames-rendered` ≥ 1: the
 *    viewport has drawn its first frame (`Viewport.vue` renders on demand and bumps the counter
 *    after each `renderer.render`);
 * 2. `[data-testid="library-row-primitive.cuboid"]` (the Library's Cube) is laid out with a
 *    non-zero box and is not `disabled`: the first creation control can be pressed;
 *
 * (that moment is **ready**), and then the second `requestAnimationFrame` callback after it has
 * run: a frame carrying that DOM has been produced, and the main thread was free to run a
 * callback. That second moment is **usable**, the headline number. In a first try, `ready` came
 * 60 ms into a warm load and first-contentful-paint 170 ms: work queued straight after mount held
 * the first painted frame back, which a DOM-only mark would not see.
 *
 * Also recorded: `first-contentful-paint` where the engine reports it, `DOMContentLoaded`,
 * **mounted** (`[data-testid="app-root"]` exists) and **frame** (condition 1 alone).
 *
 * ## Cold and repeat
 *
 * Every run uses a **fresh browser context** (empty HTTP cache, no service worker, no storage).
 * The **cold** load is that context's first navigation. Then, with throttling switched off, the
 * bench waits until the service worker has installed (its precache filled), activated and taken
 * control of the page, and until the server has been idle for 500 ms. The **repeat** load is a
 * second navigation to `/` in the same context, with the run's throttling back on: the app comes
 * from the service worker's precache (`repeat-sw`), or, where an engine has no controlling
 * worker after 30 s, from the HTTP cache (`repeat-http`: `vite preview` sends ETags and no
 * max-age, so every asset is revalidated with a 304). The mode is recorded per sample.
 *
 * ## Throttling (recorded with every result)
 *
 * - `none`: localhost, nothing applied.
 * - `slow4g`: applied **in the server**, so it is identical on all three engines: each request
 *   waits 150 ms before it is handled (one round trip), and every byte the server sends — headers
 *   and body, all connections together — goes through one shared 1.6 Mbit/s (200 kB/s) link,
 *   paced in 16 kB slices. These are Lighthouse's mobile network numbers. TCP/TLS handshakes are
 *   not modelled (plain HTTP/1.1 on localhost).
 * - `slow4g-cpu4`: `slow4g` plus a 4× CPU slowdown (CDP `Emulation.setCPUThrottlingRate`).
 *   **Chromium only**: Firefox and WebKit have no CPU throttling in Playwright, so this profile
 *   is skipped for them and says so.
 *
 * ## What is counted
 *
 * Server-side, per load, from the navigation until usable: the page's requests (including 304s),
 * bytes the server put on the wire for each response body (after gzip), and, for JavaScript, the
 * same files' uncompressed sizes from disk. A response a service worker answers never reaches the
 * server, which is the point: it is not transferred. The worker's own requests (`sw.js`, the
 * Workbox runtime, and its precache, recognised by `Referer: …/sw.js`) are kept apart and
 * reported as **SW install**: everything the worker fetched from the cold navigation until it
 * was in control and the server had been idle for 500 ms.
 *
 * Console errors and uncaught page errors are collected on every load and reported; a candidate
 * build that logs any is not a fair comparison and is flagged.
 *
 * ## Usage
 *
 *   npm run build                                   # the baseline, into dist/
 *   node bench/bundle-load.mjs --runs 7             # baseline only, every engine and profile
 *   node bench/bundle-load.mjs --build baseline=dist --build split=/tmp/split/dist --runs 7
 *   node bench/bundle-load.mjs --engines chromium --profiles none --runs 3   # a quick look
 *   node bench/bundle-load.mjs --runs 7 --json /tmp/load.json                # every sample
 *   node bench/bundle-load.mjs --check --build baseline=dist --build split=/tmp/split/dist
 *       # no timing: each build loads with no errors, its deferred surfaces open, and it
 *       # reloads offline from the service worker (see `checkBuild`)
 *
 * Builds are interleaved (run 1 of every build, then run 2 of every build, …) so drift on the
 * machine lands on every build alike, after `--warmup` (default 1) unrecorded rounds per engine and
 * profile: a fresh browser's first navigation is slower than the rest. Each build is served on its own port, from 4181 up.
 *
 * Headless engines, software rendering: the first frame here is a SwiftShader / software frame,
 * which is slower than a GPU's and does not predict one. Compare builds with each other, on the
 * same engine and profile; do not read the absolute numbers as a device's.
 *
 * @module bench/bundle-load
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { cpus, totalmem, release, platform } from 'node:os'
import { execSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import { chromium, firefox, webkit } from '@playwright/test'
import { preview } from 'vite'

const args = process.argv.slice(2)
/** @param {string} flag @param {string} [fallback] */
const option = (flag, fallback) => {
  const index = args.indexOf(flag)
  return index === -1 ? fallback : args[index + 1]
}
/** @param {string} flag @returns {string[]} every value of a repeatable flag */
const options = (flag) => args.flatMap((arg, index) => (arg === flag ? [args[index + 1]] : []))

const RUNS = Number(option('--runs', '7'))
/** Unrecorded rounds per engine and profile first: a fresh browser's first navigation is slow
 * (~330 ms against ~205 ms cold in a first try), which would always land on the first build. */
const WARMUP = Number(option('--warmup', '1'))
const ENGINES = (option('--engines', 'chromium,firefox,webkit') ?? '').split(',')
const PROFILES = (option('--profiles', 'none,slow4g,slow4g-cpu4') ?? '').split(',')
const JSON_OUT = option('--json')
/** `--check`: no timing; prove each build works (see `checkBuild`). */
const CHECK = args.includes('--check')
const BUILDS = (options('--build').length > 0 ? options('--build') : ['baseline=dist']).map((spec) => {
  const [name, dir] = spec.split('=')
  return { name, dist: resolve(dir) }
})

const VIEWPORT = { width: 1440, height: 900 }
const LATENCY_MS = 150
const BYTES_PER_MS = 200 // 1.6 Mbit/s
const SLICE = 16 * 1024
const USABLE_TIMEOUT_MS = 180_000

/** @type {Record<string, import('@playwright/test').BrowserType>} */
const ENGINE_TYPES = { chromium, firefox, webkit }

/**
 * The profiles. `cpu` is only honoured on Chromium; the others skip a profile that needs it.
 *
 * @type {Record<string, { latencyMs: number, bytesPerMs: number, cpu: number }>}
 */
const PROFILE_SETTINGS = {
  none: { latencyMs: 0, bytesPerMs: 0, cpu: 1 },
  slow4g: { latencyMs: LATENCY_MS, bytesPerMs: BYTES_PER_MS, cpu: 1 },
  'slow4g-cpu4': { latencyMs: LATENCY_MS, bytesPerMs: BYTES_PER_MS, cpu: 4 },
}

/** The live throttle every server reads at the moment it sends; switched per phase. */
const throttle = { latencyMs: 0, bytesPerMs: 0, offline: false }
/** The shared downlink: when its next free slot starts, in `performance.now()` ms. */
const link = { next: 0 }

/** @param {number} ms */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/**
 * @typedef {{ url: string, start: number, end: number, status: number, wire: number, encoding: string, sw: boolean }} Hit
 */

/**
 * Whether a request belongs to the service worker rather than the page: the worker script and
 * the Workbox runtime it imports, and everything the worker itself fetches (its precache), which
 * arrives with `Referer: <origin>/sw.js` in all three engines.
 *
 * @param {string} url
 * @param {string} referer
 */
function isWorkerRequest(url, referer) {
  const path = url.split('?')[0]
  return path === '/sw.js' || /^\/workbox-[\w-]+\.js$/.test(path) || referer.endsWith('/sw.js')
}

/**
 * Replaces a socket's `write`/`end` with a queue drained through the shared link. With the
 * throttle off and nothing queued, writes go straight through.
 *
 * @param {import('node:net').Socket} socket
 */
function paceSocket(socket) {
  const write = socket.write.bind(socket)
  const end = socket.end.bind(socket)
  /** @type {({ kind: 'write', data: Buffer, callback?: (error?: Error | null) => void } | { kind: 'end', args: unknown[] })[]} */
  const queue = []
  let pumping = false

  async function pump() {
    pumping = true
    while (queue.length > 0) {
      const item = /** @type {(typeof queue)[number]} */ (queue.shift())
      if (item.kind === 'end') {
        end(...item.args)
        continue
      }
      if (throttle.bytesPerMs === 0) {
        write(item.data, item.callback)
        continue
      }
      for (let offset = 0; offset < item.data.length; offset += SLICE) {
        const piece = item.data.subarray(offset, offset + SLICE)
        const now = performance.now()
        const sendAt = Math.max(now, link.next)
        link.next = sendAt + piece.length / throttle.bytesPerMs
        if (link.next - now > 1) await sleep(link.next - now)
        if (socket.destroyed) return
        const last = offset + SLICE >= item.data.length
        write(piece, last ? item.callback : undefined)
      }
    }
    pumping = false
  }

  // @ts-ignore — the overloads of `Socket.write` are narrower than what http passes through.
  socket.write = (chunk, encoding, callback) => {
    if (typeof encoding === 'function') {
      callback = encoding
      encoding = undefined
    }
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding ?? 'utf8')
    if (!pumping && queue.length === 0 && throttle.bytesPerMs === 0) return write(data, callback)
    queue.push({ kind: 'write', data, callback })
    if (!pumping) void pump()
    return true
  }
  // @ts-ignore — as above.
  socket.end = (...endArgs) => {
    if (!pumping && queue.length === 0) return end(...endArgs)
    queue.push({ kind: 'end', args: endArgs })
    return socket
  }
}

/**
 * A preview plugin that logs every response (and paces the sockets). Its middleware is added in
 * the hook body, so it runs **before** `vite preview`'s gzip middleware and its `res.write`
 * wrapper sees the compressed bytes that reach the socket.
 *
 * @param {Hit[]} hits
 * @returns {import('vite').Plugin}
 */
function meterPlugin(hits) {
  return {
    name: 'bench-bundle-load-meter',
    configurePreviewServer(server) {
      server.httpServer?.on('connection', (socket) => paceSocket(/** @type {import('node:net').Socket} */ (socket)))
      server.middlewares.use((req, res, next) => {
        // `--check`'s offline step: the server is gone, so only the service worker can answer.
        if (throttle.offline) {
          req.socket.destroy()
          return
        }
        const url = req.url ?? ''
        /** @type {Hit} */
        const hit = { url, start: performance.now(), end: 0, status: 0, wire: 0, encoding: '', sw: isWorkerRequest(url, req.headers.referer ?? '') }
        hits.push(hit)
        const write = res.write
        const end = res.end
        /** @param {unknown} chunk @param {unknown} encoding */
        const count = (chunk, encoding) => {
          if (chunk == null || typeof chunk === 'function') return
          hit.wire += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), typeof encoding === 'string' ? /** @type {BufferEncoding} */ (encoding) : 'utf8')
        }
        // @ts-ignore — passes the original arguments through unchanged.
        res.write = function (chunk, encoding, callback) {
          count(chunk, encoding)
          // @ts-ignore
          return write.call(this, chunk, encoding, callback)
        }
        // @ts-ignore — as above.
        res.end = function (chunk, encoding, callback) {
          count(chunk, encoding)
          hit.status = res.statusCode
          hit.encoding = String(res.getHeader('content-encoding') ?? '')
          hit.end = performance.now()
          // @ts-ignore
          return end.call(this, chunk, encoding, callback)
        }
        if (throttle.latencyMs > 0) setTimeout(next, throttle.latencyMs)
        else next()
      })
    },
  }
}

/**
 * Installed before any page script, on every navigation. Writes `window.__bundleLoad`.
 */
function installProbe() {
  /** @type {Record<string, number | null>} */
  const marks = { fcp: null, dcl: null, mounted: null, frame: null, library: null, ready: null, usable: null }
  // @ts-ignore
  window.__bundleLoad = marks
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint' && marks.fcp === null) marks.fcp = entry.startTime
    }).observe({ type: 'paint', buffered: true })
  } catch {
    // No paint timing in this engine: `fcp` stays null.
  }
  document.addEventListener('DOMContentLoaded', () => {
    marks.dcl = performance.now()
  })
  const check = () => {
    const now = performance.now()
    if (marks.mounted === null && document.querySelector('[data-testid="app-root"]')) marks.mounted = now
    if (marks.frame === null) {
      const viewport = document.querySelector('[data-testid="viewport"]')
      if (viewport && viewport.getAttribute('data-webgl') === 'ready' && Number(viewport.getAttribute('data-frames-rendered')) >= 1) marks.frame = now
    }
    if (marks.library === null) {
      const row = /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-testid="library-row-primitive.cuboid"]'))
      if (row && !row.disabled) {
        const box = row.getBoundingClientRect()
        if (box.width > 0 && box.height > 0) marks.library = now
      }
    }
    if (marks.ready === null && marks.frame !== null && marks.library !== null) {
      marks.ready = now
      observer.disconnect()
      // The DOM says ready; the user sees it once a frame carrying it has been produced. The
      // second animation-frame callback runs after that frame, and only once the main thread
      // is free to run it, so work queued right after mount is inside the number.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          marks.usable = performance.now()
        }),
      )
    }
  }
  const observer = new MutationObserver(check)
  observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-frames-rendered', 'data-webgl', 'disabled'] })
}

/**
 * Uncompressed size on disk of a served path (0 when it is not a file in the build).
 *
 * @param {string} dist
 * @param {string} url
 */
function diskSize(dist, url) {
  const path = join(dist, decodeURIComponent(url.split('?')[0]))
  try {
    return statSync(path).isFile() ? statSync(path).size : 0
  } catch {
    return 0
  }
}

/**
 * Sums a load's server log.
 *
 * @param {Hit[]} hits
 * @param {string} dist
 */
function tally(hits, dist) {
  const js = hits.filter((hit) => hit.url.split('?')[0].endsWith('.js'))
  return {
    requests: hits.length,
    wireKb: hits.reduce((sum, hit) => sum + hit.wire, 0) / 1000,
    jsRequests: js.length,
    jsWireKb: js.reduce((sum, hit) => sum + hit.wire, 0) / 1000,
    // A 304 transfers no body: only a 200 counts toward the uncompressed JS that was sent.
    jsRawKb: js.filter((hit) => hit.status === 200).reduce((sum, hit) => sum + diskSize(dist, hit.url), 0) / 1000,
    jsUrls: js.map((hit) => `${hit.status} ${hit.url.split('?')[0]}`),
  }
}

/** Waits until no request has been in flight for `quietMs`. @param {Hit[]} hits @param {number} quietMs */
async function settle(hits, quietMs, limitMs = 60_000) {
  const until = performance.now() + limitMs
  while (performance.now() < until) {
    const open = hits.some((hit) => hit.end === 0)
    const last = Math.max(0, ...hits.map((hit) => hit.end))
    if (!open && performance.now() - last >= quietMs) return
    await sleep(100)
  }
}

/**
 * One navigation to `/`, measured until usable.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @param {Hit[]} hits
 * @param {string} dist
 */
async function measuredLoad(page, url, hits, dist) {
  hits.length = 0
  /** @type {string[]} */
  const errors = []
  const onConsole = (/** @type {import('@playwright/test').ConsoleMessage} */ message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 200)}`)
  }
  const onPageError = (/** @type {Error} */ error) => errors.push(`pageerror: ${String(error).slice(0, 200)}`)
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  await page.goto(url, { waitUntil: 'commit' })
  await page.waitForFunction(() => /** @type {any} */ (window).__bundleLoad?.usable != null, null, { timeout: USABLE_TIMEOUT_MS, polling: 50 })
  // What the page asked the server for, from the navigation until the bench saw usable (±one
  // 50 ms poll). The worker's own traffic in that window is reported with the install instead.
  const counted = tally(hits.filter((hit) => !hit.sw), dist)
  const marks = await page.evaluate(() => /** @type {any} */ (window).__bundleLoad)
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))
  page.off('console', onConsole)
  page.off('pageerror', onPageError)
  return { marks, controlled, ...counted, errors }
}

/**
 * Waits for the service worker to be installed, active and in control (throttle off).
 *
 * @param {import('@playwright/test').Page} page
 */
async function waitForWorker(page) {
  // Polled from here: `waitForFunction` with an async predicate resolves at once (the returned
  // Promise is truthy), which in a first try reported "in control" before the precache began.
  const until = performance.now() + 30_000
  while (performance.now() < until) {
    const ready = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false
      const registration = await navigator.serviceWorker.getRegistration()
      return Boolean(registration?.active?.state === 'activated' && navigator.serviceWorker.controller)
    })
    if (ready) return true
    await sleep(100)
  }
  return false
}

/** @param {number[]} values */
function stats(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  /** @param {number} q */
  const at = (q) => {
    const position = (sorted.length - 1) * q
    const low = Math.floor(position)
    const high = Math.ceil(position)
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
  }
  return { median: at(0.5), min: sorted[0], max: sorted[sorted.length - 1], p25: at(0.25), p75: at(0.75), n: sorted.length }
}

/** @param {ReturnType<typeof stats>} s @param {number} [digits] */
const fmt = (s, digits = 0) => (s === null ? '—' : `${s.median.toFixed(digits)} (${s.min.toFixed(digits)}–${s.max.toFixed(digits)})`)

function machine() {
  let os = `${platform()} ${release()}`
  try {
    os = `macOS ${execSync('sw_vers -productVersion').toString().trim()}`
  } catch {
    // Not macOS.
  }
  return `${cpus()[0]?.model ?? 'unknown CPU'}, ${cpus().length} cores, ${Math.round(totalmem() / 2 ** 30)} GB, ${os}, Node ${process.version}`
}

/**
 * `--check`: one pass per build and engine, unthrottled, that a split build is still a whole app.
 * Cold load to usable; open the Assistant (`assistant-button` → the key sheet, as no key is
 * stored, or the chat) and Help (`help-open` → `help-sheet`), the surfaces a split is most likely to defer; wait for the
 * service worker; check every emitted JavaScript file is in its Cache Storage; take the
 * **server offline** (every socket destroyed) and reload: the app must reach usable again and the Assistant
 * must still open, i.e. every deferred chunk is in the precache. Any console or page error fails.
 *
 * @param {import('@playwright/test').Browser} browser
 * @param {{ name: string, url: string, hits: Hit[], dist: string }} target
 */
async function checkBuild(browser, target) {
  const context = await browser.newContext({ viewport: VIEWPORT })
  await context.addInitScript(installProbe)
  const page = await context.newPage()
  /** @type {string[]} */
  const steps = []
  /** @type {string[]} */
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 200)}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error).slice(0, 200)}`))
  /** @param {string} label @param {() => Promise<unknown>} action */
  const step = async (label, action) => {
    try {
      await action()
      steps.push(`${label} ok`)
    } catch (error) {
      steps.push(`${label} FAILED (${String(error).split('\n')[0].slice(0, 120)})`)
    }
  }
  const usable = () => page.waitForFunction(() => /** @type {any} */ (window).__bundleLoad?.usable != null, null, { timeout: 60_000 })
  // With no key stored (a fresh context) the Assistant button opens the key sheet, not the chat;
  // both are surfaces a split defers, so either one appearing proves its chunk loaded.
  const openAssistant = async () => {
    await page.getByTestId('assistant-button').click()
    await page.getByTestId('ai-key-input').or(page.getByTestId('assistant-panel')).first().waitFor({ state: 'visible', timeout: 15_000 })
    if (await page.getByTestId('ai-key-cancel').isVisible()) await page.getByTestId('ai-key-cancel').click()
    await page.getByTestId('ai-key-input').waitFor({ state: 'hidden', timeout: 5_000 })
  }
  await step('cold usable', async () => {
    await page.goto(target.url, { waitUntil: 'commit' })
    await usable()
  })
  await step('assistant opens', openAssistant)
  await step('help opens', async () => {
    await page.getByTestId('help-open').click()
    await page.getByTestId('help-sheet').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByTestId('help-close').click()
    await page.getByTestId('help-sheet').waitFor({ state: 'hidden', timeout: 5_000 })
  })
  let worker = false
  await step('worker in control', async () => {
    worker = await waitForWorker(page)
    if (!worker) throw new Error('no controlling service worker after 30 s')
    await settle(target.hits, 500)
  })
  if (worker) {
    // Every JavaScript file the build emitted (lazy chunks and workers included) must be in the
    // worker's Cache Storage, or a split surface would fail to open offline.
    await step('precache holds every JS file', async () => {
      const emitted = readdirSync(join(target.dist, 'assets')).filter((name) => name.endsWith('.js'))
      const cached = await page.evaluate(async () => {
        const urls = []
        for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) urls.push(new URL(request.url).pathname)
        return urls
      })
      const missing = emitted.filter((name) => !cached.includes(`/assets/${name}`))
      if (missing.length > 0) throw new Error(`not precached: ${missing.join(', ')}`)
    })
    // Offline at the server (every socket destroyed), so only the service worker can answer.
    throttle.offline = true
    await step('offline reload usable', async () => {
      await page.goto(target.url, { waitUntil: 'commit' })
      await usable()
    })
    await step('offline assistant opens', openAssistant)
    throttle.offline = false
  }
  await context.close()
  return { build: target.name, steps, errors }
}

async function main() {
  for (const build of BUILDS) {
    if (!existsSync(join(build.dist, 'index.html'))) throw new Error(`${build.dist} has no index.html: build it first`)
  }
  /** @type {{ name: string, dist: string, url: string, hits: Hit[], server: import('vite').PreviewServer, entry: string }[]} */
  const servers = []
  for (const [index, build] of BUILDS.entries()) {
    /** @type {Hit[]} */
    const hits = []
    const port = 4181 + index
    const server = await preview({
      configFile: false,
      root: dirname(build.dist),
      base: '/',
      logLevel: 'warn',
      build: { outDir: build.dist },
      preview: { port, strictPort: true, host: '127.0.0.1' },
      plugins: [meterPlugin(hits)],
    })
    const entry = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(readFileSync(join(build.dist, 'index.html'), 'utf8'))?.[1] ?? '?'
    servers.push({ ...build, url: `http://127.0.0.1:${port}/`, hits, server, entry })
  }

  console.log(`# bundle-load — ${new Date().toISOString()}`)
  console.log(`machine: ${machine()}`)
  console.log(`viewport ${VIEWPORT.width}×${VIEWPORT.height}, runs ${RUNS}, builds: ${servers.map((s) => `${s.name}=${s.dist} (${s.entry})`).join(', ')}`)

  if (CHECK) {
    let failed = false
    for (const engineName of ENGINES) {
      const browser = await ENGINE_TYPES[engineName].launch({ headless: true })
      for (const target of servers) {
        const result = await checkBuild(browser, target)
        const bad = result.errors.length > 0 || result.steps.some((line) => line.includes('FAILED'))
        failed ||= bad
        console.log(`${bad ? 'FAIL' : 'pass'} ${engineName} ${browser.version()} ${target.name}: ${result.steps.join(', ')}${result.errors.length > 0 ? `\n    errors: ${result.errors.join(' | ')}` : ''}`)
      }
      await browser.close()
    }
    for (const target of servers) await target.server.close()
    process.exitCode = failed ? 1 : 0
    return
  }

  /** @type {any[]} */
  const samples = []
  /** @type {string[]} */
  const skipped = []
  for (const engineName of ENGINES) {
    const browser = await ENGINE_TYPES[engineName].launch({ headless: true })
    console.log(`\n${engineName} ${browser.version()}`)
    for (const profileName of PROFILES) {
      const profile = PROFILE_SETTINGS[profileName]
      if (profile.cpu !== 1 && engineName !== 'chromium') {
        skipped.push(`${engineName} × ${profileName}: no CPU throttling outside Chromium`)
        continue
      }
      for (let run = -WARMUP; run < RUNS; run += 1) {
        for (const target of servers) {
          const record = run >= 0
          const context = await browser.newContext({ viewport: VIEWPORT })
          await context.addInitScript(installProbe)
          const page = await context.newPage()
          if (profile.cpu !== 1) {
            const cdp = await context.newCDPSession(page)
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu })
          }
          const base = { build: target.name, engine: engineName, version: browser.version(), profile: profileName, run }
          try {
            throttle.latencyMs = profile.latencyMs
            throttle.bytesPerMs = profile.bytesPerMs
            const cold = await measuredLoad(page, target.url, target.hits, target.dist)
            if (record) samples.push({ ...base, cache: 'cold', ...cold })

            throttle.latencyMs = 0
            throttle.bytesPerMs = 0
            const worker = await waitForWorker(page)
            await settle(target.hits, 500)
            // Everything the worker fetched since the navigation: its script, Workbox, the precache.
            const install = tally(target.hits.filter((hit) => hit.sw), target.dist)
            if (record) samples.push({ ...base, cache: 'install', worker, ...install, marks: {}, errors: [] })

            throttle.latencyMs = profile.latencyMs
            throttle.bytesPerMs = profile.bytesPerMs
            const repeat = await measuredLoad(page, target.url, target.hits, target.dist)
            if (record) samples.push({ ...base, cache: repeat.controlled ? 'repeat-sw' : 'repeat-http', ...repeat })
            process.stdout.write(
              `  ${profileName} ${target.name} ${record ? `run ${run + 1}` : 'warm-up (not recorded)'}: cold ${cold.marks.usable.toFixed(0)} ms, repeat ${repeat.marks.usable.toFixed(0)} ms (${repeat.controlled ? 'sw' : 'http'})${cold.errors.length + repeat.errors.length > 0 ? ` ERRORS ${[...cold.errors, ...repeat.errors].join(' | ')}` : ''}\n`,
            )
          } catch (error) {
            samples.push({ ...base, cache: 'failed', error: String(error) })
            console.log(`  ${profileName} ${target.name} run ${run + 1}: FAILED ${String(error).slice(0, 300)}`)
          } finally {
            throttle.latencyMs = 0
            throttle.bytesPerMs = 0
            await context.close()
          }
        }
      }
    }
    await browser.close()
  }
  for (const target of servers) await target.server.close()

  // Report: one table per profile; medians (min–max) of the timings, medians of the counts.
  for (const profileName of PROFILES) {
    const rows = samples.filter((sample) => sample.profile === profileName && sample.cache !== 'install' && sample.cache !== 'failed')
    if (rows.length === 0) continue
    console.log(`\n## ${profileName}\n`)
    console.log('| engine | build | cache | n | usable ms | ready ms | FCP ms | requests | JS wire kB | JS raw kB | all wire kB | errors |')
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for (const engineName of ENGINES) {
      for (const cache of ['cold', 'repeat-sw', 'repeat-http']) {
        for (const target of servers) {
          const cell = rows.filter((row) => row.engine === engineName && row.cache === cache && row.build === target.name)
          if (cell.length === 0) continue
          /** @param {(row: any) => number} pick */
          const of = (pick) => stats(cell.map(pick))
          const errorCount = cell.reduce((sum, row) => sum + row.errors.length, 0)
          console.log(
            `| ${engineName} | ${target.name} | ${cache} | ${cell.length} | ${fmt(of((r) => r.marks.usable))} | ${fmt(of((r) => r.marks.ready))} | ${fmt(of((r) => r.marks.fcp ?? NaN))} | ${of((r) => r.requests)?.median ?? '—'} | ${of((r) => r.jsWireKb)?.median.toFixed(1)} | ${of((r) => r.jsRawKb)?.median.toFixed(1)} | ${of((r) => r.wireKb)?.median.toFixed(1)} | ${errorCount} |`,
          )
        }
      }
    }
    const installs = samples.filter((sample) => sample.profile === profileName && sample.cache === 'install')
    for (const target of servers) {
      const cell = installs.filter((row) => row.build === target.name)
      if (cell.length === 0) continue
      const workers = cell.filter((row) => row.worker).length
      console.log(
        `\n${target.name}: SW install after the cold load: ${stats(cell.map((r) => r.requests))?.median} requests, ${stats(cell.map((r) => r.wireKb))?.median.toFixed(0)} kB on the wire (median); worker in control in ${workers}/${cell.length} runs`,
      )
    }
  }
  const failed = samples.filter((sample) => sample.cache === 'failed')
  if (failed.length > 0) console.log(`\n${failed.length} failed loads: ${failed.map((f) => `${f.engine}/${f.profile}/${f.build}#${f.run}`).join(', ')}`)
  for (const line of skipped) console.log(`skipped: ${line}`)
  const firstCold = samples.filter((sample) => sample.cache === 'cold' && sample.run === 0 && sample.profile === PROFILES[0])
  for (const sample of firstCold) console.log(`\n${sample.engine}/${sample.build} cold JS requests until usable:\n  ${sample.jsUrls.join('\n  ')}`)
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ machine: machine(), viewport: VIEWPORT, builds: BUILDS, samples, skipped }, null, 2))
}

await main()
