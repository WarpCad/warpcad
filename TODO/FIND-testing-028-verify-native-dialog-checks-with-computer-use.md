---
title: Drive the VERIFY.md checks blocked on native OS dialogs and private windows, with computer use
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage (Safari pass)
depends: []
status: open
---

## Problem

Some `TODO/VERIFY.md` rows were left for a person only because they open a native dialog or window that
Playwright can't click. Examples: Chrome's File System Access save and open pickers, a private window, and
the editor's integrated browser. Run in headed mode with this Mac's real Chrome (`channel: 'chrome'`), those
are real OS dialogs. The `computer-use` tools can click them, and Playwright keeps driving the page.

**Precondition:** run from a Claude session that has the `computer-use` tools (the Claude desktop app).
Load the `computer-use` skill before the first step. Without it, this task cannot run. Say so, and leave the
rows `Moved`.

Rows (entry and row number in `TODO/VERIFY.md`):

| Row | What to drive |
|---|---|
| `ui-033` #1 | Headed Chrome: **Save** opens the OS picker the first time, then writes over the same file with no second prompt; **Save As…** always prompts; cancelling either is silent; **Open…** then **Save** writes back to the opened file. Edit the file in between and check the bytes on disk |
| `ui-054` #1 | With a real saved file: **File ▸ New**, build something, **File ▸ Save**: the OS picker appears and the old file is untouched (hash it) |
| `io-010` #1 | Open a project file copy, move a body without saving, have `claude -p` with `node mcp/server.js <that file>` add a sphere, click back into WarpCad: the sphere appears, the move stays, `Merged 1 step from Claude Code`, no dialog; Save, then have Claude Code describe the scene |
| `io-008` #1 | The editor's integrated browser (VS Code Simple Browser at the preview URL), the original report: **File ▾ → Save**, pick a folder and name: a download starts from that click, the status line names it and the empty file left behind, and the menu then reads **Download copy** |
| `io-001` #3 | A real private window: Firefox with `browser.privatebrowsing.autostart` (Playwright `firefoxUserPrefs`), and Safari through **File › New Private Window**. Does IndexedDB fail there, does the chip go red, is the app still usable? Then make the claim in `docs/save-load.md` match |
| `io-010` #3 (mechanics half) | Hold a real Library or gizmo drag (Playwright `mouse.down`) while `claude -p` changes the file, then refocus: the chip reads `Changes waiting to merge`, the viewport does not jump, and the merge lands on release. Whether the wait feels calm stays the owner's |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes)
- `docs/save-load.md` (`io-001` #3's private-window sentence, only if the drive contradicts it)

## Proposed fix

1. Work only on copies in the scratchpad. Never point a picker at `~/Documents` originals.
2. Playwright drives the page, `computer-use` clicks the OS dialog, and `shasum` checks the file on disk
   after every save.
3. Record what each dialog showed (screenshots) and the hashes in Notes. A defect becomes its own finding.

## Effort

M.

## Testing

- No code change expected unless `docs/save-load.md` changes; `npm run spdx` passes.
- Engines: real desktop Chrome (headed), Firefox, Safari (private window only).
- Acceptance scenarios: 10 (Save, reload) and 23 (Claude Code edits the file you have open).
- Closed-finding regression: `io-008`'s original report is row 4.

## Interaction model

Not UI-touching (verification only).

## Documentation

- **Page**: `docs/save-load.md`, only if the private-window sentence is wrong.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
