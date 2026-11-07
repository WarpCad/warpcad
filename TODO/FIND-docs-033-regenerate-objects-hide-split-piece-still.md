---
title: Regenerate the objects-hide-split-piece docs still without rewriting every GIF
category: docs
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: open
---

## Problem

`docs/screenshots/objects-hide-split-piece.png` was last written by `ui-089` and was not regenerated
after `ui-090` changed the Objects header (`TODO/VERIFY.md` `ui-090` #4). It was skipped because
`npm run docs:media`'s movie step fails and `docs:gifs` rewrites every GIF in `docs/media/`. A separate
row (`ui-089` #3) asks whether the magenta bar across the header in that still is the docs helper's mask
over the save status, as intended, and not a stray element.

## Affected files

- `docs/screenshots/objects-hide-split-piece.png` (all variants the docs projects produce)
- `e2e/docs/object-visibility.docs.js` (the `objects-hide-split-piece still` test; read only, unless the mask is wrong)
- `TODO/VERIFY.md` (`ui-090` #4 and `ui-089` #3)

## Proposed fix

1. Run only that still: `npx playwright test e2e/docs/object-visibility.docs.js --grep "objects-hide-split-piece still"`
   across the six `docs-*` projects that `docs:screenshots` uses, with the progress reporters loaded. Do
   **not** run `docs:media` or `docs:gifs`.
2. Diff the new PNGs against the committed ones and look at them. Confirm the magenta bar sits exactly
   over the save-status chip (compare its box with the chip's `getBoundingClientRect` in the same run).
   If it covers anything else, fix the mask in the docs spec.
3. Commit only the changed stills; `e2e/docs-media.spec.js` must still pass (no orphan, no dead link).

## Effort

S.

## Testing

- `npx playwright test e2e/docs-media.spec.js` and the single docs test above, with the progress reporters.
- Engines: Chromium (the docs projects). Viewports: the six docs projects (phone, tablet, laptop × dark and light).
- Acceptance scenarios: none.
- Closed-finding regression: none.

## Interaction model

Not UI-touching (docs media only).

## Documentation

- **Page**: the page that embeds `objects-hide-split-piece.png` (find it with `grep -rl objects-hide-split-piece docs/`); media is the still above.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
