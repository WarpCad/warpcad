---
title: A release or native build fails if the e2e hooks or the preview bridge are compiled in
category: build
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: []
status: done
---


> **Shipped as proposed, with two additions.** `assert-release-bundle.mjs` exports a pure `findDevOnlyMarkers`. The preview marker is the header name `x-warpcad-preview-transport`, sent on every bridge POST, so it only exists in a bundle when the transport is compiled in. Also: `e2e/pwa-update.e2e.js` now copies `dist-e2e`, the only other reader of `dist/` by path.

## Problem

Two development-only features are kept out of the shipped bundle by an environment variable alone:

- `VITE_E2E_HOOKS=1` compiles in `window.__e2eImport` (`src/main.js:27-30`, `src/e2eHooks.js`), a
  handle that imports any internal module by path.
- `VITE_LIVE_BRIDGE=1` compiles in the preview transport that lets an MCP host drive the tab
  (`src/composables/useLiveBridge.js:47-58`).

Nothing asserts they are off when a build is made to ship:

1. **Playwright builds into the same `dist/` folder a deploy would use.** `playwright.config.js:180`
   runs `VITE_E2E_HOOKS=1 npm run build`. Checked 2026-11-10: the `dist/` on this machine contains
   `__e2eImport` (2 occurrences). The Pages deploy is safe because CI builds fresh without the
   variable (`.github/workflows/pages.yml:60`). A hand deploy of `dist/`, or `npm run preview` after
   an e2e run, serves the hooked build.
2. **The native build inherits the shell's environment.** `warpcad-native/scripts/build-web.mjs`
   passes `process.env` through to `npm run build:native`. A terminal that still has
   `VITE_E2E_HOOKS=1` or `VITE_LIVE_BRIDGE=1` exported, or a stray `.env.local`, bakes them into an
   App Store binary. The `dist-native/` on this machine is clean today.

- **Attacker**: none directly. `__e2eImport` is reachable only by script already running in the
  page. It turns a small script injection into full access to the app's modules, the credential
  store included.
- **Likelihood**: low. **Impact if it happens in a store build**: a review-visible debug surface in
  a shipped binary that cannot be recalled quickly.

## Affected files

- `scripts/native-build.mjs`, `vite.config.js:132-160`
- `playwright.config.js:180, 193` (output folder)
- `scripts/assert-release-bundle.mjs` (new)
- `.github/workflows/pages.yml:60` (one added step)

## Proposed fix

1. `scripts/assert-release-bundle.mjs <dir>`: reads every `.js` under `<dir>/assets` and exits
   non-zero if it finds `__e2eImport` or the preview transport's marker (export a constant from
   `src/ai/bridge/previewTransport.js` so the script and the code share the string).
2. Run it at the end of `build:native` (`vite build --mode native && node scripts/assert-…
   dist-native`) and as a step after `npm run build` in `pages.yml`.
3. In `vite.config.js`, when `mode === 'native'`, force both flags off in `define`, whatever the
   environment says, as `analyticsSources()` already does for the GA id (`vite.config.js:119-123`).
4. Point the Playwright preview build at its own folder (`--outDir dist-e2e`), as the live-bridge
   build already does with `LIVE_OUT` (`playwright.config.js:193`), so `dist/` only ever holds a
   plain build. Add `dist-e2e` to `.gitignore`.

## Effort

S.

## Testing

- `scripts/assert-release-bundle.spec.mjs` (or a Vitest spec beside it): passes on a fixture folder
  without the markers, fails on one with either marker.
- `VITE_E2E_HOOKS=1 npm run build:native` must now succeed **and** produce a bundle without
  `__e2eImport` (step 3), and the assert step must pass.
- `npm run test:e2e:headless` still finds its hooks in `dist-e2e`. `testing-025` (dev-only specs
  and build notices) is open and touches the same builds: run them together.
- Acceptance scenarios: none. Chromium only is moot (build tooling).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
