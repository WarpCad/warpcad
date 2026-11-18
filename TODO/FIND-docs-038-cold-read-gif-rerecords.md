---
title: Re-record the five docs movies two cold readers could not follow (tour, timeline-relink, the two Subtract-order movies, resize-fit)
category: docs
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, split from docs-036 on 2026-11-18
depends: []
status: open
---

## Problem

`docs-036` fixed the sentences and the `rpi-keepout.png` picture from the cold-read panel. These five movies from the same panel still do
not read, and each needs a re-recording:

1. **`tour.gif`** (`docs-019` #1): neither reader could see the hole in the result at 640 px, and the Subtract press falls between sampled
   frames. Proposed: orbit or zoom onto the part before the result hold, hold the result about 2 s, show the Subtract press.
2. **`timeline-relink.gif`** (`docs-020` #2): at 500 px the amber chip text is about 5 px tall and on screen for about one sampled frame,
   and it shows *1 item built on Cube 1 no longer builds* with **Resolve…**, not the *broken* chip and **Re-link** that
   `docs/timeline.md` describes. Proposed: crop to History and the Inspector's amber box, or render at 640 px, show the press, and make the
   caption match the panel (see `FIND-ui-129`, which unifies the names).
3. **`boolean-subtract-order.gif` and `boolean-subpart-operand.gif`** (`docs-011` #1): the base is named only by small grey text, the two
   results are never on screen together, and nothing says which solid was cut. Proposed: a canvas label naming the base ("Cube is the
   base: the cylinder is cut out of it") and the two results side by side at one camera angle.
4. **`resize-fit.gif`** (`docs-013` #2): Y and Z do not visibly update. The page text now states the result (X 60 → 30 makes Y and Z
   40 → 20); re-record so Y and Z visibly change.

## Affected files

`e2e/docs/getting-started.docs.js`, `e2e/docs/timeline-relink.docs.js`, `e2e/docs/booleans.docs.js`, `e2e/docs/resize-bisect.docs.js`,
and the four GIFs under `docs/media/` (light and dark each), plus `docs/media/manifest.json`.

## Proposed fix

Edit each movie's script, record with `npx playwright test e2e/docs/<spec>.docs.js --project=docs-laptop --project=docs-laptop-dark --grep @movie`,
copy only the wanted `<name>.webm` and `<name>.json` into a scratch folder and encode through
`convertMovies({ moviesDir, outDir: 'docs/media', root })` (see `scripts/docs-gifs.mjs`). **Never run `npm run docs:gifs` or `docs:media`**:
they re-encode every recording and delete any that miss the size budget. Editing a `*.docs.js` marks every movie of that spec stale in the
manifest (the hash is per spec file), so re-record all of that spec's movies and only those (`booleans` has six, `resize-bisect` five).

## Effort

M.

## Testing

- `e2e/docs-media.spec.js` (dead link, orphan, stale hash, size budget); `git status docs/media` shows only the intended files.
- Re-run the cold read on the changed movies with a fresh pair.

## Interaction model

Not UI-touching.

## Documentation

`docs/getting-started.md`, `docs/timeline.md`, `docs/booleans.md`, `docs/resize-bisect.md` captions, where a movie's story changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
