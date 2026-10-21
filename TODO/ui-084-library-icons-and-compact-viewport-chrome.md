---
title: Shrink the Library to icons, and the navigation pad and orientation gizmo to compact, between laptop and phone width
category: ui
kind: finding
priority: high
model: opus
depends: [ui-079]
status: open
---

## Problem

`ui-079` stages 1–3 (commit `fe01ae5`) shrink the Operations toolbar to icons as the window
narrows, but nothing else in the window gives way:

- **The Library never shrinks.** `panelLayoutFor` already returns `libraryTier: 'icons'` for
  `E` from 790 to 1023 px, and `.app__body` carries `data-library-tier="icons"`, but no component
  reads it. `AppView.vue:266` (`libraryTrackPx`) deliberately pins the Library track at 200 px with
  full labelled rows below the labels tier, as a holding measure until a rail existed. So at the
  tablet reference (820 px) the Library is still a 200 px column of labelled rows, variant
  `<select>`s and section headings while the Operations toolbar beside it has gone to icons. The
  owner reports this as "it did not shrink the library items (as it did the operations)".
- **The navigation pad and the orientation gizmo never shrink.** Both are fixed-size glass panels
  over the viewport. Their only compact form is `@media (max-width: 480px)`, keyed on the *page*
  width, so between 481 px and laptop width they keep their full size however small the viewport
  pane gets:
  - `NavigationChrome.vue`: `.chrome__btn` is `--tap` (44 px) per button, so the pad plus zoom
    column is about 205–209 × 188 px (measured by `ui-079` stage 1). The compact
    `--tap-compact` (38 px) buttons, 2 px gaps and smaller mode row exist only at ≤ 480 px
    (`NavigationChrome.vue:467-501`).
  - `OrientationGizmo.vue`: the dial is 116 px with the Home button and the az/el caption under
    it, about 130 × 177–179 px. Its compact form (96 px dial, 30 px caps, no caption) exists only
    at ≤ 480 px (`OrientationGizmo.vue:275-296`).
  - The Operations toolbar reserves a fixed 184 px for the gizmo
    (`OperationsToolbar.vue:1896`, `max-width: calc(100% − 24px − 184px)`, from `ui-015`). A
    smaller gizmo does not give that width back today.

At the tablet reference the pane is about 395 px, and the two chrome panels plus the labelled
Library column take most of the screen around it.

## Goal

As the window narrows from laptop to phone width, the Library and the viewport chrome give up
space the same way the Operations toolbar already does, each at its own step, all driven by the
one store `ui-079` added:

1. **Library icons tier** (`libraryTier === 'icons'`, already computed: `E` 790–1023): the column
   becomes a 72 px rail of icon tiles. It is "the same as the Operations toolbar": the same rows,
   in the same order, as icons with their names on hover, long-press and `aria-label`. Rows that
   have settings (variant `<select>`s, remembered parameters, reset, the My parts ⋯ menu) keep
   them reachable through a **row pop-out** on tap.
2. **Compact viewport chrome** (a new `chromeTier`, see Breakpoint plan): the navigation pad and
   the orientation gizmo switch to their existing ≤ 480 px compact forms, and the gizmo's reserve
   in the Operations toolbar shrinks to match.

The phone width (≤ 640 px) keeps its existing behaviour: the Library bottom sheet, the raised-pad
fold (`ui-046`) and the ≤ 480 px rules stay exactly as they are. The section pop-out tier (`E`
641–789) stays in `TODO/ui-081`.

## Breakpoint plan

`libraryTier` already exists in `panelLayoutFor` and needs no new breakpoint. Add **one** field:

- `chromeTier: 'full' | 'compact'`, from the *computed* pane `P` (never measured), like `opsTier`.

Provisional threshold: compact when `E < 900` with no chat. Stage 1 measures the real footprints
in all three engines and sets the final number. It must keep every invariant `ui-079`'s unit test
already enforces, extended to the new field:

- **Ordered, one change per breakpoint.** With the provisional number, the shrinking order is:
  Operations to icons (1276), Library to icons (1024), chrome to compact (~900), Library to pop-out
  (790), Operations to groups (742), phone (640).
