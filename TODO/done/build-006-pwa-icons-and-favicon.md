---
title: Give the PWA real icons, a favicon and an apple-touch-icon
category: build
kind: feature
priority: high
model: sonnet
milestone: M10
depends: []
status: done
---

> **Retirement note (2026-10-15):** Shipped, with concept 16 (`design/logo-concepts/16-warp-flash.svg`,
> the "warp flash") as the artwork, copied to `public/favicon.svg` as the single source. It differs from
> the proposal in four places, all deliberate:
>
> - **No new dependency.** `scripts/app-icons.mjs` (not `icons.mjs`) renders through Playwright's Chromium,
>   already a devDependency, instead of `sharp`, so `npm run licenses` is unchanged. ImageMagick was ruled
>   out: its SVG renderer drops this mark's gradients and clip path. The script also writes the `.ico`
>   itself (PNG entries, a few lines) and exports the manifest's `icons` list, which `vite.config.js`
>   imports, so the manifest and the files cannot drift apart. Regenerate with `npm run icons`.
> - **Files sit at the `public/` root, not in `public/icons/`.** `pwa-192x192.png`, `pwa-512x512.png`,
>   `maskable-icon-512x512.png`, `apple-touch-icon.png` (180 px), `favicon.ico` (16/32/48) and
>   `favicon.svg`, which are vite-plugin-pwa's own default names. The maskable and Apple icons are the
>   *full-bleed* variant (the tile's corner radius removed), because those platforms apply their own
>   mask. The cube sits well inside the 80% safe zone.
> - **The spec is `e2e/app-icons.e2e.js`, not `pwa-install.e2e.js`.** The head links are tested on
>   Chromium and WebKit at all three viewports; the manifest test runs on Chromium at all three, under
>   `E2E_PREVIEW=1`. The unit spec checks that each committed PNG's real pixel size matches its manifest
>   entry.
> - **`theme_color` and `background_color` are now `#10131a`** (`--surface-0`, the colour `index.html`
>   paints first), not `#111111`.
>
> Verified: unit and typecheck clean; e2e passing on the dev server and the production build (including
> `csp.e2e.js` on Chromium and WebKit with the icons loading); a `BASE_PATH=/warpcad` build rewrites every
> link under `/warpcad/` and precaches all six files. **Not verified:** the install prompt itself, which
> Playwright cannot show, and a real iPhone or iPad home screen. That is logged in `TODO/VERIFY.md`.

## Goal

WarpCad installs as a PWA and shows a recognisable mark in the browser tab, the home screen and the
install prompt. Today `vite.config.js`'s manifest has no `icons`, there is no `public/` folder, and
`index.html` has no favicon or `apple-touch-icon`, so Chromium will not offer *Install* at all.

Done means all of these hold:

- The manifest lists a 192px and a 512px icon, plus a maskable 512px variant, and Chromium's
  install prompt appears on `https://app.warpcad.com` (or the local preview).
- A favicon shows in the tab, and an `apple-touch-icon` (180px) is used when the app is added to an
  iPhone or iPad home screen.
- The artwork is one of the chosen concept's SVGs (or a user-supplied square source), and the
  generated PNGs are reproducible from a script under `scripts/`, not hand-exported.

## Interaction model

n/a — no control, panel or gesture changes. The icon is a static asset.

## Documentation

`docs/getting-started.md` gets one line under installing the app: how to add WarpCad to a home
screen on iOS and Android, with the icon as it appears there. Shot in `e2e/docs/` only if a visible
step changes.

## Affected files

- `public/` (new: the source artwork, the generated PNG sizes, `favicon.ico`)
- `vite.config.js`                (manifest `icons` array, maskable entry)
- `index.html`                    (`<link rel="icon">`, `<link rel="apple-touch-icon">`)
- `scripts/icons.mjs`             (new: regenerates every size from the source SVG)
- `e2e/pwa-install.e2e.js`        (new: manifest lists the icons; `/` serves them with 200)

## Proposed fix

1. Choose the artwork (see the blocking decision). If it is one of `design/logo-concepts/`, the SVG
   is the source; otherwise the user's square SVG or 1024px PNG is.
2. Add `scripts/icons.mjs` (dependency: `sharp`, or an SVG-to-PNG step with a licence on the
   allow-list, checked by `npm run licenses`). Generate `public/icons/` once and commit the output.
3. Wire the manifest and `index.html`. Keep the theme colour in sync with the CSS dark-mode token.
4. Check the maskable icon keeps its mark inside the 80% safe zone at phone width.

## Testing

- Unit: `scripts/icons.mjs` output sizes match the manifest entries.
- E2E `e2e/pwa-install.e2e.js` at all three reference viewports on Chromium (manifest and favicon
  are engine-independent); WebKit for the apple-touch-icon link.
- Manual on a real iPhone and iPad (home-screen add): the icon and name appear as expected. Record
  the result in `TODO/VERIFY.md` only if it is not already covered by the e2e check.

## Acceptance scenarios to re-drive

None — `TODO/ACCEPTANCE.md` does not cover installation.

## Blocking decision

Which artwork to use: a concept from `design/logo-concepts/` (name the file), or a user-supplied
source. Until that is answered, this task stays `blocked-on` in its front matter.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
