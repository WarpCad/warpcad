---
title: Drive the VERIFY.md desktop-Safari checks in real Safari through safaridriver
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage (Safari pass)
depends: []
status: open
---

## Problem

Playwright's WebKit is not Safari: it has no Safari scroll-bar settings, no Safari networking stack and no
Safari window chrome. The owner turned on **Allow remote automation** in Safari (2026-11-07), so `safaridriver`
can drive the real desktop Safari on this Mac through WebDriver. These `TODO/VERIFY.md` rows asked for desktop
Safari specifically, and none needs a phone or the owner's judgment.

**Precondition, unmet on 2026-11-07:** a probe (`safaridriver -p <port>`, then `POST /session` with
`browserName: safari`) timed out with *"The session timed out while connecting to a Safari instance"*.
Usual causes: `sudo safaridriver --enable` has not been run once (it asks for the owner's password), or a
Safari window has a sheet or dialog open. Fix that first. The commands need the shell sandbox off, because
they talk to a local port and launch Safari.

Rows (entry and row number in `TODO/VERIFY.md`):

| Row | What to drive |
|---|---|
| `ui-085` #1 | Deployed build, a sideways wheel gesture over the Library (WebDriver `wheel` actions with `deltaX`): the page does not scroll sideways, with **Show scroll bars** set to Automatic and to Always (`defaults write -g AppleShowScrollBars`; note the owner's value first and restore it) |
| `ui-082` #1 | Safari window about 720 px wide, two bodies selected, **Combine ▾**: the pop-out opens under the launcher without covering the orientation triad, and a click outside closes it |
| `build-002` #1 | Serve `dist/` through the paced server in `bench/bundle-load.mjs` (Slow 3G profile). Load it in Safari, Chrome and Firefox, sampling screenshots as fast as each driver allows (Chrome: CDP screencast frames). Is any frame white between navigation and the dark UI? |
| `ai-012` #3 (connection half) | `npm run dev`, Safari at `http://localhost:5183`: the live bridge connects. Whether the Connect sheet's WebKit note is the right amount of warning stays the owner's |
| `io-010` #2 (desktop half) | Desktop Safari: open a project file copy, have `claude -p` add a step (see `testing-022`), then **File ▾ → Merge file…**: `Merged 1 step from <file name>` and **Undo merge** appear, and nothing merges by itself. If safaridriver cannot set the file input, record that and stop. The iPhone half stays |
| `ui-079` #3 (Safari half) | Resize the Safari window from 1440 to 390 px and back in steps (`POST /window/rect`): no jump, text squash or cover of the gizmo or nav chrome. Chromium, Firefox and WebKit are in `testing-017`; the real iPad stays in VERIFY.md |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes)
- `TROUBLESHOOTING.md` (one entry for whatever fixed the session timeout, via `/troubleshoot`)

## Proposed fix

1. Get a session to start (see Precondition). Use plain WebDriver over `curl`, or the `webdriverio` package
   through `npx`. Do not add it to `package.json`.
2. Drive each row and keep a screenshot per row (`GET /session/<id>/screenshot`). Record the Safari version
   (`navigator.userAgent`) in every Note.
3. Put back any system setting you changed (`AppleShowScrollBars`) and close the automation window.
4. A defect becomes its own finding, with its id in Notes.

## Effort

M.

## Testing

- No code change expected; `npm run spdx` passes.
- Engines: real desktop Safari (the point of the task); Chromium and Firefox for `build-002` #1 only.
- Acceptance scenarios: 22 (Merge a copy of the project), through `io-010` #2.
- Closed-finding regression: `build-002`'s white-flash reproduction is row 3.

## Interaction model

Not UI-touching (verification only).

## Documentation

- **Page**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
