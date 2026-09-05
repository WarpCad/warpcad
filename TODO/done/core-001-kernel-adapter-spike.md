---
title: Kernel-adapter spike — Group port + one composite recipe end-to-end
category: core
kind: feature
priority: high
model: opus
milestone: M0
depends: [docs-001, build-001]
status: done
---

> Note: implemented largely as scoped, with three extra native registry entries the
> bolt recipe couldn't expand without (`primitive.cylinder`, `primitive.hexagon`,
> `transform.translate`) and a `tables/bolt-specs.js` port of the V1 size tables. The
> composite/native split held for the bolt, but exposed a real limit worth flagging for
> `core-003`/future recipe work: a recipe emits records before any geometry exists, so
> it can't call `group.snap` against arbitrary geometry it didn't itself create — the
> bolt worked around this because its offsets are all analytic (the size table gives
> every height), but the Raspberry Pi board spike will hit this directly and needs to
> decide between a two-phase expand→evaluate→measure→re-expand, or making `group.snap`
> a real op record the fold resolves. Also found and worked around real breakage in
> `jscad-utils@3.2.0` (a broken `util.defaults()`, two namespace members dropped) — see
> `scripts/generate-v1-bolt-fixture.cjs`'s header for the full detail. `"m2.5 socket"`,
> `Initial design.md`'s running example spec, does not exist in the real V1 tables;
> `'m10 hex'` and `'1/4 socket'` were used instead, covering both head-type branches.


## Goal

Prove the JSCAD V1→V3 migration (`Initial design.md` §5) and the composite-recipe
pattern (§4) against real code before committing to the full §6 catalog across dozens
of future roadmap tasks. Concretely, by the end of this task:

1. A quick health check (stars, open/closed issues, last release) on
   `jscad-object-api` — resolving §2's flagged open sub-decision — decides whether it
   covers enough of `jscad-utils`'s `Group` vocabulary to use directly. Only hand-port
   whatever it doesn't already cover.
2. A functional port of `Group`'s `snap`/`align`/`combine`/`pick`/`add` (§4's "Group
   port — what has to be rebuilt, concretely" section has the exact signatures) — pure
   functions over plain JSCAD V3 `geom3` values, no mutation, no `this`.
3. Three **native** registry entries wired end-to-end: `primitive.cuboid`,
   `boolean.union`, `boolean.subtract` (§4's registry shape).
4. One **composite** recipe (`hardware.bolt`) that expands `params` into an internal
   array of those native ops (hexagon/cylinder/translate/union), replayed through the
   same fold the top-level document will use — not a hand-built mesh function.
5. The bolt recipe's resulting geometry **dimensionally diffed against real
   `jscad-hardware` v1 `Bolt()` output** for at least one spec (e.g. `"m2.5 socket"`) —
   confirming §11's flagged fidelity risk by measurement, not by source-reading alone.

Done when: the above five items pass, and the composite-vs-native split (§4) is
either confirmed workable or its failure mode is written up concretely enough to change
the plan before the full catalog is built on top of it.

## Interaction model

n/a — this lives entirely in `src/core/kernel/`, framework-free, no UI surface exists
yet. The eventual UI that drags a Bolt into the viewport is a later roadmap item this
spike unblocks, not part of this task.

## Documentation

n/a for end-user docs. Do dump the bolt recipe's full expansion (the internal
primitive/boolean records it produces for one concrete spec) as a JSON fixture under
`src/core/kernel/recipes/__fixtures__/` or similar — §4 calls this out as "diffable and
reviewable the same way any other document is," and it's also the input the
dimensional-diff test in Testing below needs.

## Affected files

- `src/core/kernel/group.js` (new — functional `snap`/`align`/`combine`/`pick`/`add`,
  or a thin wrapper around `jscad-object-api` if the health check favors it)
- `src/core/kernel/registry.js` (new — `op` → kernel-call map, each entry tagged
  `composite`|`native` with an `operandCount`, per §4's registry shape)
- `src/core/kernel/recipes/hardware.bolt.js` (new)
- `src/core/kernel/index.js` (new — the adapter's public entry point; everything
  outside `core/kernel/` talks to the kernel only through this)
- `package.json` (add `@jscad/modeling`; add `jscad-hardware` as a devDependency
  purely for the fixture-comparison test, and `jscad-object-api` if step 1 adopts it)

## Proposed fix

Build in the order listed under Goal. Keep `group.js` pure-functional per §4's V1→V3
code sample (`group.snap(bolt1, 'thread', group.combine(rpi, 'mb', {noholes:true}),
'z', 'outside+')` — takes and returns plain geometry/Group values, no chaining on
`this`). The registry (`registry.js`) is also the enforcement point for `CLAUDE.md`'s
creation-vs-operation rule via `operandCount` — get this field right on all five
entries now, since every later catalog entry copies this shape. The dimensional diff
against V1 should run the actual `jscad-hardware` `Bolt(20, MetricBolts['m2.5
socket'], 'loose')` V1 call in a throwaway/dev script or fixture-generation step (V1
still runs standalone — it's only incompatible as an *import target inside V3*, not
unusable at all) and compare bounding-box/key-vertex dimensions against the V3 recipe's
output.

## Effort

L (multi-session / needs design discussion)

## Testing

Vitest, `src/core/kernel/*.spec.js`, plain Node — no DOM, no GPU, no worker exists yet
(`CLAUDE.md`'s "always mock at the boundary" applies to *consumers* of this kernel
later, not to this task, which *is* the kernel). Numeric-tolerance tests
(`toBeCloseTo`) comparing the bolt recipe's dimensions against the real V1
`jscad-hardware` output for at least one spec, per `CLAUDE.md`'s numerical-code
convention. Cover degenerate params (zero-length bolt, an unknown `spec` key) as
registry/recipe-level tests, not just the happy path.

No `*.e2e.js` spec — no UI surface exists for this task to gate on. This is stated
explicitly, not silently skipped: the drag-and-drop hardware-placement UI that will
eventually exercise this registry is a separate, later roadmap task (seeded by
`ui-001` and named for real once `docs-003`'s `TODO/ROADMAP.md` exists).

Acceptance scenarios: none yet — `TODO/ACCEPTANCE.md` doesn't exist until `docs-004`,
and this task touches no running app. No closed findings exist in this project yet to
re-check.
