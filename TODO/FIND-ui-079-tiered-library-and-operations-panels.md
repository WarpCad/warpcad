---
title: Shrink the Library and Operations panels in steps between laptop and phone width
category: ui
kind: finding
priority: high
model: opus
depends: []
status: open
---

> **Status (split, 2026-10-21).** Stages 1–3 are implemented (budget, `panelLayoutFor` and the
> store, the fluid grid, the Operations icons tier) and still uncommitted at the time of writing.
> Stage 4 (Library icon rail and row pop-out) moved to
> `TODO/ui-084-library-icons-and-compact-viewport-chrome.md`, which also adds a compact tier for
> the navigation pad and orientation gizmo. Stage 5 (section pop-outs) moved to
> `TODO/ui-081-library-rail-and-popouts.md`, and stage 6 to `TODO/ui-082-operations-groups-tier.md`. This file keeps stages 7 (motion and edges) and 8 (docs,
> media, acceptance drive, hand drive), which wait on `ui-081` and `ui-082`. The file stays `open`.

## Problem

Between the laptop layout and the phone layout (page width 641 px to about 1300 px) the Library
column and the Operations toolbar do not shrink. They keep their full laptop form until the page
crosses 640 px, and then they jump straight to the phone bottom sheet and the icon-only toolbar.
The owner reports this when making a window narrower or using a smaller display. In between, the
3D view is squeezed, and the toolbar grows down over the scene.

What the code does today:

- **The grid tracks are fixed.** `src/views/AppView.vue:562-574` sets `.app__body` to
  `210px 1fr 220px` from 641 px and `210px 1fr 280px` from 1100 px. With the chat column open at
  1100 px and up, it adds a fourth `340px` track (`AppView.vue:633-636`). So the viewport pane is
  `page − 430` from 641 to 1099 px, and `page − 490` (or `− 830` with chat) from 1100 px. Some
  measured and computed values:

  | Page width | Chat column | Viewport pane |
  |---|---|---|
  | 641 | n/a | ~211 px |
  | 820 (tablet reference) | n/a | ~390 px |
  | 1100 | open | ~270 px |
  | 1280 | open | ~450 px |
  | 1440 (laptop reference) | open | ~610 px |

- **The Operations toolbar keys its compact form on page width, but caps its width by the
  viewport pane.** `.ops` has `max-width: calc(100% − 24px − 184px)` relative to `.viewport`
  (`OperationsToolbar.vue:1873-1887`, the gizmo-avoiding cap from `ui-015`). Labels are hidden
  only inside `@media (max-width: 640px)` (`OperationsToolbar.vue:2281-2397`, from `ui-027` and
  `ui-043`). At the tablet reference the pane is about 390 px, so the cap is about 182 px. That
  leaves the toolbar with all 13 *labelled* buttons wrapped two per row into a tall column that
  covers the scene. The phone gets the icon-only form even though its pane is the same width.
- **The Library column has a single form.** `LibraryPanel.vue` is either the full labelled column
  (641 px and up) or the phone bottom sheet (`LibraryPanel.vue:1204`). It has no narrower form.
  Its rows hold labels, variant `<select>`s, remembered-parameter summaries, reset buttons and the
  My parts header with two import buttons. None of these can shrink below about 200 px.

The result: the panels that should give way are the ones that never do, and the viewport absorbs
the whole squeeze until the page width crosses one breakpoint and everything changes at once.

## Goal

As a window narrows from laptop width to phone width, the Library and the Operations toolbar each
give up space in small, separate steps. No single width changes both panels at once, and the 3D
view stays usable (at least about 360 px wide) everywhere above phone width. Each panel goes:

1. **Full**: labelled, as today (Library width eases from 240 px down to 200 px).
2. **Icons only**: the same controls as icons with their names on hover, long-press and
   `aria-label`.
3. **Pop-out**: a short rail of launchers. Each launcher opens a pop-out window that lists the
   tools or objects in that group, with labels.
4. **Phone** (page width ≤ 640 px): unchanged. The bottom sheet and the current icon-only toolbar
   stay exactly as they are. This task does not touch them (see Out of scope).

