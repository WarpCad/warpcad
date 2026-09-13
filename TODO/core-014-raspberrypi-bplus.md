---
title: "`raspberrypi.bplus` composite recipe — Raspberry Pi board, models 2/3/4/5"
category: core
kind: feature
priority: high
model: opus
milestone: M4
depends: [core-001, core-014a]
status: open
---

## Goal

One composite recipe, `raspberrypi.bplus`, that reproduces `jscad-raspberrypi@62a8e3b`'s
`BPlus(model, options)` (`~/src/jscad/jscad-raspberrypi/src/bplus.js:616-808`) — a
Raspberry Pi board with every connector, LED, and mounting hole, selected by one
`model` param (`2` = B+/A+/Pi 2, `3` = Pi 3, `4` = Pi 4, `5` = Pi 5), mirroring
`hardware.bolt`'s "one factory, a param picks the variant" shape rather than a
draggable row per revision, per `Initial design.md` §6 and this roadmap's own
description of the row.

Per `docs/decisions/composite-recipe-geometry.md`'s **Requirements this places on
`core-014`-`core-018`** section: this recipe needs nothing from that decision — its
~120 `.snap`/`.align`/`.midlineTo` call sites are all self-referential (Family A: `mb`,
or an already-added sibling part built by this same function), never an externally
supplied board. `core-015`-`018` build on `raspberrypi.bplus`'s shape, so getting the
generic per-part expansion pattern right here is what makes those four ports assembly
rather than each re-deriving it.

`core-014a` is `status: done` (`docs/decisions/composite-recipe-geometry.md`) and this
task is the milestone's first real row — everything after it depends on it.

## Interaction model

n/a — lives entirely in `src/core/kernel/`, same as `core-001`/`core-010`/`core-011`/
`core-012` before it. No Library row exists for any `hardware.*`/`kit.*` composite yet
(`src/core/library.js`'s `buildRows` filters to `op.startsWith('primitive.')` — see the
open Hardware Library section gap `core-010`'s retirement note and `ui-013`'s both
already flagged). Feeds a future Hardware/Kit Library section, not this task.

## Documentation

n/a — no control exists yet to place this. Lands with whichever task adds the Hardware
Library section.

## Affected files

- `src/core/kernel/recipes/raspberrypi.bplus.js` (new)
- `src/core/kernel/recipes/raspberrypi.bplus.spec.js` (new)
- `src/core/kernel/tables/rpi-parts.js` (new) — the part-factory dimension table, see
  Proposed fix
- `src/core/kernel/registry.js` (register `'raspberrypi.bplus': composite(0, bplus)`)

