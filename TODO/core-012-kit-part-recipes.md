---
title: "Kit-part composite recipes: Board, BoardFrame, Anchor"
category: core
kind: feature
priority: medium
model: opus
milestone: M2
depends: [core-001]
status: open
---

> **Source note, resolved during write-up**: the vendored `jscad-utils@3.2.0` in this
> project's `node_modules` (the version `core-001`'s bolt port and `core-010`/`011`'s
> nut/washer ports diff against) only has `Board` — `BoardFrame` and `Anchor` don't
> exist in it. Both exist in the user's actively-developed `jscad-utils@6.0.0`, at
> `/Users/johncole/src/jscad/jscad-utils/src/parts.js:398` (`Anchor`) and `:445`
> (`BoardFrame`) — confirmed by reading that source directly. Per the user's explicit
> instruction, this task **ports by reading that source, without wiring up a real V1
> execution/dimensional-diff fixture** the way `core-001`/`core-010`/`core-011` do —
> that 6.0.0 version isn't installed in this project and isn't being added as a
> dependency just for a test fixture. All three recipes below are fully scoped; nothing
> in this task is blocked.

## Goal

`Initial design.md` §6 lists three "Kit part" Creation rows: `Board` (rounded PCB
slab), `BoardFrame`, and `Anchor` ("example of a multi-part `Group` as one draggable
item"). Add all three as composite recipes, following `core-001`'s established
pattern — expand `params` into plain `primitive.*`/`boolean.*`/`transform.*` op
records, no direct `@jscad/modeling` calls in the recipe itself.

### Board — confirmed against the vendored 3.2.0 source

```js
// jscad-utils/src/parts.js:133-144 (3.2.0, vendored here)
export function Board(width, height, corner_radius, thickness) {
  var r = util.divA([width, height], 2);
  var board = CAG.roundedRectangle({
    center: [r[0], r[1], 0], radius: r, roundradius: corner_radius
  }).extrude({ offset: [0, 0, thickness || 1.62] });
  return board;
}
```
A 2D rounded-rectangle profile extruded to `thickness` (default `1.62` mm, the
standard PCB thickness — confirmed as V1's own default, not guessed). One record, no
group — V1 returns a bare CAG/CSG.

### BoardFrame — confirmed against `jscad-utils@6.0.0` source

```js
// jscad-utils/src/parts.js:445-472 (6.0.0)
export function BoardFrame(outerWidth, outerHeight, innerWidth, innerHeight, corner_radius, thickness) {
  var rOuter = util.divA([outerWidth, outerHeight], 2);
  var rInner = util.divA([innerWidth, innerHeight], 2);
  var frame2D = CAG.roundedRectangle({ center: [rOuter[0], rOuter[1], 0], radius: rOuter, roundradius: corner_radius })
    .subtract(CAG.roundedRectangle({ center: [rOuter[0], rOuter[1], 0], radius: rInner, roundradius: corner_radius }));
  return frame2D.extrude({ offset: [0, 0, thickness || 1.62] });
}
```
The source's own comment is worth carrying into the port verbatim: it does the
rectangle subtraction **in 2D, before extrusion**, specifically to avoid "BSP
non-manifold artifacts that occur when subtracting two same-height `Board` solids" in
3D. `@jscad/modeling`'s `booleans.subtract` is confirmed polymorphic over `geom2`/
`geom3` (`node_modules/@jscad/modeling/src/operations/booleans/subtract.js:42-43`
dispatches on the geometry's own type), so the registry's existing `boolean.subtract`
entry needs no change to accept two 2D profiles — but the *recipe* must still do the
subtract on the 2D profiles and extrude the result, mirroring V1's ordering exactly,
rather than extruding both rectangles to solids first and subtracting those (which is
the exact non-manifold risk the V1 comment flags).

### Anchor — confirmed against `jscad-utils@6.0.0` source

```js
// jscad-utils/src/parts.js:398-407 (6.0.0)
export function Anchor(width = 10, height = 10) {
  var hole = Cylinder(width, height).Center().color('red');
  var post = Cylinder(height / 2, width * 0.66)
    .rotateX(90).align(hole, 'xz').snap(hole, 'y', 'inside-')
    .translate([0, 0, -height / 6]).color('purple');
  return Group({ post, hole });
}
```
A snap-fit anchor: a `hole` cylinder (diameter `width`, height `height`, centred — V1's
`.Center()` is exactly the base-on-z=0-vs-centred difference `hardware.bolt.js`'s own
header already documents, so `primitive.cylinder`'s default `center` already matches
V1's `.Center()`'d hole with no extra translate needed) and a `post` cylinder (diameter
`height/2`, length `width*0.66`) that's rotated 90° about X so its long axis runs along
Y, aligned to the hole's X/Z centre, snapped flush against the inside of the hole on
its −Y face, then nudged down `height/6` along Z (an analytic constant, not a measured
value).

**This does not hit `core-001`'s flagged "a recipe can't call `group.snap` against
geometry it didn't itself create" limitation** — that limitation is about a recipe
reaching for *another, already-placed document item's* geometry before the fold has
evaluated it. Here, `hole` and `post` are both built **inside this same recipe call**,
so the recipe can build both as real in-memory geometry, call `group.js`'s existing
`calcCenterWith`/`calcSnap` (already implemented and tested by `core-001`) to compute
the alignment/snap offsets, then throw that probe geometry away and emit only the
final `primitive.*`/`transform.*` records with the computed numbers baked in — exactly
the pattern `hardware.bolt.js` already uses for its own head/thread snap.

**Needs verifying, not assuming**: `rotateX(90)`'s exact sign/direction convention
against this project's own rotation convention (`src/core/rotation.js`, already
confirmed z-y-x Tait-Bryan by `ui-023`/`core-004` against `@jscad/modeling`'s
`fromTaitBryanRotation.js`) — build both and compare bounding boxes rather than assume
the sign matches, the same caution `ui-023`'s own retirement note already modeled.

## Interaction model

n/a — this lives entirely in `src/core/kernel/`, no UI surface exists yet. Feeds
`ui-013`'s Library panel once that task lands, for all three recipes.

## Documentation

n/a for end-user docs — no control exists yet to place any of these. Documentation
lands with `ui-013`.

## Affected files

- `src/core/kernel/recipes/kit.board.js` (new)
- `src/core/kernel/recipes/kit.boardFrame.js` (new)
- `src/core/kernel/recipes/kit.anchor.js` (new)
- `src/core/kernel/recipes/kit.board.spec.js`, `kit.boardFrame.spec.js`,
  `kit.anchor.spec.js` (new)
- `src/core/kernel/registry.js` (register `'kit.board'`, `'kit.boardFrame'`,
  `'kit.anchor'`, all `composite(0, ...)`)

No new `package.json` dependency — per the user's explicit call, this ports by reading
`jscad-utils@6.0.0` source directly rather than installing or fixture-diffing against
it.

## Proposed fix

**Board**: build the 2D profile with `@jscad/modeling`'s `primitives.roundedRectangle`,
extrude via `extrusions.extrudeLinear` to `thickness`, following the exact precedent
`registry.js`'s existing `primitive.triangle` entry already set for a 2D-primitive
Creation row (2D primitive → `extrudeLinear`, then check/adjust centring — V1's profile
is built in the positive quadrant and centred there, so verify against
`primitives.roundedRectangle`'s own default centre rather than assume it matches, same
caution `primitive.triangle`'s own comment documents).

**BoardFrame**: build outer and inner `primitives.roundedRectangle` 2D profiles at the
same centre, `booleans.subtract` them **in 2D** (confirmed polymorphic, see above),
then `extrusions.extrudeLinear` the resulting profile. Preserve V1's subtract-before-
extrude ordering exactly — the source comment's own non-manifold warning is exactly a
"do it this way for a reason" signal to carry into the port, not an implementation
detail to drop.

**Anchor**: inside the recipe, build `hole` and `post` as real `@jscad/modeling`
geometry (not emitted as records yet), call `group.js`'s `calcCenterWith` for the
`align(hole, 'xz')` step and `calcSnap` for the `snap(hole, 'y', 'inside-')` step to get
the offsets, then emit: `primitive.cylinder` for `hole` (centred, no translate needed);
`primitive.cylinder` for `post` at its base transform, `transform.rotate` (90° about X,
sign verified per the note above), then a single baked `transform.translate` combining
the computed align/snap offsets and the manual `[0, 0, -height/6]` nudge — mirroring
`hardware.bolt.js`'s "bake the computed vector in as a plain translate record" pattern
exactly. Group both parts under one `id` the way `ui-010`'s multi-part expansions
already do, so `Group.pick` (§6) can address `hole`/`post` individually later.

## Effort

M — three recipes, but each is a direct, source-confirmed port with no invented
geometry and no new kernel primitives; `Anchor`'s align/snap reuses already-built
`group.js` functions rather than needing new ones.

## Testing

Vitest, one `.spec.js` per recipe, plain Node. Since there's no V1 fixture to diff
against for `BoardFrame`/`Anchor` (see the source note above), these get **geometric
assertion tests** instead of dimensional-diff tests: `Board`/`BoardFrame` — bounding
box matches the requested outer dimensions and thickness, degenerate cases (corner
radius at or above the smaller half-dimension, zero thickness, `innerWidth`/
`innerHeight` at or above `outerWidth`/`outerHeight` for `BoardFrame`); `Anchor` — the
`post`'s bounding box actually touches the `hole`'s inner wall (confirming the snap
computation, since there's no V1 number to diff against, only the geometric relationship
V1's own code encodes), plus degenerate cases (zero/negative `width`/`height` should
throw, matching the registry's existing `requirePositive` convention).

No `*.e2e.js` — no UI surface exists yet, stated explicitly per `TODO/README.md`'s
rule, same as `core-001`'s precedent.

Acceptance scenarios: none directly pass/fail on this task alone — all three feed
`ui-013`'s Library panel once that task lands, same as `core-010`/`core-011`.

No closed finding's subsystem is extended here in a way that needs re-running.
