---
title: Orientation gizmo's axis-label buttons crowd out the triad they're supposed to annotate
category: ui
kind: finding
priority: medium
model: sonnet
milestone: M1.5
depends: [ui-011]
status: done
---

> **Shipped**: kept `RADIUS` (cap anchor position) untouched — growing it would have
> made caps overflow the mobile 96px dial, which sits at zero margin already at
> `RADIUS = 33`. Instead: (1) the SVG spoke line is now drawn to `RADIUS * 1.42`
> (`SPOKE_SCALE`), independent of the cap's own anchor point, so a short colored tail
> pokes out past each cap's edge; (2) `.gizmo__cap` background went from opaque
> `var(--surface-2)` to a translucent `color-mix(...)`, so the spoke shows through the
> cap sitting on top of it; (3) `.gizmo__cap--negative` was receded further — more
> translucent, dashed border, `opacity: 0.7` — so the six caps stop reading as
> equal-weight and the solid triad dominates. Cap sizes (32px/30px) and the mobile
> `@media` breakpoint were not touched.

## Problem

Direct hands-on use of the running app (screenshot filed 2026-09-06, same session as
`ui-021`-`ui-024`) surfaced a legibility defect in `OrientationGizmo.vue` distinct from
the transform-gizmo findings already filed: at the component's default size the six
circular axis-label buttons (`.gizmo__cap`, `OrientationGizmo.vue:177-191` — 32px
diameter each) visually dominate the 116px-square dial (`.gizmo__dial`,
`OrientationGizmo.vue:150-154`) that the labels are supposed to annotate. The caps sit
directly on top of the spoke endpoints they label (`cap.x`/`cap.y` in the `caps`
computed, `OrientationGizmo.vue:48-65`, both derived from the same `RADIUS = 33` as the
spoke length, `OrientationGizmo.vue:31`), and with a 32px cap width against a 33px
spoke-length radius, opposite-axis caps and the near-center hub end up crowded together
near the middle of the dial. In the filed screenshot the actual orientation cue — the
colored spoke triad converging at `.gizmo__hub` (`OrientationGizmo.vue:95,173-175`),
which is the one thing in this control that changes shape as the camera orbits — is
almost entirely hidden behind the opaque label buttons, leaving only a sliver of the
red/green spoke visible near center. This defeats the control's whole purpose per
`CLAUDE.md`'s viewport rule ("an orientation gizmo ... that shows the current camera
orientation"): a user glancing at it sees six identical-looking circular buttons in a
compass layout, not a triad whose current orientation is legible at a glance. The
`orientationLabel` caption underneath (`OrientationGizmo.vue:70-72,129`,
`gizmo-orientation-label`) gives the numeric azimuth/elevation as a fallback, but
requiring a read of "-45° az · 35° el" to know which way you're facing is not the same
as reading it off the triad the way the control's own docstring
(`OrientationGizmo.vue:1-19`) says it's designed to.

This is a legibility/visual-weight defect in an existing shipped control (`ui-011`), not
a missing capability — the click-to-snap and live re-projection behavior both already
work correctly; only the label buttons' opacity/size relative to the triad they overlay
is wrong.

## Affected files

- `src/components/viewport/OrientationGizmo.vue:150-230` (template `.gizmo__dial` +
  the `<style scoped>` rules for `.gizmo__spoke`, `.gizmo__hub`, `.gizmo__cap`,
  `.gizmo__cap--negative`) — where the crowding originates.

## Proposed fix

Stay within the existing SVG/DOM overlay technology, same constraint `ui-021` states for
the transform gizmo. Options to evaluate (plan, not a patch — pick during
implementation against both themes):

- Shrink `.gizmo__cap` (currently 32px) relative to `RADIUS`/dial size, or grow `RADIUS`
  relative to the caps, so opposite-axis caps and the hub have real separation instead
  of nearly touching at the current 33px-radius/32px-cap ratio.
