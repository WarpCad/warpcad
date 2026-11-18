---
title: Decide whether the style guard covers spacing and radius, and check the native window colour
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 when the theme umbrella (ui-111) closed
depends: []
status: done
---

## Problem

`src/styles/guard.spec.js` is strict for colour, `z-index`, `font-size`, `font-weight` and `var()` fallbacks. Two gaps remain
in "restyle from a known set of files":

1. **Spacing and shape are literals.** `ui-112` added `--space-1…8` and the radius tokens, but `ui-118` left spacing alone and the
   guard does not look at it. Measured 2026-11-14 across `.vue` files: 649 `padding`/`gap` declarations with a number, and 58
   numeric `border-radius` values (50% ×17, 999px ×15, 3px ×7, 2px ×5). Breakpoints (`src/styles/breakpoints.js`) are separate and out of scope.
2. **The native window colour is hand-copied.** `../warpcad-native/src-tauri/tauri.conf.json` `backgroundColor` is `#10131a`, the
   dark `--surface-0`. `index.html` and `vite.config.js` are held to the token by `src/styles/tokens.spec.js`; this one is not, and it is in another repository.

## Goal

Owner decision first: does spacing belong in the guard? Options: (a) leave it, since layout padding is local and rarely restyled;
(b) guard `border-radius` only (58 values, cheap: 50% and 999px map to `--radius-round` and `--radius-pill`); (c) guard
spacing too, which is a very large mechanical sweep with snapshot risk. Recommendation: (b). Then, for the native colour,
either a spec that reads the sibling repo's file when it exists, or a `warpcad-native` check against the published token value.

**Decided 2026-11-17 (owner, /owner, OWNER.md Q2):** radius **and** spacing: guard both. Do radius first (58 values, mostly 50% and 999px onto the existing tokens), then spacing (649 `padding`/`gap` values) onto `--space-1…8`. Expect many snapshot diffs; list them in the commit. If the spacing sweep outgrows one tick, commit radius as part 1 and keep the task open.

**Shipped 2026-11-17 in two commits.** Part 2: `style-spacing` rule; 627 `padding`/`gap` values onto `--space-1…8` plus `--space-4h` (10px) and `--space-5h` (14px); 44 off-scale values snapped (OWNER.md Q94); a full 3x3 run found 42 drifted tests (4 layout specs, about 38 docs stills), regenerated and re-verified (`help-from-align` and `help-from-popup` needed a one-worker regeneration). Part 1: `style-radius` rule added to `guardScan.js` with a bite test; 34 `.vue` files now use `--radius-*` tokens. New tokens `--radius-xs` (3px, absorbs 1–5px) and `--radius-thumb` (40% / 18%) in `semantic.css`. Snapped values: 1/2/4/5px → 3px (xs), 12px top corners → 10px (md), `calc(sm - 2px)` → xs. The native-colour check already existed in `guard.spec.js`. Pair run green (chromium-laptop + firefox-phone), no snapshot diffs.

## Testing

- The guard spec gains tests for each new rule (a literal fails, a token passes), then runs over `src/` with no allow-list.
- Layout e2e at all three viewports in the rotating pair; any radius snapping is a snapshot diff to review and list.
- Re-run `testing-036` and `ui-118`'s guard reproductions.
- Docs: update `docs/decisions/theming.md` ("The guard" and "The three hand-copied values").

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