- Adjacent breakpoints at least 40 px apart in `E`.
- No breakpoint within 24 px of 820 or 1440. With ~900, the tablet reference 820 is **compact**
  chrome, **icons** Library, **icons** Operations.
- Monotonic: narrowing never returns a panel to a less compact tier.
- `P ≥ 340` for every `E` from 641 up, now with the Library track actually at 72 px in its icons
  tier. Remove the `libraryTrackPx` hold in `AppView.vue` so the applied track equals the store's
  target. That also fixes the stage-3 gap `ui-079` recorded (real pane 395 px at 820 vs a 523 px
  target; the icon toolbar wrapping into the nav chrome at 720 and 660).

## Interaction model

### Library, icons tier

- **Precondition**: nothing. `data-library-tier="icons"` on `.app__body`.
- **Trigger**: the Library column renders as a 72 px rail of 44 px tiles, one per row, in the same
  section order. Each tile is the row's existing swatch. A thin divider separates sections; the
  section name is the divider's `title` and `aria-label`.
  - **Drag from a tile** starts placement exactly as dragging a full row does today
    (`onRowPointerDown`, the same ghost, commit on release). The tile keeps
    `data-testid="library-row-<op>"`, so placement specs work unchanged.
  - **Tap or click a tile without moving** opens its **row pop-out**: a small panel beside the
    rail, over the viewport, with the row's label, remembered-parameter summary, variant
    `<select>`s, reset button and (for My parts) the ⋯ menu. The row inside the pop-out is
    draggable too. The tap-versus-drag rule is the existing pointer-slop threshold. A row with no
    settings (for example Cube) still opens a pop-out with its name, so the tap is never silent.
  - The rail's top holds the **?** help button and a **⋯** button whose menu has
    **Import part file…** and **Import model…** (the same inputs and test ids as today). The My
    parts section stays collapsible; its toggle becomes a tile with the count as a badge.
  - **Every row needs a recognisable icon.** `primitive.cuboid`, `primitive.sketch`, `kit.board`,
    `kit.phone` and the gear rows have no swatch rule yet. My parts rows use their thumbnail at
    32 px, or the generic part swatch. No brand logos (no Raspberry Pi logo); a generic board glyph.
- **Feedback**: placement feedback is unchanged (ghost, preview, commit). Hover shows the row's
  name. On touch, a long-press shows the name in a small callout. The tile's `aria-expanded`
  reflects its row pop-out.
- **Only one pop-out open at a time**, in the `openPopout` field `ui-079` already put on the layout
  store. Escape closes it and returns focus to the tile (`useEscapeToClose`). A tap on the viewport
  outside closes it **and still selects normally** (no backdrop). During a drag from the pop-out
  it fades to 25 % with `pointer-events: none`; after the drop it returns and **stays open** (the
  decision confirmed for `ui-079` on 2026-10-21).
- **Repeat hint** (`library__repeat-hint`, `ui-069`): shown as a callout pinned to the rail's
  top-right edge, same text and test id. A 72 px rail cannot hold the paragraph.
- **New My parts row**: scroll its tile into view and pulse it once.
- **Crossfade**: the switch between the labelled column and the rail uses `useTierCrossfade` (from
  `ui-079`), so labels never squash mid-change. Swap content to the rail before the track narrows,
  and widen the track before swapping labels back.
- **Selection response / Selection count**: n/a (creation, not operation).

### Navigation pad and orientation gizmo, compact tier

- **Precondition**: `data-chrome-tier="compact"` on `.app__body` (the pane is narrow).
- **Trigger**: none from the user. The panels change form as the window narrows, like the
  Operations toolbar.
  - **Navigation pad**: the existing ≤ 480 px compact rules apply, moved from the page media
    query to `data-chrome-tier="compact"` (and kept under the media query too, so phone is
    unchanged): `--tap-compact` (38 px) buttons, 4 px padding, the 30 px mode row with 11 px text,
    the 26 px gear. Every control, test id, title and `aria-label` stays. No control is removed or
    folded away; the `ui-046` fold stays phone-only.
  - **Orientation gizmo**: the existing compact rules apply the same way: 96 px dial, 30 px caps,
    caption hidden. Home stays a labelled button. The caps keep their titles, so the hidden az/el
    caption loses no function (the triad itself shows orientation).
  - **Gizmo reserve**: replace the toolbar's fixed `184px` with a custom property set from the
    chrome tier (full and compact values measured in stage 1), so the Operations toolbar gets the
    width back.