- Make the negative-axis caps (`.gizmo__cap--negative`) visually recede further than
  today's `var(--surface-1)`/`var(--text-3)` treatment — smaller radius, lower opacity,
  or an outline-only style — so the six caps stop reading as six equal-weight buttons and
  the positive-axis triad (the actual orientation cue) reads as the dominant element.
- Give the caps a translucent or outline fill instead of the current opaque
  `var(--surface-2)`/`var(--surface-1)` so the spoke passing underneath a cap stays at
  least partially visible through it, rather than fully occluded.
- Consider lengthening the visible spoke past the cap's edge (a short colored stub
  poking out beyond each button) so the triad's direction is legible even though the
  cap sits at its tip — cheap and doesn't require shrinking the tap target.

Whichever combination is chosen must not shrink `.gizmo__cap` below the existing
touch-target floor this control already tunes for at phone width (`@media (max-width:
480px)`, `OrientationGizmo.vue:231-252`, `.gizmo__cap` at 30px there) — this is a
visual-weight fix, not license to regress the tap-target sizing `ui-011` established.

## Interaction model

Visual-only change to an existing control — no precondition, trigger, or feedback
*semantics* change, stated explicitly per `CLAUDE.md` rather than omitted.

- **Precondition / Trigger**: unchanged — clicking/tapping a `gizmo-view-<view>` cap
  still snaps the camera to that view; `gizmo-view-home` unchanged.
- **Feedback**: the triad and caps gain better relative visual weight so the current
  orientation reads directly off the dial; the numeric caption
  (`gizmo-orientation-label`) and the underlying snap behavior are unchanged.
- **Placement / Selection response / Selection count**: n/a — this control isn't
  selection-driven.
- **Small-screen behavior**: same as desktop, with the explicit constraint above that
  the phone-width `.gizmo__cap` floor (30px) must not shrink further as a side effect
  of whatever fix is chosen.

## Documentation

- **Page**: `docs/viewport-navigation.md` (or wherever the orientation gizmo is
  currently documented — check `.claude/commands/docs.md`'s sidebar for the exact page
  name at implementation time) — no behavioral change to document, but the
  screenshot(s) of the gizmo will be visually stale once this ships, same as `ui-021`'s
  note for the transform gizmo.
- **Example**: n/a — no new usage steps; screenshot-freshness note only, stated
  explicitly rather than silently skipped.

## Effort

S (< 1hr) — CSS/geometry tuning on constants already in the file (`RADIUS`, `.gizmo__cap`
width, cap colors); no new logic, no new files.

## Testing

Mostly visual — no new numeric logic, and the `caps`/`capsByDepth` projection math is
unchanged. Extend whatever existing e2e coverage already asserts the orientation gizmo
renders and its `gizmo-view-*` buttons are clickable (per `ui-011`) with a snapshot at
the default orientation, rather than adding new numeric assertions — a snapshot diff is
the meaningful check here, same reasoning `ui-021` gives for the transform gizmo.
Runs at all three reference viewports (phone/tablet/laptop), since the phone-width
`@media` block changes the same cap sizing this fix touches. Chromium-only for the
snapshot is acceptable (no WebGL/canvas involvement — this is a DOM/SVG overlay per the
component's own docstring), consistent with `ui-021`'s reasoning for the sibling gizmo.

**`TODO/ACCEPTANCE.md` scenarios this could affect**: none directly — no acceptance
scenario asserts on the orientation gizmo's visual weight, only that clicking a face
snaps the view (already covered by `ui-011`'s own tests, unchanged by this task).

**Closed-finding regression surface**: this extends the same `OrientationGizmo.vue`
component `ui-011` shipped, but `ui-011` was a capability fix (build the control), not a
legibility finding, so there's no prior closed *finding* on this file whose repro steps
need re-running — noted explicitly per `CLAUDE.md`'s rule rather than left unstated.
