---
title: Shift+left-drag or right-drag pans the viewport, without switching the nav-chrome mode
category: ui
kind: feature
priority: high
model: sonnet
milestone: M1
depends: [render-001]
status: done
---

## Goal

`render-001` shipped orbit-by-default drag with a pan **mode** you switch into via the
`NavigationChrome`'s `Orbit`/`Pan` toggle (`Viewport.vue`'s `dragMode` ref, changed only
by `onMode()`, which only the chrome button calls — confirmed by reading `Viewport.vue`
end to end: no pointer handler currently reads `event.button` or `event.shiftKey` to
decide drag mode). That toggle is the right design for touch, which has no modifier key
and no second mouse button (`TODO/ACCEPTANCE.md` scenario 7 depends on it staying that
way) — but on desktop it means every pan requires a click on the chrome and a click back
to resume orbiting, which is real friction against the conventional desktop-3D-app
expectation of a held modifier or a different mouse button.

**Done when**: on a desktop pointer, holding **Shift while left-dragging**, or dragging
with the **right mouse button** (no modifier needed), pans the camera instead of
orbiting — without touching the `Orbit`/`Pan` chrome toggle, and without changing what
that toggle does for touch or for the on-screen direction pad. A plain left-drag with no
Shift still orbits (or still pans, if the chrome toggle has been explicitly set to
`Pan` — that existing default-mode behavior is unchanged, this is a new *additional*
override on top of it, not a replacement for it).

## Interaction model

- **Precondition**: pointer pressed down inside the 3D viewport canvas.
- **Trigger**: **either** (a) Shift held + left mouse button (button 0) drag, or (b)
  right mouse button (button 2) drag, no modifier needed. Both pan regardless of the
  chrome's current `Orbit`/`Pan` mode setting. A plain left-drag with no Shift held
  keeps following whatever the chrome mode currently says (unchanged).
- **Feedback**: identical to the existing pan feedback — the camera target shifts under
  the drag via the same `orbit.panByPixels()` call the chrome-toggled pan already uses;
  there is exactly one pan code path, this only adds two more ways to reach it.
- **Placement / Selection response**: n/a — camera navigation, not geometry creation or
  selection.
- **Selection count**: n/a.
- **Small-screen behavior**: same as desktop's fallback, i.e. *unchanged* — touch has no
  Shift key and no right mouse button, so touch continues to rely entirely on the
  `NavigationChrome` mode toggle exactly as `TODO/ACCEPTANCE.md` scenario 7 already
  drives and passes. This task adds a desktop-only shortcut on top of the existing
  cross-platform mechanism, not a replacement for it.

