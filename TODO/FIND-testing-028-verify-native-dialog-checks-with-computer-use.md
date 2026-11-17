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

> **Started 2026-11-17 (owner, /owner, U2):** the owner launched this from the Claude desktop app with computer use. It is
> not in the `/run-todos` queue, so the two runs never collide.

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

### Added 2026-11-17: the Mac app and the iOS Simulator's own screens

The owner-queue triage (`TODO/OWNER.md`) moved these 19 rows here. Each needs a native window, the Safari Web
Inspector attached to a Tauri web view, or taps inside the Simulator's own apps (Files, Mail, Settings), which only
computer use can reach. The owner starts this task from the Claude desktop app (OWNER.md U2) and leaves the Mac.
`build-035` #2 can run: the DSN is in Keychain item `warpcad-sentry-dsn` (OWNER.md U4 done 2026-11-17).
**Never stop to ask the owner mid-run:** anything that turns out to need the owner goes to `TODO/OWNER.md` in its format.

| Row | Check |
|---|---|
| `io-036` #1 | Simulator: put `x.warpcad`, `y.ndjson` and `log.ndjson` (three lines of log JSON) in Files. `x.warpcad` shows as "WarpCad project" and opens on a tap; `y.ndjson` offers Open in WarpCad from the share sheet; `log.ndjson` is no longer labelled "WarpCad project" |
| `io-036` #2 | Simulator: open a `.warpcad` and a `.ndjson` from a Mail attachment and from iCloud Drive; both reach the page (`take_opened_files`) |
| `build-035` #2 | Mac shell built the release way (`VITE_SENTRY_DSN=<real> node scripts/release-config.mjs --build 1` gives the patch; pass it to `cargo tauri build --config`): in the web inspector console throw `setTimeout(() => { throw new Error('build-035 check') })`. One event reaches Sentry, with no project … |
| `build-034` #2 | **Key sheet on a simulator or device, by tapping.** Assistant, paste a dummy key, Save, force-quit, relaunch: the key is still there (the `ai-025` repro, through the real page; the Keychain round trip itself passed through the library). |
| `build-034` #3 | **Help line.** Open Help in the built Mac app and the iOS app: the version line reads `WarpCad 1.17.0 (<commit>) · <platform> app 1.17.0`, the same number twice. |
| `build-034` #4 | **MCP version.** Connect an MCP client to the Mac app's in-app server: `initialize` reports `warpcad-native` 1.17.0. |
| `io-029` #1 | Mac shell (`npm run mac:dev`): place a Cube, **File ▾ → Save**, name it `bracket`. `~/Documents/WarpCad/bracket.ndjson` exists, and nothing new is loose in `~/Documents`. |
| `io-029` #2 | Put a copy of any `.ndjson` directly in `~/Documents` (not in `WarpCad`). **File ▾ → Open…** does not list it; **Browse…** can still open it (the system dialog is the user's own choice). |
| `io-029` #3 | In the Mac window's web inspector console run `__TAURI_INTERNALS__.invoke('plugin:fs\|read_dir', { path: '', options: { baseDir: 6 } })`. It is refused (`forbidden path`), where before this change it listed Documents. |
| `io-029` #4 | First launch of a fresh Mac build does not show "WarpCad would like to access files in your Documents folder" until the first Save or Export, if at all. |
| `io-029` #5 | iOS simulator, io-014's reproduction: Save in place, Open… from the list, Export (chip reads *Files › On My iPhone › WarpCad › Exports › …*), open a `.ndjson` from Files. Behaviour must be unchanged: the iOS capability is the same `$DOCUMENT` scope as before. |
| `build-032` #1 | In the macOS shell (`npm run mac:dev`) and then on the iPad: File, Help opens with its pictures and the web inspector console shows no `Refused to connect` or `Refused to load the image` line |
| `build-032` #3 | The Tauri bridge no longer logs a fall-back to `postMessage` (a raw-body file write, Save, is the case that would be slower) |
| `ui-125` #1 | On a notched iPhone (or the iOS Simulator), place a cube, have an agent move it, press Undo: the panel sits just under the header and covers none of the Undo/Redo buttons |
| `build-029` #1 | macOS shell and iOS simulator, on the build before this change if one exists: tap Anthropic console, GitHub token page, Open on GitHub, Source code and Third-party notices; record nothing happening or the window navigating |
| `build-029` #2 | Same five links after this change: each opens the system browser, WarpCad keeps its sheet and state, and iOS shows **◀ WarpCad** to return |
| `build-029` #3 | A link typed as `location.href = 'https://example.com'` from the web inspector does not leave the app (the `on_navigation` guard) |
| `ui-120` #1 | On an iPhone with a Dynamic Island (simulator or hardware), portrait and landscape: the header, the Library tab bar, the Inspector and the navigation chrome clear the status bar, Dynamic Island, rounded corners and home indicator; the 3D view still runs edge to edge behind them |
| `io-016` #2 | Does `navigator.share` exist inside a Tauri WKWebView (iOS and macOS)? Record the answer for `build-018`'s probe list |
| `build-034` #1 | The on-screen half only (handed over by `testing-044` part 2, which installed the iOS 26.0 runtime and made the iPhone 17 on it, UDID 415C3515-36EB-4662-BA10-324808D3CCE7): `npm run ios:dev -- "iPhone 17 (iOS 26.0)"` in `../warpcad-native`. The app launches with the Keychain library loaded, places a cube and shows no console error. Also open that simulator's Settings › Safari › Advanced: if **Remote Automation** is there, turn it on, record the route with `/troubleshoot`, and move `testing-027` from Held into the Findings queue in `TODO/ROADMAP.md` (it is held until this is known). If it is not there, add one line to `testing-027` saying iOS 26.0 lacks it too. |
| `ui-034` #2 | MeshLab 2022.02 (installed, GUI only): open `TODO/owner-media/testing-044-ui-034/union.obj`, `union.stl`, `bolt.obj` and `bolt.stl`; run *Filters › Selection › Select non-manifold edges* and *Filters › Quality Measure and Computations › Compute Topological Measures*. Expect 0 non-manifold edges, 0 holes and one connected component per file (the Cura slice of the same four files is already clean). Record the numbers in the row. |

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
