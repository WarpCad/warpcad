---
title: Docs media — Fillet, Chamfer, Enlarge, Fit and Bisect
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007]
status: open
---

## Goal

Shape-modifying operations whose result is a *geometry change on one body*. The reader needs
the before, the popover that takes the numbers, and the after. Embed in
`docs/fillet-chamfer.md` and `docs/resize-bisect.md`.

## Interaction model

n/a — documents existing controls.

## Documentation

- **Page** — `docs/fillet-chamfer.md`, `docs/resize-bisect.md` (update both).
- **Example** — "Select the cube, press **Fillet**, pick the *top* rim, type `3` (mm) into
  the radius, press Commit — the top edges round off."

## Media inventory

Specs: `e2e/docs/fillet-chamfer.docs.js`, `e2e/docs/resize-bisect.docs.js`.

| Name | Kind | Shows | Page |
|---|---|---|---|
| `fillet-popover` | still | Fillet popover: face choice, radius field (`ui-027`). | fillet-chamfer |
| `fillet-operation` | movie | Cube → Fillet top rim, radius 3 → rounded. | fillet-chamfer |
| `chamfer-operation` | movie | Same cube → Chamfer → bevelled. | fillet-chamfer |
| `fillet-vs-chamfer` | still | The two results next to each other, orbited. | fillet-chamfer |
| `fillet-error` | still | The validation message for a radius too large for the body. | fillet-chamfer |
| `resize-enlarge` | movie | Enlarge: type dx/dy/dz → body grows by those mm (`ui-028`). | resize-bisect |
| `resize-fit` | movie | Fit to X/Y/Z with and without keep-aspect. | resize-bisect |
| `resize-snapped-dependents` | movie | Resize a plate; a snapped lug follows (`data-007`). | resize-bisect |
| `bisect-axis` | movie | Bisect along an axis at an offset; the kept half shown. | resize-bisect |
| `bisect-angled` | movie | Angled bisect: tilt the cutting plane with the angle/rotate-axis fields (`ui-036`). | resize-bisect |
| `bisect-popover` | still | Bisect controls: axis, offset, angle, rotate-axis, rotate-offset. | resize-bisect |

## Affected files

- the two specs, the two docs pages, `docs/screenshots/*`, `docs/media/*`.

## Proposed fix

Fillet/chamfer run through the kernel worker and can be slow; wait for worker-idle, not a
fixed timeout, so the GIF never ends on the pre-fillet frame. `io-006` (fillet on hexagon
exports open edges) is an *open* finding — do **not** use a hexagon in these shots, and say
so in the spec's header comment so a future maintainer does not "improve" it.

## Effort

M

## Testing

- Movies assert the post-state: bounding-box change equals the typed delta (within a stated
  tolerance, `toBeCloseTo`) for Enlarge/Fit; fillet changes the mesh's vertex count; the
  bisect movies assert the kept half's bounding box.
- Engines: Chromium only (the fillet/bisect *behaviour* is already covered across all three
  in their own specs). Viewports: laptop.
- `TODO/ACCEPTANCE.md`: none of the fixed scenarios is a fillet/resize scenario; say so in
  the PR. Closed findings: re-run `core-021`/`core-022` (angled bisect, negative-always-min-
  side) repros against the angled movie.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
