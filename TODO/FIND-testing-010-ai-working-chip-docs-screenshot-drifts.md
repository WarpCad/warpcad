---
title: The docs screenshot "ai-working-chip still" fails on laptop and its baseline needs review
category: testing
kind: finding
priority: medium
model: sonnet
depends: []
status: open
---

## Problem

`e2e/docs/ai-partner.docs.js:123` ("docs media: while the Assistant works", "ai-working-chip still")
fails on `docs-laptop` with a `toHaveScreenshot` mismatch. It fails again when run alone with
`-g "ai-working-chip still" --project=docs-laptop`, so it is deterministic, not load-related.

Found 2026-10-24 by the full e2e run for the `ui-083` commit gate. That commit changes no app
code, so the drift predates it, but this was not proved against `HEAD` before filing.

Known-failures trailer: `docs/ai-partner.docs.js > docs media: while the Assistant works > ai-working-chip still > docs-laptop`.

## Goal

Either the chip has changed on purpose and its baseline needs refreshing, or it has regressed.
Decide which by looking at the screenshot diff, then fix the one that is wrong.

## Affected files

- `e2e/docs/ai-partner.docs.js` (the still at line 123)
- `docs/media/` (the baseline image)
- `docs/ai-partner.md` (the page that embeds the still)

## Proposed fix

1. Run the test alone and open the diff image in `test-report-for-coding-agents/`.
2. If the chip's colour, text or position changed on purpose (the Operations and header work in
   `ui-082` and `ui-084` touched nearby chrome), refresh with `npm run docs:screenshots:update`
   and check the new image by eye.
3. If it changed by accident, fix the component and keep the baseline.

## Testing

- Re-run the single test on `docs-laptop`, then the full `docs-*` screenshot suite under `CI=1`.
- Acceptance: none. This is documentation media, not a user-facing flow.
- Closed findings: none.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
