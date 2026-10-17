---
title: Serve the hosted app at app.warpcad.com: a CNAME in public/, checked by a guard, with the Pages custom domain set
category: build
kind: feature
priority: high
model: sonnet
milestone: M18 — Launch: publish, app.warpcad.com, Sentry and GA
depends: []
status: done
---

> **What shipped:** `public/CNAME` (`app.warpcad.com` plus the usual trailing newline) and the unit guard `scripts/cname.spec.js` (3 cases: file exists, content is exactly the domain, built `dist/CNAME` matches when `dist/` exists; RED 3/3 before the file, GREEN after). A real `npm run build` produced `dist/CNAME` with the same content and a manifest scope of `/`. `pages.yml`'s `base_path` comment was already right and is unchanged; the local build keeps base `/`. `docs/decisions/hosting.md` gained a dated "Custom domain" subsection. `public/CNAME` carries no SPDX marker: `scripts/spdx.mjs` only marks files with a known extension, and an extensionless file is skipped, like the other `public/` assets. **Not done (owner steps):** the DNS record `CNAME app -> warpcad.github.io` and the repository Pages settings (custom domain, Enforce HTTPS); the domain is not live. The live checks are in `TODO/VERIFY.md`. No acceptance scenario was re-driven (the spec lists none, and no user-visible control changed).

## Goal

The hosted app is reachable at `https://app.warpcad.com`, as `docs/decisions/hosting.md`
decided on 2026-10-15. Today the repository has no `CNAME` file, so GitHub Pages cannot
attach the custom domain, and the Pages build would be served at `warpcad.github.io/warpcad/`
only.

Done means: a visitor who types `app.warpcad.com` gets the app over HTTPS, the PWA manifest and
the service worker are at the domain root, and the build output carries the `CNAME` file so
the domain survives every deploy.

## Interaction model

Not applicable. This is a deployment change with no user-visible control.

## Affected files

- `public/CNAME` (new). One line: `app.warpcad.com`. Vite copies `public/` into `dist/`
  unchanged, and the Pages artifact is built from `dist/`, so every deploy carries it.
- `scripts/cname.spec.js` (new). A unit guard: `public/CNAME` holds exactly `app.warpcad.com`,
  and the built `dist/CNAME` matches it when `dist/` exists.
- `.github/workflows/pages.yml`. Its comment says `base_path` is `""` behind a custom domain.
  Confirm that `actions/configure-pages` returns `""` once the domain is set, and update the
  comment only if it does not.
- `docs/decisions/hosting.md`. Add a dated line that the custom domain is attached, with the
  DNS record used.

## Proposed fix

1. Add `public/CNAME` with `app.warpcad.com`.
2. Add the guard spec. It runs in the unit stage, so CI catches a missing or wrong file.
3. Owner steps (not in this file's code; listed in the M18 section of `TODO/ROADMAP.md`):
   - Squarespace Domains, the DNS for `warpcad.com`: add `CNAME app → warpcad.github.io`.
   - Repository Settings → Pages: Source "GitHub Actions"; custom domain `app.warpcad.com`;
     **Enforce HTTPS** once GitHub has issued the certificate.
4. After the first deploy, confirm `https://app.warpcad.com/` loads, the Help version line
   changes to the deployed commit, and `https://app.warpcad.com/manifest.webmanifest` lists
   scope `/`.

## Effort

S (< 1 hr of code). The DNS and Pages settings are owner steps, and the certificate can take
some time to issue.

## Testing

- Unit: `scripts/cname.spec.js` (the guard above). Tolerance: not applicable (exact string).
- E2E: an existing spec covers the PWA manifest and scope (`e2e/pwa-update.e2e.js`, `e2e/csp.e2e.js`).
  Re-run both on Chromium at laptop width after the change; the base path must stay `/` in
  the local build.
- Live check (owner, after deploy): the three URLs above. This cannot run in CI, because it
  needs the real DNS record.
- Engines: Chromium only. The change is a static file and a deploy setting; no WebGL, WASM or
  persistence path is touched.
- Acceptance scenarios: none. This touches no user-visible control; scenario 1 is re-run once
  as a smoke check after the deploy.

## Documentation

Not applicable. The domain is an operator change; no end-user page changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
