---
title: Choose the theme in the app — System, Dark or Light — from one source of truth
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: [ui-112]
status: open
---

> **Decided 2026-11-10** (`ui-111`, decision 2): the user chooses between **System, Dark and
> Light**, with System the default. The text below is written for that answer.

## Problem

The theme follows the operating system only, and the app has no control for it. The fix: a user can pick **System**, **Dark** or **Light**, the whole app (panels and the 3D view) changes at
once, and the choice is remembered. Done means: one module decides the theme, nothing else reads
`prefers-color-scheme`, and adding a fourth theme is one CSS file plus one entry in a list.

Today two places decide the theme independently: the CSS
media query (`src/styles/tokens.css:84`) and a `matchMedia` call in `Viewport.vue:298-301` with its
own change listener at `:3842-3846`.

## Interaction model

- **Precondition**: none.
- **Trigger**: **File ▾ → Project settings…** is per-project, so the theme does not go there. It
  goes in the Help sheet's footer row, beside the version line, as a three-way segmented control
  labelled **Theme**: System · Dark · Light. (The header has no room at phone width;
  `e2e/header-width-budget.e2e.js` guards that.)
- **Feedback**: the app repaints in the chosen theme in the same frame, the 3D view included. The
  chosen segment shows as selected.
- **Placement**: n/a. **Selection response**: n/a. **Selection count**: n/a.
- **Small-screen behavior**: same as desktop. The control is three tap-sized segments in the Help
  sheet, which is already full-width at phone size.

## Documentation

- **Page**: `docs/help.md`, a short "Light and dark" section.
- **Example**: "Open **Help** (the **?** in the header). At the bottom, under **Theme**, tap
  **Light**. The panels and the 3D view turn light. Tap **System** to follow your device again."
- **Media**: `e2e/docs/help.docs.js` gains one still, `help-theme-control`, embedded in
  `docs/help.md`. The docs projects already render each picture in both schemes (`docs-030`); check
  that a forced theme does not fight the project's `colorScheme`.

## Affected files

- `src/composables/useTheme.js` (new), `src/composables/useTheme.spec.js` (new)
- `src/stores/settings.js` (a `theme` preference: `'system' | 'dark' | 'light'`)
- `src/styles/themes/dark.css`, `light.css` (selectors change from a media query to
  `:root[data-theme='…']`)
- `index.html` (a tiny inline step is not allowed by the CSP's `script-src 'self'`; see step 3)
- `src/components/viewport/Viewport.vue:298-313, 3630-3634, 3842-3846`
- `src/components/layout/HelpSheet.vue` (the control)
- `scripts/help-build.mjs:100` (the `<source media="(prefers-color-scheme: dark)">` twin)

## Proposed fix

1. `useTheme`: a module-level singleton holding `preference` (from `settings`) and `resolved`
   (`'dark' | 'light'`). It is the **only** reader of
   `matchMedia('(prefers-color-scheme: light)')`. It sets `document.documentElement.dataset.theme`
   to the resolved value and exposes `onChange(listener)` for non-Vue consumers (the renderer,
   `render-008`).
2. Theme CSS keys on `:root[data-theme='light']` and `:root[data-theme='dark']`. Keep the
   `prefers-color-scheme` media query as the no-JavaScript and first-paint fallback, scoped to
   `:root:not([data-theme])`.
3. First paint: the stored preference lives in `localStorage`, and the CSP forbids an inline script
   to read it before CSS loads. So a user who forces Light on a dark system sees one dark frame at
   start. Accept that, and say so in the commit. Do not weaken `script-src`.
4. `Viewport.vue` drops its own `preferredTheme()` and listener and takes `resolved` from
   `useTheme`. Its `data-theme` attribute (`:3933`) goes; the root one replaces it.
5. Help pictures: the `<picture>` twins switch on the media query, which would now disagree with a
   forced theme. Swap `media=` for a class the Help sheet sets from `resolved`, or render both and
   hide one by `[data-theme]`. `e2e/help-picture-theme.e2e.js` covers this today; extend it.
6. The control: a `SegmentedToggle` from `ui-115` if it has landed, otherwise three `aria-pressed`
   buttons in the existing Help footer style.

## Effort

M.

## Testing

- `useTheme.spec.js`: System follows a mocked `matchMedia` and its change event; Dark and Light
  ignore it; the preference persists; blocked storage degrades to System without throwing.
- `e2e/theme-switch.e2e.js` (new, navigates to `/`): open Help, choose Light, assert
  `html[data-theme="light"]`, sample a panel pixel and a canvas background pixel and assert both are
  light; reload and assert it stuck; choose System under an emulated dark scheme and assert dark.
  **All three viewports with a snapshot at each, and all three engines**: it reads canvas pixels.
- Extend `e2e/help-picture-theme.e2e.js` for a forced theme that disagrees with the system.
- Acceptance scenarios to re-drive: 1 and 13, once in each forced theme.
- Closed findings whose reproductions re-run: `docs-030` (light and dark docs media).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
