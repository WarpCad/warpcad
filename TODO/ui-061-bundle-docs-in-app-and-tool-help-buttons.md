---
title: Ship the documentation inside the app and put a help button on every tool pop-up
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M14
depends: []
status: open
---

## Goal

Requested by the user on 2026-10-10:

> *"Add a todo to make the documentation part of the app bundle and exposed through the main
> UI. Pop-up boxes for tools should include a help icon/button that will show info on how to use
> that tool."*

Today `docs/*.md` (with the screenshots in `docs/screenshots/` and GIFs in `docs/media/`) lives
only in the repository. A person using the installed PWA, offline, on a phone, has no way to
read how a tool works without leaving the app and finding the repo. "Done":

1. The built app contains the documentation (pages and pictures), served from the same origin
   and precached by the service worker, so it opens **offline** and always matches the
   version of the app that is running.
2. The main UI has a **Help** entry that opens the docs inside the app (a table of contents
   and the page), without navigating away from the document being edited.
3. Every tool pop-up, popover and sheet carries a **?** button in its header that opens the
   docs page, scrolled to the section for exactly that tool.

## Proposed work

1. **Bundle the docs.** A build step (a Vite plugin or a `scripts/` pre-build, under the
   AGPL code licence; the prose stays CC BY-SA 4.0) renders `docs/*.md` to HTML at build time
   and emits `help/<page>.html` fragments plus an index. Pictures are copied as-is.
   - Rendering happens at **build time**, so no Markdown parser ships in the runtime bundle.
   - Exclude `docs/decisions/` and `docs/montage/` (developer material) from the bundle; say
     so in the plugin so the choice is visible.
   - Rewrite relative image links to the bundled paths. A dead link fails the build, in
     the same spirit as `e2e/docs-media.spec.js`.
   - Add the generated files to the `vite-plugin-pwa` precache list. Check the size delta
     against the bundle budget and lazy-load the GIFs (`loading="lazy"`), since they dominate.
2. **A tool-to-docs map.** One small module, `src/help/topics.js`, maps a stable **topic id**
   (`align`, `snap`, `boolean`, `fillet`, `mirror`, `resize`, `bisect`, `export`, `resolution`,
   `sketch`, `trace`, `library`, ...) to `{ page, anchor }`. Pop-ups reference the topic id,
   never a URL, so a docs page rename touches one file. A unit spec fails if a topic's
   page or anchor does not exist in the bundled docs (this is what keeps help from rotting).
3. **A `HelpButton` component** in `src/components/controls/`: a `?` icon button with
   `data-testid="help-<topic>"`, `aria-label="Help: <tool name>"`, and a 44px tap target.
   It calls `help.open(topic)` on a small UI-only Pinia store (`src/stores/help.js`:
   `open`, `topic`, `close`).
4. **A `HelpSheet`** in `src/components/layout/`, mounted once in `AppView.vue` beside the
   other sheets: loads the bundled fragment for the topic, scrolls to the anchor, has a
   table-of-contents list, **Back/Close**, and in-page links that stay inside the sheet.
   Teleported at the modal tier above the pop-ups (see `ModalShell.vue`), so opening it
   from a pop-up does not close the pop-up or lose the selection it depends on.
5. **Add `HelpButton` to every tool surface**: the operations toolbar pop-ups (boolean, align,
   snap, mirror, fillet/chamfer, resize, bisect/split, pattern), the Export and Resolution
   popovers, the sketch tool sheets (Curve, Slice, Trace, Scale, Reference image), the
   Library and Save-to-library sheets, the Project settings dialog and the chat panel. Put
   it in the header of each; for `ModalShell` add an optional `helpTopic` prop so every
   dialog gets it by passing one string.
6. **A Help entry in the main UI**: **Help** in the File ▾ menu's neighbour (or the
   overflow menu at phone width) opening `HelpSheet` at the Getting started page; also bind
   `?`/`F1` on a keyboard (not when a text field is focused).
7. **Deploy path unchanged**: no router, no history-API routes (`CLAUDE.md`). The open
   topic may be mirrored into the hash (`#/help/align`) so it can be shared; the document
   hash (`#/gist/<id>`) keeps priority and is never overwritten.

## Interaction model

