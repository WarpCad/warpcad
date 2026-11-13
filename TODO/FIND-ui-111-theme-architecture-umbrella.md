---
title: Theme architecture — restyle the whole UI from a small, known set of files (umbrella)
category: ui
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: [ui-112, testing-036, ui-113, ui-114, ui-115, ui-116, ui-117, render-008, ui-118]
status: open
---

> **Re-wired 2026-11-13:** this umbrella now *depends on* its chain instead of the chain depending on it. It has no code of its own and is done when steps 1–8 are, so `ui-112` waiting on it was a deadlock for `/run-todos`. Its owner decisions were answered 2026-11-10 (below), which is all `ui-112` needed from it. Running this task means checking every step's file is in `TODO/done/` and the guard's allow-list is empty, then closing it. Model lowered to `sonnet` for that reason.

## Problem

The owner wants to restyle the whole UI by editing a small, known set of files. Today that works
for one thing only: the colour of DOM elements.

**What already holds (measured across all 124 `.vue` files, 2026-11-10).** Colour in components is
tokenised. There are 5 hex literals in 4 files and 14 `rgb()`/`rgba()` calls in 9 files; every
other colour is a `var(--…)` from `src/styles/tokens.css`, often through `color-mix()` (53 uses).
No SVG carries a literal `fill` or `stroke`.

**What does not.**

1. **Tokens cover colour, three radii, two tap sizes, one shadow and two font stacks, and nothing
   else.** Components fill the gaps with literals:
   - type: 541 `font-size` literals in 115 files, 18 distinct sizes (12px ×179, 11px ×102,
     13px ×97, 14px ×62, 16px ×34, 10px ×26, …); 98 `font-weight` literals (600 ×52, 650 ×38);
   - layering: 53 `z-index` literals in 36 files, **26 distinct values** from 0 to 60, with the
     tier scheme written only in a comment in `ModalShell.vue:8`;
   - shape: 70 literal `border-radius` values beside the three tokens (999px ×23, 50% ×21);
   - spacing: 380 `padding` and 319 `gap` declarations, all literal;
   - motion: 35 `transition`/`animation` declarations with their own durations;
   - breakpoints: `640px` ×35, `480px` ×15, `1099px`/`1100px` ×9, repeated in every file.
2. **103 `var(--token, fallback)` uses** hide missing tokens. `var(--tap-target, 44px)` (×5) names a
   token that does not exist (the token is `--tap`). `var(--warn, #b7791f)` and
   `var(--accent-contrast, #fff)` carry a light-theme-wrong literal as the fallback.
3. **The 3D view has its own palette in JavaScript.** `src/render/scene.js:48-62` (background, grid,
   axes), `src/render/mesh.js:257-272` (body, selected, secondary, ghost, hover),
   `scene.js:118-123` (light colours), `offscreenCapture.js:102`, `export.js:117`. Comments in
   `tokens.css` and `mesh.js` say the two are "kept in step" by hand. The dark scene background is
   `0x161a21` while `--surface-0` is `#10131a`, so they are already different. A theme change stops
   at the edge of the canvas.
4. **Theme is `prefers-color-scheme` only**, read in two places: the CSS media query
   (`tokens.css:84`) and a separate `matchMedia` in `Viewport.vue:300, 3844`. There is no way to
   choose a theme in the app, and no third theme is possible without editing both.
5. **Four values duplicate `--surface-0` outside the token file**: `index.html` (the first-paint
   background, dark even when the system is light), `vite.config.js:222-223` (the manifest's
   `background_color` and `theme_color`), and `warpcad-native/src-tauri/tauri.conf.json`
   (`backgroundColor`).
6. **The same control is styled in many places.** 68 components define their own button rule; ten
   define an identical form-field label; five plus five define two near-identical dialog buttons
   that differ only in `min-width`; four define an identical text input; four an identical section
   heading. Changing how a button looks means editing 68 files.
7. **What the light theme misses**: the `rgba(0, 0, 0, 0.5)` backdrop in `ModalShell.vue:101`
   and hand-written shadows in `DependentRepairDialog`, `VariableUsageDialog`, `HelpSheet` and
   `UserPartMenu` (`rgb(0 0 0 / 35%)`); the scene's light colours, which are the same in both
   themes; the export and section-cap materials; and item 5's first-paint background.

## Affected files

- `src/styles/tokens.css` (becomes a small folder, see below)
- every `.vue` file's `<style>` block, through the tasks below
- `src/render/scene.js`, `src/render/mesh.js`, `src/render/offscreenCapture.js`, `src/render/export.js`
- `src/components/viewport/Viewport.vue:298-313, 2258-2273, 3630-3634, 3842-3846`
- `index.html`, `vite.config.js:220-223`, `../warpcad-native/src-tauri/tauri.conf.json`

## Proposed fix

This file is the design and the order. Each numbered step is its own TODO.

### Target: three layers of tokens

```
src/styles/
  base.css       raw values, no meaning:  --blue-400, --slate-900, --space-1…8, --font-size-1…7
  semantic.css   roles, per theme:        --surface-0, --text-1, --accent, --danger, --z-modal
  themes/dark.css, themes/light.css       the semantic layer's values for one theme
  index.css      imports the above; the only file main.js imports
```

