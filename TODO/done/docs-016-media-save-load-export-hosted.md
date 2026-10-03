---
title: Docs media — File menu, Save/Open/New, save status, Export, hosted backend connect
category: docs
kind: feature
priority: medium
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007]
status: done
---

## What actually shipped (2026-10-03)

All ten inventory rows landed, plus one extra still, `file-menu-connected` (the File menu once
a repository is connected, because the unconnected menu cannot show Save to / Load from /
Auto-push / Replace token / Disconnect, so "every entry visible" needs both). Two specs,
`e2e/docs/save-load.docs.js` and `e2e/docs/export.docs.js`, one new fixture
(`cube-cylinder-union.ndjson`, carrying a `normal` resolution record: a file with no resolution
opens as Legacy, which would have put "Legacy (32 segments)" in the pictures). Both pages embed
their media.

Deviations from the spec text, all found by checking the page against the real UI:

- **The example's `model.stl` is `union-1.stl`**: a body is named after itself, lowercased
  (`docs/export.md` already said so further down). The new "Try it" section says `union-1.stl`
  and notes a cube would be `cube-1.stl`.
- **The File menu has three groups, not two**: a Design group (Resolution) sits between this
  device and Hosted storage. The page now says so.
- **`save-status` "unsaved" is the red "Not saved" state**, produced by making IndexedDB refuse
  transactions (docs-only init hook); "Saving..." is produced by holding the autosave debounce.
  Both hooks live in the spec, nothing in `src/` changed. The clock digits are rewritten in
  place instead of masking the chip.
- **The hosted token field is a password input**, so the Connect picture shows dots; the spec
  asserts the DOM value is only `ghp_EXAMPLE`, that no `github_pat_`/`gh?_` token-shaped string is
  in the HTML, visible text or inputs, that every request carried that header, and that nothing
  left for a non-mocked origin.
- **The conflict dialog carries a second sentence** ("Nothing is merged. Load remote also
  replaces any edits you have not pushed...") that the page's quotation of it omitted; the
  picture now sits above the three-button list.
- The reload movie places a cube and a cylinder (no Union) to stay under 12 s; the page says so.

## Goal

Persistence and export are menus and dialogs, so stills carry most of the load, with two
short movies (save → reload → still there; export). Embed in `docs/save-load.md` and
`docs/export.md`.

## Interaction model

n/a — documents existing controls.

## Documentation

- **Page** — `docs/save-load.md`, `docs/export.md` (update both).
- **Example** — "Open File ▸ Export, choose **STL**, and press Export — a `model.stl` file
  downloads."

## Media inventory

Specs: `e2e/docs/save-load.docs.js`, `e2e/docs/export.docs.js`.

| Name | Kind | Shows | Page |
|---|---|---|---|
| `file-menu` | still | File menu open, every entry visible (`ui-033`). | save-load |
| `save-status` | still | Save-status indicator in saved / saving / unsaved states (three crops). Mask any timestamp. | save-load |
| `save-reload-roundtrip` | movie | Place, wait for saved, reload the page, model is still there (scenario 10). | save-load |
| `new-project-confirm` | still | File ▸ New confirm dialog when there are unsaved changes (`ui-054`). | save-load |
| `open-project` | movie | File ▸ Open a saved project; scene appears. | save-load |
| `replace-confirm-dialog` | still | Replace-confirm dialog. | save-load |
| `hosted-connect-dialog` | still | Hosted (git-backed) connect dialog (`io-002`). **Use an obviously fake token such as `ghp_EXAMPLE`; never a real credential.** | save-load |
| `hosted-conflict-dialog` | still | The conflict dialog after a stale write. | save-load |
| `export-popover` | still | Export popover: STL / OBJ / glTF choices, resolution (`ui-034`). | export |
| `export-download` | movie | Export STL; the download is triggered and its filename shown. | export |

## Affected files

- two specs, two docs pages, `docs/screenshots/*`, `docs/media/*`.

## Proposed fix

Hosted backend: mock `fetch` at the boundary (CLAUDE.md's "mock at the boundary" rule) with
`page.route` returning canned responses — the docs run must never touch the network or a
real repo. Persistence stills need the IndexedDB state seeded *before* load so the
reload movie is repeatable. Do not publish a dialog containing a real-looking secret; the
spec asserts the screenshot contains only the fake token string.

## Effort

M

## Testing

- Reload movie asserts body count survives the reload; export movie asserts a download
  event with the expected extension.
- Engines: **Chromium only** for the pictures. Note that IndexedDB behaviour itself is
  already gated across all three engines in `local-persistence.e2e.js` — this task adds
  pictures, not a persistence gate. Viewports: laptop (phone file menu is `docs-018`).
- `TODO/ACCEPTANCE.md`: scenarios 8 (remote-load safety), 10 (save/reload), 11 (export),
  14 (delete/bring back/reload) — drive by hand after landing. Closed findings: re-run
  `io-004`/`io-005` (open edges on export) repros against the exported mesh the movie shows.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
