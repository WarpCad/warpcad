---
title: Two WebKit viewport-scaffold specs fail under parallel load, and two app-header screenshots have drifted
category: testing
kind: finding
priority: medium
model: sonnet
depends: []
status: open
---

## Problem

Found while verifying `ui-082`. All four fail on a clean `HEAD` (checked in a throwaway worktree
without the `ui-082` diff), so none comes from that change.

1. `e2e/viewport-scaffold.e2e.js:236` "the scale readout follows the zoom level", WebKit. It clicks
   `nav-zoom-in` six times, then reads `data-scale-mm` once and asserts `after < before`. It passes
   alone and fails under the 7-worker run (received 10, expected under 10). The read has no retry,
   so it races the readout update.
2. `e2e/viewport-scaffold.e2e.js:244` "WebGL actually draws a visible grid", WebKit. Fails under the
   same parallel load (received 1, expected over 3), 6 of 6 runs of the four-spec WebKit set at `HEAD`.
3. `e2e/docs/ai-partner.docs.js:123` `ai-working-chip still`, all three `docs-*` projects. Fails
   deterministically, alone as well: 1110 pixels (ratio 0.02) differ in `app-header`. The baseline
   `docs/screenshots/ai-working-chip.png` is stale or the header changed since it was taken.
4. `e2e/app-header-version.e2e.js:54` "the header keeps the version label at this viewport", every
   project (checked on `chromium-laptop` and `webkit-phone` at `HEAD`): `app-header-version.png` differs
   by 1778 pixels (ratio 0.03, limit 0.02). Same element as 3, so probably the same header change.

`io-012`'s completion row already recorded 1 and 2 as reproducing on untouched `HEAD`.

## Affected files

- `e2e/viewport-scaffold.e2e.js` (the two tests above)
- `e2e/docs/ai-partner.docs.js`, `docs/screenshots/ai-working-chip.png`
- `e2e/app-header-version.e2e.js` and its snapshots

## Proposed fix

1. Use `expect.poll` (or a retrying attribute assertion) for the scale readout. For the WebGL check,
   find why WebKit's canvas is not painted under load (context creation, first frame) and wait on a
   real settled signal, not a timeout.
2. Look at the chip and version diff images together. If the header change is intended, regenerate both
   baselines (`npm run docs:screenshots:update`; the e2e snapshot with `--update-snapshots`, headless) and
   commit them; if not, fix the regression.

Do not loosen thresholds.

## Effort

S–M.

## Testing

- Four-spec WebKit set (`panel-tiers`, `boolean-operations`, `phone-toolbar-chrome-fit`,
  `viewport-scaffold`) run ten times in a row with no failure.
- `npm run docs:screenshots` and `e2e/app-header-version.e2e.js` are green.
- Engines: all three for 1 and 2 (WebGL, canvas); the docs project is Chromium-only.
- Acceptance scenarios: none touched.
- Closed-finding regression: none.

None; no user-visible control changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
