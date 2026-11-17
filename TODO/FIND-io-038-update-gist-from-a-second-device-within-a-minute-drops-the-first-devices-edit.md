---
title: Update gist from a second device within a minute silently overwrites the first device's edit
category: io
kind: finding
priority: high
model: opus
milestone: none — Findings table, filed 2026-11-17 from the testing-045 drive of VERIFY.md io-019 #1
depends: []
status: open
---

## Problem

**Update gist** merges the gist's current content before it writes (`io-019`), but the merge reads the gist
**unauthenticated** (`readGist`, `src/storage/gistBackend.js:496`), and GitHub serves an unauthenticated read up to
60 s old (`docs/decisions/gist-storage.md`). `src/stores/gist.js:317` handles the same staleness only for a revision
*this session* wrote. A revision another device wrote is invisible during that minute.

Driven 2026-11-17 against real GitHub (secret gist, owner's `gh` login, laptop context A and a second context B,
production build): both connect, B places a cylinder and taps **Update gist**, then, 3 s later, A places a cuboid and
taps **Update gist**.

- A shows **no** merge toast and **Gist updated**. The gist's history has the revisions in order (B at 16:28:11, A at
  16:28:14), and its project file holds A's three bodies (cuboid, sphere, cuboid). **B's cylinder is gone** with no
  message to either person.
- Same run with a 65 s wait before A's Update: A shows *Merged 1 step from the gist*, then *Gist updated*, and the
  gist holds all four bodies. So the merge works; the loss is the stale read.

A person using a laptop and a phone alternately can hit this in normal use. The docs do not mention the delay.

## Proposed fix

1. Read the base for the merge **with the token** (an authenticated `GET /gists/<id>` is not served from the 60 s
   unauthenticated cache; confirm with the same two-context run). Keep the unauthenticated read for Shared view only.
2. If authenticated reads are also stale, compare the read revision with the gist's `history[0]` from the PATCH response
   (or send the revision with a conditional request) and refuse with a plain sentence when the write would drop a
   revision this session never merged: "Another device updated this gist a moment ago. Try again in a minute."
3. Mention the delay in `docs/` (the gist page) if any window remains.

## Testing

- Unit: `gistBackend.spec.js` and `stores/gist.spec.js` for the authenticated base read and the refusal.
- E2E (fake): extend `e2e/gist-share.e2e.js` case 11 with a fake that serves a stale read for the owner's first
  Update, expecting the merge or the refusal, never a silent overwrite.
- Real GitHub: re-run the two-context drive above with a 3 s gap; the gist keeps four bodies (secret gist, delete after).
- Engines: all three, phone and laptop.
- Acceptance: gist share scenario; scenario 30.

## Documentation

- `docs/` gist page: one sentence if a delay remains. Otherwise n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
