---
title: Gizmo handles read as flat 2D lines — give the arms and rings a 3D appearance
category: ui
kind: finding
priority: medium
model: sonnet
milestone: M1.5
depends: [ui-017]
status: done
---

> **Shipped**: per-axis `<linearGradient>` fills on the arms/arrowheads (light tint
> fading to the axis colour), a double-stroke "tube" band + bright core on the rotate
> rings (reusing the existing ring points, no new geometry), and a shared `drop-shadow`
> filter on arm/head/ring/hub. Stayed entirely within `Gizmo.vue`'s template + `<style
> scoped>` — no changes to `src/render/annotate.js` were needed, since the gradients use
> `objectBoundingBox` (the SVG default) rather than per-frame-computed coordinates. The
> lighter gradient stop uses `color-mix(in srgb, ...)`, a first for this repo; verified
> to resolve correctly (not fall back to black) in Chromium, Firefox and WebKit before
> closing.

## Problem

`ui-017` fixed the transform gizmo's *size* — arms and rings now scale to clear the
selected body's silhouette. Direct hands-on use of the running app surfaced a separate,
remaining complaint: the handles are a uniform-width `<line>` with a flat triangular
`<polygon>` arrowhead (`Gizmo.vue:207-233`, `.tgizmo__arm`/`.tgizmo__head`), and the
rotate rings are a uniform-width `<polygon>` outline (`.tgizmo__ring`). At any size, both
read as flat 2D diagrams overlaid on a 3D scene rather than as 3D handles with their own
presence in the view — there is no shading, taper, or highlight suggesting the arm is a
cylindrical rod or the arrowhead a cone, the way a Blender/Fusion/SketchUp-style gizmo
reads unmistakably as a 3D object even though it is also, mechanically, screen-space
chrome. This is a legibility/quality gap in an existing shipped control, not a new
capability.

## Affected files

- `src/components/viewport/Gizmo.vue:189-233, 267-329` (template + `<style scoped>`) —
  where the arm/head/ring/hub are drawn and styled.
- `src/render/annotate.js:194-421` — only if the fix needs new geometry (e.g. a tapered
  arm drawn as a polygon instead of a stroked line) rather than being achievable with
  CSS/SVG styling alone (gradients, stroke-width tapering via multiple segments,
  drop-shadow filters) on the existing points.

## Proposed fix

Stay within the existing SVG/screen-space overlay technology — `CLAUDE.md` and this
gizmo's own header comment (`Gizmo.vue:31-37`) are explicit about not introducing a
second overlay technology, and an SVG gizmo's cross-engine assertability without
pixel-picking WebGL is a real, stated reason to keep it that way. Within SVG, options to
evaluate (this is a plan, not a patch — pick during implementation, informed by what
reads well against both the dark and light themes per `CLAUDE.md`'s UI convention):

- A subtle linear or radial `<linearGradient>`/`<radialGradient>` fill along each arm and
  arrowhead, lightest at the edge closest to a fixed notional light direction, to imply
  a cylindrical cross-section without any new geometry.
- Drawing the arm as a thin tapered polygon (narrow at the hub, matching the arrowhead's
  base width at the tip) instead of a constant-width stroked `<line>`, giving it a
  cone-like silhouette.
- A soft `filter: drop-shadow(...)` on the arrowhead and ring to lift them off the scene
  slightly, cheap and already CSS-only.
- For the rings: a double-stroke or gradient band (two concentric polylines, one
  slightly offset and dimmer) to suggest a tube rather than a flat wire.

Whichever combination is chosen must keep the existing axis colour coding
(`AXIS_STROKE` in `Gizmo.vue:71-75`) legible — a gradient or shadow that muddies which
ring is X vs. Y vs. Z would trade one legibility problem for another.

## Interaction model

Visual-only change to an existing control — no precondition, trigger, or feedback
*semantics* change, stated explicitly per `CLAUDE.md` rather than omitted.

- **Precondition / Trigger**: unchanged from `docs/decisions/interaction-model-qa.md`
  control 4.
- **Feedback**: the rendered handles gain visual depth cues; the underlying feedback
  contract (which handle moved, live field sync) is unchanged.
- **Placement / Selection response / Selection count**: n/a — unchanged.
- **Small-screen behaviour**: same as desktop; confirm any gradient/shadow doesn't blow
  the phone-width touch-target legibility `ui-012`/`ui-017` already tuned — a heavier
  visual weight must not make the *hit-test* area (`.tgizmo__grab`, unchanged by this
  task) harder to distinguish from the visible handle.

## Documentation

- **Page**: `docs/selection-and-inspector.md`'s gizmo section — no behavioural change to
  document, but worth a one-line note/screenshot refresh once the new appearance ships,
  since that page's existing screenshots (per `.claude/commands/docs.md` Step 3) will be
  visually stale otherwise.
- **Example**: n/a — no new usage steps; this is a screenshot-freshness note, stated
  explicitly rather than silently skipped.

## Effort

M (a few hours) — CSS/SVG styling exploration against both themes, not a mechanical
change; may need a couple of iterations to find a look that stays legible at both very
small (floor-sized, per `ui-017`) and very large (capped, per `ui-017`) gizmo scales.

## Testing

Mostly visual — no new numeric logic. Extend `e2e/gizmo-transform.e2e.js`'s existing
snapshot coverage (it already asserts the gizmo renders per `ui-011`/`ui-012`) rather
than adding numeric assertions; a snapshot diff is the meaningful check for a styling
change like this. Runs at all three reference viewports (phone/tablet/laptop), since the
gizmo's rendered look must hold at the floor/cap sizes `ui-017` established for small and
large devices alike. Chromium-only for the snapshot itself is acceptable (CSS
gradients/filters are not WebGL-sensitive), but do a manual spot-check in WebKit and
Firefox once before closing, since SVG filter support has historically had real
cross-engine differences.

**`TODO/ACCEPTANCE.md` scenarios this could affect**: none — purely cosmetic, no
scenario asserts on gizmo appearance beyond "it attaches to the right body," which this
task doesn't touch. No closed finding exists yet against this subsystem.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