"Smooth" means:

- Inside a step, widths change continuously as the window moves (no jumps).
- At a step boundary, only one panel changes form, and the change is animated over about 180 ms.
- No reflow is visible mid-animation: text never squashes, wraps or overflows while a column
  animates.
- Neither panel ever overlaps the orientation gizmo, the navigation chrome or the scale readout.

Done means all four stages show up in order when a window is dragged from 1440 px to 390 px wide,
in Chromium, Firefox and WebKit, and the breakpoint invariants below are enforced by a unit test.

## Breakpoint plan

All tiers come from **one** measured number, so there is a single source of truth and no feedback
loop:

- `W`: the width of `.app__body`, from a `ResizeObserver`.
- `C`: the chat column width. 340 when the chat is a grid column (W ≥ 1100 and the chat is
  open), otherwise 0.
- `E = W − C`: the width the Library, viewport pane and Inspector share.
- `L(E)`, `I(E)`: the *target* Library and Inspector track widths for that `E`.
- `P = E − L − I`: the *target* viewport pane width. **Computed, never measured.** The Operations
  tier is a function of `P`, so an animating grid track can never feed back into a tier decision.
  A window parked exactly on a breakpoint is stable, and no hysteresis is needed.

Provisional numbers. Stage 1 below measures the real natural widths in all three engines and
adjusts these values; the table in the code must match what was measured.

| Page/E width (no chat) | Library | Library track L | Inspector track I | Pane P | Operations |
|---|---|---|---|---|---|
| ≥ ~1260 | **labels** | fluid 200→240 (240 at E ≥ 1440) | fluid 220→280 (280 at E ≥ 1280) | ≥ 760 | **labels** |
| 1024 – ~1260 | labels | 200 – 223 | 240 – 277 | 584 – 760 | **icons** ← first step |
| 780 – 1023 | **icons** ← second step | 72 | 220 – 240 | 488 – 712 | icons |
| ~734 – 779 | **pop-out** ← third step | 64 | 220 | 450 – 495 | icons |
| 641 – ~733 | pop-out | 64 | 220 | 357 – 449 | **groups** ← fourth step |
| ≤ 640 | phone sheet (unchanged) | — | — | — | phone icons (unchanged) |

Rules the numbers must keep (enforced by the unit test, see Testing):

- **Ordered, one change per breakpoint.** Shrinking order: Operations to icons, then Library to
  icons, then Library to pop-out, then Operations to groups, then phone. No two tiers change at
  the same `E`.
- **Spacing.** Adjacent breakpoints are at least 40 px apart in `E`.
- **No reference viewport within 24 px of a breakpoint.** 820 (tablet) and 1440 (laptop) must
  never be on an edge, so a slightly different device or a classic scrollbar never flips the
  layout. With these numbers, 820 is in Library **icons** / Operations **icons**, and its pane
  grows from ~390 px to ~528 px. 1440 with the chat column open is `E = 1100`: Library labels at
  ~207 px, Operations icons.
- **Monotonic.** Narrowing never moves a panel back to a less compact tier.
- **Continuous inside a tier.** Within one tier, L and I change by at most 1 px per 1 px of `E`.
- **Floor.** `P ≥ 340` for every `E` from 641 up.
- **Opening or closing the laptop chat column** moves `E` by 340 px and can change tiers. That is
  a user action, so it animates like any other tier change. It is not a resize glitch.

## Interaction model

### Library, icons tier

