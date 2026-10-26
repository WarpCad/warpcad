---
title: Library section-launcher rail and section pop-out between laptop and phone width
category: ui
kind: feature
priority: high
model: opus
milestone: M1
depends: [ui-079, ui-084]
status: done
---

## Goal

Split from `TODO/FIND-ui-079-tiered-library-and-operations-panels.md`, stage 5. The Library's icon rail
and row pop-out (stage 4) moved to `TODO/ui-084-library-icons-and-compact-viewport-chrome.md` on
2026-10-21, so this file covers only the next step down: when `E` falls into the pop-out range
(641–789 px with no chat), the 72 px icon rail gives way to a 64 px rail of **section
launchers**, each opening a **section pop-out**.

`ui-079` provides `data-library-tier`, `--library-width` and the shared `openPopout` field on the
layout store. `ui-084` provides `LibraryRow`, `LibrarySection`, the rail and the pop-out panel.
This file reuses them; it does not re-derive them. The breakpoints live in `panelLayoutFor` and
must not change here without re-running its invariant tests.

## Interaction model

### Library, pop-out tier

- **Precondition**: nothing. `data-library-tier="popout"` on `.app__body`.
- **Trigger**: a 64 px rail of **section launchers**, one per section (Primitives, Hardware,
  Kit Parts, Raspberry Pi, Gears, Text, My parts). Each is a 44 px glyph with a 10 px short name.
  Tapping a launcher opens the **section pop-out**: `min(280px, P − 32px)` wide, beside the rail,
  over the viewport (it does not push it), as tall as the body with a margin, and scrollable. It
  holds that section's heading and rows, rendered by the **same `LibraryRow`** as the full column,
  so labels, selects, reset and ⋯ all behave identically.
  - Only one pop-out is open at a time, across **both** panels and both kinds (row pop-out from
    `ui-084`, Operations group pop-out from `ui-082`). Keep this in the single `openPopout` field.
  - Tapping the same launcher again closes it. Tapping another switches to it. **Escape** closes it
    and returns focus to the launcher (`useEscapeToClose`).
  - A tap on the viewport outside the pop-out closes it **and still selects normally**. No backdrop.
  - **During a drag** from a pop-out row, the pop-out fades to 25 % opacity with
    `pointer-events: none`, so the drop can land on scene beneath it. After the drop it returns to
    full opacity and **stays open** (decision confirmed 2026-10-21).
  - The pop-out may cover the Operations toolbar while open. That's acceptable only because opening
    it closes any Operations pop-out and the user is choosing a creation, not an operation. Say so
    in a comment.
  - The rail's top keeps the **?** and **⋯** (Import part file…, Import model…) from `ui-084`.
- **Feedback**: the launcher shows a pressed/open state and `aria-expanded`. The pop-out opens with
  a 120 ms slide and fade (none under reduced motion).
- **Resizing while open**: when a tier change removes an open pop-out's launcher, close it without
  animation and keep the store's selection and any in-progress drag. Defer the content swap until
  `pointerup` if a drag is active. Crossing into phone width closes it.
- **Placement**: unchanged.
- **Selection response / Selection count**: n/a (creation, not operation).
- **Small-screen behavior**: phone (≤ 640 px) unchanged (bottom sheet).

## Documentation

- **Page**: `docs/primitive-placement.md`, in the "When the window is narrow" section `ui-084`
  adds. Add the section launchers after the icon rail.
- **Example** (verbatim steps for the page):
  1. Narrow the window to about 760 px. The Library becomes a short column of section buttons.
  2. Tap **Hardware** to open its list.
  3. Drag a Nut into the view. The list fades while you drag and comes back when you let go.
  4. Tap **Hardware** again, or press Escape, to close the list.
- **Media**: `e2e/docs/narrow-window.docs.js` (shared with `ui-084`):
  - `docs/screenshots/library-section-popout.png` (760×900, Hardware open)

## Affected files

- `src/components/layout/LibraryRail.vue` (from `ui-084`): the launcher form.
- `src/components/layout/LibrarySectionPopout.vue` (new), or a mode of `ui-084`'s pop-out panel if
  that stays small.
- `src/stores/panelLayout.js`: `openPopout` (already present) is shared, not duplicated.
- `docs/primitive-placement.md`, `e2e/docs/narrow-window.docs.js`, the screenshot above.

## Proposed fix

1. Add the launcher form of the rail, keyed on `libraryTier === 'popout'`.
2. Add the section pop-out using `LibrarySection` and `LibraryRow`, the fade during drag, Escape
   handling and the shared `openPopout`.
3. Resizing-while-open handling and reduced motion.

## Effort

M. One rail mode and one pop-out on top of `ui-084`'s components.

## Testing

- **Unit (`LibraryRail.spec.js`, extended)**: launcher rendering, `aria-expanded`, Escape closes and
  returns focus, only one pop-out open across kinds.
- **E2E (`e2e/panel-tiers.e2e.js`, navigates to `/`, shared with `ui-079`/`ui-084`/`ui-082`)**:
  - At 760, open Hardware, drag Nut, check the pop-out's opacity drops during the drag and it is
    still open after the drop.
  - Opening a section pop-out closes an open Operations group pop-out, and the reverse.
  - Widen past 790 with a pop-out open and check it closes with no orphaned element.
- **Engines**: all three (Chromium, Firefox, WebKit): touch input, grid-track timing.
- **Viewports**: phone, tablet and laptop per the Responsive Layout rule, plus 760×900 for the
  pop-out tier, which no reference viewport reaches.
- **Existing specs to re-run**: `phone-library`, `hardware-library-placement`, `user-library`.
- **Acceptance scenarios to re-drive** (`TODO/ACCEPTANCE.md`) at a hand-resized ~760 px window, in
  WebKit and one other engine: **1** (two primitives) and **3** (kit snap placement).
- **Closed findings whose repro steps must be re-run**: `ui-072` (phone Library drag does not
  register), since the pop-out drag uses the same row drag code.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
