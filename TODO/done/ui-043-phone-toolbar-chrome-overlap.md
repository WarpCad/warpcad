---
title: At 390px the navigation chrome rides up over the Operations toolbar when one body is selected and the Inspector sheet is open
category: ui
kind: finding
priority: medium
model: sonnet
milestone: M6
depends: []
status: done
---

> ## What actually shipped, and the decisions behind it
>
> **Reproduced the file's own numbers exactly, then found a second overlap it never measured.**
> At 390x844 WebKit, one body selected, Inspector open: toolbar `top 61, bottom 228`, chrome
> `top 207, bottom 407` — the file's own 21px overlap, bit-for-bit. The file's own "not measured"
> combination — **two** selected with the Inspector (not Objects) sheet open — turned out to
> overlap too, by **6px** (`toolbar bottom 213` against the same `chrome top 207`), because the
> button-row footprint alone (11 icon buttons, 3 wrapped rows, ~122px) already used almost the
> entire 146px budget between the toolbar's top and the chrome's top, before the badge's line
> count was even considered. Un-wrapping the badge alone (option (a) as literally stated) would
> have closed the 21px case to ~6px and left it — and the 2-selected case — still overlapping.
>
> **Fix shipped: option (a), extended.** Both changes live inside `OperationsToolbar.vue`'s own
> existing `@media (max-width: 640px)` block, nothing else touched:
> 1. The disabled-state legend gets a phone-only short form (`DISABLED_HINT_SHORT`, "select 2+"),
>    swapped in by CSS below 640px so it never wraps to a second line. The full sentence
>    ("Select 2 or more solids") is untouched everywhere else — `titleFor`'s `title`/`aria-label`
>    still returns it at every width, this toolbar's own established long-press affordance, so a
>    phone user loses nothing, confirmed by reading `title` off a real disabled button in the
>    drive below.
> 2. `.ops`'s own container `gap`/`padding` and `.ops__row`'s row-gap are trimmed (6px→2px,
>    4px→"2px 4px", 4px→2px) — pure breathing-room, not `--tap-compact` (the 38px touch-target
>    token `NavigationChrome.vue`/`SketchToolbar.vue` also read) and not any bottom sheet's
>    height.
>
> **Option (b) (anchor the chrome to the toolbar's real measured bottom) was considered and
> rejected, with a reason the file couldn't have had**: measuring showed the vertical band
> available to `[toolbar + margin + chrome]` above the Inspector sheet's own worst-case top is
> already fully allocated — chrome's current position already sits only ~19-20px above the
> Inspector sheet's own worst-case (38vh) top edge, a deliberate belt-and-braces margin for a
> body with a long name/breadcrumb. Moving the chrome *down* to give the toolbar more room would
> spend that margin, risking a *new* overlap against the Inspector sheet itself in exactly the
> case the margin exists for. There was no slack on the chrome side to reclaim; the toolbar's own
> footprint was always the thing that had to shrink, which is what a ResizeObserver-driven chrome
> position would not have changed on its own — it would have needed the toolbar shrink too, for
> no benefit over doing that alone. So this is not "option (a) because it's simpler" but "option
> (a) because measurement showed option (b) had nothing to spend."
>
> **After the fix**, both previously-broken states (1- and 2-selected, Inspector open) measure a
> uniform 140px toolbar height against the same `chrome top 207` — a **6px clear gap**, not zero,
> confirmed by both the new standing e2e spec and a real hand-drive (drag-drop + click, not
> store-seeded) in WebKit and Chromium. The margin is real but not large; a real-iPhone-Safari
> font-metric check is logged in `TODO/VERIFY.md` rather than assumed identical to this sandbox's
> WebKit.
>
> **Every previously-safe state stayed safe, measured, not assumed**: Objects/History sheet open
> (`ui-041`/`ui-042`'s own regression surface) went from -13px/-28px gaps to -40px (even more
> headroom, since the toolbar itself is shorter now); a taller Objects sheet with a composite
> expanded (`ui-042`'s own part rows) does not reintroduce anything. `ui-010`'s Library-tab
> repro, `ui-032`'s History-sheet repro and `ui-035`'s 390px popover-fit repro were all re-run
> against the fixed code and are unaffected — see Step 6 below.

## Problem

Found by measuring bounding rectangles while building `ui-041`, and **present on the commit
before that task** (identical numbers with `ui-041`'s changes stashed): at **390x844**, with
exactly **one** body selected and the Inspector's bottom sheet open, the navigation chrome
overlaps the Operations toolbar by **21px**.

Measured (WebKit, phone viewport): Operations toolbar `top 61, bottom 228`; navigation chrome
`top 207, bottom 407`; Inspector `top 426`. The chrome's "Orbit / Pan / Select" row lands on the
toolbar's last button row (Enlarge / Fit / Bisect), which is the state a hand-drive of the app
shows in a screenshot and a `.spec.js` cannot.

**Why.** `AppView.vue` insets the viewport's overlays by `--viewport-bottom-inset`, and
`--inspector-sheet-height` (38vh) is a *constant*. The toolbar's height is not: with one body
selected its badge wraps to two lines (`1 selected` / `select 2 or more solids`), so the toolbar
is ~167px tall; with two selected and the Objects sheet open it measured 152px (`bottom 213`,
a 28px gap to a chrome at `top 241`). The Inspector-sheet-open + two-selected combination was
**not** measured, so whether the overlap is specific to one selected body is unconfirmed. `ui-040`'s retirement note
already recorded "~4px of slack" between the two at 390px — the margin has been that thin
since; nothing re-checked it when the badge text grew.

## Affected files

- `src/views/AppView.vue` — the phone `--viewport-bottom-inset` arithmetic.
- `src/components/viewport/OperationsToolbar.vue` — the badge's wrap at phone width.
- `src/components/viewport/NavigationChrome.vue` — its bottom anchoring.

## Proposed fix

Either stop the badge wrapping at phone width (a shorter `select 2+` string under 640px) or
anchor the chrome relative to the toolbar's real bottom rather than to a constant sheet height.
Do not "fix" it by shrinking the sheet: `--bottom-panel-height`'s own comment records why 34vh
was already the arithmetic ceiling for History.

## Effort

S.

## Testing

- A real `*.e2e.js` at 390x844 that selects one body (Inspector open, then Objects open, then
  History open) and asserts the toolbar and the chrome **do not intersect**, and that every
  toolbar button and the chrome's Orbit/Pan/Select pass a trial click. `ui-035`'s phone spec is
  the pattern.
- **`ACCEPTANCE.md` scenarios 4 and 7** re-driven at phone width. Extends the subsystem `ui-010`,
  `ui-035`, `ui-040` and `ui-032` each found a phone overlap in; re-run their original repros.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