- **Precondition**: none. Help is available with nothing selected and while a tool pop-up
  is open; opening it changes neither the selection nor the active tool.
- **Trigger**: the **?** button in a tool pop-up/sheet header, or **Help** in the main menu,
  or `?`/`F1` on a keyboard.
- **Feedback**: the Help sheet opens on the right page, scrolled to the tool's section with
  the heading briefly highlighted. Closing it returns to exactly the pop-up that was open,
  with its fields as they were.
- **Placement**: n/a (not a geometry-creation feature).
- **Selection response**: none; the Help sheet is not driven by selection.
- **Selection count**: n/a. The **?** button is always enabled, even when the tool it
  documents is disabled, because "why can't I use this" is the commonest question.
- **Small-screen behavior**: at phone width the Help sheet is a full-width, top-anchored
  sheet (not bottom-anchored, same reason as `ModalShell`: the keyboard), images
  `max-width: 100%`, the table of contents collapsed behind a **Contents** button. The **?**
  buttons stay inside the pop-up header and never push its title off-screen at 390px.

## Documentation

- **Page** — new `docs/help.md` ("Using the built-in help") and updates to
  `docs/getting-started.md` and `docs/README.md`; each existing tool page keeps a stable
  `## <Tool name>` heading that `src/help/topics.js` anchors to (note any heading rename in
  the topic map's spec).
- **Example** — "Select two boxes, open **Align**, click the **?** in the pop-up's header.
  The Help sheet opens on *Align and snap*, at the *Align* section. Close it with **×**:
  the Align pop-up is still open with your axis choices intact. Then open **File ▾ → Help**
  to browse every page, and turn the network off to confirm it still opens."
- **Media** — new `e2e/docs/help.docs.js`: still `help-from-popup.png` (Align pop-up with
  the Help sheet over it), still `help-contents-phone.png` (phone Contents list), GIF
  `help-open-close.gif` (open from a pop-up, close, pop-up intact); embedded in `docs/help.md`.

## Effort

M (a few hours): the build step and PWA precache are the only parts with real risk; adding
the button to ~20 surfaces is mechanical once `ModalShell` takes a `helpTopic`.

## Testing

- **Unit (Vitest, next to source)**: `src/help/topics.spec.js` — every topic id resolves to
  an existing bundled page and an anchor that exists in it (the rot guard); every pop-up
  component source that renders a header uses `HelpButton` or declares `helpTopic`
  (a lint-style spec listing the allowed exceptions by name). Build step spec: links
  rewritten, a dead image link fails, `decisions/` excluded.
- **E2E (`e2e/help.e2e.js`, navigates to `/`)**: open Align with two bodies selected, click
  **?**, assert the sheet shows the Align section and the selection and pop-up survive
  closing it; open **File ▾ → Help**, follow a link between two pages; with the context
  offline (`context.setOffline(true)` after the service worker is active) the sheet still
  loads text and an image. Runs at **all three reference viewports** with a snapshot at each
  (phone sheet layout differs).
- **Engines**: all three (Chromium/Firefox/WebKit): offline service-worker caching is the
  engine-sensitive path, and WebKit's service-worker lifecycle differs.
- **Acceptance scenarios to re-drive (Step 6)**: scenarios that open a tool pop-up
  (place-then-snap/align, boolean, Pi placement) — a new header button must not shift the
  pop-up's other controls or steal focus. No new scenario is needed; add one help step to
  an existing scenario if the next free-form pass finds it worthwhile.
- **Closed findings re-run**: `ui-026` (Snap/Align popovers), `ui-035` and `ui-050` repros
  where they touch the pop-up headers. If `ui-060` (one Align tool) has landed first, run
  against its pop-up instead, and use its heading in the topic map.
- **Docs media**: `npm run docs:media`, then `e2e/docs-media.spec.js` (the `guards`
  project) must pass: no dead link, no orphan, no unclaimed picture.

## Notes

- Ordering with `ui-060`: that task rewrites the Align/Snap pop-up and its docs page. Either
  order works, but whichever lands second should adopt the other's heading names rather
  than redo them. Do the `HelpButton` wiring for that pop-up last.
- Not in scope: a full-text search box over the docs, translations, or a guided tour. File
  them separately if the plain Help sheet turns out to want them.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
