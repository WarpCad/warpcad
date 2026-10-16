---
title: gear.profile native op and the gear.spur composite recipe (extruded, bored spur gear)
category: core
kind: feature
priority: high
model: opus
milestone: M11
depends: [core-040]
status: done
---

> **What actually shipped.** The native op is named `profile.gear` (the `profile.*` namespace
> from `docs/decisions/gears.md`), with a second native op `profile.circle` so the bore is cut in
> 2D before one extrude. `gear.spur` is a composite with parts `gear`, `bore` and `pitch` (a hidden
> full-thickness cylinder, not zero-thickness). It carries **no `ui`**, so it is not yet a Library
> row or AI-creatable; `ui-057` attaches `GEAR_SPUR_UI`. `library.js` has the empty "Gears"
> section. The alias table converts V1 values (backlash, circularPitch, diametralPitch) and refuses
> V1 `pressureAngle`; that and `boreMm` vs `core-048` are open (see the gears.md addendum).

## Goal

Make a spur gear a first-class registry entry: `gear.spur` is a **composite** recipe that
expands to `gear.profile` → `profile.extrudeLinear` → an optional bore subtract, the same
shape `hardware.*` recipes use. "Done": a document line `{ op: 'gear.spur', params: { teeth:
36, module: 1.39, pressureAngleDeg: 20, thicknessMm: 8, boreMm: 4 } }` folds to a watertight
solid whose bounds, volume and tooth count match `core-040`'s derived values, and the
bore is a named part so the existing boolean/snap tools can address it.

## Design

- **`gear.profile`** — a `native(0, …)` registry entry returning a `geom2` from
  `involuteProfile` (`core-040`). Params validated with the registry's usual caps
  (teeth 3…500, module 0.05…50, angle 5…35°, finite numbers only).
- **`gear.spur`** — `kind: 'composite'`, `operandCount: 0`, `ui` metadata (label, defaults,
  param ranges) so `src/core/library.js` lists it with no per-gear code in a component.
  It expands to records and **never imports `@jscad/modeling`** (see
  `recipes/hardware.bearing.js`). Named parts: `gear` (the toothed body), `bore` (the
  negative, kept so a pin/shaft can be snapped into it), `pitch` (a zero-thickness
  reference cylinder at the pitch circle, hidden by default — the mating tools in `core-044`
  snap to it).
- **Placement and origin**: the gear's *axis is local Z*, centred on the origin, tooth 0 on
  +X, mid-thickness at Z=0 (matches every other `primitive.*` row's centre-origin
  convention). A `center` param is **not** accepted by the recipe — the library's trailing
  `transform.translate` supersedes it, per the rule `library.js` documents for composites.
- **Resolution**: points per flank and bore segments come from the design/export resolution
  of `core-035`, so export is finer than preview.
- Inputs in V1's vocabulary are accepted on load through a documented alias table
  (`circularPitch` → `module = circularPitch/π`; `toothCount` → `teeth`;
  `centerHoleDiameter` → `boreMm`; `clearance`, `backlash`, `profileShift` unchanged) so a
  V1 project ports by renaming nothing.
- **Adding the namespace**: `src/core/library.js`'s `SECTION_DEFINITIONS` gets
  `{ id: 'gear', title: 'Gears' }` and `ROW_ORDER` the new row; the *panel* wiring is
  `ui-057`, so until then the section may be empty or the row unlisted — say which.

## Interaction model

n/a — core only, no new UI surface in this task (`ui-057` mounts the row and the Inspector).

## Documentation

n/a — no user-visible control in this task; `ui-057` documents the flow.

## Affected files

- `src/core/kernel/registry.js` (entries), `src/core/kernel/recipes/gear.spur.js` + spec,
  `src/core/library.js`, `src/core/gear/aliases.js` (V1 names) + spec,
  `src/core/kernel/index.js` only if op registration is enumerated there.

## Effort

M.

## Testing

- **Unit**: recipe returns the documented records for default and extreme params; folding
  gives a solid whose volume ≈ `thickness · (profile area − bore area)` within 0.5 %; part
  names `gear`/`bore`/`pitch` present; the V1 alias table maps all six V1 names, and an
  unknown param is a named error.
- **Watertight**: `src/core/kernel/watertight.js` check on 6, 17, 36 and 120 teeth, with and
  without a bore; also with bore ≥ root diameter (rejected with a named error, not a hole
  through the teeth).
- **Hostile input**: NaN, `Infinity`, 10⁶ teeth, negative module, a bore larger than the
  gear — each a named warning/error, never a hang (the cap is checked *before* the profile
  is built).
- **Regression re-run**: `TODO/ACCEPTANCE.md` scenarios 1, 3 and 10 (a new composite family
  must not break placement of existing hardware, or save/reload). This extends the
  composite-recipe pipeline `core-020` and `core-024` were filed against, so re-run their
  original repros: a composite placed after a drag keeps its named parts, and a boolean on
  one of its sub-parts addresses only that part.
- Chromium only (no UI); the all-engine coverage lands with `ui-057`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
