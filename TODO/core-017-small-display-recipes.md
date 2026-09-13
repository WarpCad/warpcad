---
title: "Small-display composite recipes: Mini PiTFT, PiTFT 2.2/2.4, HyperPixel 4 — standalone, board parameter dropped"
category: core
kind: feature
priority: medium
model: opus
milestone: M4
depends: [core-014]
status: open
---

## Goal

Four composite recipes reproducing `jscad-raspberrypi@62a8e3b`'s `miniPiTFT(options,
piMotherBoard)`, `PiTFT22(options, piMotherBoard)`, `PiTFT24(options, piMotherBoard)`,
and `HyperPixel4Rectangular(rpi)`. All four take an optional external board parameter
per `docs/decisions/composite-recipe-geometry.md`'s Family B table — **drop it and
expand standalone**, same requirement `core-016` implements for the two touch
displays, with the attachment becoming the user's own `group.align`/`group.snap`
(`ui-026`). `PiTFT22`/`PiTFT24` additionally **forward** their board parameter straight
into `Hat(piMotherBoard, options)` (`pi-tft22.js:29`, `pi-tft24.js:61`) rather than
using it directly, so "drop the parameter" here specifically means calling this task's
own standalone `Hat` expansion (from `core-018`) with no board, not stripping a
forwarded call that never touches the board itself.

**This task also needs one thing none of `core-014`-`016` did: `modify.bisect` and
`modify.fit`/`enlarge`/`filletRim`/`chamferRim` used *inside* a composite's own nested
expansion, not just as a document-level operator a user applies afterward** — V1's
`miniPiTFT` board is carved from a rounded rectangle by two chained `.bisect()` calls
(`miniPiTFT.js:90-93`), and its buttons use `.fillet()`/`.chamfer()`/`.enlarge()`
internally too. See Proposed fix for whether that composes cleanly with the fold as it
exists today.

## Interaction model

n/a — no Library row exists for any composite op yet.

## Documentation

n/a — no control exists yet.

## Affected files

- `src/core/kernel/recipes/raspberrypi.miniPiTFT.js`, `raspberrypi.piTFT22.js`,
  `raspberrypi.piTFT24.js`, `raspberrypi.hyperPixel4Rectangular.js` (new)
- matching `.spec.js` files (new)
- `src/core/kernel/registry.js` (register all four, `composite(0, ...)`)

Real V1 source, `~/src/jscad/jscad-raspberrypi/src/` at `62a8e3b`: `miniPiTFT.js:13-187`
(including its local `boardButton`/`buttonCap` helpers), `pi-tft22.js:28-77`,
`pi-tft24.js:48-314`, `hyper-pixel-4-rectangular.js:17-64`.

## Proposed fix

**First, confirm whether a composite recipe can reference one of its own nested
records' sub-parts as the operand to a later record in the same expansion.**
`registry.js:762-767`'s own comment states `modify.bisect` "[r]eturns a two-part
`Group` (`negative`, `positive`)", and `ui-016`'s retirement note already established
that its pick-depth mechanism should reach into a bisect result "with no further
change once this task appends a record" — but that was stated for a *document-level*
record, not for a second record inside the same composite's own nested fold array
referencing the first by `{ id, pieces: 'positive' }`. `core-013`'s `{ id, pieces }`
addressing (`registry.js:673-713`) was built and tested for `group.snap`/`group.align`
between two *document* bodies; whether the same addressing resolves against a sibling
record still inside one composite's own nested array needs a real check against
`kernel/index.js`'s fold (`core-020`'s fix already established that a composite's
nested fold is isolated — confirm addressing *within* that isolated fold works the
same way, not assume it does). If it does not resolve cleanly, the fallback is
computing the bisect's board shape analytically instead (see next paragraph) rather
than blocking this task on a fold change.

**`miniPiTFT`'s board — the one genuinely new geometric question in this recipe.**
`Parts.RoundedCube(inch(2), inch(1), 2, 2).bisect('x', inch(1.5)).parts.negative
.bisect('y', -inch(0.96)).parts.positive` (`miniPiTFT.js:90-93`) cuts an L-shaped notch
out of a rounded rectangle with two straight cuts. `modify.bisect`'s registered form
(`registry.js:765-767`, `group.js`'s `bisect(value, axis, offsetMm)`) is a single-
operand op over one solid — chaining two of them is exactly what a document-level
tool already supports (two consecutive `modify.bisect` operations, each keeping one
half), so this reduces to: build the rounded-rectangle profile+extrude
(`kit.board.js`'s pattern), one `modify.bisect` record on it keeping `.negative`, a
second `modify.bisect` record on *that* keeping `.positive` — resolved either as two
nested-composite records (if the check above confirms it) or, failing that, as one
directly-computed rounded shape (the L-shape's four corners are all analytically
knowable from the two cut offsets, so an equivalent `profile.roundedRectangle`-minus-
rectangle construction is a safe fallback that needs no new addressing at all).

**`miniPiTFT`'s buttons use `Parts.Tube` (`buttonCap`, `standoff`,
`miniPiTFT.js:177`) — confirm `jscad-utils`' `Parts.Tube(outer, inner, height)`
argument order against this project's `primitive.tube`'s `diameter`/`innerDiameter`/
`height` params (`registry.js:461-479`) before porting; don't assume radius-vs-
diameter matches without checking, the same caution `core-010`'s fit-table diffing
already modeled for a different primitive.**

**`.stretch()` and `.enlarge()` calls decompose without a new kernel op.** Both
`miniPiTFT.js:125` (`display-clearance`, `.stretch('z', 5)`) and
`camera-module-v2.js`'s `lensribbon` (`core-015`, for cross-reference) apply
`jscad-utils`' `stretch` (`~/src/jscad/jscad-utils/src/util.js:1314-1324`, wrapping
`@jscad/csg`'s `stretchAtPlane`) to a **plain, feature-less cuboid the same recipe just
built** — confirmed by reading `stretchAtPlane`'s own semantics (cut the solid at a
plane, insert `distance` of material, translate one side): on a box with no internal
geometry, inserting material at a cut plane is bit-for-bit equivalent to building the
box at its already-stretched final dimension in the first place. So `display-
clearance` needs no new `modify.stretch` op — compute the stretched size analytically
(here, `z` height + 5mm) and emit one correctly-sized `primitive.cuboid` directly, with
its position derived the same probe-and-bake way as every other part. **State this as
a confirmed simplification in the retirement note**, not a guess — the equivalence
holds only because every V1 `.stretch()` call site in this catalogue targets a
just-built plain box, and that should be verified against each call site it's applied
to (also present in `core-015`'s `lensribbon`), not assumed to generalise beyond this
catalogue.

**`buttonCap`'s fillet/chamfer usage maps directly to `modify.filletRim`/
`chamferRim`** (`registry.js:720-733`) — `Parts.Cylinder(4, 3).fillet(1, 'z+')`
(`miniPiTFT.js:44`) is exactly that op's own signature (radius, face orientation), no
adaptation needed.

**`PiTFT22`/`PiTFT24` both call `Hat(piMotherBoard, options)`** — this task depends on
`core-018`'s standalone `Hat` expansion existing (or, if scheduled first, this task
should expand `Hat` inline and `core-018` should be the one to extract it — flag the
ordering decision in whichever task lands second rather than duplicating the port).
**`PiTFT24`'s spacer/gusset assembly (`pi-tft24.js:236-309`) is the most complex single
piece of geometry in this task**: four cylinder-minus-bolt-hole spacers positioned at
the Hat's own four mounting holes, connected by two X-axis and two Y-axis connector
bars whose length is *computed from the spacers' own measured separation*
(`util.calcSnap(spacerGroup.parts.spacer1, spacerGroup.parts.spacer2, 'x', 'inside+')`)
— a textbook case for the probe-and-bake pattern (build all four spacers for real,
measure the gaps, bake the bar lengths), not an attempt to derive the separation from
the Hat's hole-position constants a second time.

**`HyperPixel4Rectangular`'s board is itself a `boolean.subtract`** (`board.subtract
(notch)`, `hyper-pixel-4-rectangular.js:27`) followed by a whole-group
`transform.rotate` (`group.rotate('mb', 'z', 180)`, `:55`) applied *before* the
optional board-relative attachment step is dropped — port the rotate as an ordinary
internal record; it is not part of the Family-B attachment being removed.

## Effort

L — `PiTFT24`'s spacer/gusset assembly and `miniPiTFT`'s double-bisect board are real
geometric-design questions (not wiring), and the nested-composite sub-part-addressing
question above needs a real answer, possibly a small `kernel/index.js` fold change if
addressing doesn't already resolve inside a nested expansion — worth budgeting time to
discover that before committing to the chained-`modify.bisect` approach over the
direct-construction fallback.

## Testing

Vitest, one `.spec.js` per recipe, plain Node. No V1 execution fixture. Geometric-
relation assertions: `miniPiTFT`'s board bounding box matches the two bisect cuts'
resulting L-shape dimensions; `PiTFT24`'s four spacer centres match the Hat's own
mounting-hole positions and the two connector-bar lengths match the *measured* spacer
separation (asserted against the real bounding boxes, mirroring `kit.anchor.spec.js`'s
own "assert the baked offset against the real measurement" convention, not against a
recomputed constant); `HyperPixel4`'s board bounding box is unchanged by the 180°
rotation (a symmetric-enough check) but the notch cut is confirmed present by volume.
Degenerate cases: `PiTFT24`'s `buttonWireYOffset` has a documented `<= 0` branch
(`:163,204`) — test both branches explicitly, not just the default.

No `*.e2e.js` — no UI surface exists yet.

Acceptance scenarios: none directly pass/fail on this task alone. If the nested-
composite addressing question above requires a `kernel/index.js` fold change, that
change extends the same fold `core-020`'s closed finding was filed against (composite
expansion isolation) — re-run `core-020`'s original repro (an incrementally-appended
composite must not absorb an earlier body into its own group) against the changed
fold before calling this task done, per `CLAUDE.md`'s standing-regression-surface
rule.
