---
title: Docs media — Fillet, Chamfer, Enlarge, Fit and Bisect
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007]
status: done
---

> **Shipped (2026-10-03):** all 11 inventory rows, in `e2e/docs/fillet-chamfer.docs.js` (5 tests: 3
> stills, 2 movies) and `resize-bisect.docs.js` (6 tests: 1 still, 5 movies), embedded in
> `docs/fillet-chamfer.md` and `docs/resize-bisect.md`, plus one new fixture
> (`plate-and-snapped-lug.ndjson`). `src/` is untouched. No hexagon is used anywhere (`io-006`; the
> fillet spec's header says so).
>
> **How the post-state is asserted.** The fillet and chamfer movies wait for the body's re-measured
> `data-body-volume` to drop (the worker publishes it from the real geometry), never a fixed
> timeout, so no GIF ends on the pre-fillet frame. The app exposes no mesh vertex count, so "the mesh's
> vertex count changes" is checked against the same `filletRim`/`chamferRim` call in Node (8 vertices on a
> 40 mm cube, more after). Enlarge and Fit assert the bounding-box size delta equals the typed delta
> (`toBeCloseTo(.., 1)`, the attribute prints two decimals); the Bisect movies assert the kept half's
> size, centre and `positive`/`negative` name.
>
> **Deviations.** (1) `resize-snapped-dependents` resizes the plate through the Inspector's Size field.
> Enlarge and Fit append a step and a snapped lug does **not** follow them (measured: the lug stayed at
> Z 8 while the plate's top moved to 16). `data-007` only covers the Inspector path. The page now says so;
> whether Enlarge/Fit should follow is logged in `TODO/VERIFY.md`. (2) Fit's Keep aspect ratio is the
> kernel's smallest-ratio fit-inside rule, so the movie shows X 60 to 30 with the other axes following
> (40 to 20), not a plain scale. (3) The page's example already matched the popover (Face dropdown,
> Radius (mm), Fillet); the spec's wording "pick the top rim" became "choose Top (+Z)".

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
