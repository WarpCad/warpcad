---
title: Fix what a fresh cold reader still rated partial after docs-038 (resize-fit camera, tour Subtract press, relink History crop, subpart drill-in caption)
category: docs
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-19 from the docs-038 cold read
depends: []
status: open
---

## Problem

`docs-038` re-recorded five movies with large on-canvas captions. A fresh agent given frames every second rated
`boolean-subtract-order` **CLEAR** and the other four short of that:

1. **`resize-fit.gif` — UNCLEAR.** The captions state *X 60 Y 40 Z 40* then *X 30 Y 20 Z 20*, but the pixels do not show Y and Z
   changing: the camera reframes between the two Fits, so the before and after cannot be compared, and the Inspector's Size fields
   still read 40 (only the small Bounds line shows the true value). Proposed: hold the camera fixed across both Fits (or end with
   the same side-by-side card the Subtract-order movie uses, two pictures at one angle), and keep the caption.
2. **`tour.gif` — PARTIAL.** The Subtract press itself falls between one-second samples (cursor on the button, then the result). Nudge
   and Export have no caption. Proposed: a short caption on each, and a longer hover-then-press beat.
3. **`timeline-relink.gif` — PARTIAL.** The History list is cropped at the bottom edge, so the broken row and its badge are tiny and
   the reason text is unreadable; the captions carry the story. Proposed: scroll the History panel so the broken row sits mid-frame,
   or caption it larger.
4. **`boolean-subpart-operand.gif` — PARTIAL.** The drill-in to the bolt's `thread` part has no caption, and the groove sits on the
   far side of the cube. Proposed: caption the drill-in ("Click the bolt twice to reach its shaft") and orbit to show the groove.

Also noted: several movies end on a 4 to 6 s static hold and start with 2 to 4 s of nothing.

## Affected files

`e2e/docs/resize-bisect.docs.js`, `e2e/docs/getting-started.docs.js`, `e2e/docs/timeline-relink.docs.js`, `e2e/docs/booleans.docs.js`,
the matching GIFs under `docs/media/` (light and dark) and `docs/media/manifest.json`.

## Proposed fix

As in `docs-038`: edit the scripts, record only those specs with `--project=docs-laptop --project=docs-laptop-dark --grep @movie`,
copy the wanted `.webm` and `.json` into a scratch folder and encode through `convertMovies({ moviesDir, outDir: 'docs/media', root })`.
Never `npm run docs:gifs` or `docs:media`. Re-record every movie of a spec you edit (`booleans` has six, `resize-bisect` five).

## Effort

S.

## Testing

- `e2e/docs-media.spec.js`; `git status docs/media` shows only the intended files.
- Re-run the cold read with a fresh agent on the changed movies; set `TODO/VERIFY.md` rows `docs-019` #1, `docs-020` #2, `docs-011` #1,
  `docs-013` #2 from the result.
- TODO/ACCEPTANCE.md: none (docs only).

## Documentation

Captions in `docs/getting-started.md`, `docs/timeline.md`, `docs/booleans.md`, `docs/resize-bisect.md` where a movie's story changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
