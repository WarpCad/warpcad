---
title: Run e2e against the production build (`vite preview`) by default, dev server as the opt-out
category: build
kind: feature
priority: medium
model: sonnet
milestone: M18
depends: []
status: done
---


> **What shipped (2026-10-21).** The default e2e run is the production build (`VITE_E2E_HOOKS=1 npm run build` +
> `vite preview` on :5184); `E2E_DEV=1` is the dev-server opt-out; a preview server is not reused unless
> `E2E_REUSE=1`. Three things the spec did not foresee, each found by a full run: (1) 20 specs imported
> `/src/…` modules from inside the page, which a bundle has no URLs for, so `src/e2eHooks.js` publishes
> `window.__e2eImport` in the e2e build only (pruned from the shipped bundle, checked: no `e2eHooks` chunk);
> (2) 12 spec helpers rebuilt functions with `new Function`, banned by the production CSP, so they now use
> `evaluateHandle` + `handle.evaluate`; (3) the service worker's "ready to work offline" strip resized the
> canvas under snapshots, so the worker is **blocked on every engine** (was WebKit only), including the docs
> projects, and `pwa-update` / `help` opt back in. Dev-host-only specs now skip themselves under preview
> (`ai-scripted`, `webmcp` live copy, `live-mcp-header-entry`, `ai-mcp-agent-pairing`, the last test of
> `mcp-connected-assistant`, and three live-bridge/scripted docs specs); run them with `E2E_DEV=1`. Header
> version snapshot now masks the version label (phone baselines regenerated). **Timing:** full 9-way run 947 s on preview
> (earlier full runs on dev took ~21 min per the `ui-061` Completion Log row, not re-measured here); a 57-test
> subset 23.9 s on dev → 9.6 s on preview; the build adds ~2 s when cached.
> Unit 6314 passed, e2e 4123 passed / 0 failed / 1165 skipped. Pre-existing, not from this task:
> `docs/ai-live-bridge.docs.js` "mcp-connected still" fails on dev too (needs a real MCP client).

## Goal

The default Playwright run builds the app once and serves it with `vite preview`, instead of
starting the dev server. Two aims: faster e2e runs (no on-demand module transforms per worker),
and tests that exercise the code that ships (the production CSP, the production service worker,
minified bundles). `playwright.config.js` already has this as an opt-in (`E2E_PREVIEW=1`,
`TODO/ai-004`, origin `:5184`); this makes it the default and keeps the dev server only as an
explicit opt-out for debugging (suggested spelling: `E2E_DEV=1`).

"Done": `npm run test:e2e` (and `/test`) needs no env var to run against the build; `E2E_DEV=1`
runs against `npm run dev` as before; the before/after wall-clock and the one-off build cost are
written into the retirement note.

## Interaction model

n/a — build and test tooling, no user-visible control.

## Documentation

n/a — no user-visible control. The contributor-facing notes change instead: `.claude/commands/test.md`,
the `E2E_PREVIEW` comments in `playwright.config.js`, and `CONTRIBUTING.md` if it names the dev
server for e2e.

## Affected files

- `playwright.config.js` (`PREVIEW` default, `ORIGIN`, the `webServer` entry, the WebKit
  `serviceWorkers: 'block'` exemption at the `use` block)
- `package.json` (e2e scripts; a pre-step that builds, or the `webServer.command` doing so)
- `.claude/commands/test.md` and any other place that spells `E2E_PREVIEW=1`
- `e2e/csp.e2e.js` (it passes only in preview today; it should now run in the default run)
- `scripts/test-progress/` only if the progress reporters key off the dev origin

## Proposed fix

Invert the flag: preview unless `E2E_DEV=1`. Keep the build step honest — a stale `dist/` is the
new failure mode, so the `webServer` command builds first (`npm run build && vite preview`) or
the run fails fast when `dist/` is older than `src/`. Do not reuse an existing server on `:5184`
without checking it serves the current build.

Things to check, because they change behaviour under the default run:

- **Production CSP.** The preview build carries the exact production policy, so specs that pass
  on dev may fail on inline styles, `blob:` workers, or the Sentry ingest host. Fix the spec or
  the app, never relax the CSP to make a spec pass.
- **Service worker.** The production worker is active in preview, and WebKit's Playwright build
  cannot route requests a worker issues, so the current exemption blocks it on WebKit. Decide
  whether that exemption stays; if it does, say which spec covers the worker on WebKit instead
  (or state that none does).
- **Wall-clock.** Measure the fast run (`.test-fast`: `chromium-laptop` + `webkit-tablet` +
  `guards`) before and after on the same machine, and report the one-off build cost and whether
  it pays back inside one run.
- **Docs media.** `npm run docs:media` shares the config; confirm its baselines do not drift
  under the production build (minified CSS ordering, font loading).
- Update `.claude/commands/test.md` and the `E2E_PREVIEW` notes to match.

## Effort

M.

## Testing

- A full `npm run test:e2e` under the new default is green or every failure is named; compare
  against a clean-tree dev-server run so pre-existing failures (`testing-007`, `testing-008`) are
  not blamed on this change.
- `E2E_DEV=1 npx playwright test e2e/<one spec>` still works.
- `e2e/naming.spec.js` (`guards`) unchanged and green.
- Engines: all three — the service worker and CSP behave per engine, which is the reason for the
  change.
- **Acceptance scenarios**: none touched by the code; but re-drive the scenarios the first
  CSP-only failure touches, if any appear.
- Closed-finding regression: none.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
