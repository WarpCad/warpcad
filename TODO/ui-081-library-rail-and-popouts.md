---
title: Library icon rail, row pop-out and section pop-out between laptop and phone width
category: ui
kind: feature
priority: high
model: opus
milestone: M1
depends: [ui-079]
status: open
---

## Goal

Split from `TODO/ui-079-tiered-library-and-operations-panels.md`, stages 4 and 5. Between
laptop and phone width the Library column gives up space in two steps: first to a 72 px
icon rail (stage 4), then to a 64 px section-launcher rail with section pop-outs (stage 5).
`ui-079` stages 1–3 (budget, `panelLayoutFor`, the fluid grid, the Operations icons tier)
are already in place and provide `data-library-tier`, `--library-width` and the shared
`openPopout` field on the layout store. This file uses them; it does not re-derive them.

The breakpoints and the tier table are in `ui-079` (Breakpoint plan) and must not change
here without re-running its invariant tests.

## Interaction model

### Library, icons tier

- **Precondition**: nothing. `E` is in the icons range (790–1023 px with no chat; tablet
  820 px is in this tier).
- **Trigger**: the column becomes a 72 px rail of 44 px tiles, one per row, in the same section
  order. Each tile is the row's swatch. A thin divider separates sections; the section name is
  the divider's `title` and `aria-label`.
  - **Drag from a tile** starts placement exactly as a full row does today (`onRowPointerDown`,
    same ghost, same commit on release). The tile keeps `data-testid="library-row-<op>"`.
  - **Tap or click a tile without moving** opens that row's **row pop-out**: a panel to the right
    of the rail with the row's label, remembered-parameter summary, variant `<select>`s, reset
    button and (for My parts) the ⋯ menu. The row in the pop-out is draggable. The tap-versus-drag
    rule is the existing pointer-slop threshold.
  - The rail's top holds the ? help button and a ⋯ button whose menu has **Import part file…**
    and **Import model…** (same inputs and test ids as today). The My parts section stays
    collapsible; its toggle becomes a tile with the count as a badge.
  - **Every row needs a recognisable icon.** `primitive.cuboid`, `primitive.sketch`, `kit.board`,
    `kit.phone` and the gear rows have no swatch rule yet. My parts rows use their thumbnail at
    32 px, or the generic part swatch. No brand logos (no Raspberry Pi logo); a generic board glyph.
- **Feedback**: placement feedback unchanged (ghost, preview, commit). Hover shows the row's name.
  On touch, a long-press shows the name in a small callout. The row pop-out's state is reflected in
  `aria-expanded` on the tile.
- **Repeat hint** (`library__repeat-hint`, `ui-069`): in the icons and pop-out tiers it is a callout
  pinned to the rail's top-right edge, over the viewport, same text and test id.
- **New My parts row** (`LibraryPanel.vue`, near line 126): scroll its tile into view and pulse it
  once, instead of scrolling a full row.
- **Small-screen behavior**: phone (≤ 640 px) is unchanged (bottom sheet).

### Library, pop-out tier

- **Precondition**: nothing. `E` is in the pop-out range (742–789 px with no chat).
- **Trigger**: a 64 px rail of **section launchers**, one per section (Primitives, Hardware,
  Kit Parts, Raspberry Pi, Gears, Text, My parts). Each is a 44 px glyph with a 10 px short name.
  Tapping a launcher opens the **section pop-out**: `min(280px, P − 32px)` wide, beside the rail,
  over the viewport (it does not push it), as tall as the body with a margin, and scrollable. It
  holds that section's heading and rows, rendered by the **same row component** as the full column.
  - Only one pop-out is open at a time, across **both** panels. Opening a Library pop-out closes any
    Operations group pop-out, and the reverse. Keep this in the single `openPopout` field on the
    layout store.
  - Tapping the same launcher again closes it. Tapping another switches to it. **Escape** closes it
    and returns focus to the launcher (`useEscapeToClose`).
  - A tap on the viewport outside the pop-out closes it **and still selects normally**. No backdrop.
  - **During a drag** from a pop-out row, the pop-out fades to 25 % opacity with `pointer-events:
    none`, so the drop can land on scene beneath it. After the drop it returns to full opacity and
    **stays open** (decision confirmed 2026-10-21).
  - The pop-out may cover the Operations toolbar while open. That's acceptable only because opening
    it closes any Operations pop-out and the user is choosing a creation, not an operation. Say so in
    a comment.
- **Feedback**: the launcher shows a pressed/open state and `aria-expanded`. The pop-out opens with
  a 120 ms slide and fade (none under reduced motion, via the `useTierCrossfade` pattern from ui-079).
- **Resizing while open**: when a tier change removes an open pop-out's launcher, close it without
  animation and keep the store's selection and any in-progress drag. Defer the content swap until
  `pointerup` if a drag is active. Crossing into phone width closes it.
