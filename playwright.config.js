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
    },
  })),
)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5183',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:5183',
  },
  projects: [
    // Repo guards that assert on files rather than on a page — one run is
    // enough, so they stay out of the 9-way browser matrix.
    { name: 'guards', testMatch: /naming\.spec\.js/ },
    ...browserProjects,
  ],
})
