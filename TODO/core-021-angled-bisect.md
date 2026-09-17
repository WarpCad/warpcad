---
title: "Angled bisect — the angle/rotateAxis/rotateOffsetMm tilted-cutplane form"
category: core
kind: feature
priority: medium
model: opus
milestone: M4
depends: [core-019]
status: open
---

## Goal

`core-019` ported `jscad-utils`' `bisect(object, axis, offset, angle, rotateaxis,
rotateoffset, options)` **only for its unangled `axis`/`offset` form**, and stated the
scope limit explicitly on `group.js`'s `bisect` doc comment: "Passing an angle here is
not silently ignored: this signature has nowhere to put one." This task adds that
missing angle: `modify.bisect` grows three new optional params (`angleDeg`,
`rotateAxis`, `rotateOffsetMm`) that tilt the cut plane instead of leaving it
perpendicular to `axis`, matching real V1 usage measured by `core-019`'s own survey —
~8 of ~55 real `.bisect(` call sites (~15%) pass a real `angle`/`rotateaxis` pair, e.g.
`.bisect('x', 0, 120, 'z')` and `.bisect('y', -0, 30, 'x', 0)` (both cited verbatim in
`TODO/done/core-019-enlarge-fit-bisect.md`'s survey section — this task does not
re-survey, it reuses those two real call sites as fixture cases).

"Done" looks like: `bisect()` (`src/core/kernel/group.js`) accepts the same six V1
positional concepts (axis, offset, angle, rotateaxis, rotateoffset — V1's seventh
argument, `options.addRotationCenter`, stays out of scope, see Proposed fix), an
omitted or zero `angleDeg` is **bit-identical** to today's straight cut (no behaviour
change for any existing caller), and the tilted form is diffed against measured real
`jscad-utils@3.2.0` output the same way `core-019` diffed the straight form — not
against a reading of V1's source, which this task's own research found reads
ambiguously in one place (see Proposed fix, `rotationCenter`'s inert third component).

## Real V1 semantics, confirmed by reading source, not the roadmap line's paraphrase

The roadmap row (`core-021` in `TODO/ROADMAP.md`'s M4+ table) says this "needs a
rotated cut-plane construction `@jscad/modeling` has no direct primitive for." That
much is true — `@jscad/modeling` has no infinite-plane primitive and no `cutByPlane`,
the same gap `core-019` hit for the straight form. But reading V1's actual source
(`node_modules/jscad-utils/src/util.js:657-736`, `jscad-utils@3.2.0`, the exact version
`core-019`'s own fixture generator already runs) plus `@jscad/csg`'s
`addTransformationMethodsToPrototype` (`~/src/jscad/@jscad/csg.js/src/core/mutators.js:46`,
`prot.rotate = function(rotationCenter, rotationAxis, degrees)`) shows the tilt is
**not** a new boolean technique — it is a *coordinate transform* applied around
`core-019`'s existing half-space-box cut, which changes which model tier this needs
(see Effort/model below).

V1's `bisect` body, precisely:

1. `cutDelta = getDelta(size, bounds, axis, offset)` — **identical** to what `core-019`
   already ported as `bisect`'s offset resolution (undefined → centre; negative or
   `-0` → measured from the max face; positive → from the min face). `cutDelta` is a
   full 3-vector with only the `axis` component set, others zero (`util.axisApply`'s
   own default-to-zero behaviour, confirmed at `util.js:532-544`).
2. `rotateaxis` defaults per cut axis if omitted: `{x: 'y', y: 'x', z: 'x'}[axis]` —
   which **world axis** the cut plane physically tilts about. It is a plain unit
   vector lookup (`util.rotationAxes = {x:[1,0,0], y:[0,1,0], z:[0,0,1]}`,
   `util.js:288-292`), not something derived from the solid.
3. `rotateOffsetAxis` — the **third** axis, neither the cut axis nor the tilt axis,
   found via a sorted-pair lookup (`{xy:'z', yz:'x', xz:'y'}[[axis,rotateaxis].sort().join('')]`).
   `rotateoffset` positions the tilt hinge *along this third axis*, using the exact
   same `getDelta` sign convention as step 1 (undefined/negative/`-0` all mean the same
   thing they mean for `offset` — V1 reuses one function for both).
4. `rotationCenter` is a full 3D point: its component on the cut axis is `cutDelta`'s
   value (the resolved cut position); its component on the third axis is `rotateDelta`
   (from step 3); its component on the tilt axis itself is the object's own centroid on
   that axis. **That third component is mathematically inert** — rotating about a line
   is unaffected by where along that line's own direction the "center" point sits,
   only by its position in the plane perpendicular to the line (confirmed by expanding
   `R(v-c)+c` for `c` sliding along the rotation axis: the along-axis component of `c`
   cancels). V1 fills it with the centroid for a concrete number, not because it
   matters. This is a fact only running/deriving V1 settles — reading the source alone
   makes it look load-bearing.
5. The plane itself: an axis-aligned `OrthoNormalBasis` for `axis` (the same
   orientation the straight cut uses), translated to `cutDelta`, then `.rotate
   (rotationCenter, rotationAxis, angle)` — `angle` in **degrees**
   (`mutators.js:46`'s own signature, confirmed against source, not assumed).
6. `negative = object.cutByPlane(cutplane.plane)`,
   `positive = object.cutByPlane(cutplane.plane.flipped())` — same
   negative-then-positive naming and ordering `core-019` already measured for the
   straight form.

## Proposed fix

**This reduces to a coordinate-transform composition of `core-019`'s own existing
straight-cut machinery, not a new boolean technique** — the exact "rotate the whole
solid, bisect on the flat axis, rotate back" pattern `CLAUDE.md`'s own scoping note
for this row flags as "worth specifically ruling in or out." It rules in, by the
standard rigid-transform/boolean-commutativity argument: for any isometry `T`,
`cutByPlane(S, P) = T(cutByPlane(T⁻¹(S), T⁻¹(P)))`. Here `T` is exactly V1's
`rotate(rotationCenter, rotationAxis, angle)`, and `T⁻¹(P)` is the *untilted* plane —
i.e. exactly the plane `core-019`'s existing straight `bisect(axis, offsetMm)` already
cuts against. So:

1. Resolve `cutMm` (the cut position along `axis`) from the **original**, unrotated
   geometry's bounds — exactly `core-019`'s existing inline logic, factored out into a
   small shared helper (`resolveAxisPositionMm(min, max, size, axisIndex, offsetMm)`)
   so both `offsetMm` and the new `rotateOffsetMm` (step 3 above) share one
   implementation of the undefined/negative/`-0` convention, the same way V1 shares
   one `getDelta` for both.
2. Resolve `tiltAxis` (default per the table in step 2 above; throw if it equals
   `axis` — a case V1's own sorted-pair lookup would silently break on, since `"xx"`
   isn't a key in `{xy:'z', yz:'x', xz:'y'}` and `rotateOffsetAxis` would come back
   `undefined` with no thrown error. This port throws by name instead, per
   `CLAUDE.md`'s "cover degenerate cases loudly").
3. Resolve `rotateOffsetAxis` (the remaining third axis) and its position via the same
   `resolveAxisPositionMm` helper.
4. Build `center`: cut-axis component = `cutMm`; third-axis component =
   the resolved rotate-offset position; tilt-axis component = the geometry's own
   centroid on that axis (kept for parity with V1 and because *some* number is needed,
   even though step 4 above proves it is inert).
5. **Rotate the whole geometry by `-angleDeg` about `center`, along `tiltAxis`**
   (translate `-center`, `transforms.rotate` with only the `tiltAxis` slot set to
   `-angleRad`, translate `+center` — the identical sandwich `transform.rotate`'s
   registry entry and `localBoundsOf` already use elsewhere in this file for a
   pivot-anchored rotation, not a new pattern).
6. Cut the rotated geometry with the **existing straight half-space-box technique** at
   `(axis, cutMm)` — factor `core-019`'s current inline box-and-boolean code (the part
   after offset resolution) into a small shared `cutHalfSpaces(geometry, axisIndex,
   cutMm)` returning `{ positive, negative }`, called by both the existing straight
   path and this one. The box's "reach" is recomputed from the *rotated* geometry's
   own size, which is fine — reach only has to be generously larger than the solid,
   it is not position-critical the way `cutMm` is.
7. **Rotate both resulting halves back by `+angleDeg`** about the same `center`/
   `tiltAxis`, and return the group exactly as today (`add(add(createGroup('bisect'),
   negative, 'negative'), positive, 'positive')`).

`angleDeg` falsy (`undefined`, `0`, `null`) must short-circuit to exactly today's
existing straight-cut code path with **zero** rotation calls — not "rotate by 0
degrees and rotate back," which would introduce needless floating-point noise into
every existing straight-cut caller. This mirrors V1's own `angle = angle || 0` guard,
which is a behavioural default (no tilt), not merely a numeric one.

**Precision caveat, stated rather than assumed**: the two extra rotations (forward to
cut, backward to restore) introduce the same class of floating-point rounding
`localBoundsOf`'s own doc comment already discloses for this codebase's other
rotate-then-restore paths — negligible for the volume/bounds tolerances this project's
tests already use (`toBeCloseTo` at 1e-6 or looser), but worth naming rather than
promising bit-exactness the technique doesn't have.

**Not in scope**: V1's seventh argument, `options.addRotationCenter` (an optional
visualization helper that adds a literal axis marker as a third named group part) has
no consumer anywhere in this project and adds a fourth named part to a Group shape
nothing downstream expects — left out, the same way `core-019` left out V1's
`options.cutDelta`/`options.rotationCenter` overrides (undocumented internal escape
hatches, no real call site uses them per the original survey).

## Interaction model

n/a in this task — kernel/registry only, the same deferral shape `core-019` used for
the entire bisect vocabulary and `core-010`/`core-011`/`core-012` used for
`hardware.*`/`kit.*`: no recipe or control in this catalogue consumes the angled form
yet (confirmed — `core-014` through `core-018`'s recipes only ever call the straight
half-space subtraction `bisect` already performs internally, per `core-017`'s own
retirement note), so there is nothing to wire a trigger to. `OperationsToolbar.vue`'s
existing Bisect popover (`ui-028`) calls `modify.bisect` with exactly `{ axis,
offsetMm }` today and this task must not change what that call produces (see Testing's
regression-surface note) — it simply stops being the *only* shape `modify.bisect`
accepts.

Recording the future control's shape now, so a later UI task can pick it up without
re-deriving the Interaction Model questions from scratch (the reason this section
exists per `TODO/README.md`, even for an n/a task):

- **Precondition**: same as today's Bisect — exactly one solid selected.
- **Trigger**: an "Angle" field (degrees, default `0`, meaning "no tilt" — matching
  this task's own falsy-default contract) added to the existing Bisect popover
  (`OperationsToolbar.vue`), plus a Rotate-axis dropdown (defaulting to this op's own
  per-cut-axis default table, so leaving it alone reproduces the common case) and a
  Rotate-offset field (mirrors the existing offset field's own "no default" rule from
  `ui-028`'s file, since `-0` vs `0` is exactly as easy to get backwards here as it was
  there).
- **Feedback**: identical to today's Bisect — the selection becomes a two-part
  `negative`/`positive` group; a non-zero Angle should visibly tilt the cut, which is
  the one new thing a screenshot needs to show.
- **Selection count**: unchanged, exactly 1.
- **Small-screen behavior**: same collision risk `ui-028`'s own file already flagged
  for this toolbar (a widened popover on a row that has collided with
  `NavigationChrome` three times already) — a fourth field makes it worse, not better;
  a future task should budget for it rather than assume the existing layout absorbs it
  for free.

## Documentation

n/a in this task — no control exists yet (see Interaction model above). Lands with
whatever future UI task exposes `angleDeg`/`rotateAxis`/`rotateOffsetMm`, which should
extend `docs/resize-bisect.md` (not create a new page) with a third worked example,
per that page's own existing two-example structure from `ui-028`.

## Affected files

- `scripts/generate-v1-modify-fixture.cjs` — add a `bisectAngledCases` array calling
  the real `util.bisect(cube(), axis, offset, angle, rotateaxis, rotateoffset)` for:
  `core-019`'s own two surveyed real call shapes (`['x', 0, 120, 'z']`,
  `['y', -0, 30, 'x', 0]`); one case per cut axis with `rotateaxis` omitted (proving
  the default table); one case with `rotateoffset` omitted (proving it defaults to
  centre, not zero); and one case with `angle: 0` explicit (proving it measures
  identically to the existing straight-form fixture entry for the same axis/offset,
  which is the regression check that the falsy-default path is truly a no-op).
- `src/core/kernel/__fixtures__/modify.v1-reference.json` — regenerated; new
  `bisectAngled` top-level key alongside the existing `bisect` one (angled cases carry
  more params than the straight fixture shape holds, so they get their own array
  rather than overloading the existing one).
- `src/core/kernel/group.js` — extend `bisect()`'s signature with `angleDeg`,
  `rotateAxis`, `rotateOffsetMm` (all optional, all defaulting to today's behaviour);
  factor `resolveAxisPositionMm` and `cutHalfSpaces` out of the current inline body per
  Proposed fix; update the doc comment's "Scope: the straight cut only (TODO/core-019)"
  section, since that scope limit is what this task lifts.
- `src/core/kernel/group.spec.js` — new `describe` coverage for the angled path,
  diffed against the new fixture entries per `core-019`'s own established discipline
  (measured V1 output, not a source-reading guess) — this task's own research already
  found one place (`rotationCenter`'s inert third component) where source-reading
  alone is ambiguous about whether a component matters, which is exactly the kind of
  thing only running V1 settles.
- `src/core/kernel/registry.js` — thread `params.angleDeg`/`params.rotateAxis`/
  `params.rotateOffsetMm` through `modify.bisect`'s `build`; update its doc comment
  (currently states "Straight cuts only; the angled form V1 also supported is
  explicitly out of scope").
- `src/core/kernel/registry.spec.js` — confirm the registry entry forwards all three
  new params with the right names.

## Effort

M. Real port work (not wiring), but the risky-sounding half — a new cut-plane boolean
technique — turned out not to be needed: the tilt composes onto `core-019`'s own
already-built, already-tested half-space-box cut via two rotations this codebase
already has a working pattern for (`transform.rotate`'s registry entry,
`localBoundsOf`). The bounded, real cost is the rotation-center/axis bookkeeping
(three axes in play — cut axis, tilt axis, and a derived third axis — each with its
own default and its own offset-sign convention) and extending the V1 fixture generator
to cover it, both of which are contained, well-precedented shapes, not open design
questions.

**`model: opus`**, not because the technique is novel (it isn't — see Proposed fix),
but per `TODO/README.md`'s own model-selection criteria: "Geometry and numerics —
coordinate transforms... Subtle errors here are easy to write and hard to see." Three
axes' worth of default/sign bookkeeping around a rotation center is exactly that
class of arithmetic, and this project has consistently marked comparable
rotation-composition work `opus` — `core-019` itself (bisect's straight-form technique
substitution, arguably simpler than this since it needed no rotation center at all),
`core-004` (rotation composition for carried orientation), and `ui-023` (oriented
dimension lines, the codebase's other rotate-then-measure-in-local-frame pattern) all
did. Don't undersell this as "just composition, therefore easy" — the composition is
what avoids inventing new boolean geometry, not what makes the arithmetic trivial.

## Testing

Vitest, `src/core/kernel/group.spec.js`, extending the existing `bisect` `describe`
block per `core-019`'s own fixture-diff convention (`it.each` against
`v1Reference.bisectAngled`, the same shape `v1Reference.bisect` already uses):

- Both of `core-019`'s own surveyed real call sites (`.bisect('x', 0, 120, 'z')`,
  `.bisect('y', -0, 30, 'x', 0)`), matching V1's measured bounds/volume per half within
  a tolerance loose enough for the two extra rotations' float noise (`toBeCloseTo` at a
  named, looser-than-straight-bisect precision — state the actual number once measured,
  don't guess it here).
- Default `rotateAxis` table: one case per cut axis (`x`→`y`, `y`→`x`, `z`→`x`) with
  `rotateAxis` omitted, confirming the default is applied, not just accepted.
- `rotateOffsetMm` omitted defaults to the third axis's centre (not zero) — the same
  distinction `fit`'s own doc comment already had to make explicit for its own
  zero-sentinel, applied here to a different parameter.
- **Regression, not just new coverage**: every existing straight-bisect fixture case
  (`v1Reference.bisect`, already in the fixture) still passes calling `bisect(value,
  axis, offsetMm)` with no fourth argument at all — bit-identical to before this task,
  confirming the refactor that factored out `resolveAxisPositionMm`/`cutHalfSpaces`
  changed no straight-cut behaviour. `angleDeg: 0` explicit must match the same
  fixture entries the straight form does (from the new fixture case built for this),
  confirming the falsy-default short-circuit skips the rotate-cut-rotate-back path
  entirely rather than rotating by zero degrees and reintroducing float noise into the
  ordinary case.
- Degenerate: `rotateAxis === axis` throws, naming both axes in the message (V1's own
  sorted-pair lookup would silently produce `undefined` here — this port must not).
  Volume conservation: the two angled halves' volumes still sum to the pre-cut volume
  within tolerance, the same check `core-019` already applies to the straight form.
- `src/core/kernel/registry.spec.js`: confirm `modify.bisect`'s `build` forwards
  `angleDeg`/`rotateAxis`/`rotateOffsetMm` to `bisect()` with the right param names,
  and that omitting all three still dispatches correctly (registry-level regression
  companion to the group.js-level one above).

No `*.e2e.js` — no UI surface exists yet, per Interaction model above, the same reason
`core-019` shipped with none.

**Acceptance scenarios**: none directly — kernel-only, matching `core-019`'s own
"none directly" for the same reason (no UI surface). Feeds a future UI task, which
would need its own scenario mapping when it lands.

**Regression surface**: this task extends `modify.bisect`'s subsystem, which
`ui-028`'s own file already extended once (adding the toolbar surface on top of
`core-019`'s kernel op) and which `ui-016`'s group/sub-part selection subsystem
consumes (a Bisect-produced group is drillable exactly like a boolean-produced one,
per `ui-028`'s own retirement note). **This task does not need to re-run `ui-016`'s
repro**, unlike `ui-028` did: `ui-016`'s subsystem cares about the *shape* of
`modify.bisect`'s output (a two-part `Group`), and this task changes only how the cut
plane is positioned, not that shape — still exactly one `negative` and one `positive`
part, same as before. What this task's own regression check must cover instead is
narrower and more direct: run `ui-028`'s existing `e2e/resize-bisect-operation.e2e.js`
suite unchanged after landing this task's `group.js` refactor, since that spec drives
the real Bisect popover, which calls `modify.bisect` with the exact `{ axis, offsetMm }`
two-param shape this task's refactor must not disturb — a green re-run there is the
end-to-end confirmation that factoring `resolveAxisPositionMm`/`cutHalfSpaces` out of
the straight-cut path didn't change straight-cut behaviour, on top of `group.spec.js`'s
own unit-level regression cases above.

## Roadmap row

`TODO/ROADMAP.md`'s `core-021` row is not factually wrong and is left as written:
`@jscad/modeling` genuinely has no direct rotated-cutplane primitive (confirmed — no
infinite-plane type, no `cutByPlane`), so "needs a rotated cut-plane construction
`@jscad/modeling` has no direct primitive for — real geometry work, not wiring" still
holds. This file's own research narrows *how* that construction happens (a coordinate-
transform composition of already-built pieces, not a new boolean technique) without
contradicting what the row says.
