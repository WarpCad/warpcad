---
title: "hardware.screw composite family: PanHead and FlatHead"
category: core
kind: feature
priority: low
model: sonnet
milestone: M7
depends: [core-001]
status: open
---

## Goal

A genuinely distinct fastener recipe from `hardware.bolt` — not a rename or a parameter
variant. `jscad-hardware/src/hardware.js:224`'s `Screw` export builds different head
geometry (`PanHead`, `FlatHead`) than `hardware.bolt`'s hex/socket head, and `FlatHead`
specifically needs a **countersink cut** `hardware.bolt` never required (a bolt's head
sits proud of the surface; a flat-head screw's head sinks flush into a matching conical
recess). "Done" looks like: `hardware.screw` registered as a composite recipe, `PanHead`
and `FlatHead` variants both dimensionally verified against real `jscad-hardware`
output, following `core-010`/`core-011`/`core-023`'s established measured-diff
discipline rather than a from-scratch geometric guess.

**First real input to `ui-038` (BOM panel)**: `jscad-hardware`'s `Screw` export tracks
its own BOM key internally (`` `Pan Head Screw ${name}` ``, per the source cited above)
— a convention `core-010`/`core-011`/`core-023` never had to reckon with, since nothing
reads `Hardware.BOM` back out yet. This task should record the BOM-key convention in its
own recipe's module doc (mirroring how `hidden`/`color` conventions get documented) even
though nothing consumes it until `ui-038`, so that task doesn't have to rediscover it.

## Interaction model

n/a — kernel-only, no UI surface yet, following the exact precedent `core-010`/
`core-011`/`core-023` already set for `hardware.*` recipes (no Library row lands until
a `ui-*` task claims it — likely folded into a future `ui-030`/`ui-031` follow-on,
named here as a flag rather than scoped).

## Documentation

n/a — no control exists yet, per Interaction model above.

## Affected files

- `src/core/kernel/recipes/hardware.screw.js` (new) — the composite recipe, following
  `hardware.bolt.js`'s module-doc structure (quote the real V1 source, name every V1→V3
  divergence explicitly, same as every prior `hardware.*` port).
- `src/core/kernel/registry.js` — `hardware.screw` entry, `operandCount: 0`, near the
  existing `hardware.*` block.
- `src/core/kernel/tables/screw-specs.js` (new) — the size table, mirroring
  `tables/bolt-specs.js`'s existing shape.
- New `hardware.screw.spec.js`.

## Proposed fix

1. Read `jscad-hardware/src/hardware.js:224`'s real `Screw` source directly (per this
   project's own established discipline of running/reading real V1 output rather than
   guessing, which has caught real sign/naming errors twice already in `bisect`'s
   history) — identify exactly how `PanHead`/`FlatHead` differ from `Bolt`'s existing
   head construction, and what parameters the countersink cut needs (typically a cone
   angle and depth, per standard screw-drawing convention).
2. Build `PanHead` first (closer to `hardware.bolt`'s existing rounded/domed-head
   shape, lower risk) and `FlatHead` second (needs the new countersink boolean-cut
   step) — same incremental-risk ordering `core-010`→`core-011`→`core-023` already used
   across the `hardware.*` family.
3. Generate a real V1 fixture via a script mirroring
   `scripts/generate-v1-bolt-fixture.cjs`'s existing pattern (already in `package.json`
   as `fixtures:v1-bolt`), not a source-reading guess, per this project's own repeated
   lesson that reading V1 source alone has produced backwards results twice (`core-019`/
   `core-021`'s bisect sign convention).
4. Record the BOM-key convention (Goal, above) in the new module's doc comment.

## Effort

M — a fourth `hardware.*` recipe following three already-proven examples closely
(bolt/nut/washer/bearing), with one genuinely new piece of geometry (the countersink
cut) that has a real, well-understood standard shape rather than open design ambiguity.
`model: sonnet` per `TODO/README.md`'s guidance that work closely mirroring an
established, repeated pattern stays sonnet even where one new sub-feature (the
countersink) exists — this project's own `core-011`/`core-023` both stayed sonnet-eligible-
shaped despite each having one novel piece.

## Testing

- `hardware.screw.spec.js`: `PanHead` and `FlatHead` both dimensionally diffed against
  real measured `jscad-hardware` `Screw()` output (size and volume, not raw bounds, per
  `core-010`'s established base-at-z=0-vs-centred convention); a `FlatHead`'s
  countersink cut produces the correct conical recess depth/angle, verified by
  measuring the cut geometry directly rather than trusting the boolean succeeded
  without erroring.
- No `*.e2e.js` — no UI surface, stated explicitly.
- **`TODO/ACCEPTANCE.md` scenarios**: none directly (kernel-only). **Regression surface**:
  none — a new, independent recipe touching no existing fold path beyond registration.
