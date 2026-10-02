---
title: Docs media — phone and tablet captures, and a "Using WarpCad on a phone or tablet" page
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007, docs-008, docs-009]
status: open
---

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
