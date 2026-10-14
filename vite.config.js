// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

import { warpcadLiveBridge } from './mcp/liveBridge.js'

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

export default defineConfig({
  // Dedicated, strict port: with auto-increment-on-conflict (Vite's default),
  // a stray dev server from another project squatting on the default port
  // would make Playwright's `reuseExistingServer` silently attach to the
  // wrong app instead of failing loudly. Fail loudly instead.
  server: { port: 5183, strictPort: true },
  plugins: [
    devContentSecurityPolicy(),
    // `TODO/ai-012`: Claude Code edits the open tab, under `npm run dev` only (`apply: 'serve'`;
    // `vite build` output carries nothing of it). MCP at /mcp, the tab over the HMR socket.
    warpcadLiveBridge(),
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'WarpCad',
        short_name: 'WarpCad',
        display: 'standalone',
        background_color: '#111111',
        theme_color: '#111111',
      },
    }),
  ],
})