- **Feedback**: the panels visibly shrink; no other change. Snapping, stepping, zoom and mode
  switching behave as before.
- **Selection count**: n/a.
- **Small-screen behavior**: phone (≤ 640 px) unchanged.

## Documentation

- **Pages**:
  - `docs/primitive-placement.md` (Library): add a section, "When the window is narrow", covering
    the icon rail and the tap-for-settings row pop-out.
  - `docs/viewport-navigation.md`: add a short note under "The navigation pad (bottom-left)" and
    "The orientation triad (top-right)" that both shrink to a compact form in narrow windows and
    on tablets, with every control still there.
  - `docs/mobile.md`: a pointer to both sections.
- **Example** (verbatim steps for the page):
  1. On a tablet, or in a window about 900 px wide, the Library is a column of icons. Hover (or
     long-press) an icon to see its name.
  2. Drag the Cube icon into the 3D view and release to place a cube.
  3. To pick a bolt size first, tap the Bolt icon without dragging. A small panel opens with its
     Type and Size lists. Choose **M5**, then drag the Bolt row from that panel into the view.
  4. Press Escape to close the panel.
  5. The navigation pad (bottom-left) and the orientation triad (top-right) are smaller at this
     width, but every button is still there. Tap the **Z** cap on the triad to look straight down
     from the top.
- **Media**: new `e2e/docs/narrow-window.docs.js` (shared with `ui-081` and `ui-079` stage 8):
  - `docs/screenshots/library-icon-rail.png` (820×1180)
  - `docs/screenshots/library-row-popout.png` (820×1180, Bolt pop-out open)
  - `docs/screenshots/viewport-chrome-compact.png` (820×1180, pad and triad in compact form)
  Regenerate and review every existing tablet-width shot and any laptop shot with the chat column
  open (`npm run docs:media`).

## Affected files

- `src/stores/panelLayout.js` and `panelLayout.spec.js`: add `chromeTier` and its threshold
  constant; extend the invariant sweep to it.
- `src/views/AppView.vue`: remove the `libraryTrackPx` hold, add `data-chrome-tier`, set the gizmo
  reserve custom property, and update the budget-table comment above `.app__body`.
- `src/components/layout/LibraryPanel.vue` (1259 lines): first extract `LibraryRow.vue` and
  `LibrarySection.vue` with no visual change (use `/refactor-ui`), so the column and the row
  pop-out share one row. Drag code (`onRowPointerDown`, pointer capture, the ghost) stays
  single-sourced.
- `src/components/layout/LibraryRail.vue` (new) and `src/components/layout/LibraryRowPopout.vue`
  (new). Swatch rules for the rows that lack one.
- `src/components/viewport/NavigationChrome.vue`: compact rules keyed on the tier and the media
  query.
- `src/components/viewport/OrientationGizmo.vue`: the same.
- `src/components/viewport/OperationsToolbar.vue`: the gizmo reserve from a custom property.
- `docs/primitive-placement.md`, `docs/viewport-navigation.md`, `docs/mobile.md`,
  `e2e/docs/narrow-window.docs.js`, the screenshots above.

## Proposed fix (each stage a green checkpoint)

1. **Measure.** In all three engines: the nav pad and gizmo footprints, full and compact; the
   rail's height for the full catalogue; the Operations toolbar's available width with each gizmo
   reserve. Set the `chromeTier` threshold and the reserve values; keep the invariants.
2. **Chrome compact tier.** `chromeTier`, the attribute, the compact rules under the tier, the
   reserve property. Small and independent; lands first.
3. **Library refactor.** Extract `LibraryRow` and `LibrarySection` with no visual change.
4. **Library icons tier.** The rail, tile swatches, row pop-out, rail ⋯ menu, Repeat callout,
   crossfade, then remove the `libraryTrackPx` hold.
5. **Docs, media, acceptance drive.**

## Effort

L. A component extraction, two new components, and three panels re-keyed on the store. Stage 2
alone is S and can land on its own.

## Testing