Real V1 source, all at `~/src/jscad/jscad-raspberrypi/src/` (commit `62a8e3b`, "Release
5.0.0" — the same commit `docs/decisions/composite-recipe-geometry.md`'s survey cites):
`bplus.js:616-808` (the factory itself, plus its `pi4`/`pi5` model-specific helpers at
`:33-326`/`:335-550`), `rpi-parts.js` (part-body factories: `BPlusMotherboard`,
`EthernetJack`, `UsbJack`, `MicroUsb`, `Hdmi`, `AvJack`, `PSW`, `Ribbon`, `CamDisplay`,
`PCIe`, `Gpio`, `BoardLed`, `MountingHole`), `bplus-mounting.js:14-32` (`holes`),
`boardutils.js:117-126` (`RightSide`).

## Proposed fix

**Mechanism: recipe-internal origin probe, generalised from one part to ~50.**
`kit.anchor.js` already establishes the pattern this needs at small scale (build real
`@jscad/modeling` geometry inside the recipe, measure offsets with `group.js`'s
`calcSnap`/`calcCenterWith`, discard the probes, bake the computed vectors into plain
`primitive.*` + `transform.translate` record pairs — `library.js`'s `restingCenter`
comment and `hardware.bolt.js`'s module doc both describe the same "bake the number,
never emit `group.snap` as a record" rule). `bplus.js` needs the *same* mechanism at
roughly fifty parts instead of two, all measured against `mb` (a `Parts.Board(85, 56,
corner, 1.32)` this recipe builds first, exactly like `kit.board`'s already-shipped
rounded-box pattern) or against a sibling part this same recipe already placed —
confirmed Family A per the decision doc's own survey.

**A generic per-part expansion helper, not fifty hand-copied blocks.** Every V1 call
site reduces to one of three shapes:
1. A single primitive (cube or cylinder) positioned by some combination of `.snap`,
   `.align`, `.midlineTo`, `.translate` against `mb` or a named sibling —
   `hardware.bolt.js`'s `prismRecords` helper (this file's own precedent) is the right
   shape to generalise: build the real probe at the origin, run the same sequence of
   `group.js` measurements V1's chain implies, bake one `transform.translate` vector,
   emit `[primitive.*, transform.translate]`.
2. A small union of two primitives built and combined *before* placement (`usb`'s
   `body`+`flange`, `AvJack`'s `block`+`cylinder`, `PSW`'s `block`+`button`) — emit the
   two primitives, a `boolean.union` record referencing both by id, then place the
   union the same way as case 1.
3. A `.clone()` of an already-placed part translated again (`usb1`/`usb2`, the Pi 5
   `usb1`/`usb2` pair) — since nothing here is parametric per clone, emit each as its
   own independent primitive + translate pair rather than modelling "clone" as a
   document concept; two solids that happen to be the same size are just two records.

`RPiParts.*` (`rpi-parts.js`) are themselves reusable across `core-015`-`018` (`Gpio`,
`MountingHole`, `Mountingpad` in particular are called from `hat.js`, `spacer.js`,
`hyper-pixel-4-rectangular.js`) — port them once as **plain dimension/position
functions in a new `tables/rpi-parts.js`** (not a second `@jscad/modeling`-touching
recipe module), returning the same "primitive op + params" shape `bolt-specs.js` does
for `hardware.bolt`, so later tasks import data, not geometry.

**Model branching**: `model < 4` (B+/A+/Pi2/Pi3) is one shared block with one `if (model
== 3)` LED-position fork (`bplus.js:713-745`); `model == 4` and `model >= 5` are the
`pi4`/`pi5` helper functions. Port as three internal expansion branches keyed on
`params.model` the same way `hardware.bolt`'s `fit` branches on a table lookup, not
three separate registry ops — the roadmap and `Initial design.md` §6 both specify one
factory.

**Scope narrowing to record explicitly**: `bplus.js`'s `dimCheck` group
(`:34,48-73,123-157,173-189` in `pi4`; there is no `pi5`/model<4 equivalent) is a
hidden (`group.add(dimCheck, 'dimCheck', true, ...)`) bundle of coloured rulers used
only to visually verify V1's own dimensions during that library's development — no
functional geometry, nothing else in the group references it, and it renders nothing
by default. **Drop it.** This narrows scope from V1 rather than silently matching it;
record the narrowing in this file's retirement note per this project's established
convention (`ui-026`, `ui-027` both did the same for their own scope calls).

**To verify, not assume** (mirroring `core-012`'s own flagged rotation-sign check):
`RPiParts.AvJack()`/`PSW()` both `rotateX(90)`/`rotateY(90)` a cylinder before
placement — build both signs and compare against V1's rendered orientation (a picture
in `bplus.js`'s own JSDoc `@example` block, or by running the real npm package) rather
than assume the sign, the same caution this project has already needed twice.

## Effort

L — by far the largest recipe in the catalogue (~50 parts across 4 model branches),
but the *mechanism* (generic probe-and-bake expansion, `boolean.union` for
pre-combined sub-assemblies) is a direct generalisation of already-shipped,
already-tested code (`kit.anchor.js`, `hardware.bolt.js`'s `prismRecords`), not new
architecture. Most of the wall-clock cost is expected to be mechanical: one
`primitive.*`+`transform.translate` pair (or `boolean.union` triple) per part, times
~50.

## Testing

Vitest, one `.spec.js`, plain Node — no real V1 execution fixture is wired into this
project (same call as `core-012`'s `BoardFrame`/`Anchor`, since `jscad-utils@3.2.0` is
the only version vendored here and `BPlus` isn't part of the fixture-diffed
`core-001`/`core-010`/`core-011` set either). Geometric-relation assertions per part:
each connector's own bounding box matches its V1 dimensions (size, not raw position,
per `core-010`'s already-established centred-vs-base-at-z=0 diffing convention), each
mounting hole's centre matches `bplus-mounting.js`'s stated `(3.5,3.5)`/`(61.5,3.5)`/
`(3.5,52.5)`/`(61.5,52.5)` offsets from `mb`, and one test per model branch confirming
the right connector set is present (e.g. `usbc`+`hdmi1`+`hdmi2` for model 4,
`fan1hole`+`fan2hole` only for model ≥ 5). Degenerate case: an unknown `model` value
throws by name, matching the registry's `requirePositive`/unknown-spec convention
established by `hardware.bolt`/`hardware.nut`.

No `*.e2e.js` — no UI surface exists yet, stated explicitly per `TODO/README.md`'s
rule, same as `core-001`/`core-012`'s precedent.

Acceptance scenarios: none directly pass/fail on this task alone — this and
`core-015`-`018` together are what would let scenario 3 ("kit assembly placement")
finally use a real RPi-plus-camera pair instead of the Cube/Cylinder stand-in `ui-013`
and `ui-026` both used and flagged. No closed finding's subsystem is extended here in a
way that needs re-running (this is new recipe code, not a change to the fold, the
registry's dispatch, or `document.js`).
