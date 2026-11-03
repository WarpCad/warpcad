---
title: Record the docs pictures in light and dark, and show the one that matches the reader's theme
category: docs
kind: finding
priority: medium
model: sonnet
depends: []
status: done
---

> **Retired 2026-11-03 (`/fix-todo docs-030`).** Shipped as specified, with these differences: the native shape stays OPEN (the owner's call, recorded in `docs/decisions/documentation.md`); the dark Help picture is a `<picture>` on `prefers-color-scheme`, and the home page swaps on VitePress's `dark` class, because the app has no toggle and VitePress does. Dev-only docs run with one worker, because light and dark leases collide on the shared dev server. Movies pin the version label like stills do. Four over-budget movies were trimmed or narrowed. The split-sheet still settles its zoom before the shot.

## Problem

Every docs picture is recorded by `e2e/docs/*.docs.js` in a Playwright browser that has
`prefers-color-scheme: light` (the default, because the `docs-*` projects in `playwright.config.js`
set no `colorScheme`). The app is **dark mode primary** (`CLAUDE.md`, Conventions), so the pictures
show the app in the theme most readers do not use. In the in-app Help, at `app.warpcad.com/help/`
and on `warpcad.com`, a reader in a darkened room gets a near-white GIF in the middle of a dark page.

The pictures are 78 files in `docs/media/` (87 MB of GIFs, plus `manifest.json`) and 160 stills in
`docs/screenshots/` (21 MB). The stills are recorded the same way, so they have the same problem. The
owner reported it for the GIFs; the stills must be fixed together or the page will mix a dark GIF
with a light still of the same panel.

`scripts/help-build.mjs` turns `![alt](./media/x.gif)` into a single `<img src="img/media/x.gif">`
(`renderInline`, `resolveImage`), so there is no way today to name two variants. The home page
(`warpcad.github.io`) reads `help/index.json` and `help/<slug>.html` from the app, so it inherits
whatever the help build emits.

## Goal

Each docs picture exists in a light and a dark variant. Wherever a picture is shown, the reader
sees the variant that matches their theme: the in-app Help sheet, `app.warpcad.com/help/`, the
home page, and the native apps' bundled Help. Done means: with the browser (or OS) set to dark, no
docs page shows a light-themed picture, and with it set to light, none shows a dark one.

## Proposed fix

1. **Record both.** Add a `colorScheme` axis to the docs-media projects. Either `docs-<size>` gains a
   `-dark` twin (`docs-laptop-dark`, …), or `shot()` and `startMovie()` in `e2e/docs/support.js` open
   a second context with `colorScheme: 'dark'`. Prefer whichever keeps one spec file producing both
   variants from the same steps, so a spec change cannot update one theme and not the other. Name
   the outputs `x.png` / `x.gif` (light, unchanged) and `x.dark.png` / `x.dark.gif`, so existing
   embeds and `docs/help-slugs.json` keep working.
2. **Fix the dark baselines.** Check by eye that every dark picture reads correctly: the viewport
   background, the grid lines, selection outlines and the cursor overlay from `installCursor()` were
   all tuned on light. Anything that disappears on dark is an app or spec bug to fix here.
3. **Pipeline.** `scripts/docs-gifs.mjs` converts `.docs-movies/<name>.webm` to `docs/media/<name>.gif`
   and writes `manifest.json`. Make it convert both variants, with a `theme` field per manifest entry.
   `BUDGET` (24 s, 2.25 MB per GIF) applies to each variant. `docs-media-check.mjs` and
   `e2e/docs-media.spec.js` (the `guards` project) must treat `x.dark.*` as the pair of `x.*`:
   fail when one exists without the other, and when a variant is not produced by a spec.
4. **Help build.** In `scripts/help-build.mjs`, when `x.dark.<ext>` sits beside an embedded `x.<ext>`,
   emit

   ```html
   <picture>
     <source srcset="img/media/x.dark.gif" media="(prefers-color-scheme: dark)">
     <img src="img/media/x.gif" alt="…" loading="lazy">
   </picture>
   ```

   Authors keep writing one `![alt](./media/x.gif)` in `docs/*.md`; the dark file is found by name,
   and both are copied into `help/img/`. Keep a `help-build.spec.js` case for a picture with and
   without a dark twin. The `<picture>` form follows the OS/browser setting and needs no script,
   which also suits the home page's "no client-side JavaScript" rule.
5. **Does the app have its own theme switch?** `Viewport.vue` takes a `theme` prop, but the app's
   dark mode follows `prefers-color-scheme`. If a manual toggle exists or is added, `media=` on
   `<source>` will not follow it; check, and if so key the choice off the toggle's `data-theme` on
   the Help sheet instead (CSS `content`/`display` swap on two `<img>`s). Settle this before step 4.
6. **Size.** Two variants roughly double the media (87 MB to about 175 MB of GIFs; stills 21 MB to
   about 42 MB). `docs/decisions/documentation.md` already lists the +89 MB cost for the native
   bundle, so update that record and re-decide the native shape (bundled, stills-only, or web
   GIFs) with the new numbers. Lazy loading means a reader downloads one variant, not both, so the
   web cost is unchanged; the repository, the Pages artifact and the precache are what grow. Check
   the service worker's runtime caching (`helpRuntimeCaching()`) does not precache both.
7. **Home page.** `warpcad.github.io` renders `app-overview.png`. Give it a dark twin the same way
   (`<picture>` in the VitePress page) and confirm the daily rebuild picks up the Help HTML
   unchanged. Commit in that repository separately (its `CLAUDE.md` allows straight-to-`main`).
8. **Regenerate with `npm run docs:media`**, never by hand (`CLAUDE.md`). Do not use `docs:gifs` to
   add one movie; it rewrites every GIF (see memory: *docs:gifs rewrites every GIF*). Here a full
   rewrite is intended, because every picture gains a twin, but encode it as one deliberate commit
   with the manifest, not mixed with an app change.

## Affected files

- `playwright.config.js` (docs-media projects, `colorScheme`)
- `e2e/docs/support.js` (`shot`, `startMovie`, `endMovie`, `installCursor`) and the `e2e/docs/*.docs.js` specs that name outputs
- `scripts/docs-gifs.mjs`, `scripts/docs-media-check.mjs`, `docs/media/manifest.json`
- `e2e/docs-media.spec.js` (pairing guard)
- `scripts/help-build.mjs` (`renderInline` image branch, `resolveImage`), `scripts/help-build.spec.js`
- `docs/decisions/documentation.md` (size table), `docs/media/`, `docs/screenshots/`
- `../warpcad.github.io` (`app-overview` twin)

## Effort

L. The mechanical parts are small; the cost is re-recording 238 pictures twice, fixing whatever
looks wrong on dark, and the size decision for the native bundle.

## Testing

- Unit: `help-build.spec.js` — an embed with a `.dark` twin becomes a `<picture>` with a dark
  `<source>`; one without stays a plain `<img>`; a `.dark` file with no light partner is a build
  error. `docs-gifs.spec.js` — both variants converted and recorded, each inside `BUDGET`.
- Guard: `e2e/docs-media.spec.js` fails on an unpaired variant or a picture no spec produces.
- A real `*.e2e.js` spec that opens the Help sheet at `/` under `colorScheme: 'dark'` and under
  `'light'` and asserts the loaded `<img>`'s `currentSrc` is the dark or light file respectively.
  Run it at all three viewports (the Help sheet reflows at phone width) and on Chromium, Firefox and
  WebKit, since `<picture>` source selection is the engine-sensitive part.
- Eyeball every dark picture once (no scripted check can say "this is legible").
- Acceptance scenarios: none are touched by the app code, but if step 2 changes any app colour,
  re-drive the scenarios that show it.
- Closed findings: none.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
