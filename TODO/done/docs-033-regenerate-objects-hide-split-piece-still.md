---
title: Regenerate the objects-hide-split-piece docs still without rewriting every GIF
category: docs
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: done
---

> **Shipped:** ran only the one still on the `docs-laptop` and `docs-laptop-dark` projects (the spec is laptop-only; the other four skip) with `--update-snapshots=all`, because the default `changed` mode kept the old PNGs: the 1% `maxDiffPixelRatio` hid the stale header. The new stills show the `ui-090` header (`1 hidden · Show all` above `1 object`), the Share button and the pinned `v0.0.0 · 0000000` label. The magenta bar is the `save-status` mask: a probe read the chip's box as x 1073.5, y 18.5, 222.5 × 15 px, which matches the bar. No docs spec change. `e2e/docs-media.spec.js` passes; no GIF was touched.

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
