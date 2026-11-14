# Theming: which files to edit to restyle WarpCad

**Status:** accepted 2026-11-14, closing `TODO/ui-111` (the theme architecture umbrella). This page is for whoever restyles
the app. It is not end-user Help: the user-facing part (choosing System, Dark or Light) is in [`docs/help.md`](../help.md#light-and-dark).
No library is chosen here, so there is no options table. The three owner decisions of 2026-11-10 were: base components live
in the existing component folders, themes are System, Dark and Light chosen in the app, and the guard is a Vitest spec.

## Where each kind of change goes

| To change | Edit | Notes |
|---|---|---|
| The palette, type sizes, spacing steps, radii, durations | `src/styles/base.css` | Raw values with no meaning. Every other layer reads these. |
| What a role means (`--surface-0`, `--text-1`, `--accent`, `--z-modal`, `--text-size-sm`, `--scene-background`) | `src/styles/semantic.css` | Role names stay stable, so no component changes. |
| One theme's look | `src/styles/themes/dark.css`, `src/styles/themes/light.css` | Each redefines the same set of roles. A new theme is a third file plus an `@import` in `src/styles/index.css`. |
| Reduced motion | `src/styles/reset.css` | One rule zeroes `--duration-1` and `--duration-2`. Looping spinners and the tier crossfade carry their own handling. |
| Which theme is active, and the choice offered to the user | `src/composables/useTheme.js`, `src/stores/settings.js` | `useTheme` is the only reader of `prefers-color-scheme`. It writes `<html data-theme>`. |
| The 3D view's colours | the `--scene-*`, `--axis-*` and body tokens in the theme files; `src/render/theme.js` maps them | The renderer reads the tokens once per theme change, never per frame. `src/render/theme.spec.js` holds the JS fallback equal to the CSS. |
| How buttons, fields, dialogs, toasts, chips look | the base components in `src/components/controls/`, `display/` and `layout/` (`BaseButton`, `IconButton`, `TextInput`, `NumberField`, `BaseDialog`, `BaseToast`, `BaseChip` and the rest) | Restyling one restyles it everywhere it is used. |

## The three hand-copied values

`--surface-0` is also written, on purpose, in three places that load before the token files or outside this repository:

- `index.html`, the first-paint background, dark and light. `src/styles/tokens.spec.js` fails if it drifts from the token.
- `vite.config.js`, the web manifest's `background_color` and `theme_color`. The same spec checks it.
- `../warpcad-native/src-tauri/tauri.conf.json`, `backgroundColor`. **Nothing checks this one**; change it by hand when `--surface-0` changes.

## The guard

`src/styles/guard.spec.js` (rules in `src/styles/guardScan.js`) fails on a raw colour, a numeric `z-index`, a numeric
`font-size` or `font-weight`, a `var(--x, literal)` fallback, or a `var()` naming a token nothing defines, anywhere under
`src/` outside `src/styles/`. It is strict: there is no allow-list. Spacing (`padding`, `gap`, `margin`) and `border-radius`
literals are not guarded, so a restyle of spacing or corner shape still needs a search across `src/components/`.

## How to check a restyle

`npx vitest run src/styles` for the guard and the token specs, then `npm run docs:media` (every docs picture is generated, and
`e2e/docs-media.spec.js` compares them) and a layout e2e run. A snapshot diff after a deliberate restyle is expected; list it in
the commit.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
