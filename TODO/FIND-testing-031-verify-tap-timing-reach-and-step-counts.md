---
title: Measure the VERIFY.md tap-accuracy, timing, reach and step-count rows in emulation
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage (third pass)
depends: []
status: open
---

## Problem

Many "on a real phone" rows in `TODO/VERIFY.md` hide a measurable question under the feel one. Will a
fingertip hit the intended cap or button? Is a tap swallowed? Does a footer hide a control? How many taps
does a flow take? Does an Undo burst stall? Those can be measured. Simulate fingertip taps as touch
events whose positions scatter (σ ≈ 3-4 mm, about 11-15 CSS px, around the aimed point), time with real
timers, measure reachable boxes, and stand in for a phone CPU with Chromium's 4-6x CPU throttle. This
does not replace the real-thumb judgment. It answers the "is it physically possible and how often does it
miss" half, which is most of what those rows record.

Settling rule: a fully moved row is `OK` or `Issue` on its measurement (state the threshold, e.g. ≤ 2 %
mis-hit, ≤ 1 frame stall, a control fully outside any overlay). For a partial row, add the numbers to
Notes and leave the row `Open` for the real-device half.

Rows (entry and row number in `TODO/VERIFY.md`; abridged, the full text is in VERIFY.md):

| Row | Check |
|---|---|
| `render-001 #2` | Orientation-triad cap tap targets. The six axis caps are 32px (30px at phone width) rather than the 44px used for the navigation chrome — six 44px targets will not fit a 116px dial without overlapping. The e2e matrix proves… |
| `sketch-006 #1` | On a real phone, draw a triangle with four slow taps (the fourth on the first point). A tap within about half a second of a closing tap is swallowed (so a double-tap close does not start a new line): confirm a normal-speed… |
| `sketch-007 #3` | On a laptop, hold Shift mid-drag and release it: the point jumps between free and snapped with no pointer movement. Does that read as intended or as jitter? |
| `ui-066 #1` | With a real mouse, drag a ring at an ordinary pace and then creep: does the readout feel steady in the `1°` band, or does the jump between `1°` and `0.1°` at the slow edge read as twitchy? |
| `ui-065 #1` | With a mouse, drag an arm at a normal pace: does the speed step feel predictable, or does the value jump in coarse steps you did not ask for? Consider whether the rings should match (ui-065 Open question a). |
| `core-004 #1` | Drag one rotate ring slowly through more than half a turn on a laptop and watch the Rotation fields. Does the sign flip read as the app losing track, or as an obviously-equivalent way of saying the same angle? If the former,… |
| `ui-063 #1` | On a phone (390x844), is the Align then Snap flow with `hole1` then `mb` still quick, given the Objects section collapses on a row tap? |
| `ui-051 #2` | On a real iPhone or iPad: does the pinned footer covering the bottom ~67 px of the sheet ever hide something you needed (for example the Pi's Show hidden parts toggle before you scroll)? |
| `ui-038 #1` | At 390px with several part types placed, does the BOM section push the Inspector's selected-body detail too far down the sheet? (It sits above the breadcrumb and is open by default.) |
| `ui-067 #3` | Marker positions use the plane's affine map at its centre, so under strong perspective (a close camera, an oblique view) a marker can sit a few pixels off the drawn plane's corner geometry. Judge at an oblique view on a phone… |
| `ui-048 #2` | On a real iPad, select a Pi near the middle of the view. At tablet width the viewport column is ~390 px, so a capped gizmo (arm 198 px) can put the X/Y cones under the Inspector column. Is that a real usability problem? The… |
| `ui-050 #3` | On a real tablet (iPad), with the Inspector as a persistent side column rather than a sheet, confirm the Align to origin row doesn't visually crowd Position/Rotation/Size above it — the column is narrower than laptop width but… |
| `ui-024 #2` | Confirm the Select button itself is comfortably tappable at phone width next to the existing Orbit/Pan buttons — the chrome row grew by one button for this task, and only a bounding-box assertion (`>=36px`) checked size in… |
| `data-007 #1` | On a real phone, shrink a filleted cube's Size X below twice the fillet radius: is the "Fillet on Cube 1 (step 2) would no longer build at this size" line under the boxes readable without scrolling, and does the box repaint… |
| `ui-055 #3` | On iPad, open the ⋯ menu on the bottom-most My parts row: popover position and tap size. |
| `io-007 #2` | Both halves of a tongue-and-groove split are flagged "may need supports" in the Export popover (the tongue's underside is a downward face). Slice one and judge whether that flag is noise or real. |
| `ui-020 #1` (part) | On a real phone and iPad, draw several lines in a row with a fingertip. Is the 14px pick tolerance (`SKETCH_PICK_TOLERANCE_PX`) enough to reliably *select* a thin line by tapping it, and are the 11px endpoint handles grabbable… |
| `core-004 #2` (part) | Same drag on the phone (390×844), where the fields are in a bottom sheet and a thumb is over part of the viewport, so there is less peripheral context for what the number is doing. |
| `ui-094 #1` (part) | On an iPhone, name all 29 parts of `esp8266 feather.3mf` (tap the row, tap the name, type, Done). Count the gestures per part and the minutes in total; say whether a batch-naming table is worth filing |
| `ui-069 #3` (part) | On a laptop the panel floats over the lower middle of the 3D view, so a first-drop point there lands on the panel. Does that cost anything in real use (you have to drop the bolt in the upper half)? On a real iPad, does the… |
| `ui-075 #1` (part) | On a real iPhone (Safari), the header's Live MCP button ring/dot is legible and a tap does not hit Redo/File beside it (gaps are 4 px) |
| `ui-072 #1` (part) | On a real phone, open the Library and drop two parts in a row: is the visible canvas strip tall enough to aim at without the toolbar or nav chrome getting in the way, and is it clear which row to scroll for (a row below the… |
| `core-031 #3` (part) | On a phone, on a document of 20+ bodies (Open `bench/`'s 24-body scene or build one): tap a History row, then Edit or Suppress it. Does the row action now feel instant, with no stall between the tap and the viewport updating? |
| `core-030 #1` (part) | On a real iPhone and iPad: drop about 12 Raspberry Pis and 12 Bolts, then tap Undo ten times as fast as you can, then Redo ten times. Every tap lands with no visible stall, and the scene ends exactly where it started. Before… |
| `core-030 #2` (part) | Same device, the same heavy scene: make about 60 small edits (move, param edit, place), then Undo all the way back. The first 50 Undos should feel instant. The ones past 50 re-fold and may pause briefly, which is expected.… |
| `core-029 #1` (part) | On a real iPhone (Safari), drop a Raspberry Pi and then a Bolt. Tap empty space and open the Inspector's Objects (2) tab (the Objects list, since `ui-049`): both rows show a size, and the scene responds while they land (no… |
| `core-029 #2` (part) | On a real iPad, with ~10 Raspberry Pi boards placed (drag them in), drag one more Cube in and then press Undo. The drag-place should feel instant; Undo will still pause briefly (that is `core-030`, expected). Note roughly how… |
| `core-035 #3` (part) | On a real phone, with a busy scene (a few Pi boards and bolts), change the design resolution to Print. It re-folds on the main thread (76 ms median on 24 bodies on an M4 Pro; a phone is several times slower). Judge whether the… |
| `core-032 #1` (part) | On a real iPhone/iPad, open a large project (200-record fillet fixture): the File button's spinner keeps turning and the chip reads `Opening <name>…` before the pause |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes, with the measurement and method)
- `bench/` (a small reusable tap-scatter helper, if it is worth keeping; otherwise scratchpad only)

## Proposed fix

1. Serve the production build. Use Chromium with touch emulation at the row's viewport, and WebKit for the
   WebKit-sensitive rows.
2. Tap accuracy (`render-001` #2, `ui-024` #2, `ui-075` #1, `ui-020` #1): 200 scattered taps per target.
   Report the hit rate on the intended control and what the misses landed on.
3. Timing (`sketch-006` #1, `sketch-007` #3, `ui-066` #1, `ui-065` #1, `core-004`): drive pointer
   sequences at three speeds, log the readout per frame, and report band switches per second and any
   sign flips.
4. Reach and occlusion (`ui-051` #2, `ui-038` #1, `ui-048` #2, `ui-050` #3, `data-007` #1, `ui-055` #3,
   `ui-072` #1, `ui-069` #3, `ui-067` #3): list every control or row that an overlay covers, with boxes.
5. Load (`core-029`, `core-030`, `core-031` #3, `core-032` #1, `core-035` #3): 4x and 6x CPU throttle,
   report per-tap input-to-paint time and long tasks.
6. Step counts (`ui-063` #1, `ui-094` #1): count the taps and gestures per flow (for `ui-094` #1, on a
   copy of `~/Downloads/esp8266 feather.3mf`, per part).
7. `io-007` #2: slice both tongue-and-groove halves with `CuraEngine` (see `testing-023`) with supports on
   and off, and report whether the support volume is non-zero.

## Effort

L.

## Testing

- No code change expected; `npm run spdx` passes. If a tap-scatter helper is kept, it gets its own unit spec.
- Engines: Chromium (touch emulation, CPU throttle); WebKit for picking-sensitive rows. Viewports: per row.
- Acceptance scenarios: 7 (Touch-only viewport navigation) through the triad-cap and Select-button rows.
- Closed-finding regression: `core-030`'s Undo-stall measurement and `core-029`'s drop floor are re-measured here.

## Interaction model

Not UI-touching (verification only).

## Documentation

- **Page**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
