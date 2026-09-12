---
title: Port and wire Enlarge/Fit/Bisect to the op registry
category: core
kind: feature
priority: medium
model: opus
milestone: M3
depends: [core-001]
status: done
---

> **What actually shipped.** Landed essentially as proposed, with no scope
> narrowing beyond what this file already called for — the degenerate-delta
> guard on `enlarge` (missing from V1, added here), the half-space-box technique
> substitution for `bisect` (`@jscad/modeling` has no `OrthoNormalBasis`/cutplane
> equivalent V1's own `bisect` used), and the straight-cut-only scope limit were
> all pre-decided in this file and shipped unchanged.
>
> One thing worth recording that this file didn't spell out to this level of
> detail: `bisect`'s `negative`/`positive` naming and its offset-sign convention
> (a **negative** offset measures back from the max face, and `-0` is a real,
> distinct V1 idiom also meaning "the max face") both read backwards from V1's
> source and only resolved correctly by *running* V1 —
> `scripts/generate-v1-modify-fixture.cjs` records real `jscad-utils@3.2.0`
> output rather than a source-reading guess, the same discipline
> `core-010`/`core-011` used for `hardware.nut`/`washer`, and it's what caught
> both here.
>
> Two follow-ups this file asked to be named rather than left implicit, now
> named for real in `TODO/ROADMAP.md`'s M4+ table:
>
> - **`ui-028`** *(reserved)* — the UI surface these three ops still have none
>   of, the same gap `core-013`'s own retirement note flagged for
>   `group.snap`/`group.align`, which became `ui-026`.
> - **`core-021`** *(reserved)* — the angled-bisect form
>   (`angle`/`rotateaxis`/`rotateoffset`) this file deliberately deferred, not a
>   vague "someday": a real task, blocked on a real recipe or control needing it.

## Goal

`core-013` wired `group.snap`/`group.align` to the registry from math `core-001` had
already ported. **Enlarge/Fit/Bisect have no such head start — nothing in
`src/core/kernel/group.js` ports them yet**, unlike this task's own title might
suggest. This task is a real port (V1 `jscad-utils` source → `@jscad/modeling`), not
just wiring, plus registry entries so a future UI task can reach them. "Done" looks
like: `modify.enlarge`, `modify.fit`, and `modify.bisect` are real registered ops, each
with a numeric-tolerant unit test suite, dimensionally checked against V1's real
output the way `core-010`/`core-011` checked `hardware.nut`/`washer`.

## Real usage, surveyed rather than assumed

Per `TODO/README.md`'s "one suggestion per file" and `core-013`'s own precedent of
measuring before porting: surveyed every `.bisect(`/`.enlarge(`/`.fit(` call across
the same `~/src/jscad/` corpus `core-013` used (`--exclude-dir=dist`,
`--exclude-dir=node_modules`).

- **`enlarge(object, x, y, z)`** (`~/src/jscad/jscad-utils/src/util.js:544`) — scales
  an object so each axis grows by the given **absolute mm delta**, while its centroid
  stays fixed (not a percentage scale). `x` may be an array (`[x, y, z]`) or three
  separate args, each defaulting to `x` when omitted (`add-prototype.js:208`'s
  prototype form always passes all three). Every real call site uses the plain
  three-value form; none pass a zero-scale axis edge case in practice, but `enlarge`'s
  own source explicitly branches on `a[i] === 0` inside `fit` (not `enlarge` itself —
  `enlarge` has no zero-guard at all, so an axis delta of exactly `-objectSize` would
  invert the solid; **this task must decide whether to guard it, since V1 doesn't**).
- **`fit(object, x, y, z, keep_aspect_ratio)`** (`util.js:593`) — scales an object so
  each axis's **absolute size becomes** the given target mm (not a delta), reusing
  `centerWith` (already ported as `calcCenterWith`, `group.js:291`) to re-centre after
  scaling. `keep_aspect_ratio: true` picks the *smallest* of the three per-axis ratios
  and applies it uniformly to all axes (true uniform scaling); a target of `0` on any
  axis is a documented no-scale sentinel (`a[i] === 0` skips that axis, per `fit`'s own
  source) — the one degenerate case V1 itself special-cases, so this task must too.
- **`bisect(object, axis, offset, angle, rotateaxis, rotateoffset, options)`**
  (`util.js:1105`) — cuts one solid into two named parts (`positive`/`negative`) along
  a plane perpendicular to `axis`, optionally offset and/or tilted. Real usage is
  **dominated by the unangled form**: of ~55 real call sites surveyed, ~47 pass only
  `axis`, `offset` (or neither); the remaining ~8 pass a real `angle`/`rotateaxis`
  pair (e.g. `.bisect('x', 0, 120, 'z')`, `.bisect('y', -0, 30, 'x', 0)`) — a real but
  minority (~15%) shape, not a hypothetical.

## Scope decision: straight bisect only, angled bisect explicitly deferred

**This task ports and registers the unangled `axis`/`offset` bisect form only.** The
angled form needs `CSG.OrthoNormalBasis`-based cut-plane construction
(`util.js`'s `bisect` body builds a rotated ortho-normal basis, a rotation centre that
can itself be offset along a third axis, and a signed rotation angle) that has no
direct `@jscad/modeling` equivalent and is real, undesigned geometry work on its own —
building it now, on the strength of one roadmap line with no UI consumer yet, is
exactly the premature generality `CLAUDE.md` warns against. The measured ~15% real
usage means this is a genuine, stated scope limit, not a shrug: **file a follow-up
task for angled bisect once a real recipe or UI control needs it**, the same
deferral shape `core-003` used for arbitrary-edge fillet. Register the doc comment on
`modify.bisect` naming this limit explicitly, so it isn't silently rediscovered the
way `ui-015`'s nested-composite limit almost was.

## Interaction model

n/a — kernel-only, same precedent as `core-013`. No UI task claims these yet; flag
this explicitly for the roadmap the same way `core-013`'s own retirement note flagged
`group.snap`/`align`'s missing UI row (which became `ui-026`, scoped alongside this
file). Recommend a follow-up UI row once this lands, rather than letting three more
ops go permanently unreachable.

**One synergy worth recording now**: `modify.bisect`'s two named parts
(`positive`/`negative`) are exactly the shape `TODO/ui-016` just built pick-depth for —
a bisected body becomes a two-part `Group`, and clicking into one half after selecting
the whole bisected body should already work through `ui-016`'s existing
`describeSubPart`/`raycastHit` machinery with zero further changes, once a future UI
task appends a `modify.bisect` record. Worth a one-line regression check in that
future task, not this one (no UI exists here to test it with yet).

## Documentation

n/a — no control exists yet (see Interaction model above). Lands with whatever UI
task exposes these ops.

## Affected files

- `src/core/kernel/group.js` — add `enlarge(value, deltaMm)`, `fit(value, sizeMm,
  keepAspectRatio)`, `bisect(value, axis, offsetMm)` (straight form only), each typed
  over `Geom3 | Group` per this module's existing convention (`snap`/`align` already
  do this uniformly via `boundsOf`/`centroidOf`, which already handle both).
