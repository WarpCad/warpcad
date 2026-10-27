---
title: Write the warpcad.com home page, with every documentation page linked into the app's Help
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M20
depends: [build-021, docs-028]
status: open
---

> **Two repositories.** The page is built in `~/src/@WarpCad/warpcad.github.io`. This
> repository gains a line in `docs/README.md` and `README.md` once the page is live
> (`build-022`), and this file's retirement. Commit each repository separately.

## Goal

Someone who hears "WarpCad" and types `warpcad.com` should learn in one screen what it is,
open the app in one tap, and find the documentation page for what they want to do. Today that
domain shows a Squarespace parking page, and the docs can only be found from inside the app.

Done means the home page in `warpcad.github.io` has, in this order:

1. **Hero**: the name, one sentence ("Parametric CAD in your browser: drag-to-place solids,
   booleans, sketches, and an AI partner." It matches the GitHub repository description), the
   primary **Open WarpCad** button (`https://app.warpcad.com/`), a secondary **Read the docs**
   button (scrolls to section 3), and the `app-overview.png` screenshot with the alt text the
   docs already use.
2. **What it does**: four to six short items, each with a one-line description and a link to
   its docs page: placing shapes (`primitive-placement`), combining them (`booleans`), real
   hardware and Raspberry Pi parts (`hardware-library`), working on a phone (`mobile`), the AI
   partner and MCP (`ai-partner`, `mcp`), exporting for printing (`export`, `print-prep`). Each
   claim must be true of the hosted app today. Check each against its page.
3. **Documentation** (`id="docs"`): **every** page in the app's `help/index.json`, grouped, each
   linking to `https://app.warpcad.com/#/help/<slug>` with the index's title as its text. Start
   here comes first, with Getting started emphasised.
4. **Free and open source**: the source repository, the licences (AGPL-3.0-or-later code,
   CC BY-SA 4.0 docs) and a link to `LICENSING.md`. Hosting the app is not distributing it, but
   AGPL §13's source offer should be one tap from the front door.
5. **Support**: report a problem or ask a question (GitHub Issues on `WarpCad/warpcad`). If
   `docs-026` question 10 made this the App Store support URL, it also states how to get help with
   the iOS app.
6. **Footer**: privacy (`#/help/privacy`; the home page itself sets no cookies and loads nothing
   from third parties), the source, and the copyright and licence line. An **App Store** badge
   appears only when `site.json`'s `appStoreUrl` is set. Leave it empty until `build-020` ships.

### Docs grouping (`docs-groups.json`, proposed)

| Group | Slugs |
|---|---|
| Start here | `getting-started`, `mobile`, `viewport-navigation`, `help` |
| Building a model | `primitive-placement`, `hardware-library`, `selection-and-inspector`, `booleans`, `groups`, `snap-align`, `fillet-chamfer`, `resize-bisect`, `mirror`, `variables`, `sketch-mode`, `sketch-tracing`, `user-library`, `bill-of-materials` |
| History and files | `undo-redo`, `timeline`, `save-load`, `merging`, `export`, `print-prep`, `resolution` |
| The AI partner | `design-intent`, `ai-partner`, `mcp`, `webmcp` |
| About | `privacy`, `readme` (as "All documentation") |

That covers all 31 slugs in the live index as of 2026-10-24. The build fails on a grouped slug
the index does not have. An index slug in no group goes under **More**, so a docs page added in
WarpCad appears on the home page at the next daily rebuild, even before anyone files it into a
group.

## Interaction model

- **Precondition**: none. The page is static and works with JavaScript off.
- **Trigger**: **Open WarpCad** (`data-testid="open-app"`); **Read the docs**
  (`data-testid="read-docs"`, an in-page anchor to `#docs`); each docs link
  (`data-testid="doc-<slug>"`); the feature items' links; Source, Support and Privacy in the
  footer.
- **Feedback**: Open WarpCad opens the app in the same tab. A docs link opens the app with the
  Help sheet already open on that page (the contract `testing-012` proves). Read the docs
  scrolls to the Documentation heading and moves focus to it. External links (GitHub) open in a
  new tab with `rel="noopener"`, and links into the app open in the same tab.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior** (designed phone first): at 390×844 the hero stacks with the buttons
  full width above the screenshot. What it does is one column. Each docs group is a heading with
  a plain list (no accordion, so the page is searchable with Find in page). Tap targets are at
  least 44 px tall with 8 px between them, and there is no horizontal scroll. At tablet width the
  feature items and docs groups go to two columns. At laptop width the hero is side by side and
  the docs groups use three columns.

## Documentation

- **Page**: this repository's `docs/README.md` "Using WarpCad" gets one sentence: "The home page,
  **https://warpcad.com**, links every page here into the app." The root `README.md` gets the
  same link beside the existing **Open WarpCad at app.warpcad.com**. Both land **after**
  `build-022` puts the domain live, not before, so neither file points at a parking page. If
  `build-022` has not run, leave these two edits to it and say so in the retirement note.
- **Example** (goes in the home repository's `README.md` "What the page does", and is the
  script for `build-022`'s live check): "Open `warpcad.com` on your phone. Scroll to
  **Documentation → Building a model** and tap **Combining shapes: Union, Subtract and
  Intersect**. WarpCad opens with that page in the Help sheet. Press **×**, and you are in an
  empty scene, ready to place a Cube."
- **Media**: the hero screenshot is `app-overview.png`, produced by this repository's
  `e2e/docs/*.docs.js` and fetched at build time, never re-captured. The home page's own e2e
  snapshots are test baselines, not published pictures.

## Affected files

**`~/src/@WarpCad/warpcad.github.io`:**

- `src/index.html`, `src/styles.css`: the sections above.
- `site.json`: `appUrl`, `helpIndexUrl` (`https://app.warpcad.com/help/index.json`),
  `screenshotUrl`, `repoUrl`, `issuesUrl`, `appStoreUrl` (empty).
- `docs-groups.json`.
- `scripts/build.mjs`: fetches the index and screenshot (bounded timeout, one retry), renders the
  docs list and feature links into the HTML, and writes `dist/help-index.snapshot.json` so a
  deploy records what it linked. If the fetch fails, the build fails, and the previous deploy
  stays up.
- `scripts/check.mjs`: every `#/help/<slug>` in `dist/index.html` is in the fetched index; every
  `https://` link returns 2xx or 3xx on `HEAD`; every `<img>` has non-empty `alt`.
- `e2e/home.e2e.js` (extended).
- `src/index.html` `<head>`: title, meta description, canonical `https://warpcad.com/`, Open Graph
  and Twitter card using `github-social-preview.png`, favicon, and a CSP `<meta>` with
  `default-src 'none'; img-src 'self'; style-src 'self'; script-src 'none'; base-uri 'none';
  form-action 'none'`.

**This repository** (after `build-022`): `docs/README.md`, `README.md`.

## Proposed fix

1. Fetch the live index and confirm the 31 slugs above still match. Adjust the table if docs
   pages were added or renamed since 2026-10-24.
2. Write the copy for App Store readers and newcomers, not for contributors. Run it through
   `/humanize`. Keep the hero sentence under about 15 words.
3. Build the docs list from the index at build time (decided in `docs-026` question 5). No
   client-side script.
4. Check every claim in What it does against its docs page on the live app.

## Effort

M.

## Testing

- **`e2e/home.e2e.js` navigates to `/`** of the locally served `dist/` (built against a fixture
  index and screenshot in `e2e/fixtures/`, so the e2e needs no network). It asserts:
  - Open WarpCad's `href` is `https://app.warpcad.com/`.
  - Every slug in the fixture index has exactly one `doc-<slug>` link, its text is the index
    title, and its `href` is `https://app.warpcad.com/#/help/<slug>`.
  - A slug present in the fixture index but missing from `docs-groups.json` appears under **More**.
  - A fixture with a grouped slug removed makes `npm run build` exit non-zero (`node --test`).
  - Read the docs scrolls `#docs` into view and focuses its heading.
  - No horizontal scroll, and every link's box is at least 44 px tall at phone width.
  - Dark and light colour schemes both pass an axe-core contrast check, if axe is added as a
    devDependency (an owner licence decision; otherwise a computed-colour contrast check).
  - Snapshots at each viewport, in both schemes.
- **All three engines × all three viewports**: a layout spec, and WebKit is iPhone Safari.
- `npm run check` against the real built page, with network, before the commit.
- **Cross-repo**: open three docs links from the built page against `http://localhost:4173` →
  `https://app.warpcad.com` by hand, at phone width: `getting-started`, `booleans`, `privacy`.
  Each opens Help on its page. This is the human version of `testing-012`'s spec.
- **Acceptance scenarios**: none in the app (no app code changes). `testing-012` covers the
  entry point.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
