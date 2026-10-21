---
title: Real helical threads — an external/internal thread generator any threaded part can use
category: core
kind: feature
priority: medium
model: opus
milestone: M5
depends: [core-073]
status: open
---

## Goal

Today a screw or bolt is a placeholder: a cylinder with a `tap` clearance solid and a
cutout size (`hardware.bolt`, `hardware.screw`, `hardware.nut`). That is right most of the
time. Sometimes the thread itself has to print — a jar lid, a threaded standoff, a knob on a
rod, a leadscrew. "Done": a thread generator in `src/core/` produces a true helical thread
solid, **external** (a threaded rod / stud / boss) and **internal** (a tapped hole cutter, or
a nut), which any recipe can use, not only bolts and screws.

## Design

- **Primitives** (new kernel recipes under `src/core/kernel/recipes/`):
  `thread.rod` (external thread on a cylinder of a given length), `thread.hole` (an
  *internal*-thread cutter, meant to be subtracted from a body), and `thread.nut` (a
  threaded hex/round collar). A **mating pair** (`thread.rod` + `thread.hole`) shares one
  parameter record so the clearance is applied in one place.
- **Parameters**: `majorDiameterMm`, `pitchMm`, `lengthMm`, `starts` (1 default; multi-start
  for fast-travel lids), `hand` (`right` | `left`), `profile` (`iso` 60°, `acme` 29°,
  `square`, `buttress`), `clearanceMm` (the print tolerance between mating parts, applied to
  the internal side only), `chamferMm` (lead-in at the ends), and `segmentsPerTurn` (the
  tessellation budget, with a documented default).
- **Standard sizes**: metric coarse/fine and the imperial UNC/UNF pitches come from the same
  table the fastener Library uses (`core-065`'s data), so `M5` pitch is not retyped. Custom
  pitch stays editable.
- **Construction**: sweep the 2D thread profile along a helix — in JSCAD V3 that is
  `extrudeFromSlices` with a per-slice rotate/translate (or a union of rotated `extrudeLinear`
  twist segments); pick whichever the kernel doc (`docs/decisions/geometry-kernel.md`) shows
  to be manifold at the ends. The kernel stays in the worker; nothing here touches the main
  thread. A thread that fails the manifold check returns a structured error, not a bad mesh.
- **Cost**: thread geometry is many triangles. State the facet count at the default
  `segmentsPerTurn` for M6×10 and M20×40, and keep an eval budget (name it in Testing).
- Out of scope: tapered pipe threads (NPT/BSP), thread rolling relief on bolts, cosmetic
  threads (the placeholder cylinders stay as they are), and retrofitting `hardware.bolt` to
  grow a real thread (a separate task once this lands).

## Interaction model

n/a — core only; the Library rows, Inspector fields and drag-to-place are `ui-080`.

## Documentation

n/a — no user-visible control in this task; `ui-080` owns `docs/threads.md`.

## Affected files

- `src/core/thread/profile.js` + spec (profile polygons, pitch/start/hand maths)
- `src/core/thread/helix.js` + spec (the sweep, framework-free)
- `src/core/kernel/recipes/thread.rod.js`, `thread.hole.js`, `thread.nut.js` + specs
- `src/core/kernel/registry.js` (register with `operandCount: 0` for the creations; the
  internal cutter is a tool part for subtract, as `hardware.bolt`'s `tap` is)
- `src/core/library.js` (rows are added by `ui-080`, not here)

## Effort

L.

## Testing

- **Numerics** (explicit tolerance, `toBeCloseTo`): axial advance per turn equals
  `pitch × starts`; a right-hand thread's helix handedness is the opposite of a left-hand
  one; major/minor diameters match the profile's depth; bounding box length equals
  `lengthMm`.
- **Fit proof**: boolean-intersect volume of a `thread.rod` with a `thread.hole` of the same
  record at `clearanceMm: 0` is ≈ the thread overlap, and with the default clearance it is ≈ 0.
- **Degenerate cases**: pitch larger than the length, a length shorter than one turn, zero
  `clearance`, `starts` of 1 and 3, a minor diameter that would go non-positive (rejected with
  a message), `segmentsPerTurn` too low to be manifold.
- Manifold check on every profile × hand × internal/external combination.
- **Eval-time benchmark** (`.claude/prompts/perf-benchmark.md`): M6×10 under 150 ms and M20×40
  under 1 s on the reference machine, worker-side; the main thread unblocked while it runs.
- Engines: Chromium only for the unit/kernel specs (pure JS, no WebGL); the e2e coverage is in
  `ui-080`.
- **Acceptance scenarios**: 2 (union/subtract result) and 10 (save and reload) could be touched
  by a new record kind — re-drive them with a thread rod subtracted from a block.
- **Closed finding re-run**: `core-064` (a subtract's tool part survives) against a
  `thread.hole` tool part.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
