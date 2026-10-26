---
title: Stop the Align and other operation popovers covering the solids they act on
category: ui
kind: finding
priority: medium
model: sonnet
depends: []
status: open
---

## Problem

Reported by the user on 2026-10-26 while testing Align/Snap (screenshot: Cylinder 1 aligned to
Cube 1 at laptop width). **The popover sits over the middle of the viewport, and the two solids
being aligned are not visible at all.** The user can click a position button but cannot see which
way the move goes, which is the whole point of choosing among seven positions per axis.

Why it happens, all in `src/components/viewport/OperationsToolbar.vue`:

- `.ops__popover` is `position: fixed; top: 64px; left: 50%; transform: translateX(-50%)`. That
  is the centre of the viewport, where `ui-082`'s placement and the default camera put new solids.
  The Align variant (`.ops__popover--align`, `ui-086`) is 352 px wide, and at this window size
  about 520 px tall, so it covers most of the scene.
- The popover is **modal**: `.ops__popover-backdrop` (`z-index: 30`, full viewport,
  `background: transparent`) catches every pointer event. Its own comment says it keeps "the scene
  underneath legible while parameters are picked", but legible only helps if the popover is not on
  top of it. With the backdrop up the user cannot orbit, pan or zoom to look at the targets either;
  the first click anywhere outside closes the popover and discards the half-entered choice.
- The position is fixed in CSS. Nothing looks at where the selection is on screen.

The same frame (`.ops__popover`) is shared by Snap/Align, Fillet/Chamfer and Enlarge/Fit/Bisect, so
every one of them has the problem. Align is the worst case: it is the tallest, and the only one
whose operands are two solids the user needs to compare by eye.

## Affected files

- `src/components/viewport/OperationsToolbar.vue` — `.ops__popover`, `.ops__popover-backdrop`,
  `closePopover`, the `<Teleport>` block (about line 1931 and 2162)
- `src/components/viewport/AlignPopover.vue` — the head (`.align-popover__operands`) becomes the
  drag handle
- `src/composables/usePopoverDrag.js` — new, pointer-driven move with viewport clamping
- `src/stores/panelLayout.js` — remembers the dragged position for the session (UI state only)
- `docs/snap-align.md` — a worked example

## Proposed fix

Three changes, in this order. Stop after any of them if the user is satisfied; each stands alone.
Stage 1 is the request. Stages 2 and 3 are the alternatives it left open, and I recommend all three.

1. **Make the popover movable (the user's suggestion).**
   - The head row (the "Aligning **Cylinder 1** to **Cube 1**" line, or the title row in the other
     popovers) is a drag handle: `cursor: grab`, `touch-action: none`, pointer events with
     capture so a fast drag cannot lose the handle. Add a visible grip glyph so it is discoverable,
     and `aria-label="Move this panel"` with arrow keys moving it 16 px (Shift: 64 px) as the
     keyboard path.
   - The offset is clamped so the head can never leave the viewport. Convert once at the
     boundary: a `popoverOffsetPx` in viewport pixels, named as such, never mixed with mm.
   - Keep the position for the session, per popover kind, and reapply it on reopen. Clamp again on
     window resize and orientation change, because a position saved at laptop width can be
     off-screen at phone width. Reset on **double-clicking the grip**.
   - Replace the centring `transform` with explicit `left`/`top` once moved, or the drag offset and
     the transform will fight.
   - No per-frame allocation in the move handler: write `style.transform` or `left`/`top` from a
     reused object and read `getBoundingClientRect` once at drag start, not per event.
2. **Make the popover non-modal while it is open.** Drop the click-catching backdrop for the Align
   popover. Orbit, pan, zoom and the nav chrome keep working underneath; a click on a solid in the
   viewport is the one case to decide (see Open questions). Escape and the toolbar button still
   close it. Keep the backdrop for the popovers whose fields would be disrupted by a selection
   change (Bisect, Fillet) unless the same reasoning holds there; say which in the commit.
   Careful: the backdrop exists because of a real bug (the `onWindowKeydown` comment: a Library
   drag stalling behind a stale backdrop). Removing it must not bring that back, so a Library drag
   started while the popover is open should close the popover as it does now.
3. **Open somewhere that does not cover the selection.** When the popover opens with no saved
   position, project the selected solids' bounding boxes to screen space (`src/render/`, the
   same `worldToScreen` the gizmo uses) and place the popover in the largest free side of the
   viewport (left or right of the box, clamped, not over the nav pad or the orientation gizmo). If
   nothing fits, fall back to today's position. On phone width, where there is no free side,
   dock it as a bottom sheet capped at about 45% of the viewport height so the top half stays on the
   scene, and offer a **Peek** control that fades the sheet to about 15% opacity while held.

