---
title: "transform.mirror — reflect a body about an axis-aligned plane"
category: core
kind: feature
priority: medium
model: opus
milestone: M7
depends: [core-001]
status: done
---

> **What shipped (2026-09-30):** as scoped, no expansion. `mirror(value, axis, pointMm?)` and
> `mirrorRotationDeg` in `kernel/group.js` (generic `transforms.mirror({origin, normal})`, since
> `mirrorX/Y/Z` are fixed to the world origin); `transform.mirror` = `wholeGroupNative(1, …)`.
> **Semantics decision: `operandCount: 1` suffices, no registry marker.** The caller appends
> `{ op: 'transform.mirror', target: currentIdOf(source), params: { axis, pointMm?, rotation? } }`
> with neither `supersedes` nor `consumes`; `document.js` already makes such a record its own
> lineage root, so two bodies result and the source is untouched. `target` (not a `sourceId`
> param) so the fold, delete guard and `dependents.js` all see the reference. The copy is a snapshot.
> **For `ui-039`:** the new mirrored body becomes **selected**, original stays visible but
> deselected (matches library drop and boolean result). Default point = body centre means a
> symmetric body mirrors onto itself invisibly — commit an explicit point (e.g. world origin).
> Set `params.rotation = mirrorRotationDeg(source.rotationDeg, axis)`. Add `'transform.mirror':
> 'Mirror'` to `STEP_VERBS`, `timelineLabel.js`, `dependents.js` `RELATIONSHIP_VERBS`.

## Goal

Reflect a body about an axis-aligned plane through a point (default its own centre).
`@jscad/modeling` (the committed kernel) already ships `mirrorX`/`mirrorY`/`mirrorZ`
directly, so the **geometry** is expected to be a small, low-risk port mirroring (per
this row's own note, no pun intended) `transform.rotate`'s existing shape.

**The real open question is document semantics, not geometry, and this file exists
specifically to state it before anyone defaults to the wrong answer**: every real
corpus usage surveyed (`scope-ring/index.js:52`'s `cableTie2 = cableTie.mirrorY()` is
the clearest example, found only after a scoping-bug correction to this milestone's
own survey — see `TODO/ROADMAP.md`'s M7 header for the full correction record) **keeps
the original body and produces a second, separate mirrored one**. This is a
**creation-shaped** result — two independent bodies afterward — not the in-place
`supersedes` pattern `modify.enlarge`/`modify.bisect` use, where the original geometry
stops existing in favor of the modified result. `modify.*` is the nearest existing
precedent in this codebase and is **the wrong one** for mirror; naming this explicitly
so whoever implements this doesn't default to it by proximity.

## Interaction model

n/a directly — kernel-only, feeds `ui-039`. State explicitly per `TODO/README.md`.
**One thing this task must still decide that directly shapes `ui-039`'s spec**: since
the result is two independent bodies, does the new mirrored body become **selected**
after the op commits (matching every creation-shaped op's existing selection-response
convention), leaving the original also present but deselected? State this explicitly in
the retirement note — `ui-039` cannot write a correct Interaction-model section without
this answered.

## Documentation

n/a — no control exists yet; `ui-039` owns the end-user page once it exists.

## Affected files

- `src/core/kernel/group.js` — a new `mirror(value, axis, pointMm)` function using
  `@jscad/modeling`'s `mirrorX`/`mirrorY`/`mirrorZ` directly (or its generic `mirror()`
  with a plane definition, if that gives cleaner axis+point composition — check the
  library's actual API at Step 2 rather than assume), typed over `Geom3 | Group` per
  this module's existing convention (`snap`/`align`/`enlarge`/`bisect` already do this
  uniformly).
- `src/core/kernel/registry.js` — a new `transform.mirror` entry, **`operandCount: 0`**
  is wrong (it operates on an existing body) but **`operandCount: 1` with a
  `consumes`-free, creation-shaped commit** is the real answer per the Goal's semantics
  decision — this needs a registry-level flag or convention this codebase doesn't have
  yet (every existing `operandCount: 1` op, `modify.*`, is `supersedes`-shaped). Confirm
  at Step 2 whether `operandCount: 1` alone is sufficient (with the *document* layer,
  not the registry, deciding to append as a plain new creation record referencing the
  source body's current geometry rather than a `supersedes` record) or whether the
  registry itself needs a new marker — this is exactly the kind of "real architectural
  ambiguity" this file's Goal section already flags.
- New `group.spec.js` coverage, diffed against real V1 `mirrorY()`-equivalent output
  from one of the surveyed real files if accessible, or against `@jscad/modeling`'s own
  documented mirror semantics directly if a V1 fixture isn't practical to generate.

## Proposed fix

1. Confirm `@jscad/modeling`'s exact mirror API (function name, whether it takes a
   plane normal + point or a named axis) by reading its source/types directly, not
   assumed from the axis names alone.
2. Build `mirror(value, axis, pointMm = centroidOf(value))`, defaulting the reflection
   point to the body's own centroid per the Goal's stated default, using `boundsOf`/
   `centroidOf` the same way `enlarge`/`fit` already do.
3. **The document-layer decision is the real content of this task, not the geometry
   port**: the caller (whichever future command-layer code appends the record) must
   append a **new, independent creation record** — not a `supersedes` record targeting
   the original. Confirm this by checking `document.js`'s `append` path accepts a
   creation-shaped op whose params reference another body's current geometry as an
   input (this may need a new param shape, e.g. `{ sourceId, axis, pointMm }`, since
   every existing `operandCount: 1` `modify.*` op currently assumes its one operand
   becomes the *same* body afterward, which mirror explicitly must not do).

## Effort

M — the geometry itself is low-risk (a direct kernel library call), but the document-
semantics decision is real, stated architectural ambiguity with the nearest existing
pattern being the *wrong* one to copy — exactly the trap this file's Goal section exists
to name. `model: opus` per `TODO/README.md`'s guidance on real architectural ambiguity
with no existing pattern that fits.

## Testing

- `group.spec.js`: mirroring a body about each axis at its own centroid produces a
  geometrically correct reflection (assert specific vertex/bounds positions flip sign
  correctly relative to the plane, `toBeCloseTo`); mirroring about an explicit
  off-centre point produces the correct offset reflection; the **original geometry
  value passed in is unchanged** (a pure function, not a mutation) — the specific
  regression this task's own document-semantics note exists to prevent from leaking
  into the kernel layer too.
- `document.spec.js` (or wherever the command-layer append logic for a "read one body,
  create another" shaped op would be tested): appending a mirror record leaves the
  original body's own record and current position completely untouched, and reports
  two bodies afterward, not one.
- No `*.e2e.js` — no UI surface yet, stated explicitly.
- **`TODO/ACCEPTANCE.md` scenarios**: none directly (kernel-only) — feeds a new scenario
  once `ui-039` lands, per `ACCEPTANCE.md`'s own new-capability-class rule. **Regression
  surface**: `core-020`'s repro, re-run once a mirror record can be appended
  incrementally, since this is a new *creation-shaped* record kind referencing another
  body's geometry — a genuinely new shape for the exact fold that finding was filed
  against, worth checking rather than assuming the fix generalizes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
