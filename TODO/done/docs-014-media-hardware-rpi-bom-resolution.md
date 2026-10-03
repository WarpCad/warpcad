---
title: Docs media — Hardware, kit and Raspberry Pi library parts, Bill of Materials, Resolution (and a missing Hardware docs page)
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007]
status: done
---

> **Shipped (2026-10-03):** all 13 inventory rows, in `e2e/docs/hardware-library.docs.js` (9 tests: 7
> stills, 2 movies), `bill-of-materials.docs.js` (2 tests: 1 still, 1 movie) and `resolution.docs.js`
> (2 tests, both stills), plus six fixtures (`pi-5`, `touch-display`, `screw-family`,
> `small-assembly`, `plate-and-pi`, `one-cylinder`). New page `docs/hardware-library.md` (entry in
> `docs/README.md`, a link from `primitive-placement.md`), and `bill-of-materials.md` and
> `resolution.md` gained their pictures. `src/` is untouched. The Pi shots wait for every body to be
> measured plus 1.5 s, and use `maxDiffPixelRatio` 0.03 (the spec header says why).
>
> **Deviations from this spec, all measured.**
> 1. **There is no Screw row in the Library.** `hardware.screw` has no `ui` block (`registry.js` says
>    so), so the Hardware section is Bolt, Nut, Washer and Bearing. `hardware-screw-family` loads a
>    fixture through File > Open, and the page says screws cannot be dragged in yet.
> 2. **The example's `m10 hex` is already the Bolt's default**, so switching to it changes nothing. The
>    page and the movie use `m12 hex` and 30 mm, and the BOM reads `Bolt M12 hex x 30 mm`. There is no
>    M3 bolt or screw either: the smallest is M4.
> 3. **Subtract with a Pi hole consumes both operands.** The result is one body (the plate, same
>    outline) and the Pi is gone, so the movie asserts body count 1, bounds equal to the plate's and a
>    volume drop of 15 to 35 mm3 (one 3.25 mm hole through 3 mm). The app exposes no vertex count.
>    The page says to place another Pi for each further hole.
> 4. **`rpi-keepout`** is the display's `noGoPower` part (15 x 10 x 1 mm), visible only with Show
>    hidden parts on; the whole display is not a keep-out volume.
> 5. **`resolution-low-vs-high`** is one PNG composed on a throwaway page from two live crops (Draft
>    and Print, each set through the real popover), because the app cannot show two resolutions at
>    once. It is a still, not an orbit.
> 6. The library-section stills spell their names as literals in separate tests, because
>    `docs-media.spec.js` finds pictures by scanning for `shot(..., 'x.png')`.

## Goal

The real-world parts catalogue is WarpCad's differentiator and, today, the least
documented: `docs/` has pages for bill-of-materials and resolution but **no page for the
Hardware, kit-part or Raspberry Pi library sections** — `primitive-placement.md` mentions
Hardware in passing. This task creates that page and illustrates it, plus the BOM and
Resolution pages.

## Interaction model

n/a — documents existing controls.

## Documentation

- **Page** — **new** `docs/hardware-library.md` (needs a `docs/README.md` entry — the
  `docs.md` command's Step 4), plus update `docs/bill-of-materials.md` and
  `docs/resolution.md`.
- **Example** — "Open Library ▸ Hardware, drag **Bolt** into the view, select it, switch
  *Spec* to `m10 hex` and *Length* to 30 mm. Open the Bill of Materials: one M10×30 hex
  bolt is listed."

## Media inventory

Spec: `e2e/docs/hardware-library.docs.js` (and `bill-of-materials.docs.js`,
`resolution.docs.js`). Enumerate the actual rows from the Library at implementation time.

| Name | Kind | Shows | Page |
|---|---|---|---|
| `library-hardware-section` | still | Hardware rows: Bolt, Nut, Washer, Bearing, Screw family (`ui-030`, `core-027`). | hardware-library |
| `library-kit-section` | still | Kit-part rows (`ui-031`/`core-012`). | hardware-library |
| `library-rpi-section` | still | Raspberry Pi and accessory rows (`core-014`–`018`). | hardware-library |
| `hardware-drag-bolt` | movie | Drag a Bolt in, select, change Spec and Length; mesh changes each time (scenario 2). | hardware-library |
| `hardware-bolt-fit` | still | Bolt with its tap-clearance (hidden) part shown (`render-004`). | hardware-library |
| `hardware-screw-family` | still | Several screw heads side by side. | hardware-library |
| `rpi-board-placed` | still | A Pi placed, per-part colours (`render-003`/`core-033`). | hardware-library |
| `rpi-mounting-holes` | movie | Drill the board's mounting holes into a plate by Subtract (`core-034`, sub-part operand). | hardware-library |
| `rpi-keepout` | still | The visible no-go keep-out volume of the 7" touch display (`render-005`). | hardware-library |
| `bom-panel` | still | BOM panel listing fasteners and counts for a small assembly (`ui-038`). | bill-of-materials |
| `bom-updates` | movie | Add a second bolt; the BOM count goes 1 → 2. | bill-of-materials |
| `resolution-popover` | still | Resolution popover: design vs export resolution (`core-035`). | resolution |
| `resolution-low-vs-high` | still | A cylinder at low and high resolution, orbited, facets visible vs smooth. | resolution |

## Affected files

- three specs, `docs/hardware-library.md` (new), `docs/bill-of-materials.md`,
  `docs/resolution.md`, `docs/README.md`, `docs/screenshots/*`, `docs/media/*`.

## Proposed fix

Write the new page for a user who wants "an M3 screw", not for a developer — name the
units (mm) wherever a number is typed and the real-world sizes the parts follow. The Pi
shots are the heaviest renders; give them a longer worker-idle wait and a larger
`maxDiffPixelRatio`, justified in a comment.

## Effort

L (new page plus 13 items; split into `a`/`b` files at `/fix-todo` time if the Pi shots
dominate).

## Testing

- Movies assert BOM text / parameter values after each change; the mounting-hole movie
  asserts the plate gained holes (body bounding box unchanged, vertex count up).
- Engines: Chromium only. Viewports: laptop.
- `TODO/ACCEPTANCE.md`: scenarios 2 (hardware property edit), 3 (kit assembly) and 5
  (bolt tap-clearance) — drive by hand after landing. Closed findings: re-run `render-004`
  and `ui-047` (hidden parts) repros.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
