---
title: Theme migration sweep — replace the remaining style literals and empty the guard's allow-list
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: [ui-112, testing-036, ui-114, ui-115, ui-116, ui-117, render-008]
status: open
---

## Problem

After the base components land (`ui-114`–`ui-117`), most repeated styling is gone with the rules
that carried it. What remains is each component's own layout CSS, still written with literals that
`ui-112`'s scales now have names for. Until those are replaced, the guard (`testing-036`) runs with
an allow-list, and a restyle of type or layering still needs a search across `src/components/`.

Measured before any migration (2026-11-10), as the starting point:

- 541 `font-size` literals in 115 files; 98 `font-weight` literals in 61 files
- 53 `z-index` literals in 36 files, 26 distinct values
- 103 `var(--token, fallback)` uses in 42 files
- 5 hex literals: `ai/ChatPanel.vue` (2), `inspector/DependentRepairDialog.vue`,
  `layout/SaveToLibrarySheet.vue`, `layout/UserPartMenu.vue`
- 14 `rgb()`/`rgba()` calls: `viewport/Gizmo.vue` (4), `viewport/RotateDial.vue` (2),
  `viewport/TranslateRuler.vue` (2), `ai/AiHeaderEntry.vue`, `inspector/DependentRepairDialog.vue`,
  `inspector/VariableUsageDialog.vue`, `layout/HelpSheet.vue`, `layout/UserPartMenu.vue`,
  `storage/ModalShell.vue`
- 17 inline `:style` bindings in 16 files. Most set runtime layout variables or positions, which is
  legitimate; each needs a look to confirm it sets no colour.
- 35 `transition`/`animation` declarations in 19 files with their own durations; 14 files honour
  `prefers-reduced-motion`, so 5 animate without checking it.
- Breakpoints `640px` (35 uses), `480px` (15), `1099px`/`1100px` (9) repeated per file.

Re-measure when this task starts; the base-component steps will have removed a large share.

## Affected files

- every `.vue` file still on `src/styles/guard-allowlist.json` when this starts
- `src/styles/guard-allowlist.json` (ends empty, then is deleted along with the allow-list code)

## Proposed fix

Mechanical, one category folder per commit (`ai/`, `display/`, `features/`, `inspector/`, `layout/`,
`sketch/`, `storage/`, `timeline/`, `viewport/`, then `views/`):

1. `font-size` and `font-weight` literals → the type scale. For the off-scale sizes (8px, 9px,
   12.5px, 15px ×18, 20px, 22px, and the four `em`/`rem` values), decide each: snap to the nearest
   step, or keep as a named token if it is a real role (the 15px dialog title is one).
2. `z-index` literals → `--z-*`. Where two overlays need an order inside one tier, use
   `calc(var(--z-popover) + 1)`, never a new number.
3. Colour literals → tokens. The gizmo, dial and ruler `rgba()` values are translucent overlays on
   the canvas: give them tokens (`--overlay-wash`, `--overlay-line`) with light-theme values, since
   today they are tuned for the dark scene only.
4. `var(--x, fallback)` → `var(--x)` wherever `--x` is always defined.
5. Durations → `--duration-*`. Add a `prefers-reduced-motion` rule to the five files that animate
   without one, or better, one global rule in `src/styles/reset.css` that zeroes the duration tokens.
6. Leave spacing literals unless a value plainly belongs on the scale. Report how many remain, so
   the owner can decide whether the guard should cover spacing.
7. Delete the allow-list. The guard is now strict.

## Effort

L in total; each folder is S–M.

## Testing

- The guard spec (`testing-036`) with an empty allow-list is the definition of done.
- Step 1's snapping changes pixels. Run `npm run test:e2e:full` (3 viewports × 3 engines) per
  folder, review every snapshot diff, and list the accepted ones in the commit. A diff in a folder
  the commit did not touch is a regression.
- `npm run docs:media` after each folder; commit the regenerated pictures with it.
- The translucent overlay tokens (step 3) sit over WebGL output: all three engines, and both themes.
- Acceptance scenarios to re-drive once, at the end, in both themes and at all three viewports:
  1, 4, 7, 9, 10, 13. This is also where the milestone-style five-minute free-form pass belongs:
  ask the owner for it when the allow-list reaches empty.
- Closed findings whose reproductions re-run: `ui-079` (tier crossfade, the one deliberate
  animation exception), `testing-009` and `testing-010` if still open (both are snapshot drift, and
  this task moves snapshots).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
