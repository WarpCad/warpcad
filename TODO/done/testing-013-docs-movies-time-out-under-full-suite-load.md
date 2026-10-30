---
title: Docs movies time out under the full e2e matrix (the getting-started tour is over the 30 s default)
category: testing
kind: finding
priority: high
model: sonnet
milestone: none — found while closing io-023 (filed and closed 2026-10-30)
depends: []
status: done
---

> **What shipped (2026-10-30):** the docs-media projects in `playwright.config.js` get a
> project-level `timeout: 120_000` (was the 30 s default). Measured with the docs projects run
> alone (laptop, phone, tablet; three workers): the paced `@movie` tests take 8–22 s each, and the
> getting-started tour is over 30 s — it failed at 30.1 s on laptop. Under the full matrix, the
> same movies stall on a single `page.mouse.move` in the nudge drag, which is the budget running
> out, not a hang. The ceiling is the only change; no assertion, threshold or snapshot was loosened.
> **Not established:** the `split-sheet-manual-joints still` failure in the same full run.
> Run alone on laptop, through both the dev and preview builds, it passes against the committed
> picture, so the picture was not shown to be stale. The earlier `docs:screenshots:update` rewrote
> that file from a run whose project I could not attribute. The file is restored to HEAD; its
> failure is treated as load-sensitive until a full run says otherwise.

## Problem

The full headless matrix (`npm run test:e2e:headless`) ran four `docs-*` movie specs red under load:

- `e2e/docs/getting-started.docs.js:251` — the tour movie: `mouse.move` timed out at 30 s during the
  nudge drag (`getting-started.docs.js:185`). It passed alone on HEAD in a clean worktree.
- `e2e/docs/snap-align.docs.js` — `snap-subpart-both-sides` and `repeat-placement`: `waitForTimeout`
  inside the movie timed out at 30 s.
- `e2e/docs/print-prep.docs.js:167` — `split-sheet-manual-joints still`: screenshot mismatch (see
  above; not established).

Every failing movie is paced (`dwell`) under a screencast, and the docs projects run in the same
7-worker matrix as everything else, on SwiftShader software GL at 2× pixel density.

## Measurement

| Test (docs-laptop, alone, 3 workers) | Duration |
|---|---|
| `align-operation @movie` | 10.5 s |
| `align-to-origin-popover @movie` | 8.1 s |
| `snap-operation` / `snap-subpart-operand` / `print-prep-split` @movie | 14–19 s |
| `print-prep-manual-joint @movie` | 21.1 s |
| `repeat-placement @movie` / `snap-subpart-both-sides @movie` | 22.0 s / 17.8 s |
| `getting-started tour @movie` | **over 30 s** (failed at 30.1 s) |

Under the full matrix the same movies run slower, so anything above about 20 s alone is at the
edge of the 30 s budget.

## Fix

Per-project `timeout: 120_000` on the `docsProjects` entries in `playwright.config.js`, with the
measured numbers in the comment. It is the same shape as `testing-004` (a per-file timeout set from
measurement), not a global change: the non-docs projects keep the 30 s default.

## Done means

- The docs projects run green alone, at 120 s ceiling (the tour now passes with room to spare).
- The full matrix stays green for these specs on the final tree. See io-023's Step 5 run.
- A real hang still fails, at 120 s, not at 30 s.

## Interaction model

n/a — test-only change.

## Documentation

n/a — no user-visible behaviour.

## Testing

- Full `npm run test:e2e:headless` on the final tree (io-023's Step 5 run).
- Watch the next few full runs for the `split-sheet-manual-joints` failure; if it recurs, it needs
  its own root-cause finding.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
