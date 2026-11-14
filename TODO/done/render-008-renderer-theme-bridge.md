---
title: The 3D view reads its colours from the theme tokens
category: render
kind: finding
priority: high
model: opus
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: [ui-112, ui-113]
status: done
---

## Resolution

Closed 2026-11-14. Shipped as proposed, with these differences.

- `readSceneTheme(style, scheme)` takes `#rrggbb` **and `#rgb`**. The production CSS minifier writes `#ffffff` as `#fff` and a custom property is reported as authored, so the strict reader threw on `--scene-light-key` in every production build and the viewport silently drew the fallback palette. The unit and e2e suites missed it because the fallback equals the tokens; the acceptance drive on a production build logged the console error. `e2e/viewport-scaffold.e2e.js` now fails on any `readSceneTheme` console error, in both themes.
- Extra tokens: `--scene-light-key` (key and ambient light) and `--export-body` (the glTF export preview material), beyond the list above.
- `capture_view` is **not** forced to one theme: the AI's capture follows the viewport's theme, as the file proposed by default (comment in `offscreenCapture.js`). Part thumbnails and glTF export are deliberately not themed.
- Light `--axis-x`/`--axis-y` now have values (`#b04a45`, `#4f7f3a`), so the DOM dimension lines, the gizmo and the rulers change colour in light mode only. That is the drift this file reported.
- `guard-allowlist.json`'s js-color entries are emptied; `src/render/theme.js` is the one exempt file for the fallback table, checked against the CSS by `theme.spec.js`.
- Performance: orbit frame time unchanged (`bench/results/2026-11-14-render-008.md`, new `bench/orbit-frame-time.mjs`); zero `getComputedStyle` calls in a 5 s orbit.
- `docs:media` regenerates every GIF and fails on the known `import-3mf-align.dark.gif` size budget, so the GIFs were not committed; no still picture drifted. Light-theme GIFs that show axis colours still carry the old red and green until the next clean `docs:gifs`.

## Problem

The three.js side keeps its own palette as hex constants in JavaScript. A theme change made in the
token files stops at the edge of the canvas.

- `src/render/scene.js:48-62`, `VIEWPORT_THEMES`: `background`, `gridMinor`, `gridMajor`, `axisX`,
  `axisY`, for `dark` and `light`.
- `src/render/mesh.js:257-272`, `BODY_COLORS`: `body`, `selected`, `secondary`, `ghost`, `hover`,
  for `dark` and `light`.
- `src/render/scene.js:118-123`: four light colours, the same in both themes.
- `src/render/offscreenCapture.js:102` (`SECTION_COLOR`), `src/render/export.js:117` (the export
  preview material), `src/render/partThumbnail.js:177` (a computed `rgb()`).