- **Precondition**: nothing, as today. `E` is in the icons range.
- **Trigger**: the column becomes a 72 px rail of 44 px tiles, one per row, in the same
  section order. Each tile is the row's existing swatch. A thin divider separates sections, and
  the section name is the divider's `title` and `aria-label`.
  - **Drag from a tile** starts placement exactly as dragging a full row does today
    (`onRowPointerDown`, same ghost, same commit on release). The tile keeps the row's
    `data-testid="library-row-<op>"`, so placement specs work unchanged.
  - **Tap or click a tile without moving** opens that row's **row pop-out**: a small panel to
    the right of the rail with the row's label, its remembered-parameter summary, its variant
    `<select>`s, its reset button and (for My parts) the ⋯ menu. The row in the pop-out is
    draggable too. The tap-versus-drag rule is the existing pointer-slop threshold.
  - The rail's top holds the ? help button and a ⋯ button whose menu has **Import part file…**
    and **Import model…** (the same inputs and test ids as today). The My parts section stays
    collapsible. Its toggle becomes a tile with the count as a badge.
  - **Every row needs a recognisable icon.** These rows have no swatch rule yet and need one:
    `primitive.cuboid`, `primitive.sketch`, `kit.board`, `kit.phone` and the gear rows. My parts
    rows use their thumbnail at 32 px, or the generic part swatch. Don't use brand logos (for
    example, no Raspberry Pi logo); use a generic board glyph.
- **Feedback**: placement feedback is unchanged (ghost, preview, commit). Hover shows the row's
  name. On touch, a long-press shows the name in a small callout. The row pop-out's open/closed
  state is reflected in `aria-expanded` on the tile.
- **Placement**: unchanged, dragged into the 3D view.
- **Selection response / Selection count**: n/a (creation, not operation).
- **Repeat hint** (`library__repeat-hint`, `ui-069`): in the icons and pop-out tiers it shows as
  a callout pinned to the rail's top-right edge, over the viewport, with the same text and test
  id. Today it is a paragraph that a 72 px rail cannot hold.
- **New My parts row** (`LibraryPanel.vue:126`): scroll its tile into view and pulse it once,
  instead of scrolling a full row.
- **Small-screen behavior**: phone is unchanged (bottom sheet).

### Library, pop-out tier

- **Precondition**: nothing. `E` is in the pop-out range.
- **Trigger**: a 64 px rail of **section launchers**, one per section (Primitives, Hardware, Kit
  Parts, Raspberry Pi, Gears, Text, My parts). Each launcher is a 44 px glyph with a 10 px short
  name under it. Tapping a launcher opens the **section pop-out**: a panel about
  `min(280px, P − 32px)` wide, beside the rail, over the viewport (it does not push it), as tall
  as the body with a margin, and scrollable. It contains that section's heading and rows,
  rendered by the **same row component** as the full column, so labels, selects, reset and ⋯ all
  behave identically.
  - Only one pop-out is open at a time, across **both** panels. Opening a Library pop-out closes
    any Operations group pop-out, and the reverse. Keep this in one `openPopout` field on the
    layout store.
  - Tapping the same launcher again closes the pop-out. Tapping another launcher switches to it.
    **Escape** closes it and returns focus to the launcher (`useEscapeToClose`).
  - A tap on the viewport outside the pop-out closes it **and still selects normally**. There is
    no backdrop eating the tap, because the pop-out is not modal.
  - **During a drag** from a pop-out row, the pop-out fades to 25 % opacity with
    `pointer-events: none`, so the drop can land on scene under its footprint. After the drop it
    comes back at full opacity and **stays open**, so placing three bolts doesn't mean reopening
    it three times. That matches the phone sheet, which deliberately does not close mid-drag.
  - The pop-out may cover the Operations toolbar while open. That's acceptable only because
    opening it closes any Operations pop-out and the user is choosing a creation, not an
    operation. Say so in a comment.
- **Feedback**: the launcher shows a pressed/open state and `aria-expanded`. The pop-out opens
  with a 120 ms slide and fade (none with reduced motion).
- **Placement**: unchanged.
- **Selection response / Selection count**: n/a.
- **Small-screen behavior**: phone is unchanged.

### Operations, icons tier

- **Precondition / Selection count**: unchanged per button (the same gates, badge and reasons).
- **Trigger**: the same buttons in the same order, with labels hidden. This is today's phone
  form, now driven by `data-ops-tier="icons"` on `.ops` instead of `@media (max-width: 640px)`.
  It applies wherever the pane calls for it, including the tablet pane. The name stays in
  `title`/`aria-label` (`titleFor`, `exactOneTitleFor`), which is the toolbar's established
  long-press affordance. The badge switches to the short legend
  (`DISABLED_HINT_SHORT`, `ui-043`) in this tier too, not only below 640 px.
