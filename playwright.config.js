// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

/**
 * The default run is against the **production build** served by `vite preview` (`TODO/build-015`),
 * not the dev server: it is faster per spec (no on-demand module transforms) and it tests the code
 * that ships. The dev server relaxes the Content-Security-Policy for its HMR websocket
 * (`vite.config.js`), so only the built `index.html` carries the exact production policy, and only
 * the build registers the production service worker.
 *
 * `E2E_DEV=1` is the explicit opt-out, for debugging and for the specs that are dev-only (live MCP
 * access, scripted AI mode): `E2E_DEV=1 npx playwright test e2e/ai-scripted.e2e.js`.
 *
 * Specs that read the app's stores call `window.__e2eImport('/src/…')` (`src/e2eHooks.js`), which only an
 * e2e build (`VITE_E2E_HOOKS=1`, set in the `webServer` command below) contains; a bundle has no `/src` URLs.
 *
 * Specs read `process.env.E2E_PREVIEW === '1'` to tell the two apart, so the config sets it here,
 * before any worker loads this file (workers inherit the environment).
 */
if (process.env.E2E_DEV === '1') delete process.env.E2E_PREVIEW
else process.env.E2E_PREVIEW = '1'

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
      // The production build registers a service worker that precaches the whole app and then shows
      // a "ready to work offline" strip at a moment no spec controls, which resizes the canvas under
      // a snapshot (found by `build-015`). So the default run blocks the worker on every engine, and
      // the specs that exercise it opt in with `test.use({ serviceWorkers: 'allow' })`
      // (`pwa-update`, `help`). WebKit's Playwright build also cannot route requests a worker issues,
      // so a stubbed API call would reach the real network.
      ...(process.env.E2E_PREVIEW === '1' ? { serviceWorkers: 'block' } : {}),
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
    // The picture must not depend on when the service worker finishes precaching (see above).
    ...(process.env.E2E_PREVIEW === '1' ? { serviceWorkers: 'block' } : {}),
  },
}))

const PREVIEW = process.env.E2E_PREVIEW === '1'

/**
 * Fast mode: an untracked, gitignored marker file at the repo root (`.test-fast`) narrows the
 * default run to **all** tests on just `chromium-laptop` (Chrome desktop) and `webkit-tablet`
 * (Safari on iPad) plus the `guards`. The smoke projects are dropped as redundant (they are a
 * subset of those two). Create it with `touch .test-fast`, delete it to get the full 9-way
 * matrix back. Explicit `--project=<name>` flags still work for the projects that exist.
 */
const FAST = existsSync(new URL('./.test-fast', import.meta.url))

/**
 * Whether this run names a `docs-*` project. Only the launching process sees the `--project`
 * flags; each worker re-loads this config with different argv and would otherwise drop the
 * project it was handed ("Project docs-laptop not found in the worker process"), failing every
 * test. The answer is passed down in the environment, which workers inherit.
 */
const WANTS_DOCS = process.env.WARPCAD_DOCS_PROJECTS === '1' || process.argv.some((arg) => arg.includes('docs-'))
if (WANTS_DOCS) process.env.WARPCAD_DOCS_PROJECTS = '1'

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
    // Standard Playwright HTML report (playwright-report/, gitignored). `open: 'never'` keeps
    // it from launching a server and blocking an unattended run on failure.
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  webServer: {
    command: PREVIEW ? 'VITE_E2E_HOOKS=1 npm run build && npx vite preview --port 5184 --strictPort' : 'VITE_E2E_HOOKS=1 npm run dev',
    url: ORIGIN,
    // A preview server serves whatever `dist/` it was started on, so reusing one risks a stale
    // build; the command above rebuilds, so only reuse it when asked (`E2E_REUSE=1`).
    reuseExistingServer: !process.env.CI && (!PREVIEW || process.env.E2E_REUSE === '1'),
    timeout: PREVIEW ? 180_000 : 60_000,
  },
  use: {
    baseURL: ORIGIN,
  },
  projects: FAST
    ? [
        { name: 'guards', testMatch: /(naming|docs-media)\.spec\.js/ },
        ...browserProjects.filter((project) => SMOKE_BROWSERS.includes(project.name)),
        // `npm run docs:*` names its docs-* projects explicitly; keep them selectable.
        ...(WANTS_DOCS ? docsProjects : []),
      ]
    : [
        // Repo guards that assert on files rather than on a page — one run is
        // enough, so they stay out of the 9-way browser matrix.
        { name: 'guards', testMatch: /(naming|docs-media)\.spec\.js/ },
        ...browserProjects,
        ...smokeProjects,
        ...docsProjects,
      ],
})
