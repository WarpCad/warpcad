---
title: Graduate the rail tile long-press callout and the My parts save pulse into a real-timer e2e spec
category: testing
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-020 drive of ui-084 #2 and #3
depends: []
status: open
---

## Problem

`LibraryRow.spec.js` and `LibraryRail.spec.js` cover the Library rail's long-press (500 ms) and the new-tile pulse (900 ms) with fake
timers only. `FIND-testing-020` drove both with real timers and passed them (numbers below), so they are now worth a standing spec on a
real clock, per `CLAUDE.md` (a hand-driven item that exercises touch and an animation graduates to a `*.e2e.js`).

Measured on 2026-11-14 (Chromium, tablet 820 × 1180, `hasTouch`, trusted CDP touch, production build with e2e hooks):

- **Long-press** (`library-row-primitive.cuboid`): held 300 ms then released: no `library-tile-callout`. Held still: callout `Cube` first seen
  at **522 ms**, 48 × 25 px at (63.5, 134.5), beside the rail. After release it was gone **1539 ms** later (linger 1500 ms). No pop-out and no
  body after the long-press release. A plain drag from the same tile placed a Cube (body count 0 to 1) with no callout; a press held 700 ms
  (callout `Cylinder` up) then dragged placed a second body and dropped the callout when the drag began.
- **Pulse** (My parts, after **Save to library…** named Standoff): `data-pulse="true"` set on the new tile's `li` **105.6 ms** after the Save
  tap; `getAnimations()` on the tile read one animation, `library-tile-pulse`, `running`, `currentTime` 0 to 883 ms over rAF stamps
  16 to 17 ms apart; the attribute was removed at **1005.6 ms** (900 ms after it was set); the tile was inside the rail scroller's box throughout
  and the scroller had moved from scrollTop 0 to 362; the count badge read 1.

## Goal

One spec, app-level at `/`, the tablet projects only (the rail is the tablet tier; the phone has the column and the laptop the labelled rows), on Chromium (trusted
touch) with real timers and no `page.clock`: assert the callout is absent at 300 ms, present between 450 and 900 ms, gone by about 2.2 s after
release; assert the pulse via `getAnimations()` on the new My parts tile (one `library-tile-pulse`, finishing within about 1.1 s) and that the tile
is in view. Reuse `e2e/support/humanInput.js` for the press and drag, and the Save to library flow in `e2e/user-library.e2e.js`. Pick wide
tolerances: these are timer-driven.

## Affected files

- `e2e/library-rail-touch.e2e.js` (new)
- `TODO/VERIFY.md` (`ui-084` #2 and #3 read `OK` with the manual numbers; note the spec once it exists)

## Effort

S.

## Testing

- New spec green on the rotating pair where it applies and on `chromium-tablet`.
- Closed findings re-run: `ui-084` (rail tiles, callout) and `ui-081` (launcher form at 641 to 789 px, which has no long-press).

## Interaction model

Not UI-touching (test only).

## Documentation

- **Page**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