- **Feedback**: unchanged.
- **Small-screen behavior**: phone keeps its existing rules (2 px gaps, `--tap-compact`). Move
  those rules under `data-ops-tier` plus the phone media query, not under the media query alone.

### Operations, groups tier

- **Precondition**: `P` is in the groups range.
- **Trigger**: the toolbar becomes the badge plus one row of **group launchers**, each a
  `--tap-compact` square with a glyph and a small ▾:

  | Group | Members (existing buttons, same test ids) |
  |---|---|
  | Combine | Union, Subtract, Intersect, Group |
  | Arrange | Align, Repeat, Mirror |
  | Shape | Fillet, Chamfer, Enlarge, Fit, Bisect, Split |
  | To library | stays a standalone button (one member; a group would add a tap for nothing) |

  Tapping a group launcher opens its **group pop-out** under it: a vertical list of the members
  **with labels**, each with its own enabled/disabled state and its existing reason text. Member
  buttons keep their existing `data-testid`s (`operation-union`, `op-repeat`, ...). Tapping an
  enabled member runs it exactly as the toolbar button does today. For members that open their
  own popover (Align, Fillet/Chamfer, Enlarge/Fit/Bisect, Split, Repeat), the group pop-out
  closes first, then that popover opens where it does today.
- **Selection count**: this is CLAUDE.md's selection-count rule and must survive grouping.
  - A group launcher is **disabled** when none of its members can run with the current
    selection. Its `title` then gives the most relevant reason (for example "Select 2 or more
    solids" for Combine).
  - When some members are enabled, the launcher shows a small count badge with how many, so
    enablement can be read before opening it.
  - The group must never be offered as a flat list of every registered operation. The table
    above is hand-written on purpose; read `CLAUDE.md`'s creation-versus-operation rule before
    "deriving" it.
- **Feedback**: the launcher shows an open state and `aria-expanded`. The pop-out lists members
  with live enablement. A run's existing feedback (record, highlight, error line) is unchanged.
- **Small-screen behavior**: phone is unchanged (it keeps three rows of icons). Whether phone
  should adopt groups too is an open decision (see Decisions to confirm). The default is no, so
  that this task leaves phone alone.

### Resizing while something is open

- When a tier change makes an open pop-out's launcher disappear (for example, the window widens
  from pop-out to icons with a section pop-out open), close the pop-out without animation. Keep
  the store's selection and any in-progress drag intact. A drag in progress keeps tracking: the
  tier change must not unmount the element holding pointer capture. Defer the content swap until
  `pointerup` if a drag is active.
- Crossing into phone width with a pop-out open closes it. The phone sheet stays closed.

## Smoothness mechanics

- **One store, pure function.** `panelLayoutFor({ bodyWidthPx, chatColumn })` returns
  `{ phone, libraryTier, libraryWidthPx, inspectorWidthPx, paneWidthPx, opsTier }`. It is pure,
  has no DOM, is allocation-light and is unit-tested. A small Pinia store
  (`src/stores/panelLayout.js`; panel layout is UI state, which is what `src/stores/` is for)
  holds `bodyWidthPx`, `chatColumn` and `openPopout`, and exposes the function's result. Seed it
  synchronously from `window.innerWidth` at store creation, so the first frame is already the
  right tier with no flash and no initial animation.
- **Grid from variables.** `.app__body` gets `--library-width` and `--inspector-width` inline,
  plus `data-library-tier` and `data-ops-tier`. `grid-template-columns` becomes
  `var(--library-width) 1fr var(--inspector-width)` (plus `340px` for chat). The 641 px and 1100 px
  grid media queries are replaced. The ≤ 640 px phone rules stay as they are.