- **Unit (`src/stores/panelLayout.spec.js`)**: `chromeTier` at the width table `ui-079` uses (641,
  700, 733, 742, 790, 820, 900, 1023, 1024, 1100, 1276, 1440, with and without chat), plus the
  1 px invariant sweep from 641 to 1600 including `chromeTier`: monotonic, ≥ 40 px from every
  other breakpoint, not within 24 px of 820 or 1440, `P ≥ 340`.
- **Unit (`LibraryRail.spec.js`, `LibraryRowPopout.spec.js`)**: every catalogue row has a tile
  with a swatch and an `aria-label`; tap opens the pop-out with `aria-expanded`; Escape closes it
  and returns focus; only one pop-out opens at a time.
- **E2E (new `e2e/panel-tiers.e2e.js`, navigates to `/`)**:
  - **Width sweep** with `page.setViewportSize` over 1440, 1100, 1024, 1000, 900, 820 and 760. At
    each width: `data-library-tier` and `data-chrome-tier` match the store; the Library column's
    box width matches the tier (72 px for icons); the nav pad and gizmo boxes are at their compact
    size in the compact tier; no horizontal scroll; the Operations toolbar's box does not intersect
    the gizmo, the nav pad or the scale readout; the viewport pane is at least 340 px.
  - **Flows**: at 820, drag Cube from the icon rail and check one body is placed. At 820, tap Bolt,
    change the size in the row pop-out, drag from it, and check the placed bolt has that size. At
    820, tap each gizmo cap and the nav pad's buttons and check they act as at laptop width.
  - **Snapshots** at phone, tablet and laptop (Responsive Layout rule). Phone must be unchanged.
- **Engines**: all three (Chromium, Firefox, WebKit): touch input, Firefox label widths, WebKit flex
  gaps, `ResizeObserver` timing.
- **Existing specs to re-run in full**: `phone-library`, `phone-toolbar-chrome-fit`,
  `viewport-scaffold`, `gizmo-transform`, `print-prep` and `merge-file` (the specs that click
  `nav-*` or `gizmo-view-*`),
  `hardware-library-placement`, `kit-rpi-library-placement`, `raspberrypi-screen-library`,
  `library-remember-params`, `user-library`, `selection-inspector` (the `ui-045` tap point reads
  the gizmo box). A spec that finds a Library row by its visible label at tablet width moves to the
  `library-row-<op>` test id, not a tier-specific selector.
- **Acceptance scenarios to re-drive** (`TODO/ACCEPTANCE.md`) at 820×1180 and a hand-resized
  ~900 px window, in WebKit and one other engine: **1** (two primitives, from the icon rail),
  **3** (kit snap placement), **7** (touch-only navigation: the compact pad and triad), **18** (a
  drawing becomes a library part: My parts tile and pop-out), **26** (import STL and subtract:
  import from the rail ⋯ menu). Scenario **4** stays blocked by `TODO/ui-083` until that lands.
- **Closed findings whose repro steps must be re-run**:
  - `ui-015` (combine into group): its e2e run found the Operations toolbar overlapping the
    gizmo's view caps at tablet width, which is where the 184 px reserve comes from. The reserve
    changes here, so re-run that overlap check at 820 in both chrome tiers.
  - `ui-043` (phone toolbar overlaps the navigation chrome): the compact pad rules move.
  - `ui-046` (raised phone chrome covers a body): the fold must stay phone-only.
  - `ui-072` (phone Library drag does not register): the drag code moves into `LibraryRow`.
  - `ui-070` (phone Inspector tab covers the open Library sheet): `.app__body` variables change.
- **Hand drive**: drag a desktop window edge slowly from 1440 to 650 px and back in Chrome, Firefox
  and Safari, and on a real iPad. Watch for the Library and chrome changing at their own steps,
  text squash, and anything covering the gizmo or the pad.

## Out of scope

- Phone width (≤ 640 px): unchanged.
- The Library section pop-out tier (`E` 641–789): `TODO/ui-081`. Until it lands, that range keeps
  showing the icon rail from this file rather than the 200 px labelled column (`libraryTier` is
  `popout` there; render it as the rail and note this in a comment).
- Operations groups: `TODO/ui-082`.
- The scale readout and the Inspector's contents.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
