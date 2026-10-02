---
title: STL/OBJ exports of ordinary unions and library parts have open edges (T-junctions) — repair them in the export path
category: io
kind: finding
priority: high
model: opus
depends: [io-003, ui-034]
status: done
---

## What actually shipped (2026-09-21)

The file proposed `modifiers.generalize({ snap, simplify, triangulate })` or
`retessellate` + a welding pass. **Both were measured and both changed nothing** — 6 open
edges on the union, 40 on the bolt, 24 on a Raspberry Pi board, before and after — because
`@jscad/stl-serializer` and `@jscad/obj-serializer` *already* call exactly that
`generalize` themselves (`stl-serializer/index.js:63`). Running it again is a no-op.

The root cause turned out to be inside that pass, and it is measurable: `generalize`
**snaps first** (to `measureEpsilon`, a bounding-box-derived grid — 4.8e-4 mm for the
union) and *then* asks `insertTjunctions` whether a vertex lies on an edge, which compares
against a **fixed `EPS = 1e-5 mm`** regardless of the grid it just snapped to. Snapping
displaces a genuinely collinear vertex by up to `√3/2 × ε ≈ 4.2e-4 mm`, some 40× that
tolerance, so the junction stops being recognised. T-junctions on axis-aligned edges
survive the snap exactly — which is every one in the two shapes `io-003` measured, and
none of the ones on a hex head's diagonal rim or in a solid placed at 66.93 mm.

So the fix is a new `src/core/kernel/watertight.js` (`makeWatertight`), called from
`exportBodies` before serializing. It inserts the missing vertices itself, using the
serializer's own snap grid **only as an identity key** and never rounding a coordinate, so
the exported bounding box is bit-identical to before and the collinearity test runs on the
kernel's own doubles. Once a vertex is shared, the serializer's later snap cannot undo it:
identical coordinates snap identically. Measured 0 open edges on all eight shapes, both
formats, both readings of the criterion, with no zero-area triangle introduced. The full
candidate comparison and the rejected orderings are in that module's header.

Two things were found and **filed rather than folded in**: the `.glb` is serialized from
the render mesh and still has 44 of 262 open edges on the same union (**`io-005`**), and
the repair roughly doubles a main-thread export that `io-003` already ran synchronously —
22.9 ms → 48.1 ms for a 24-body scene (**`perf-001`**). Nobody has opened any exported file
in a real slicer; that stays open in `TODO/VERIFY.md`.

## Problem

`io-003` promises an STL "written so the surface is closed", and measured **0 unmatched
edges** on the two shapes it checked (a cube ∪ cylinder union, and a cube minus a Ø6 bore).
Driving `ui-034` against the running app found that **this does not hold in general** —
it holds for those two shapes, and not for other ordinary ones.

Two reproductions, both in plain Node with no browser (so it is the export path, not the UI):

1. **A plain Union**, exactly what scenario 11's step 2 builds by hand — a Ø40 × 50 cylinder
   centred `(-100.89, 66.93, 25)` and a 40 mm cube centred `(-95, 75, 20)`, unioned:
   `exportBodies(document.bodies(), 'stl')` → 200 triangles, signed volume 88074.52 mm³ against
   the kernel's 88073.94 (6.6e-6 relative), and **6 of 303 undirected edges unmatched** (9 of 300
   in the browser drive, whose tessellation differed by a hair). Coarsening the vertex
   quantisation from 0.001 mm to 0.01 mm to 0.1 mm to 1 mm does not remove them (6, 9, 13), so
   they are not a rounding artefact of the check.
2. **A placed `hardware.bolt`**, `m10 hex`, length 30 (a Group body, exported as its
   `combine()`d solid): 188 triangles, volume 4591.268 against 4591.284 (3.6e-6), **40 of 302
   edges unmatched** — 20 used once forward and 20 once backward, all at z = 7.5 on the hex
   head's rim (`(±4.75, ±8.227, 7.5)` ↔ `(±9.5, 0, 7.5)`).

In both, the volume is right, so the file is the right solid and there is **no hole**; every
unmatched edge is used exactly once. That is the signature of a **T-junction**: one face's long
edge is matched by two shorter edges of its neighbour, so the two sides do not share an
endpoint. A strict slicer or mesh checker (`admesh`, Bambu Studio's repair prompt, MeshLab's
non-manifold selection) reports these; a tolerant one heals them silently. Nobody has opened
either file in a real slicer, so how much this matters in practice is **unknown** — but
`persistence-export.md` sub-decision 4 chose kernel-side STL specifically so "a slicer gets a
closed manifold", so it is the property that decision was made for.

The same `Geom3` feeds OBJ, which carries the same edges (measured: 9 of 300 on the union).
glTF is serialised from the render mesh and is a different question.

## Proposed fix

In `src/core/export.js`, after `toGeom3()` and before serialising, repair T-junctions:
either `modifiers.generalize({ snap: true, simplify: true, triangulate: true })` with an
epsilon suited to millimetres, or `retessellate` + a vertex-welding pass that inserts the
missing vertex into the longer edge. Do **not** loosen the check to hide it — the bar is
0 unmatched edges as measured above.

## Testing

- Unit: `exportBodies` of the two reproductions above, a `hardware.nut` and one `kit.*` part,
  each read back by the spec's own STL and OBJ parsers — signed volume within
  1e-4 of the kernel, **0 unmatched edges**, on top of io-003's existing two shapes.
- `e2e/export-ui.e2e.js`'s drilled-in (bolt) test currently asserts volume only and carries a
  comment pointing here; once this lands, add `expect(stats.unmatchedEdges).toBe(0)` to it, and
  add the same to a hand-placed offset cylinder ∪ cube.
- `docs/export.md` carries a sentence about "tiny seams" on a bolt or union; delete it.
- Re-drive `ACCEPTANCE.md` scenario 11 against the composite, and re-run `io-003`'s and
  `ui-034`'s closed-finding checks (the export bytes, scope, and the drilled-in parent).
- `TODO/VERIFY.md`: open a bolt STL in a real slicer once this lands (nobody has yet).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
