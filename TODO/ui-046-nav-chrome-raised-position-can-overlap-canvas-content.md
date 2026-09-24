---
title: Raised NavigationChrome (above an open bottom sheet) can overlap wherever a body renders, silently swallowing or redirecting a real touch tap
category: ui
kind: finding
priority: medium
model: sonnet
depends: []
status: open
---

## Problem

Found while diagnosing `TODO/ui-045` (see that file's retirement note and
`TROUBLESHOOTING.md`'s 2026-09-24 entry for the full session). Not the same defect as
`ui-045` — that one's own pointer/raycast code was ruled out — but a real, independently
reproducible one, adjacent to `TODO/done/ui-043`.

`ui-043` already measured and partly fixed `NavigationChrome`'s raised position at phone
width: once a bottom sheet (Inspector or Library) is open, `--viewport-bottom-inset`
pushes the chrome up to sit just above it, occupying (per `ui-043`'s own numbers,
reproduced bit-for-bit here) roughly `x: 8-202, y: 207-407` at the 390×844 reference
viewport. `ui-043` fixed that band overlapping the **Operations toolbar**. It did not
address the same band overlapping the **canvas** — specifically, wherever a placed body
happens to render on screen.

Reproduced directly: drop a Cube at `fx=0.28, fy=0.42` (a body position several existing
specs in `e2e/selection-inspector.e2e.js` already use) and a Cylinder elsewhere. Select
the Cylinder (auto-selected by the drop), which opens the Inspector sheet and raises
NavigationChrome into the band above. A **real, trusted** tap
(`page.touchscreen.tap`) aimed at the Cube's on-screen position now lands on
`nav-step-right` instead — confirmed by a capture-phase `window` listener logging
`event.target`'s `data-testid`. Because that button moves the camera
(`orbit.orbit(ORBIT_STEP_DEG, 0)`), the tap silently orbits the scene instead of doing
nothing — and every *subsequent* tap computed for the body's pre-orbit screen position
then also misses, for the entirely separate, correct reason that the camera moved. No
error, no visible sign anything happened beyond a few degrees of orbit a user is unlikely
to notice as anything but a slightly odd camera nudge.

**Every existing spec's `clickViewportAt`/`dragRowIntoViewport` helpers dispatch
`PointerEvent`s directly on the canvas *node*** (`canvas.dispatchEvent(...)`), which
invokes the canvas's own listeners regardless of what visually and positionally
overlaps it — so none of them can ever catch this. Only a real, coordinate-based tap
(`page.touchscreen.tap`, or a real mouse click at a page coordinate) goes through actual
browser hit-testing and can be captured by the chrome instead.

## Affected files

- `src/components/viewport/NavigationChrome.vue` — the raised-position CSS
  (`--viewport-bottom-inset`) and its footprint
- `src/components/viewport/Viewport.vue` — nothing wrong here; ruled out during
  `ui-045`'s diagnosis, listed for whoever picks this up so they don't re-walk the same
  ground
- `e2e/selection-inspector.e2e.js` — a new spec, or an extension of `ui-045`'s new
  trusted-touch test, that deliberately drops a body inside the raised-chrome band and
  asserts it stays selectable by real touch, or that the drop itself is nudged clear of
  the band

## Proposed fix

Not designed here — needs a real decision, not just a patch:

- **Option A**: shrink or reflow NavigationChrome's raised footprint so it never exceeds
  a small, fixed band near the very bottom-left corner, regardless of what sheet is open
  (may require reworking the D-pad/zoom/mode-toggle layout, not just CSS numbers).
- **Option B**: keep the current chrome, but constrain *where a body can be dropped or
  end up* so it never renders under a raised-chrome band — awkward, since the user
  drives the camera and drop point freely.
- **Option C**: make dropped-content vs. chrome overlap a non-issue by having chrome
  buttons that would otherwise silently consume a tap intended for a body underneath
  give some feedback distinguishing "you pressed Orbit" from "you selected nothing" —
  doesn't remove the hazard but makes it visible rather than silent.

Whichever direction, re-measure `NavigationChrome`'s raised bounding box the way
`ui-043` did, and re-drive `TODO/ACCEPTANCE.md` scenario 1 (touch, phone width, a body
dropped in the lower-left quadrant) once resolved.

## Effort

**M.** Needs a real layout decision (see Proposed fix), not just a numbers tweak.

## Testing

- A real-app `*.e2e.js` spec using `page.touchscreen.tap` (trusted touch) at
  `webkit-phone`, `chromium-phone` — the two engines that reproduced this — dropping a
  body inside the raised-chrome band and confirming a real tap still selects it (or that
  the drop lands clear of the band by design, whichever fix direction is chosen).
- `TODO/ACCEPTANCE.md`: scenario 1 (touch, phone width) and scenario 7 (touch-only
  navigation, since this touches `NavigationChrome` directly).
- Closed-finding re-run: `TODO/done/ui-043-phone-toolbar-chrome-overlap.md`'s own repro
  steps, since this task edits the same component `ui-043` fixed a different overlap in.
