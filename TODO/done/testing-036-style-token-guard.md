---
title: A guard spec that fails on styling written outside the token files
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: [ui-112]
status: done
---

> **What shipped (2026-11-13).** `src/styles/guard.spec.js` (Vitest, unit only), the scanner it calls in
> `src/styles/guardScan.js` (pure functions over text, so the spec proves each rule with a fixture string),
> and `src/styles/guard-allowlist.json`. Seven rules: `style-color`, `style-z-index`, `style-font`,
> `style-var-fallback`, `style-var-undefined`, `inline-style-color`, `js-color`. The allow-list is seeded from
> the tree and the spec fails when a file is over OR under its count. `index.html` and the manifest copies of
> `--surface-0` are checked, and `../warpcad-native/src-tauri/tauri.conf.json` when that sibling is checked out
> (a skip note prints otherwise). Deviations: `guardScan.js` is a third file, so the fixtures never need a
> deliberate violation in the tree; `src/render/theme.js` does not exist yet, so its exemption is inert until
> `render-008`; named colours are matched only in colour-bearing properties (colour, background, border, outline,
> fill, stroke, shadow, text-decoration, caret, accent) to avoid false hits on font names and keywords;
> `<script>` blocks of `.vue` files under `src/components/` count toward `js-color`. Spacing and radius stay unguarded.

> **Decided 2026-11-10** (`ui-111`, decision 3): the guard is a **Vitest spec** with no new
> dependency, which is what this file describes. `stylelint` was the option not taken.

## Problem

`CLAUDE.md` says "Colors are CSS custom properties, never hardcoded", and nothing enforces it. The
rule has held well for colour by habit (5 hex literals and 14 `rgb()` calls across 124 components),
and has not held for anything the tokens never covered (`ui-111`: 541 font sizes, 53 z-indexes).
Once `ui-112` adds those scales, the next component can still bring a literal back without anyone
noticing, and the "small, known set of files" stops being the whole story again.

The same gap exists on the JavaScript side: nothing stops a new `0xrrggbb` in `src/render/` or
`src/components/`.

## Affected files

- `src/styles/guard.spec.js` (new)
- `src/styles/guard-allowlist.json` (new; today's offenders, shrinking to empty in `ui-118`)

## Proposed fix

Model it on `e2e/docs-media.spec.js`: a spec that reads files from disk and fails with a message
naming the file, the line and the fix.

1. Walk `src/**/*.vue` (the `<style>` blocks and any `:style` binding or `style=` attribute in the
   template) and `src/**/*.js` outside `*.spec.js`.
2. Fail on, in a `<style>` block outside `src/styles/`:
   - a colour literal: `#rgb`…`#rrggbbaa`, `rgb(`, `rgba(`, `hsl(`, `hsla(`, or a named colour other
     than `transparent`, `currentColor` and `inherit`;
   - `z-index:` with a number (must be a `--z-*` token, or `calc()` on one);
   - `font-size:` or `font-weight:` with a number;
   - `var(--token, <literal>)`, a fallback that is not itself a `var()`;
   - `var(--name)` where `--name` is defined nowhere under `src/` (the `--tap-target` defect).
3. Fail on, in JavaScript under `src/render/` and `src/components/`: a `0x` six-digit literal or a
   quoted `#hex` string, outside `src/render/theme.js`'s fallback table and
   `src/core/kernel/colors.js` (the CSS named-colour table for user colours, which is data).
4. **Phase in by rule.** Each rule has an allow-list of `file:count` entries seeded from today's
   state. The spec fails when a file exceeds its allowance **and** when it is under it (so the list
   must be tightened as files are migrated, and can never grow). `ui-118` empties it.
5. Spacing and radius are deliberately not guarded at first: roughly 700 declarations, and many are
   legitimate one-off layout values. Revisit when `ui-118` reports how many survive.
6. Check the copies outside the app too: `index.html`'s inline background, the manifest colours in
   `vite.config.js`, and `../warpcad-native/src-tauri/tauri.conf.json`'s `backgroundColor`, when that
   repository is checked out beside this one, must equal `--surface-0`. Skip the native check with a
   printed note when the sibling is absent.

## Effort

S–M.

## Testing

- The spec is the test. It also needs its own unit cases, in the same file, run against small
  fixture strings: one passing and one failing snippet per rule, so a regex change cannot quietly
  stop matching.
- Vitest only; no browser. Chromium only is moot.
- It runs in `npm test`, so it is part of the pre-push gate from the day it lands.
- Acceptance scenarios: none.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
