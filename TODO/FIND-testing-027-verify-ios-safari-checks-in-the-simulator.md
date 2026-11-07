---
title: Drive the VERIFY.md iOS Safari behaviour checks in the iOS Simulator
category: testing
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage (Safari pass)
depends: []
status: open
---

## Problem

About 90 `TODO/VERIFY.md` rows say "on a real iPhone or iPad". Many of them ask how a person's thumb feels,
and those must stay with the owner (`CLAUDE.md`, Responsive Layout). Many others ask what **iOS Safari
itself does**: whether the on-screen keyboard pushes a sheet away, whether a 16 px input zooms the page,
whether a `<select>` becomes a wheel picker, how a `<a download>` blob or a file input's `accept` behaves,
where the home indicator sits, and how iOS font metrics wrap a row. The iOS Simulator runs real iOS Safari
(MobileSafari and WebKit, with iOS's own keyboard, pickers, safe areas and fonts), so it answers those
questions. Playwright's WebKit cannot.

This Mac has the iOS 27.2 runtime with iPhone 17e (booted), iPhone 17, iPhone Air, iPad Air 11-inch (M4) and
iPad Pro 11-inch (M5) simulators. The simulator is not a device. It runs on the Mac's CPU and GPU and takes
mouse input, so every speed, GPU and real-thumb question stays in VERIFY.md.

**Preconditions, unmet on 2026-11-07:**
1. `safaridriver` with `platformName: iOS`, `safari:useSimulator: true` reported *"Could not find any
   session hosts"*. In each simulator, turn on **Settings › Safari › Advanced › Remote Automation** (and Web
   Inspector). The desktop-Safari session timeout in `testing-026` may need fixing too.
2. Native iOS UI (keyboard keys, wheel pickers, the colour picker, the Files picker, share and download
   sheets) is outside the web page, so WebDriver cannot tap it. Use `xcrun simctl io booted screenshot` to
   see it. To tap it, run this task from a session that has the `computer-use` tools (Claude desktop app)
   and work on the Simulator window. Rows marked **(native)** need that. Without it, record only what the
   screenshot shows and leave the row `Open`.
3. Turn the software keyboard on (Simulator › I/O › Keyboard › uncheck *Connect Hardware Keyboard*), or
   no keyboard appears.

Rows moved here in full (entry and row number in `TODO/VERIFY.md`):

| Row | What to drive |
|---|---|
| `data-001` #1 | `typeof window.showSaveFilePicker` in iPhone and iPad simulator Safari (and desktop Chrome for the pair) |
| `data-001` #2 (native) | A Blob `<a download="test.ndjson">`: does iOS show a download, land the file in Files, or open the text? |
| `data-002` #1 (native) | `<input type=file>` with the three `accept` values: which ones let `project.ndjson` in Files be picked? (`xcrun simctl` can't add to Files; drag the file onto the Simulator window, or save it from Safari first) |
| `ui-036` #2 (native) | Bisect's Angle field: does the iOS numeric keyboard offer a minus sign? |
| `ui-033` #2 | **File ▾ → Connect repository…**, focus the Token field: the page does not zoom, the fields and Connect stay above the keyboard; does iOS offer autofill or capitalise (made-up token only) |
| `ui-056` #1 | Tap a part's name: the keyboard rises without pushing the sheet or viewport off screen, and keyboard Done or a tap on empty viewport commits |
| `ui-094` #2 | iPhone and iPad: with the name field open the 3D view and field stay visible, no page zoom, Done commits |
| `core-076` #1 | Group two groups, tap **Prefix**: with the keyboard open the **Group** button is reachable, and the page stays unzoomed |
| `ai-003` #1 | **File ▾ → Project settings…**: the keyboard comes up and the field, count and **Save** stay above it over several lines |
| `ai-006` #1 | `npm run dev` (Scripted provider, reachable from the simulator at the Mac's localhost), chat sheet at **Half**: the composer and **Send** stay above the keyboard |
| `ai-004` #1 (native) | Long-press in **API key**, **Paste** (put a made-up key on the Mac pasteboard; the simulator shares it): Save and test enables, no sideways scroll |
| `render-002` #2 | A label's Text field: the keyboard's Done key commits, not only Enter |
| `ui-052` #1 (native) | A Pi's **Model** and a Bolt's **Spec** open the iOS wheel picker; choosing Pi 5 commits with no Apply |
| `ui-052` #2 | The repair dialog (Pi 4 with a cube snapped to its AV jack → Pi 5) is a full-height sheet with **Apply** and **Cancel** clear of the home indicator |
| `ui-059` #2 (native) | Change a choice variable through the wheel picker: the repair dialog opens above the sheet |
| `ui-037` #1 (native) | The Color swatch opens the iOS colour picker, the body recolours live, closing adds one Undo step, and dismissing without choosing reverts |
| `ai-031` #2 | A body with a long prompt: the row wraps, no sideways scroll, a tap opens and closes it |
| `ui-093` #2 | The Inspector's **Hidden by default** row wraps, no sideways scroll, a tap on the label toggles it |
| `ui-043` #1 | iOS font metrics: with one and then two bodies selected, the Operations toolbar and the nav chrome do not touch |
| `ai-013` #2 | The route sheet's command wraps at 390 px, and **Copy** puts it on the clipboard (`xcrun simctl pbpaste booted`) |
| `data-011` #1 (native) | Open a version-2 file through Files → **Open…**; **Download copy** writes the same bytes back (compare hashes) |
| `core-037` #1 (native) | Open a `.ndjson` holding a user part from Files: it renders, survives a reload, and the Web Inspector console is clean |
| `ui-075` #2 | Rotate the iPhone simulator to landscape: Undo, Redo, History, File, Help, Live MCP and Assistant stay on the row |

