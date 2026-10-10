---
title: Print prep — build volume, fit check, split a body into printable pieces with joints, export each piece
category: io
kind: feature
priority: medium
model: opus
milestone: M9
depends: [io-003, ai-007]
status: done
---

> **What actually shipped.** The design landed as written, with these decisions and
> corrections (implementation by the Opus half, verification, docs and the phone fixes by
> the Sonnet half):
>
> 1. **The spec's volume identity had the sign wrong.** Pins and sockets add and remove
>    material: the pieces' volumes sum to *original + pins - sockets* (the socket is cut from
>    one piece, the pin is added to the other, and the pin is smaller than the socket by the
>    clearance). The unit test asserts that, relative tolerance 1e-6.
> 2. **`modify.splitWithJoint` is a whole-group-native op**, so a second split of a group cuts
>    only the part the plane crosses (the new piece takes the next letter, `Wing C`) and
>    refuses a plane that crosses more than one part, by name.
> 3. **Joint helpers are pure geometry** (`recipes/joint.{common,pins,tongueGroove}.js`), not
>    record-expanding composites. Pins are 2-8 mm across; thin sections use tongue and groove;
>    pins on a thin section are refused by name.
> 4. **Record shape follows Bisect**: `axis`, `offsetMm` measured from the body's minimum
>    face, which must lie strictly inside the body; `joint`, `clearanceMm`.
> 5. **A non-watertight body is refused**, at Split and at Print pieces, not silently exported.
> 6. **The fit verdict is per print piece**, over the six axis-aligned orientations
>    (`fits`, `fits turned 90°`, `too large by N mm`).
> 7. **Print pieces uses the Export popover's current Scope** and downloads
>    `<body>-print-pieces.zip` (a stored zip written by `src/core/zip.js`); each piece is laid
>    on its largest flat face and centred on its own origin; "may need supports" is a 45°
>    face-normal heuristic and says so.
> 8. **The fit badge lives in the Inspector** (bounds + verdict), not floating in the viewport.
> 9. **The cut plane is an SVG overlay** re-projected every frame, with a 44 px handle.
> 10. **The Split sheet has no backdrop** (so the viewport stays live for the handle) and is a
>     bottom sheet at 640 px and below.
> 11. **Clearance defaults to 0.2 mm.** The spec said "from the printer's tolerance setting";
>     no such setting exists, so 0.2 mm is a fixed default (see `TODO/VERIFY.md`). "Mirrored into
>     standing instructions" became a per-turn context line plus `check_printability` defaulting
>     to the build volume.
> 12. **The spec's example offset (230 on a 300 mm wing) would not fit a 220 mm bed**, so
>     `docs/print-prep.md` splits at 150.
>
> **Found by hand-driving a real touch at phone width** (the e2e drives the handle with synthetic
> events, which skip hit-testing; see `TROUBLESHOOTING.md` 2026-09-24): (a) the bottom sheet
> and the auto-opened Inspector sheet buried the cut-plane handle, so it could not be touched;
> the Inspector now folds to its tab while Split is open and the sheet is a compact two-column
> grid under half the screen; (b) a real touch drag sent `pointercancel` after a few moves, whose
> position is `0,0`, and `onUp` computed a move from it, throwing the plane to the corner; the
> cancel is now ignored and the svg carries `touch-action: none`. Both have a regression bullet
> in `e2e/print-prep.e2e.js`.
>
> Docs: `docs/print-prep.md`, `e2e/docs/print-prep.docs.js` (`split-sheet.png`,
> `print-pieces-popover.png`, `print-prep-split.gif`). Eighteen existing docs screenshots were
> re-baselined: the Operations toolbar gained **Split**, the Inspector gained a bounds/fit line,
> the Export popover and Project settings dialog gained sections; several of the same images
> also picked up the header's Assistant button, which had not been re-shot since it landed.

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