- `src/core/kernel/group.spec.js` — new coverage, dimensionally diffed against real
  V1 output the way `hardware.bolt.spec.js`/`core-010`/`core-011` already do, not
  reconstructed from the port alone.
- `src/core/kernel/registry.js` — `modify.enlarge`, `modify.fit`, `modify.bisect`
  entries, near the existing `modify.filletRim`/`chamferRim` pair.
- `src/core/kernel/registry.spec.js` — registry-level coverage per op.

## Proposed fix

**`enlarge`/`fit` port directly** — both are pure scale-and-recentre math already
provable against `boundsOf`/`calcCenterWith`, no boolean involved:

```js
export function enlarge(value, deltaMm) {
  // deltaMm: Vec3Mm, per-axis absolute growth, centroid held fixed.
  // Guard added beyond V1: a delta <= -size on any axis inverts the solid silently
  // in V1; this port throws instead (CLAUDE.md: cover degenerate cases loudly).
}

export function fit(value, sizeMm, keepAspectRatio = false) {
  // sizeMm: Vec3Mm: target absolute size per axis, 0 meaning "don't scale this axis"
  // (V1's own documented sentinel). keepAspectRatio: true scales all three axes by
  // the smallest of the three computed ratios instead of each independently.
}
```

**`bisect` needs a different technique than V1's**, because `@jscad/modeling` has no
`CSG.OrthoNormalBasis`/infinite-cutplane primitive the way the old `CSG` library did.
The standard boolean-kernel equivalent: build one axis-aligned box, sized well beyond
`value`'s own bounding box on every axis (e.g. 10x the largest extent, centred on the
cut plane), positioned so its own face sits exactly at the cut plane — that box *is*
the "positive" half-space. `positive = booleans.intersect(value, halfSpaceBox)`;
`negative = booleans.subtract(value, halfSpaceBox)`. Return a two-part `Group` (V1's
own `positive`/`negative` names, kept verbatim for continuity with the user's existing
`jscad-utils` muscle memory) via `add(add(createGroup(), positive, 'positive'),
negative, 'negative')`. The "well beyond bounds" box size needs an explicit constant
(document why, e.g. `10 * Math.max(...size)` plus a fixed minimum for a degenerate
near-zero-size input) rather than a magic number with no comment.

