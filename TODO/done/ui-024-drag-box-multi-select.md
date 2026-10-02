---
title: Drag a selection box (marquee) in the viewport to multi-select bodies
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M1.5
depends: [ui-011]
status: done
---

> **Note on what actually shipped**: this file's own "Recommend: plain left-drag on
> empty space starts a marquee" was **not** implemented as written — it would have
> silently broken the plain-left-drag-orbits default `e2e/viewport-scaffold.e2e.js`'s
> own regression suite depends on. Implemented instead: **Ctrl (or Cmd) held + drag from
> empty space** for desktop, plus a third `'select'` mode on the existing Orbit/Pan
> chrome toggle (`NavigationChrome.vue`, `data-testid="nav-mode-select"`) as the touch
> equivalent this file's own Interaction model section asked for. Additive mode (Shift)
> is desktop-only, exactly as this file's own "or an explicit, stated decision" escape
> hatch allowed — see `docs/decisions/interaction-model-qa.md`'s marquee addendum for
> the full reasoning.

## Goal

Multi-select already exists in its minimal form: `Viewport.vue:839, 851-866`
(`pickAt`'s `additive` parameter) wires Shift/Cmd/Ctrl-click to toggle one body at a
time into the selection, which is what let `ui-011`/`ui-014` reach the "2+ selected"
state their contracts need. What's missing is a **drag-box (marquee/rubber-band)
select**: pointer-down on empty viewport space, drag, and every body whose on-screen
projection falls inside the dragged rectangle gets selected on release — the ordinary
way every desktop 3D/2D tool (and this project's own click-to-select convention)
extends to "select several things at once" without clicking each one individually,
and the only practical way to multi-select on a touch device, where there is no
modifier key to hold at all.

**Done when**: dragging from empty viewport space (not starting on a body or a gizmo
handle) draws a visible selection rectangle that follows the pointer, and releasing
selects every body whose projected screen footprint intersects it — replacing the
current selection normally, adding to it when Shift is held (mouse) or when the drag
began with a second, already-selected finger held down is out of scope for this task —
mirroring the existing Shift-click convention rather than inventing a second one.

## Interaction model

- **Precondition**: nothing required — available whenever the viewport has any bodies
  to select, same as ordinary click-to-select.
- **Trigger**: pointer-down-and-drag starting on empty grid space (not on a body's mesh,
  not on a gizmo handle's hit target, and not satisfying `ui-018`'s existing
  right-drag/Shift-drag-pan gesture — this needs a precedence decision against that
  task's `effectiveDragMode()`/`mouseDragOverride()` logic in `Viewport.vue`, since a
  plain left-drag on empty space is currently unclaimed but Shift+left-drag is already
  claimed for panning). Recommend: **plain left-drag on empty space starts a marquee**;
  Shift+left-drag keeps meaning "pan" per `ui-018`/`ui-019`, so marquee's own
  *additive* mode needs a different modifier — reuse whatever key already means
  "additive" for click (`event.shiftKey || event.metaKey || event.ctrlKey` at
  `Viewport.vue:839`) is already spoken for by pan; pick one (Ctrl/Cmd is free) and
  record the choice in `docs/decisions/interaction-model-qa.md` control 6's area rather
  than deciding it silently mid-implementation.
- **Feedback**: a translucent rectangle overlay follows the pointer while dragging (same
  screen-space SVG/DOM overlay pattern as the gizmo and dimension lines — no second
  overlay technology per `CLAUDE.md`). On release, every enclosed body's selection
  highlight/gizmo/inspector state updates exactly as a click or Shift-click would.
- **Placement**: n/a — a selection gesture, not a creation gesture.
- **Selection response**: identical contract to control 3 (single) / control 6 (2+) once
  the drag completes — 0 enclosed bodies clears the selection (or leaves it unchanged in
  additive mode), 1 enclosed body gives the full single-selection contract, 2+ gives the
  multi-selection contract `ui-011` already built.
- **Selection count**: this is a selection *mechanism*, not a count-gated tool — no
  control here is itself enabled/disabled by count; it produces whatever count the box
  happens to enclose.
- **Small-screen behaviour**: this is touch's primary path to multi-select, since there
  is no modifier key on a touch device — a one-finger drag on empty space must start a
  marquee at phone/tablet width exactly as it does with a mouse, not be dropped in favour
  of "use Shift-click instead" (which doesn't exist on touch). The additive-mode modifier
  chosen above needs its own touch equivalent (e.g. a toggle button in the nav chrome,
  mirroring `ui-019`'s settings popover) or an explicit, stated decision that additive
  marquee is desktop-only for now — don't leave it unstated.

## Documentation

- **Page**: `docs/selection-and-inspector.md` — add a marquee-select section alongside
  the existing click/Shift-click description.
- **Example**: "To select several objects at once, press and drag from empty space in
  the viewport — a selection box follows your pointer; release it, and every object
  inside the box is selected, showing '<n> selected' in the Inspector."

## Affected files

- `src/components/viewport/Viewport.vue` — pointer handlers around `pickAt`
  (`:839, 851-866`) need a drag-vs-click-vs-pan disambiguation branch for "drag started
  on empty space"; new `syncAnnotations()`-style per-frame update for the marquee
  rectangle overlay while active.
- `src/render/annotate.js` — a new, small pure helper for the marquee rectangle's screen
  geometry (normalise start/current pointer into a top-left/width/height rect) and for
  testing whether a body's projected footprint intersects it (reuse `worldToScreen`
  already exported here on the body's `boundsMm` corners — this is exactly the kind of
  framework-free geometry math `CLAUDE.md` says belongs here, not in the component).
- A new small component or inline template block for the rectangle overlay (mirroring
  `Gizmo.vue`'s screen-space SVG pattern) — likely lives in `src/components/viewport/`.
- `src/stores/selection.js` — confirm it already supports "replace with N ids" /
  "add N ids" in one call, or add that if it currently only supports single
  toggle/replace.
- `e2e/selection-inspector.e2e.js` — extend with marquee coverage.

## Proposed fix

See Interaction model above for the gesture/precedence decisions this needs before
implementation starts (drag-mode precedence against `ui-018`'s pan gestures, the
additive-mode modifier, and the touch equivalent). Mechanically: on pointer-down over
empty space, record a drag-start point; on pointer-move, if travel exceeds the existing
`CLICK_SLOP_PX` threshold (matching the click-vs-drag convention already used in
`Gizmo.vue:111` and `Viewport.vue`'s own pan gating), begin rendering the marquee rect
and stop treating the gesture as a potential click; on pointer-up, project every body's
`boundsMm` corners to screen space via `worldToScreen` (already exported from
`annotate.js`), test intersection against the marquee rect, and hand the resulting id
list to the selection store — replacing or adding per the chosen modifier.

## Effort

M (a few hours) — mostly pointer-gesture disambiguation against the existing click/pan
paths, plus a body-vs-rectangle intersection test; no new architecture.

## Testing

`src/render/annotate.spec.js` (or a new `marquee.spec.js` alongside it): unit-test the
rectangle-normalisation and body-intersection helpers with explicit coordinates — a body
fully inside, fully outside, partially overlapping (decide and test: does partial overlap
count as enclosed? recommend yes, matching most CAD/DCC tools' marquee convention, and
state that choice here rather than leaving it implicit), and a degenerate zero-size drag
(a click that never moved, which must fall through to ordinary click-select, not an
empty marquee that clears everything).

**Real app e2e**: extend `e2e/selection-inspector.e2e.js` (navigates to `/`) — place
three primitives spread across the viewport, drag a marquee enclosing two of them, and
assert the Inspector reports "2 selected" and the correct two bodies show selection
feedback. Also assert a marquee drag that starts on empty space but ends over a third,
excluded body does not select that third body. Runs at all three reference viewports
(phone/tablet/laptop) — this is exactly `CLAUDE.md`'s Responsive Layout concern, since
the touch-only marquee path is this task's whole reason for existing at phone/tablet
width, and a keyboard/mouse-only implementation would fail that rule outright. Runs
against all three engines (Chromium/Firefox/WebKit) — the drag/pointer-event handling
and the `worldToScreen` projection it depends on are the same WebGL-adjacent,
touch-event-sensitive path `ui-018`'s pan-gesture work already required all-three-engine
coverage for.

**`TODO/ACCEPTANCE.md` scenarios this could affect**: scenario 1 (click/select
behaviour) — re-drive its click-selects-only-that-item half to confirm marquee's new
empty-space drag handling didn't regress a plain click into starting a marquee instead.
No closed finding exists yet against the selection subsystem to re-check.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
