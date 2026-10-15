---
title: Hand-place connectors on a split face — posts, wedges, screw bosses
category: core
kind: feature
priority: medium
model: opus
depends: [io-007]
status: done
---

## Goal

`modify.splitWithJoint` (`TODO/io-007`, done) always auto-places its own joint today:
`joint.pins.js`'s search walks the cut face's clearance field (`joint.common.js`) and drops
one or two round pins — or `joint.tongueGroove.js`'s rib — wherever the field says a socket
fits, with no way to choose where, how many, or what kind. A person splitting a wing wants to
put a post near the spar instead of wherever the search happened to land, add a second post
near the tip, use a wedge/key instead of a round pin so the halves can't twist relative to
each other, or a screw boss at a specific rib so the joint can be taken apart and reassembled
rather than pressed together once — not whatever the auto-search found.

"Done" looks like: `splitWithJoint`'s params accept an optional `placements` list
(`{ kind, uMm, vMm, sizeMm }` per connector, face-local coordinates in the same `(u, v)` frame
`clearanceField` already uses), each validated through the *same* containment check the
auto-search already relies on (`contains`, `clearanceTo` in `joint.common.js`) — so a
placement off the material, or one whose socket wall would break through a nearby face or
hole, is refused by name and position, the same failure contract `pinJoint` already has for
"no pin fits anywhere." Passing no `placements` keeps today's auto-search as the default, so
`io-007`'s existing callers and its acceptance scenario are unaffected by this change.

New connector kinds, alongside today's `pins` and `tongue`:

- **`wedge`** — a tapered key (dovetail-style trapezoidal prism) sitting in the cut plane
  itself rather than drilled through it, for sections too thin even for the smallest pin
  (`PIN_MIN_DIAMETER_MM`) that still need rotation resistance — a straight tongue (today's
  `tongue` kind) resists bending across the face but not twisting along the cut's long axis,
  which is exactly the failure mode a tapered, non-symmetric key is shaped to prevent.
- **`screwBoss`** — a boss standing proud of piece A with a pilot bore continuing into a
  matching boss on piece B, sized either for a self-tapping screw or for a heat-set brass
  insert (an `insertMm` param selects which), so the halves are drawn together by an
  externally driven screw rather than only pressed together. This is the kind for a joint
  that must survive repeated disassembly (a removable wingtip) or more clamping force than a
  friction-fit pin gives — `JOINT_WALL_MM`'s 1.2 mm wall assumes a pin pressed in once, not a
  load path cycled many times.

## Interaction model

n/a — this is a pure `core`/kernel change (new recipe files plus a `split.js` param addition,
no new control, menu item, or gesture). The person-facing placement UI is `TODO/ui-067`, which
depends on this file.

## Documentation

n/a — same reason as above; `ui-067` names the `docs/print-prep.md` update and media.

## Affected files

- `src/core/kernel/recipes/joint.common.js` — no behavior change, but the placement path and
  the auto-search path must share the same `contains`/`clearanceTo` validation, not duplicate it.
- `src/core/kernel/recipes/joint.pins.js`, `joint.tongueGroove.js` — each needs a "build at this
  exact centre" entry point split out from `pinJoint`'s "search for a centre," so a manual
  placement reuses the identical sizing/embed math the auto-search already has.
- `src/core/kernel/recipes/joint.wedge.js` (new), `joint.screwBoss.js` (new).
- `src/core/kernel/split.js` — `splitWithJoint`'s param parsing (around `planJoint`, line 214)
  accepts `placements`; when present, route to the manual build instead of the auto-search for
  that half's connectors; a placement list mixing kinds is allowed (e.g. one `screwBoss` near
  the root, two `pins` elsewhere).
- `src/core/kernel/registry.js` — no signature change; `'modify.splitWithJoint'`'s registry
  entry (line 1311) already forwards `params` through unchanged.

## Effort

L — four connector-geometry kinds' worth of numerics (sizing, embed depth, containment
validation), even though the wiring into `split.js` is additive and backward-compatible.

## Testing

- **Unit**: manual placement at a given `(uMm, vMm)` for each of the four kinds (`pins`,
  `tongue`, `wedge`, `screwBoss`) builds geometry whose volumes match the auto-search path's
  sizing formula at that size, tolerance `1e-6` relative (same tolerance `io-007`'s own volume-
  identity test uses). A placement whose socket/boss wall would exit the solid is refused by
  name and position, not silently clipped. A mixed list (one manual placement plus auto-search
  still finding its own) doesn't double-count or overlap — two placements whose walls would
  intersect each other are refused by name, independent of whether either came from a search or
  a hand-given coordinate. `screwBoss` is tested at both a self-tap bore size and an
  `insertMm` insert size. Degenerate cases: placement outside `uRange`/`vRange`; placement on
  top of an existing hole in the cut face; zero `clearanceMm`.
- **E2E**: none new in this file — the first user-visible path through this code is
  `ui-067`'s spec, which exercises it end to end.
- **Acceptance**: none at this core layer; the print-prep acceptance scenario is re-driven by
  `ui-067` once the UI surface for placement exists.
- **Closed-finding regression**: this extends `io-007`'s closed subsystem (`modify.splitWithJoint`
  in `split.js`) — re-run `io-007`'s own unit tests (the volume-identity check, the
  non-watertight-input refusal, the plane-outside-body refusal) against the changed param
  parsing in `split.js`, since this task touches that function directly rather than only adding
  files alongside it.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