The duplication is acknowledged in comments on both sides ("kept in step with `--hover-highlight`
in `src/styles/tokens.css`", `mesh.js:252-255`; the mirror comments in `tokens.css`). It has
already drifted: the dark scene background is `0x161a21` and `--surface-0` is `#10131a`; the scene's
light-theme X axis is `0xb04a45` while `--axis-x` has no light override at all, so the X dimension line drawn
in the DOM (`DimensionLines.vue:72`) and the X axis line drawn in WebGL are different reds in light mode.

`Viewport.vue:2258-2273` (`applyMaterialTheme`) and `scene.js:176-186` (`setTheme`) already swap
whole palettes by name on a theme change, so the mechanism to re-colour without rebuilding exists.
What is missing is where the values come from.

## Affected files

- `src/render/theme.js` (new), `src/render/theme.spec.js` (new)
- `src/render/scene.js:36-62, 103-133, 170-192`
- `src/render/mesh.js:215-272` and its highlight helpers
- `src/render/offscreenCapture.js:102, 288`, `src/render/export.js:117`
- `src/components/viewport/Viewport.vue:2258-2273, 3630-3634`
- `src/styles/semantic.css`, `themes/*.css` (the scene roles)

## Proposed fix

1. **Scene roles become tokens** (added in the theme files from `ui-112`): `--scene-background`,
   `--scene-grid-minor`, `--scene-grid-major`, `--axis-x`, `--axis-y` (now with light values),
   `--body`, `--body-selected`, `--body-secondary`, `--body-ghost`, `--body-hover`,
   `--scene-section`, and the light rig as `--scene-light-sky`, `--scene-light-ground`,
   `--scene-light-fill`. `--body-selected` and `--role-moving` become the same base value by
   definition, which removes the "kept in step" comments.
2. **`src/render/theme.js`** exports `readSceneTheme(style)`, where `style` is anything with
   `getPropertyValue` (a `CSSStyleDeclaration` in the app, a plain object in tests). It returns a
   frozen `SceneTheme` of **24-bit integers**, parsing `#rrggbb` only and throwing on anything else,
   so a token that turns into `color-mix(...)` fails loudly instead of rendering black. Framework-free
   and DOM-free: the caller passes `getComputedStyle(document.documentElement)`.
3. **One read per theme change, never per frame.** `Viewport.vue` reads the theme once on mount and
   again in the `useTheme().onChange` callback (`ui-113`), then calls the existing
   `graph.setTheme(sceneTheme)` and `applyMaterialTheme(sceneTheme)`. Both change from taking a name
   (`'dark' | 'light'`) to taking the `SceneTheme` object. They already mutate existing `Color` and
   material instances with `setHex`, so the render path allocates nothing new. `getComputedStyle`
   forces a style flush, which is why it must stay out of `renderFrame` and the pointer path
   (`CLAUDE.md` Performance: no per-frame allocation, a 16 ms frame).
4. `VIEWPORT_THEMES` and `BODY_COLORS` stay as the **fallback** `SceneTheme` for Node, workers and
   tests (no DOM there), built from the same numbers as the tokens. `theme.spec.js` asserts the
   fallback and the CSS files agree, so they cannot drift again.
5. `offscreenCapture.js` and `export.js` take their colours from the `SceneTheme` they are handed.
   The AI's `capture_view` renders through the same context, so it follows the theme too; note in
   the retirement text whether a captured image should be forced to one theme for the model.
6. **User colours win.** A body with a colour override (`src/core/colorOverride.js`) keeps it in
   every theme. Only the default body colour and the highlights come from the theme.

## Effort

M–L. The ambiguity is in step 5 and in getting step 3's ordering right on first paint.

## Testing

- `src/render/theme.spec.js`: parses each token to the right integer; throws on a non-hex value;
  the fallback equals the CSS values for both themes (read the CSS files as text, as
  `tokens.spec.js` from `ui-112` does).
- `src/render/scene.spec.js`, `mesh.spec.js`: `setTheme(sceneTheme)` changes colours on the existing
  material instances (assert identity, not just value, to prove no reallocation).
- `e2e/viewport-scaffold.e2e.js` already samples real canvas pixels for the background; extend it to
  assert the sampled background equals `--scene-background` in both themes, and that the default
  body colour changes with the theme while a recoloured body does not. **All three engines** (WebGL
  output) and all three viewports with a snapshot at each.
- Performance: measure frame time during a continuous orbit before and after, per
  `.claude/prompts/perf-benchmark.md` (p50, p95, p99, worst frame). Target: no change, and zero `getComputedStyle` calls during a 5-second orbit (count them
  with a wrapper in the e2e hook build).
- Acceptance scenarios to re-drive, in both themes: 1 (primitives visible against the grid), 4
  (selection colours tell base from subtrahend), 13 (recolor).
- Closed findings whose reproductions re-run: `ui-014` (secondary selection colour), `ui-049` (hover
  highlight matches the list marker), `ui-099` (a coloured part returns to its recipe colour),
  `docs-030` (docs media in both schemes). `npm run docs:media` afterwards.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