- **Placement**: unchanged.
- **Selection response / Selection count**: n/a (creation, not operation).

## Documentation

- **Page**: `docs/primitive-placement.md` (Library). Add a section "Narrow windows and tablets"
  covering the icon rail, the row pop-out and the section launchers. Phone docs are in `docs/mobile.md`
  (owned by `ui-079`'s stage 8).
- **Example** (verbatim steps for the page):
  1. On a tablet, or in a window about 900 px wide, the Library is a column of icons. Hover (or
     long-press) an icon to see its name.
  2. Drag the Bolt icon into the 3D view and release to place a bolt.
  3. To pick a different bolt size first, tap the Bolt icon without dragging. A small panel opens with
     its size list. Choose **M5**, then drag the Bolt row from that panel into the view.
  4. Narrow the window to about 720 px. The Library becomes a short row of section buttons. Tap
     **Hardware** to open its list and drag a Nut into the view. The list fades while you drag and
     comes back when you let go.
- **Media**: new `e2e/docs/narrow-window.docs.js` (shared with `ui-079` stage 8), embedded in
  `docs/primitive-placement.md`:
  - `docs/screenshots/library-icon-rail.png` (820×1180)
  - `docs/screenshots/library-row-popout.png` (820×1180, Bolt pop-out open)
  - `docs/screenshots/library-section-popout.png` (720×900, Hardware open)
  Also regenerate the existing Library shots that change (`npm run docs:media`).

## Affected files

- `src/components/layout/LibraryPanel.vue` (1259 lines): first extract `LibraryRow.vue` and
  `LibrarySection.vue` with no visual change (use `/refactor-ui`), so the column, row pop-out and
  section pop-out share one row implementation. Drag code (`onRowPointerDown`, pointer capture,
  ghost) stays single-sourced.
- `src/components/layout/LibraryRail.vue` (new): the icon and pop-out rails.
- `src/components/layout/LibraryPopout.vue` (new): the row and section pop-outs.
- Swatch rules for the rows that lack one.
- `src/stores/panelLayout.js`: `openPopout` is already present (ui-079); this file uses it.
- `docs/primitive-placement.md`, `e2e/docs/narrow-window.docs.js`, the screenshots above.

## Proposed fix

1. Extract `LibraryRow.vue` and `LibrarySection.vue` with no visual change; keep the full column
   green.
2. Add the icons tier: rail, tile swatches, row pop-out, rail ⋯ menu, Repeat callout. Tablet 820
   becomes this tier.
3. Add the pop-out tier: section launchers, section pop-out, fade during drag, Escape handling,
   shared `openPopout` with the Operations side (the Operations side's pop-outs land in `ui-082`).
4. Resizing-while-open handling and reduced motion.

## Effort

M–L. Layout orchestration across `LibraryPanel` and two new components. Depends on `ui-079` stages
1–3 (already uncommitted in the working tree when this file was written; confirm they are committed
before starting).

## Testing

- **Unit (`src/components/layout/LibraryRail.spec.js`, `LibraryPopout.spec.js`)**: tile and launcher
  rendering, `aria-expanded`, Escape closes and returns focus, the repeat callout placement.
- **E2E (`e2e/panel-tiers.e2e.js`, navigates to `/`, shared with `ui-079`)**:
  - At 820, drag Cube from the icon rail into the view and check one body is placed.
  - At 820, tap Bolt, change the size in the row pop-out, then drag from the pop-out. Check the placed
    bolt has that size.
  - At 720, open Hardware, drag Nut, check the pop-out's opacity drops during the drag and it is still
    open after the drop.
  - Only one pop-out is open at a time across both panels; Escape closes a pop-out and returns focus.
  - Widen past a breakpoint with a pop-out open and check it closes with no orphaned element.
- **Engines**: all three (Chromium, Firefox, WebKit): touch input, Firefox label widths, WebKit flex
  gaps, grid-track animation.
- **Viewports**: phone, tablet and laptop per the Responsive Layout rule, plus 720×900 for the
  pop-out tier.
- **Existing specs to re-run**: `phone-library`, `hardware-library-placement`, `kit-rpi-library-placement`,
  `raspberrypi-screen-library`, `library-remember-params`, `user-library`. Specs that find a Library row
  by visible label at tablet width move to `library-row-<op>` test ids.
- **Acceptance scenarios to re-drive** (`TODO/ACCEPTANCE.md`) at 820×1180 and a hand-resized ~720 px
  window, in WebKit and one other engine: **1** (two primitives), **3** (kit snap placement), **18**
  (a drawing becomes a library part: My parts tile and pop-out), **26** (import STL and subtract: import
  from the rail ⋯ menu, then Combine). Also **7** (touch navigation) at 820.
- **Closed findings whose repro steps must be re-run**: `ui-072` (phone Library drag does not register;
  the drag code moves into the extracted row component), `ui-070` (phone Inspector tab covers the open
  Library sheet; `.app__body` variables change).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
