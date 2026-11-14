---
title: The viewport's navigation chrome covers the left of the grid scale readout when the window is about 650 px wide
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-017 viewport sweep
depends: []
status: open
---

## Problem

`FIND-testing-017` swept the window from 1440 to 390 px and back in 10 px steps in Chromium, Firefox and WebKit
(`ui-079` #3, desktop half; height 900). Everything held (no sideways scroll, no clipped label, no jump away from a
breakpoint, the selection gizmo never covered) except one band: **at 650 px, and at 660 px in Chromium and WebKit,
the navigation chrome and the grid scale readout overlap.**

Measured at 650 px (the same numbers in all three engines, down and up):

| Element | Left | Right | Top | Bottom |
|---|---|---|---|---|
| `navigation-chrome` (Orbit / Pan / Select, arrows, zoom) | 72 | 265 | 728 | 892 |
| `grid-scale-readout` | 254.7 | 418 | 838 | 888 |

That is a **10.3 × 50 px** overlap (515 px² by rectangle), and at 660 px about 1 px wide. No nav button lies under the
readout, so nothing a person taps is covered, but the nav panel draws over the readout's left edge: the ruler bar's start
and the first letter of the **Grid** legend are hidden (screenshot
`r11-ui079-chromium-650.png` from the drive shows "Grid 10 mm" with its "G" cut). At 640 px the layout switches to the
phone form (nav chrome collapses to a 52 px button at the top left and the readout moves up) and at 670 px the readout is clear again, so the
band is about 645 to 664 px.

The cause is the tablet-width form between 641 and 1020 px: the Library is the 72 px rail, the Inspector takes a column,
so the canvas is narrow, and the left-anchored nav chrome (193 px wide) plus the right-anchored readout (163 px wide, `right: 12px`
in `Grid.vue`) no longer fit side by side.

## Affected files

- `src/components/viewport/Grid.vue` (`.readout`, right-anchored)
- `src/components/viewport/NavigationChrome.vue` (left-anchored, expanded form)
- `src/components/viewport/Viewport.vue` (the overlay layout variables the two read)

## Proposed fix

Pick one and say which in the task's closing note:

1. Collapse the nav chrome to its 52 px form (the one the phone uses) when the canvas is narrower than nav + readout + gaps,
   not only at 640 px (a container query on the viewport, not a window `@media`).
2. Stack the readout above the nav chrome in that band.
3. Drop the readout's legend line (keep the ruler bar and its label) in that band.

## Effort

S.

## Testing

- A new `*.e2e.js` (app-level, at `/`): at a window of 650 px and 660 px wide, `navigation-chrome` and `grid-scale-readout`
  rectangles do not intersect. Three engines; the check is layout only, but the overlay sits on the WebGL canvas, so run it on all three.
- Re-run the sweep from `FIND-testing-017` (1440 to 390 px and back in 10 px steps, three engines): no overlap between
  `operations-toolbar`, `orientation-gizmo`, `navigation-chrome` and `grid-scale-readout` at any width.
- Closed findings re-run: `ui-079` (tiered Library, the breakpoints at 1020 and 640 px) and the `ui-085` sideways-scroll check.
- Acceptance scenarios: 1 and 4 at tablet width (navigation chrome in use).

## Interaction model

Not a new control. The viewport's navigation chrome stays reachable without a keyboard and the grid still shows its scale
(`CLAUDE.md`, Interaction Model).

## Documentation

- **Page**: n/a (no user-visible control changes).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
