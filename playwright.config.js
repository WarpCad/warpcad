import { defineConfig, devices } from '@playwright/test'

// Engine coverage (Chromium/Firefox/WebKit) per CLAUDE.md's Browser Support
// section. Per-spec viewport projects (phone/tablet/laptop) get added once the
// first real *.e2e.js navigating to `/` lands (render-001) — this scaffold
// only needs to prove the harness and the naming guard work.
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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
