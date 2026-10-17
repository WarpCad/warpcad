---
title: Docs media for the features that do not exist yet (AI chat, My parts, sketch editing, wing and rename)
category: docs
kind: feature
priority: low
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007, ai-006, ui-055, ui-056, sketch-002, sketch-003, sketch-004, sketch-005, sketch-006, sketch-007, sketch-008]
status: done
---

> **Retired 2026-10-17 (`/fix-todo docs-020`).** The file was written when none of its features
> existed; all thirteen dependencies were done by the time it ran, and most of them had already
> added their own media under `docs-007`'s per-task rule. This was the **sweep**: the Media
> inventory was checked row by row against `docs/`, `e2e/docs/` and `docs/media/manifest.json`, and
> only what was missing was added. Two pages the file names never existed: the chat is documented
> in `docs/ai-partner.md` (not `docs/ai-chat.md`) and My parts in `docs/user-library.md` (not
> `docs/library-my-parts.md`). Outcome per row:
>
> - **AI chat panel (`ai-006`)** — *shipped*: `ai-chat-panel`, `ai-chat-overlay-tablet`,
>   `ai-chat-overlay-phone` stills (new `e2e/docs/ai-chat.docs.js`, the scripted provider and the
>   `airfoil-wing` transcript, any call to the Anthropic API fails the test). *Already existed*:
>   `ai-key-entry` is `assistant-key-sheet.png` (placeholder key in a password field).
>   *Skipped*: a separate `ai-chat-prompt-to-part` movie. The only scripted prompt-to-part turn that
>   builds a model is scenario 17's wing, so it would duplicate `ai-wing-airfoil`.
> - **AI wing / board group (`ai-008`, `sketch-008`)** — *shipped*: `ai-wing-airfoil` movie
>   (scenario 17, scripted transcript) and `ai-drawing-to-group` movie (scenario 18: attach, ask,
>   built group, Confirm, My parts 0 to 1; the key is set up before recording). *Already existed*:
>   `curve-helpers` is `sketch-curve-sheet.png` (plus `sketch-airfoil-placed.png`).
> - **Save to library / My parts (`ui-055`, `core-037`)** — *already existed*: `user-library-save`
>   and `user-library-place` movies and the save-sheet still. *Shipped*: `library-my-parts` still
>   (new `e2e/docs/user-library-parts.docs.js`).
> - **Rename (`ui-056`, `core-038`)** — *already existed*: `inspector-rename` movie and
>   `inspector-rename-list` still. Nothing added.
> - **Sketch editing (`sketch-002`...`007`)** — *already existed*: `sketch-vertex-edit` movie,
>   `sketch-trace-photo`/`set-scale`/`scaled` stills (the reference image), `sketch-trace-auto`
>   movie, `sketch-draw-line` movie (the continuous-line tool, `sketch-006`), `sketch-snap` movie
>   with the snap marker visible. *Shipped*: `sketch-select-delete` movie (the select/delete
>   section had only a still).
> - **Print-prep split (`io-007`)** — *already existed*: `split-sheet` still, `print-pieces-popover`,
>   `print-prep-split` and `print-prep-manual-joint` movies. Nothing added.
> - **Timeline tail reparenting (`data-006`)** — *shipped*: `timeline-relink` movie, the page's own
>   worked example (the feature shipped as the **Re-link to the moved step** button, option c).
>
> New specs live in their own files wherever the existing file already had movies, so the sweep did
> not re-record any unrelated movie (a movie is keyed to its spec file's hash). The docs pages
> `ai-partner.md`, `user-library.md`, `sketch-mode.md` and `timeline.md` gained the embeds;
> `selection-and-inspector.md` needed none. Scenarios 17 and 18 were driven by hand against the
> scripted provider only; **no real model, key or network was used**, so the live-model runs stay open.

## Goal

Not buildable today: every feature below is still `status: open`. This file exists so the
shots are *planned*, not so they are captured now. When each feature lands, it should add
its own media — `docs-007` makes that a per-task rule — and this task is the sweep that
catches anything its feature's author missed, plus the compound movies that need several of
them at once.

## Interaction model

n/a — documents existing controls (once they exist).

## Documentation

- **Page** — `docs/ai-chat.md` (new, with `ai-006`), `docs/library-my-parts.md` (new, with
  `ui-055`), updates to `docs/sketch-mode.md` and `docs/selection-and-inspector.md`.
- **Example** — owned by each feature's own spec; this task only checks that one exists and
  that it has a movie where the feature is a motion.

## Media inventory

| Feature (todo) | Media to capture |
|---|---|
| AI chat panel (`ai-006`) | `ai-chat-panel` still; `ai-chat-prompt-to-part` movie driven by the **fake provider** from `ai-010` — never a real API key or network call; `ai-chat-overlay-{phone,tablet}` stills (the panel must overlay the viewport, per CLAUDE.md); `ai-key-entry` still with a placeholder key, field masked |
| AI-drawn wing / board group (`ai-008`, `sketch-008`) | `ai-wing-airfoil` movie (scenario 17 via the fake provider); `ai-drawing-to-group` movie (scenario 18); `curve-helpers` still |
| Save to library / My parts (`ui-055`, `core-037`) | `save-to-library` movie (select group → Save to library → File ▸ New → drag it back in, renders complete); `library-my-parts` still |
| Rename body / group (`ui-056`, `core-038`) | `inspector-rename` movie, plus the Objects list showing the new name |
| Sketch editing (`sketch-002`…`007`) | `sketch-vertex-edit` movie; `sketch-reference-image` still; `sketch-auto-trace` movie; `sketch-select-delete` movie; `sketch-continuous-line` movie; `sketch-snap-existing` movie with snap markers visible |
| Print-prep split (`io-007`) | `export-print-prep` still of the split dialog and a movie of a multi-part export |
| Timeline tail reparenting (`data-006`) | `timeline-reparent` movie |

## Affected files

- new `e2e/docs/*.docs.js` per feature group; new/updated docs pages named above.

## Proposed fix

Re-read each depended-on task when this one is picked up: some will have changed shape or
been dropped, and the table above must be corrected to what actually shipped rather than
what was planned. Any AI movie is recorded against the fake provider and canned responses —
a docs run that calls a real model is both non-deterministic and a key-leak risk.

## Effort

L

## Testing

- Same rule as the sibling tasks: each movie asserts its end state; stills pass
  `docs:screenshots` twice.
- Engines: Chromium only for pictures.
- `TODO/ACCEPTANCE.md`: scenarios 17 and 18 (`ai-010`) — drive by hand. Closed findings:
  whichever the depended-on tasks list.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