Rows where only the simulator half moved here. The real-device half stays in VERIFY.md:

| Row | Simulator half |
|---|---|
| `ui-056` #2 | iPad: the name field does not zoom the page on focus |
| `ui-050` #1 (native) | The Reference select opens the wheel picker, and `mb` reads back in the row |
| `ui-095` #2 | The broken row's reason wraps, and the iPad rail tile's pop-out shows it |
| `build-011` #2 | The two footer links wrap cleanly |
| `io-009` #3 (native) | **Import model file…** opens the Files picker, not a camera-only picker |
| `sketch-003` #1 (native) | **Add image…** from the photo library (`xcrun simctl addmedia` a JPEG, a HEIC and a 48 MP image): JPEG lands under the grid, HEIC gives the stated message, 48 MP is refused. The camera half stays |
| `core-031` #1 | Taps through iOS's own touch stack (Simulator clicks): after an empty-grid tap, does each body tap select it? |
| `ui-049` #2 | Taps on rows and checks never light up violet |
| `io-001` #1 | Place a shape, `xcrun simctl terminate booted com.apple.mobilesafari` within a second, relaunch: is the shape there? |
| `perf-001` #2 | Start a big export, send Safari to the background (launch another app with `xcrun simctl launch`), return: the export lands, or `Export failed: …` shows with Export still pressable |
| `ui-034` #1 (native) | Export an STL: the download sheet appears and the file is in Files › Downloads |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes, starting "iOS Simulator <device>, iOS 27.2:")
- `TROUBLESHOOTING.md` (the setup steps that made safaridriver reach the simulator, via `/troubleshoot`)

## Proposed fix

1. Meet the preconditions. Serve the production build on the Mac (`run-warpcad` skill). The simulator
   reaches it at `http://localhost:<port>`. Use dev only for `ai-006` #1.
2. Drive each row through WebDriver for the page and screenshots for native UI, at the iPhone 17e (closest
   to the 390 px reference) and the iPad Air 11-inch simulators.
3. Measure where you can: `visualViewport` height and scale before and after focus (keyboard and zoom),
   `scrollWidth` against `clientWidth`, element boxes against `env(safe-area-inset-bottom)`.
4. Note the device, iOS version and "simulator, not hardware" in every Note. A defect becomes its own
   finding. For a partial row, add the simulator result to its Notes and leave it `Open`.
5. If several keyboard and zoom rows pass, propose one graduate TODO: a simulator-driven spec run, so these
   stop being manual checks.

## Effort

L (many rows; native-UI rows are slow).

## Testing

- No code change expected; `npm run spdx` passes.
- Engines: iOS Safari in the simulator (this task's purpose). Viewports: the simulators' own (iPhone 17e, iPad Air 11-inch).
- Acceptance scenarios: 10 (Save, reload) through `data-011` #1 and `io-001` #1; 13 (Recolor) through `ui-037` #1; 15 (Change a part's model) through `ui-052` #1 and #2.
- Closed-finding regression: `ui-045` / `core-031` (tap after empty tap) is `core-031` #1.

## Interaction model

Not UI-touching (verification only).

## Documentation

- **Page**: n/a, unless a drive shows `docs/save-load.md`'s iOS sentences are wrong.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
