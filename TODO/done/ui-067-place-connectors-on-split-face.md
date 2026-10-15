---
title: Place connectors on the split cut face by hand
category: ui
kind: feature
priority: medium
model: sonnet
depends: [core-059]
status: done
---

> **What shipped.** Everything in the Goal, with these deliberate shapes. The overlay is a face
> preview computed **off the main thread**: a new `splitFace` job on the evaluation worker
> (`previewSplitFace` in `src/core/kernel/split.js`) returns the clearance-field grid, the joint the
> automatic search would place, and a verdict per placement, all through `core-059`'s own
> `placedJoint` — one check, three callers (search, Apply, the overlay). A drag asks that job live (its own
> channel, so a newer drag supersedes an older one) and, on release, commits only if the kernel agrees;
> otherwise the marker goes back and the notice carries `core-059`'s refusal by number, kind and position.
> A screw boss whose bore would leave piece A before its far face is refused with that exact reason,
> not clipped, and there is no side-access counterbore (decided in `core-059`). Markers use the plane's
> own affine map at its centre (`render/cutPlane.js`, `faceToScreen`/`screenToFace`), the same
> approximation the offset drag already used, and need the face seen with its axes at least 0.2 apart
> on screen (`faceViewIsUsable`); edge-on, the sheet says to turn the view. The picker is a radio row
> of Post / Wedge / Screw boss; a seeded tongue stays a marker but is not offered. At phone width the
> Split sheet is now capped at 42 dvh and scrolls with Apply pinned, because the toggle, picker and hint
> would otherwise have buried the markers (the `io-007` finding, caught by this task's own e2e on
> WebKit). The Split sheet covers the orientation gizmo at tablet width: snap the view first.

## Goal

Split (`TODO/io-007`, `SplitSheet.vue`) auto-places its own joint today — the clearance-field
search in `joint.pins.js`/`joint.tongueGroove.js` decides where the pins or tongue go, and the
person never sees a location or chooses one. Building on `core-059`'s manual `placements`
param, add a way to see the cut face, move the connectors the search already found, drop new
ones, and switch an individual connector's kind (round post, wedge/key, screw boss) before
applying the split.

"Done" looks like: opening Split and turning on **Place connectors** shows the cut face's
clearance field as a translucent overlay on the existing cut-plane SVG (clear where a
connector fits, dimmed/red where it doesn't) with the auto-found placements rendered as
draggable markers; dragging a marker re-validates its new position live against
`core-059`'s containment check and snaps back with a one-line reason if it doesn't fit; a
small kind picker alongside the overlay adds a new marker of the chosen kind at a tap/click
position, and a delete control removes a selected one. Turning the toggle back off reverts to
today's fully automatic behavior.

## Interaction model

- **Precondition**: same as Split itself — exactly one body selected, the Split sheet already
  open with an axis and offset chosen (a joint only makes sense once the cut face exists).
- **Trigger**: a new **Place connectors** toggle in the Split sheet
  (`data-testid="split-manual-joints"`). Off (default): today's joint-type dropdown, auto-
  placed, unchanged. On: the dropdown is replaced by a kind picker
  (`data-testid="split-connector-kind"`, options Post / Wedge / Screw boss) plus the cut-plane
  overlay becomes interactive — tap/click on it drops a marker of the picked kind; dragging an
  existing marker moves it; a delete affordance (× on a selected marker, or long-press/
  right-click) removes it.
- **Feedback**: markers render on the existing cut-plane SVG overlay (the same mechanism as
  today's offset-drag handle) as small per-kind glyphs (disc for post, diamond for wedge,
  ring for screw boss). An invalid drag position shows red and reverts on release with a
  reason ("too close to the hole edge," mirroring `pinJoint`'s own "no pin fits" wording).
  Apply stays disabled with a reason until at least one placement validates, the same contract
  the sheet already has for `sheet.problem`.
- **Selection response**: n/a beyond the existing Split-sheet selection contract (no change to
  what selecting a body shows elsewhere in the Inspector).
- **Selection count**: n/a — unchanged from today's Split precondition (exactly one body).
- **Small-screen behavior**: the kind picker collapses to a horizontal icon row beneath the
  sheet's existing compact two-column grid (the layout `io-007` already built for phone width);
  each marker's hit area is at least 24 px even though its rendered glyph is smaller, matching
  the touch-target fix `io-007` already made for the offset handle.

## Documentation

**Page**: `docs/print-prep.md` (existing — update, no new sidebar entry needed).

**Example**: "Open **Split…**, toggle **Place connectors**, pick **Screw boss**, tap near the
wing root on the cut-plane overlay, then drag the marker 10 mm toward the leading edge — it
turns from dimmed to clear once it's clear of the rib hole — and tap **Apply**."

**Media**: new screenshot `split-sheet-manual-joints.png` and a short movie
`print-prep-manual-joint.gif` (`e2e/docs/print-prep.docs.js`, extending the existing spec),
both embedded in `docs/print-prep.md` next to the existing `split-sheet.png`.

## Affected files

- `src/components/features/SplitSheet.vue` — manual/auto toggle, marker list, kind picker.
- Whichever composable/store backs `SplitSheet.vue`'s `sheet.offsetMm`/`sheet.joint`/etc. state
  (check `SplitSheet.vue`'s script for the composable it imports) — needs the placements array,
  drag/add/remove mutations, and live re-validation against `core-059`'s containment check.
- New inline SVG marker rendering alongside the existing cut-plane overlay code in
  `SplitSheet.vue` (or a small extracted `ConnectorMarker.vue` if the template grows past the
  ~30-line thin-view limit).
- `docs/print-prep.md`, `e2e/docs/print-prep.docs.js`.

## Effort

M.

## Testing

- **Unit**: the sheet-state composable — toggling manual mode on seeds the marker list from
  today's auto-found placements (so switching to manual is "start from what the search found,"
  not "start from nothing"); add/remove/move each updates the `placements` list passed to
  `core-059`'s param; a drag to an invalid position reverts without mutating the committed list.
- **E2E** (`e2e/print-prep.e2e.js`, extending the existing spec, → `/`): open Split, toggle
  Place connectors, drag a marker to a new position, switch its kind, Apply, then assert the
  resulting two pieces carry the connector at the dragged position (a bounds check on the
  exported/evaluated geometry) rather than wherever auto-placement would have put it.
- **Viewports**: all three reference viewports (phone/tablet/laptop) with a snapshot at each —
  this is a new sheet control with its own small-screen layout (the "Small-screen behavior"
  bullet above is not "same as desktop").
- **Browser engines**: all three (Chromium/Firefox/WebKit) — marker drag is pointer/touch-event
  sensitive in exactly the way `io-007`'s own cut-plane handle was (see the closed-finding note
  below), not Chromium-only.
- **Acceptance**: re-drive the print-prep/export acceptance scenario `io-007`'s own Testing
  section names, plus scenario 4 (operation selection-count gating), since this adds a new
  gated toggle to an already-gated sheet.
- **Closed-finding regression**: this extends the exact subsystem two closed `io-007` findings
  were filed against — the cut-plane SVG overlay and its touch handling. Re-run both original
  repro steps against the new marker layer, not only this task's own new assertions: (a) open
  Split at phone width with the Inspector open, confirm the handle (and now the markers) aren't
  buried under the bottom sheet; (b) drag the cut-plane handle with a real touch and let the
  browser send a `pointercancel` mid-drag, confirming neither the offset handle nor a connector
  marker jumps to the corner. Both failure modes were found only by hand-driving a real touch,
  per `io-007`'s own note — a synthetic-event e2e assertion alone would not have caught either.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
