// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

import { liveBridgePlugins } from './mcp/liveBridge.js'
import { HELP_PRECACHE_GLOBS, helpRuntimeCaching, warpcadHelp } from './scripts/vite-plugin-help.mjs'
import { manifestIcons } from './scripts/app-icons.mjs'

/**
 * The dev server only. `index.html`'s Content-Security-Policy is the production policy; `vite
 * dev` relaxes it in exactly two ways, and `vite build` output carries the policy
 * byte-for-byte as written in `index.html` (`apply: 'serve'`):
 *
 * - `connect-src` gains the HMR websocket (Safari does not treat a `ws:` URL as `'self'`);
 * - `script-src` gains `'unsafe-eval'`, because most `e2e/*.e2e.js` specs reach the running
 *   app's stores through a `page.evaluate` helper that imports `/src/stores/*.js` (a path only
 *   the dev server serves) and runs the spec's function with `new Function`. That is test
 *   scaffolding, not app code: the app itself uses no eval, which `E2E_PREVIEW=1` proves by
 *   running `e2e/csp.e2e.js` against the production build (see `playwright.config.js`).
 *
 * @returns {import('vite').Plugin}
 */
function devContentSecurityPolicy() {
  return {
    name: 'warpcad-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("connect-src 'self'", "connect-src 'self' ws://localhost:5183 ws://127.0.0.1:5183")
        .replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")
    },
  }
}

/**
 * The path the built app is served under, from `BASE_PATH` (`/` when unset). GitHub Pages sets it
 * in `.github/workflows/pages.yml`: `/warpcad/` at `warpcad.github.io/warpcad/`, `/` behind a
 * custom domain. Help (`src/help/loader.js`), the kernel worker and the PWA manifest's scope and
 * start URL all follow it, so nothing else needs to change between the two.
 *
 * @param {string | undefined} raw
 * @returns {string}
 */
function basePath(raw) {
  const trimmed = (raw ?? '').split('/').filter(Boolean).join('/')
  return trimmed === '' ? '/' : `/${trimmed}/`
}

/** The package version, shown in Help and in `<meta name="version">` (`TODO/build-005`). */
const APP_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
/** The short commit this build was made from (`GITHUB_SHA` on Pages), `dev` when unset. */
const APP_COMMIT = (process.env.GITHUB_SHA ?? '').slice(0, 7) || 'dev'

/**
 * Stamps the running build into the page as `<meta name="version" content="0.0.0+abc1234">`, so
 * DevTools and tests can read it without the UI. It also changes `index.html`'s precache
 * revision on every commit, so a deploy always yields a different service worker.
 *
 * @returns {import('vite').Plugin}
 */
function versionMeta() {
  return {
    name: 'warpcad-version-meta',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'version', content: `${APP_VERSION}+${APP_COMMIT}` }, injectTo: 'head' }]
    },
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_COMMIT__: JSON.stringify(APP_COMMIT),
  },
  base: basePath(process.env.BASE_PATH),
  // Dedicated, strict port: with auto-increment-on-conflict (Vite's default),
  // a stray dev server from another project squatting on the default port
  // would make Playwright's `reuseExistingServer` silently attach to the
  // wrong app instead of failing loudly. Fail loudly instead.
  server: { port: 5183, strictPort: true },
  plugins: [
    devContentSecurityPolicy(),
    versionMeta(),
    // `TODO/ai-012`: Claude Code edits the open tab, under `npm run dev` only (`apply: 'serve'`;
    // `vite build` output carries nothing of it). MCP at /mcp, the tab over the HMR socket.
    // `WARPCAD_LIVE_BRIDGE=0 npm run dev` leaves it out (default on); see docs/mcp.md.
    ...liveBridgePlugins(),
    vue(),
    // `TODO/ui-061`: docs/*.md rendered to help/<page>.html at build time (dev: on request).
    warpcadHelp(),
    VitePWA({
      // `TODO/build-005`: a new worker installs, activates and takes control the moment it is
      // found (stated below, not left to the plugin's defaults). `src/pwa.js` intercepts the
      // plugin's automatic reload (`onNeedReload`) so the page is never reloaded under the user.
      registerType: 'autoUpdate',
      // The tab icons `index.html` links, precached so they survive going offline. The
      // manifest's own icons are precached by the plugin already.
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Drop the previous build's precache entries on activate, so a stale index.html can
        // never point at hashed assets that were deleted by the deploy.
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        // The plugin's default globs plus the help text and still pictures, so Help opens
        // offline right after install. The GIFs are runtime-cached, not precached: they are
        // ~60 MB (see `scripts/vite-plugin-help.mjs`).
        globPatterns: ['**/*.{js,css,html,webmanifest}', ...HELP_PRECACHE_GLOBS],
        runtimeCaching: [helpRuntimeCaching()],
      },
      manifest: {
        name: 'WarpCad',
        short_name: 'WarpCad',
        display: 'standalone',
        // `--surface-0` from src/styles/tokens.css, the same value index.html paints before any
        // CSS loads, so the install splash and title bar match the app's first frame.
        background_color: '#10131a',
        theme_color: '#10131a',
        // Rendered from public/favicon.svg by `npm run icons` (scripts/app-icons.mjs), which
        // owns this list so the manifest and the files on disk cannot drift apart.
        icons: manifestIcons(),
      },
    }),
  ],
})
