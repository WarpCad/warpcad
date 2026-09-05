---
title: Spike — fillet/chamfer and Bearing native-op viability in V3
category: core
kind: feature
priority: low
model: opus
milestone: M0
depends: [core-001]
status: done
---

> **Outcome note — the finding differs from what this task proposed.** The spike went
> looking for whether V1's `.fillet()`/`.chamfer()` survive the port, and found first
> that the question was mis-framed: reading the vendored `jscad-utils` source
> (`util.js:1023-1068`), **V1 never had an arbitrary-edge fillet** — `fillet`/`chamfer`
> are both `util.reShape`, which rounds the whole *rim* of one axis-aligned face by
> lofting a single cross-section. That splits the result in two. The rim semantics port
> to V3 completely and are now shipped and tested as `modify.filletRim`/
> `modify.chamferRim` (exact to 2e-7 against hand-derived analytic volumes, including on
> a boolean-union result and a reflex-corner footprint). Arbitrary-edge fillet is **not
> achievable** on `@jscad/modeling` — no such op, no solid erosion (`expand` throws on a
> negative delta), and boolean results are polygon soup with 42% unmatched edges, so
> there is no edge to select or name — and the **OpenCascade.js fork question is
> surfaced explicitly** in the addendum, with three costed options, for the user to
> answer before any roadmap task promises edge fillets. Bearing turned out to be a
> phantom risk: there is **no `Bearing` in the vendored `jscad-hardware`** at all, and
> no `addConnector`/`.connect` in `jscad-utils` — V1's `CSG.Connector` was loft plumbing
> inside the fillet code path, not a mating API. Bearing is therefore **composite, not
> native**, blocked only on a spec table; mating already works via `core-001`'s ported
> `snap`/`align`. One factual error in `Initial design.md` §5 was found and recorded:
> V3 2.13.0 has **no** first-class `connectors` type and `curves` holds only `bezier`.
> Full finding: the `TODO/core-003` addendum in `docs/decisions/geometry-kernel.md`.

## Goal

Resolve `Initial design.md` §11's flagged risk before Fillet/Chamfer or Bearing are
promoted from "listed in §6 as Native (tentative)" to a committed roadmap task.
Concretely: determine whether arbitrary non-primitive-mesh edge fillet/chamfer is
robustly achievable in `@jscad/modeling` (V1's `.fillet()`/`.chamfer()` were BSP-based
and their real edge-case coverage was never characterized against V3), and whether
`Bearing`'s V1 connector-based mating (`.addConnector`/`.connect`) has a workable
V3-native equivalent using V3's first-class `connectors`/`curves` geometry types (§5).

If fillet/chamfer robustness turns out to be genuinely inadequate in `@jscad/modeling`,
this task's job is to **surface the fork-to-`OpenCascade.js` question to the user
explicitly**, per §11's own instruction — not to silently work around it or quietly
drop the feature.

Done when: both Fillet/Chamfer and Bearing have a written finding — either confirming
the Native (tentative) classification in §6 is workable, or naming the specific gap and
the OpenCascade.js-fork question if not.

## Interaction model

n/a — this is a research/prototype spike in `src/core/kernel/`, no UI surface. The
eventual fillet/chamfer/bearing controls are future roadmap items this spike's findings
feed into, not part of this task.

## Documentation

n/a for end-user docs. Findings should be written as an addendum section in
`docs/decisions/geometry-kernel.md` (from `docs-001`), since this is new evidence
bearing directly on that decision's scope, not a separate decision doc.

## Affected files

- `docs/decisions/geometry-kernel.md` (addendum — edit)
- `src/core/kernel/registry.js` (fillet/chamfer/bearing entries, marked `native`, once
  confirmed workable)
- throwaway spike/prototype code (not necessarily merged if the finding is "doesn't
  work")

## Proposed fix

Prototype fillet/chamfer against a couple of representative non-primitive meshes
(e.g. a boolean-union result, not just a raw cuboid edge) using whatever V3 offers
directly or via a small custom BSP-edge-rounding routine, and compare against expected
geometry. For Bearing, prototype expressing its mating using V3's `connectors`/`curves`
types against one of `jscad-hardware`'s actual bearing specs. Write the finding either
way — a negative result here is exactly as valuable as a positive one, since it changes
what `docs-003`'s roadmap can safely commit to.

## Effort

M (a few hours)

## Testing

Vitest numeric-tolerance tests against known-good fillet cases if V3 handles them
adequately (e.g. fillet a cuboid edge, compare against hand-computed expected
geometry). If the finding is negative, no passing test is expected for that path — the
deliverable is the documented finding itself, stated explicitly rather than left as a
silent gap. No `*.e2e.js` spec (no UI surface). No acceptance scenario touched. No
closed findings to re-check yet.
