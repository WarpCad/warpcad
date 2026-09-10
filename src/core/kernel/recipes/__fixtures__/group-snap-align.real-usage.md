# `group.snap` / `group.align` — the real call sites they were built from

Added by `TODO/core-013`. Every test case in `registry.spec.js`'s `group.snap` and
`group.align` blocks reproduces one of the rows below, cited by `file:line`, rather
than an arrangement of boxes chosen to make the assertion come out. This file is the
lookup table for those citations — the same job `hardware.bolt.v1-reference.json` does
for the bolt recipe, in prose because these are call *shapes*, not output geometry.

Sources are the user's own JSCAD V1 projects under `~/src/jscad/`. Read them if a
future change to these ops looks reasonable in isolation: the point of anchoring to
real code is that "reasonable in isolation" is how V1 compatibility gets lost.

## What the survey actually found

Counted at the time this file was written, over `*.jscad` under `~/src/jscad/`,
excluding `node_modules/` **and `dist/`**:

| measure | count |
|---|---|
| `.snap(` call sites | 1,361 |
| `.align(` call sites | 786 |
| files containing either | 123 |
| projects containing either | 82 |
| of those call sites, ones naming `.parts.` on the reference side | 719 (~33%) |

The `dist/` exclusion matters and is the reason a naive re-count disagrees wildly
(10,470 `.snap(` instead of 1,361): most of these projects ship a bundled single-file
build that inlines `jscad-utils`' own source, so every bundle re-counts the library's
internal calls plus its definitions. Re-run with `--exclude-dir=dist` to reproduce the
table above.

Roughly a third of all real calls reaching into another item's `.parts.` is the
finding that shaped this task: sub-part addressing is not an exotic case to defer, it
is a third of the usage.

## The signature these ops are ported from

```js
// ~/src/jscad/jscad-utils/src/group.js:297-327
JsCadUtilsGroup.prototype.snap = function snap(part, to, axis, orientation, delta) {
  var t = calcSnap(self.combine(part), to, axis, orientation, delta);
  self.map(function (part) { return assertValidCSG(part.translate(t), 'snap'); });
  return self;
};
// ~/src/jscad/jscad-utils/src/group.js:339-373 — `align`, same shape, no
// orientation argument, always centres.
// ~/src/jscad/jscad-utils/src/util.js:772 — CSG.prototype.snap(withobj, axis,
// orientation, delta), the bare-solid entry point with no piece names at all.
```

Two properties of that source are load-bearing and easy to "fix" by accident:

1. `combine(part)` computes the offset from the **named subset**, and `map` then
   translates **every** part. The pieces drive the measurement; the whole group moves.
2. It returns `self` — still a group. `.snap(...).snap(...)` chains are the dominant
   idiom below, and they only work because the parts are still there afterwards.

## The four call shapes, and where each is tested

| # | shape | real call site | test |
|---|---|---|---|
| 1 | whole solid against whole solid, no piece names | `laptop-stand/laptop-stand.jscad:52-53` | "snaps a whole solid against another, both delta signs" |
| 2 | named moving piece, whole reference item | `PiPiece/PiPiece.jscad:263` | "drives the offset from a named moving piece and moves the whole group" |
| 3 | named moving piece **and** a named piece of another placed item | `pvc-joints2/pvc-joints2.jscad:302-303` | "reaches a named piece of a *different* placed item as the reference" |
| 4 | whole solid against a named piece of another item | `leafblower/leafblower.jscad:114` | "centres a solid on a named piece of a placed group, on all three axes" |

Shape 3 is the one nothing in this project could express before `core-013`: `byId` had
always held each composite's un-combined `Group`, but every operand was flattened by
`toGeom3` before any op could see it.

### 1 — whole solid, both delta signs

```js
// ~/src/jscad/laptop-stand/laptop-stand.jscad:52-53
  .snap(body, "x", "inside-", 2.5)
  .snap(body, "y", "inside+", -2.5)
```

Also the shape of `~/src/jscad/solar-panel-bracket/solar-panel-bracket.jscad:110` and
`:113`, which are the same axis/orientation family with the delta pointing opposite
ways (`+5` proud, `-2` recessed) — covered by "keeps a negative delta negative",
because a sign silently flipped or clamped here turns a deliberate clearance into an
interference and still evaluates.

### 2 — named moving piece, whole reference

```js
// ~/src/jscad/PiPiece/PiPiece.jscad:263
  .snap('head', picase, 'z', 'outside+')
```

`jscad-hardware.jscad:137` builds a bolt's own `thread` against its `head` with this
exact shape (`thread.snap(head, 'z', orientation.head)`) — which `core-001`'s bolt port
reproduces with baked analytic offsets rather than a live call, per that file's note.

### 3 — both sides named

```js
// ~/src/jscad/pvc-joints2/pvc-joints2.jscad:302-303
  .align('head', hinge.parts.pipe, 'xz')
  .snap('head', hinge.parts.body, 'x', 'outside-')

// ~/src/jscad/PiPiece/PiPiece.jscad:296-298 — three in a row, chained
  .snap('board', pi.parts.mb, 'x', 'inside-')
  .snap('board', pi.parts.mb, 'y', 'inside+')
  .snap('board', pi.parts.cpu, 'z', 'outside-', 1)
```

The test asserts the offset is `7.5` and that each of the three less-specific
addressings gives a *different* number (`12`, `10`, `14.5`) — so it fails if either
piece name is dropped, not just if both are.

### 4 — whole solid onto a named piece

```js
// ~/src/jscad/leafblower/leafblower.jscad:114
  .align(part.parts.collar, 'xyz')
// ~/src/jscad/solar-panel-bracket/solar-panel-bracket.jscad:77
  .snap(bracketArm.parts.base, 'z', 'outside+'),
```

## How the V1 arguments map onto a document record

| V1 | record |
|---|---|
| the receiver (`bolt1` in `bolt1.snap(...)`) | `target` |
| `part` — the moving piece names | `target`'s `{ id, pieces }` |
| `to` — the reference | `operands[0]` |
| `to.parts.body` — a reference sub-part | `operands[0]`'s `{ id, pieces }` |
| `axis` | `params.axes` |
| `orientation` | `params.orientation` (`group.snap` only) |
| `delta` | `params.deltaMm` |

`pieces` reads the same on both sides — *measure using only these named parts*. What
differs is what the measurement then does, and that belongs to the op, not the
address: the moving group travels as a whole, the reference never moves.
