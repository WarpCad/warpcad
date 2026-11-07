---
title: Drive the VERIFY.md look-and-legibility rows on this Mac's real GPU and screen, with measurements
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage (third pass)
depends: []
status: open
---

## Problem

These `TODO/VERIFY.md` rows were held back for "a real GPU", "a real monitor" or "a real screen". That
phrase was written while every drive ran in a headless software renderer. This Mac has a real GPU and a
Retina screen. Playwright can drive headed Google Chrome (`channel: 'chrome'`) on it, and `testing-026`
sets up desktop Safari. Most of the rows also reduce to something measurable: contrast ratio, colour
difference (ΔE), projected pixel size, label overlap, or frame-to-frame flicker. That leaves a much smaller
taste judgment, which a fresh agent can make from the screenshots.

Settling rule: a row is `OK` or `Issue` when the measurement answers it (state the threshold used, e.g. WCAG
3:1 for non-text UI, ΔE ≥ 10 for "recognisably different"). When only taste is left, use the
`testing-029` two-agent rule. Partial rows move only the Mac-screen part. Phone brightness, sunlight and
iPad GPU halves stay in VERIFY.md.

Rows (entry and row number in `TODO/VERIFY.md`; abridged, the full text is in VERIFY.md):

| Row | Check |
|---|---|
| `ui-049 #1` | On a real monitor, in both dark and light themes, hover a row for an unselected light-blue body, a selected (amber) body and a red-recoloured body. Does the violet hover tint read clearly as "this one" without looking like a… |
| `ui-037 #2` | Dark mode (OS set to dark): select a recoloured body. Is its own colour still recognisable under the selection tint (`OVERRIDE_HIGHLIGHT_INTENSITY` 0.2, lowered from 0.35 during the drive because red read orange), and is it… |
| `ui-048 #1` | On a Raspberry Pi at laptop width (gizmo near its cap), do the ring chevrons (~22-29 px) read as secondary to the new 13-16 px arrow cones, or do they now compete with them? The TODO said to leave the chevrons unchanged; if… |
| `ui-023 #1` | Tip a cylinder over about 60° and look at it on a phone (390×844). At laptop width the three lines are clearly readable, but they now run diagonally *through* the gizmo's rotate rings rather than sitting square around the… |
| `ui-023 #2` | While there: two of the three labels can end up close together when a rotation lines two local axes up on nearly the same screen direction (the degenerate case covered numerically in `annotate.spec.js`). The maths is right and… |
| `ui-011 #1` | Dimension-label collisions at phone width. The three labels are placed at each dimension line's midpoint, pushed outward from the solid's screen centre (`updateDimensionAnnotation` in `src/render/annotate.js`). That keeps them… |
| `ui-022 #1` | At phone width (390×844), with the ring at or near `GIZMO_RING_FLOOR_PX` (40px) — confirm the two chevrons per ring are still individually distinguishable as arrows, not a single blob, at a real fingertip's viewing distance. |
| `ui-022 #2` | On a heavily edge-on ring (camera looking nearly along that axis, e.g. after a standard-view snap) — confirm the chevron near the ring's collapsed end doesn't visually merge into the ring's own line. |
| `core-034 #1` | Zoom onto a dropped Pi 5 from above: do the four mounting holes and two fan holes read clearly through the translucent green board, without z-fighting at the rims? |
| `render-003 #1` | On a real GPU (not this sandbox's headless renderer): drop a Raspberry Pi board and orbit close around where its translucent `mb`/`board` part overlaps an opaque part on top of it (a USB stack, the GPIO header). Does the… |
| `render-003 #2` | Same device: drop two Raspberry Pi boards close enough that their translucent parts overlap each other (not just an opaque part). This project has never needed two *overlapping* translucent surfaces before this task — confirm… |
| `ui-016 #1` | When `hardware.*` / `kit.*` get Library rows (M2), place a Bolt and an Anchor, orbit right around each one, and look for a seam or flickering surface where `tap` meets `head`/`thread` and where `hole` meets `post` — at all… |
| `ui-089 #2` | The eye-slash on a hidden part row is readable next to the dimmed name, on the phone Inspector sheet at 390 px |
| `ui-065 #3` | Ruler legibility in light and dark themes: tick density, the `+5` labels, readout contrast. |
| `ui-064 #2` | Dial legibility in light and dark themes: tick density on a small ring, the `0/90/180/270` labels, and the readout pill contrast (`--surface-glass`). |
| `ui-029 #1` | A body carrying a Fillet/Chamfer has its Parameters fields frozen, with a note naming the op. The note is legible and correct at all three reference widths (checked). What is *not* settled: whether a frozen field looks frozen… |
| `core-060 #2` | `docs/screenshots/hardware-screw-family.png` still shows the last-dropped screw's gizmo and highlight, and the six screws are small. Judge whether it reads as "six types side by side" |
| `ui-084 #5` | The new Cube, Sketch, board, phone and gear swatches also show in the labelled laptop column: look at them next to the existing ones |
| `sketch-003 #5` | Feel, light and dark mode: is the photo readable under the grid at the default 50 % opacity, and is the *Not to scale* / *1 px = 0.2 mm* badge under its bottom-left corner noticeable without hiding the photo? |
| `sketch-001 #10` | Feel: the translucent extrusion preview behind the strokes — readable in both light and dark mode? Is the dashed Hole / amber open outline distinction obvious at a glance? |
| `render-002 #1` | Is the default label (`Label`, size 10, stroke 1.5, height 2) legible and pleasant to click-select at default zoom — thin strokes are easy to miss with a click; does picking a label feel fiddly? |
| `ui-055 #2` | Judge whether the 96 px thumbnail (flat-shaded, fixed three-quarter view) reads well enough at row size for a thin part such as a plate or a ring. |
| `core-024 #3` | Confirm a placed composite still reads as one solid object rather than visibly separate pieces, at ordinary working zoom on a real device — the question the pixel diff answers only for one GPU |
| `ui-042 #2` | With a body enclosed in another (open a project that has one), select the enclosed body from the list: is the teal/amber x-ray tint legible at phone size in both the dark and light themes, and does it read as "hidden body,… |
| `ui-030 #1` | At the default zoom on a real screen, are a placed Nut and Washer big enough to see and to click, or should the Hardware rows' default specs be larger (or the camera frame what was just dropped)? |
| `core-016 #3` | Both screens are large parts (193×111 mm and 143×91 mm) next to a 85×56 mm board. Eyeball on a real phone and tablet whether a freshly placed screen frames sensibly at the default camera distance, or whether it arrives… |
| `ui-020 #2` (part) | On the same hardware, judge whether the drawn stroke reads clearly against the grid in both colour schemes — the line is `--sketch-stroke` (a bright cyan) and the grid's major lines are close in weight. A stroke that… |
| `ui-013 #2` (part) | Look at the magenta guides on a real screen against the dark grid, at an angle and in daylight. They were chosen (over `--accent`) on a desktop screenshot, where they read clearly; a phone at low brightness is the case that… |
| `ui-021 #1` (part) | At the gizmo's floor size (58px arm / 40px ring, `ui-017`'s minimum — the size most selections actually render at on an average-sized part) the gradient's highlight band is only a few pixels wide. Screenshots taken during this… |
| `ui-021 #2` (part) | The double-stroke ring "tube" cue (a dim gradient band plus a thin bright core, both drawn from the same points) is the subtlest of the three techniques used here — worth a specific glance on a real device to confirm it… |
| `core-024 #1` (part) | Place an Anchor (Kit Parts) on a real phone/tablet, zoom in hard, and orbit slowly around the join between its `post` and its `hole` — looking for a flickering or shimmering seam where the two share a face, which is what a… |
| `core-024 #2` (part) | Same, for a Bolt, at the base of the head where `head` and `tap` share the `z = 0` plane — the one coincident surface in that recipe, normally face-down on the grid and so usually hidden |
| `core-033 #2` (part) | On a real phone and tablet (not headless), drop a `raspberrypi.bplus` (any model) and a `raspberrypi.cameraModule`, and confirm the newly-visible per-part colours (lightgray jacks, orange ethernet, gray GPIO, gold camera… |
| `core-015 #1` (part) | Render each of the five models and eyeball them against the real cameras (or V1's own `test/images/create a camera v*.snap.png`): do the sensor, lens barrel, ribbon and mount read as the right parts in the right places to… |
| `core-014 #1` (part) | Render a `raspberrypi.bplus` at each model and eyeball it against a real board (or V1's own `test/images/create a bplus.snap.png`): do the connectors read as the right parts in the right places to someone who knows the… |
| `ui-033 #3` (part) | The File-button status dot at real phone size. It is a 14px badge on the button's corner (solid green disc in sync, hollow ring pending, spinning ring pushing, amber `!` paused, red `✕` failed), shape-coded so it does not rely… |
| `io-001 #2` (part) | The chip is a 10px dot at phone width, coloured *and* shaped (grey idle, amber ring saving, green disc saved, red square failed). Is it legible at arm's length, in sunlight and in dark mode, and does the ring/disc/square… |
| `ui-036 #1` (part) | On a real iPhone, open Bisect with a body selected and read the popover over the auto-opened Inspector sheet: is the faint Inspector text ("INSPECTOR", part name) showing through behind the fields distracting enough to want a… |
| `core-035 #2` (part) | On a real iPhone and iPad, open File ▾ → Resolution…, step Draft → Normal → Fine → Print on a scene with a large cylinder and a sphere. The re-facet should be visibly different at each step, and Draft should not look broken.… |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes, with the numbers and a screenshot path)
- `TODO/FIND-testing-015-webgl-depth-and-translucency-specs.md` (note which of its rows the real-GPU look now covers)

## Proposed fix

1. Serve the production build. Drive headed Chrome on this Mac's GPU. For the WebKit-sensitive rows
   (`ui-016` #1, `core-034` #1), also use desktop Safari once `testing-026`'s session starts.
2. For motion rows (z-fight, flicker, blend order: `render-003`, `core-024`, `ui-016`), orbit in small fixed
   steps and capture a frame per step. A pixel region that changes between nearly identical frames is
   flicker. Report the count and the worst region.
3. For legibility rows, sample foreground and background pixels in both colour schemes and compute
   contrast and ΔE. For size rows (`ui-030` #1, `core-016` #3, label overlap), compute projected boxes.
4. `core-015` #1 and `core-014` #1: compare renders with V1's `test/images/*.snap.png` if V1's repository
   is on this Mac. If it isn't, say so and leave the row `Open`. The hardware-knowledge half stays either way.
5. Record numbers and screenshot paths. A defect becomes its own finding.

## Effort

M–L.

## Testing

- No code change expected; `npm run spdx` passes.
- Engines: Chromium on the real GPU (headed); desktop Safari where named; viewports per row (phone rows emulated at 390×844 on the real GPU).
- Acceptance scenarios: 13 (Recolor a placed body) through `ui-037` #2; 5 (Hidden-part boolean) through `ui-016` #1.
- Closed-finding regression: `render-003`'s translucency rows; coordinate with `testing-015` so the two don't duplicate work.

## Interaction model

Not UI-touching (verification only).

## Documentation

- **Page**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
