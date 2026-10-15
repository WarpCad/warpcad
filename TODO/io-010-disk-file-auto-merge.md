---
title: A project file changed on disk merges automatically — Claude Code and the app edit one file
category: io
kind: feature
priority: high
model: sonnet
milestone: M16
depends: [ui-062]
status: open
---

## Goal

Today, when Claude Code's MCP server writes the project file the app has open, the app notices
on focus and asks **Reload / Overwrite the file / Cancel** (`DiskChangeDialog.vue`, `ai-009`).
Whichever the user picks, one side's work is thrown away. With M15's merge, neither is: the
app merges the file's changes into the open project and tells the user what came in.

"Done": with a project file open in desktop Chromium, ask Claude Code to add a sphere while a
cube move is unsaved in the app; on returning to the tab the sphere appears, the cube stays
moved, a toast says so, and the next Save writes both. No dialog appears.

## Interaction model

- **Precondition** — the app holds a File System Access handle for the open file (desktop
  Chromium only, as today). On every other engine the app cannot see the change; the route
  there is **File ▾ → Merge file…** (`ui-062`), and `docs/mcp.md` must say so.
- **Trigger** — unchanged detection: window focus, the tab becoming visible, and before every
  in-place Save (`checkDiskFile` in `src/stores/persistence.js`). The user does nothing.
- **Feedback** —
  - Merged cleanly: `ui-062`'s toast, `Merged 2 steps from Claude Code` when every incoming row
    has origin `mcp`, otherwise `Merged 2 steps from bracket.warpcad`. **Undo merge** is on it.
  - Conflicts: `ui-062`'s banner. No modal.
  - Save with a pending change: the merge runs first, then the merged project is written, and
    the chip reads `Saved` (plus the toast). Save never writes over a change it has not merged.
  - A merge deferred because a drag or a field edit is in progress: the save-status chip reads
    `Changes waiting to merge` and the merge runs when the gesture ends (the existing
    `uiBusy` deferral).
  - The file is a **different project**, or unreadable: the existing dialog still appears, with
    its three buttons, because there is nothing safe to do automatically. Its text says why.
- **File ▾ → Reload from disk** (`file-disk-reload`) stays, as the explicit "discard mine, take
  the file". It is no longer the only way forward.
- **Placement / Selection response / Selection count** — n/a.
- **Small-screen behavior** — no handle exists on phone or tablet engines, so nothing here
  triggers; the toast and banner are `ui-062`'s and already specified at 390 px.

## Documentation

- **Page** — `docs/mcp.md` ("Working on a project you have open") and `docs/merging.md`.
- **Example** — "1. In Chrome, **File ▾ → Open…** your project file and leave it open.
  2. In Claude Code say *add a 20 mm sphere on top of the cube*. 3. Click back into WarpCad.
  The sphere appears and a note says *Merged 2 steps from Claude Code*. 4. Press **Undo merge**
  if you do not want it. In Safari or Firefox, or on a phone, WarpCad cannot watch the file:
  choose **File ▾ → Merge file…** and pick the project file instead."
- **Media** — `e2e/docs/mcp.docs.js`: replace the Reload-dialog shot with `mcp-merged.png` (the
  toast and an `mcp` row in History), embedded in `docs/mcp.md`.

## Affected files

- `src/stores/persistence.js` — `checkDiskFile`, the Save path, `diskChange` state
- `src/components/storage/DiskChangeDialog.vue` — only the different-project and unreadable cases
- `src/stores/diskChange.spec.js`, `e2e/mcp-reload.e2e.js` (rename to `e2e/mcp-merge.e2e.js`)
- `mcp/projectFile.js`, `mcp/server.spec.js` — see below
- `docs/mcp.md`, `docs/merging.md`, `CLAUDE.md` (the AI Partner section's MCP paragraph)

## Proposed fix

**App side.** Where `checkDiskFile` now sets `diskChange` and opens the dialog, parse the text
and call `ui-062`'s `mergeIn`. Keep the dialog path for `unrelated` and for a
`ProjectFormatError`. Save becomes: check, merge if needed, serialise, write, then record the
written bytes as "last seen".

**MCP side.** The server holds no unsaved state between calls and already re-reads the file
before each one, so it needs no merge of its own. What it must do:

- keep one replica id for the process and let its clock observe the file's on every read, so
  its writes are always later than what it read;
- keep the lock and the temp-file-plus-rename write exactly as they are. The lock no longer
  protects against lost work (a merge would recover it); it protects against a torn write and
  against two servers sharing a stale read;
- drop the "re-check the file has not changed since step 0, else refuse" refusal in favour of
  re-read, re-apply the call, write — bounded to three attempts, then the existing refusal.

**Not changed.** The live bridge (`ai-012`) is a different transport and is untouched.

## Effort

M

## Testing

- Unit (`diskChange.spec.js`, fake file handle): focus with a changed file merges and clears
  `diskChange`; Save with a changed file writes the merged text and nothing else; a different
  project opens the dialog and merges nothing; a change arriving mid-gesture is deferred and
  then merged; two changes in a row merge twice, with the second toast replacing the first.
- Unit (`mcp/server.spec.js`): the server's stamps are later than every stamp in the file it
  read; a file changed between read and write is re-read and the call re-applied; the lock and
  atomic rename cases from `ai-009` still pass.
- App-level `e2e/mcp-merge.e2e.js` (navigates to `/`, real `mcp/server.js` as a child process,
  fake File System Access handle backed by a real temp file): unsaved cube move in the app,
  server adds a sphere, focus the tab; assert both, the toast, no dialog, and that Save writes
  a file the server then reads with both changes. A second case forces a conflict and asserts
  the banner.
- **New `TODO/ACCEPTANCE.md` scenario 23, "Claude Code edits the file you have open"**: the
  Documentation example, driven by hand in desktop Chrome with real Claude Code, then the
  Safari route through **Merge file…**.
- Acceptance scenarios to re-drive: **10**, **22**.
- Closed findings to re-run: `ai-009` (reload-on-change; lock; a refused call writes nothing),
  `io-008` (Save falls back to download when the native write is refused — the merge must run
  before the fallback too), `ui-033` (the dialog is deferred while a drag is in progress).
- Engines: the handle path is **Chromium only** by platform; the spec states that and runs the
  Merge file… fallback case on **Firefox and WebKit** so no engine is unverified.
- Viewports: laptop for the handle path; the fallback case at all three.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
