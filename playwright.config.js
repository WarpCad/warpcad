// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, devices } from '@playwright/test'

/**
 * Two orthogonal axes, per CLAUDE.md: **viewport** (Responsive Layout's three
 * reference form factors) and **engine** (Browser Support's three rendering
 * engines). "All-Chromium coverage across all three viewports is not the same
 * claim as verified on every supported browser," so the matrix is the product of
 * both, not either one alone.
 *
 * `render-001` is the first spec to need this: it is WebGL, canvas, and touch
 * input from line one, which is exactly the surface that "defaults to all three
 * engines". A later spec with no WebGL/canvas/touch/persistence involvement may
 * legitimately pin itself to fewer projects with `test.skip`, but the default
 * lives here.
 */

const VIEWPORTS = [
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'tablet', viewport: { width: 820, height: 1180 }, touch: true },
  { name: 'laptop', viewport: { width: 1440, height: 900 }, touch: false },
]

const ENGINES = [
  { name: 'chromium', device: devices['Desktop Chrome'] },
  { name: 'firefox', device: devices['Desktop Firefox'] },
  { name: 'webkit', device: devices['Desktop Safari'] },
]

const browserProjects = ENGINES.flatMap((engine) =>
  VIEWPORTS.map((size) => ({
    name: `${engine.name}-${size.name}`,
    // Playwright's default testMatch only picks up `*.spec.js`/`*.test.js`;
    // this project's app-level specs are `*.e2e.js` (CLAUDE.md's Project
    // Structure), so they have to be matched explicitly or they silently never
    // run — which would be the worst possible failure mode for the one gate
    // that proves the app is reachable.
    testMatch: /.*\.e2e\.js/,
    use: {
      ...engine.device,
      viewport: size.viewport,
      // Firefox's Playwright build does not implement touch emulation; the
      // phone/tablet projects there still prove layout and click behaviour,
      // and the touch-specific assertions skip themselves (see the spec).
      hasTouch: size.touch && engine.name !== 'firefox',
      // WebKit's Playwright build cannot route requests a service worker issues, so against
      // the production build (`E2E_PREVIEW=1`, which registers one) a stubbed API call would
      // reach the real network. Block the worker there; Chromium routes through it fine.
      ...(engine.name === 'webkit' && process.env.E2E_PREVIEW === '1' ? { serviceWorkers: 'block' } : {}),
    },
  })),
)

/**
 * Smoke projects: the `@smoke`-tagged subset, on Chrome at laptop width (`chromium-laptop`) and on
 * Safari's engine at iPad width (`webkit-tablet`, the Responsive Layout tablet row, 820×1180, touch).
 * This is what GitHub Actions runs (`.github/workflows/ci.yml`); the full 9-way matrix stays a local
 * run (`npm run test:e2e:headless`), because on free hosted runners it is hours of minutes. Smoke
 * tests carry `{ tag: '@smoke' }`; add one only when a scenario is a regression gate for the whole
 * app, not for a single feature.
 */
const SMOKE_BROWSERS = ['chromium-laptop', 'webkit-tablet']
const smokeProjects = browserProjects
  .filter((project) => SMOKE_BROWSERS.includes(project.name))
  .map((project) => ({ ...project, name: `smoke-${project.name}`, grep: /@smoke/ }))

/**
 * Docs-media projects (`TODO/docs-005`). Chromium only, on purpose: these are pictures
 * for humans, not a cross-engine behaviour gate. Software GL keeps pixels independent of
 * the contributor's GPU; `deviceScaleFactor: 2` is the one fixed choice for crisp images.
 * Baselines are generated on one pinned platform (the maintainer's Mac) — see CONTRIBUTING.md.
 */
const docsProjects = VIEWPORTS.map((size) => ({
  name: `docs-${size.name}`,
  testMatch: /.*\.docs\.js/,
  // Drops the default `-{projectName}-{platform}` suffix so the file name is exactly what
  // the markdown links to: `docs/screenshots/<name>.png`.
  snapshotPathTemplate: '{testDir}/../docs/screenshots/{arg}{ext}',
  use: {
    ...devices['Desktop Chrome'],
    viewport: size.viewport,
    hasTouch: size.touch,
    deviceScaleFactor: 2,
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
}))

/**
 * `E2E_PREVIEW=1` runs the same specs against the **production build** served by
 * `vite preview` instead of the dev server (`TODO/ai-004`). The dev server relaxes the
 * Content-Security-Policy for its HMR websocket (`vite.config.js`), so only the built
 * `index.html` carries the exact production policy; this is how that policy, and the
 * production service worker, get exercised: `E2E_PREVIEW=1 npx playwright test e2e/csp.e2e.js`.
 */
const PREVIEW = process.env.E2E_PREVIEW === '1'
const ORIGIN = PREVIEW ? 'http://localhost:5184' : 'http://localhost:5183'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Agent-oriented reporter: terse console summary, failure detail in one markdown file
  // (test-report-for-coding-agents/, gitignored). Lean options keep token use low.
  // A CLI --reporter flag REPLACES this whole list, silently dropping the progress reporter
  // below. To change the console view, keep it:
  //   --reporter=list,./scripts/test-progress/playwright.mjs
  reporter: [
    [
      '@zenai/playwright-coding-agent-reporter',
      {
        outputDir: 'test-report-for-coding-agents',
        silent: false,
        singleReportFile: true,
        verboseErrors: true,
        maxInlineErrors: 5,
        maxErrorLength: 1500,
        capturePageState: false,
        includeScreenshots: false,
        includeConsoleErrors: false,
        includeNetworkErrors: false,
        includeVideo: false,
        showCodeSnippet: true,
      },
    ],
    // Writes .test-progress/playwright.json for the progress/ETA mod.
    ['./scripts/test-progress/playwright.mjs'],
  ],
  webServer: {
    command: PREVIEW ? 'npm run build && npx vite preview --port 5184 --strictPort' : 'npm run dev',
    url: ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: PREVIEW ? 180_000 : 60_000,
  },
  use: {
    baseURL: ORIGIN,
  },
  projects: [
    // Repo guards that assert on files rather than on a page — one run is
    // enough, so they stay out of the 9-way browser matrix.
    { name: 'guards', testMatch: /(naming|docs-media)\.spec\.js/ },
    ...browserProjects,
    ...smokeProjects,
    ...docsProjects,
  ],
})
