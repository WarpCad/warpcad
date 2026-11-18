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
| One theme's look | `src/styles/themes/dark.css`, `src/styles/themes/light.css` | Each redefines the same set of roles. A new theme is a third file plus an `@import` in `src/styles/index.css`. For a look that goes past tokens, see Styles below. |
| Reduced motion | `src/styles/reset.css` | One rule zeroes `--duration-1` and `--duration-2`. Looping spinners and the tier crossfade carry their own handling. |
| Which theme is active, and the choice offered to the user | `src/composables/useTheme.js`, `src/stores/settings.js` | `useTheme` is the only reader of `prefers-color-scheme`. It writes `<html data-theme>`. |
| The 3D view's colours | the `--scene-*`, `--axis-*` and body tokens in the theme files; `src/render/theme.js` maps them | The renderer reads the tokens once per theme change, never per frame. `src/render/theme.spec.js` holds the JS fallback equal to the CSS. |
| How buttons, fields, dialogs, toasts, chips look | the base components in `src/components/controls/`, `display/` and `layout/` (`BaseButton`, `IconButton`, `TextInput`, `NumberField`, `BaseDialog`, `BaseToast`, `BaseChip` and the rest) | Restyling one restyles it everywhere it is used. |

## Styles

Besides the two base themes there are six **styles**: `kids`, `glass`, `deco`, `minimal`, `blueprint` and `pixel`, one file
each in `src/styles/skins/`, imported by `src/main.js` through `src/styles/skins/index.css` (and by Storybook, whose Theme
menu and `Themes/Showcase` story show them). The user picks one under Help → Style; the end-user page is
[`docs/help.md`](../help.md#styles).

A style is more than a theme. A theme only redefines tokens; a style also restyles the base components by class name
(button shape, borders, textures, ornament, type), because recolouring alone gave six versions of the same interface. Every
rule in a style file is nested under its own `:root[data-theme='<name>']`, so it applies only while that style is chosen.
The one exception is the top-level `.theme-swatch--<name>` rule, which draws the style's tile in the Help sheet.

| To change | Edit |
|---|---|
| A style's look | its file in `src/styles/skins/` |
| The list of styles, their order | `THEME_STYLES` in `src/stores/settings.js`, `STYLE_LABELS` in `HelpSheet.vue`, `skins/index.css` |
| Whether a style is light or dark | `THEME_SCHEMES` in `src/composables/useTheme.js` and the file's `color-scheme`; keep them in step |
| A style's Help tile | the `.theme-swatch--<name>` rule at the top of its file |

How it fits the rest:

- **`useTheme`**: `resolved` is the painted theme's name (`'dark'`, `'light'` or a style) and is what `<html data-theme>`
  carries; `scheme` is its brightness. The Help pictures and the renderer's fallback palette read `scheme`. `onChange`
  fires on any change of name, so a switch between two dark themes still recolours the 3D view.
- **The 3D view** reads each style's `--scene-*` and body tokens like any theme's, so each must stay a plain `#rrggbb`.
- **Dense clusters keep their geometry.** A style's button padding must not grow the navigation cluster over the grid
  readout at phone width, so each file restores `.chrome__mode`'s own sizing.
- **Fonts.** The CSP allows fonts from `'self'` only, so the display faces the styles depend on are bundled from
  Fontsource: Fredoka (Kids), Chewy (Kids headings), Limelight (Art Deco titles), Architects Daughter (Blueprint) and
  Silkscreen (Pixel labels). Chosen 2026-11-15 by the owner; `OFL-1.1` was added to `npm run licenses` for them (Chewy is
  Apache-2.0). Each face is fetched only when first drawn and is not precached. The other faces the stacks name
  (Josefin Sans, Instrument Serif, Inter, IBM Plex Mono) are used only where installed; their system fallbacks carry those
  styles well enough. Storybook loads the same bundled files, so it previews what the app shows.

  | Option | Why not |
  |---|---|
  | Fontsource packages (chosen) | Versioned, licence in each package's metadata, so `npm run licenses` and the third-party notices see it. Repo: 6.3k stars, 44 open issues, pushed 2026-11-09; packages 5.3.0 of 2026-07. |
  | Google Fonts stylesheet | Blocked by the CSP (`font-src 'self' data:`), and a request to a third party on every load. |
  | Hand-copied `.woff2` files under `public/` | No version or licence record; an update means re-downloading by hand. |
  | No web fonts | Pixel and Blueprint lose the lettering their look depends on. |

- **No specs of their own.** The guard and the token specs cover `src/styles/` as before; nothing checks a style's
  contrast or that it defines every themed token. The style files were checked by hand for both when written.

## The three hand-copied values

`--surface-0` is also written, on purpose, in three places that load before the token files or outside this repository:

- `index.html`, the first-paint background, dark and light. `src/styles/tokens.spec.js` fails if it drifts from the token.
- `vite.config.js`, the web manifest's `background_color` and `theme_color`. The same spec checks it.
- `../warpcad-native/src-tauri/tauri.conf.json`, `backgroundColor`. **Nothing checks this one**; change it by hand when `--surface-0` changes.

## The guard

`src/styles/guard.spec.js` (rules in `src/styles/guardScan.js`) fails on a raw colour, a numeric `z-index`, a numeric
`font-size` or `font-weight`, a numeric `border-radius` (`--radius-xs/-sm/-md/-lg/-pill/-round/-thumb`, or `0`), a `var(--x, literal)` fallback, or a `var()` naming a token nothing defines, anywhere under
`src/` outside `src/styles/`. It is strict: there is no allow-list. Numeric `padding` and `gap` (and their `-top`, `-left`, `row-gap` forms) must be `--space-1…8` or the half steps `--space-4h` (10px) and `--space-5h` (14px), or `0`; `margin` is not guarded. Off-scale values were snapped to the nearest step when `TODO/ui-123` part 2 landed.

## How to check a restyle

`npx vitest run src/styles` for the guard and the token specs, then `npm run docs:media` (every docs picture is generated, and
`e2e/docs-media.spec.js` compares them) and a layout e2e run. A snapshot diff after a deliberate restyle is expected; list it in
the commit.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