**A real conflict to resolve, not a hypothetical one**: `Viewport.vue:754` already reads
`event.shiftKey` on click to mean "additive multi-select"
(`pickAt(x, y, event.shiftKey || event.metaKey || event.ctrlKey)`). Shift+left is
therefore already meaningful on a **click**. The fix is not new — the codebase already
distinguishes a click from a drag by total pointer travel (`CLICK_SLOP_PX`,
`pressTravelPx`, the `isClick` check near the same line) — so a Shift+left press that
*never exceeds the slop threshold* must still fire additive selection on release, and
only a Shift+left press that *does* exceed it should have been panning during the drag.
Decide the drag mode (orbit vs. this task's pan override) using the same travel-based
click/drag distinction already in the pointer-move handler, not a separate one that
could disagree with it.

**A second real gap**: nothing currently prevents the browser's native context menu on
a right-button press/release. Right-drag-to-pan needs the canvas to suppress it (e.g.
`@contextmenu.prevent`) or the browser's menu will pop up the moment the user releases
the right button, on top of (or instead of) the pan just performed.

## Documentation

- **Page**: update `docs/viewport-navigation.md`'s mouse-controls section (currently
  states only "click and drag anywhere in the 3D view to orbit... use the `Orbit`/`Pan`
  toggle... to change what dragging does").
- **Example**: "Hold Shift and drag with the left mouse button, or just drag with the
  right mouse button, to pan the camera without switching the Orbit/Pan toggle. Release
  Shift or the right button and a plain left-drag orbits again, following whatever the
  toggle is currently set to."

## Affected files

- `src/components/viewport/Viewport.vue` (edit — `onPointerDown`/`onPointerMove`/
  `applyDrag` and the `dragMode` decision, plus context-menu suppression on the canvas)
- `e2e/viewport-scaffold.e2e.js` (edit — extends the existing `'mouse drag orbits, and
  pans once the mode is switched'` test at line 288 with the new Shift/right-button
  cases, rather than a wholly new spec, since it already has the `cameraState`/`camera`
  helpers this needs)
- `docs/viewport-navigation.md` (edit)

## Proposed fix

In `Viewport.vue`'s pointer handlers, compute the *effective* drag mode per gesture
(not just read the `dragMode` ref) as: `pan` if `event.button === 2` OR (`button === 0`
AND `event.shiftKey` at press time AND travel has exceeded `CLICK_SLOP_PX`), else fall
back to the existing `dragMode.value`. Capture the triggering button/modifier at
`pointerdown` (mirroring how `pressId`/`pressTravelPx` are already captured there) so a
Shift key released mid-drag doesn't flip the gesture back to orbit halfway through — the
mode for a given gesture should be decided once, at the point travel first exceeds the
slop, and held for the rest of that gesture. Add `@contextmenu.prevent` on the canvas
element (or an equivalent `contextmenu` listener) so a right-drag's release doesn't pop
the browser's menu. Leave the existing shift+click-with-no-drag additive-select path at
line 754 untouched — it already only fires on `isClick`, which this task's slop-based
gating keeps consistent with.

## Effort

S (< 1hr) — reuses the existing camera model and the existing click/drag slop
distinction; no new state machine, just a richer trigger condition on an existing one.

## Testing

Extend `e2e/viewport-scaffold.e2e.js`'s existing mouse-drag test (line 288):
1. Shift+left-drag from a fresh load (chrome mode still `orbit`): assert the camera
   `target` changes and `azimuth`/`elevation` stay close to their starting values (a
   pan, not an orbit) — mirroring the existing test's own assertions for the
   chrome-toggled pan case.
2. Right-button drag, no Shift, chrome mode still `orbit`: same pan assertion.
3. Shift+left-*click* with no meaningful travel (staying under `CLICK_SLOP_PX`) on a
   placed body: assert it still performs additive selection (add a body via drag-place
   first, then Shift-click a second one and assert both remain selected) — the
   regression this task must not introduce.
4. Plain left-drag with no Shift, chrome mode still `orbit`: assert it still orbits
   (unchanged), guarding against the new logic swallowing the default case.

Runs against all three engines (pointer-button/modifier handling and mesh-projection
are WebGL-sensitive, per `CLAUDE.md`'s Browser Support section — right-click handling in
particular is one of the areas most likely to diverge across engines). Viewport-wise,
this is desktop-only input (no Shift key or right button on touch), so laptop viewport
is sufficient; no need for the phone/tablet snapshot matrix since nothing about layout,
panel visibility, or overlay behavior changes.

**`TODO/ACCEPTANCE.md` scenarios this could plausibly affect**: scenario 7 (touch-only
viewport navigation) — re-drive it in full after this change, even though the change is
gated on desktop-only input signals a touch device can't produce, because it touches the
same `dragMode`/pointer-handling code path scenario 7's touch orbit/pan/zoom already
exercises, and `CLAUDE.md`'s Verification section calls out exactly this kind of shared-
subsystem risk. Also re-check scenario 1's clicking/selection half (place two bodies,
click each) since item 3 above touches the same click-vs-drag travel logic scenario 1's
selection clicks depend on. No closed finding exists yet against the camera/pointer
subsystem to re-check.