- **Animate tier changes only, not fluid changes.** While dragging a window edge, the fluid widths
  must track the edge immediately; a transition there feels like rubber-banding. On a tier change
  only, set `data-panel-animating` on `.app__body` for about 220 ms, which enables
  `transition: grid-template-columns 180ms ease-out`. (`grid-template-columns` interpolates in
  Chromium 107+, Firefox 66+ and Safari 16+. Check that WebKit really animates `var()`-based
  tracks, and fall back to an instant change if not.)
- **Content swaps on the right side of the animation.** When shrinking, swap the content to the
  compact form first, then animate the track narrower. When growing, animate the track wider
  first, then swap the content in on `transitionend` (or a timeout as a fallback). Text never has
  to fit a column mid-animation, which is what removes the visible squash and wrap.
- **Don't animate label widths inside the wrapping Operations row.** A label width that
  transitions in a `flex-wrap` row re-wraps on every frame and jumps. Crossfade instead: on an
  Operations tier change, dip the toolbar to `opacity: 0.4`, swap, and fade back to 1 over 150 ms.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, all of the above become instant.
- **No layout thrash.** The `ResizeObserver` callback writes one number to the store and nothing
  else. Vue batches the re-render. No component reads layout in response.
- **Frame budget.** Resizing is not the pointer or render path, but the observer fires per frame
  during a window drag. The function must not allocate per call beyond its one result object.

## Documentation

- **Page**: update `docs/mobile.md` ("Using WarpCad on a phone or tablet"). Add a section,
  "Narrow windows and tablets", that explains the icon rail, the tap-for-details row pop-out, the
  section launchers and the grouped Operations toolbar. Add short pointers from
  `docs/primitive-placement.md` (Library) and `docs/booleans.md` (Operations toolbar) to that
  section. No new page, so no sidebar change.
- **Example** (verbatim steps for the page):
  1. On a tablet, or in a window about 900 px wide, the Library is a column of icons. Hover
     (or long-press) an icon to see its name.
  2. Drag the Bolt icon into the 3D view and release to place a bolt.
  3. To pick a different bolt size first, tap the Bolt icon without dragging. A small panel opens
     with its size list. Choose **M5**, then drag the Bolt row from that panel into the view.
  4. Narrow the window to about 720 px. The Library becomes a short row of section buttons. Tap
     **Hardware** to open its list and drag a Nut into the view. The list fades while you drag
     and comes back when you let go.
  5. Select two shapes. The Operations toolbar now shows **Combine ▾** with a "4" badge. Tap it
     and choose **Union**.
- **Media**: new `e2e/docs/narrow-window.docs.js`, embedded in `docs/mobile.md`:
  - `docs/screenshots/library-icon-rail.png` (820×1180)
  - `docs/screenshots/library-row-popout.png` (820×1180, Bolt pop-out open)
  - `docs/screenshots/library-section-popout.png` (720×900, Hardware open)
  - `docs/screenshots/operations-groups.png` (720×900, Combine open, two bodies selected)
  - `docs/media/window-shrink.webm`: a window sweep from 1440 to 700 px showing the four steps
    in order. This is the best single check that the transition reads as smooth.

  Also regenerate and review existing shots whose layout changes: anything at the tablet
  reference, and any laptop shot taken with the chat column open (Operations becomes icons
  there). `npm run docs:media`, then review the diff; `e2e/docs-media.spec.js` guards orphans.

## Affected files

- `src/stores/panelLayout.js` (new): `panelLayoutFor` and the store; `panelLayout.spec.js`
  (new).
- `src/views/AppView.vue`: the body observer, the tier attributes, the grid from variables, the
  animating flag, and replacing the 641/1100 grid media queries. Keep the phone (≤ 640 px) block
  and the chat-sheet inset rules intact. Put the measured budget table in a comment above
  `.app__body`.
- `src/components/layout/LibraryPanel.vue` (1259 lines): first extract `LibraryRow.vue` and
  `LibrarySection.vue` (use `/refactor-ui`), so the column, the row pop-out and the section
  pop-out share one row implementation. Then add `LibraryRail.vue` (the icons and pop-out
  rails), `LibraryPopout.vue` and swatch rules for the rows that lack one. Drag code
  (`onRowPointerDown`, pointer capture, ghost) must stay single-sourced.
