---
title: The .glb is serialized from the render mesh, which carries T-junctions io-004 just removed from STL/OBJ
category: io
kind: finding
priority: medium
model: opus
depends: [io-003, io-004]
status: done
---

## What actually shipped (2026-09-21)

**The decision the file asked for first, answered with numbers: yes, a `.glb` should be
closed — and now is.** The prior question was genuinely open (`io-003`: "a glTF consumer is
a viewer or a game engine, which does not need [a watertight solid]"), and it is now
recorded in `docs/decisions/persistence-export.md` sub-decision 4 as an amendment, with the
measurements, the rejected alternative and the cost, so nobody re-opens it. Three reasons
decided it, in the honest order of their weight: the mechanism already existed and the
change is one call; an unclosed `.glb` sitting beside a closed STL of the *same body* is a
surprising inconsistency the project had already written a `TODO/VERIFY.md` warning about;
and it is paid once per click rather than per frame. The narrower consumers that do care
(Blender/DCC import-then-edit-or-print, physics and collision baking, anything that welds
vertices) are real, and they are what tipped it — not renderers, which never ask.

All five of the file's numbers were **re-measured, not taken on trust**, and reproduced
exactly as RED before anything changed: 44 of 262, 46 of 290, 271 of 920, 42 of 372, 88 of
356, by the strict `uses === 2 && net === 0` criterion straight off `geom3ToBufferGeometry`'s
position attribute. After: **0** on every one of them, measured on the `.glb` bytes through
an independent POSITION-accessor parser, with volume within 4e-8 relative of the kernel's,
outward-positive winding, and a **bit-identical bounding box**.

**The fan-triangulation trap the file warned about was real, and is why this was not a
one-liner.** Calling `makeWatertight` and stopping there reaches 0 open edges and introduces
**zero-area triangles — 6, 1, 101, 17 and 36 across the five shapes** (101 of 672 triangles
on a repaired `raspberrypi.bplus`), because the repair inserts vertices *collinear* with the
edge they split and the bridge fans from corner 0. A zero-area triangle draws as nothing and
its face normal is a normalized `(0, 0, 0)`. So `geom3ToBufferGeometry` gained an opt-in
`triangulation: 'non-degenerate'` mode that scans for an apex the fan is clean from and falls
back to a centroid fan only where no corner works (measured: 5 of 217 polygons on that board,
1 of 87 on `io-003`'s union, 0 of 59 on the placed union). **Always centroid-fanning — what
`@jscad`'s own serializer does — was measured and rejected**: it also reaches 0 with no
slivers, but emits `n` triangles per polygon instead of `n - 2`, which is **40% more
triangles** across the table and would double a plain cuboid from 12 to 24 for no gain.

**The viewport is untouched, and that is proven rather than asserted.** The repair is in
`src/render/export.js`, not in the bridge. `geom3ToBufferGeometry`'s default output was
compared float-for-float (`Object.is`) against its pre-`io-005` output on four shapes
including a `raspberrypi.bplus` — **bit-identical**, 1,440 / 1,602 / 4,707 / 1,872 floats —
at an unchanged 0.007-0.018 ms per rebuild against the 16 ms frame budget. Acceptance
scenario 1 was re-driven anyway, at both reference viewports.

**Cost, measured and recorded where it belongs:** +12.1 ms median on a 24-body glTF export
(1.6 → 13.7 ms over five runs) and ~15% more bytes (416,200 → 478,408 B). Added to
`TODO/perf-001-export-off-main-thread.md` as an update to the same finding rather than filed
as a duplicate — it is the same defect (a synchronous unbounded kernel pass on the main
thread), now on all three formats, and one fix closes all three.

**Not done, and not claimed:** no real glTF viewer has ever opened a file this app produces
— not before this task and not after. Scenario 11 step 5 remains NOT DRIVEN; every number
above comes from parsers in this repo that share no code with the exporter.

## Problem

`io-004` made the kernel-side formats watertight: every STL and OBJ `exportBodies` writes
now reads back with **0 open edges**, measured on eight shapes including the two `io-003`
originally checked. glTF does not come through that path at all. `src/render/export.js`
serializes `src/render/mesh.js`'s `BufferGeometry` — the same render mesh
`docs/decisions/persistence-export.md` (sub-decision 4) measured three.js's `STLExporter`
producing a **non-watertight** solid from (100 of 362 edges), and the reason STL was moved
kernel-side in the first place.

That is still true, and `io-004` measured it rather than assuming it. Counting undirected
edges not used by exactly two triangles in opposite directions, straight off
`geom3ToBufferGeometry`'s position attribute:

| body | render mesh (what the `.glb` carries) | STL/OBJ after `io-004` |
|---|---|---|
| Ø40×50 cylinder ∪ 40 mm cube at (-100.89, 66.93, 25) | **44 of 262** | 0 of 309 |
| a placed `hardware.bolt` (m10 hex, 30 long) | **46 of 290** | 0 of 342 |
| `raspberrypi.bplus` | **271 of 920** | 0 of 1203 |
| `io-003`'s union (20 mm cube ∪ Ø12 cylinder) | **42 of 372** | 0 of 429 |
| `io-003`'s bored cube (10 mm cube − Ø6) | **88 of 356** | 0 of 438 |

Note the last two rows: the render mesh is open even on the two shapes the kernel path was
always right about, because `geom3ToBufferGeometry` fan-triangulates raw boolean output with
no T-junction pass whatsoever — not a partial repair like the serializer's, none at all.

**How much this matters is a genuinely different question from `io-004`'s, which is why this
is filed rather than folded in.** `io-003`'s own decision says a glTF consumer is "a viewer
or a game engine, which does not need [a watertight solid]", and that is largely true: a
renderer draws triangles and never asks whether they share edges. The cases where it is not
true are real but narrower — importing a `.glb` into Blender or a DCC tool and then editing
or printing it, physics/collision baking, and any consumer that welds vertices. Nobody has
opened an exported `.glb` anywhere outside this repo's own parser (`TODO/VERIFY.md`), so
which of those matters here is unknown.

The same render mesh is what the **viewport** draws, so any change here also touches every
frame, which `io-004`'s export-only change deliberately did not.

## Affected files

- `src/render/mesh.js` — `geom3ToBufferGeometry`, the fan triangulation
- `src/render/export.js` — the glTF path, if the repair is applied there rather than in the bridge
- `src/render/export.spec.js`
- `e2e/export-ui.e2e.js:543` — the glTF test, whose title already says "closed geometry" while
  asserting only the volume

## Proposed fix

Decide first, with the numbers above, **whether** a `.glb` should be watertight at all; record
the answer either way (a sentence in `docs/decisions/persistence-export.md` sub-decision 4 if
the answer is no, so the next person does not re-open it).

If yes, the mechanism already exists and should be reused, not rewritten: call
`makeWatertight` from `src/core/kernel/watertight.js` on the solid in
`src/render/export.js`'s glTF path, before `geom3ToBufferGeometry`. Do **not** put it in
`geom3ToBufferGeometry` itself without measuring the viewport cost — that function runs on
every rebuild of every body, `io-004` measured the repair at 3-40 ms per body depending on
size, and CLAUDE.md's budget is a 16 ms frame. Export is a one-shot action and can afford it;
the frame loop cannot.

Watch for the one thing the export path does not care about and the viewport does: the repair
makes polygons with more vertices, and `geom3ToBufferGeometry` fans them from corner 0, which
turns a collinear inserted vertex into a zero-area triangle. `io-004`'s measurements show
`@jscad`'s own serializer avoiding this with a centroid fan; the bridge would need the same,
or the normals it computes from those triangles will be wrong.

## Effort

M — the repair exists; the work is the decision, the viewport-cost measurement, and the
triangulation detail.

## Testing

- Unit (`src/render/export.spec.js`): the five shapes in the table above, read back from the
  `.glb`'s POSITION accessor by the spec's own parser, asserting 0 open edges by the strict
  criterion (`uses === 2 && net === 0`) and the kernel's volume to 1e-4 relative — the exact
  shape of `src/core/export.spec.js`'s `io-004` block, so the two formats are held to one bar.
- `e2e/export-ui.e2e.js`'s glTF test already parses the POSITION accessor and its title claims
  "closed geometry": add `expect(stats.unmatchedEdges).toBe(0)` and build it on an off-origin
  union rather than a plain cuboid, which is closed either way.
- If the repair lands in `geom3ToBufferGeometry` rather than the export path: measure a
  viewport rebuild before and after (`.claude/prompts/perf-benchmark.md`) and state the number
  against the 16 ms frame budget. Chromium/Firefox/WebKit all three, since this is WebGL.
- `TODO/ACCEPTANCE.md`: scenario 11 (step 7 opens the `.glb`), and scenario 1 if
  `geom3ToBufferGeometry` changes at all — that is every body the viewport draws.
- Closed findings whose repro steps get re-run: `io-004` (all eight shapes still 0 in STL and
  OBJ), and `io-003`'s two originally-measured shapes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
