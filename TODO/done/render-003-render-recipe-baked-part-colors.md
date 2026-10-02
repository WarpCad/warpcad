---
title: Render composite recipes' own baked-in part colours (core-026's Group.colors)
category: render
kind: feature
priority: medium
model: sonnet
milestone: M7
depends: [core-026, ui-037]
status: done
---

> **What shipped (2026-09-26).** Landed as scoped, one new tier added to
> `src/core/colorOverride.js`'s precedence — the one module that now owns all four
> tiers (`recipeColorOf`, `paintColorOf`), not ad hoc logic in `mesh.js`. Precedence,
> lowest to highest: theme palette → recipe `Group.colors[part]` → user whole-body
> override → user sub-part override, exactly as proposed. `mesh.js`'s
> `paintBodyObject` takes a `recipeColors` option and looks it up per part through
> `paintColorOf`; `Viewport.vue` passes the body's evaluated `Group.colors` through
> (`isGroup(body.geometry) ? body.geometry.colors : undefined`) alongside the existing
> `colorOverrides`. A recoloured-by-recipe part keeps the same "keep colour, tint on
> selection" treatment `ui-037` gave a user override — no separate decision needed,
> since `paintColorOf` folds the recipe tier into the same code path.
>
> **Transparency**: a `colorAlpha < 1` material (the Pi boards' `mb`/`board`, alpha
> `0.75`) now also sets `depthWrite: false`, mirroring `createGhostMaterial`'s existing
> reasoning — an opaque body is unaffected (default `depthWrite: true`, confirmed by
> unit test). Verified visually in Step 6: a translucent green board reads correctly
> against the opaque parts behind and on it, no z-fight, no hiding.
>
> **Inspector**: `describeBody`/`describeSubPart` (`src/core/inspector.js`) now report
> a `recipeColor`, framework-free — a drilled-into part's own recipe colour, or, for a
> whole undrilled body, the single visible part's colour when there is exactly one (a
> Washer). A multi-part composite (a Bolt, undrilled) has no single "whole body"
> answer and reports none, which is correct: colouring the whole Bolt still means
> picking one colour for every part, same as before. The Inspector's swatch/readout
> fall back to this recipe colour before the theme default, and **Reset stays gated on
> a *user* override only** — a freshly-dropped Washer reads `#808080` in the readout
> (not the word "Default") with Reset already disabled, exactly per this file's own
> Documentation example.
>
> **The regression guard the Testing section asked for**: an un-recoloured, recipe-less
> body (a Cube) keeps using the exact same shared palette material instances — pinned
> by `mesh.spec.js`'s existing "very same instance" case, unaffected by this change.
>
> **A real, unscoped finding surfaced and filed rather than patched inline.** Once
> recipe colours actually render, `hardware.bolt`'s `tap` clearance part — confirmed
> **not** hidden and **opaque red** in both V1 and this port (`core-026`'s own
> measurement) — visibly encloses `head`/`thread` and makes a freshly-dropped Bolt look
> like a plain red cylinder. This reproduces V1 exactly; it is not a bug in this task,
> and fixing it means diverging from V1, a real product decision this task's own scope
> (`core-021`/`core-022`'s precedent) says doesn't belong in this diff. Filed as
> `TODO/render-004-bolt-tap-clearance-visibility.md`; `TODO/VERIFY.md`'s `ui-037` row 3
> closed as `Issue` pointing at it.
>
> **Verified**: RED first for every new case (`colorOverride.spec.js`,
> `mesh.spec.js`, `inspector.spec.js`), then GREEN — 1715 unit tests (was 1699).
> `npm run typecheck` clean. Full non-Firefox Playwright matrix (`guards` +
> chromium-/webkit- × laptop/phone/tablet) green; Firefox environment-blocked as every
> task since `ui-028` (`TROUBLESHOOTING.md` 2026-09-17). New e2e (`hardware-library-
> placement.e2e.js`'s washer-gray pixel sample) proven to bite: reverting only the
> `Viewport.vue` wiring made it fail on a real blue-biased sample
> (`r:80 g:105 b:139`), confirmed via a `git stash` A/B. Scenarios 13, 3 and 2 re-driven
> by hand at laptop Chromium and phone WebKit with real taps; `core-020`'s repro
> re-run against a bolt and a washer post-change.

## Goal

`core-026` gave composite recipes a `color`/`colorAlpha` on each part's `OpRecord` and
carries them through the fold as an evaluated `Group`'s per-part `colors` map (across the
worker boundary too, via `transport.js`). **Nothing draws them.** A washer still renders
in the theme's body blue, not V1's gray, and a Raspberry Pi board's translucent green
`mb` is opaque blue. `ui-037` deliberately did not expand into this: its scope was the
*user's* override, and bolting recipe defaults onto the same change would have hidden a
precedence decision inside an unrelated diff. "Done" looks like: drop a Washer and it is
gray; drop a Pi 4 and its board is translucent green; a user override (`ui-037`) still
wins over both.

## Interaction model

n/a as a new control: no trigger, no new UI. It changes what an existing placement
draws. Selection feedback must stay readable on a recipe-coloured part exactly as it
does on a user-recoloured one (`ui-037`'s emissive tint, `OVERRIDE_HIGHLIGHT_INTENSITY`).

## Documentation

- **Page**: `docs/selection-and-inspector.md`'s "Colouring a shape" section. Say that
  ready-made parts arrive in their own colours, that **Reset** returns a part to *that*
  colour rather than the app default, and what the swatch shows for an un-overridden
  recipe part.
- **Example**: "Drop a Washer: it is gray. Select it, pick red, then press Reset. It goes
  back to gray, not to the app's blue."

## Affected files

- `src/render/mesh.js`: `paintBodyObject` gains a third tier between "user override"
  and "shared palette": the part's recipe colour from `Group.colors`. The colour-keyed
  `createColorMaterialCache` already handles alpha and per-part keys, so this should be
  a lookup, not new material management.
- `src/components/viewport/Viewport.vue`: pass the body's `Group.colors` through
  alongside `userData.colorOverrides`. Note that the evaluated geometry is already on
  hand in `syncBodies`.
- `src/components/inspector/Inspector.vue`: the swatch's "Default" should show the
  recipe colour when there is one, and the readout should say so.
- Transparency: a `colorAlpha < 1` board over opaque parts needs a look at draw order
  and `depthWrite`. `ui-037` only sets `transparent`/`opacity`, which was enough because
  nothing it could create was translucent from the Inspector.

## Proposed fix

Precedence, lowest to highest: theme palette → recipe `Group.colors[part]` → user
whole-body override → user sub-part override. Implement as one more branch in
`paintBodyObject`, reusing the cache. Decide explicitly whether a selected
recipe-coloured part keeps its colour and tints, like a user-overridden one, or swaps
to amber like an uncoloured one. `ui-037` chose keep-and-tint for overrides so the
colour stays visible; the same argument likely applies here.

## Effort

S-M. The material plumbing exists since `ui-037`. The real work is the transparency
check on the Pi boards and the Inspector's "Default" wording.

## Testing

- `mesh.spec.js`: a recipe part with `colors[part]` renders in that colour; a user
  override beats it; a part without one keeps the palette.
- `e2e`: extend `hardware-library-placement.e2e.js` (or a new spec) to sample a dropped
  washer's pixels for gray. All three engines (WebGL material path).
- **`TODO/ACCEPTANCE.md`**: scenario 13 (a recipe part recoloured, then Reset back to
  its recipe colour), scenario 3 (kit assembly renders complete), scenario 2 (hardware
  property edit).
- **Closed-finding regression surface**: `core-020`'s repro, since this reads
  `Group.colors` off composites placed through the command layer.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
