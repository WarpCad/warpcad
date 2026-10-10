---
title: print-prep cut-plane drag (expected 120, got 122) and inspector-hidden-parts overlay revert fail only under full-suite load
category: testing
kind: finding
priority: high
model: sonnet
milestone: M9
depends: []
status: open
---

## Problem

Two e2e tests pass alone (`npx playwright test e2e/print-prep.e2e.js e2e/inspector-hidden-parts.e2e.js`:
81/81) and fail in the full headless matrix, found by the `/run-todos` loop's independent
re-run after `ui-055` (`ddd9453`, run `E2E Test Run: 3168/3985 passed`, 2 failed, 815 skipped):

1. `e2e/print-prep.e2e.js:153` (failing assertion at `:218`) — "the hand recipe": after a
   20 mm synthetic touch drag of the cut-plane handle,
   `expect.poll(split-offset).toBeCloseTo(120, 0)` times out reading **122**.
   This is the *same* symptom `io-007` reported as fixed (per-step axis projection). It was
   seen red in the first `io-007` full run, green in the next four full runs, then red again
   here — so that fix did not close it. Not caused by `ui-055` (the spec file and handle code
   are untouched by it).
2. `e2e/inspector-hidden-parts.e2e.js:232` (`:261` in the detailed block) — "toggling off
   reverts the canvas to how it looked before" times out (5.6 s). A pixel-comparison of the
   canvas before and after a toggle; not previously seen failing.

## Goal

Find the mechanism for each (per `/test` Step 3: a load-only failure is red until root-caused)
and fix the code or the test's synchronisation — never loosen `toBeCloseTo(120, 0)` or the
canvas threshold to get green.

## Hypotheses (unverified)

- (1) The drag converts pixels to millimetres with the axis projection read *at that moment*;
  under load the camera or `data-axis-x/y` can still be settling (or a frame lands between
  `pointermove`s), so one step uses a stale scale. A 2 mm overshoot over a 20 mm drag is ~10%.
  Check whether the spec waits for the viewport to be idle before reading `startX/axisX`, and
  whether the overlay re-projects on `requestAnimationFrame` (stale between events).
- (2) The canvas is read before the translucent overlay's last frame renders; the spec likely
  needs to wait for a render-settled signal rather than a fixed poll.

## Testing

Reproduce under load (e.g. `--workers` raised, or run alongside the full matrix), identify the
project each fails on from `test-report-for-coding-agents/`, fix, then run the full matrix at
least twice green. Re-run `io-007`'s regression bullet (topmost-at-handle plus a cancelled
touch keeps the offset).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
