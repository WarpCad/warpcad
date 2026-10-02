---
title: Docs media for the features that do not exist yet (AI chat, My parts, sketch editing, wing and rename)
category: docs
kind: feature
priority: low
model: sonnet
milestone: M10
depends: [docs-005, docs-006, docs-007, ai-006, ui-055, ui-056, sketch-002, sketch-003, sketch-004, sketch-005, sketch-006, sketch-007, sketch-008]
status: open
---

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
