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

**Cause of 3 and 4 (found 2026-10-25, full run while committing the roadmap split).** The version
label is wider, not the header changed. The `app-header-version.png` baselines were last written on
2026-10-20 (`8e0dde2`) and show the label as `dev`; `cf6c2d8` (`chore(release): v1.0.0`, 2026-10-21)
moved `package.json` from `0.0.0` to `1.0.0`, and the production build now shows the real version
there. The `mask` paints over the label, but the longer label pushes the hint text beside it to the
right, which is the whole diff (`test-results/app-header-version*-chromium-laptop/*-diff.png`). The
same run failed 4 on all nine engine-viewport projects (468 pixels, ratio 0.03) and 3 on
`docs-laptop` (1110 pixels).

## Affected files

- `e2e/viewport-scaffold.e2e.js` (the two tests above)
- `e2e/docs/ai-partner.docs.js`, `docs/screenshots/ai-working-chip.png`
- `e2e/app-header-version.e2e.js` and its snapshots

## Proposed fix

1. Use `expect.poll` (or a retrying attribute assertion) for the scale readout. For the WebGL check,
   find why WebKit's canvas is not painted under load (context creation, first frame) and wait on a
   real settled signal, not a timeout.
2. Make the header snapshot independent of the version's length before regenerating anything:
   give the version slot a fixed width, or mask the label and the hint together. Regenerating the
   baselines alone passes until the next release changes the label's width. Then regenerate both
   (`npm run docs:screenshots:update`; the e2e snapshot with `--update-snapshots`, headless) and
   commit them.

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