- `src/components/viewport/OperationsToolbar.vue` (2398 lines): move the icon-only rules from the
  page media query to `data-ops-tier`, and add the group launchers and the group pop-out (a new
  `OperationsGroupPopover.vue` keeps the file from growing). Existing per-button gating functions
  are reused, not re-derived.
- `src/components/viewport/Viewport.vue`: no change expected. `@container viewport` stays as it
  is; confirm the `.ops__help` hiding rule at `≤ 520px` still reads right with the new tiers.
- `docs/mobile.md`, `docs/primitive-placement.md`, `docs/booleans.md`,
  `e2e/docs/narrow-window.docs.js`, the images above.

## Proposed fix (implementation order, each stage a green, committable checkpoint)

1. **Measure and lock the budget.** In all three engines, measure the Operations row's natural
   width labelled and icon-only (gap 4), the icon rail's height for the full catalogue, the
   section rail's height and the gizmo's footprint. Adjust the breakpoint table to match, keeping
   the invariants. Record the measured table in the `AppView.vue` comment, as `ui-043` and
   `ui-078` did. (Firefox renders labels about 15 px wider than Chromium; see `ui-015`. Use the
   widest engine.)
2. **Store and fluid grid.** Add `panelLayoutFor` with its unit test, the store, the observer and
   the variable-driven grid. Panel content is unchanged; only the fluid Library and Inspector
   widths are visible. Existing e2e must stay green.
3. **Operations icons tier.** Add `data-ops-tier`, move the icon-only CSS and add the crossfade.
   The tablet reference now shows icons.
4. **Library refactor, then icons tier.** Extract the row and section components with no visual
   change and a green run. Then add the rail, the tile swatches, the row pop-out, the rail ⋯ menu
   and the Repeat callout.
5. **Library pop-out tier.** Add the section launchers, the section pop-out, the shared
   `openPopout`, the fade during drag and Escape handling.
6. **Operations groups tier.** Add the group launchers with gated enablement and count badges,
   and the group pop-out handing off to member popovers.
7. **Motion and edges.** Add the animating flag, the content-swap ordering, reduced motion, and
   resizing while a pop-out is open or a drag is in progress.
8. **Docs, media, acceptance drive, hand drive.**

If one session can't hold all of this, split stages 4–5 (Library) and 6 (Operations groups) into
their own TODO files that depend on this one's stages 1–3, and say so in the commit.

## Decisions to confirm at `/fix-todo` Step 2

- **Phone Operations toolbar**: keep its three rows of icons (default), or adopt the groups tier
  too, which would cut it to one row? Adopting it changes `ui-043`'s measured budget and the
  phone acceptance drives.
- **After a drop from a pop-out**: stay open (default, faster for repeated placement), or close
  (more of the scene visible)?
- **Tablet reference tier**: Library icons (default, one-step drag) or pop-out (more scene
  width, an extra tap)?
- **Group membership** in the table above, especially where Split and Mirror belong.

## Out of scope

- Phone width (≤ 640 px): the Library sheet and the phone toolbar are unchanged, unless the first
  decision above says otherwise.
- The Inspector's *contents* at narrow width. This task only makes its track fluid (220–280 px)
  so it stops jumping at 1100 px. A compact Inspector is a separate finding if it is needed.
- The header row (`ui-078`).

## Effort

L. This is multi-session layout orchestration across `AppView`, `LibraryPanel` and
`OperationsToolbar`, with a component extraction and a measured budget. It needs the decisions
above confirmed first.

## Testing

- **Unit (`src/stores/panelLayout.spec.js`)**: run a table of widths (641, 700, 733, 734, 779,
  780, 820, 900, 1023, 1024, 1100, 1200, 1259, 1260, 1280, 1440, each with and without chat) and
  check the expected tiers and tracks. Also check the invariants by sweeping `E` from 641 to 1600
  in 1 px steps:
  - tiers are monotonic;
  - adjacent breakpoints are at least 40 px apart;
  - no breakpoint is within 24 px of 820 or 1440;
  - L and I change by at most 1 px per px inside a tier (`toBeCloseTo`, tolerance 0.01);
  - `P ≥ 340`;
  - `phone` is true exactly for W ≤ 640.
