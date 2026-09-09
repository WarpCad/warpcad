---
title: Wire group.snap/group.align to the op registry, with sub-part-addressed operands
category: core
kind: feature
priority: medium
model: opus
milestone: M3
depends: [core-001]
status: open
---

## Goal

Expose `group.js`'s already-ported, already-tested `snap`/`align`/`pick`/`combine`
(`core-001`) as real `group.snap`/`group.align` document ops — so a recipe or a future
UI tool can position one placed item against another the same way V1 code does, instead
of only being reachable as an internal pure-function call inside a single recipe's own
expansion (which is all `core-012`'s Anchor uses today).

**This file covers only `snap`/`align`.** `core-013`'s original one-line roadmap entry
also named `Enlarge/Fit`/`Bisect` — those are unresearched here (no real usage survey
done, unlike this file) and are split out to `core-019` *(reserved)*, per `TODO/
README.md`'s "one suggestion per file" rule, rather than bundled into this scope on the
strength of the same one-liner.

### Confirmed against real usage, not reconstructed from memory

Surveyed every `.snap(`/`.align(` call across 109 of the user's own `.jscad` projects
under `~/src/jscad/` (1,007 `.snap(` + 610 `.align(` matches across 77 files) and cross-
checked the exact signature against `jscad-utils`' real source, both confirmed directly
rather than guessed:

```js
// ~/src/jscad/jscad-utils/src/group.js:297-327 (Group.prototype.snap)
JsCadUtilsGroup.prototype.snap = function snap(part, to, axis, orientation, delta) {
  var t = calcSnap(self.combine(part), to, axis, orientation, delta);
  self.map(function (part) { return assertValidCSG(part.translate(t), 'snap'); });
  return self;
};
// ~/src/jscad/jscad-utils/src/group.js:339-373 (Group.prototype.align) — same shape,
// no orientation argument, always centers.
```

`part` (`core-013`'s "moving pieces") is **required** — a comma-separated name list —
and `self.map(...)` translates **every** part in the group by the offset computed from
just that named subset, exactly what `group.js`'s already-ported `snap()`
(`src/core/kernel/group.js:494-503`) already does. That half is proven, not new.

What's genuinely uncovered — three real call shapes found in the survey, none of which
the current fold (`src/core/kernel/index.js`) can execute today:

1. **Whole-object snap, no pieces at all** — the *other* real entry point,
   `CSG.prototype.snap(withobj, axis, orientation, delta)`
   (`~/src/jscad/jscad-utils/src/util.js:772`), used when `this` is a bare solid, not a
   group:
   ```js
   // ~/src/jscad/laptop-stand/laptop-stand.jscad:52-53
   .snap(body, "x", "inside-", 2.5)
   .snap(body, "y", "inside+", -2.5)
   ```
2. **Named moving piece, reference is a whole other item**:
   ```js
   // ~/src/jscad/PiPiece/PiPiece.jscad:263
   .snap('head', picase, 'z', 'outside+')
   ```
   (`jscad-hardware.jscad:138,145` already uses this exact shape internally to build
   `thread`/`tap` against `head` — the shape `core-001`'s bolt port already reproduces
   with baked, analytic offsets rather than a live call, per that file's own note.)
3. **Named moving piece *and* a named reference piece reached out of a different,
   already-placed item's `.parts`** — the shape not yet possible at all, since nothing
   in this project resolves "part X of document item Y" as an operand:
   ```js
   // ~/src/jscad/pvc-joints2/pvc-joints2.jscad:302-303
   .align('head', hinge.parts.pipe, 'xz')
   .snap('head', hinge.parts.body, 'x', 'outside-')

   // ~/src/jscad/leafblower/leafblower.jscad:114
   .align(part.parts.collar, 'xyz')

   // ~/src/jscad/solar-panel-bracket/solar-panel-bracket.jscad:110,113-114 — delta
   // sign in both directions (proud vs. recessed), same reference-sub-part shape:
   .snap(mount.parts.negative, 'y', 'outside+', 5)
   .snap(mount.parts.negative, 'x', 'inside+', -2)
   .snap(mount.parts.negative, 'y', 'outside+', 5)
   ```
   567 of the survey's ~1,600 total matches touch `.parts.` on the reference side —
   this is not a rare pattern, it is close to a third of all real calls.

### The actual blocker: `evaluate()`'s operand resolution always flattens first

```js
// src/core/kernel/index.js:84-93
const inputs = inputIds.map((id) => {
  const resolved = byId.get(id)
  ...
  return toGeom3(resolved)   // <- combine()s any Group before a native op's build() ever runs
})
```

Every native op's `build({params, inputs})` only ever sees flat `Geom3` — by design, and
correctly so for `boolean.*`/`transform.*`/every primitive. But `byId` itself still
holds each composite item's **raw, un-combined `Group`** under its own id (set at
`index.js:112`, *before* `toGeom3` runs) — the `head`/`thread`/`tap` breakdown of a
placed `hardware.bolt` line is not actually lost, it just isn't routed anywhere a
`group.snap` op could reach it. This is the real work in this task: `snap`/`align` need
a resolution path that keeps at least their own operands raw, plus a way to name a
specific piece of a raw operand rather than only the record id.

## Interaction model

n/a for this task itself — lives entirely in `src/core/kernel/`, same precedent as
`core-001`/`core-010`/`core-011`/`core-012`.

**But flag explicitly, since it's a real gap this survey surfaced**: no roadmap row
currently claims the UI side of this. `ui-013` ("drag-place with snap guides") is a
different mechanism — live visual alignment *while dragging a new item in*, not a
precise computed reposition of two already-placed items via a named piece and an
orientation. Recommend adding a UI row once this kernel piece lands rather than letting
the capability go unreachable — see `ui-026` *(reserved, added alongside this file)* in
`TODO/ROADMAP.md`.

## Documentation

n/a for end-user docs — no control exists yet to invoke this (see Interaction model
above). Documentation lands with whatever UI task (`ui-026` or later) exposes it.

## Affected files

- `src/core/kernel/index.js` — `evaluate()`'s operand resolution needs a path that
  preserves a raw `Geom3 | Group` for at least `group.snap`/`group.align`'s own
  operands, instead of the unconditional `toGeom3` at line 92.
- `src/core/kernel/registry.js` — register `'group.snap'` and `'group.align'`, near
  the existing `boolean.*` entries.
- `src/core/kernel/index.spec.js`, `src/core/kernel/registry.spec.js` — new coverage
  for the registered ops (existing `group.spec.js` coverage stays as-is; it already
  covers the pure functions these ops call into).
- `src/core/kernel/recipes/__fixtures__/group-snap-align.real-usage.md` (new,
  optional) — a short table of the real call sites cited above, kept as a living
  reference the way `hardware.bolt.spec.js`'s fixtures anchor to real V1 output, so a
  later reader can trace each test case back to a real project rather than an invented
  one.

## Proposed fix

**Operand shape.** Extend `OpRecord`'s `target`/`operands` addressing to accept either
a bare id (current behavior, unchanged) or `{ id, pieces }` (a specific named subset of
that id's raw `Group`) — e.g. `{ target: 'bolt1', targetPieces: 'head' }` for the moving
side, `{ operands: [{ id: 'hinge1', pieces: 'body' }] }` for a reference reached out of
another item's parts. This mirrors V1's own `part`/`to.parts.x` shapes directly rather
than inventing a new addressing scheme, and needs no change to how every *other*
existing op resolves operands — only `group.snap`/`group.align` opt into reading the
raw (pre-`toGeom3`) value from `byId` and calling `pick()` themselves when `pieces` is
present. The alternative — a single dot-path string id like `'bolt1.head'` — was
considered and rejected for this file: it would require every id lookup everywhere
(`byId.get`, `duplicate record id` checks) to special-case a `.`-delimited string,
touching the shared fold for every op, not just the two that need it.

**Ops.**
- `'group.snap'`: `operandCount: 1` (the reference). `params: { axes, orientation,
  deltaMm, movingPieces }`. `target`/`targetPieces` name the item being moved and which
  of its own parts drive the offset (required, per V1's `part` argument being
  non-optional). If the resolved reference operand is itself a raw `Group` and
  `operands[0].pieces` is set, `pick()` it first; otherwise `toGeom3()` it as normal.
  Calls `group.js`'s existing `snap()` (`src/core/kernel/group.js:494-503`) — no new
  math, this task is wiring only.
- `'group.align'`: same shape, no `orientation`, per V1's own signature difference
  (`align` always centers).
- Whole-object (no pieces at all, survey pattern 1 above) is not a special case to
  register separately — it's what happens when `targetPieces` is omitted and the
  target's raw value is already a bare `Geom3` (a placed primitive, not a composite):
  `group.js`'s `calcSnap`/`calcCenterWith` already accept `Geom3 | Group` uniformly
  (`group.js:254`, `group.js:285`), so no branch is needed in the op itself.

## Effort

M — the math is already ported and tested (`core-001`); the work is entirely in the
fold's operand resolution and two thin registry entries, but touches a function
(`evaluate()`) every other existing op depends on, which is why this isn't S.

## Testing

Vitest, `src/core/kernel/registry.spec.js` (new `describe('group.snap')` /
`describe('group.align')` blocks) plus `src/core/kernel/index.spec.js` for the operand-
resolution change itself. Each survey pattern above becomes one test case, cited back to
its real file:line rather than invented:

- Whole-object snap, both delta signs — reproduce `laptop-stand.jscad:52-53`'s two
  calls against two `primitive.cuboid` records, assert the resulting offset matches
  `calcSnap` called directly on the same two boxes.
- Named moving piece against a bare reference item — reproduce
  `PiPiece.jscad:263`/`jscad-hardware.jscad:138`'s shape: a `hardware.bolt` operand,
  `targetPieces: 'head'`, reference a plain `primitive.cuboid`.
- Named moving piece **and** named reference piece pulled from a different placed
  item's raw `Group` — reproduce `pvc-joints2.jscad:302-303`'s shape. This is the one
  pattern with no existing coverage anywhere in the codebase today; it is the actual
  point of this task, not a side effect of registering the other two.
- `align`'s `'xyz'` triple-axis form — reproduce `leafblower.jscad:114`.
- Proud vs. recessed delta on the same axis/orientation pair — reproduce
  `solar-panel-bracket.jscad:110,113`'s `+5`/`-2` pair, asserting the sign is not
  silently flipped or clamped.
- Degenerate cases: `targetPieces`/`movingPieces` naming a part absent from the
  target's `Group` (must throw the same named error `group.js`'s own `resolvePieces`
  already raises, not a new message); an unknown `orientation` (same, via `calcSnap`'s
  existing check); a bare-`Geom3` target with `targetPieces` set (must throw — pieces
  only make sense against a `Group`, not a single solid).
- **Regression surface**: `evaluate()` is shared by every existing op. Re-run the full
  existing suite (`index.spec.js`, `registry.spec.js`, every `recipes/*.spec.js`, all of
  `core-001`/`core-010`/`core-011`/`core-012`'s specs) unchanged and confirm nothing
  about non-`group.*` operand resolution moved — this isn't a "previously closed
  finding" in the `TODO/VERIFY.md` sense, but `evaluate()`'s own centrality makes it the
  same kind of standing regression surface `CLAUDE.md`'s Verification section describes
  for closed findings, and deserves the same explicit re-check.

No `*.e2e.js` — no UI surface exists yet for this task to gate on, stated explicitly per
`TODO/README.md`'s rule and the Interaction model section above.

Acceptance scenarios: none directly pass/fail on this task alone — it's kernel-only.
Feeds a future UI task (`ui-026`) which would in turn feed scenario 3 (kit assembly
placement) and scenario 5 (hidden-part boolean, once a snapped-then-subtracted bolt
clearance is driven through the UI rather than hand-authored records).

No previously closed finding's subsystem is extended here in the `TODO/VERIFY.md`
sense — see the Regression surface bullet above for the analogous check this task does
need.
