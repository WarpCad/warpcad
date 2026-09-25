---
title: Render composite recipes' own baked-in part colours (core-026's Group.colors)
category: render
kind: feature
priority: medium
model: sonnet
milestone: M7
depends: [core-026, ui-037]
status: open
---

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
