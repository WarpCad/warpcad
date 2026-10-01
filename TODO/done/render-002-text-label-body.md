---
title: Text/label as a placed body
category: render
kind: feature
priority: low
model: sonnet
milestone: M7
depends: [core-001]
status: done
---

> **What actually shipped (2026-10-01).** Pulled forward at the user's request, scoped for
> real. Two departures from the proposal below: (1) `vector_text()` returns **open stroke
> polylines**, not a `geom2`, so `profile.extrudeLinear` could **not** be reused — `text.label`
> thickens each stroke with `extrudeRectangular` and unions them (what V1's `label()` did with
> `rectangular_extrude`), in a new `src/core/kernel/text.js`; (2) upstream's `height` is a
> nominal font size (an "H" at 10 is 15 mm tall), so `size` is scaled to mean true cap height.
> Params: `text`, `size`, `strokeWidth`, `height`. Empty/whitespace text **throws**. Interaction
> model as scoped: 0 preconditions, drag from a new **Text** Library section, drop point =
> centre, selected on drop; Inspector `Text` field is editable (`paramEdit` accepts a non-empty
> string for `text`). Docs: `docs/primitive-placement.md` "Placing a text label". E2E:
> `e2e/text-label-placement.e2e.js`. A `text.label` entry was added to the legacy tessellation
> golden file (no existing hash changed; the op has no curves).

## Goal

Ports `jscad-utils`' `label()` wrapper around `@jscad/modeling`'s `vector_text()` —
usage is real but rare in the surveyed corpus (~12 of ~80 projects, always through the
wrapper, never a bare `vector_text()` call) and always for one-off labeling, not a
load-bearing modeling operation the way color/holes/groups/mirror are. Named here
rather than silently dropped, but **deliberately not sequenced with the rest of this
milestone** — pull this forward only if a real design need surfaces one, the same bar
`edge-fillet`'s M4 decision used for arbitrary-edge fillet. This file exists so the gap
is recorded and re-evaluated on demand, not rediscovered from scratch later.

"Done" (if and when this is actually pulled forward) looks like: a new `text.label`
creation op that extrudes a string into a thin 3D body, using the exact parameters
`jscad-utils`' `label()` wrapper exposes (text, size, height/extrusion depth, font if
configurable) — placed the same drag-to-place way any other creation row is, per
`CLAUDE.md`'s non-negotiable placement rule.

## Interaction model

n/a until this task is actually picked up — no UI surface exists or is being built now.
If pulled forward, it inherits the standard creation-control contract every Library
row already has (`ui-010`'s established mechanism: 0 preconditions, drag-to-place,
committed selected at the drop point) rather than needing fresh interaction-model
design — state this explicitly when the task is actually scoped for real, rather than
leaving the section blank.

## Documentation

n/a — no control exists yet.

## Affected files (if pulled forward)

- `src/core/kernel/group.js` or a new `src/core/kernel/text.js` — a `label(text,
  sizeMm, heightMm)`-shaped function wrapping `@jscad/modeling`'s `vector_text()` plus
  an extrude step (`vector_text()` returns 2D paths, not a solid — this needs the same
  `profile.extrudeLinear` primitive `core-012` already built for `kit.boardFrame`,
  reused rather than re-invented).
- `src/core/kernel/registry.js` — a new `text.label` entry, `operandCount: 0`, `ui`
  metadata for a Library row.
- New `.spec.js` coverage.

## Proposed fix

Reuse `core-012`'s already-shipped `profile.extrudeLinear` native op rather than adding
a second extrusion mechanism — `vector_text()`'s output is a 2D path set, and
`extrudeLinear` already exists specifically to turn a 2D profile into a solid. The
recipe/op need only call `vector_text()` for the glyph outlines and pipe the result
through the existing extrude op, mirroring `kit.boardFrame`'s own profile→extrude
composition pattern.

## Effort (estimated, for whoever eventually scopes this for real)

S/M — a small port with an already-available extrusion primitive to reuse, no new
kernel capability required. `model: sonnet` — no numerical or architectural ambiguity
once `vector_text()`'s output shape is confirmed compatible with `extrudeLinear`'s
existing input contract (worth a five-minute Step 2 check before assuming it, since
`core-012`'s own retirement note already flagged `extrudeLinear` silently passing
through a non-`geom2` argument unchanged rather than failing — confirm `vector_text()`'s
output really is `geom2`-shaped before relying on that guard to catch a mismatch).

## Testing (for whoever eventually scopes this for real)

- New `text.spec.js`: a known string extrudes to a solid with a plausible bounding box
  (height matching the given `heightMm` on the extrusion axis); an empty string is a
  degenerate case to name explicitly (produce an empty/zero-volume result, or throw —
  decide and test whichever, don't leave it undefined).
- New `e2e/text-label-placement.e2e.js`, following `ui-010`'s established
  drag-place-primitive pattern, once a real Library row exists.
- **`TODO/ACCEPTANCE.md` scenarios**: none directly, and none anticipated — text/label
  is not named as a driver of any of the 13 existing scenarios; if this task is ever
  pulled forward for a real design need, re-check whether that need itself implies a
  new scenario, per `ACCEPTANCE.md`'s own new-capability-class rule, rather than
  assuming "none" still holds unchanged from this speculative file.
- **Regression surface**: none anticipated — an independent new creation op touching no
  existing fold path beyond registration, mirroring every other Library-row addition's
  own low regression profile (confirmed via `core-012`'s `profile.extrudeLinear` re-use,
  which is already exercised by `kit.boardFrame`'s own passing suite).
