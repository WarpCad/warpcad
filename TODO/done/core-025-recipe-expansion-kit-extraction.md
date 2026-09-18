---
title: Extract the shared probe-and-bake recipe-expansion kit into one module
category: core
kind: feature
priority: low
model: sonnet
milestone: M5
depends: [core-014, core-015, core-016, core-017, core-018]
status: done
---

> **What actually shipped.** Exactly the refactor the file proposed, with one correction
> to its premise: only **four** recipes still carried private helper copies
> (`raspberrypi.bplus`, `cameraModule`, `touchDisplay7inch`, `touchScreen2`).
> `core-018`'s recipes (`hat`, `hatStandoff`, `spacer`, `activeCoolingFan`), and
> `core-017`'s, were *already* importing `rpi-recipe-kit.js`, so there was nothing to
> migrate there — they were re-verified because the kit changed under them, not because
> they changed. **Drift check (Proposed fix step 1): none that changes any output.** The
> copies differed only in signature (`cuboidPart` `frame`, `cylinderPart` `rotationDeg`,
> `roundedCubePart` `'centred'` frame, `chain` accepting a `Part[]` reference) and in two
> code paths no call site reaches (the kit clamps corner radius the way V1's
> `CAG.roundedRectangle` does; a `move` after a `turn` goes to a trailing translate in the
> kit but folded into the pre-turn one in the copies). The kit took the union as optional
> arguments whose defaults are the older behaviour, plus `degToRad` and three `Builder`
> methods (`placeUnion`, `placeBoolean`, and `place(part, null)` for unlabelled
> intermediates) replacing the copies' `plan`/`emit` pair. Proof it changed nothing: a
> 34-variant JSON sweep of every `raspberrypi.*` recipe was byte-identical before and
> after (re-taken after the kit change and after each migration), on top of the unchanged
> 936-test suite. `recipes/` went from 10,865 to 9,818 lines (-1,047).

## Goal

Pure internal refactor, no behavior change. `core-014`, `core-015`, `core-016`, and
`core-017` (via `rpi-recipe-kit.js`) each independently grew their own ~200-line copy of
the same "probe-and-bake" helper set — `makePart`/`cuboidPart`/`cylinderPart`/
`roundedCubePart`/`move`/`chain`/`place`/`emit`/`addVectors` — used to build a
composite recipe's records without importing `@jscad/modeling` directly (the pattern
`core-012`'s `kit.anchor` established: measure via throwaway probe geometry, bake the
result into a `transform.translate`, discard the probe).

This was flagged and deferred at each step, not missed: `core-015` explicitly asked
`core-016` to decide ("a sample of two cannot settle it, a sample of three can");
`core-016` decided **yes, extract**, but didn't do it in that commit; `core-017` built a
fourth copy as `rpi-recipe-kit.js`, explicitly naming it "the module it should grow into
rather than a sixth copy" and confirming the refactor "is still open and still wants its
own task." No task has claimed it since, and `core-018` landed a fifth recipe set
without extracting either, per its own retirement note reusing `core-012`'s pattern
directly rather than the kit.

"Done" looks like: one shared module (`rpi-recipe-kit.js` is the already-agreed target,
per `core-017`'s own naming) that `core-014`/`015`/`016`/`017`/`018`'s recipes all import
from, with zero behavior change — every existing V1-diff fixture for all five recipe
sets still passes byte-for-byte.

## Interaction model

n/a — pure internal refactor of framework-free `src/core/` helper code, no UI surface,
no document-model change, no registry change. State explicitly per `TODO/README.md`
rather than omit the section.

## Documentation

n/a — no user-visible change. If the shared module's own header doc needs updating to
describe its final consolidated shape, that's an inline-comment concern (per `CLAUDE.md`
Conventions), not an end-user `docs/` page.

## Affected files

- `src/core/kernel/recipes/rpi-recipe-kit.js` — becomes the single shared module;
  currently `core-017`'s own copy, needs to absorb whatever `core-014`/`015`/`016`
  duplicated independently before it existed.
- `src/core/kernel/recipes/raspberrypi.bplus.js` (`core-014`), `raspberrypi.
  cameraModule.js` (`core-015`), `raspberrypi.touchDisplay7inch.js`/`touchScreen2.js`
  (`core-016`), `raspberrypi.hat.js`/`hatStandoff.js`/`spacer.js`/
  `activeCoolingFan.js` (`core-018`) — each needs its own inline copy of the helper set
  removed and replaced with an import from the shared module.
- Each recipe's own `.spec.js` — should need no behavior-level change, only import
  paths if any test directly exercises a helper function rather than the recipe's
  public API.

## Proposed fix

1. Diff the (up to) four independent copies to confirm they're actually identical in
   behavior (not just name) before consolidating — `core-015`'s own deferral note
   implies they might have drifted slightly since each was written independently; if
   they have, this task must decide which behavior is correct and treat the others as
   the bug, not silently pick one arbitrarily.
2. Consolidate into `rpi-recipe-kit.js` (the already-agreed target module name), export
   every function the four call sites need.
3. Update each of the five recipe files' imports, deleting their own local copies.
4. No change to any recipe's *output* — this task's entire correctness bar is "every
   existing fixture still passes exactly," which is also this task's whole Testing
   section.

## Effort

M — mechanical once the diff-for-drift check in step 1 is done, but that check is real
work (four ~200-line modules to compare function-by-function) and any discovered drift
turns this from a pure refactor into a real correctness decision. `model: sonnet` —
this is consolidation of already-proven code along an established pattern, not new
geometry or architectural ambiguity, per `TODO/README.md`'s guidance that mechanical
consolidation stays sonnet even at effort M.

## Testing

No new test *behavior* — the existing suite is the test. Re-run all four (`core-014`,
`015`, `016`, `017`) recipes' own V1-execution/measured fixtures unchanged after the
extraction and confirm byte-identical output, per `CLAUDE.md`'s standing-regression-
surface rule ("a shared kit touching four already-diffed recipes is exactly this case").
Also re-run `core-018`'s fixtures even though it never used the kit directly, since its
recipes may end up migrated onto the shared module too if step 1's drift-check finds
them equivalent.

**`TODO/ACCEPTANCE.md` scenarios**: none directly (pure internal refactor, no UI
surface) — but per `CLAUDE.md`'s standing-regression-surface rule, re-run `ui-010`'s
7-row Library-panel repro anyway, since this touches five already-registered recipe
files' internals even though it adds no new registry keys.

**Closed-finding regression surface**: `core-020`'s repro, re-run against at least one
of the five affected composite kinds post-refactor, since this task modifies the code
path that builds their records even though it shouldn't change their output.
