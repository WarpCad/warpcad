---
title: Fix what the docs-040 cold read still rated partial (resize-fit Fit press and caption order, timeline-relink early captions and rollback caption lag)
category: docs
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-22 from the docs-040 cold read
depends: []
status: done
---

> **Shipped (2026-11-22).** Re-recorded resize-bisect (5) and timeline-relink with dark twins through a scoped moviesDir. Cold read: resize-fit CLEAR, timeline-relink PARTIAL; per the stop rule the remainder is owner question Q125, not a new finding.

## Problem

`docs-040` re-recorded `resize-fit`, `timeline-relink` and `boolean-subpart-operand` (the last now rates **CLEAR**, Subtract press seen). A fresh agent given frames every second rated the other two PARTIAL:

1. **`resize-fit.gif`.** The Fit toolbar press is not clearly seen (cursor on the toolbar button, then the popover already open); the second caption (*Fit X to 60, Keep aspect off*) shows before anything is typed, so it reads as ahead of the screen rather than with it; the Keep aspect checkbox and the Inspector text are tiny; the three-up closing card and its static hold take about a quarter of the movie. Proposed: caption the toolbar press itself ("Press Fit"), hover on it for about 1 s, zoom the popover or tick Keep aspect with a hover and caption, and shorten the hold on the card.
2. **`timeline-relink.gif`.** The first eight seconds (drop the cube, chamfer, sphere) carry no caption; the *Roll back to step 1* caption is up while the live scene is still showing (it should come as the row is pressed); the *Select step 3* caption holds three frames with little change; the *Roll forward* caption holds before the pointer reaches the button; the reason text and the History strip are small. Proposed: caption the build-up beats, move the rollback caption to the Roll back press, shorten the holds, and zoom the History panel for the reason.

## Affected files

`e2e/docs/resize-bisect.docs.js`, `e2e/docs/timeline-relink.docs.js`, their GIFs (light and dark), `docs/media/manifest.json`. Watch the 24 s budget of `timeline-relink` (22.8 s now).

## Proposed fix

As in `docs-040`: scoped recording of the edited specs' movies, a scratch `moviesDir`, `convertMovies`. Never `npm run docs:gifs` or `docs:media`.

## Effort

S.

## Testing

- `e2e/docs-media.spec.js`; `git status docs/media` shows only the intended files.
- Re-run the cold read with a fresh agent on the two movies.
- TODO/ACCEPTANCE.md: none (docs only).

## Documentation

Captions in `docs/resize-bisect.md` and `docs/timeline.md` where a movie's story changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
