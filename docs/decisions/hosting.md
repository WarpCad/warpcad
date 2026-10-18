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

### Custom domain (`TODO/build-010`, 2026-10-17)

Configured in the repository: `public/CNAME` holds `app.warpcad.com`, Vite copies it to
`dist/CNAME`, so every Pages artifact carries it, and `scripts/cname.spec.js` fails the unit
stage if the file is missing, wrong, or absent from a built `dist/`. The local build keeps base
`/` (`BASE_PATH` is unset), and `pages.yml`'s `base_path` comment stays correct:
`actions/configure-pages` reports `""` once the Pages settings name a custom domain.

**Live.** The owner has set up the DNS record `CNAME app -> warpcad.github.io` at Squarespace
Domains and the repository's Settings -> Pages (Source "GitHub Actions", custom domain
`app.warpcad.com`, **Enforce HTTPS**), and `https://app.warpcad.com` now serves the hosted app
(2026-10-17). Before that, the first deploy would have been built with base `/warpcad/`; the
`/` base is what the custom domain needs. The live checks are in `TODO/VERIFY.md`.

### Rejection table

| Option | Why not |
|---|---|
| Cloudflare Pages | Its one advantage, custom headers, solves no problem this app has; a second account to secure for no gain. Revisit if the app ever needs COOP/COEP (a WASM kernel with threads) or real response headers. |
| Netlify | Same as Cloudflare, with tighter free-tier caps. |
| Vercel | Hobby-tier commercial-use restriction is a poor fit for an AGPL project anyone may host. |

## Update path (`TODO/build-005`)

Problem: the worker precaches the app shell, so a reload served the old build until a new worker
had installed, activated and taken control, and an open tab was never told.

| Option | Reload always fresh | Offline Help | Verdict |
|---|---|---|---|
| A. pipiece-ui's no-op worker (no precache) | yes | no | Rejected: breaks the `ui-061` offline Help and install-and-go on a phone. |
| B. Keep the Workbox precache, fix the update path | yes, after a reload or two | yes | **Chosen.** |
| C. No service worker | yes | no | Rejected: loses installability and offline entirely. |

What B is, and was verified against the generated `dist/sw.js` (not the plugin's docs):

- `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches` and `navigateFallback: 'index.html'` are
  stated in `vite.config.js`; `index.html` is in the precache manifest with a revision, and the
  revision changes per build because the build stamps `<meta name="version">` (package version +
  short `GITHUB_SHA`) into it. The runtime-cached GIFs stay `docs/media/*.gif` only.
- `registerType: 'autoUpdate'`: in the plugin (1.3.0) that makes the *page* call
  `location.reload()` as soon as a new worker activates. `src/pwa.js` passes `onNeedReload`, which
  replaces that reload with the update strip, so the page never reloads under the user. In
  `autoUpdate` mode `updateSW(true)` is a no-op, so **Reload** is a plain `location.reload()`
  (after `canReloadNow`, asking first while a drag, field edit, pop-up, unsaved autosave or
  merge-waiting is in progress).
- `registration.update()` runs every 30 minutes and when the tab becomes visible
  (`src/core/appUpdate.js`), plus **Check for updates** in Help. `update()` bypasses the HTTP cache
  for `sw.js`, which Pages serves with `max-age=600`; `e2e/pwa-update.e2e.js` serves `sw.js` with
  that header and proves the update still lands.
- Timeline on a navigation: reload 1 serves the old build from the precache while the browser
  fetches the new `sw.js`, installs and activates it; reload 2 serves the new build.
- Known trade-off: with `skipWaiting` the new worker controls the old page, and
  `cleanupOutdatedCaches` removes the old hashed assets, so a lazy-loaded chunk requested by a page
  that has not reloaded yet can 404. The strip exists to make that window short; the document is
  in IndexedDB and the project file, so a reload loses only transient UI state.
- Recovery if a bad worker ever ships: deploy a `sw.js` that calls `registration.unregister()`
  (not built).
- **Observed delay on the real Pages site: not yet measured** (needs a deploy and a phone; see the
  `TODO/VERIFY.md` entry). The docs promise "within a reload or two" and "about 30 minutes", not
  "immediately".
- Engines: the e2e runs the service worker on Chromium, Firefox and WebKit (WebKit's Playwright
  build cannot take the network offline *above* the worker, so the offline reload is asserted
  there by precache contents only, as in `help.e2e.js`). Playwright does not model iOS standalone
  mode; the installed-PWA check is manual.

## Git LFS bandwidth (`TODO/build-012`, 2026-10-17)

`docs/media` holds 74 GIFs in Git LFS, 72.7 MB in all (`.gitattributes`). Before this change four
checkouts fetched them on every push to `main` (the CI `test` job, both `smoke` matrix legs, the
Pages build): about 290 MB a push.

**Quota figures, recorded 2026-10-17 from GitHub's public Git LFS billing documentation (not from the
owner's own billing screen):** GitHub Free personal accounts and Free organizations each include
**10 GiB of LFS storage and 10 GiB of bandwidth a month**. Beyond that, usage is billed when a budget
is set and blocked when none is, and the owner's billing page shows no budget, so the quota is a hard
stop. At 290 MB a push that was roughly 35 pushes a month. **The owner still confirms these figures on
their own account once the repository is published.**

What changed:

- Every checkout uses `lfs: false`. The `test` job (unit and `guards`) and both `smoke` legs leave the
  GIFs as pointer files: they read file names, sizes and `docs/media/manifest.json`, never GIF bytes.
  This was checked, not assumed: in a `GIT_LFS_SKIP_SMUDGE=1` worktree (pointers only) the whole unit
  suite and the `guards` project pass.
- The Pages build bundles the GIFs into Help, so it needs the real files. It uses the local composite
  action `.github/actions/lfs-media`, which caches `.git/lfs/objects` under a key hashing the pointer
  list (`git lfs ls-files -l | cut -d' ' -f1 | sort | sha256sum`), then runs `git lfs pull` and
  `git lfs checkout`. A cache hit downloads nothing; a miss downloads once and saves the cache.
- `scripts/workflowLfs.spec.js` fails if any workflow goes back to `lfs: true` or the Pages build stops
  using the action.
- The media stays in LFS and history is not rewritten.

Measured on GitHub (to fill in after the first two runs following the push; see `TODO/VERIFY.md`):

| Run | LFS download | Cache |
|---|---|---|
| First Pages build after the push | _pending_ | miss, saved |
| Second Pages build | _pending_ | hit |

## Revisit when

- The kernel or another dependency needs `SharedArrayBuffer` (cross-origin isolation headers).
- A backend appears (a hosted project store, a relay for `mcp/server.js --live`).
- Bandwidth approaches the Pages soft limit (the docs GIFs are the bulk of the site; see
  `CONTRIBUTING.md` "Repo size").

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