- **Base** holds every literal. A restyle that only changes the palette edits `base.css`.
- **Semantic** names stay exactly as they are today (`--surface-0`, `--text-2`, `--accent`,
  `--danger`, `--snap-guide`, …), so no component changes when the layers are introduced. New
  semantic scales are added for what is missing: type (`--text-size-xs…xl`, `--weight-medium`,
  `--weight-bold`), space (`--space-1…8` on a 2/4 px step), layers (`--z-viewport-overlay`,
  `--z-panel`, `--z-popover`, `--z-modal`, `--z-toast`), shape (`--radius-pill`, `--radius-round`),
  motion (`--duration-fast`, `--duration-base`, `--ease-standard`), scrim, focus ring, and the 3D
  scene's roles (`--scene-background`, `--scene-grid-minor`, `--scene-grid-major`, `--body`,
  `--body-selected`, …).
- **Component tokens** (`--button-bg`, `--field-border`) are **not** added up front. They earn their
  place only inside a base component that needs a value no semantic token expresses. Recommendation:
  start with none.

### Target: base components

Every other component builds from these, so restyling one base part restyles it everywhere.

| Base part | Task | Replaces |
|---|---|---|
| `Button`, `IconButton` | `ui-114` | 68 per-component button rules |
| `FieldLabel`, `TextInput`, `NumberField`, `SelectInput`, `SegmentedToggle` | `ui-115` | 20 `__input` rules, two number-entry patterns |
| `Dialog`, `Sheet`, `Popover` (on `ModalShell`) | `ui-116` | 11 backdrops, ~10 hand-rolled frames |
| `Toast`, `Banner`, `Chip`, `SectionHeading`, `VisuallyHidden`, `ListRow` | `ui-117` | 5 toasts, 2 banners, 7 chips, 7 headings |

### Target: switching themes

A `data-theme` attribute on `<html>` selects the theme file. `System` (the default) follows
`prefers-color-scheme`. One module, `src/composables/useTheme.js`, owns the choice and is the only
reader of the media query; the viewport and the renderer subscribe to it (`ui-113`, `render-008`).

### The guard

`testing-036`: a Vitest spec, modelled on `e2e/docs-media.spec.js`, that fails on a raw colour,
`z-index`, `font-size` or `var(--x, literal)` outside `src/styles/`. It starts with an allow-list of
today's offenders and the list only shrinks.

### Order

1. `ui-112` token layers and the missing scales (no visual change)
2. `testing-036` the guard, in report mode with today's offenders allow-listed
3. `ui-113` theme switch and `useTheme`
4. `render-008` renderer bridge
5. `ui-110` overlay behaviours (independent of 1–4; needed by 7)
6. `ui-114` Button and IconButton
7. `ui-115` fields; `ui-116` overlays; `ui-117` toast, banner, chip, heading (any order)
8. `ui-118` migration sweep: the remaining literals, then the guard's allow-list goes to empty

### Owner decisions (recorded here so the record survives without the answer)

1. **Where base components live.** Options: (a) no new category: interactive parts in `controls/`,
   read-only parts in `display/`, overlay frames in `layout/`, which matches the existing
   definitions in `CLAUDE.md` and needs no change to the list; (b) a new `base/` category holding
   all of them, which makes "the files to restyle" one folder but adds a category and changes
   `CLAUDE.md`. **Recommendation: (a).** Blocks `ui-114`–`ui-117`.
2. **Which themes, and whether the user can choose.** Options: (a) System, Dark, Light, chosen in
   the app; (b) keep `prefers-color-scheme` only, and build the layers anyway. **Recommendation:
   (a).** Blocks `ui-113`. A third theme (high contrast, say) is cheap after `ui-112` and is not
   proposed now.
3. **The guard's mechanism.** Options: (a) a Vitest spec, no new dependency; (b) `stylelint` with a
   declaration-value rule, a new dev dependency that needs a `docs/decisions/` record.
   **Recommendation: (a).** Blocks `testing-036`.

**Decided 2026-11-10** (owner, asked at the end of the architecture audit):

1. Base components live in the **existing folders**: interactive parts in `controls/`, read-only
   parts in `display/`, dialog and sheet frames in `layout/`. No new category; `CLAUDE.md`'s
   Component Categories list does not change.
2. Themes: **System, Dark, Light**, chosen in the app. System stays the default.
3. The guard is a **Vitest spec**. No new dependency.

## Effort

L. This file itself is done when steps 1–8 are done; it has no code of its own.

## Testing

Each step names its own specs. Across the whole chain:

- A restyle touches every screen, so every UI step from `ui-113` on runs its layout specs at **all
  three viewports in all three engines** (`npm run test:e2e:full`), with a snapshot at each. Steps
  that claim "no visual change" (`ui-112`, each base-component migration) must show **zero snapshot
  diffs**; a diff is a finding, not a baseline update.
- `npm run docs:media` after any step that changes appearance, since every docs picture is
  generated and `e2e/docs-media.spec.js` compares them. `e2e/help-picture-theme.e2e.js` covers the
  Help pictures' light and dark twins.
- Acceptance scenarios re-driven at the end of the chain, in both themes: 1, 4, 7, 9, 10, 13.
  Scenario 13 (recolor a body) is the one that proves a user colour still wins over the theme.
- Closed findings whose reproductions re-run when the renderer step lands: `docs-030` (light and
  dark docs media), `ui-099` (a coloured part returns to its recipe colour).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
