---
title: Docs media — phone and tablet captures, and a "Using WarpCad on a phone or tablet" page
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007, docs-008, docs-009]
status: done
---


> **What shipped (2026-10-03, unattended `/run-todos`).** Everything in the inventory except the
> deferred `mobile-ai-chat-overlay-*` row: a new `docs/mobile.md`, linked from `docs/README.md`
> and with a one-sentence "On a phone, ..." line at the top of `primitive-placement`,
> `selection-and-inspector`, `booleans`, `viewport-navigation`, `sketch-mode`, `save-load`,
> `export` and `timeline`; `e2e/docs/mobile.docs.js` (12 stills, 3 movies, run in `docs-phone`
> and `docs-tablet`, skipped at laptop width); `startMovie` gained an optional recording size so
> a portrait phone is not squashed into 960x600; and the `docs:screenshots`, `:update` and
> `docs:movies` scripts now include the tablet and phone projects. Nothing under `src/` changed.
> Every gesture is a trusted CDP `Input.dispatchTouchEvent` (one finger, two fingers, and a
> two-point pinch), with end-state assertions: a body placed, the camera target and distance
> changed, the triad's Top cap snapping elevation to 90, and Subtract taking two bodies to one.
> **Chromium captures are not a substitute for checking on real phone and tablet hardware, or for
> the WebKit touch path** (`TODO/VERIFY.md`, `ui-045`). Deviations from the spec, all recorded
> on the page:
>
> - **No "press and hold".** A Library row drags the moment a finger moves on it (the row has
>   `touch-action: none`); the example now says to press the row and drag.
> - **Tablet has no sheets.** The Library and Inspector are persistent columns at 820 px, so
>   `library-sheet-tablet` and `inspector-sheet-tablet` show columns, and the page says so.
> - **A tap does not add to a selection.** `mobile-subtract` selects two bodies with Select mode
>   and a finger-drawn box (the documented touch route) rather than "tap two bodies"; the
>   Objects-list tick boxes are the other route and are described on the page.
> - **Inspector auto-open vs a synthesized click.** Driving a trusted tap on a body whose spot
>   ends up under the raised sheet's top edge (y 426 at 390x844) opened the sheet and closed it
>   again 7 ms later (the browser's follow-up click lands on the tab, which toggles). Stills and
>   movies therefore pan the scene up first and tap above the sheet edge. Logged in `TODO/VERIFY.md`
>   as something to try on a real phone, not fixed here.
> - A finger that lands on a selected body's gizmo arrow claims the gesture, so a pinch starting
>   there does not zoom. Driver note, consistent with grabbing an arrow.
> - `mobile-pinch-pan.gif` is 1.37 MB (8 fps, 260 px wide) and the other two are under 0.31 MB.

## Goal

`CLAUDE.md` makes phone (390×844) and tablet (820×1180) first-class targets, and the
interaction model reflows substantially there (Library and Inspector become sheets, the nav
chrome folds behind `nav-expand-toggle`, the toolbar moves). Every doc page so far shows the
laptop layout only, which would tell a phone user that half the controls do not exist.
This task captures the reflowed layouts and gives them a home.

## Interaction model

n/a — documents existing controls.

## Documentation

- **Page** — **new** `docs/mobile.md` ("Using WarpCad on a phone or tablet"), linked from
  `docs/README.md` and from the top of each laptop-first page that has a different phone
  layout (one sentence: "On a phone, this lives in …").
- **Example** — "On a phone, tap **Library**, press and hold **Cube**, drag it up into the
  3D view and lift your finger. Two-finger drag pans; pinch zooms; tap the orientation cube
  to snap the view."

## Media inventory

Spec: `e2e/docs/mobile.docs.js`, run in `docs-phone` and `docs-tablet`. File names carry the
viewport: `<name>-phone.png`, `<name>-tablet.png`.

| Name | Kind | Shows | Viewports |
|---|---|---|---|
| `app-overview-{phone,tablet}` | still | Whole app at each size, empty scene. | both |
| `library-sheet-{phone,tablet}` | still | Library as a bottom sheet / side panel. | both |
| `inspector-sheet-{phone,tablet}` | still | A selected body with the Inspector sheet raised. | both |
| `operations-toolbar-{phone,tablet}` | still | Toolbar placement with two bodies selected (`ui-043`). | both |
| `nav-chrome-folded-phone` / `nav-chrome-open-phone` | still | Nav chrome behind `nav-expand-toggle`, folded then open (`ui-046`). | phone |
| `file-menu-phone` | still | The File menu at phone width. | phone |
| `sketch-sheet-phone` | still | Sketch panel as a sheet (`SketchPanelSheet`). | phone |
| `mobile-drag-cube` | movie | Touch drag from the Library sheet into the view (touch pointer type). | phone |
| `mobile-pinch-pan` | movie | Two-finger pan and pinch zoom (scenario 7). | phone |
| `mobile-subtract` | movie | Select two bodies by tapping, press Subtract. | phone |
| `mobile-ai-chat-overlay-*` | — | **Deferred** to `docs-020` (the chat panel does not exist yet; CLAUDE.md requires it to overlay the viewport at these widths). | — |

## Affected files

- `e2e/docs/mobile.docs.js`, `docs/mobile.md` (new), `docs/README.md`, small cross-link
  edits in the laptop pages, `docs/screenshots/*`, `docs/media/*`.

## Proposed fix

Touch input in Playwright is `page.touchscreen.tap` plus CDP `Input.dispatchTouchEvent` for
drags and two-finger gestures (Chromium only — which matches this task's engine scope).
Pinch is not built into Playwright; script it with two CDP touch points moving apart. Cross-
link from laptop pages in one pass at the end rather than per spec, to avoid merge churn
with `docs-008`…`017`.

## Effort

L

## Testing

- Movies assert end state (body placed, pan offset changed, boolean applied).
- Engines: Chromium only for pictures. **Not** a substitute for the real-device checking
  `CLAUDE.md` demands on actual phone/tablet hardware and the WebKit touch path — say so on
  the page's PR.
- `TODO/ACCEPTANCE.md`: scenario 7 (touch-only navigation) — drive by hand on a real device
  after landing. Closed findings: re-run `ui-043` (phone toolbar chrome overlap), `ui-045`
  (WebKit touch tap-select after empty tap) and `ui-046` repros.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
