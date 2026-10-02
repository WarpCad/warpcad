---
title: Print prep — build volume, fit check, split a body into printable pieces with joints, export each piece
category: io
kind: feature
priority: medium
model: opus
milestone: M9
depends: [io-003, ai-007]
status: open
---

## Goal

"…so I can 3D print it." A model wing is longer than most print beds. "Done": the project
has a **build volume** setting; a body that does not fit can be **split** along a plane into
pieces that each fit, with a matching pin-and-socket (or tongue-and-groove) joint so the
pieces re-assemble; and Export produces one STL per piece, laid flat in a sensible print
orientation. A person can do this by hand; the AI calls the same operations.

## Design

- **Build volume**: `{ widthMm, depthMm, heightMm }` in the project state line, default
  220 × 220 × 250, edited in Project settings (`ai-003`) and mirrored into standing
  instructions by default. A fit check reports per body: fits as-is, fits after rotating
  onto a face, or by how much it does not.
- **Split**: a new `modify.splitWithJoint` op (registry entry, `operandCount: 1`) built from
  the existing `modify.bisect` plus a joint recipe: round pins on one half, matching
  sockets (with a `clearanceMm`, default from the printer's tolerance setting) on the other;
  for thin airfoil sections use a tongue-and-groove rib instead of pins, because a pin does
  not fit in a 3 mm-thick trailing edge. The op returns a **group of two named parts**
  (`Wing A`, `Wing B`) so each stays addressable and the existing group tools apply.
- **Multi-split**: splitting at N planes is N applications — no special case.
- **Orientation**: the exporter lays each piece on its largest flat face (or the face the
  user chose) and writes it at the origin of its own file. A real overhang analysis is out
  of scope; the check says "may need supports" using a face-normal threshold and states it
  is a heuristic.
- **Export**: *Export… → Print pieces* writes a zip of one STL per top-level group part, via
  the existing export worker (`src/core/export.worker.js`) and `exportClient.js`.
  `io-003`'s STL path already handles watertightness; `io-004`/`io-006` are the regression
  surface.

## Interaction model

- **Precondition**: *Split* needs exactly one body selected (a group counts as one).
  *Print pieces* needs at least one body in the scene.
- **Trigger**: **Split…** in the operations toolbar's *Modify* group
  (`data-testid="op-split"`), opening a sheet with axis, offset (draggable plane in the
  viewport *and* a number), joint type and clearance; **Export… → Print pieces**.
- **Feedback**: a translucent cut plane in the viewport moves as the offset changes; the
  result is two named parts in the Inspector; the fit badge on the body turns from red
  "too large by 84 mm" to green "fits"; the export popover lists each file with its size.
- **Selection response**: the Inspector for a body shows its bounds and the fit verdict.
- **Selection count**: Split exactly 1; disabled with a reason tooltip otherwise.
- **Small-screen behavior**: the cut plane has a touch handle (drag) and a numeric field;
  the sheet is a bottom sheet; the zip downloads via the existing mobile-safe path.

## Documentation

New `docs/print-prep.md` (sidebar entry). Example: "Select the wing, tap **Split…**, set
axis **Z**, offset **230**, joint **Tongue and groove**, tap **Apply**. Open **Export… →
Print pieces**: you get `wing-a.stl` and `wing-b.stl`, each flat on its largest face."

## Affected files

- `src/core/kernel/registry.js` (`modify.splitWithJoint`), `src/core/kernel/recipes/joint.*.js`
  (new, composite, in the recipe-kit style), `src/core/export.js`, `exportClient.js`,
  `src/core/project.js` (build volume), `src/components/viewport/OperationsToolbar.vue`,
  new `SplitSheet.vue`, `ExportPopover.vue`, `docs/print-prep.md`.

## Effort

L.

## Testing

- **Unit**: split of a 300 mm bar at 150 mm gives two bodies whose volumes sum to the
  original minus pin volume plus socket volume (tolerance stated); pieces' bounds fit the
  volume; a split plane outside the body is refused by name; a plane through an existing
  hole; zero clearance warns; a non-watertight input is refused, not silently exported.
- **E2E** (`e2e/print-prep.e2e.js` → `/`): the hand recipe above, assert the two STL files
  parse and are each manifold. Three viewports; all three engines (WebGL + file download).
- **Acceptance**: re-drive 11 (export) and 4 (boolean gating — Split joins the count rules);
  closed findings `io-004`, `io-005`, `io-006`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