`modify.bisect`'s registry entry is `operandCount: 1`, and (per the Interaction-model
synergy note above) its record should carry `supersedes: <original id>` once a UI
task appends it — continuing the bisected body's identity as a now-two-part group,
the same pattern `transform.*` already established for "same object, new geometry."
State this as guidance for that future UI task's own record shape; this task itself
only registers the op, it does not append any record.

## Effort

L — three real ports (not wiring), one of which (`bisect`) needs a boolean-based
technique substitution rather than a line-for-line V1 translation, plus the explicit
scope decision above to keep it bounded. `model: opus` per `TODO/README.md`'s
guidance: geometry/numerics work (scale-around-centroid, half-space plane
construction) where a subtle sign or centring error is easy to write and hard to see
by eye.

## Testing

Vitest, `src/core/kernel/group.spec.js`:
- `enlarge`: a cuboid grown by a positive delta on one axis keeps its centroid fixed
  (assert centroid unchanged, `toBeCloseTo`) and its new size equals old size + delta
  exactly; a negative delta shrinks the same way; the new degenerate guard (delta ≤
  −size) throws with a named axis in the message.
- `fit`: a cuboid fit to an explicit target size on all three axes matches that size
  exactly and stays centred on its original centroid; `keepAspectRatio: true` with
  non-uniform target sizes scales uniformly by the smallest computed ratio (assert all
  three axes scaled by the *same* factor, not three different ones); a `0` on one axis
  leaves that axis's size unchanged (V1's documented sentinel).
- `bisect`: a 10mm cube bisected on `z` at offset `2` produces a `positive` part with
  z-size `2` and a `negative` part with z-size `8` (V1's own doc-comment example,
  reproduced exactly); a negative offset flips which side is larger (`util.js`'s own
  documented "operates off the larger side" behaviour); the two parts' combined
  volume equals the original's volume within tolerance (nothing lost or double-counted
  by the intersect/subtract pair); a bisect entirely outside the object's bounds
  produces one empty part and one part equal to the original (degenerate case
  `@jscad/modeling`'s own boolean ops should already handle correctly, but assert it
  here rather than assume).
- `src/core/kernel/registry.spec.js`: one `describe` block per op confirming the
  registry entry dispatches to the ported function with the right param names.

No `*.e2e.js` — no UI surface exists yet, stated explicitly per `TODO/README.md`'s
rule and the Interaction model section above.

**Acceptance scenarios**: none directly — kernel-only, same as `core-013`. Feeds a
future UI task, which would in turn need its own acceptance-scenario mapping.

**Regression surface**: none of the three new ops touch `evaluate()`'s existing
operand-resolution path (`core-013`'s own change) — each is `operandCount: 1`,
non-raw, following the same shape as `modify.filletRim`/`chamferRim` already do. No
closed finding's subsystem is extended here.
