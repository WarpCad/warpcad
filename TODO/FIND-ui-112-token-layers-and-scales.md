---
title: Split the tokens into base and semantic layers and add the missing scales
category: ui
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: []
status: open
---

> **2026-11-13:** the dependency on `ui-111` was dropped. That file is the umbrella and closes last, after this chain; its design decisions (answered 2026-11-10) are what this task builds on.

## Problem

`src/styles/tokens.css` (143 lines) is one flat list: 19 colours, three radii, two tap sizes, one
shadow, two font stacks, then the light theme's overrides and the page reset. It has no scale for
type, spacing, layering or motion, so components write those as literals (`ui-111` has the counts:
541 font sizes, 53 z-indexes with 26 distinct values, 70 radii, about 700 spacing declarations).

Three concrete defects sit on top of the missing structure:

- `var(--tap-target, 44px)` is used five times. No `--tap-target` token exists (the token is
  `--tap`), so those five controls ignore any change to the tap size.
- 103 `var(--token, fallback)` uses. Where the fallback is another token
  (`var(--border-strong, var(--border))` ×22) it is noise, since both are always defined. Where it
  is a literal (`var(--warn, #b7791f)` ×2, `var(--accent-contrast, #fff)` ×3,
  `var(--radius-md, 10px)` ×8) it is a second, hidden copy of the value.
- Layout variables that components set and read (`--kb-inset`, `--viewport-bottom-inset`,
  `--library-width`, `--inspector-width`, `--share-top`, `--gizmo-reserve`, …) are mixed in with
  design tokens by name alone. Nothing says which are theme values and which are runtime
  measurements.

## Affected files

- `src/styles/tokens.css` → `src/styles/base.css`, `semantic.css`, `themes/dark.css`,
  `themes/light.css`, `reset.css`, `index.css`
- `src/main.js` (imports `styles/index.css`)
- `index.html` (the first-paint background), `vite.config.js:220-223` (manifest colours)
- the five `--tap-target` uses and the literal-fallback uses (found by
  `grep -rn "var(--[a-z-]*, *[#0-9]" src`)

## Proposed fix

No visual change. This step adds structure and names; components keep their literals until their
own migration step.

1. Create the files in `ui-111`'s layout. Move the reset (`*`, `html, body`, `#app`) to
   `reset.css`. Keep every existing semantic token name unchanged.
2. `base.css`: every raw value, named by what it is, never by where it is used: the palette
   (`--slate-950`, `--blue-400`, …), `--space-1` … `--space-8`, `--font-size-1` … `--font-size-7`,
   `--radius-1` … `--radius-3`, `--duration-1`, `--duration-2`.
3. `semantic.css` and the two theme files: today's names, defined from base values, plus the new
   scales. Choose the steps from what the code already uses, so migration is a rename:
   - type: `--text-size-2xs` 10px, `-xs` 11px, `-sm` 12px, `-md` 13px, `-lg` 14px, `-xl` 16px,
     `-2xl` 18px; `--weight-medium` 600, `--weight-bold` 650. Sizes with one or two uses
     (8px, 9px, 12.5px, 15px ×18, 20px, 22px, the `em`/`rem` ones) get a decision each in
     `ui-118`: snap to the scale or keep as a named exception.
   - layers, replacing 26 values with a handful: `--z-canvas-overlay` (0–6 today),
     `--z-panel` (10–20), `--z-chat` (25), `--z-popover` (30–31), `--z-modal` (40–45),
     `--z-help` (50–51), `--z-toast` (60). Each is a base number plus `calc()` for the
     backdrop/frame pair. Write the tier rule from `ModalShell.vue:8-9` here, once.
   - shape: `--radius-pill` (999px), `--radius-round` (50%).
   - motion: `--duration-fast`, `--duration-base`, `--ease-standard`, from the durations in use.
   - `--scrim` (the modal backdrop; `rgba(0,0,0,.5)` dark, lighter in light), `--focus-ring`
     (`2px solid var(--accent)`, written 43 times today), `--shadow-popover` for the
     `0 12px 40px` shadow four dialogs hand-write.
   - breakpoints cannot be custom properties inside `@media`. Record the three (`480px`, `640px`,
     `1100px`) as a comment block and as exported constants in `src/styles/breakpoints.js`, which
     `AiHeaderEntry.vue:71` and `TraceTool.vue:31` read from in place of their own strings.
4. Fix `--tap-target` → `--tap` in the five places. Remove fallbacks that name a literal; where the
   fallback is another always-defined token, drop it.
5. Rename runtime layout variables to a `--layout-*` prefix (`--layout-kb-inset`, …) so the guard
   (`testing-036`) can tell them from tokens. A pure rename, done with the guard's help.
6. First paint: `index.html`'s inline `background: #10131a` gains a
   `@media (prefers-color-scheme: light)` twin with the light `--surface-0`, so a light-mode user no
   longer gets a dark flash. Both literals, and the manifest's two, carry a comment naming the token
   they duplicate, and the guard checks they still match.

## Effort

M.

## Testing

- `src/styles/tokens.spec.js` (new, Vitest): parses the CSS files and asserts every semantic token
  is defined in both themes, every `var(--x)` used under `src/` is defined somewhere (this is what
  would have caught `--tap-target`), and the four out-of-file copies (`index.html` ×2, manifest ×2)
  equal `--surface-0`.
- E2E: no new spec. **Zero snapshot diffs** across the existing suite is the acceptance bar; this
  step claims no visual change. Run `npm run test:e2e:full` (3 viewports × 3 engines), since every
  screen imports the tokens.
- `npm run docs:media` must produce no changed picture.
- Acceptance scenarios: none re-driven (no behaviour change). If any snapshot differs, drive 1 and 7
  at all three viewports before accepting it.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
