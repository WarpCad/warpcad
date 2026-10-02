---
title: Fix bright white flash before first paint (FOUC) on app load
category: build
kind: finding
priority: high
model: sonnet
milestone: M1.5
depends: [build-001]
status: done
---

> **Retirement note (2026-09-06):** Shipped exactly as proposed below — an inline
> `<style>` block plus a `<meta name="color-scheme">` tag in `index.html`'s `<head>`,
> matching the current `--surface-0` value (`#10131a`, unchanged from this file's
> original estimate) read live from `src/styles/tokens.css`. One addition beyond the
> proposed fix: `vitest.config.js`'s `include` pattern had to widen from
> `src/**/*.spec.js` to also match `build/**/*.spec.js`, since the new static test
> lives outside `src/` — a one-line config change, not a scope expansion of the fix
> itself. Verified with a throttled-load script (2s artificial delay on JS/CSS
> responses via Playwright route interception) across Chromium/Firefox/WebKit: the
> `<html>`/`<body>` background read `rgb(16, 19, 26)` (`#10131a`) and the
> `color-scheme` meta was already present in the DOM 150ms after navigation commit,
> well before the delayed stylesheet/script resolved, on all three engines.

## Problem

Loading the app shows a bright flash of white before the dark UI appears. Confirmed by
direct hands-on driving of the running app, and a repeat of a defect already seen in
the first attempt (`WarpCad1`) — this is the second time this exact symptom has shipped.

Root cause, confirmed by reading the actual files rather than guessed:

- [index.html](../index.html) has an empty `<head>` — no inline style, no
  `background-color`, no `color-scheme` meta. The browser paints its default white
  canvas the instant it parses `<body>`, before any stylesheet is applied.
- The dark background comes from [src/styles/tokens.css](../src/styles/tokens.css#L64-L77)
  (`html, body { background: var(--surface-0); }`), but that file is only pulled in as a
  JS-module side-effect import inside [src/main.js](../src/main.js#L3)
  (`import './styles/tokens.css'`). Vite serves that as part of the module graph fetched
  by `<script type="module" src="/src/main.js">` — so the browser must fetch and
  evaluate JS, which then triggers the CSS fetch, before the dark background ever
  applies. On anything slower than an instant load (a real network, a cold cache, a
  throttled CPU on a phone), there's a real, visible gap where the page is white.
- `CLAUDE.md`'s own Browser Support section already names this failure *class*
  explicitly: "Both previous attempts shipped real Safari/iPad-only bugs (**a
  white-flash theming bug**, a touch-orbit bug that only broke on vertical drag)". This
  finding is very plausibly a recurrence of that exact bug, not a new one — which is
  why it needs to be fixed before any more UI surface is built on top of the same
  index.html shell, and why WebKit specifically needs to be checked, not assumed fine
  because Chromium looks fine.

## Affected files

- [index.html](../index.html) — needs the fix: an inline critical style in `<head>`.
- [src/styles/tokens.css](../src/styles/tokens.css) — source of truth for the dark
  `--surface-0` value the inline style must match, so the two never drift.

## Proposed fix

Add a small inline `<style>` block directly in `index.html`'s `<head>`, before the
`main.js` module script tag, that sets `html, body { background: #10131a; }` (today's
`--surface-0` dark value, hardcoded here on purpose — this is the one place in the
project allowed to hardcode a color instead of using the custom property, since the
whole point is to paint correctly *before* any CSS custom property exists) plus
`<meta name="color-scheme" content="dark light">` so the browser's own default paint
(and native form/scrollbar chrome) is dark from the first frame, not just the `#app`
subtree once Vue mounts.

Do **not** solve this by inlining all of `tokens.css` or by switching Vite's CSS
extraction mode — that's more churn than the bug needs. A one-line background +
color-scheme in the `<head>` is enough to kill the flash, because it's specifically the
*background paint*, not full theming, that's visible during the gap.

Leave a one-line comment in `index.html` next to the inline style explaining *why* it
duplicates a value that otherwise lives in `tokens.css` (the non-obvious constraint:
this value must render correctly before any CSS file has loaded) — this is exactly the
kind of comment `CLAUDE.md`'s no-comments-by-default rule carves out an exception for.

## Interaction model

No control, trigger, or user-driven surface — this is a passive first-paint visual
defect on every load, stated explicitly per `CLAUDE.md` rather than the section being
silently dropped.

- **Precondition / Trigger**: n/a — happens automatically on every page load, not
  invoked by a user action.
- **Feedback**: the dark background (`--surface-0`) is visible on the very first
  painted frame; no white flash between navigation and the app rendering.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behaviour**: same as desktop — the flash is a browser-paint timing
  issue independent of viewport width; the fix (inline `<head>` style) applies
  identically at phone/tablet/laptop.

## Documentation

n/a — no new or changed user-facing control to document; this removes a glitch, it
doesn't add a capability a user needs instructions for.

## Effort

S (< 1hr) — a few lines in `index.html`; no architecture, no new module.

## Testing

- Add a static assertion (e.g. `build/index-html.spec.js`, Vitest) that reads
  `index.html` and asserts the `<head>` contains an inline style setting `html`/`body`
  background to the current `--surface-0` hex value, and a `color-scheme` meta tag —
  a plain string/DOM-parse check, not a browser test. This is deliberately what guards
  against regression here, not an E2E screenshot: the defect is a *race* (JS/CSS not
  loaded yet), and a normal Playwright screenshot taken after `page.goto` resolves is
  taken well after the race window has already closed, so it would pass even if the
  bug came back. A static check on the actual shipped markup is the reliable guard.
- Manually re-verify with the fix in place using CPU/network throttling (Chrome
  DevTools "Slow 3G" + 4x CPU slowdown, or Playwright's CDP
  `Network.emulateNetworkConditions`) to widen the load window enough to see whether
  any white frame is still visible — do this by eye once per engine below, since the
  race is inherently hard to assert numerically.
- **Runs against all three engines (Chromium/Firefox/WebKit), not Chromium alone** —
  per `CLAUDE.md`'s Browser Support section, this is very plausibly the same
  WebKit/Safari white-flash bug both previous attempts hit, so WebKit is the one that
  actually matters here, not a formality.
- **`TODO/ACCEPTANCE.md` scenarios this could affect**: none directly — no acceptance
  scenario asserts on first-paint timing. This is exactly the kind of one-off,
  device/timing-specific judgment call `CLAUDE.md`'s Verification section says belongs
  in a manual note, not a new scenario.
- No prior closed finding exists yet against `index.html` or the load shell, so there
  is no earlier repro to re-run — this is the first finding filed against this surface.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
