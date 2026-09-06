---
title: A body's carried rotationDeg is a sum of deltas, but its geometry is their composition
category: core
kind: finding
priority: medium
model: opus
milestone: M1.5
depends: [ui-012, ui-023]
status: open
---

## Problem

`src/core/transform.js`'s `rotateRecord` builds each new record's absolute rotation by
**adding** the delta to the previous one:

```js
rotation: [current[0] + angles[0], current[1] + angles[1], current[2] + angles[2]]
```

The geometry, meanwhile, is produced by `src/core/kernel/registry.js`'s
`transform.rotate`, which applies each delta in the **world frame** on top of whatever
the solid already is — so after deltas `d1 … dn` the solid's true orientation is the
composition `R(dn)·…·R(d1)`, while `rotationDeg` says `Σdᵢ`.

Rotations do not commute, so those two agree only in special cases. Writing
`R(x, y, z) = Rz(z)·Ry(y)·Rx(x)` (the z-y-x intrinsic Tait-Bryan convention
`@jscad/modeling`'s `transforms.rotate` builds), they agree exactly when:

- every delta is about the **same single axis** — the overwhelmingly common case, since
  one rotate-ring drag turns about one axis and one Inspector field edits one axis; and
- a mixed history applied in **X, then Y, then Z** order, because
  `Rz(z)·Ry(y)·Rx(x)` is literally the composition in that order.

They diverge for any other mixed order. Concretely: turn a body 90° about Z, then 90°
about X. The solid's real orientation is `Rx(90)·Rz(90)`, but `rotationDeg` reads
`[90, 0, 90]`, which denotes `Rz(90)·Rx(90)` — a genuinely different orientation (they
differ by a 120° turn about a diagonal).

Consequences, in increasing order of how visible they are:

1. The Inspector's **Rotation X/Y/Z** fields can describe an orientation the solid is
   not actually in.
2. `rotateToRecord` computes its delta as `target − current`, so typing an absolute
   rotation after an out-of-order history lands somewhere other than the typed value.
3. `TODO/ui-023`'s local-frame measurement (`localBoundsOf` in
   `src/core/kernel/group.js`) un-turns the solid by `R(rotationDeg)⁻¹`. When the carried
   sum is not the true orientation, the un-turn is not the true inverse and the reported
   `localSizeMm` is a box slightly larger than the part — dimension lines drift back
   toward the world-axis shadow they were fixed to stop reporting.

This is **pre-existing**, not introduced by `ui-023`: consequences 1 and 2 have been
live since `ui-012` added rotation at all. `ui-023` is what made it worth writing down,
because it is the first thing to depend on `rotationDeg` being a faithful description of
the geometry rather than just a number in a field.

## Measured reproduction (hand-driven, 2026-09-06, `ui-023`'s acceptance drive)

Drop a **Cylinder** (⌀40 × 50, so its own three numbers are 40 / 40 / 50), then type
rotations into the Inspector one field at a time and read the dimension lines. Driven at
laptop 1440×900 in Chromium against the real app:

| history | `rotationDeg` shown | dimension lines read | verdict |
|---|---|---|---|
| X=30, then X=90 | `[90, 0, 90]`→`[90,0,0]` | 40 / 40 / 50 | exact |
| X=30, Y=40, Z=50 (in order) | `[30, 40, 50]` | 40 / 40 / 50 | exact |
| **Z=90, then X=90** | `[90, 0, 90]` | **50 / 40 / 40** | right three numbers, **attributed to the wrong local axes** |
| **Y=45, then X=45** | `[45, 45, 0]` | **46.82 / 51.05 / 59.42** | **wrong — no number is a dimension of the part** |

The last row is the sharpest case and the one to fix against. Note the third row's
failure mode is milder only by luck: 90° turns map axes onto axes, so an inverse that is
wrong by a whole quarter-turn still lands on an axis-aligned box.

Reachable by hand, not just by typing: dragging the **Z rotate ring** and then the **X
rotate ring** produces exactly this history.

## Affected files

- `src/core/transform.js` (`rotateRecord`, `rotateToRecord`) — where the sum is built.
- `src/core/kernel/group.js` (`localBoundsOf`) — the consumer that needs the true
  orientation; its doc comment already records this limit.
- `src/core/inspector.js` (`rotationOf`) — surfaces the carried value.
- `src/core/transform.spec.js`, `src/core/inspector.spec.js` — current coverage only
  exercises single-axis and in-order histories, which is exactly why this is invisible.

## Proposed fix

Compose properly instead of adding. Two candidate shapes, and the choice between them is
a real UX call, not just an implementation one:

1. **Keep Euler angles, compose then decompose.** In `rotateRecord`, build
   `R(angles)·R(current)` as a matrix and decompose it back to z-y-x Tait-Bryan angles.
   Small and local, and the Inspector keeps three familiar degree fields. The cost is
   that decomposition is not unique — near a ±90° pitch the other two angles become
   ill-conditioned (gimbal lock) and the displayed numbers can jump discontinuously
   during a smooth drag, which looks like a bug even though the geometry is right.
2. **Carry a quaternion (or matrix) as the truth, derive the fields for display.** The
   record carries the real orientation and the Inspector shows a decomposition of it.
   No drift and no ill-conditioning in the stored value, at the cost of a document-schema
   change (so `src/core/replay.js` and any persisted fixture need a migration path) and a
   decision about what a typed Euler field means when it round-trips.

Recommend (2) if the schema change is affordable at the time this is picked up, since
(1) trades a silent wrong answer for a visible jumpy one. Whichever is chosen, keep the
`rotationDeg` *display* contract that `ui-012` established.

## Effort

M — the arithmetic is small and well-understood either way; the weight is in the schema
and gimbal-lock decisions, plus re-verifying `ui-023`'s local-bounds round trip against
out-of-order histories once the composition is real.

## Testing

`src/core/transform.spec.js`: rotate 90° about Z then 90° about X and assert the carried
rotation, converted back to a matrix, matches the composition `Rx(90)·Rz(90)` rather than
`Rz(90)·Rx(90)`. Cover the reverse order too, and assert the single-axis and
X-then-Y-then-Z cases still produce exactly the values they do today — those are the
paths every existing test and every acceptance drive exercises, and they must not move.

`src/core/inspector.spec.js`: extend `ui-023`'s local-bounds tests with an **out-of-order**
multi-axis history (Z then X) and assert `localSizeMm` still equals the part's known size
within tolerance. That assertion fails today and is the sharpest available proof this
finding is fixed.

**Real app e2e**: extend `e2e/gizmo-transform.e2e.js` — drag the Z rotate ring, then the
X rotate ring, then assert the dimension lines still read the part's own fixed sizes and
that typing an absolute rotation lands on the typed value. Chromium is enough; there is
no engine-specific surface here.

**`TODO/ACCEPTANCE.md` scenarios this could affect**: scenario 2's gizmo-drag half, and
scenario 1's "gizmo and dimension lines attach" half. This task extends the subsystem
`TODO/ui-023` was filed against, so re-run that finding's original reproduction steps
(tilt a cylinder and read its diameter and length off the lines) against the new code as
well as any new spec.
