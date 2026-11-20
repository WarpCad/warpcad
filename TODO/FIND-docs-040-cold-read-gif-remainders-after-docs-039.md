---
title: Fix what the docs-039 cold read still rated partial (resize-fit lag, relink Re-link press, subpart Subtract press)
category: docs
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-20 from the docs-039 cold read
depends: []
status: open
---

## Problem

`docs-039` re-recorded four movies. A fresh agent given frames every second rated `tour.gif` **CLEAR** and the other three PARTIAL:

1. **`resize-fit.gif` — PARTIAL.** The closing three-up card (start, stretched, kept, one camera) works, but the caption lags the screen (it still says *Fit X to 60* while the popover already shows 30), the on-cube dimension labels are tiny, and the Inspector's Size fields still read 40 after the Fit (only Bounds shows 30 x 20 x 20). Proposed: set the second caption as the popover opens, and say in the caption that Size is the shape's own parameter.
2. **`timeline-relink.gif` — PARTIAL.** The broken row, badge and reason now read, but the Re-link press is not seen (no cursor on the button between samples), captions lag one action behind, and the chamfer on the cube is too small to confirm. Proposed: hover on Re-link with its caption for about 1.5 s before pressing, move each caption to the start of its action, and zoom in on the cube.
3. **`boolean-subpart-operand.gif` — PARTIAL.** Drill-in and groove are clear; the Subtract press is never seen and "Click the bolt" is captioned over frames where nothing changes. Proposed: hover-then-press on Subtract as `docs-039` did for the tour.

## Affected files

`e2e/docs/resize-bisect.docs.js`, `e2e/docs/timeline-relink.docs.js`, `e2e/docs/booleans.docs.js`, their GIFs (light and dark) and `docs/media/manifest.json`.

## Proposed fix

As in `docs-039`: edit the scripts, record only those specs with `--project=docs-laptop --project=docs-laptop-dark --grep @movie`, copy the wanted `.webm` and `.json` into a scratch folder and encode through `convertMovies({ moviesDir, outDir: 'docs/media', root })`. Never `npm run docs:gifs` or `docs:media`. A failed conversion deletes the old GIF, so `git checkout` it back first. Re-record every movie of an edited spec (`booleans` has six, `resize-bisect` five). Watch the 24 s duration budget of `timeline-relink`.

## Effort

S.

## Testing

- `e2e/docs-media.spec.js`; `git status docs/media` shows only the intended files.
- Re-run the cold read with a fresh agent on the changed movies.
- TODO/ACCEPTANCE.md: none (docs only).

## Documentation

Captions in `docs/resize-bisect.md`, `docs/timeline.md`, `docs/booleans.md` where a movie's story changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
