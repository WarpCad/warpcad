# Hosting and PWA: GitHub Pages + vite-plugin-pwa

**Status:** accepted 2026-10-15. Closes the two "Default — reconsider" rows (Hosting, PWA) in
`CLAUDE.md`'s Stack table, ahead of publishing the repository as `github.com/WarpCad/warpcad`.

## What the app needs from a host

- **Static files only.** No backend: documents live in IndexedDB, local files, or the user's
  own GitHub repository (`docs/save-load.md`), and the AI partner calls the Messages API straight
  from the browser with the user's own key (`docs/decisions/ai-partner.md`).
- **No rewrites.** One screen, hash-fragment state only (`#/gist/<id>`, `#/help/<page>`), per
  `CLAUDE.md`'s Architecture section, so a host that cannot rewrite paths loses nothing.
- **No custom response headers.** The Content-Security-Policy is a `<meta>` tag in `index.html`
  (proved against the production build by `e2e/csp.e2e.js`). The kernel is pure JS
  (`docs/decisions/geometry-kernel.md`), so cross-origin isolation (COOP/COEP, needed for
  `SharedArrayBuffer`) is not required.
- **HTTPS and a custom domain**, for service workers and PWA install.
- **Source next to the build.** AGPL-3.0 §13 asks a hosted copy to offer its source. Serving from
  the same GitHub org as the repository keeps the two trivially in step.
- **Free for an open-source project, no per-seat or "non-commercial only" terms.**

## Options compared

| Host | Fits the needs above | Custom headers | Notes |
|---|---|---|---|
| **GitHub Pages** | Yes | No | Same org and same Actions as CI; deploys from a workflow artifact; custom domain + enforced HTTPS; free for public repositories. Soft limits (1 GB site, 100 GB/month bandwidth) are far above this app's size. |
| Cloudflare Pages | Yes | Yes (`_headers`) | Generous free tier and edge network; a second account and dashboard to own; headers are the only thing it adds, and the app needs none. |
| Netlify | Yes | Yes | Free tier with bandwidth/credit caps; a second account; headers and rewrites unused here. |
| Vercel | Partly | Yes | Hobby tier terms restrict commercial use; framework-centric features unused by a static Vite build. |

## Decision

**GitHub Pages** at **`https://app.warpcad.com`** (a `CNAME` to `warpcad.github.io`; the
`warpcad.com` DNS is at Squarespace Domains), deployed by `.github/workflows/pages.yml` from the
`npm run build` output. The `app` subdomain leaves the bare domain free for a landing page.
**vite-plugin-pwa** stays (health-checked in `stack-defaults-health-check.md`; it has served the
app's offline Help and `autoUpdate` service worker since `TODO/ui-061`).

The served path is not fixed in code: `vite.config.js` reads `BASE_PATH`, and the Pages workflow
fills it from `actions/configure-pages` (`/warpcad/` at `warpcad.github.io/warpcad/`, `/` behind a
custom domain). The same build therefore works under either address, and under a Capacitor
WebView later.

### Rejection table

| Option | Why not |
|---|---|
| Cloudflare Pages | Its one advantage, custom headers, solves no problem this app has; a second account to secure for no gain. Revisit if the app ever needs COOP/COEP (a WASM kernel with threads) or real response headers. |
| Netlify | Same as Cloudflare, with tighter free-tier caps. |
| Vercel | Hobby-tier commercial-use restriction is a poor fit for an AGPL project anyone may host. |

## Revisit when

- The kernel or another dependency needs `SharedArrayBuffer` (cross-origin isolation headers).
- A backend appears (a hosted project store, a relay for `mcp/server.js --live`).
- Bandwidth approaches the Pages soft limit (the docs GIFs are the bulk of the site; see
  `CONTRIBUTING.md` "Repo size").

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
