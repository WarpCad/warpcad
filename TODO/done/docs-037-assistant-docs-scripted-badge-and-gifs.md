---
title: Reword the Assistant page's Scripted-badge paragraph and re-record its two GIFs so a stranger can follow them
category: docs
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-17 from OWNER.md Q10 (VERIFY.md docs-020 #1)
depends: []
status: done
---

> **Shipped (2026-11-19).** Paragraph reworded and both GIFs captioned in `docs/ai-partner.md`. Both movies re-recorded with the two dark twins the media check requires (four GIFs), converted through a scoped moviesDir, never `docs:gifs`. The wing movie ends on the Home view stepped in and held; the wing GIF dropped from 10 to 8 fps to stay inside the size budget. The drawing movie scrolls to the Image-sent notice and holds 3.5 s. The cold read (one fresh agent) found it CLEAR; its leftover note (parts are small in the wing frame) is logged in VERIFY.md.


## Problem

`docs/ai-partner.md` (around line 154) explains the *Scripted* badge as the app's "built-in scripted replay
(a recorded turn…)". Two cold readers (`testing-029`, 2026-11-14) split. One found the paragraph jargon-heavy
and the *Connected* line never shown. On the GIFs, one found `ai-wing-airfoil.gif` and
`ai-drawing-to-group.gif` clear; the other said the wing's blocks do not read as a wing and the *Connected* and
image notices go unexplained. The owner chose to reword the paragraph **and** re-record both GIFs (OWNER.md Q10,
2026-11-17).

## Affected files

- `docs/ai-partner.md` (the Scripted paragraph and the two GIFs' captions)
- `e2e/docs/ai-chat.docs.js` (`ai-wing-airfoil` and `ai-drawing-to-group` movies)
- `docs/media/ai-wing-airfoil.gif`, `docs/media/ai-drawing-to-group.gif`

## Proposed fix

1. Paragraph: one plain sentence first. The pictures come from a recorded example that replays in the app
   (no model, no key, no network), which is why they carry a *Scripted* badge your own chat will not have.
   Then say what *Connected* means when it appears.
2. Wing GIF: end on a view where the four bodies clearly read as a wing (an angled view after the turn lands,
   held for a beat), with a caption naming what landed.
3. Drawing GIF: hold on the image notice long enough to read, and caption it.
4. **Re-record only these two movies through a scoped `moviesDir`.** Never run `npm run docs:gifs` for two
   movies: it rewrites every GIF (owner rule).

## Effort

S.

## Testing

- `e2e/docs-media.spec.js` passes (no dead or orphaned pictures).
- A cold read of the reworded paragraph and both new GIFs by one fresh agent (as `testing-029`); record the
  verdict in VERIFY.md `docs-020` #1 and set it `OK`.
- Acceptance scenarios: none. Chromium only (docs media).

## Interaction model

Not UI-touching (docs only).

## Documentation

- **Page**: `docs/ai-partner.md`. **Media**: the two movies above, from `e2e/docs/ai-chat.docs.js`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