Considered and not proposed here, to keep this one task small: a live ghost of the result as the
pointer hovers a position button (worth its own task, `render`-side, and the better answer to
"which way does this go?"); and a Frame-selection button in the popover head (cheap, but the camera
moving under a popover the user is about to read is jarring).

## Interaction model

- **Precondition** — an operation popover is open (Align needs 1 or 2 selected solids; unchanged).
- **Trigger** — dragging the head grip, or focusing the grip and pressing the arrow keys. Moving the
  popover is not an operation, so no selection-count rule applies; it is available whenever the
  popover is.
- **Feedback** — the popover follows the pointer at 1:1 and stays fully on screen. With stage 2 the
  3D view stays live behind it: the camera moves when the user orbits, and the popover does not
  close.
- **Placement** — n/a (no geometry is created).
- **Selection response** — unchanged. Dragging the popover does not alter the selection, the
  inspector, or the gizmo.
- **Selection count** — unchanged from the existing Align/Snap rules.
- **Small-screen behavior** — differs. At phone width the popover is a bottom sheet (stage 3) with
  the Peek control; dragging it is allowed vertically only, so it cannot be dropped off the edge
  with a thumb. The grip is at least 44 px tall.

## Documentation

- **Page** — `docs/snap-align.md` (update): a short "Moving the panel out of the way" section; a
  one-line cross-reference in `docs/resize-bisect.md` and `docs/fillet-chamfer.md` since the same
  frame is shared.
- **Example** — "Select Cube 1 and then Cylinder 1 and tap **Align**. The panel opens beside the two
  solids instead of on top of them. Drag its grip left to uncover the cube, orbit the view to see
  the cylinder's far side, then tap **X · outside −**. The cylinder's + face meets the cube's − face
  and the panel stays open for the next axis."
- **Media** — a new `e2e/docs/align-popover-move.docs.js` shot, `docs/screenshots/align-popover-moved.png`,
  embedded in `docs/snap-align.md`; regenerate with `npm run docs:media`.

## Effort

M. Stage 1 alone is S to M. Stage 3's screen-space placement is the larger piece and has two
reasonable designs (largest free rectangle, or nearest side), so settle it before starting.

## Testing

- **Unit** — `usePopoverDrag.spec.js`: clamping at all four edges, a zero-size and a larger-than-
  viewport popover, re-clamp on resize, keyboard step and Shift step, reset on double-click, no
  movement when the pointer is released outside the window (pointer capture). The free-side
  chooser gets numerical tests with `toBeCloseTo` on its screen-space boxes: a box in a corner,
  a box that spans the viewport, an empty selection, and two coincident boxes.
- **E2E** — extend `e2e/snap-align-operation.e2e.js` (navigates to `/`): select two solids, open
  Align, assert the popover's bounding box does not intersect either solid's projected box, drag
  the grip with a jittery real-mouse path and assert it moved and stayed on screen, then orbit the
  canvas with the popover open (stage 2) and assert it did not close and the camera changed. Runs at
  **all three viewports** (the small-screen behaviour differs) with a snapshot at each, and on
  **all three engines**: it drives pointer capture, canvas picking and `backdrop-filter`, each of
  which has diverged in WebKit before.
- **Acceptance scenarios to re-drive, by hand** — 1 (two independent primitives), 3 (snap-placement
  of a kit assembly) and 4 (boolean gating, which shares the popover frame and the backdrop), and
  Scenario 7's touch-only navigation for the phone Peek control.
- **Closed findings to re-run** — `ui-036` (Bisect's lower controls reaching Commit at 390 px under
  the Inspector sheet: the reason the backdrop is above the sheets), `ui-033`'s deferred-dialog
  behaviour (`overlays.setOpen('ops-popover', …)` must still fire when the popover is non-modal),
  and the stale-backdrop Library-drag bug described on `onWindowKeydown`.

## Open questions

- With stage 2, should a click on a solid in the viewport while Align is open **change the target**
  (handy, since the Target select already lists "Second selected") or be ignored? Recommend:
  ignored while open; the popover names its operands and silently re-targeting is the sort of
  surprise `SECOND-ATTEMPT.md` warns about.
- Should the dragged position persist across reloads, or the session only? Recommend session only;
  a stale position is more often wrong than right.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