- **Unit (`OperationsToolbar.spec.js`, extended)**: in the groups tier, Combine is disabled with
  one solid selected and shows a 4 badge with two selected. Shape's badge counts only the
  exactly-one members. Member test ids are present inside the open pop-out.
- **E2E (new `e2e/panel-tiers.e2e.js`, navigates to `/`)**:
  - **Width sweep** with `page.setViewportSize` over 1440, 1280, 1200, 1024, 1000, 900, 820, 760,
    720 and 660. At each width, assert:
    - `data-library-tier` and `data-ops-tier` match the table;
    - no horizontal scroll (`scrollWidth ≤ clientWidth` on the root);
    - the Operations toolbar's box does not intersect the orientation gizmo, the navigation
      chrome or the scale readout;
    - every rail tile and launcher is at least 44 px (`--tap-compact` 38 px for Operations);
    - the viewport pane is at least 340 px.
  - **Flows**:
    - At 820, drag Cube from the icon rail into the view and check one body is placed.
    - At 820, tap Bolt, change the size in the row pop-out, then drag from the pop-out. Check the
      placed bolt has that size.
    - At 720, open Hardware, drag Nut, and check the pop-out's opacity drops during the drag and
      it is still open after the drop.
    - At 720, select two cubes and check Combine is enabled with a badge. Open it, run Union and
      check the union record. With one cube selected, check Combine is disabled.
    - Check only one pop-out is open at a time across both panels, and that Escape closes a
      pop-out and returns focus.
    - Widen past a breakpoint with a pop-out open and check it closes with no orphaned element.
  - **Snapshots** at all three reference viewports (phone, tablet, laptop, per the Responsive
    Layout rule), plus 720×900 for the groups/pop-out tier, which no reference viewport reaches.
    Note in the spec that no default Playwright project lands in the pop-out or groups tiers,
    which is why this spec sweeps widths.
- **Engines**: all three (Chromium, Firefox, WebKit). This covers touch input, layout differences
  (Firefox label widths, WebKit flex gaps), `ResizeObserver` timing and grid-track animation.
- **Existing specs to re-run in full**: `phone-library`, `phone-toolbar-chrome-fit`,
  `boolean-operations`, `hardware-library-placement`, `kit-rpi-library-placement`,
  `raspberrypi-screen-library`, `library-remember-params`, `user-library` and `viewport-scaffold`.
  The tablet project now gets the icon tier for both panels. Any spec that finds a Library row by
  its visible label text at tablet width must move to the preserved `library-row-<op>` test id,
  not to a tier-specific selector.
- **Acceptance scenarios to re-drive** at 820×1180 and at a hand-resized ~720 px window, in
  WebKit and one other engine: **1** (two primitives), **3** (kit snap placement), **4** (boolean
  gating), **16** (mirror), **18** (a drawing becomes a library part: My parts tile and pop-out)
  and **26** (import STL and subtract: import from the rail ⋯ menu, then Combine). Also re-drive
  **7** (touch navigation) at 820, because the pane width changes there.
- **Closed findings whose repro steps must be re-run**:
  - `ui-072` (phone Library drag does not register): the drag code moves into the extracted row
    component.
  - `ui-043` (phone toolbar overlaps navigation chrome) and `ui-027` (label hiding): the icon-only
    CSS moves.
  - `ui-015` (tablet toolbar overlaps the gizmo's view caps): the container cap must still hold
    in every tier.
  - `ui-070` (phone Inspector tab covers the open Library sheet): `.app__body` variables change.
- **Hand drive**: drag a desktop window edge slowly from 1440 to 390 px and back in Chrome,
  Firefox and Safari, and on a real iPad in portrait, landscape and Split View. Watch for jumps,
  text squash and anything covering the gizmo or navigation chrome. Log only genuine feel
  judgments in `TODO/VERIFY.md`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
