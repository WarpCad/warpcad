# TODO/VERIFY.md — Manual Verification Queue (kept small, on purpose)

Appended by `/fix-todo` Step 9, but narrower in scope than the previous attempt's file
of the same name: that one grew to roughly 2,000 lines of "should work now" checklists
across dozens of tasks — a queue nobody could keep up with is the same as no queue.
Read `CLAUDE.md`'s Verification section before adding to this file.

**This file's job now**: log only what's genuinely one-off and not already covered by
a standing `TODO/ACCEPTANCE.md` scenario — a visual/feel judgment call, a
device-specific quirk, something a task's own Testing section explicitly deferred. If
an entry would duplicate what an acceptance scenario already checks on a standing
basis, it belongs there instead, not here.

Newest entry at the top. Each entry is a short prose note (why this is here, what was
already measured or ruled out) followed by a table — one row per thing to check by
hand. Fill in **Status** and **Notes** as you actually verify, on real hardware where
the note asks for it; leave the entry and its filled-in rows in place afterward as a
record rather than deleting it, the same way a checked-off item used to stay in place
under the old checkbox format.

**Status** values:
- `Open` — not yet checked.
- `OK` — checked, reads fine as-is.
- `Issue` — checked, found a real problem. File it as its own `TODO/<id>.md` and put
  that id in Notes.
- `N/A` — no longer checkable as written (e.g. the reachability gate changed). Say why
  in Notes.
- `Deferred` — checkable only with a real Anthropic API key, which bills purchased tokens, so the owner parked it for cost (2026-11-07). Notes say why. Re-open it when the owner chooses to spend tokens.
- `Moved` — an AI drive can settle it without a device, a key or the owner, so it was handed
  to a TODO. The id is in Notes, and that TODO sets the row to `OK`, `Issue` or `N/A` when it runs.

**Notes** is free text: what you actually saw, on what device, and anything a future
reader would need — this is the column the old checkbox-only format had no room for.
If this file's queue ever starts growing the way the previous attempt's did — several
entries per day, unread between sessions — that's itself a signal to move more of it
into `TODO/ACCEPTANCE.md` rather than let the queue outpace anyone's attention again.

**Decided 2026-10-17:** the roughly 347 Open rows get a triage task, `testing-005` (move, graduate or close each row). Until it runs, add new rows only for genuine one-offs.

**Decided 2026-11-01:** run `testing-005` next, right after `testing-014` and before `build-017`. The queue held 438 open rows at that date, not the roughly 347 quoted here.

**Decided 2026-11-07:** recount. The queue holds 445 rows whose Status is `Open` (counted with `| Open |`). `testing-005` is closed in `TODO/done/`, so this count is for triage that has not yet been done. Use 445, not 347 or 438.

**Decided 2026-11-07:** triage the rest of the open rows now, not in a later run. Each row is to be moved into `TODO/ACCEPTANCE.md` as a re-drive line, closed with cited evidence, or filed as a finding. Rows that need a real phone, tablet or device stay open and are listed for the owner. Not yet implemented: this decision only records the choice. The count at the time of the decision was 446 (`| Open |`), so re-count before starting.

**Done 2026-11-07 (AI-drivable pass):** 82 rows that an AI drive can settle were marked `Moved` and handed to 13 TODO files: `testing-017` to `testing-025`, `docs-031`, `docs-032`, `docs-033` and `perf-005` (see the Findings table in `TODO/ROADMAP.md`). 7 more rows keep `Open` with a note naming the half that moved. The rest need a real phone, tablet, GPU, key, account or an owner decision, and stay `Open`. Count after the pass: 363 rows with Status `Open` (a plain `| Open |` grep reads 366, because three notes above quote that string).

**Done 2026-11-07 (Safari pass):** with Allow remote automation on in Safari, and the iOS Simulator and computer use available, 31 more rows were marked `Moved` (to `testing-026` desktop Safari, `testing-027` iOS Simulator, `testing-028` native dialogs) and 15 more got a moved-half note. All three TODOs list setup steps that were still unmet on 2026-11-07.

**Done 2026-11-07 (third pass):** 166 more rows marked `Moved` and 34 more given a moved-half note: cold reads by fresh agents (`testing-029`), real-GPU and screen measurements on the Mac (`testing-030`), tap, timing, reach and step-count measurements (`testing-031`), model behaviour over MCP (`testing-032`), and owner decisions gathered with a drafted recommendation each (`testing-033`). What stays `Open` needs a real phone or tablet in the hand, a printer, an account or token, the in-app Assistant with a real key, or a messaging app.

## Queue

### ai-035 — WarpCad skills over MCP, driven with Claude Code as the client (2026-11-15 05:49)

Seven `claude -p --model haiku` runs (`claude-haiku-5-5`, owner subscription, no API key) against scratch project files; transcripts in `bench/results/ai/2026-11-15-skills-over-mcp/`, summary in `bench/results/ai/2026-11-15-skills-over-mcp.md`. Claude Code over MCP, not the in-app Assistant. The first `add-clearances` draft lost a group's other part (fixed in the skill text and re-driven); the rows below are what a single Haiku run cannot settle.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Connect Claude Code, ask *add 0.2 mm clearance to the group called Housing* (a group of two box parts): it reads `skill://add-clearances/SKILL.md` before any write and the pocket opens 0.2 mm per side | OK | `run1c`: read the skill first, one `apply_records` (cut, rebuilt Pin, regroup), Pin and Base read back unchanged, `check_printability` clean. The gap is by construction, not measured (`check_clearance` takes whole bodies). The group comes back as "Group 1" (no rename tool). `run1` (first draft) lost the Pin; `run1b` asked a needless question; both skill defects, fixed |
| 2 | *make an enclosure around the Raspberry Pi* reads `skill://create-enclosure/SKILL.md` and builds shell, standoffs, port openings and a lid split | OK | `run2`: 94 calls, $0.24. `check_clearance` Pi to shell 0.2 mm, thinnest wall 1.37 mm, watertight. Openings and the split are fixed numbers, not formulas (said so). The 8 mm lid seam crosses the USB-A openings (said so) |
| 3 | Claude Code lists both skills | OK | `run3`: both `skill://` resources with descriptions from `ListMcpResourcesTool`. Claude Code does not call `skills/list` itself; `mcp/skills-protocol.spec.js` covers it |
| 4 | A model other than Haiku (Sonnet or Opus, the owner's usual) follows both skills the same way | Open | Haiku is the cheapest model, so a floor. One run each is an anecdote |
| 5 | **Owner's call:** the default clearance (0.2 mm per side snug or press fit, 0.4 mm sliding, no default for resin or CNC) was chosen without the owner (`docs/decisions/ai-partner.md` Decision 14) | Open | Confirm or change the numbers in `mcp/skills/add-clearances/SKILL.md` |
| 6 | The same `Housing` request with the project open in the app: the merged steps show as **via mcp** and the rebuilt group is selectable | Open | Merge path is `testing-022`'s and unchanged; not driven with a skill |

### testing-032 — Model behaviour over MCP: what only the in-app Assistant can still show (2026-11-15 05:03)

Eight `claude -p --model haiku` runs and two fetch-only agents answered the tool half of seven rows (see the `Notes` on `docs-029` #1, `ai-014` #1, `ai-022` #1, `ai-010` #1-#3 and `ai-008` #1; transcripts in `bench/results/ai/2026-11-15-claude-code-over-mcp.md`). What is left needs the in-app Assistant and a key, which is deferred for cost.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | With the in-app Assistant and a key (deferred, cost): does the activity row read *Set piModel to 5* with the impact line once `FIND-ai-040` lets the model see the binding? Re-run the three-run MCP drive first; it needs no key. | Open | |
| 2 | Is Haiku's result the floor? Repeat the `ai-014` #1 and scenario 17 MCP drives on a stronger model (`--model sonnet`) and compare; Haiku is the cheapest model, not the one most owners use. | Open | |


### testing-031 — does the simulated fingertip match a real thumb? (2026-11-15 04:40)

The tap-accuracy rows were measured with taps scattered as a fingertip would be (Gaussian, sigma 3.5 mm, `bench/tap-scatter.mjs`), which is an assumption about thumbs, not a measurement of them. Three findings stand on it: `ui-134` (orientation caps), `ui-135` (navigation chrome mode buttons) and `sketch-009` (closing a Line chain). A real device is the only way to see whether sigma 3.5 mm is too harsh or too kind.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone, tap each of the six orientation caps and the Orbit, Pan and Select buttons ten times, aiming at the middle of each, and count taps that hit a neighbour (the model predicts 22-35 % for the caps and 5-9 % for the buttons). If real thumbs are far better, say by how much; the three findings' thresholds are written against the model. | Open | |

### ui-114 — Base button: dialog family (2026-11-14 13:00)

The ten dialogs the finding names (plus `DependentRepairDialog`) now draw their buttons with `BaseButton`. Three looks
changed on purpose and are a judgment call, not something a test can settle.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | The storage dialogs' buttons are now 80 px wide, not 96 px (Connect, Save as gist, Replace confirm, Project settings): do the two-button rows still look balanced at phone, tablet and laptop? | Open | |
| 2 | The Step limit sheet's Save is now the filled primary look, not an accent outline: read it in both themes. | Open | |
| 3 | The keyboard focus ring (`--focus-ring`, 2 px offset) on dialog buttons in Firefox and Safari: visible and not clipped by the sheet edge? | Open | |

### render-008 — The 3D view's colours on a real GPU and screen (2026-11-14 05:20)

Pixels were sampled in headless Chromium (software rasteriser) and on all three engines by the e2e matrix, so the colour values are proven. Whether the light-theme body, selection and axis colours *read well* on a real display is a judgment only a person can make.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone or iPad, switch System/Dark/Light in the Help footer with a cube, a cylinder and both selected: the body, amber selection, teal secondary selection and red/green axis lines are distinct and comfortable against the ground in both themes (light-theme axes are now deeper than dark's). | Open | |

### ui-115 — One NumberField for every size field (2026-11-14 00:21)

Emulated viewports and the three engines cover typing, Enter and the comma decimal; a real touch keyboard
and a real comma-decimal locale were not available.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On the iPhone and iPad, tap Fillet **Radius**, Split **Offset** and the Inspector **Size X**: the keyboard is the decimal pad, the whole value is selected on focus (a typed digit replaces it), and the page does not zoom | Open | |
| 2 | With the device set to a comma-decimal region, type `2,5` into the same three fields: each shows `2.5` | Open | |

### ui-113 — Theme switch: System, Dark, Light (2026-11-13 23:10)

The one frame of the device's theme before a forced theme applies is accepted by the task (the CSP forbids an inline script that could read the stored choice), but how visible it is on real hardware is a feel judgment no spec makes.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone or iPad set to Dark, choose Light in Help, then reload and cold-start the installed app: the dark frame before the light theme applies is brief enough not to read as a flash | Open | |

### ui-110 — One set of overlay behaviours (2026-11-13 17:40)

The iOS keyboard hypothesis was not tested and nothing was changed for it; the three sheets are on `testing-027`'s simulator list. What a person should feel on a real device is below.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPad or iPhone with a hardware keyboard attached, open the Key sheet and press Tab: focus cycles inside it and never reaches the toolbar behind (the trap moves focus itself, because Safari does not Tab to buttons) | Open | |

### io-028 — Ask the browser for persistent storage (2026-11-13 16:49)

Emulation proves the app calls `navigator.storage.persist()` once after the first save with content, and that a deleted database with the flag set shows the cleared-data notice. It cannot show a real browser honouring `persist()` or evicting data.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Owner's iPhone, Safari (not installed to the home screen): make a project, wait for Saved, leave WarpCad unused for seven days, reopen. Expect either the project back (persist honoured) or **Your browser cleared WarpCad's saved data. Open a project file to carry on.** in the top bar, never a silent empty scene. | Open | |
| 2 | Desktop Firefox: first save of a session shows (or does not show) a storage-permission prompt, and WarpCad works either way. | Open | |

### build-029 — External links open in the system browser (2026-11-12 20:30)

The fake-bridge e2e proves the page hands the URL to the opener and does not navigate; it cannot show what a real web view does. Nothing in this session launched a shell, so the "before" hypothesis in the finding is still unconfirmed.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | macOS shell and iOS simulator, on the build before this change if one exists: tap Anthropic console, GitHub token page, Open on GitHub, Source code and Third-party notices; record nothing happening or the window navigating | Open | |
| 2 | Same five links after this change: each opens the system browser, WarpCad keeps its sheet and state, and iOS shows **◀ WarpCad** to return | Open | |
| 3 | A link typed as `location.href = 'https://example.com'` from the web inspector does not leave the app (the `on_navigation` guard) | Open | |
| 4 | Windows and Android: the same, when a machine or emulator is available | Open | |

### build-024 — Android icons and launch colours (2026-11-12 17:58)

Built by `npm run icons` in `warpcad-native`; resources compile under aapt2 but no APK, emulator or device was run (`npm run tauri` is missing from the native `package.json`, so Gradle's Rust step fails).

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Android launcher and recents show the WarpCad cube under circle, squircle and square masks | Open | |
| 2 | No white frame at launch, status and navigation bars are `#10131a` | Open | |


### ui-120 — Safe-area chrome on a real notched phone (2026-11-11 16:39 UTC)

The CSS and viewport contract is done and tested with faked insets, but whether iOS really insets the web view, or lets the header sit under the status bar, is a device question no spec can answer.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On an iPhone with a Dynamic Island (simulator or hardware), portrait and landscape: the header, the Library tab bar, the Inspector and the navigation chrome clear the status bar, Dynamic Island, rounded corners and home indicator; the 3D view still runs edge to edge behind them | Open | |
| 2 | Same device, Safari with the app added to the home screen (standalone mode): repeat row 1 | Open | |

### io-027 — Import a 3MF's object colours (2026-11-10 18:55 UTC)

Why this is here: unit tests and the import e2e cover the colour path on all nine projects, but no rendered-pixel check of the ring was taken, and the pads and most LEDs were not read off the Inspector.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | NeoPixel ring imported via File → Import model…: the board reads green, the LEDs white, the pads amber on screen | Open | Board `#447766` and `PCB Component (2)` `#f6f6f3` read off the Inspector; pads and the rest not yet |
| 2 | Reset after a recolour on an LED returns to `#f6f6f3`, not the theme palette | Open | |

### ui-107 — Import model… from the File menu, placed in the view (2026-11-10 17:46 UTC)

Scenarios 26 and 31 were driven at all three widths with a scripted real pointer and trusted touch. They cover the flow, but not how it feels on a real phone, the owner's own file, or two layout judgment calls the implementer made.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone and iPad: File → Import model…, then drag the waiting ghost with one finger and lift. Does the ghost start where you can see it (with and without a model already selected and the Inspector sheet open), and does it follow the finger without lag on a 30k-triangle file? | Open | |
| 2 | The owner's own `6538 RV-8803…` 3MF from the original report: imported through File → Import model…, it is in the view and in Objects, and My parts does not change. | Open | |
| 3 | At phone width the *Reading… / Imported…* status line sits at the top centre, visually over the operations toolbar row, as the Library toast already does. Is that acceptable, or should it move? | Open | |
| 4 | Save to library… on a single imported STL says *Saves this group as a fixed part*. Check whether "group" reads wrong for one mesh (the wording predates `ui-107`). | Open | |

### ui-100 — Refusal message under the edited field (2026-11-08 23:58 UTC)

A refused edit's message now sits under the edited field, not under the Delete bar. Checked in headless Chromium at 390x844 (the message is directly under the Corner radius field, outlined, and the Delete button is clear) and 1440x900. Real-device look at phone width is still to do.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone, refuse a Cube's Corner radius (for example 12 on a 40x20 box) and confirm the message reads clearly above Delete with no overlap | Open | |

### core-079 — Whole-model Subtract off the main thread (2026-11-08 23:03 UTC)

The 3MF whole-model cut is now a worker job with a pending line. The pending line sits where the error line is, and the cut's commit is still one main-thread task of about 11.5 ms. Not covered by a standing acceptance check: the phone-width layout of the pending line, and whether a dense real model's commit crosses 16 ms.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At 390 px width, the "Subtract in progress…" line does not push the operation buttons off-screen or cause horizontal scroll | Open | |
| 2 | On a denser 3MF than the Feather, the main-thread commit after a whole-model Subtract stays under 16 ms | Open | |

### ui-105 — Save to library checks names against My parts only, no Adjustable sizes (2026-11-08 21:38)

Scenarios 18 and 10 were driven at laptop width on Chromium only; the sheet's phone and tablet layouts are covered by `user-library.e2e.js` but nobody has tapped them since the sizes list went. The docs' *Saving another size* steps were written without confirming every edit they mention on a placed fixed part.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On the iPhone and the iPad, select a group, tap **To library**: the sheet is shorter, Name/Category/Cancel/Save are still thumb-sized, and the *built from a part with that name* line wraps cleanly under the field | Open | |
| 2 | Follow `docs/user-library.md` *Saving another size* exactly as written on a saved part; every step does what the page says | Open | |

### build-023 — Native app icons, launch background and accent (2026-11-07 UTC)

Built by generator `npm run icons` in `warpcad-native`. Nothing was run on a simulator or device, and no iOS or macOS build was made, so Xcode's asset-catalog settings are unproven. Android is split out as `build-024`.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | iPhone and iPad home screen: the WarpCad mark is full-bleed with no ring or pre-rounded corners | Open | |
| 2 | Launch screen is `#10131a` with no white frame, on iPhone and iPad | Open | |
| 3 | macOS Dock and app switcher: the rounded tile sits in Apple's grid at a size comparable to stock apps | Open | |
| 4 | Windows taskbar and Start menu show the tile | Open | |

### ui-097 — Align target part (2026-11-06 19:03 UTC)

The owner's original session (a WebMCP agent in Chrome creating and renaming cutters) was never reproduced, so the root cause of their record is unconfirmed. The fixture e2e and a hand check pass on a fresh load, and only the owner can confirm the fix on their own file.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Owner loads `~/Documents/alilgn-issue.ndjson` in desktop Chrome on the Mac, undoes the two snaps, selects the cutter, ticks Battery-Connector once, opens Align: the top line should end `› Battery-Connector`, and after Y outside + the cutter should sit 14.09 not 14.34. | OK | 2026-11-14 (`FIND-testing-018`): on a copy in the session scratchpad, never the original; production build (`npm run build`, `vite preview`). Chromium, laptop 1440x900. Opened the copy of `alilgn-issue.ndjson` through File ▾ → Open… (3 bodies, 54 records). **Undo is disabled on a fresh open** (the two snaps are History steps from the file, not entries on the local undo stack), so the two snaps could not be undone and the check ran from the loaded state, where the cutter's low-Y face is at **14.34**, the whole-feather face. Selected the cutter from the Objects list, expanded the feather, ticked Battery-Connector once (2 selected). Align's operand line reads `esp8266 feather › Battery-Connector` (`data-target="second"`). After **Y outside +** the cutter's bounds are `-19.04,14.09,0.57,-9.14,24.69,7.37`: low-Y face **14.09** (14.34 before), no align error, no page errors. Matches `e2e/align-target-part.e2e.js`, which runs the same steps on a fixture copy of this file. |


### ui-096 — A project-only My parts row can be deleted and says why (2026-11-06 13:07 UTC)

Scenarios 10, 18 and 31 are the standing checks this task names, and none were driven by hand: 18 needs an Anthropic API key, and 31 and 10 need a manual pass. The owner's esp8266 feather row is the one-off check, and it depends on the browser profile in the report.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On the owner's profile, open ⋯ on esp8266 feather: the note says why it's listed, and Delete… opens the explanation with Cancel only. Record which case it was (a placed, b nested, c stale). | Open | |
| 2 | Drive scenario 31 (owner's 3MF) by hand at phone width: the project-only line and ⋯ note wrap without horizontal scroll. | OK | 2026-11-14 (`FIND-testing-018`): on a copy in the session scratchpad, never the original; production build (`npm run build`, `vite preview`). Chromium and WebKit, 390x844 touch. The row's own wording (a project-only My parts row) is the `esp8266 feather` part that `alilgn-issue.ndjson` carries without a library copy, and the scenario-31 import is the 3MF. Both driven. **Project-only row** (opened the copy of `alilgn-issue.ndjson`, Library sheet, My parts): the row reads `Only in this project` (366 px wide, 15.4 px tall, inside the 390 px viewport); tapping ⋯ opens the sheet with the note `Not in My parts. It's listed because it's placed once in this project.`, which wraps to two lines (368 x 33.6 px, inside the viewport in both engines); Rename disabled, Delete… enabled. `document.documentElement.scrollWidth` and `body.scrollWidth` were 390 = `innerWidth` at every step, both engines. **Scenario 31 steps 1 to 4 on `esp8266 feather.3mf`** (placement by mouse, since Playwright has no touch drag): My parts count 0 before and after; the chip reads `Place esp8266 feather.3mf`; after placing, the status line reads `Imported esp8266 feather.3mf, 29 parts, 29,718 triangles, 51.3 × 22.9 × 6.37 mm. 58 exact duplicates skipped.`; Objects list expanded to the model's 29 parts; ticking `Part 22` leaves the model selected (1 object); scroll width 390 at every step in Chromium and WebKit, 0 page errors. |


### ui-095 — A My parts entry that fails to load can be deleted (2026-11-06 01:00)

Scripted drives reproduced the owner's broken state by saving a Feather enclosure, then removing the Feather's stored entry directly, and passed (scenario 31, laptop Chromium and phone WebKit). The owner's own browser profile, the one in the original screenshot, has data from an older build that no script can reproduce.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On the browser profile that showed *Your saved parts could not all be read: it nests "user.esp8266-feather"…*: the message now names the broken part, My parts lists it with a ⚠ and the reason, and **⋯ → Delete… → Delete** removes it and the message, which stay gone after a reload | Open | |
| 2 | On iPhone and iPad hardware: the broken row's reason wraps and the ⋯ sheet's Delete is easy to hit. On iPad, the rail tile's pop-out shows the reason (the rail has no banner) | Open | 2026-11-07: The wrap and iPad pop-out half, in the iOS Simulator moved to `FIND-testing-027`; whether Delete is easy to hit stays here. |

### ui-094 — Rename a part of a group (2026-11-05 20:05)

Scripted drives passed on the owner's Feather file in Chromium and WebKit at 390 and 1440 px (scenario 31,
step 10). What a script cannot judge: whether naming every part one at a time is tolerable, and how the
real iOS keyboard treats the field. The count decides whether batch naming gets filed.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On an iPhone, name all 29 parts of `esp8266 feather.3mf` (tap the row, tap the name, type, Done). Count the gestures per part and the minutes in total; say whether a batch-naming table is worth filing | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): phone 390x844 touch, a copy of ~/Downloads/esp8266 feather.3mf (original not touched), 29 parts renamed. The Objects list collapses after each rename, so per part: 4 taps (3 for the first: Objects header, part row, pencil, Enter) plus one typed name plus 2-8 scroll nudges that grow down the list (the sheet shows about 5 rows). Totals 115 taps, 138 scrolls, 29 typed names: 282 gestures, 9.7 per part (scripted 41 s, not human time). Scrolling is half the gestures, so a batch-naming table looks worth filing; the owner decides. iPhone minutes stay here. |
| 2 | On an iPhone and an iPad, with the name field open, the on-screen keyboard leaves the 3D view and the field visible (no page zoom, no sheet pushed off screen), and Done commits | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |


### ui-092 — Prompts view, highlight, part links and editing (2026-11-05 17:31 UTC)

Retired with two checks not run, on the owner's choice. Parts 1–5 and the docs are committed; the file's own Testing section still asks for both checks below. Acceptance scenarios 10, 22, 27 and 30 were re-driven in earlier runs (`TODO/ACCEPTANCE.md`), so these are the only things left for this task.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Performance: hover-to-painted on a **copy** of `~/Documents/fan-duct.ndjson` (never the original), per `.claude/prompts/perf-benchmark.md`, target one 16 ms frame. Must include the twins-heavy case. | OK | 2026-11-14 (`FIND-testing-018`): on a copy in the session scratchpad, never the original; production build (`npm run build`, `vite preview`). Chromium, laptop 1440x1300 (tall so every row is on screen), `bench/prompts-hover.mjs` (new), 5 runs x 15 enter/leave cycles per target, CPU 1x and 4x, headless software rasteriser. Result file `bench/results/2026-11-14-testing-018.md`. Hover-to-painted (pointer event delivered to the next vsync after the frame that drew the highlight): **p50 15.0 to 15.2 ms, p95 15.6 to 16.2 ms at 1x on all five targets**, the twins-heavy request rows (3 lit, 3 x-ray twins) included; the highlight is drawn about 2 ms after delivery. The tail is whole dropped frames: worst 32.6 ms (2 of 375 enters at 1x). At 4x the p50 is still 15.2 to 15.4 ms but p95 is 31.0 to 31.8 ms on four of five targets, and 49 of 9,301 frames passed 25 ms against 0 in the control. Met at the median under both rates; no finding filed. A real GPU is not represented (see #3). |
| 2 | Hand check on the same copy, laptop width: confirm the two rows, **Combine with next**, one request reading exactly as `~/Documents/fan-duct.prompt.txt`, one **Add reply…**, parts still listed, **Undo** restores two. Then paste `~/Documents/fan-duct.response.txt` as the reply. | OK | 2026-11-14 (`FIND-testing-018`): on a copy in the session scratchpad, never the original; production build (`npm run build`, `vite preview`). Chromium, laptop 1440x900, copy of `fan-duct.ndjson` (3 bodies). The Inspector's `Prompts (2) ›` opens the view with **2 rows** (3 parts each, `No reply` on both). Expanded the first and pressed **Combine with next**: **1 row**, 3 parts, the `Edited` badge, one **Add reply…**, and the request text is **byte-for-byte equal to `fan-duct.prompt.txt`** (4,345 characters both). **Undo** restored 2 rows (3 parts each); **Redo** combined again. **Add reply…** with `fan-duct.response.txt` pasted (a local paste, no key, no network call): the reply shown under the request is equal to the file (3,283 characters, after trimming), and Add reply… stays offered on the combined row, as `e2e/prompts-view.e2e.js` expects. No page errors. |
| 3 | The same hand check on a real phone, if one is available (390 px, touch only). | Open | |


### ui-090 — Show all in the Objects header (2026-11-05 17:02 UTC)

Automated coverage (unit 8498 green, object-visibility e2e 36/36 on all nine projects, full e2e 0 failures) does not replace a by-hand pass on the split-then-hide path. Found by the `ui-089` hand pass, which this closes.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Acceptance 6 (Group vs. sub-part selection): with a body selected, the header summary must not change which part row is selected. | OK | 2026-11-14 (`FIND-testing-019`): production build (`npm run build`, `vite preview`), laptop 1440x900, Chromium, real mouse. Cube and Cylinder dropped and Grouped (`Group 1`, parts `Cylinder 1`, `Cube 1`); `Cylinder 1` hidden from the Inspector Parts eye: the header summary reads `1 hidden · Show all`, the Group stays selected. Drilled into `Cube 1` (breadcrumb `Objects ▸ Group 1 ▸ Cube 1`), then pressed **Show all**: the summary went away and the breadcrumb still read `Objects ▸ Group 1 ▸ Cube 1`, so the summary never changed which part row is selected. Console and page errors: none. Scenario 6 now carries an "Also re-drive" line for it. |
| 2 | Acceptance 10 (Save, reload, confirm nothing changed): the header reads the same after a reload. | OK | 2026-11-14 (`FIND-testing-019`): production build (`npm run build`, `vite preview`), laptop 1440x900, Chromium. With `Cylinder 1` hidden and the save chip on `Saved`, a browser reload (nothing else) restored the project (`Restored your last session`) with the Objects header reading `1 hidden · Show all` and only the cube drawn; **Show all** brought the cylinder back. Same text before and after. Observation, not filed: after the reload the camera frames only the visible cube (a 40 mm cube fills the view), where before the reload it showed the default 3/4 view. Scenario 10 now carries an "Also re-drive" line. |
| 3 | Re-run the `ui-089` Hide / Show / Show all steps on a phone (390×844), and the `ui-085` sideways-scroll check on the Inspector sheet. | OK | 2026-11-14 (`FIND-testing-017`): production build (`npm run build`, `vite preview`), phone 390x844, Chromium and WebKit. Placed a Cube, Enlarged it to 90 mm on Y, Split it with pins, hid `Cube 1 A` from the Inspector's part eye, opened the Objects list, toggled the part eye (Show, Hide) and pressed **Show all**. Eyes are 44x44 px, Show all is 53.6x44 px, no Objects row child reaches past the row edge. Inspector sheet `scrollWidth` 390 = `clientWidth` 390 and document overflow 0 at every step in both engines (the `ui-085` check). Hiding changed 13,665 canvas pixels (Chromium 390x791); Show all returned the canvas to 0 changed pixels in Chromium. WebKit read 55,396 changed after Show all only while a stale hover highlight tinted the piece pink. That was the harness teleporting the mouse (Playwright WebKit fires no `pointerleave` on a jump): with a gliding mouse `data-hover` ends empty and the canvas is identical, so it is not an app defect. Screenshots `r1-ui090-{chromium,webkit}-phone-{hidden,objects}.png` in the scratchpad. |
| 4 | Docs still `docs/screenshots/objects-hide-split-piece.png` is not regenerated. `npm run docs:media`'s movie step fails and rewrites every GIF in `docs/media/`, so it was not run. Needs a scoped still-only regeneration. | Moved | Moved 2026-11-07 to `FIND-docs-033`: an AI drive can settle it. |

### ui-078 — phone header grouped AI menu (2026-11-05 15:20 UTC)

The header now has one ✦ trigger at phone width instead of Live MCP and Assistant. Share moved out of the row on every phone. The width budget and measured edges are covered by `e2e/header-width-budget.e2e.js`. Scenarios 24 and 25 need a real key and an MCP client, so a person has to check the feel.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At 390x844 on a real phone, tap ✦ then Live MCP access; the access sheet opens and the menu closes. Judge the tap target and the popover placement. | Open | |
| 2 | At 390x844, confirm File ▾ → Share… is easy to find now that Share is off the row on phones. | Issue | 2026-11-14 (`testing-029` panel): A: unclear. Share exists only inside File ▾ (about the 11th of ~20 rows) and is greyed *Nothing to share yet* on an empty project. B: unclear, same. Both reached it in 2 taps once a shape existed. Filed `FIND-ui-128`. |

### ui-074 — Repeat body note wording (2026-11-05 12:57 UTC)

The note is a single sentence, so the only one-off check is how it wraps in the Inspector at phone width. The text is covered by unit specs and the repeat e2e specs, but nobody has looked at it on a 390 px screen.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Select a repeat body at 390 px and read the note; confirm it wraps without clipping or horizontal scroll | OK | 2026-11-14 (`FIND-testing-017`): opened a project holding a `pattern.repeat` body (`piBoltRepeated`, the `Bolt 1 ×3` body) in the production build at phone 390x844 in Chromium, WebKit and Firefox, and selected it from the Objects list. The note reads "Repeats Bolt 1 on Raspberry Pi 1's hole2, hole3 and hole4. Edit Bolt 1 and every repeat follows." in 2 lines at 12 px inside a 366 px section, no child past the section edge, Inspector sheet `scrollWidth` 390 = `clientWidth` 390, document overflow 0, **Go to Bolt 1** 104.6x44 and **Detach** 76.2x44. Screenshots `r2-ui074-{chromium,webkit,firefox}-phone.png`. |

### render-007 — Hidden-part toggle-off remnant (2026-11-03 20:30 UTC)

The remnant was a Firefox-only paint of the gizmo's Z-arm shadow in the snapshot helper, not an app ghost. Spec fixed. Three sibling specs still use the same `visibility:hidden` snapshot helper and were not changed: they may hit the same paint if a filtered overlay sits in their measured area.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Subtract with a bolt over a cube at phone width, then look for a shadow ghost near the bolt base after Show hidden parts off | OK | 2026-11-14 (`FIND-testing-017`): Chromium, WebKit and Firefox at phone 390x844 (Firefox also at tablet). Cube plus Bolt, then (a) Show hidden parts on and off on the Bolt: the canvas changed 1,951 px (Chromium), 7,758 (WebKit, 2x pixels) and 1,949 (Firefox) with the overlay on and **0 px** after turning it off, also 0 px with the gizmo and chrome left on screen (region above the sheet); (b) the docs flow, toggle on, tick the Cube and the Bolt's `tap` from the Objects list, **Subtract**: the result has no hidden-parts toggle left (the Bolt is consumed), and its canvas differs by **0 px** from the same view after a 1 px resize and back (a forced full redraw), in all three engines. No shadow ghost at the bolt base. Screenshots `r3-render007-*-phone-*.png`. Hand-checked more than once now: graduation filed as `FIND-testing-039`. Graduated 2026-11-15 (`FIND-testing-039`): `e2e/gizmo-overlay-pixels.e2e.js` now keeps this on all three engines; no hand re-check needed. |
| 2 | Firefox, a real window (not the spec): Show hidden parts on, then off, at tablet, and look for a faint grey bar left at the bolt base | OK | 2026-11-14 (`FIND-testing-017`): a headed Firefox window (Playwright's Firefox 155 build, `headless: false`, 820x1180 tablet viewport; it launched fine here) with a Cube and a Bolt: Show hidden parts on changed 4,633 px; off again changed **0 px** against the first picture (largest per-pixel delta 19 of 765 right after, 3 once the pointer left, 5 non-zero pixels), taken with the gizmo, nav chrome and scale readout on screen, so no faint grey bar at the bolt base. Not covered: this is Playwright's patched Firefox on an emulated viewport, not the owner's installed Firefox at its own display scale, and no human eye. Screenshots `r4-render007-firefox-tablet-headed-{on,off}.png`. `FIND-testing-039` files the spec that would keep this. Graduated 2026-11-15 (`FIND-testing-039`): `e2e/gizmo-overlay-pixels.e2e.js` now keeps this on all three engines; no hand re-check needed. |


### docs-029 — Agent prompting guide (2026-11-03)

Not covered by an acceptance scenario, and not runnable unattended: it needs a model with web search and no WarpCad context, handed only the published URL. The page itself, its generated tool list and its worked example are covered by `scripts/agent-docs.spec.js`, `scripts/agent-example.spec.js` and `e2e/agent-prompting-help.e2e.js`. Two lines are only possible after deploy: the home page link in `~/src/@WarpCad/warpcad.github.io` (`docs-027`), and the live URLs.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | After deploy, give a model with web search only `https://app.warpcad.com/help/agent-prompting.html` (and separately `https://app.warpcad.com/llms.txt`) and ask it to write the box-and-lid prompt. Record whether it found the page and used the exact tool names (`define_variable`, `apply_records`, `bind_param`, `set_variable`, `describe_scene`, `measure`, `check_printability`). | OK | 2026-11-15 (`testing-032`): two fresh Haiku agents (no fork) with WebFetch only, one per URL. Caveat: WebFetch hands back a condensed summary, not the verbatim page. From `/help/agent-prompting.html` alone: found the page and wrote a box-and-lid prompt naming `define_variable`, `bind_param`, `set_variable`, `describe_scene`, `measure` of the row list, using `create`/`operate` instead of `apply_records` and `check_clearance` instead of `check_printability` (all real tools, none invented); it also guessed a `modify.fit` lid step it flagged as inference. From `/llms.txt` (followed to the guide and `llms-full.txt`): the prompt named all seven (`define_variable`, `apply_records`, `bind_param`, `set_variable`, `describe_scene`, `measure`, `check_printability`). The page does not mislead a model; `docs/agent-prompting.md` unchanged. One gap both noted: no `primitive.cuboid` parameter names in what they read. |
| 2 | After deploy, `curl -I` `https://app.warpcad.com/llms.txt`, `/llms-full.txt` and `/help/agent-prompting.html` return 200 with a readable content type. | OK | 2026-11-15 (testing-024), `curl -I` with a generic client: `https://app.warpcad.com/llms.txt` HTTP/2 200, `content-type: text/plain; charset=utf-8`, 1,644 B; `/llms-full.txt` 200, `text/plain; charset=utf-8`, 75,168 B; `/help/agent-prompting.html` 200, `text/html; charset=utf-8`, 100,349 B. All three `last-modified: Tue, 10 Nov 2026 19:55:14 GMT` (the v1.17.0 deploy, Release run 42889800438). `llms.txt` opens `# WarpCad` and links the guide. |
| 3 | Add the guide to the docs list on the home page (`warpcad.github.io`, one line), noted in this task's closing commit. | OK | Moved 2026-11-07 to `FIND-docs-032`, done 2026-11-09: grouped under The AI partner in `warpcad.github.io` (7219a05); the home page build renders the link. |

### ui-093 — Mark a part hidden or shown by default (2026-11-03 14:20 UTC)

Not covered by a standing acceptance scenario: scenario 24 needs a real API key, and `ui-085` needs a real iPhone. Everything else in the drive is covered by the e2e spec or the hand drive.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Acceptance scenario 24 ("Edit while the Assistant works") with a real model key: a hidden part marked during an AI turn stays hidden when the turn lands. | Deferred | Needs a real Anthropic key. 2026-11-07: Deferred due to cost. Needs a real Anthropic API key, which bills against purchased tokens, not the Pro subscription. |
| 2 | `ui-085` on a real iPhone: the Inspector's **Hidden by default** row wraps, the sheet does not scroll sideways, and tapping the label toggles it. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. The e2e checks `scrollWidth` only in emulated WebKit. |

### ai-033 — Per-project AI step limit (2026-11-02 21:48 UTC)

Not covered by a standing acceptance scenario: scenarios 24 and 25 need a real API key and a live MCP client, and this session had neither. The bar button, sheet and notice were checked only by the e2e spec and the screenshot.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Scenario 24 with a real key at phone width: the **Limit: 1,000** button and the sheet stay usable with the keyboard open. | Deferred | 2026-11-07: Deferred due to cost. Needs a real Anthropic API key, which bills against purchased tokens, not the Pro subscription. |
| 2 | Scenario 25 with a real MCP client: raise the limit mid-burst; the next call lands in the same group. | OK | 2026-11-14 (`FIND-testing-022`): dev server, lease 1 hour, limit 50 (min allowed) via the **Limit** sheet. Run 1 (*80 cubes in four apply_records calls of 20*): the 3rd call was refused `One turn may append at most 50 records; 40 have landed and this call needed 20 more. Nothing from this call was appended, and the turn has stopped. This is the project step limit ... only the person can change it: tell them ... and wait`; I raised the limit to 300 within 1 s, but the agent had already reported and stopped (it obeyed "wait"), so no next call. Run 2 told the agent to call describe_scene eight times and retry after a refusal: 40 landed, 3rd call refused at 17:36:25, limit raised to 300 the same second, eight describe_scene calls, the SAME call retried and landed, the rest landed (120 cubes in all, 82 to 202 bodies). One **Undo AI turn** took all 120 back in a single step (202 to 82), so the pre- and post-raise calls were one group; the notice offered **Change limit...** (`ai-step-limit-from-notice` present). Note the run was Haiku and the wait was my scripted one. |
| 3 | Open a project file stating 3000 in a browser that never approved it: the bar reads 1,000 and **Use 3,000** appears. | OK | 2026-11-14 (`FIND-testing-019`): production build (`npm run build`, `vite preview`), laptop 1440x900, Chromium, fresh context (never approved), no key (stand-in `document.modelContext` agent so the Assistant opens linked). File ▸ Open of a two-record file whose `project-state` merge section states `aiRecordsPerTurn` 3000: the bar reads `Limit: 1,000 steps` with `data-untrusted="true"`, **Limit** opens the sheet with "This project asks for 3,000 steps. It's using 1,000 until you approve it." and **Use 3,000**; pressing it, the bar reads `Limit: 3,000 steps`. 1 body loaded. No page errors. |


### core-076 — Group popover on real hardware (2026-11-02 20:10 UTC)

Every scenario was driven in emulation, including trusted touch at phone width. Emulation has no on-screen keyboard, so the rule that commit stays reachable while typing a prefix was only reasoned about: the row list is capped at 40% of the height for it.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, select two groups, press **Group** and tap **Prefix**. With the keyboard open, can you still reach the panel's **Group** button, and does the page stay unzoomed? | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 2 | With five or more rows (two Pis and three Cubes) on the same phone, does the list scroll inside the panel without the page moving behind it? | Open | |

### perf-003 — Acceptance checks not driven (2026-11-02 18:23 UTC)

The perf-003 change shipped with its bench and the closed-finding checks done. Three checks could not be driven in this run, so they are logged here for a human to run: ai-006 needs the dev-only scripted provider, which only exists in the dev build, and the owner ruled out the dev server for this run. Scenarios 24 and 25 need a real model key and a live MCP client against `npm run dev`. The three are not covered by a standing scenario run, so they belong here.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | `ai-006`: open the chat panel on a dev build, run a scripted turn that lands a body, press **Undo AI turn**, and confirm the body is taken back and the header Undo still reads correctly. | OK | 2026-11-14 (`FIND-testing-019`): `npm run dev` (port 5183, stopped afterwards), Chromium 1440x900, scripted provider with `e2e/fixtures/ai/airfoil-wing.json`, `api.anthropic.com` routed to throw (no call made), no key. A hand-placed Cube first (header Undo reads `Undo: Place Cube 1`), then the scripted turn landed 4 bodies (5 in all); the header Undo still read `Undo: Place Cube 1`. **Undo AI turn** took the 4 back (1 body left); header Undo still read `Undo: Place Cube 1`. Header Undo then removed the cube (Undo disabled, Redo `Redo: Place Cube 1`) and Redo restored it. The scripted turn never entered the local undo stack. No page errors. |
| 2 | Acceptance scenario 24, "Edit while the Assistant works": laptop then phone, with a real model key, following the scenario's steps 1–7. | Deferred | Needs a real Anthropic key. The scripted transcript covers the plumbing only. 2026-11-07: Deferred due to cost. Needs a real Anthropic API key, which bills against purchased tokens, not the Pro subscription. |
| 3 | Acceptance scenario 25, "An MCP agent edits the project you have open": `npm run dev`, a loopback MCP client, lease enabled, steps 1–7, plus phone reachability of the access control. | Open | 2026-11-14 (`FIND-testing-022`): Acceptance 25 on the dev server with real Claude Code as the loopback client. Step 2 (lease off): refused in words, 0 bodies, no code. Step 3: sheet names the local-machine scope, 15 minutes; chip `MCP agent · connected`, Assistant folded to its header chip plus **Undo AI turn** (composer and transcript hidden). Step 4: Cube 1 and Sphere 1 landed, History `via mcp`; with the sphere selected the agent called get_selection and named `Sphere 1 (sphere-u34z62-2)`; 80 and 120 new cubes landed in later bursts. Step 5: a hand move of Sphere 1 then **Undo AI turn** was refused with `Can't undo the AI turn: "sphere-...-move-...", added via local, depends on "sphere-..." - edit or delete it first` (internal ids, `FIND-ui-125`); header **Undo** took the move back; the next **Undo AI turn** took the agent bodies back (0). Unrelated later groups were taken back by Undo AI turn without refusal and left the header Undo stack alone. Step 7: the 15-minute lease expired mid-session and the next call got `live MCP access expired. Enable it again in WarpCad, then retry.` and wrote nothing; the sheet read `Live MCP access expired. Enable it again to reconnect.` Phone 390x844 (viewport resize, no touch emulation): header shows the 44x44 AI menu button, its menu lists Assistant and **Live MCP access**, the open Assistant has the chip (179x44), Undo AI turn, Limit and close all 44 tall and on screen, `scrollWidth` 390. Not driven: step 6 (a held Library drag during an agent write) and a gizmo drag (Position field used). Open for those two. |

### build-022 — Owner checks to bring warpcad.com live (2026-10-31 21:20 UTC)

Rows 1–8 checked 2026-11-05 against the live site: the repository exists, the DNS and Pages steps (rows 2–5) are done, and `warpcad.com` is verified with HTTPS enforced. Rows 9–10 are still open: a hand check on real devices, and the next scheduled Pages run. Rows 6–10 are the task's tests; record each result with the date and the output, as `build-010` did.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Create the repo and push: `gh repo create WarpCad/warpcad.github.io --public --source ~/src/@WarpCad/warpcad.github.io --push`. Then enable Pages from Actions (`gh api -X POST repos/WarpCad/warpcad.github.io/pages -f build_type=workflow`). The first workflow run deploys to `https://warpcad.github.io/`; check that address shows the page. | OK | 2026-10-31: owner ran the create and push; Pages set to Actions. First deploy (run 41249131909) failed on the picture-stable screenshot test, which compares Linux renders with macOS baselines; CI now skips that one test (`f6e76f9`), and the next run (41249234999) succeeded. `https://warpcad.github.io/` returns 200 and shows the page with its Open WarpCad link. Linux baselines are a follow-up. |
| 2 | Verify `warpcad.com` for the WarpCad org before any DNS points at GitHub: org Settings → Pages → Add a domain, add the `_github-pages-challenge-WarpCad` TXT record at Squarespace, verify. | OK | 2026-11-05: `gh api repos/WarpCad/warpcad.github.io/pages` reports `protected_domain_state: verified` for `warpcad.com`. The challenge TXT record is present (`dig +short _github-pages-challenge-WarpCad.warpcad.com TXT`). The date of the change is not recorded. |
| 3 | Squarespace DNS: remove the four Squarespace `A` records on `@` and the `www` CNAME to `ext-sq.squarespace.com`; add `A @` to the four GitHub addresses (re-check them in GitHub's Pages docs first), `AAAA @`, and `CNAME www` → `warpcad.github.io`. Leave `app` exactly as it is. Check with the owner before removing any MX record. | OK | 2026-11-05: the four Squarespace `A` records and the `www` record to `ext-sq.squarespace.com` are gone. `A @` is the four GitHub addresses, `AAAA @` the four `2606:50c0:800x::153`, and `www` a CNAME to `warpcad.github.io.`. The MX records (`mxa`/`mxb.mailgun.org`) are untouched. |
| 4 | Pages settings: Source "GitHub Actions", custom domain `warpcad.com`, save; wait for the DNS check. | OK | 2026-11-05: Pages API reports `build_type: workflow`, `cname: warpcad.com`, `html_url: https://warpcad.com/`. |
| 5 | Enforce HTTPS once the certificate is issued. | OK | 2026-11-05: Pages API reports `https_enforced: true`. |
| 6 | `dig +short warpcad.com A` shows the four GitHub addresses; `dig +short www.warpcad.com CNAME` shows `warpcad.github.io.`; `dig +short app.warpcad.com CNAME` still shows `warpcad.github.io.`. | OK | 2026-11-05: `dig +short warpcad.com A` → 185.199.108.153, .109.153, .110.153, .111.153. `www` CNAME → `warpcad.github.io.`. `app` CNAME → `warpcad.github.io.`. |
| 7 | `curl -sI http://warpcad.com` is a 301 to `https://warpcad.com/`; `https://www.warpcad.com` redirects to `https://warpcad.com/`; `https://app.warpcad.com/` is 200 and the app is unchanged. | OK | 2026-11-05: `http://warpcad.com` → 301, `Location: https://warpcad.com/`. `https://www.warpcad.com` → 301 to `https://warpcad.com/`. `https://app.warpcad.com/` → HTTP/2 200. The Help version line was not checked here. 2026-11-05 follow-up: the app's live `help/index.json` says version 1.7.0, commit `8f2897d`, which is not in this repository. The last app Pages deploy visible here is `e71813d` (2026-10-18). Resolved 2026-11-05: `8f2897d` is on `origin/main`, the commit before the v1.7.0 release commit `1ac4b3a`. The live index reports version 1.7.0, which matches the latest release. Owner report: the app is up to date (owner's words). |
| 8 | `https://warpcad.github.io/warpcad/` (the app's old project-site address) redirects to `https://app.warpcad.com/`, and is not served under `warpcad.com/warpcad/`. Record what happens (`docs-026` question 2 predicted it). | OK | 2026-11-05: `https://warpcad.github.io/warpcad/` → 301 to `https://app.warpcad.com/`. `https://warpcad.com/warpcad/` → 301 to `https://app.warpcad.com/`. Neither is served under `warpcad.com/warpcad/`. |
| 9 | Live check by hand at phone 390×844, tablet and laptop, in Safari on an iPhone or iPad plus one desktop browser: follow the `docs/help.md` example, tap **Open WarpCad**, then acceptance scenario 1 (place a box and a sphere; both stay visible). | OK | 2026-11-05, emulated, not a device: a Playwright driver against the live `https://warpcad.com/`. Home title "WarpCad"; the "Open WarpCad" link goes to `https://app.warpcad.com/`. Scenario 1: laptop 1440×900 Chromium `OBJECTS (2)` with Sphere 1 selected; tablet 820×1180 Chromium `OBJECTS (2)`; phone iPhone 13 emulation in WebKit, Cube 1 and Sphere 1 both present (the phone drop needed the Library sheet opened and the row scrolled into view). Caveat: both drops landed at the same spot, so the sphere overlaps the cube; both remain visible. Still needed: a real iPhone or iPad in Safari, with a person's hands. 2026-11-05, owner report: on an iPad the site "looks good" (the owner's words; the Safari version, the scenario 1 steps and the phone and laptop were not reported). Still needed: the iPhone, one desktop browser, and scenario 1 done by hand on the device. 2026-11-05, owner report: on an iPhone the site also "looks good" (owner's words; the Safari version and the steps run were not reported). Still needed: one desktop browser, and scenario 1 done by hand on the device. 2026-11-05, owner report: the desktop browser also "looks good" (owner's words; browser and version not reported). Owner report: scenario 1 works on the device (the owner's words, "that works"; the device and the steps run were not itemised). |
| 10 | The home page's `pages` run (scheduled daily until 2026-11-06, manual since) succeeds, and every slug in the app's live `help/index.json` is linked from `https://warpcad.com/` as `https://app.warpcad.com/#/help/<slug>`. | Issue | 2026-11-15 (testing-024). Pages half OK: the home page's scheduled daily `pages` run in `WarpCad/warpcad.github.io` succeeded on 2026-11-05 13:14 UTC (run 42033984490) and on 2026-11-06 12:58 UTC (run 42221730899, the last: `b3c72b6` then made the workflow manual-only). Links half fails: the live `https://app.warpcad.com/help/index.json` (version 1.17.0, commit `cf08c20`) lists 35 pages; `https://warpcad.com/` (`last-modified: Fri, 06 Nov 2026 13:02:21 GMT`) links 33 as `https://app.warpcad.com/#/help/<slug>`. Missing: `native-apps`, `import` (both added after the last rebuild). Filed `FIND-build-039`. Earlier note (2026-11-05, 33 of 33 linked, `help-index.snapshot.json` not part of this pipeline) kept for the record. |

**Decided 2026-11-01:** the owner moves `warpcad.com` now, running rows 2–5 in order (row 1 is already done). `app.warpcad.com` stays untouched. Results go in the table above, with date and output.

Then the deferred `docs/README.md` and `README.md` links, and the `hosting.md` section, land in this repository.

### io-023 — Gist README carries the project brief (2026-10-31 04:38 UTC)

The README is generated Markdown. The fake gist API proves its text, but not how GitHub renders it, and the shared About popup has only been driven at 390 px in Chromium. Scenarios 29 and 30 were driven on the dev server (see ACCEPTANCE.md Re-checked lines); these two are the parts that only a person on a real page can judge.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Open a published gist on github.com and read the README: the description quote, **How this was made** with its block quotes and **Reply**, and the **Variables** table (columns, the – range, the em-dash for an open range) render as a table, not raw pipes. | Open | |
| 2 | On a real iPhone in Safari, open a short link to a project that has a description: the About popup sits over the model, **View the model** dismisses it, and the header **About** button brings it back. | Open | |

### io-019 — Update gist merges before publishing (2026-10-29 13:32)

Driven by e2e and a scratch clash drive on Chromium and WebKit, never against real GitHub or on a real phone.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | With a real throwaway token, edit one published project on a laptop and a phone, tap **Update gist** on both: the second shows the merge strip then *Gist updated*, and the real gist keeps both edits (the 60 s read cache is the unknown). | Open | |
| 2 | After a gist merge, tap **Undo merge**, then **Update gist**: confirm the gist loses the merged rows ("take mine") and that this reads acceptably. | Open | |

### ui-079 — Tiered Library and Operations panels (2026-10-29 12:40)

Closed with only scenarios 1 and 4 (and 7's button presses) re-driven at 820 and 720 px on Chromium and WebKit, at the owner's request ("I'll verify later"). The rest of the file's Testing section is owed.

| # | Check | Status | Notes |
|---|---|---|---|
| 3 | Drag a window edge slowly 1440 to 390 px and back in Chrome, Firefox and Safari, and on a real iPad (portrait, landscape, Split View): no jumps, text squash or cover of the gizmo/nav chrome | Open | 2026-11-07: The desktop-engine half (a 1440 to 390 px sweep in Chromium, Firefox and WebKit) moved to `FIND-testing-017`; the real-iPad half stays here. 2026-11-07: The real-Safari window resize moved to `FIND-testing-026`; the real-iPad half stays here. 2026-11-14 (`FIND-testing-017`): the desktop-engine half is answered. A 1440 to 390 px sweep and back in 10 px steps (106 steps each way, height 900) in Chromium, Firefox and WebKit: document overflow 0 at every width; the same breakpoints each way within one step (Library column to rail at 1020/1030, back to column plus tabs at 640/650, header drops a button at 480/490); no layout jump above 60 px except at those breakpoints; header height 53 px throughout; the selection gizmo's hub never covered or off screen; no label clipped except the header hint, which ellipsises by design. **One defect:** at 650 px (and 660 px in Chromium and WebKit) the navigation chrome overlaps the scale readout by 10.3 x 50 px: `FIND-ui-124`. The real-iPad half (portrait, landscape, Split View) stays Open. |

### ai-029 — MCP prompts as slash commands and Copy starter buttons (2026-10-29 09:50)

Prompts and buttons are tested through an SDK client and a stubbed clipboard; nothing here was driven in real Claude Code or by hand, and acceptance 1, 23 and 25 were not re-driven.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | In Claude Code, `/` lists `mcp__warpcad__start`, `build` and `check-print`; `start` on a fresh file says it is empty, asks what to build and writes nothing | Open | |
| 2 | `/mcp__warpcad__build` with the plate example lands the plate with the request as every History row's intent; `check-print` leaves the file's bytes unchanged | OK | 2026-11-14 (`FIND-testing-022`): Claude Code 2.1.322 headless, `claude -p --model haiku` (claude-haiku-5-5), owner subscription, no API key, scratchpad file, `--strict-mcp-config`. `/mcp__warpcad__build a 60 x 40 x 3 mm plate with four M3 clearance holes 5 mm in from each corner` expanded. Calls: ToolSearch, record_prompt, describe_scene, list_ops, apply_records, operate (subtract four cylinders), measure, check_printability, capture_view, record_response (11 turns, 0 errors). The file holds one body 60 x 40 x 3 with four 3.4 mm holes at (+-25, +-15); all six steps carry the request words as intent (`merge.prompts` links them). `/mcp__warpcad__check-print` then made 4 calls (describe_scene, measure, check_printability) and the file SHA-1 was `c5b29ae2de86` before and after (unchanged). Transcript: `bench/results/ai/2026-11-14-mcp-guide.md`. |
| 3 | Does Claude Code deliver the embedded guide whole (not cut at 2,048 characters)? If not, add the "read warpcad://guide" fallback to the recipes | OK | 2026-11-14 (`FIND-testing-022`): Claude Code delivers the embedded guide whole. The session transcript of the `/mcp__warpcad__build` run holds one `[Resource from warpcad at warpcad://guide]` block, 10,394 characters including the recipe (the guide alone is 9,482), ending with the guide last sentence; nothing cut at 2,048. No "read warpcad://guide" fallback needed, no recipe change. |
| 4 | Does headless `claude -p "/mcp__warpcad__build …"` expand MCP prompts at all? Also paste the other-agent paragraph into a client without prompt support | Open | 2026-11-14 (`FIND-testing-022`): First half answered: yes, headless `claude -p "/mcp__warpcad__build ..."` and `"/mcp__warpcad__check-print"` both expand MCP prompts (see row 2). Second half (paste the other-agent paragraph into a client without prompt support) not driven: no such client here. Left Open for that half. |

### ai-028 — The MCP guide resource (2026-10-29 00:20)

The guide is served and tested with an SDK client; whether a real agent reads it unprompted, and whether it helps, was not measured.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | With the owner's consent, repeat `ai-027`'s three-case drive twice each in Claude Code against this build; record whether the agent read `warpcad://guide` unasked, and append to that task's result file | OK | 2026-11-14 (`FIND-testing-022`): Claude Code 2.1.322 headless, `claude -p --model haiku` (claude-haiku-5-5), owner subscription, no API key, consent recorded in `FIND-testing-022` (owner, 2026-11-13). The three cases twice each (cube-with-hole, bracket-m4, the ambiguous airfoil request): in all 6 runs the agent called record_prompt first, then read `warpcad://guide` with ReadMcpResourceTool unasked (call 2 or 3), then describe_scene. Counts, refusals and check-before-done per run are in `bench/results/ai/2026-11-14-mcp-guide.md` (appended there; ai-027 never ran, so no before arm to sit beside). A first pair on the bench prompt *make me something nice* was discarded: Claude Code default tools answered with an Artifact page and never reached WarpCad, so the later runs cut the tool set. The owner Claude Code MCP config was not touched by these runs (throwaway `--mcp-config`). |
| 2 | In Claude Code, `@warpcad:warpcad://guide` attaches the guide (the `docs/mcp.md` example) | Open | |

### io-022 — Prompts in the gist README (2026-10-28 21:49 UTC)

GitHub's own rendering of the **How this was made** section is not something a test can see: block quotes, the `&#64;` mention break, and the "and N more" line on a real github.com page. Only a human on the published gist can check that.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Open a gist published with a prompt on github.com: the quote renders as a quote, `@name` shows as text and does not link to a profile, and nothing else on the page changed. | Open | |

### io-021 — File ▾ → Save as gist… (2026-10-28 21:19 UTC)

Hand-driven by an agent on Chromium at 1440 and 390 px; the scripted e2e specs cover the flow itself. Two things only a person can judge: how the toast sits over the Operations toolbar for a few seconds at laptop width, and whether the "Saving…" chip flash after Save as gist reads as noise on a real phone.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At 1440 px, the "Saved to gist: <name>" toast covers part of the Operations toolbar (Chamfer, Enlarge) for a few seconds after Save as gist. Is that acceptable, or should it sit elsewhere? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | On a real iPhone, Save as gist's dialog as a bottom sheet with the on-screen keyboard up in the Name field: is the Save button always reachable? | Open | |
| 3 | On a real phone, the header's chip reads "Saving…" for about a second after Save as gist, then "Saved to gist". Noticeable or fine? | Open | |

### io-020 — Gist title follows the Share sheet's Name (2026-10-28 19:28 UTC)

The E2E for this runs against the fake gist API, so the real GitHub title and file list are only
checked by hand. Scenario 30 already queues the real-account check; this row is the rename case.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real gist (secret, your account): never-saved project, type *Fan Duct* in **Name**, **Publish to a gist**; then type *Desk stand* and **Update gist**. On github.com the gist title and file list show *Desk stand* and no `fan-duct` file. | Open | |

### ai-027 — MCP instructions carry the working method (2026-10-28 17:52)

The owner declined the real Claude Code before/after drive, so nothing yet shows an agent behaves better with the longer instructions. Only the text, its length (at most 1,900) and its transport delivery are tested.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | In a real Claude Code on a fresh project file, ask *a 40 mm cube with a 10 mm hole straight through it*: it places the cube on the grid, subtracts, measures, and does not ask about units. Ask the ambiguous airfoil request: zero writes. | Issue | 2026-11-14 (`FIND-testing-022`): Claude Code 2.1.322 headless, `claude -p --model haiku` (claude-haiku-5-5), owner subscription, no API key, fresh empty file per run, built-in tools cut to ToolSearch and the resource readers. Cube with a 10 mm hole straight through it, two runs: record_prompt first, guide read, 4 or 5 calls to the first write, create cube, create cylinder, subtract, measure, check_printability, record_response; no question about units; one body 60,894 mm3, 0 errors. Airfoil request, two runs: run 1 asked what it needed (NACA section, span, chord) and wrote nothing but the prompt record (0 bodies); run 2 did NOT ask: it assumed a span and appended 8 write steps (killed by my 110 s cap, 2 refused splitWithJoint calls). So one of two runs broke "zero writes" on Haiku; model-behaviour variance is `FIND-testing-032`. Table: `bench/results/ai/2026-11-14-mcp-guide.md`. |
| 2 | The cap is still 2,048 in the current Claude Code (`CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` was reported but not re-checked online). | OK | 2026-11-09: No. code.claude.com/docs/en/mcp (For MCP server authors) gives 4,096 characters for server instructions and upfront tool descriptions and 16,384 for tool-search descriptions; 'before v2.1.296 the shorter limit was 2,048'. `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` (v2.1.280+) overrides both (code.claude.com/docs/en/env-vars). Our 1,900-character prompt is under either cap; `mcp/prompt.spec.js` keeps 2,048 as a conservative bound for older Claude Code. |

### ai-031 — Agents store the prompt in the project (2026-10-28 17:38)

Driven with the WebMCP stand-in only (acceptance 27 row). A real agent was not run, and the timeline-row Prompt display was not built.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | With a real browser agent (Chrome with WebMCP) or Claude Code, ask *a 140 × 250 mm fan duct, 1.6 mm walls*; confirm the agent actually calls `record_prompt` first with your exact words, and the Inspector's Prompt row shows them. | OK | 2026-11-14 (`FIND-testing-022`): Claude Code 2.1.322 headless, `claude -p --model haiku` (claude-haiku-5-5), owner subscription, no API key, *a 140 x 250 mm fan duct, 1.6 mm walls*: after ToolSearch the first WarpCad call was record_prompt with the exact words, then the guide read, describe_scene, and the agent stopped to ask for the missing length (0 bodies; the file holds only the prompt record). Because no body was built, the Inspector Prompt row was checked on the plate run file: opened in the app (File Open fallback, Chromium 1440x900), the plate selected, the Inspector shows `Made by a 60 x 40 x 3 mm plate with four M3 clearance holes 5 mm in from each corner` and a Prompts tab. |
| 2 | On an iPhone or iPad, select a body with a long prompt: the row wraps, the page does not scroll sideways, and tapping it opens and closes it. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 3 | Decide whether the timeline (History) row should also show the prompt, as the finding's Feedback line says; if so, file it. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### io-017 — Store and share a project as a gist (2026-10-28 14:30)

Step 0 ran against real GitHub with a classic `gist` token and a fine-grained Gists-write token
(`docs/decisions/gist-storage.md`); the screens were hand-driven against the fake gist API only.
Acceptance 30, 29 and 22 cover the flows; these rows are what they could not see.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | With a fine-grained token that has **no** Gists permission, `PATCH /gists/00000000000000000000000000000000` returns 403 (not 404). `validateGistToken` relies on it; if it returns 404 a permissionless token would pass validation | Open | |
| 2 | One real publish, read and delete with a throwaway token from a real iPhone: does **Publish** put the link on the clipboard (Safari refuses a copy that follows network calls; the sheet starts the write inside the tap), is the token field above the on-screen keyboard in the bottom sheet, how the link and the gist's README look in Messages and on github.com, and do GitHub's real token-page labels match "no repository access" and "Gists: Read and write" in the docs | Open | |
| 3 | At 390 px there is no persistent **Published** indicator (Share is under File ▾, the chip is hidden there). Decide whether a phone needs one, for example a dot on **File ▾** | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 4 | The "Published. Link copied" toast covers the sheet's **Share** title for about 4 s at tablet and laptop width; judge whether it bothers | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### io-016 — Share a project by link (2026-10-27 19:15)

Both stages landed and were hand-driven in headless Chromium and WebKit, but nothing here could be tried on a real phone. Payload sizes are measured (largest real project: 2,303 URL characters); where a real client breaks is not.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Paste a long share URL (try the dovetail example's link, then a padded one around 6, 10 and 20 KB) into an iPhone Messages thread and a Gmail draft; record where each stops linkifying, wraps badly or truncates, then set the ceiling in `docs/decisions/share-link.md` | Open | |
| 2 | Does `navigator.share` exist inside a Tauri WKWebView (iOS and macOS)? Record the answer for `build-018`'s probe list | Open | |
| 3 | Does an unpadded base64url payload survive being tapped in Messages and Mail without a trailing character being eaten (`-`, `_` at the end)? | Open | |
| 4 | Stage 2 (2026-10-27): the link preview card Messages draws for a WarpCad share link — does it use the generic `og:title` / `og:description` / `og:image` from `index.html` (the WarpCad social preview), and does the card hide or mangle the link? | Open | |
| 5 | Stage 2: how a share link looks and behaves in Gmail on Android (linkified whole? the Shared view opens in Chrome from the Gmail in-app browser?) | Open | |
| 6 | Phone and tablet: the Shared view's nav pad and view box are the editor's compact 28-38 px controls, not 44 px (`--tap-compact`, unchanged by this task). Is that acceptable for someone using it for the first time with a thumb, or should the Shared view get full-size chrome? File it as its own TODO if not | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### core-075 stage 4 — seam profiles: sliding dovetail, puzzle tabs, half lap, finger joint (2026-10-27 17:05)

Everything checkable without a printer was driven: sheet, refusals, real piece sizes, half lap applied on a thin panel. These need a printer; the starting sizes are not confirmed by a test print.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Print both halves of a 200 x 60 x 8 mm panel split with **Half lap** at 0.2 mm clearance: does the lap go together without sanding, and does `assembly.txt` read correctly against what is on the bench? | Open | |
| 2 | Print a **Sliding dovetail** split: does B slide on along the rail the way `assembly.txt` says, snug but not stuck? | Open | |

### core-075 stage 3 — loose tenons and disc magnets (2026-10-27 14:50)

Everything checkable without a printer was driven: sheet, refusals, zip contents, BOM, phone layout.
These need a printer and magnets in hand, and the starting sizes in the TODO say they are confirmed by
a test print.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Print `plank-tenon-x2.stl` flat on the owner's printer at 0.2 mm clearance: does the chamfered side print clean without supports, and does the tenon go into both mortises with a push fit (not slop, not a hammer)? | Open | |
| 2 | Glue a real 6 × 3 mm magnet into a pocket: does it sit flush with the cut face, and do the pieces attract with the `assembly.txt` mark-out / mark-in rule? | Open | |
| 3 | At 390 px the Place connectors kind row is seven icon-only buttons (Post, Wedge, Screw boss, Dowel, Butterfly, Tenon, Magnet). Is each one recognisable from its glyph on a real phone, or does it need a label? | Open | 2026-11-14 (`testing-029` panel): Cold-read half (emulated 390x844): A: unclear, Screw boss and Dowel (ring, ring with dot) swapped in the guess, Magnet loose. B: unclear, ring vs ring with dot and half disc not guessable. Both want the pressed kind named beside the row. Filed `FIND-ui-128`. The real-phone half stays Open. |

### core-075 stage 2 — Butterfly keys (2026-10-27 13:43)

Stage 2 of 4 is built; the 1:4 wing slope gives about 0.8 mm of pull-apart play at 0.2 mm clearance (0.2 x sqrt 17), and the 0.2 mm default has not been checked on a printer.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Print the plank's `plank-butterfly-key-x2.stl` and press a key into its pocket on the owner's printer: does it go in by hand, and does it hold? | Open | |
| 2 | The bowtie marker glyph for a hand-placed Butterfly does not rotate to match the edge it snapped to; judge whether that reads clearly on a phone | Open | 2026-11-14 (`testing-029` panel): Neither agent (A, B) could place a butterfly on the 390 px cut plane: taps near the edge were rejected as *outside the cut face* with the message under the fold and no marker drawn, so the marker's orientation could not be judged. Noted in `FIND-ui-128` as a possible bug; left Open for the owner. |

### ui-089 — Hide and show from the Objects list (2026-10-26 21:16)

The e2e covers that the eye hides, the hidden piece is not clickable, the hide survives a reload and Show all brings it back. What only a person can judge is how it looks.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | The body row's eye in the mixed state (one part hidden) reads as "some hidden", not as shown or hidden, at laptop width | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. The parent eye in the mixed state is an open eye with a half-filled pupil, the same as shown at 1x; the `1 hidden · Show all` line helps a little. Filed `FIND-ui-128`. |
| 2 | The eye-slash on a hidden part row is readable next to the dimmed name, on the phone Inspector sheet at 390 px | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Eye icon vs row background, computed from the DOM: contrast 4.47 dark / 4.31 light at laptop (muted eye), 14.5 / 16.9 on the phone sheet; threshold 3:1 non-text. Hit area 44x44 px. Not measured: the name's dimming on the hidden state. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/F-laptop-dark-hidden-row.png, F-phone-dark-hidden-row.png, F-*-light-*. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |
| 3 | The `objects-hide-split-piece` docs still is correct: its magenta bar across the header is the docs helper's mask over the save status, as intended, not a stray element | Moved | Moved 2026-11-07 to `FIND-docs-033`: an AI drive can settle it. |

### ui-085 — Library sheet no longer scrolls sideways (2026-10-26 12:50)

Fixed and spec'd on Playwright WebKit; real desktop Safari with a trackpad was not available here.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Desktop Safari on the deployed build: a sideways two-finger swipe over the Library does nothing, with "Show scroll bars" on Automatic and on Always | Moved | Moved 2026-11-07 to `FIND-testing-026`: an AI drive can settle it. |
| 2 | The Help **?** now sits at the content edge (8px further left than before): confirm it still looks aligned with the hint | OK | 2026-11-14 (`FIND-testing-017`): measured at the Library hint row in Chromium, WebKit and Firefox. Phone 390 and laptop 1440: **Help ?** is 44x44, its right edge equals the sheet's content edge (overhang 0.00 px, was 8 px), 8 px gap to the hint, vertical centres within 0.02 px, no overlap, the sheet's `scrollWidth` equals `clientWidth` (390 and 239). The hint reads on 1 line at phone and 2 lines at laptop (the column is 239 px). **Tablet 820: N/A**, the Library is the 72 px icon rail there (`data-library-form="rail"`, `ui-079`), so neither the hint nor the Help button is rendered. Screenshots `r6-ui085-*-{phone,laptop}.png`. |

### ui-086 — Align popover: seven positions per axis (2026-10-26 07:16)

Reachability, the numbers and the 390 px fit are covered by specs and scenarios 1, 3, 6, 10 and 12. These are the feel and legibility checks a script cannot make.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone and iPad (Safari), the seven-icon strips read clearly at 44 px: can you tell **half −** from **inside −** by the icon alone, and does a tap land on the button you aimed at (no gaps between them)? | Open | 2026-11-07: The cold-read half (a fresh agent with no project context, on screenshots or emulation) moved to `FIND-testing-029`; the real-device half stays here. 2026-11-14 (`testing-029` panel): Cold-read half (emulated 390x844): A: mostly clear (column headers rescue the icons), B: unclear; both say *half −* and *inside −* differ by a few pixels of the sliver. Filed `FIND-ui-128`. Taps: 21 of 21 landed on the aimed button (44x46 px, no gaps) in emulation. The real iPhone/iPad half stays Open. |
| 2 | In desktop Safari and Firefox, the header words (*out · in · half · ctr · half · in · out*) sit centred over their columns and the `− … +` rule spans the grid (the header uses CSS `subgrid`). | OK | 2026-11-14 (`FIND-testing-017`): Firefox and WebKit (and Chromium) at laptop 1440, tablet 820 and phone 390, Align popover with two Cubes selected. `subgrid` is supported (`CSS.supports` true) and the header row is `subgrid` over all 9 tracks. The seven header words' centres sit within 0.5 px of their buttons' centres at every width and engine (0.5 px is the segmented 1 px border overlap), and the `− … +` rule runs 575.02 to 885.00 px at laptop, exactly the first button's left edge to the last button's right edge (0.00 px both sides, also at tablet and phone). Screenshots `r7-ui086-*`. |
| 3 | The amber and teal icon colours are distinguishable on the light scheme (`prefers-color-scheme: light`) against the popover glass. | OK | 2026-11-14 (`FIND-testing-017`): `prefers-color-scheme: light`, Chromium, WebKit and Firefox, laptop. Teal (target, `--role-target` #0f8a72) against the popover glass pixel (246-247, 249-250, 251-252): contrast 4.05 to 4.09, CIEDE2000 41.3 to 41.5; against the button face (255,255,255): 4.29, ΔE00 42.4. Amber (moving, `--role-moving` #d4802a) against the glass: contrast 2.87 to 2.89, ΔE00 37.6 to 37.7; against the button face: 3.03, ΔE00 37.3. Amber against teal: contrast 1.41, ΔE00 45.0 (ΔE76 82.8). Distinguishable by hue, amber only just above the 3:1 non-text guide on the white button face where the icon actually sits (and just under it on the bare glass). Dark theme for reference: 8.97 to 10.93:1, ΔE00 68 to 77. Screenshots `r8-ui086-*-laptop-light-popover.png`. |

### ui-083 — Marquee start point under the Operations toolbar (2026-10-24 15:30)

At laptop width the Operations toolbar sits over the top-left of the canvas, so a press there hits a toolbar button and never starts a marquee. The corner that works is bottom-right, and this is what `shift-select.e2e.js` and the scenario 4 drive now use. Whether that reads as a trap or as ordinary overlay behaviour is a judgment call, not a test.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real laptop, and on the iPad in Split View, try to start a marquee at the top-left of the canvas. Does the toolbar's covered area read as a dead zone, and would a pan-first or a hint fix it? | Open | |

### ui-082 — Operations groups tier (2026-10-23 17:55)

Scenarios 4 and 16 and the `ui-043`/`ui-015` repros passed with a real mouse. What no script or mouse run can judge is the feel of the pop-out under a finger.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPad in Split View (or any window about 720 px wide), tap Combine ▾ with two bodies selected: the pop-out opens under the launcher without covering the orientation triad, Union is easy to hit, and a tap outside closes it | Moved | Moved 2026-11-07 to `FIND-testing-026`: an AI drive can settle it. |

### ui-081 — Library section launchers and section pop-out (2026-10-22 14:54 UTC)

Launchers and the section pop-out sit at 760 px only. Two things the scripted and driven runs did not settle.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Dragging a row from the section pop-out's text can highlight that text (seen in the Raspberry Pi pop-out, all three engines, during a mouse drag). Decide whether a row drag should suppress text selection. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ui-084 — Library icon rail and compact viewport chrome (2026-10-21 19:19)

Scenarios 1, 3, 7, 18 (Library half) and 26 were hand-driven, so this lists only what they did not cover.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPad, drag a window or rotate between 1024 and 790 px wide and watch the Library column turn into the rail at its own step, then the pad and triad shrink, with no text squash and nothing over the triad | Open | Partly observed 2026-11-07 (headless Chromium, emulated width, not an iPad): the Library column is gone at 1024 px and the rail is present at 900 px, so the step falls between them. The shrink and text squash are not measured. Real iPad still needed. |
| 2 | Long-press a rail tile on touch: the name callout appears and a drag from the same tile still places (the long-press is unit-tested with fake timers only) | OK | 2026-11-14 (`FIND-testing-020`): Chromium, tablet 820x1180, `hasTouch`, trusted CDP touch, real timers, e2e-hooks build of HEAD. On `library-row-primitive.cuboid`: held 300 ms and released, no callout; held still, the `library-tile-callout` `Cube` first appeared at **522 ms** (LONG_PRESS_MS is 500), 48x25 px at (63.5, 134.5), beside the rail; after release it was gone **1539 ms** later (CALLOUT_LINGER_MS 1500); no pop-out and no body from the long-press release. A plain drag from the same tile (110 ms hold, 22 moves) placed a Cube (bodies 0 to 1, no callout). A press held 700 ms on the Cylinder tile (callout `Cylinder` up) then dragged also placed (bodies 1 to 2) and the callout was gone as the drag began. 0 page errors. Graduate spec filed: `FIND-testing-040`. |
| 3 | Save a part to My parts and watch its new tile scroll into view and pulse once (no test covers the pulse) | OK | 2026-11-14 (`FIND-testing-020`): same context. A Cube was placed and **Save to library…** named Standoff, then the Save sheet's submit was tapped. Traced with a `MutationObserver` and per-rAF `getAnimations()`: `data-pulse="true"` appeared on the new tile's `li` **105.6 ms** after the tap; one animation, `library-tile-pulse`, `running`, `currentTime` 0 to 883 ms over rAF stamps 16 to 17 ms apart (about 60 samples), and `data-pulse` was removed at **1005.6 ms** (900 ms after it was set, PULSE_MS); the tile was inside the rail scroller's box in every sample and the scroller moved from scrollTop 0 to 362; badge 0 to 1. One pulse only. Graduate spec filed: `FIND-testing-040`. |
| 4 | At about 641-700 px the compact pad overlaps the scale readout (also true at 760 before this task). Decide whether to file it as its own finding, or leave it to `ui-081` | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. Observed 2026-11-07 (headless Chromium, emulated widths): the navigation pad overlaps the grid scale readout at 641 px, and the overlap is visible in the screenshot, covering the left of "Grid 10 mm · major 50 mm". At 660 px and 700 px the boxes do not overlap. Owner decides whether to file it or leave it to ui-081. |
| 5 | The new Cube, Sketch, board, phone and gear swatches also show in the labelled laptop column: look at them next to the existing ones | OK | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Library column at 1440x900, DPR 2, dark and light (`panel2/library-*.png`, `library-kit-*.png`). Both agents: the icons share size, outline weight and style; Sketch is the one saturated (blue) icon and Cone, Triangle, Board and Board Frame read faint on the tiles; neither called any icon inconsistent. There is no gear swatch at HEAD (the nearest is Active Cooling Fan, a ring in a square), so that part of the premise no longer applies. Agree, so OK. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |
| 6 | Dropping a model file onto the rail does nothing (the labelled column accepts it); the rail's ⋯ menu is the way in. Confirm that is acceptable | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### io-012 — Warn on focus when the file may have changed (2026-10-21 15:21)

Covered in Chromium by a unit spec and an e2e case, but Safari, Firefox and phones have no file handle, so the warning path was never run on those engines or devices. Also the Documentation section's `e2e/docs/` still was not added.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On an iPhone (390×844) in Safari: open a project file, change it in another app, return to WarpCad. The status chip should read *This file may have changed. Use File ▾ → Merge file… to bring it in.* and wrap without pushing the header. | Open | |

### build-016 — CLA, licence text and the pre-push backstop (2026-10-21 14:39)

The in-repo `cla` and `dco` checks and the GitHub settings they depend on can only be tested with a second account and by the owner applying settings. Part 6 is a legal review. These are not covered by any acceptance scenario.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Second-account test PR, unsigned: `cla` and `dco` show failure, and the merge button is blocked | Open | |
| 2 | Comment the CLA sentence from that account: `cla` turns green; `dco` passes once commits are signed off (`git commit -s`) | Open | |
| 3 | Owner's and Dependabot's PRs are exempt from both checks | Open | 2026-11-15 (testing-024). Dependabot half OK: PRs #9 and #10 (and #1 to #8) are all by `app/dependabot`; `gh pr checks 10` shows `cla pass ... Every author has signed the CLA.` and `dco pass ... Every commit is signed off.`; runs 42279377040 (CLA) and 42279377126 (DCO) on 2026-11-06 19:24:42 UTC, 41374040392/41374040246 (2026-11-02) and 41339439242/41339439252 (2026-11-01) all `success`. Both workflows' scripts carry `const EXEMPT_LOGINS = ['johnwebbcole', 'dependabot[bot]', 'github-actions[bot]']`, and Dependabot's commits have no `Signed-off-by`, so the pass is the exemption. Owner half left Open: `gh pr list --state all` shows 10 PRs, all Dependabot; the owner pushes to `main` directly, so no owner PR has ever run the checks. Closes with the first owner-authored PR. |
| 4 | Apply Part 4 GitHub settings (ruleset with `cla`/`dco`, code-owner review, contributor approval, squash-merge policy); checklist in `docs/decisions/app-store-licensing.md` | Open | Owner's action; not applied by the task |
| 5 | Re-run `build-014`'s scratch-remote steps against the edited `.githooks/pre-push` | OK | 2026-11-15 (`FIND-testing-025`): walked together with `build-014` #1 (same pushes, messages and exit codes recorded there) against the committed `.githooks/pre-push` at `fcc16b6`, which carries the CLA backstop line. The backstop refused an unknown author (exit 1) and let the owner through; the test gate's five cases all behaved as `CONTRIBUTING.md` "Pushing" says. Original note: the backstop's own walk passed (owner ok, unknown author refused). |
| 6 | Part 6 lawyer review of `CLA.md`, governing-law clause (placeholder), AI authorship, docs-licence choice; record reviewer and date in the decision record | Open | Required before App Store submission |

### build-015 — e2e against the production build by default (2026-10-21 02:50)

The default run now skips the specs that need the dev host's live bridge or scripted provider, so they no longer run unless asked.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Run the dev-only specs once with `E2E_DEV=1`: `ai-scripted`, `webmcp`, `live-mcp-header-entry`, `ai-mcp-agent-pairing`, `mcp-connected-assistant`, and `docs/ai-chat`, `docs/ai-live-bridge`, `docs/ai-live-mcp-header` | Issue | 2026-11-15 (`FIND-testing-025`). Run in the scratchpad clone at `fcc16b6` (so the real repo's stored results stay untouched), `E2E_DEV=1`, progress reporters loaded, never the nine-project matrix. E2E specs (`ai-scripted`, `webmcp`, `live-mcp-header-entry`, `ai-mcp-agent-pairing`, `mcp-connected-assistant`): rotation pair chromium-phone + webkit-tablet (+guards), 33 passed, 11 skipped, 0 failed (23 s). The skips are by design, but they include `ai-mcp-agent-pairing.e2e.js:13` (live HTTP endpoint, chromium-laptop only), so a second pair, chromium-laptop + webkit-phone, ran the same files: 33 passed, 11 skipped, 0 failed, and `:13` ran and passed. Docs specs (`docs/ai-chat`, `docs/ai-live-bridge`, `docs/ai-live-mcp-header`): docs-laptop 4 passed, 4 skipped, 0 failed. The known `docs/ai-live-bridge` "mcp-connected still" failure did NOT reproduce (it passed at docs-laptop). docs-phone + docs-tablet: 2 passed, 2 FAILED, 12 skipped. Failed: `ai-chat.docs.js:78` "ai-chat-overlay-phone still" (waited 2.0 min for `getByTestId('assistant-button')`; at 390 px the Assistant lives in the grouped AI menu since `ui-078`, `ccc4184`, 2026-11-05) and `ai-live-mcp-header.docs.js:16` "ai-live-mcp-header still" (`toHaveScreenshot` 1036 px, ratio 0.06, differ: the committed picture still shows a separate Live MCP button beside File, the header no longer has one). Both docs pictures are stale and no routine run exercises the dev-only docs specs. Filed as `FIND-testing-041`. Acceptance 24 and 25: scripted plumbing through these specs only, no hand drive. |

### build-014 — Pre-push test gate (2026-10-20 22:05)

Needs a real git remote, so only the unit-level logic is covered by tests.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Scratch bare remote (`git init --bare`): push with the hook active through no result (refused), partial e2e (refused), full+green (allowed), full with failures and no trailer (refused), with trailer (allowed) | OK | 2026-11-15 (`FIND-testing-025`). Driven in a scratchpad clone of `main` at `fcc16b6` (`GIT_LFS_SKIP_SMUDGE=1 git clone`, `origin` removed, `core.hooksPath=.githooks` and the author identity set in the clone only) pushing to a scratchpad bare repository (`git init --bare`); the clone's own `.todo-progress/_runs.json` held fake stamps written with `fingerprintOfCommit('HEAD')`, one per case. The real repo's hooks config and stamps were not touched (hooksPath `.githooks`, 19 entries in `.todo-progress`, `_runs.json` sha1 `b342d1c2...` before and after). The scratch remote was seeded once with `--no-verify`. Hook = the committed `.githooks/pre-push`, which includes the CLA backstop (`scripts/check-contributors.mjs`). Each push is `git push scratch main`, message verbatim (git's trailing `error: failed to push some refs to '<scratch remote>'` omitted). (1) No stored result: exit 1, `push refused: the tests have not run on a41426726.` / `  unit: no result stored. Run: npm run test:unit` / `  e2e: no result stored. Run: npm run test:e2e:headless`. (2) Unit full, e2e partial: exit 1, `push refused: the tests have not run on c78a5cccd.` / `  e2e: the stored run was partial (a filter was passed). Run: npm run test:e2e:headless`. (3) Both full, e2e with 1 failure `chromium-desktop e2e/fake.e2e.js > fake red test`, no trailer: exit 1, `push refused: 1 failing test(s) are not named in a "Known-failures:" trailer of the commits being pushed.` / `  chromium-desktop e2e/fake.e2e.js > fake red test` / ``Run `node scripts/todo-progress.mjs stamp attest` and add its lines to a commit message.`` (4) Same stamp, a commit carrying `Known-failures: chromium-desktop e2e/fake.e2e.js > fake red test` (`stamp attest` printed that exact line): exit 0, `tests ran on this code with 1 known failure(s), all named in a Known-failures: trailer.` and `54f9633..e2e57d7  main -> main`. (My first attempt at this case was refused, because a zsh quoting slip put a leading space on the trailer line and git does not read ` Known-failures:` as a trailer; that was my commit message, not the gate. The retry is the result above.) (5) Both full and green: exit 0, `tests ran on this code (unit 2026-11-15T00:10:51.537Z, e2e 2026-11-15T00:10:51.537Z); fingerprint 0cf396895b06` and `fcc16b6..54f9633  main -> main`. No bad push got through. The CLA backstop: a commit by `stranger@example.com` with a green stamp was refused, exit 1: `push refused: 1 commit(s) by an author who has not signed the CLA:` / `  cd5ad132c is by stranger@example.com, who has not signed the CLA (CLA.md)` / `Ask the author to sign (CLA.md, CONTRIBUTING.md step 2), or push with --no-verify if you are the owner.`; the owner identity passed in (4), (5) and the LFS push. |
| 2 | LFS objects for a changed `docs/media/*.gif` arrive at that scratch remote (buffered stdin reached `git lfs pre-push`) | OK | 2026-11-15 (`FIND-testing-025`), same scratch clone and bare remote. Replaced `docs/media/ai-drawing-to-group.gif` with a 32-byte stand-in, `git add` (the `.gitattributes` LFS filter turned it into a pointer, oid `29c4ebbb...38ed93ee`), committed as the owner, wrote a green stamp, `git push scratch main`: exit 0. Output verbatim: `Uploading LFS objects: 100% (1/1), 0 B | 0 B/s, done.` then `tests ran on this code (unit 2026-11-15T00:11:09.931Z, e2e 2026-11-15T00:11:09.931Z); fingerprint 0cf396895b06` then `e2e57d7..f1b5645  main -> main`. The object is on the remote at `remote.git/lfs/objects/29/c4/29c4ebbbdda1b0804bc522be8a392576ca22897fd984aaa1bdfd9f1f38ed93ee`. The LFS line printing before the hook's own line shows the buffered stdin reached `git lfs pre-push` first. A plain file path accepted LFS objects (git-lfs's built-in file transfer), so no substitute server was needed. |
| 3 | After the first real push to `origin`, the Actions tab shows no new run | OK | 2026-11-15 (testing-024). `git reflog show origin/main`: `54aa578 ... @{2026-10-20 17:09:54 -0500}: update by push` (22:09:54 UTC, the commit that added the gate) and `708b037 ... @{2026-10-21 14:29:28 -0500}: update by push` (19:29:28 UTC). The only runs created within minutes are `Dependabot Updates` (`dynamic`, Dependabot's own rescan of the default branch): 6 at 22:10:00 to 22:11:21 UTC with `headSha 54aa578` (runs 39506068643 to 39506240670), 5 at 19:29:33 to 19:29:36 UTC with `708b037`, plus `CLA`/`DCO` on Dependabot's PRs. No `CI` and no `Pages` run. The same holds for all 26 pushes since (see `build-013` #1). |

### ui-075 — Live MCP access entry in the phone header (2026-10-19 20:35)

Scenarios 24/25 and the `ui-071` repro passed at 390 and 1440 px Chromium; these are the parts that need a real device or a judgment call.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone (Safari), the header's Live MCP button ring/dot is legible and a tap does not hit **Redo**/**File** beside it (gaps are 4 px) | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): the Live MCP header button is not in the production build (dev host only; the grouped AI menu replaced it, ui-078), so the neighbours measured are the production header at 390 px: Undo, Redo, History 44x44 and File 48x44, 8 px gaps, Assistant 44x44 at x 340. Production build of the working tree as it stood (Vite build, preview server), Chromium touch emulation (hasTouch, isMobile, DPR 2) at the row viewport unless noted; fingertip taps scattered Gaussian sigma 3.5 mm = 13.2 CSS px with bench/tap-scatter.mjs. 200 taps (100 for Assistant): intended control fired Undo 93.5 %, Redo 92 %, History 85.5 %, File 92 %, Assistant 93 %; a different control fired 0 %, 2 %, 4.5 % (File), 1 % and 1 %. Threshold <= 2 %: met except History to File. Legibility and the real iPhone stay here. |
| 2 | Rotate to landscape: Undo, Redo, History, File, Help, the new button and Assistant all stay on the row | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |

### ui-077 — Version label in the header (2026-10-18 21:38)

The label stacks under the title at 480px and below, as an interim layout chosen to avoid a
header overflow (`ui-078` is open for the real 390px budget). Acceptance scenario 1 and the
header's width were driven by hand; the readability of the stacked label on real hardware was not.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, the `WarpCad` / `dev` stack reads clearly in the top bar and the controls to its right stay tappable. | Open | |

### build-013 — Release action gates the Pages deploy (2026-10-18 10:30)

The workflows are unit-guarded (`scripts/release-workflow.spec.js`) and release-it was dry-run
locally, but a real run tags, pushes and deploys, and has to be started by the maintainer.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Merge something to `main`: CI runs, no Pages run starts | OK | 2026-11-15 (testing-024), `gh run list --limit 300` plus `git reflog show origin/main`. The gating commit `a4b0722` went out in the push of 2026-10-20 17:09:54 -0500 (`54aa578`). From then to the last push (2026-11-10 13:50:51 -0600, `cf08c20`) the reflog has 26 `update by push` entries on `origin/main`, and the 52 runs created since 2026-10-20T22:00Z are: 20 `Release` (`workflow_dispatch`), 16 `Dependabot Updates` (`dynamic`), 7 `CLA` and 7 `DCO` (`pull_request_target`), 2 `CLA` (`issue_comment`, skipped). No `Pages` run and no `CI` run exists after 2026-10-18 (the last Pages run, 39088704053, is `workflow_run` on the old push-CI chain). The "CI runs" half is superseded: `build-014` (`54aa578`) stopped CI on push as well, so a merge starts nothing. |
| 2 | Actions → Release → Run (`major`): one `v1.0.0` tag, one GitHub release with notes, and the `pages` job (a `workflow_call`) deploys it. Confirm the called workflow chained under `GITHUB_TOKEN` and the bot could push to `main` | OK | 2026-11-15 (testing-024). Release runs from v1.0.0 (run 39667456845, 2026-10-21 20:06 UTC) to v1.12.0 (run 42279051229, 2026-11-06 19:22 UTC): `gh release list` and `git tag -l 'v1.*'` both show one entry per version (v1.0.0 to v1.17.0, 18 each). v1.12.0: release `v1.12.0`, author `github-actions[bot]`, created 2026-11-06T19:22:48Z, notes start `## [1.12.0](https://github.com/WarpCad/warpcad/compare/v1.11.0...v1.12.0) (2026-11-06)`. Run jobs `release`, `pages / build`, `pages / deploy`, all success. Log lines: `release ... GITHUB_TOKEN Permissions` / `Contents: write`; `pages / build ... GITHUB_TOKEN Permissions` / `Pages: write`; `ref: v1.12.0`; `HEAD is now at 10246f6 chore(release): v1.12.0` (the called workflow built the tag). Bot push: `git log origin/main` has `10246f6 2026-11-06T19:22:48Z github-actions[bot] chore(release): v1.12.0` (and `cf6c2d8` for v1.0.0); the release step logs `Git push` and `https://github.com/WarpCad/warpcad/releases/tag/v1.12.0`. Earlier failures, not this row: Release runs 39663990287, 39665617181 (2026-10-21) failed before v1.0.0, fixed in `acdda3c`; run 40568197821 (v1.1.0, 2026-10-27) tagged and released but its `pages / build` failed on `assets/index-Bm8egkNw.js is 2.14 MB, and won't be precached` (the workbox 2 MiB limit), and run 40575426994 for v1.2.0 deployed 11 minutes later. |
| 3 | Sentry shows the release named by the tagged commit's SHA and its source maps unminify a test error | Open | |

### ui-072 — Phone Library sheet: how much canvas is left to drop into (2026-10-17 20:50)

The finding turned out to be the spec dropping under the sheet. The app is correct, but the numbers behind it are a feel call: at 390x844 with the Inspector tab showing, the open Library sheet starts at y=366, so only about 313 px of canvas (y 53 to 366) is left to drop into, and the Operations toolbar and nav chrome overlap part of that.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone, open the Library and drop two parts in a row: is the visible canvas strip tall enough to aim at without the toolbar or nav chrome getting in the way, and is it clear which row to scroll for (a row below the sheet's clip, such as Sphere, is hidden until the sheet is scrolled)? | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): phone 390x844, Library open: sheet top at y 367 (433 px tall); 7 of 24 rows fit above the clip (Cuboid to Sketch), Sphere is the first row hidden (y 819, clip 800) and 16 rows are below it. The free canvas is a 125 px full-width band (y 241-367) between the operations toolbar and the sheet, plus a 312 px tall column x 190-276 between the toolbar and the orientation dial. Real aiming stays here. |

### build-010 — Owner checks to bring app.warpcad.com live (2026-10-17 20:20)

The repository side is done (`public/CNAME`, guard, `dist/CNAME` confirmed in a real build). The domain is NOT live until the owner does rows 1-2, and none of this can run in CI because it needs the real DNS record. Do rows in order; the certificate in row 3 can take a while to issue.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Squarespace Domains, DNS for `warpcad.com`: add a record of type CNAME, host `app`, value `warpcad.github.io`. `dig app.warpcad.com CNAME +short` then prints `warpcad.github.io.` | Pass | 2026-10-17: `dig` prints `warpcad.github.io.` |
| 2 | Repository `WarpCad/warpcad` Settings -> Pages: Source "GitHub Actions"; custom domain `app.warpcad.com`; Save. GitHub's DNS check turns green. (Do this after the first push and deploy so a Pages site exists; without the domain set, `configure-pages` returns `/warpcad` and the build uses base `/warpcad/`.) | Pass | 2026-10-17: Pages enabled with `build_type=workflow` via API; `cname` is `app.warpcad.com`. |
| 3 | Once GitHub has issued the certificate, tick **Enforce HTTPS** in the same Pages settings. Then `http://app.warpcad.com` redirects to `https://`. | Pass | 2026-10-17: certificate approved (expires 2027-01-15); `https_enforced: true`; `http://` returns 301 to `https://`. |
| 4 | After a deploy that ran with the domain set: `https://app.warpcad.com/` loads the app, and Help's version line shows the deployed commit. | Pass | 2026-10-17: run `39077655761` (workflow_dispatch on main) succeeded; app loads; Help shows `+3271a3e`. |
| 5 | `https://app.warpcad.com/manifest.webmanifest` lists `"scope": "/"` and `"start_url": "/"`; `https://app.warpcad.com/sw.js` loads; installing the PWA still works. | Pass | 2026-10-17: after run `39077655761`, manifest has `start_url` and `scope` `"/"`; `sw.js` 200; install from `app.warpcad.com` opens the app (owner, desktop browser). |
| 6 | `https://app.warpcad.com/CNAME` is not required to resolve, but the Pages settings must still show the domain after the next deploy (the file in the artifact keeps it from being cleared). | Pass | 2026-10-17: Pages still reports `cname: app.warpcad.com` after run `39077655761`. |
| 7 | Smoke on the live site: acceptance scenario 1 (place a box and a sphere, both stay visible) at laptop and phone width. | Pass | 2026-10-17: owner confirmed on the live site at laptop and phone width. |

### build-012 — LFS cache on the first two CI runs after the push (2026-10-17 20:12)

The workflows run only on GitHub, so nothing here could be proved on the laptop. Locally verified: YAML lint, the guard `scripts/workflowLfs.spec.js`, and that unit plus `guards` pass on pointer files.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | First run after the push to `main`: open the **Pages** run's "Restore docs media from the LFS cache" step. Expect a cache **miss** (`Cache not found for input keys: lfs-media-...`), `git lfs pull` downloading about 72.7 MB, and "Cache saved" at the end. Record the downloaded byte count in the table in `docs/decisions/hosting.md` "Git LFS bandwidth". | OK | 2026-11-15 (testing-024). First Pages build after the LFS change (`3a77546`, 2026-10-17 15:07 -0500): run 39076794315 (`workflow_run`, commit `3271a3e`, 22:52 UTC; the two earlier `workflow_run` Pages runs for `1617ced` were `skipped`). Step "Restore docs media from the LFS cache": `22:53:50.0373381Z Cache not found for input keys: lfs-media-2a4710ce4fcf5bb1f4abe0549452adf5154253d1e7fead12ec037c1f74117460`, `git lfs pull` ran 2,679 ms, and at the end `22:54:15.5620950Z Cache saved with key: lfs-media-2a4710ce...`. **The log prints no download byte count** (`git lfs pull` is silent without a terminal, and the cache-save line has no size), so the figure recorded in `hosting.md` is the size of the saved entry, 72,167,191 B (~69 MB), read from the next run's `Cache Size` line; the repo's `.gitattributes` total is 72.7 MB. Both counts are in `docs/decisions/hosting.md` "Git LFS bandwidth". |
| 2 | Second run (any later push to `main`, or a manual Pages `workflow_dispatch`): the same step must show **"Cache restored from key: lfs-media-..."** and `git lfs pull` fetching nothing (0 B). Record that byte count in the same table. | OK | 2026-11-15 (testing-024). Run 39077655761 (`workflow_dispatch`, `3271a3e`, 2026-10-17 23:05 UTC), same step: `23:05:35.8289708Z Cache hit for: lfs-media-2a4710ce4fcf5bb1f4abe0549452adf5154253d1e7fead12ec037c1f74117460`, `23:05:36.3123825Z Cache Size: ~69 MB (72167191 B)` (restored from the runner's cache, not from LFS), `23:05:36.4487032Z Cache restored from key: lfs-media-2a4710ce...`, `git lfs pull` ran 396 ms (first run 2,679 ms) and printed nothing, and the run ends `Cache hit occurred on the primary key lfs-media-2a4710ce..., not saving cache.` 0 B came from LFS; the 72,167,191 B is Actions cache traffic, which is not LFS bandwidth. |
| 3 | In the CI run of the same pushes, the `test` and both `smoke` jobs must be green with no LFS step at all. If `Unit, typecheck and guards` fails on `docs-media.spec.js` with "stale movie: hardware-drag-bolt.gif / rpi-mounting-holes.gif", that is the separate pre-existing `CI=1` drift (re-record with `npm run docs:media`), not the LFS change. | N/A | Closed 2026-11-01 (testing-005): CI no longer runs on push (`.github/workflows/ci.yml` is `workflow_dispatch`/`workflow_call` only; CLAUDE.md Conventions, `build-013`/`build-014`). |
| 4 | Owner: on the GitHub account billing page, confirm the Free plan's 10 GiB LFS storage and 10 GiB monthly bandwidth, then edit the figures in `hosting.md` if they differ. | Open | |

### docs-023 — Trademarks notice (2026-10-17 19:52)

The owner names in `LICENSING.md` "Trademarks and names" came from the TODO text; the run had no web access, so the spec's step "check each owner's own trademark page" is still open.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Check each owner's current legal name and mark on its own trademark page (Raspberry Pi Ltd, Apple Inc., Samsung Electronics, Google LLC, Adafruit Industries, Pimoroni Ltd, Anthropic PBC, GitHub Inc., Functional Software Inc. d/b/a Sentry) and fix any sentence that differs | OK | 2026-11-09: Raspberry Pi Ltd (raspberrypi.com/trademark-rules), Apple Inc. (apple.com/legal/intellectual-property/trademark/appletmlist.html), Google LLC (about.google/brand-resource-center/trademark-list), GitHub, Inc. (brand.github.com/foundations/logo), Anthropic, PBC (anthropic.com/legal/trademark-guidelines), Functional Software, Inc. d/b/a Sentry (sentry.io/legal/terms), Pimoroni Ltd (shop.pimoroni.com/en-ca/pages/about-us) and Samsung Electronics Co., Ltd. (samsung.com/us legal notices) all match; no sentence changed. Adafruit's own page names no owner; USPTO records (trademarks.justia.com) list the marks under Limor Fried DBA Adafruit Industries, so 'Adafruit Industries' stands. |

### build-011 — Third-party notices (2026-10-17 14:25)

The file and the link are covered by the new `help.e2e.js` case and the production-build drive; what is left is judgment a script cannot make.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Read `dist/THIRD-PARTY-NOTICES.txt` once: every entry has a licence text (the build warns for any package that ships none) and the Albany County Fasteners paragraph reads right. | OK | 2026-11-15 (`FIND-testing-025`). `npm run build` succeeded (`dist/THIRD-PARTY-NOTICES.txt`, 80,900 bytes, 1,479 lines). Parsed every entry: 47 packages (MIT 41, Apache-2.0 2, ISC 2, BSD-2-Clause 1, BSD-3-Clause 1), every one has a header, a `Licence:` line and a licence text over 150 characters (0 short bodies), and no `no licence` or `ships none` text anywhere. The paragraph reads: "The wood-screw pilot-hole table in the hardware library takes its dimensions from the Albany County Fasteners "Wood Screw Pilot Hole Guide" (https://www.albanycountyfasteners.com/)." It matches the table's source comment in `src/core/kernel/tables/wood-screw-holes.js` ("Albany County Fasteners, *Wood Screw Pilot Hole Guide*"). The build's warnings did not list a missing licence. |
| 2 | On a real iPhone, the two footer links wrap cleanly and each is easy to tap. | Open | 2026-11-07: The wrap half, in the iOS Simulator moved to `FIND-testing-027`; whether each link is easy to tap stays here. |

### perf-002 — Bundle load time on the real deploy (2026-10-17 15:55)

Every number in `bench/results/2026-10-17-perf-002.md` came from headless engines with software GL, throttling emulated in `vite preview` (HTTP/1.1, no TLS). Nothing here can be covered by a scripted scenario; it needs the real host and a real device.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Run `node bench/bundle-load.mjs` against the real GitHub Pages deploy (HTTP/2, real TLS) to see whether the fragmented builds' request cost shrinks and whether the ~330 ms defer-boot gain holds (needs the bench pointed at a URL; it serves local `dist/` only today). | OK | 2026-11-15 (`FIND-perf-005`, `bench/results/2026-11-15-perf-005.md`): `node bench/bundle-load.mjs --url https://app.warpcad.com/ --runs 7`, Chromium 153, 7 runs per cell. Deploy cold usable 344 ms unthrottled, 4,069 ms slow4g, 4,419 ms slow4g-cpu4; repeat via the service worker 190 / 191 / 280 ms with 0 requests; 6 page requests. Not a delta: one build is deployed, so the ~330 ms gain cannot be re-measured as a difference, but the deferral is present (no AI agent or tool registry in the boot list). The deploy fetches the Sentry SDK (144 kB gzip) before usable, which no local run saw: `perf-006`. At slow4g the deploy is 138 ms faster than local through the same method despite +115 kB, so deployed and local throttled absolutes are not comparable to a few hundred ms. |
| 2 | On a real phone over a real mobile connection, load the hosted app cold and judge by eye whether the first usable frame feels any different once `perf-003` ships. | Open | |

### build-007 — Google Analytics 4 page views (2026-10-17 12:35)

No GA property or Measurement ID existed in the implementing session and Google was never contacted, so nothing has reached Google Analytics. Everything short of that is covered by unit specs (`gtag` mocked), the production-build CSP specs (Google hosts stubbed) and scenario 1. These steps are the owner's.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Create a separate GA4 property for WarpCad and a web data stream for the hosted host (see the checklist in `TODO/done/build-007-google-analytics.md`); copy the `G-XXXXXXXXXX` Measurement ID. | Open | 2026-10-17: owner reports the property and stream exist; Measurement ID `G-JFYXCZJ1HN` (public). Owner also reports `GA_MEASUREMENT_ID` is set in GitHub and the stream is configured (rows 2 and 3 as reported, not seen by the agent). Rows 4-6 need a deployed run. |
| 2 | GitHub → Settings → Secrets and variables → Actions → Variables: add `GA_MEASUREMENT_ID` = the ID, then run the Pages workflow (`workflow_dispatch`). | OK | 2026-10-17: `gh variable list` shows `GA_MEASUREMENT_ID` set (23:42Z), and the Pages run after it is green. |
| 3 | In the data stream turn **Enhanced measurement OFF** (all toggles, especially "Page changes based on browser history events"); set event data retention to 2 months; turn off Google signals under Data collection. | Open | |
| 4 | Open the deployed app: GA → Reports → Realtime shows one active user and the page path with no `#` part; DebugView (Analytics Debugger extension) shows one `page_view`. | Open | |
| 5 | On the deployed app, DevTools console: no `Content Security Policy` errors naming a Google host. If one appears, widen by that single host in `scripts/analytics-build.mjs` and record it in `docs/decisions/analytics.md`. | OK | 2026-11-15 00:04:53 UTC (testing-024), headless Chromium 153, 1440x900, one load of `https://app.warpcad.com/#/help/getting-started` (this one load also answers row 6; a second load would have sent a second page view). Console had 3 messages: `info: WarpCad WebMCP: api=none; enabled=off; visible=yes; registered=0; failed=[]` and two `warning: ... GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels`. No `Content Security Policy` error and no `pageerror`. The page requested `https://www.googletagmanager.com/gtag/js?id=G-JFYXCZJ1HN` (loaded) and POSTed `https://www.google-analytics.com/g/collect`, both under the policy. A first load at 00:04:21 UTC with Playwright's default `navigator.webdriver=true` sent no Google request at all: `initAnalytics` skips automated browsers by design (`src/analytics/analytics.js`), so the second load used `--disable-blink-features=AutomationControlled` (`navigator.webdriver` false). |
| 6 | Open a shared-link address (`…/#/help/getting-started`) and confirm the Network `collect` request's `dl` has no `#` part. | OK | 2026-11-15 00:04:53 UTC (testing-024). **This load sent exactly one real `page_view` to the owner's GA4 property `G-JFYXCZJ1HN`, as the task authorised; it was not repeated.** The loaded URL carried `#/help/getting-started`. The `collect` request (`en=page_view`, `dt=WarpCad`) had `dl=https%3A%2F%2Fapp.warpcad.com%2F` and `dp=%2F`: no `#` part, no query. Rows 3 and 4 (GA settings, Realtime) still need the owner's account; expect one HeadlessChrome/macOS user at about 00:04:53 UTC in Realtime, which is this check. |

### build-009 — Source maps uploaded with curl instead of @sentry/vite-plugin (2026-10-17 2026-10-17 20:19)

The upload moved from the plugin to a `curl` step in `.github/workflows/pages.yml`. The implementing session had no Sentry project, so the real upload has never run, and the exact API shape was read from Sentry's docs (`POST /api/0/organizations/{org}/releases/{version}/files/`, multipart `file`, `name`, `header`; Bearer token with `org:ci`), not exercised. The `Sourcemap` header approach and the `~/…` file names are the part most likely to need adjusting. Never paste the token into chat or a commit.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Run the Pages workflow with `workflow_dispatch` (variables `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` and secret `SENTRY_AUTH_TOKEN` set). The step *Upload source maps to Sentry* must pass and end `Uploaded N source maps for release <sha>` with N at least 1; a red step with an HTTP status in the log means the endpoint or token scope is wrong (report it, do not retry blindly). In Sentry, Releases then the commit SHA then Artifacts should list `~/assets/*.js` and `~/assets/*.js.map`. | OK | 2026-10-17: Sentry Releases → `3271a3ee3784…` → Artifacts lists `~/assets/index-BrlGH-RY.js` and `.js.map` (10.0 MiB) plus the worker and chunk maps. The run at 23:27Z logged `Uploaded 10 source maps for release 3271a3ee3f3784ee736b8b51a3150502103cb1a8`, with the token shown as set (`***`) and the org, project and release correct. The *Remove source maps* step ran next (`find dist -name '*.map' -delete`, then a `test -z` check); its final green status is not in the paste. |
| 2 | Same run: the *Remove source maps* step is green, and `https://app.warpcad.com/assets/<main chunk>.js.map` returns 404 (maps are not served). | OK | 2026-10-17: `curl` from the agent's shell: `index-BrlGH-RY.js.map` returns 404, `index-BrlGH-RY.js` returns 200. The *Remove source maps* step's own log was not checked. |
| 3 | After row 1, throw a test error in the deployed app (`setTimeout(() => { throw new Error('sentry smoke') })`). The Sentry event's stack frames must show original file names and lines. If frames are minified, the upload worked but did not match: compare the artifact names with the event's file URLs and tell me what they look like. | OK | 2026-10-17: the `sentry smoke 3` event (release `3271a3ee…`) shows original paths (`../../node_modules/@sentry/browser/build/npm/esm/prod/helpers.js:63:17 in sentryWrapped`) where the earlier `sentry smoke` events showed `/assets/index-BrlGH-RY.js:4331:14569 in r`. The throw came from the console, so the top frame is `<anonymous>`, as expected. |
| 4 | Confirm the auth token's scopes still include `org:ci` (the release-create and file-upload calls need it); a 403 in row 1 means they do not. | OK | 2026-10-17: the upload in build-009 row 1 succeeded with this token, so the release and file calls are allowed. |

### build-004 — Sentry error reporting and source-map upload (2026-10-17 12:17)

The implementing session had no Sentry account, DSN, org, project or token, so the spec's live smoke test is untested. Everything short of a real event reaching a real project is covered by unit specs (SDK mocked) and production-build checks. Never paste the token or DSN into chat, a TODO, a commit or `TROUBLESHOOTING.md`.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Create a Sentry browser/Vue project; copy its DSN. Create an auth token with only `project:releases` and `org:read`, named for the Pages workflow. | OK | 2026-10-17: project exists, DSN supplied by the owner (org `o4511265456128000`, project `4512273042964480`, ingest.us.sentry.io). Org slug `johnwebbcole`, project slug `warpcad`. Auth token created (organization token `warpcad-pages-ci`, scope `org:ci`); its value is not recorded here. Whether the GitHub variables and secret are set is not recorded yet. Not marked OK until row 2 is confirmed. |
| 2 | GitHub → Settings → Secrets and variables → Actions: variables `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`; secret `SENTRY_AUTH_TOKEN` (repo secret, because the `build` job has no `environment`). | OK | 2026-10-17: the owner reports all four are set (three variables, one secret). The Pages run logged successful uploads with them, so they are in effect. |
| 3 | Run the Pages workflow with `workflow_dispatch`. The log of the *Upload source maps to Sentry* step (`build-009`) should end `Uploaded N source maps for release <sha>` (an upload error now fails the job), and the Sentry release list should show the commit SHA. | OK | 2026-10-17: run at 23:27Z logged `Uploaded 10 source maps for release 3271a3ee…`; the Sentry release lists the artifacts. |
| 4 | Smoke test: locally `VITE_SENTRY_DSN=<dsn> SENTRY_AUTH_TOKEN=<token> SENTRY_ORG=… SENTRY_PROJECT=… SENTRY_RELEASE=smoke VITE_SENTRY_RELEASE=smoke npm run build && npx vite preview`, open the page, run `setTimeout(() => { throw new Error('sentry smoke') })` in devtools. The event must arrive within a minute, with the original file and line (not minified names), the page URL without any `#fragment`, and no request data. Then delete the local `dist/`. | Skipped | Skipped by the owner: the live check is enough. 2026-10-17: the same check was run against the deployed app instead of a local build. The `sentry smoke 3` event arrived with readable frames and the page URL `https://app.warpcad.com/` (no fragment). Request data was not checked. The local build run has not been done, so this row stays open. |
| 5 | On the deployed app (`app.warpcad.com`), DevTools console: no `Content Security Policy` errors mentioning the Sentry host (the CSP host comes from the DSN at build time). | Skipped | Skipped by the owner: the live event reached Sentry, so the ingest request was not blocked. |
| 6 | Decide whether the build-time package `sentry@0.45.0` (licence `FSL-1.1-Apache-2.0`, pulled by `@sentry/vite-plugin`, not in `npm run licenses` which is production-only) is acceptable in this AGPL project's build toolchain. | N/A | 2026-10-17: resolved by `build-009`. The owner ruled to drop the plugin; it and `sentry@0.45.0` are gone from the lockfile. Rows 3 and 4 now describe the `curl` upload; see the build-009 entry. |

### docs-020 — Docs media sweep for the AI chat, My parts, sketch select/delete and timeline re-link (2026-10-17 11:50)

Judgment calls a scripted spec cannot make. The AI pictures were recorded with the scripted provider, so they show a *Scripted* badge by design; scenarios 17 and 18 were driven by hand against the same provider, not a real model.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Watch `ai-wing-airfoil.gif` and `ai-drawing-to-group.gif` cold: does a stranger understand what the Assistant did, and is the *Scripted* badge in `ai-chat-panel.png` explained well enough by the caption in `docs/ai-partner.md`? | Open | 2026-11-14 (`testing-029` panel): Panel disagrees. clips: A: clear (prompt, built parts, check, Confirm to save are readable). B: unclear (clipA's blocks do not read as a wing; clipB's Connected / image notice unexplained). Scripted badge paragraph: A: unclear (jargon, the Connected line is never shown). B: clear. For the owner. |
| 2 | `timeline-relink.gif` is 8 fps at 600 px to fit the size budget: is the amber `broken` chip and the Re-link press still readable? | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. At 500 px the amber chip text is ~5 px and on screen about one sampled frame; the chip reads *1 item built on Cube 1 no longer builds* with **Resolve…**, no Re-link press is visible. Filed `FIND-docs-036`. |

### build-005 — A reload picks up a new deploy, and an update banner (2026-10-17 11:20 UTC)

The two-deploy behaviour is proven in Playwright against simulated deploys on all three engines, but the real GitHub Pages `sw.js` headers and an installed phone PWA cannot be simulated; the delay on Pages was not measured.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | After a real deploy to Pages, reload the open app on an installed iPhone/iPad PWA once or twice: Help's version line (`WarpCad x.y.z+<short sha>`) changes to the new commit, no site-data clearing. Note the observed delay and record it in `docs/decisions/hosting.md` "Update path". | Open | |
| 2 | Leave the installed PWA open across a deploy: the bottom banner *A new version of WarpCad is available.* appears within about 30 minutes or on returning to the app; **Reload** applies it and the project is intact. | Open | |

### ui-071 — Assistant folds to its header while an MCP agent is connected (2026-10-17 UTC)

Scenarios 25 and 24 (connected half) were driven; scenario 6 is partial because the phone rule that hides the Library, Inspector and History sheets under any open chat sheet predates this task and was left alone. Only the judgment calls are queued here.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, with a real MCP agent connected, does the compact Assistant (header + Undo AI turn, about 159 px) feel right, and is the Inspector reachable enough by closing the Assistant first? Decide whether the phone should keep the Inspector tab docked above the compact sheet instead. | Open | |
| 2 | At laptop width the connected column still fills its grid cell with empty space under Undo AI turn. Is that acceptable, or should the column narrow while connected? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ui-069 — Repeat button and panel (2026-10-17 07:55 UTC)

Acceptance 3, 6, 10, 12, 15, 22 and the `ui-063`, `ui-035`, `ui-060`, `ui-042`/`ui-049`, `core-034` repros were driven (emulated viewports only, no real phone or iPad). These are the judgment calls left.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | A step the Assistant, Claude Code or a merge added to the first part disables **Apply** with *"… has a step you didn't make … Cancel and make the part by hand"*, because `core-061` copies the source's whole lineage. The spec said such a step is just listed under *Not part of the repeat*. Keep the stricter rule, or let Apply copy it? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | The Inspector's note on a repeat body reads *"Move Bolt / screw 1 or Raspberry Pi 1; the repeats follow them"*, but a **new** move of either (gizmo or typed) after the Repeat moves only that part (driven: Pi +10 mm, bolts unchanged); only editing an earlier History step (the screen's Move row) carries everything. Is the wording misleading? It is `core-061`'s sentence, so changing it is a core edit. | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: misleading. The shipped note (post-`ui-074`) says a new move 'moves only that part' but not that the copies stay put; 'the repeats' and 'that part' are undefined. Filed `FIND-ui-127`. |
| 3 | On a laptop the panel floats over the lower middle of the 3D view, so a first-drop point there lands on the panel. Does that cost anything in real use (you have to drop the bolt in the upper half)? On a real iPad, does the lifted tablet position (above the nav chrome) still leave room to see the Pi? | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): Repeat sheet 300x331. Laptop: x 570-870, y 552-884, 33 % of the viewport width and 59-98 % of its height (13 % of the area). Tablet 820: x 260-560, y 616-948 (57 % of the width, 50-79 % of the height), clear of the nav chrome (y 1008) and the Inspector (x 595), but it covers the right half of the default-framed Pi. Phone: a 390x338 sheet at y 454, 51-93 % of the viewport height. Real iPad judgment stays here. |
| 4 | **⟳ Repeat** is enabled on a Group's sub-part (it has other parts), seeding on a member that has no name family. Harmless, but should it need a numbered family like `hole1`? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 5 | Phone: the shrunk bar lifts the Inspector sheet by 54 px while it is up. Real-thumb check that the bar, the Delete row and the Library tab all stay tappable. | Open | |
| 6 | Docs example: the Z step is *Relation: Inside*, *Offset -5*, **Z ⊏ − face**. Does a first-time reader find the Rotation X = `180` step (head-up) without help? | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. Rotation X = `180` is easy to pass over: no 'degrees', no why, no check. Filed `FIND-docs-036`. |

### core-061 — A linked Repeat record (2026-10-17 06:00 UTC)

Acceptance 10, 12, 15, 22, 23 and the data-007, ui-052, core-024, ui-063, ui-038 and ai-022 repros were driven (emulated viewports only, no real phone). These are the judgment calls and the gap the drive left; `ui-069` owns the controls.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | *Save to library…* on a repeat body (*Bolt 1 ×3*) saves the repeat without its source, so dropping that part from My parts will not rebuild it. Decide whether it should refuse, or save the source with it. | OK | **Decided 2026-11-01:** keep the refusal that `ui-076` shipped; a repeat is not saved without its source. Nothing further to check here. |
| 2 | Edit Bolt 1's Length with the repeat on screen: do the three repeats change at the same moment as Bolt 1, or is there a visible lag that reads as "not linked"? | OK | 2026-11-14 (`FIND-testing-020`): Chromium, laptop 1440x900, e2e-hooks build of HEAD, a Pi 5 with Bolt 1 aligned to `hole1` and a `pattern.repeat` to `hole2` to `hole4` (3 bodies: Pi, Bolt 1, the repeat). Selected Bolt 1 in the Objects list, filled Length 10 to 14 and pressed Enter, with `requestAnimationFrame` stamps, `WebGL bufferData` calls and attribute mutations on `scene-bodies` recorded: Bolt 1's `data-body-bounds` (z max 8.82 to 12.82) and the repeat's (z max 8.82 to 12.82) changed at +28.7 ms and +28.8 ms, **the same frame (0 frames apart)**; all 10 geometry buffer uploads for both landed in the next frame (+30.8 ms, 1 frame later) and both volumes updated at +45.8 ms. A person would see Bolt 1 and its three repeats change together. Worst rAF gap in the window 31.1 ms (headless software GL). 0 page errors. |
| 3 | Move the Pi after the bolts exist: only the Pi moves and the bolts stay (a later step is not consumed by earlier rows). Does that read as a bug to someone who did not read the docs? `ui-069` must explain it. | Issue | 2026-11-14 (`testing-029` panel): A: unclear (reads as a bug). B: unclear (reads as a bug). The note is easy to miss and never says the bolts stayed behind. Filed `FIND-docs-036` (docs) and `FIND-ui-127` (the Inspector note). |
| 4 | Type a value into Position X on *Bolt 1 ×3*: nothing moves, but the refusal is an uncaught error, not a message. | OK | Fixed by `ui-069`: the fields are read-only on a repeat body with a note; `e2e/repeat-placement.e2e.js` asserts no page error. |

### ui-068 — The Library remembers each part's last-used params (2026-10-17 02:30 UTC)

Acceptance 1, 2, 3 and 15 plus the repros were driven (emulated viewports only). These are the judgment calls and the spec contradiction they left.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | The spec disagrees with itself on the Bolt / screw summary line: Done says `× 8 mm` (dropdowns already show Type and Size), e2e step 1 says `M2.5 socket × 8 mm`. `× 8 mm` shipped. Does it read right on a phone, or would the full `M2.5 socket × 8 mm` be clearer? | Issue | 2026-11-14 (`testing-029` panel): A: unclear on its own, prefers the full form. B: unclear on its own, prefers the full form. `× 8 mm` does not say what is measured. Filed `FIND-ui-127` (`M2.5 socket × 8 mm` or `M2.5 socket, 8 mm long`). |
| 2 | On a real phone, is the ↺ Reset button easy to hit and clearly not a drag handle (44 x 44 at the row's right edge)? | Open | |
| 3 | Does the always-on memory surprise anyone (the spec's follow-up: a Settings "remember" toggle only if it does)? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### core-060 — One Bolt / screw row with a Type dropdown (2026-10-17 UTC)

Visual and feel checks the scenarios do not cover, plus one deliberate gap.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | The Library row's **Type** dropdown clips its longest label ("Wood screw, flat head" reads "Wood screw, fla" in the 197 px Library column). Decide whether to widen the column, shorten the labels or let it wrap | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | `docs/screenshots/hardware-screw-family.png` still shows the last-dropped screw's gizmo and highlight, and the six screws are small. Judge whether it reads as "six types side by side" | Issue | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). I read the committed picture directly (no panel agent; the panel budget was spent). It still shows the last-dropped screw (Bolt / screw 6) with its gizmo, rings and two dimension labels on it, and five unselected screws; the six screws are 30 to 55 px tall in a 1440x900 picture and are spread over the whole view, so it does not read as 'six types side by side'; the header's save chip is covered by an opaque magenta block (the Playwright screenshot mask colour). The small-screws part has the same cause as `FIND-ui-130` item 1 (the camera does not frame what was dropped), so it is folded there: the docs media for this picture also needs the selection cleared, a closer camera and a mask style that is not magenta. Not filed as its own finding. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |
| 3 | The History row **Edit** form still shows a legacy `hardware.bolt`'s old **Spec** form (`m10 hex`), not Type + Size; submitting writes the new shape. Decide whether that is acceptable or worth a task | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 4 | The BOM line for a bolt whose Size or Fit is bound to a variable drops the size (`Bolt / screw hex × 20 mm`), because the bound value is not a string. Same as before core-060; decide whether the BOM should show the resolved value | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ai-023 — Agent-neutral timed live MCP access (2026-10-16 19:11)

Scenario 25 covers the lease, writes, undo, off and phone reachability. These are what it cannot
show: the real agent, and the idle-session sweep with a real client that crashes.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Register the live endpoint with GitHub Copilot's MCP support (the reported failure was never reproduced), enable 15 minutes, and ask it to add a cube. Does it connect with no code step? | Open | |
| 2 | Kill a real MCP client with `kill -9` while access is enabled, then connect a second one immediately and again after five minutes. Is the first refused as ambiguous, then accepted? | OK | 2026-11-14 (`FIND-testing-022`): dev server, lease enabled, real `claude -p` clients. Client A started by me (PID 35024), `kill -9` at 17:04:20 after it had connected (it was in its ToolSearch, before any WarpCad call). Client B at 17:04:34, immediately: every call refused `more than one MCP client or enabled WarpCad tab is connected. Disconnect the extra client or turn off access in the other tab` (chip `MCP routing · ambiguous`). Client C at 17:10:22 (5 min 48 s after A was killed): accepted, cube and sphere landed, chip `MCP agent · connected`. The sweep is lazy (the chip still read ambiguous at 17:10:05 until C called). Ordinary clean exits left the same ambiguity for several minutes: filed `FIND-ai-038`. |
| 3 | At 390x844 with an API key saved, find the way to **Live MCP access**. The panel entry is laptop-only now (it pushed **Send** out of the half sheet), so a keyed phone user has only the chip once access is on. Is that acceptable, or does it need a header entry? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### core-042 — Helical and herringbone gears (2026-10-16 07:08)

Gears have no Library row yet, so the helical path is unit-covered only. While re-driving acceptance 9 with a Twist of 90 degrees, the twisted sketch body measured 3 820 mm³ where a 30 x 16 mm rectangle at 30 mm should be 14 400 mm³ (the untwisted run gives 14 400), and a Subtract against it removed 19 468 mm³. An unmodified HEAD build gave the identical numbers, so this task did not cause it; it needs a person to look at whether the twisted mesh is inverted or the volume readout is wrong.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Sketch a 30 x 16 mm rectangle, Extrude Linear 30 mm with Twist 90, Done: does the Inspector volume read about 14 400 mm³, and does the solid look right (not inside-out) from several angles? | Issue | 2026-11-14 (`FIND-testing-019`): production build (`npm run build`, `vite preview`), laptop 1440x900, Chromium. A 30 x 16 mm rectangle, Linear, Height 30: volume 14 400.000 mm³. Twist 90 at the default **Twist steps** 1: **3 820.005 mm³**, so not about 14 400. The mesh is not inside-out (positive volume, solid and outward-lit from Top, Front, Right, Bottom) and the readout matches the mesh; the solid is a one-slab fold. Twist steps 2, 4, 12, 30 read 8 907.0, 11 822.7, 13 604.5, 14 090.9 mm³. The sketch path passes `twistSteps` 1 straight to the kernel, where the gear path derives it from the resolution. Filed as `FIND-core-083`. |

### core-058 — One Raspberry Pi Screen row with a Screen model dropdown (2026-10-16 03:52)

Acceptance 3, 6 and 15 were driven and passed. These two checks are judgement calls about look and feel that the drive cannot make. "Screen model" is a longer label than "Model", so the closed select has less room. In the 1440 px laptop panel and the docs screenshot it reads "7-inch T…" / "Touchs…".

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Library → Raspberry Pi at laptop, tablet and on a real phone: is the truncated **Screen model** select still clear enough to tell which screen is chosen, or should the label shrink to "Model" or the select wrap under its label? | OK | 2026-10-16, user: checked, fine as is. |
| 2 | On a real iPhone/iPad (Safari), open the **Screen model** select on the Library row and in the Inspector: the native picker lists all six names in full | OK | 2026-10-16, user: fine. Separately saw the Inspector's collapsed tab covering the open Library sheet's rows at phone width; filed as `ui-070`. |

### ai-022 — group.snap orientation description (2026-10-16 02:21)

The unit and scripted-transcript specs check the wording and the kernel's side. They cannot show that a
live model, reading the corrected sentence, now picks the right side for a request.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | With a real Assistant key, ask it to snap a body with `outside+` onto another and say which side it lands on. It should answer the − side, and the result should match. | Deferred | 2026-11-07: The model-behaviour half (Claude Code over MCP on the owner's subscription, same tool registry) moved to `FIND-testing-032`; the in-app Assistant with a real key stays here. 2026-11-07: Deferred due to cost. Needs a real Anthropic API key, which bills against purchased tokens, not the Pro subscription. Model half answered 2026-11-15 (`testing-032`, Claude Code over MCP, not the in-app Assistant; its system prompt differs, so this is evidence about the tools, not the chat panel): `claude -p --model haiku` (claude-haiku-5-5), owner subscription, no key, scratch files. Two 20 mm blocks, *snap Block A onto Block B using outside+ along z, and say which side of B it lands on*: one `operate group.snap`, answered the - side, and Block A moved from z 0..10 to z -10..0 with Block B unmoved, so the result matched. One run, so an anecdote. The in-app Assistant with a real key is still open. Transcript `bench/results/ai/2026-11-15-claude-code-over-mcp.md`. |

### ui-067 — Place connectors on the split cut face by hand (2026-10-15 23:46)

Drag, tap, kind switch, refusal and cancelled-touch behaviour are covered by `e2e/print-prep.e2e.js` on all nine projects and by the Step 6 hand drive; these are the feel and layout calls a script cannot make.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPad, the Split sheet covers the orientation cube (right-hand panel at 820 px), so the face can only be turned square-on before opening Split or by dragging the view; judge whether a "face the cut" button in the sheet is wanted. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | The offset handle (44 px) sits at the centre of the cut face; on a small face it covers much of it until you zoom in. Judge whether the handle should hide, or shrink, while Place connectors is on. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 3 | Marker positions use the plane's affine map at its centre, so under strong perspective (a close camera, an oblique view) a marker can sit a few pixels off the drawn plane's corner geometry. Judge at an oblique view on a phone whether that reads wrong. | Issue | 2026-11-15 (testing-031): Issue, filed as ui-137. Analytic measurement of the documented map, not a pixel read of the app: cutPlane.js faceToScreen is the Jacobian at the plane centre, compared with a pinhole projection (fov 45 deg, 390x791 viewport). Worst face-corner error: 3.6 px at a camera 8 face-widths away, 16 px at 4, 45 px at 2.5, 160 px at 1.5, almost independent of elevation (20-70 deg). The default framing of a 100x40x30 bar puts the camera at 349 mm (8.7 times the 40 mm face), so a fresh split is about 3 px off; filling the phone width with the face (about 2.7 widths) is about 38 px off. Threshold: <= 4 px at the face corner: met only at the default distance. |
| 4 | Markers are SVG only: no keyboard path to move or remove one yet. Judge whether that is acceptable for v1. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### io-011 — A stale hosted save merges instead of asking (2026-10-15 19:50)

Everything was driven against a mocked `api.github.com`; no scratch repository and token were available to the runner, so scenario 10's hosted half is not driven for real. This is the one manual check that remains.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | With a real scratch repository and a fine-grained token: save from one browser, change the project from a second and save, then Save from the first. Expect `Merged 1 step from <owner>/<repo>`, no dialog, and the repository holding both changes (check the commit on GitHub). Also confirm a file over 1 MB still merges (the blob path). | Open | |

### io-009 — Import an STL (and later OBJ / 3MF) into My parts (2026-10-15 18:34 UTC)

Driven by script and by hand with a made-up L-bracket (scenarios 1, 3, 6, 8, 20, new 26). What no generated file can judge is a real-world STL and a real slicer.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Import a real STL from Thingiverse (or a phone scan, if you have one) with a few hundred thousand triangles: does the row's size read right for the object, and does **Units** fix it when it does not? | OK | 2026-11-14 (`FIND-testing-023`): production build, Chromium 1440x900, every file exported through **File ▾ → Export…** (real download). Tools: UltiMaker Cura `CuraEngine` 5.13.0 (`/Applications/UltiMaker Cura.app/Contents/Resources/CuraEngine slice`, stock Ultimaker Original definitions, 100% infill, mesh dropped to the plate; note the binary is in `Resources/`, not `MacOS/`). **No public-domain real scan was used: a dense scan-like mesh was generated** (a lumpy UV sphere, 240,960 triangles, authored in inches as a 3.5 in blob, closed and outward-wound, 0 open edges at 1e-6; generator `/private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/tools/genscan.mjs`, file `/private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/scan/scan-inches.stl`, written into its own empty directory, plain binary STL, size = 84 + 50 x 240,960 bytes), so there is no download or license to state; it is my own script's output, dedicated to the public domain (CC0). Premise change: the app **refuses a file over 250,000 triangles** (`docs/import.md`), so a first, 310,960-triangle copy was refused with the line **Too many triangles: 310,960, limit 250 k**, nothing added; a few hundred thousand is only possible just under the cap. The 240,960-triangle file read in 0.86 s, and the notice read **Imported scan-inches.stl — 240,960 triangles, 3.5 × 3.37 × 3.43 mm** with *Units assumed: mm*: a hand-sized 90 mm part reads as 3.5 mm, which is the wrong-looking size the row asks about. Switching **Units** to *inch* re-read it as **88.88 × 85.71 × 87.18 mm** (volume 15.5 → 254,436 mm³). Screenshots `/private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/scan-as-mm.png`, `/private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/scan-as-inch.png`. |
| 2 | Export a placed, cut imported part as STL and open it in your slicer (PrusaSlicer or Cura): is it closed, with no "repaired" or "non-manifold" warning? The test counts open edges at 1e-3 mm, not what a slicer thinks. | Issue | 2026-11-14 (`FIND-testing-023`): production build, Chromium 1440x900, every file exported through **File ▾ → Export…** (real download). Tools: UltiMaker Cura `CuraEngine` 5.13.0 (`/Applications/UltiMaker Cura.app/Contents/Resources/CuraEngine slice`, stock Ultimaker Original definitions, 100% infill, mesh dropped to the plate; note the binary is in `Resources/`, not `MacOS/`). A 12-triangle bracket (40 x 20 x 10 mm) and a 4,920-triangle blob, each cut by a Cube through **Subtract**: exports of 60 and 5,532 triangles, **0 open edges** (independent Python reader at 1e-5 mm), `CuraEngine` slices both with **no warning**. The same cut on denser scans is **not closed**: 32,320 triangles → 27 open edges of 47,934, Cura `Mesh has overlapping faces!`; 96,600 → 36 of 137,733, same warning; **240,960 → 128 of 334,684** (136 at the repo's 1e-3 mm, 21 collapsed triangles), Cura `Mesh has disconnected faces!` and `Mesh has overlapping faces!`. The same 240,960-triangle scan exported **without** a cut is closed (0 of 361,440) and Cura is quiet. Positive control: a hand-made cube with its top removed gives `Mesh has disconnected faces!`, so the warning is real. Files in `/private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/exports/` (`cut-box.stl`, `cut-4k.stl`, `cut-32k.stl`, `cut-96k.stl`, `scan-cut.stl`, `scan-placed.stl`). Filed as `FIND-io-031`. `docs/export.md` now carries a caveat. |
| 3 | On a real iPhone, **Import model file…** opens Files and iCloud (no camera-only picker), and an STL in iCloud Drive reads without a timeout. | Open | 2026-11-07: The picker-type half, in the iOS Simulator moved to `FIND-testing-027`; the iCloud Drive read stays here. |
| 4 | Is the 96 px thumbnail of a dense scan (12,000-face budget, sampled) recognisable, or does it speckle? | OK | 2026-11-14 (`FIND-testing-023`): the 240,960-triangle scan above, **Save to library…** in the production build (Chromium 1440x900). The My parts thumbnail is a 96 x 96 PNG of 14,918 bytes (`/private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/scan-thumb-96.png`; not committed). It reads as a pale-blue lumpy blob with a clear outline and soft shading, so it is **recognisable**; the 12,000-face sample shows faint concentric facet lines across the surface (the generated scan's regular grid sampled at 5%), a light moiré rather than speckle. A real, irregularly meshed scan was not available, so this judges a regular grid, the worst case for aliasing. |

### core-057 — Phone library item: model, case, enlarge and separate plateau (2026-10-15 14:55 UTC)

Driven by script and by hand-style mouse drive (scenarios 3, 4, 6, 10); what no script can judge is whether the numbers match a real handset in a real case.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Hold a real phone in its case against the placed stand-in (iPhone 17 Pro, or whichever you own): is the plateau's size and position, and the case's added width and length, within a millimetre or two? Every plateau and every Android size is an estimate; adjust with Case enlarge and note the real caliper numbers here. | Open | |
| 2 | Print or cut a pocket from a Subtract of `plateau` and test-fit the phone: does it lie flat with the camera in the pocket? | Open | |
| 3 | On real phone/tablet hardware, are the Model and Case dropdowns under the Phone row easy to tap and legible (they are 32 px tall like the Pi's; the TODO suggested 44 px)? | Open | |

### io-010 — A changed project file merges into the open project (2026-10-15 06:10 UTC)

Driven by script: the real `mcp/server.js` through the SDK client against a faked file handle over a real file, in headless Chromium. Not driven: real Claude Code, real Safari or a phone using **Merge file…**, and how the `Changes waiting to merge` deferral feels in a hand that is actually dragging.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | In desktop Chrome, open a project file, move a body without saving, ask real Claude Code (`npm run mcp:add -- <file>`) to add a sphere, click back into WarpCad: the sphere appears, the move stays, the strip reads `Merged 1 step from Claude Code`, no dialog; Save, then ask Claude Code to describe the scene | Moved | Moved 2026-11-07 to `FIND-testing-028`: an AI drive can settle it. |
| 2 | In Safari (desktop and iPhone), open the same file, have Claude Code add a step, then **File ▾ → Merge file…** and pick it: the step comes in with `Merged 1 step from <file name>` and **Undo merge**; nothing appears by itself | Open | 2026-11-07: The desktop-Safari half moved to `FIND-testing-026`; the iPhone half stays here. |
| 3 | While holding a real drag (Library part or gizmo), have Claude Code change the file and switch windows back: the chip says `Changes waiting to merge`, the viewport does not jump, and the merge lands the moment you let go. Does that read as calm, or does the wait feel like the app ignoring you? | Open | 2026-11-07: The mechanics half (chip, no jump, merge on release) moved to `FIND-testing-028`; whether the wait feels calm stays here. |
| 4 | The flagged row in a move-versus-fillet conflict is chosen by replica ids when both clocks tie, so it can be either one on different runs. Is a banner naming whichever step lost clear enough, or should the app prefer the local step? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ui-060 — The tall Align popover on a real phone (2026-10-15)

The one Align popover stacks Target, Measure from, the drop shortcut, a 3x3 grid, the Snap relation, a 3x2 Snap grid and Offset, so with two bodies selected it scrolls inside its own max height on a 390 px screen, and on a laptop it covers the middle of the scene. The e2e specs and a scripted drive prove it fits, opens, commits and closes at 390, 820 and 1440; whether it *feels* usable under a thumb, and whether the scene stays readable behind it, is a judgment call. Also worth a glance: tapping Undo while the popover is open first closes it (the backdrop takes the tap), so Undo needs two taps.

| Check | Status | Notes |
|---|---|---|
| On a real phone, select two cubes, open Align, tap X ⇤ + side then Z ◇ ctr: no scrolling needed for the common taps, and the shapes are still visible | Open | |
| On a real tablet, the popover does not hide the body being moved | Open | |

### ui-066 — Rotate rings pick the step from drag speed on every pointer type (2026-10-15 07:02)

The mouse now steps by speed like a finger. The unit and e2e specs pin the bands and a scripted real-mouse drive read well, but whether the 40 and 250 px/s edges *feel* right for a human hand and for a real finger is a judgment call no assertion makes.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | With a real mouse, drag a ring at an ordinary pace and then creep: does the readout feel steady in the `1°` band, or does the jump between `1°` and `0.1°` at the slow edge read as twitchy? | OK | 2026-11-15 (testing-031): OK. Laptop mouse and phone touch, in-page 8 ms move cadence, rAF-logged readout. Threshold: <= 1 band switch per second at the slow edge with +-35 % speed noise, and no value reversals. A steady 45 px/s creep never leaves the 0.1 deg band (0 switches); 40 px/s with +-35 % noise switched twice in 3.1 s (0.64 per s: 0.1 deg to 1 deg and stayed); 150 px/s one switch; 250 px/s with +-25 % noise one switch in 2.2 s (0.46 per s); a 1100 px/s flick 2 switches in 0.9 s (1 to 5 to 15 deg); a ramp from 20 to 520 px/s 2 switches. 0 value reversals in every run, laptop and phone alike (the 15 % hysteresis holds). Whether it still feels twitchy to a hand is not claimed. |
| 2 | On a real iPad or iPhone, repeat the fling, creep, rest drag on a ring: coarse then `fine 0.1°`, camera does not orbit, readout clear of the finger. (A synthetic CDP touch drive was inconclusive; the e2e touch-type pointer test passes.) | Open | |

### ui-061 — Docs inside the app, help buttons (2026-10-15 UTC)

Offline Help is asserted in Chromium and Firefox and, for WebKit, only as precache contents (Playwright's WebKit offline emulation defeats service-worker answers), so a real Safari/iPhone check is the one thing not covered. The GIFs are not precached by design.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Installed PWA on an iPhone: open once online, go to airplane mode, relaunch, File menu → Help and documentation opens with text and stills | Open | |
| 2 | Same offline: a GIF you never opened online shows its alt text rather than a broken box; one you opened online still plays | Open | |
| 3 | First install on a phone connection: the extra ~15 MB precache is acceptable (or flip `HELP_PRECACHE_GLOBS` in `scripts/vite-plugin-help.mjs`) | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### io-008 — Save falls back to a download when the write is refused (2026-10-15 05:30)

Driven against a stubbed refusing picker on Chromium, WebKit and Firefox, and by hand on Chromium. What
no stub can prove is the real refusal in the editor's integrated browser, so that is the one check.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | In the editor's integrated browser (the original report), File ▾ → Save, pick a folder and a name: a `warpcad-project-…ndjson` download starts from that click, the status line names it and the empty file left at the chosen path, and the menu then reads Download copy. If the download does not start there (user activation lapsed after the picker), file it: the TODO's step (3) is the fallback design | Moved | Moved 2026-11-07 to `FIND-testing-028`: an AI drive can settle it. |

### ui-056 — Name a part in the Inspector (2026-10-15 03:59)

The field is covered by unit specs and `e2e/rename-part.e2e.js` (trusted touch on the Chromium and WebKit phone and tablet projects), but a Playwright tap does not raise a real on-screen keyboard, so what the keyboard does to the sheet is a feel judgement only a device can give. Commit-on-outside-press was added because tapping plain text does not blur an input on touch Chromium; Safari's behaviour is covered only by the emulated WebKit run.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, select a part, tap its name: the keyboard rises without pushing the sheet or viewport off-screen, the field stays visible above it, and tapping the keyboard's Done key or the empty viewport commits the name | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 2 | On a real iPad, the pencil and the name are easy to hit, and the field does not zoom the page on focus | Open | 2026-11-07: The no-zoom-on-focus half, in the iOS Simulator moved to `FIND-testing-027`; whether the pencil and name are easy to hit stays here. |

### ui-065 — Translate ruler (2026-10-15 01:47)

Speed bands for the arm (`src/render/translateSnap.js`: 40/300/1000 px/s -> 0.1/1/5/10 mm) are unit-tested with an injected clock and exercised with paced synthetic and CDP input only. A plain mouse drag on an arm is now speed-stepped (it was continuous), which is a feel call.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | With a mouse, drag an arm at a normal pace: does the speed step feel predictable, or does the value jump in coarse steps you did not ask for? Consider whether the rings should match (ui-065 Open question a). | OK | 2026-11-15 (testing-031): OK. Laptop mouse, X arm, 8 ms cadence. Threshold: the step changes only at the documented speed edges, <= 1 switch per second at the slow edge, 0 reversals. 45 px/s: 0.1 mm throughout; 40 px/s +-35 % noise: 2 switches in 3.1 s; ordinary 150 px/s: 1 mm steps after one switch; 300 px/s +-25 %: 1 switch (0.54 per s), 5 mm steps only at or above 300 px/s and 10 mm at or above 1000 px/s (a 1500 px/s flick: 2 switches in 0.7 s); 0 reversals. The ring bands (0/40/250/900 px/s) and arm bands (0/40/300/1000) are within 20 % of each other. |
| 2 | On an iPad and a phone, drag an arm fast then slow: coarse then `0.1 mm`; is the readout never under the fingertip (it can sit over the start mark on a diagonal arm)? | OK | iPad: looks OK (reported by the user 2026-10-15, no detail given). Phone not checked. |
| 3 | Ruler legibility in light and dark themes: tick density, the `+5` labels, readout contrast. | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Ruler dragged on the X arm. Tick spacing 9.7 px (laptop) / 11.4 px (phone), tick labels 10 px. Readout text vs its pill: 7.7 / 9.1 dark, 9.1 / 11.2 light (threshold 4.5:1). Axis-red ticks and labels vs ground: 4.25 dark, 4.57 light (threshold 3:1 non-text; the 10 px labels sit just under the 4.5:1 small-text bar in dark). Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/F-<laptop|phone>-<dark|light>-ruler.png. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |

### ui-064 — Rotate dial (2026-10-15 01:04)

The speed-sensitive touch step (`src/render/rotateSnap.js`, bands 0.1°/1°/5°/15° at 40/250/900 px/s) is
unit-tested with an injected clock and exercised by synthetic pointer events only; the thresholds need a real finger.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On an iPad and a phone, drag a rotate ring fast, then slow down: does the step feel right (coarse when flinging, `0.1°` when nearly stopped) and is the readout never under the fingertip? | OK | iPad: works OK (reported by the user 2026-10-15, no detail given). Phone not checked. |
| 2 | Dial legibility in light and dark themes: tick density on a small ring, the `0/90/180/270` labels, and the readout pill contrast (`--surface-glass`). | Issue | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Dial captured with the ring handle held (drag from a ring vertex that hit-tests to the ring; scripts `h1.mjs`, `h1b.mjs`), DPR 2. Measured: 24 ticks (4 major at 1.75 px, rest 1 px), 4 labels at 10 px, readout 18 px value over 14 px 'fine 0.1' line; value text vs pill 14.1:1 dark, 16.4:1 light (laptop), 7.9 / 9.7 (phone, pill sampled over the cube, so lower); 'fine' line 7.4 / 7.3 laptop, 4.2 / 4.3 phone (under 4.5:1 for small text); ticks and labels vs ground 6.9:1 dark, 4.5:1 light. Panels A and B agree: ticks neither too dense nor sparse and the pill is readable at laptop width; '270' is partly under the cube in both themes at laptop width; at phone width the operations toolbar covers part of the readout pill so only '0.1°' shows. Measured: toolbar box 8,61 182x180 px overlaps the pill 139,153.5 112x50 px by 51 of 112 px. Filed `FIND-ui-131`. Shots `shots/H1-*-dial*.png`. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |

### ai-021 — WebMCP transport (2026-10-14 23:33)

Everything automated ran against a **fake** `document.modelContext`; the real API is Chromium-behind-a-flag and cannot be switched on in a Playwright-launched browser. These are the checks only a person with that browser can make.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Chrome 146+ with `chrome://flags/#enable-webmcp-testing` Enabled: open the Model Context Tool Inspector extension on WarpCad and confirm 19 tools list and `capture_view` is absent. | Issue | 2026-10-17, Chrome with flag, live (old) build: `getTools()` listed 20 tools, so registration works; the inspector extension was not used. Count is now 20 and `capture_view` absence not re-checked. |
| 2 | Ask the agent *add a 40 mm cube and put a 20 mm sphere on top of it*: both appear, History shows one row with a `webmcp` chip, **Undo AI turn** removes both. | OK | 2026-10-17: with `navigator.modelContext` aliased, Claude in Chrome added a 10-cube row and Undo AI turn removed it (scenario 27). Without the alias it never found the tools; the app now sets the alias (`ai-024`). The 40 mm cube + sphere request itself was not run. |
| 3 | Two WarpCad tabs open: confirm the agent reaches the tab you are looking at (Decision 13's visible-tab hypothesis; neither the spec nor Chrome's pages say what happens). | Open | |
| 4 | Whether a deployed (https) app needs an origin-trial token before the API exists for ordinary visitors, and the trial's end date. `docs/webmcp.md` deliberately leaves this out until confirmed from Chrome's own page. | Open | 2026-11-09: developer.chrome.com/blog/ai-webmcp-origin-trial and developer.chrome.com/docs/ai/webmcp say only 'Join the WebMCP origin trial from Chrome 149' and that the flag works for local development; neither states a token requirement for deployed sites or an end date (the origin-trials dashboard page would not render). `docs/webmcp.md` left silent. Unconfirmed secondary hints: Blink intent lists the trial Chrome 149-156; Edge's trial page shows 2026-11-17. |
| 5 | Tool results against Chrome's 1.5K-character advice on a large project: `measure` and `check_printability` over many bodies come back whole with an `oversize` note, unmeasured. | Open | 2026-11-07: The registry half (the tools called directly on a 50-body project) moved to `FIND-testing-019`; the real-Chrome WebMCP half stays here. 2026-11-14 (`FIND-testing-019`): registry half OK, Chromium, stand-in `document.modelContext` (same registry, no network): 50 cubes through `apply_records` (50 bodies), then `measure` with all 50 ids returned all 50 bodies and a `total` (8 721 characters) and `check_printability` all 50 bodies and 50 issue entries (19 159 characters), each with `oversize` {budget 1 500, note "This result is longer than the 1,500 characters advised for one tool result. Ask about fewer bodies at a time if your client cuts it short."}. Nothing cut, nothing left unmeasured. The real-Chrome half stays Open. |

### ai-012 — Live bridge, dev host (2026-10-14)

Driven with an MCP client stand-in, not a real Claude Code, so the parts that need one or need a human's eye are here.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | With a real Claude Code (`npm run mcp:add -- --dev`, `npm run dev`), ask for a cube and a sphere: the pairing sentence reads clearly and the change lands | OK | 2026-11-14 (`FIND-testing-022`): `npm run dev -- --host 127.0.0.1` (plain `npm run dev` listens on ::1 only, `FIND-ai-037`), `npm run mcp:add -- --dev`, Playwright Chromium 1440x900 tab on the dev app. Lease off: *add a 40 mm cube and a 20 mm sphere on top of it* got `WarpCad refused record_prompt: live MCP access is off. In WarpCad, open Assistant -> Live MCP access and explicitly enable it, then retry.` and the agent relayed it in plain words (nothing written). Sheet: *When enabled, any MCP client on this computer that can reach the local WarpCad endpoint can read and change the project open in this tab...*, 15 minutes. Enabled: the same request landed (Cube 1 40 x 40 x 40, Sphere 1 20 mm at z 40-60), chip `MCP agent · connected`, History rows `via mcp`. The sentence reads clearly. (It names no pairing code: the live bridge no longer uses one.) |
| 2 | Chromium's local-network prompt on first connect: the sheet's wording prepares you for it (choose Allow) | Open | |
| 3 | Safari at `http://localhost:5183` connects; the Connect sheet's WebKit note is the right amount of warning | Open | 2026-11-07: The connection half (Safari at localhost connects) moved to `FIND-testing-026`; whether the WebKit note is the right amount of warning stays here. |
| 4 | **Undo AI turn** looks greyed for ~1.5 s after a call while the `Claude Code working` chip lingers; feels right or just laggy? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 5 | A Claude call during a held Library drag is refused as "project changed… while this call waited", not the spec's "the user is editing; try again"; the drop is kept. Acceptable wording? | Issue | 2026-11-14 (`testing-029` panel): A: clear for the agent, unclear for a human log. B: same (*merge landed* is jargon). Judged from the string. Filed `FIND-ai-039`. |

### ai-017 — Keep editing while the Assistant works (2026-10-14 14:39)

Driven with a scripted transcript only; the judgment calls below need a real turn and a real phone.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | With a real key, a turn of several tool calls: does editing during it *feel* uninterrupted, and is `Working…` plus the header chip enough to tell the turn is still running? | Deferred | 2026-11-07: Deferred due to cost. Needs a real Anthropic API key, which bills against purchased tokens, not the Pro subscription. |
| 2 | At 390 px, the chat header wraps in Scripted mode; check the header chip dot and the **Watch** toggle are still comfortably tappable and not clipped. | OK | 2026-11-14 (`FIND-testing-017`): Scripted mode exists only on the dev server (`import.meta.env.DEV`; the production build ignores the transcript), so this row ran on `vite` at 5183 with the `edit-while-working` transcript, phone 390x844, Chromium, WebKit and Firefox. The chat header wraps to two rows (92 px tall): dot 14x14 (a status light, not a control), title, **Scripted** badge, status and **Watch** 58.9x44 on row 1, the height group 134x44 and close 44x44 on row 2; no pair overlaps, nothing clipped (`scrollWidth` <= `clientWidth` for every item), document overflow 0, **Watch** enabled while working. The header **Assistant working** chip (`ai-working-chip`) with the panel closed is 22x20 with an 8 px dot: by design, a read-only `role=status` chip collapsed to its dot at 640 px and below (`AiWorkingChip.vue`); Watch and Stop are the tap targets, and a hit test at the chip's centre lands on the chip. Same numbers in all three engines. Screenshots `r5-ai017-*-phone-{idle,working,chip}.png`. |
| 3 | Edit the very body the Assistant was asked to change, then read the conflict banner and the flagged row: is the wording understandable? | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: misleading. *Merged … 1 step conflicted* suggests success and failure at once and does not say whether the edit was applied. Judged from the string. Filed `FIND-ai-039`. |

### ui-063 — Snap/Align names a part on both operands (2026-10-13 22:32)

Re-addressing between the Align (XY) and Snap (Z) commits takes two taps and the Objects
section collapses when a body row is tapped; that is unchanged behaviour but worth a feel
judgment on a phone. Nothing here is covered by an acceptance scenario.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a phone (390x844), is the Align then Snap flow with `hole1` then `mb` still quick, given the Objects section collapses on a row tap? | OK | 2026-11-15 (testing-031): OK. Phone 390x844 Chromium touch (CDP touch drags), the Pi 5 on touchscreen posts flow: Library open, two variant pickers, two drags in, then hole1 and the screen's post ticked, Align X/Y, mb and the post ticked, Align Z outside-plus. 34 gestures: 22 taps (4 of them native-select pickers, 2 popover dismissals), 2 drags, 10 scroll nudges; 10 s scripted. Re-opening the Objects section after it collapses on a row tap costs 4 of them (a scroll to the header and a tap, twice), 12 %. Threshold: <= 15 % of the flow spent re-opening a collapsed section: met. |

### ui-062 — File ▾ → Merge file…, merge strip, Undo merge (2026-10-12 23:05)

Scenario 22 and 7/10/12/14 were driven by hand; these are the feel and device checks that
drive could not settle.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone, the merge strip pushing the workspace down 49-70 px when it appears and again when it goes: is the layout jump acceptable, or should it overlay? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | At laptop height 900 the History selected-row action bar (Edit / Suppress / Move up…) is cramped at the bottom of the panel; on a phone sheet "Roll back to here" sits under the peek bars. Judge whether a conflicted row's fix is easy to find. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 3 | The strip never times out and stays until dismissed. Does a clean-merge toast that lingers feel wrong? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 4 | Pan mode, touch drag that starts on a selected body's gizmo ring rotates the body instead of panning (seen on phone; not merge-related). File as its own TODO if it reproduces on a real device. | Issue | Reproduces. 2026-11-14 (`FIND-testing-020`): Chromium, phone 390x844 (`hasTouch`, trusted CDP touch), e2e-hooks build of HEAD, Cube selected, Inspector sheet collapsed, **Pan** pressed (`aria-pressed` true). Control: a drag on empty canvas moved the gizmo hub 195,369 to 246.9,410.5 (view panned, document version 1 to 1). A 70 px tangential drag starting on `gizmo-grab-ring-z` (hit test returned the ring) left the hub unmoved, added one document step (version 1 to 2) and set Rotation Z to -14°; a second ring drag from another ring point gave -26° (version 3). So the ring wins the press in Pan mode and the body rotates; the camera does not pan. Filed as `FIND-ui-126`. Acceptance 7's chrome steps (no ring involved) re-driven at 820x1180 and pass, see `ACCEPTANCE.md`. |

### data-011 — Project file version 2 (2026-10-12 19:50)

Core and format only; scenarios 8 and 10 were re-driven and passed. These are what no scenario covers.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Open a version-2 file saved on desktop Chromium on an iPhone or iPad (Safari) via Files → Open…: it opens, and **Download copy** from there writes the same bytes back. Engine-sensitive only through file reading, which the e2e covers in Chromium and WebKit, never on real iOS. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 2 | Judge the size: a project you actually work on, saved as version 2 — is the `merge` section (34-43% of a small test file) still a reasonable share of *your* file? That decides whether `data-012`'s tighter encoding is worth doing before `ui-062`. | Open | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. 2026-11-07: The measurement (the merge section share of each owner file) moved to `FIND-testing-018`; the data-012 decision stays here. 2026-11-14 (`FIND-testing-018`), the measurement half: Chromium, laptop, on copies; every `~/Documents/*.ndjson` opened and saved with File ▾ → Download copy, each already `version: 2`, and each saved file is **byte-identical to its original** (`cmp`). The `merge` value as a share of the whole file (merge JSON bytes / file bytes): `cupholder` 1,931 / 8,289 = **23.3%**; `enviro-plus-featherwing` 14,913 / 65,355 = **22.8%**; `airplane` 2,130 / 11,753 = **18.1%**; `warpcad-project` 86,614 / 576,631 = **15.0%**; `featherwing` 27,894 / 194,158 = **14.4%**; `fan-duct` 81,315 / 571,332 = **14.2%**; `huzzah-feather-esp8266` 13,640 / 524,364 = **2.6%**; `cutter-color-issue` 10,050 / 471,362 = **2.1%**; `alilgn-issue` 8,537 / 466,235 = **1.8%**. The three 1.8 to 2.6% files carry a `parts` section of 445,692 to 485,394 bytes (the Feather's user part definitions) in the state line, which dwarfs everything; of the six without it, the two largest real projects (`fan-duct`, `warpcad-project`) sit at 14 to 15% and the small ones at 18 to 23%. The data-012 decision stays with the owner (`FIND-testing-033`). |

### data-010 — The document carries merge state (2026-10-12)

Core only; nothing calls `mergeFrom` from the app yet, so the three acceptance scenarios that write or reload were re-driven and passed. These are the two things no scenario covers.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Open a project saved *before* this build, edit it, Undo, Redo, reload: it behaves exactly as it did (legacy metadata is derived, never written yet). | N/A | 2026-11-14 (`FIND-testing-018`): on a copy in the session scratchpad, never the original; production build (`npm run build`, `vite preview`). The premise does not hold: every file in `~/Documents` is a `version: 2` file with a `merge` section, last saved 2026-10-26 or later, and none predates `data-010` (2026-10-12), so there is no file whose merge state is "derived, never written". The behaviour was driven on the two oldest files anyway. Chromium (`cupholder.ndjson`, `airplane.ndjson`) and WebKit (`cupholder.ndjson`), laptop 1440x900: opened (1 and 4 bodies), dragged a Cube in (2 and 5), **Undo** returned exactly the opened bodies and bounds, **Redo** the edited ones, a reload kept the edit (same ids and bounds). File ▾ → Download copy: every pre-existing record line is unchanged, one new record line is added (`cuboid-<replica>-21` or `-43`), and the state line keeps the same keys (`warpcad,version,origins,resolution,intents,merge`, version 2). Undo is disabled on a fresh open, as expected. 0 page errors. |
| 2 | Edit a 200-record scene and feel the mutation latency (stamping adds ~0.05 ms; should be imperceptible). | OK | 2026-11-14 (`FIND-testing-020`): Chromium, laptop 1440x900, e2e-hooks build of HEAD, 200 records (50 bodies x 4: cuboid, translate, fillet rim, translate; `bench/merge-benchmark.mjs`'s fixture). Edited Position X of a selected body 8 times (fill, Enter, blur): the synchronous commit took 0.4 to 1.6 ms, the body bounds changed 1.7 to 5.5 ms after the key, the second frame after that was 37.5, 39.0, 41.4, 41.0, 40.5, 90.9, 39.9, 38.6 ms after the key (median 40.7; one 90.9 outlier). Stamping share, Node CPU profile of `document.append` on the same 200-record log (150 timed appends plus 20 warm-ups, 50 us sampling): `stampSince` 8.69 ms over 170 stamped transactions = **0.051 ms each**, matching the expected ~0.05 ms; `bench/merge-benchmark.mjs` (21 runs) `append` median 0.074 ms, p95 0.094 ms, `setSuppressed` median 0.302 ms. So stamping is about 1% of the 5 ms input-to-data time and 0.1% of the 40 ms input-to-paint. |

### data-008 — Replica-scoped record ids (2026-10-12 17:20)

Scenarios 10 and 14 were hand-driven and pass; what is left is what a script cannot judge: how the
longer ids read to a person, and a real project file from before this change.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Open a real project file saved by an earlier build (not a fixture), add a body, Save, and read the file: old lines `op-7`-style and unchanged, only the new rows carry `prefix-<replica>-<n>` | N/A | 2026-11-14 (`FIND-testing-018`): on a copy in the session scratchpad, never the original; production build (`npm run build`, `vite preview`). The premise does not hold: no file in `~/Documents` has `op-7`-style ids. The oldest, `cupholder.ndjson` (2026-10-26), already carries replica-scoped ids (`sketch-xyuxjj-1`, `cuboid-xyuxjj-3`), as do all nine `.ndjson` files. What was driven: Chromium and WebKit, laptop, opened the copy, added a body, File ▾ → Download copy, read the file: all 20 old record lines are byte-identical to the original, and the new row's id is `cuboid-dlvshk-21` (Chromium) and `cuboid-sm5bz4-21` (WebKit), `<prefix>-<replica>-<n>`. Same result for `airplane.ndjson` (new row `cuboid-cwlnpb-43`). The legacy-id half (a file saved before `data-008`) cannot be checked with the owner's files. |
| 2 | In the Assistant, ask for a cube and a sphere then a subtract: do `describe_scene` ids in the chat/tool readout still read acceptably (`cuboid-k3f5xa-1`), or is the replica segment noisy enough to want trimming in the UI? | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. The repeated project tag is noise; both propose `Cuboid 1`, `Move of Cuboid 1 (4)` in the display with full ids kept in tooltips and the MCP data. Filed `FIND-ui-129`. |

### ai-016 — `npm run mcp:add` registers the server (2026-10-12 14:31)

The script is driven in specs against a fake `claude`, and the argv it produces is spoken to by a real MCP client, but no spec runs the real Claude Code CLI against the user's real config.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | From the clone folder run `npm run mcp:add -- bracket.ndjson`; in Claude Code (any folder) `/mcp` lists `warpcad` as connected, and a stale placeholder entry from before is gone | OK | 2026-11-14 (`FIND-testing-022`): owner config backed up first (`~/.claude.json`, SHA-1 `2508a749...`), then `npm run mcp:add -- <scratch>/bracket.ndjson`: it printed `Registered the "warpcad" MCP server with Claude Code (user scope)`, `claude mcp list` and `claude mcp get warpcad` read `Connected`, stdio, command `node .../mcp/server.js <file>`. It replaced the entry that was there (the earlier `--dev` HTTP registration) under the same name; no second or stale `warpcad` entry. Restored afterwards: `diff` of `~/.claude.json` against the backup is empty, same SHA-1. Note: with the dev server up, `mcp:add -- --dev` then read `Failed to connect` (ECONNREFUSED) until the server bound IPv4: filed as `FIND-ai-037`. |

### ai-013 — Subscription route and cost readout (2026-10-11 18:35)

The new sheet and the cost chip were driven on laptop Chromium only. The price table is dated
2026-09-25 and is an estimate; whether the figure tracks the real bill is the one thing a person
with a console open can judge.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | After a real turn with a real key, the chip's "≈ $x" is within a few cents of the turn's cost in the Anthropic console (Usage page) | Deferred | 2026-11-07: Deferred due to cost. Needs a real Anthropic API key, which bills against purchased tokens, not the Pro subscription. |
| 2 | At 390 px (iPhone), the route sheet's command wraps and **Copy** puts the command on the clipboard in Safari (the e2e is Chromium-only) | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |

### ai-014 — AI tools for project variables (2026-10-11 15:09)

Driven with the scripted provider on a laptop only. What a scripted run cannot say: whether a real model reaches for `set_variable` on "make this for a Pi 5", and how the activity rows read at phone width.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | With a real key, a project holding a bound `piModel`: type *make this case for a Pi 5*. Does it call `set_variable` (not `list_ops`/`operate` hunting for the Pi), and does the row read *Set piModel to 5* with the impact line? | Issue | 2026-11-07: The model-behaviour half (Claude Code over MCP on the owner's subscription, same tool registry) moved to `FIND-testing-032`; the in-app Assistant with a real key stays here. 2026-11-07: Deferred due to cost. Needs a real Anthropic API key, which bills against purchased tokens, not the Pro subscription. Model half answered 2026-11-15 (`testing-032`, Claude Code over MCP, not the in-app Assistant; its system prompt differs, so this is evidence about the tools, not the chat panel): `claude -p --model haiku` (claude-haiku-5-5), owner subscription, no key, scratch files. **Issue, 0 of 3 runs** (project: Pi with `model` bound to `piModel`=4; one fixture also held a Case body): the model never called `list_variables` or `set_variable`; it placed a second Pi with `model: 5` and built a case around it, leaving `piModel` at 4. `describe_scene` says nothing about the binding (`piModel` is in no tool result), so the server instruction to call `set_variable` has no trigger. Filed `FIND-ai-040`. The row text and impact line (*Set piModel to 5*) are in-app and still open; Haiku only. Transcripts `bench/results/ai/2026-11-15-claude-code-over-mcp.md`. |
| 2 | At phone width (390x844) the *Set piModel to 5* row and a revisions-only **Undo AI turn** are reachable in the half-height chat sheet and the Variables tab shows Pi 5 behind it. | Open | |

### ui-059 — Variables panel and bind control: feel and device checks (2026-10-11 03:11)

Scenario 21 and the re-driven scenarios cover the flow on Chromium and WebKit at laptop and by touch
emulation at 390 px. What no emulated drive can judge is below. Firefox cannot launch in this
sandbox, so the e2e spec has not run there at all.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, tap a bind link button and judge the popover bottom sheet: does it cover the field you are binding, and is **Close** reachable one-handed? | Open | |
| 2 | On a real iPad/iPhone, change a choice variable in the Variables row (native wheel picker) and confirm the repair dialog opens above the sheet, not behind it. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 3 | Vector fields (Size X / Y / Z) at 390 px: is the row of three link buttons under the inputs clear about which axis each binds, once one component is a chip? | Issue | 2026-11-14 (`testing-029` panel): A: misleading. B: misleading. No axis letter on the three link buttons, and once X is a chip the Y button sits under the X chip and the Z button under the Y input. Filed `FIND-ui-128`. |
| 4 | **Edit variable** on a chip scrolls its row into view but does not highlight it. Is that discoverable enough on a phone, where the tab also switches? | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. Edit variable switches the tab and scrolls the row but the row has no highlight, outline or animation; the chip menu is clipped at the sheet edge. Filed `FIND-ui-128`. |
| 5 | With an empty scene at phone width there is no sheet tab, so **+** is unreachable until something is placed. Acceptable, or should the tab stay? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 6 | Type a value in a variable's number box and, without pressing Enter, tap **Delete** from its menu: the typed value commits on blur first. Is committing surprising? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### core-050 — What a person should see when a variable goes out of range (feel call for `ui-059`) (2026-10-11 02:06)

Driven by writing a variable's value straight past its own `max` through the document store (the
panel's `setVariable` refuses that before commit, so a person cannot reach it today). All three
bound bodies disappeared from the scene (count 0) and each shows a named broken row. That is
correct by the spec (never guess a value), but whether *every* bound part vanishing at once is the
right on-screen answer, rather than a banner that holds the last good value, is a judgment call
the panel should make with the real UI in front of it.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | In the `ui-059` panel, type a value past a variable's max: is the refusal clear *before* commit, and if a file arrives with such a value, is "3 parts disappeared" explained by name on screen? | Open | 2026-11-14 (`testing-029` panel): A and B could not test it: the Variables panel (390 px) has no min/max field (Name, Kind, Value, Unit only; row menu Rename, Delete), so no refusal-before-commit was reachable. Typing -5 into a bound variable shows a *This change affects 1 item* dialog after commit with `primitive.cuboid: size[0] must be a positive number of millimetres, got -5` (see `FIND-ui-129`). Left Open: the row's premise (a max the panel enforces) needs the owner. |

### core-053 — Export a project that holds a real left-broken row (2026-10-11 00:12)

The fix is proved by unit specs that build the flagged row directly and by a hand-driven Print
re-fold of an ordinary project; no hand-driven run opened a project with a row the user left broken.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Open a project whose History has a row left broken (Open a file that names a missing user part, choose **Leave broken**), then **File ▾ → Export…** at **Print** and again at **Fine**. The export should finish and write the healthy bodies, with no `evaluation-failed` message. | OK | 2026-11-14 (`FIND-testing-019`): production build (`npm run build`, `vite preview`), laptop 1440x900, Chromium and WebKit. No file opens "broken" any more (a missing user part is skipped with "Opened …, but skipped 1 step"), so the row was made the way the app does it: Pi 4 and a cube, Align the cube to the Pi's `avjack` (Y outside), Pi Model set to 5, repair dialog ("This change affects 1 item", default fix `Leave broken`) applied; banner "1 item refers to parts this Pi 5 doesn't have". File ▸ Download copy, then opened that file in a fresh context: 4 steps, 2 bodies, 1 `chip-broken` in History. **Export…** whole scene (2 bodies) at **Print**: `warpcad-scene.stl` 119 484 bytes, 2 388 triangles; at **Fine**: 95 884 bytes, 1 916 triangles, each in 0.9 s. Identical numbers in both engines, no `evaluation-failed`, no error toast, no page errors. |

### ai-011 — The prompt eval harness has never run against a real model (2026-10-10 23:12)

The scorer and runner are proved with the scripted provider (a good transcript scores PASS, a wrong one FAIL on the right check, the key never appears in output). No model has been scored, so no baseline exists and the thresholds are first guesses.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Run `ANTHROPIC_API_KEY=… npm run eval:ai` once (about $1-3 at the default model; `--max-cost` caps it), look at `bench/results/ai/*.md`, and commit it as the **baseline** every later change is compared against | Open | |
| 2 | Calibrate the case thresholds against that first run: the hole volume range (60500-63800), bracket fill (at most 0.85), wing length (100-1500 mm). Are any too tight or too loose to mean anything? | Open | |
| 3 | Check the price table (`bench/ai/score.js`, dated 2026-09-25) against the current model prices before quoting a cost | OK | 2026-11-09: platform.claude.com/docs/en/about-claude/pricing: Opus 5.5 $4 in / $20 out / $0.20 cache hit; Sonnet 5.5 $2 in / $10 out / $0.10 cache hit. Sonnet 5.5 cacheRead was 0.2 and is fixed to 0.1 in `bench/ai/score.js` (and `score.spec.js`). |
| 4 | Product call: the browser-driven runner for scenario 18 (an image needs a canvas, `capture_view` a GPU) is not built. Worth building, or is the live scenario enough? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 5 | Product call: `askedOrAssumed` is a crude text check (a question mark, or the word "assume"). Is it good enough for the ambiguous and under-specified cases, or does it need a stricter test? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ai-010 — Scenarios 17 and 18 have never been run with a real model (2026-10-10 22:14)

The scripted provider proves the **plumbing** of both scenarios (Chromium and WebKit, three viewports, plus a hand-drive at laptop and phone width). It cannot say whether a model makes good choices, and no real key has been used.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Run scenario 17 live** with a real key at laptop and at phone (touch), exactly as `TODO/ACCEPTANCE.md` says, and save the transcript and cost under `bench/results/ai/`. A FAIL recorded as FAIL is a good result | Deferred | 2026-11-07: The model-behaviour half (Claude Code over MCP on the owner's subscription, same tool registry) moved to `FIND-testing-032`; the in-app Assistant with a real key stays here. 2026-11-07: Deferred due to cost. Needs a real Anthropic API key, which bills against purchased tokens, not the Pro subscription. Tool half answered 2026-11-15 (`testing-032`, Claude Code over MCP, not the in-app Assistant; its system prompt differs, so this is evidence about the tools, not the chat panel): `claude -p --model haiku` (claude-haiku-5-5), owner subscription, no key, scratch files. Verbatim sentence on an empty project: run 1 asked for the span in plain text (and stated NACA 2412, 120 mm chord, 220 x 220 x 250 mm bed) and wrote nothing; after *Span 400 mm, go with your assumptions* it built a split wing (sketch, `splitWithJoint`, dowels) plus fuselage, tailplane and fin and ran `check_printability`; the follow-up *make the wing 20% longer* edited the existing wing to 480 mm and re-split it (no second wing). Not a FAIL, with gaps: wing not joined to the fuselage, solid wing, and the printability errors left unfixed (see #3). Laptop vs phone (touch), Undo AI turn, Export, Stop mid-turn and the cost chip need the in-app Assistant and stay open. Cost about $0.08 for three runs. Transcripts `bench/results/ai/2026-11-15-claude-code-over-mcp.md`. |
| 2 | **Run scenario 18 live** with a real key (`e2e/fixtures/drawing-board-85x56.png`): does it read the callouts, set scale first, ask about or flag the connector heights, and give an honest overlay residual? (also `ai-008` VERIFY row 1) | Deferred | 2026-11-07: The model-behaviour half (Claude Code over MCP on the owner's subscription, same tool registry) moved to `FIND-testing-032`; the in-app Assistant with a real key stays here. 2026-11-07: Deferred due to cost. Needs a real Anthropic API key, which bills against purchased tokens, not the Pro subscription. Tool half answered 2026-11-15 (`testing-032`, Claude Code over MCP, not the in-app Assistant; its system prompt differs, so this is evidence about the tools, not the chat panel): `claude -p --model haiku` (claude-haiku-5-5), owner subscription, no key, scratch files. Over MCP the scale, overlay and Save-to-library tools are browser-only, so scale-first, the overlay residual and the Save card are not driveable here and stay open. Read the PNG with `Read`, then built one group (Board, USB-A 1, USB-A 2, Ethernet; 85 x 56 x 1.6 mm, four 2.7 mm holes at 58 x 49) and ran `check_printability`. It said the drawing is a fictional board and modelled it as drawn, and said the group is not in the library. Connector heights: **flagged as an estimate, not asked** (3 mm guessed; the fixture's true heights are 16 and 13.5 mm). No opening dimension table, and no residual claimed. Transcript `bench/results/ai/2026-11-15-claude-code-over-mcp.md`. |
| 3 | Real finding to watch in the live 17 run: the airfoil's default **knife-edge trailing edge is a 0 mm wall**, which `check_printability` flags as unprintable at a 0.4 mm nozzle. Does the real model notice the warning and fix it (blunt trailing edge), or report the wing as printable? Product call: should the airfoil default to a blunt trailing edge? | Deferred | 2026-11-07: The model-behaviour half (Claude Code over MCP on the owner's subscription, same tool registry) moved to `FIND-testing-032`; the in-app Assistant with a real key stays here. 2026-11-07: Deferred due to cost. Needs a real Anthropic API key, which bills against purchased tokens, not the Pro subscription. Tool half answered 2026-11-15 (`testing-032`, Claude Code over MCP, not the in-app Assistant; its system prompt differs, so this is evidence about the tools, not the chat panel): `claude -p --model haiku` (claude-haiku-5-5), owner subscription, no key, scratch files. Noticed and not fixed: `check_printability` returned 6 errors on the wing (five *Wall 0.01 mm* at the trailing edge, and the whole body over the bed). The reply named the sharp trailing edge (about 0.01 mm, under the 0.4 mm nozzle), suggested a 0.4-0.6 mm blunt edge, and listed it under *Still to fix*; it did not call the wing printable and did not blunt the edge itself (the follow-up run left it too). The product call (default to a blunt trailing edge) stays open. Transcript `bench/results/ai/2026-11-15-claude-code-over-mcp.md`. |
| 4 | Product call: transcripts are hand-written, not recorded. Is it worth adding a recorder (save a live run as a transcript) once a live run exists? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ai-009 — MCP server and the disk-change prompt: what only a real client and real devices can show (2026-10-10 21:18)

The server is covered by Node integration specs, a two-engine e2e at three viewports and a raw-protocol hand-drive; a real Claude Code session and the non-Chromium engines are not.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | In **Claude Code**, run `claude mcp add warpcad -- node mcp/server.js <file>` and say *add a 3 mm base plate under the bracket*: does it pick the right tools, fill `request`, and report the appended rows? | OK | 2026-11-14 (`FIND-testing-022`): Claude Code 2.1.322 headless, `claude -p --model haiku` (claude-haiku-5-5), owner subscription, no API key, scratch `bracket.ndjson` (an L-bracket Claude had built, 8 lines). *add a 3 mm base plate under the bracket*: record_prompt, describe_scene, describe_body x3, get_timeline, apply_records (one bad-field refusal retried), create, check_clearance, operate union, operate subtract, check_printability, measure, record_response. `request` was filled on every write with the user words; the file grew to 13 lines; final one body 30 x 20 x 33 mm, bolt hole kept. It reported sizes and the hole, but did not list the appended History rows by name. |
| 2 | Product call: **hosted references** (`github:owner/repo/path`, read-only, writes with `WARPCAD_GITHUB_TOKEN`) are deferred. Build them as a follow-up? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 3 | Product call: Safari, Firefox and phones get **no** change prompt (no file handle). Is "re-Open the file" acceptable, or should the app say *this file may have changed* on focus? | N/A | Closed 2026-11-01 (testing-005): answered by `TODO/done/io-012-warn-on-focus-when-file-may-have-changed.md` (focus warning without a file handle) and `TODO/done/io-010-disk-file-auto-merge.md` (File ▾ → Merge file…). |
| 4 | Product call: limits are per tool call over MCP, not per user turn. Acceptable, or add a session-level cap? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 5 | Product call: the optional `request` field on write tools is how intent travels over MCP. Right design? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 6 | Wording: an origin this build does not write reads *via another program*. Right words? | Issue | 2026-11-14 (`testing-029` panel): A: misleading. B: unclear. 'via another program' asserts a program acted when the origin is only unrecognised. Judged from the string. Filed `FIND-ai-039`. |
| 7 | Release note: Save in native mode now re-reads the file first, so an outside edit is never silently overwritten | N/A | Closed 2026-11-01 (testing-005): superseded by `TODO/done/io-010-disk-file-auto-merge.md`; in-place Save now merges the changed file first (CLAUDE.md, AI Partner). |

### ai-008 — Drawing to library group: what only a real model and a real phone can show (2026-10-10 19:46)

Scale, build, overlay and Save-confirm are covered by unit specs, a scripted-provider e2e on two engines at three viewports, and a hand-drive; the model's judgement and the devices are not.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Run scenario 18 with a **real key**: does the model read the callouts into a table, set scale before building, and **ask about or flag** the connector heights instead of stating them? Read the residual it reports against the overlay yourself | Deferred | 2026-11-07: The model-behaviour half (Claude Code over MCP on the owner's subscription, same tool registry) moved to `FIND-testing-032`; the in-app Assistant with a real key stays here. 2026-11-07: Deferred due to cost. Needs a real Anthropic API key, which bills against purchased tokens, not the Pro subscription. Tool half answered, same run as `ai-010` #2 (2026-11-15 (`testing-032`, Claude Code over MCP, not the in-app Assistant; its system prompt differs, so this is evidence about the tools, not the chat panel): `claude -p --model haiku` (claude-haiku-5-5), owner subscription, no key, scratch files. ): the callouts came out in the reply prose, not a table; scale could not be set over MCP; the connector height was flagged as an estimate, not asked; no overlay residual existed to read, and it did not claim a match. The in-app half (table, scale first, a real residual) needs the Assistant and a key. Transcript `bench/results/ai/2026-11-15-claude-code-over-mcp.md`. |
| 2 | Real iPhone: **Attach** opens the camera / photo picker, the phone half sheet shows the Confirm card without scrolling, the overlay thumbnail is legible | Open | |
| 3 | Product call: the overlay draws the model at 0.55 opacity with the grid hidden. Is that the right look for judging a match? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 4 | Product call: a **cancelled turn keeps the scale it set** for the rest of the session (the project itself is untouched). Acceptable, or should a cancel forget it? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 5 | Product call: if you send a new message while a Save proposal is pinned, the proposal stays until Confirm or Not now. Should a new message dismiss it? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 6 | Wording: *Image sent to Anthropic with your request, using your key. It is not sent anywhere else.* Right words? | Open | 2026-11-14 (`testing-029` panel): Panel disagrees. A: unclear ('your key' undefined, the cost is implied; propose 'billed to your own Anthropic API key'). B: clear, with the same gap. For the owner. Judged from the string. |

### core-054 — Saving a group as a user part drops its user colour overrides (2026-10-10 19:05)

The whole-body colour was hand-driven end to end on Chromium and WebKit (it is in the `core-054` Step 6 record). A per-part colour with partial opacity is covered by a unit spec only and was not driven through the Inspector's drilled-in Color control.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Place a Cube and Cylinder, group them, drill into *Cylinder 1* and set a colour on that part alone, **Save to library…**, File > New and drag the part in. The Cylinder should draw in that colour and the Cube in the default one. | OK | 2026-11-14 (`FIND-testing-019`): production build (`npm run build`, `vite preview`), laptop 1440x900, Chromium. Cube and Cylinder dropped, grouped, drilled into `Cylinder 1`, colour `#ff0000` typed into its Color control (breadcrumb `Objects ▸ Group 1 ▸ Cylinder 1`; the Group row's own colour still reads Default). **Save to library…** as `Coloured pair` (My parts 1), File ▸ New (Replace), dragged the part in: the cylinder draws red and the cube in the default blue. Canvas pixels with a strong red: 14 748 before the save and 14 760 after the drop. No page errors. |

### testing-003 — print-prep drag and hidden-parts overlay under full-suite load (2026-10-10 17:10)

The cause was never reproduced, so the fix is two spec synchronization changes verified by two clean full runs, not by a proven root cause. What only more runs can settle:

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Over the next several full e2e runs, watch `print-prep.e2e.js` ("the hand recipe", `toBeCloseTo(120, 0)`) and `inspector-hidden-parts.e2e.js` ("toggling Show hidden parts…"). A third red on either means the race is elsewhere (e.g. the camera settling in `Viewport.vue`, not the spec) and `testing-003` should be reopened with the failing project named. | OK | 2026-11-15 (`FIND-testing-025`). The stored result (`.todo-progress/_runs.json`) keeps only the latest run, so the count comes from the written run records (`TODO/BUDGET.md`, `TODO/ROADMAP-DONE.md` completion log, `TODO/done/render-007-*.md`). `print-prep` "the hand recipe" (120 vs 122): red in the `io-007` run and at filing (`ui-055`, 2026-10-10 05:07); no red recorded since `c0e11f3` (a Haiku report of one on 2026-10-10 read a stale log). `inspector-hidden-parts` "toggling Show hidden parts..." (`:232`): red 2026-10-10 05:07 (filing), 2026-10-10 18:37 (`core-054` re-run, load average 38-52), 2026-10-16 05:50 (`core-040`, passes alone 36/36), 2026-10-30 (full matrix, Firefox phone-sized canvas, 120 changed pixels, the `render-007` finding). That is more than a third red, so the row's trigger fired; it was already acted on: `render-007` (closed 2026-11-03) found the race was elsewhere (the gizmo Z-arm `drop-shadow` Firefox keeps painting under the snapshot's `visibility:hidden`) and fixed the snapshot helper in `e2e/inspector-hidden-parts.e2e.js` (`ed9a6a0`). No red on either test is recorded since 2026-11-03, including the 2026-11-14 pair runs. `testing-003` was therefore not reopened: a reopen would duplicate `render-007`. The stored per-run history is not kept anywhere, so only runs the logs name are counted. |

### ui-055 — Save to library and My parts (2026-10-10 07:30)

Reachability, the example flow, three viewports and three engines are covered by `e2e/user-library.e2e.js` and the Step 6 drive; what is left is feel on real hardware.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, drag a My parts row (including a long press on the thumbnail) into the view; the page must not scroll or select the image, and the Inspector tab must not sit over the last Library row. | Open | |
| 2 | Judge whether the 96 px thumbnail (flat-shaded, fixed three-quarter view) reads well enough at row size for a thin part such as a plate or a ring. | OK | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Premise changed: the My parts rail tile draws the thumbnail at 32x32 CSS px (DOM `library-thumb-user.plate`, `.ring`), not 96 px; I saved a 40x40x3 plate and a tube named Plate and Ring (`h3b.mjs thumbs`) and looked at the rail in both themes. Both agents agree: the Ring reads as a tube with a hole and the Plate as a thin flat slab, dark and light. Shots `panel2/myparts-*.png`. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |
| 3 | On iPad, open the ⋯ menu on the bottom-most My parts row: popover position and tap size. | OK | 2026-11-15 (testing-031): OK. Tablet 820x1180, three My parts rows; the bottom-most tile sits at y 1236 (below the 1180 fold, so the rail scrolls). Its pop-out is 260x93 at y 1079, the menu button 44x46, and the menu opens upward as 200x234 at y 938-1172, entirely inside the viewport, with Rename, Duplicate, Export and Delete each 178x44 and reachable at their centres. Threshold: menu inside the viewport, items >= 44 px, none covered: met. |

### core-037 — User-defined library parts (2026-10-10 04:19)

No control exists yet (`ui-055`), so the new capability was driven through the page's own modules, on Chromium and WebKit at laptop width only. Touch devices and Firefox were not driven.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone or iPad (Safari): open a `.ndjson` saved with a user part (its state line carries `parts`; the part can be made on a laptop from the console) from Files. The part instance renders, survives a reload (autosave restore) and the console shows no error. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |

### io-007 — Print prep: split, joint and Print pieces (2026-10-10 03:16)

Geometry, the fit verdicts, the zip and the closed-manifold checks are covered by unit specs and `e2e/print-prep.e2e.js`, and acceptance 4 and 11 were re-driven. What only a printer or a person's eye can settle is below.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Print the tongue-and-groove wing halves (and a pins-and-sockets pair on a thicker bar) with the default 0.2 mm clearance and see whether they press together. There is no printer-tolerance setting, so 0.2 mm is a guess for a typical FDM printer. | Open | |
| 2 | Both halves of a tongue-and-groove split are flagged "may need supports" in the Export popover (the tongue's underside is a downward face). Slice one and judge whether that flag is noise or real. | OK | 2026-11-15 (testing-031): OK, the flag is real. Wing 300x40x12 split on X at offset 150, tongue and groove, clearance 0.2, exported through Print pieces (wing-a.stl 160x40x12 and wing-b.stl 150x40x12, 44 triangles each, both flagged may need supports). CuraEngine 5.13.0 (stock Ultimaker Original definition, 0.1 mm layers, support everywhere, default overhang angle, extra settings the app front end normally computes passed with -s): support off writes 0 mm of support filament for both; support on writes 499.7 mm for wing-a (7.9 % of non-skirt filament, from layer 0) and 635.5 mm for wing-b (9.9 %, from layer 35). Threshold: non-zero support volume: met. Printing them stays with io-007 #1. |
| 3 | On a real phone, drag the cut-plane handle with a finger while the Split sheet is open. A trusted-touch drive in emulation passed after two fixes (sheet no longer buries the handle, a cancelled touch no longer throws the plane away), but only hardware shows whether a thumb can reach the handle and the sheet's fields comfortably. | Open | |
| 4 | The cut plane is the body's cross-section at the cut, so on a long thin bar it is a small slot behind the gizmo (docs `split-sheet.png`). Decide whether it needs a larger or brighter plane. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### sketch-008 — Curve helpers and a lofted wing (2026-10-09 21:10)

The drive covered function and layout; two things are judgment calls it cannot make.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Print the docs' wing panel (2412, 120 mm to 70 mm, Offset X 30, Twist -2, 200 mm span) and judge whether the sweep and washout look right; also whether twisting about the leading edge (the slice origin) is the pivot a wing designer expects, or the quarter-chord would feel better | Open | |
| 2 | On a real laptop (900 px tall) the Slices card is now taller, so **Add image…** and **Set scale** sit below its fold and need a scroll inside the card. Decide whether Offset X/Y and Twist should sit on one compact row | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ai-007 — AI vision and measurement tools (2026-10-09 19:36)

The capture and checks are covered by unit specs and `e2e/ai-capture.e2e.js` (non-blank PNG, no camera change, no flash, three viewports). What no assertion can judge is below.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Grid lines nearly vanish in a `capture_view` PNG after the 2x downscale. Does a captured view still read well enough for a person to tell what the model saw? | Open | 2026-11-14 (`testing-029` panel): Not answered: the panel needs a real `capture_view` PNG and the `warpcad` MCP server did not connect in this run (no live bridge, no key), so no capture could be shown to fresh readers. |
| 2 | Per-part recipe colours inside a group (a Bolt's head and thread) are not drawn in captures, only the body colour. Judge whether the thumbnail is misleading on a composite. | Open | 2026-11-14 (`testing-029` panel): Not answered, same reason as #1: no `capture_view` PNG could be produced for the readers. |
| 3 | `check_clearance` over-reads slightly where two edges cross at the closest point (documented). Compare against a real Pi-and-case gap you can measure by hand. | Open | |

### ai-006 — Assistant chat panel (2026-10-09 16:40)

The on-screen-keyboard lift uses `window.visualViewport`, which desktop browsers and Playwright emulation never shrink, so no script here can exercise it. Everything else about the chat is covered by `e2e/ai-chat.e2e.js` and acceptance scenarios 1 and 7.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone and iPad (Safari), tap the chat box with the sheet at **Half**: the composer and **Send** stay visible above the keyboard, and the sheet is not pushed off the top of the screen | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 2 | On a phone, **Attach image** offers the camera as well as the photo library, and a photo taken there arrives as a thumbnail | Open | |

### ai-004 — The Assistant key sheet and CSP on real phone and tablet hardware (2026-10-09 08:57)

Scenarios 1 and 10 were driven by hand and the three-viewport, two-engine e2e matrix passes, but none of it ran on a physical phone or on Firefox (it cannot launch in this sandbox). Only what a real device can show is listed.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, press-and-hold in **API key** and choose **Paste** from the system menu; the Save and test button enables and the sheet does not scroll sideways | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 2 | On a real iPhone and iPad (Safari), save a key, close the tab, reopen the next day: still **Connected**, or it falls back to the key sheet rather than a broken panel (Safari can evict IndexedDB) | Open | |
| 3 | With a **real** key (not a stub), **Save and test** reads *Connected*; a deliberately wrong key reads the "rejected" message and the CSP does not block `api.anthropic.com` in Firefox | Deferred | 2026-11-07: Deferred due to cost. Needs a real Anthropic API key, which bills against purchased tokens, not the Pro subscription. |
| 4 | Product call: the Assistant button sits in the header at every width and the saved-key dot is a hollow ring until a test this visit. Is "saved, not yet checked" clear enough, or should the app test once on open? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ai-003 — Project settings and design intent on real phone and tablet hardware (2026-10-06 17:11)

Headless WebKit at 390x844 and 820x1180 drove the dialog, the History note icon and the Inspector **Why** line (scenarios 8, 10, 12), but it has no on-screen keyboard and none of iOS Safari's storage eviction. These three need a real device.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | iPhone (Safari): **File ▾ → Project settings…**. The field takes focus on open; does the keyboard come up, and do the field, the character count and **Save** stay visible above it while typing several lines? | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 2 | iPhone or iPad (Safari): open a file with standing instructions, press **Use this project's instructions**, then come back after more than 7 days without using the site. Safari may clear `localStorage`, so the "came with this project" note can reappear. Confirm that's the only effect (the instructions themselves are kept). | Open | |
| 3 | Any device: in History, is the small note icon at the end of a row recognisable as "why this step exists" without its tooltip (touch has no hover)? A feel judgement. | Open | 2026-11-14 (`testing-029` panel): A and B found no note icon: steps made by hand carry none (the row's chips area is empty), so 'why this step exists' could not be judged. Needs a step with design intent (an Assistant or MCP step); not driven without a key. |

### ai-002 — AI tool registry schemas against the live Messages API (2026-10-06 16:14)

The registry's schemas were checked only locally: closed subset, every object closed with a `required` list, no strict-unsupported keyword after `toStrictWire`. Nothing here sent them to the API, because there is no key and no network in the tool path. Strict mode has schema-complexity limits, and `create`/`operate` carry large `anyOf`s. Measured locally, the `ai` tool list serialises to 37,750 bytes (about 11k tokens by a chars/3.5 estimate), and `apply_records` is 17,914 of those because it embeds the `create` and `operate` schemas again. Do this the first time a key is available: during `ai-004`/`ai-005`, or at the latest in `ai-010`'s live run.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Send `createToolRegistry().definitions('ai')` as `tools`, each `{ name, description, input_schema: toStrictWire(inputSchema), strict: true }`, to `claude-opus-5-5`. The request is accepted (no 400 on schema size or complexity), and a "place a 20 mm cube at the origin" prompt produces a schema-valid `create` call. | Open | |
| 2 | Measure the real tool-list size with `count_tokens`. If `apply_records`' duplicated schemas cost too much, decide (with `ai-011`) whether to drop it or slim its step schema. | Open | |

### core-052 — bolt/nut/washer tables (2026-10-06 14:59)

Metric nut rows have no V1 source (ISO 4032 from memory of the standard, not a fetched table), and the Spec list is now one flat 45-item `<select>`.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Spot-check the ISO 4032 nut rows in `nut-specs.js` (m1.6-m20: across flats, corners, height) against a published table | OK | 2026-11-09: m1.6-m20 s, e min, m max match two published tables (royasutton.github.io omdl ISO 4032 database; torqbolt.com ISO 4032 table). Only M14 e differs: omdl 23.35, torqbolt 23.36; kept 23.36. No change. |
| 2 | Is the flat 45-entry Spec list usable on a phone, or does it want `<optgroup>`s? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### sketch-004 — Auto-trace a photographed part to scale (2026-10-06 01:56)

Scenario 20 (now with Auto-trace), 1, 8, 9 and 11 were driven by hand on laptop Chromium, plus scenario 20 on WebKit and Firefox and a phone pass with trusted touch only. All passed: the fixture bracket traced to within 0.4 mm on every engine, and the saved photo carried no EXIF/GPS. Everything here is a real photo, a real device, or a judgment call the fixture and the drive could not settle. The gist round-trip was not driven (no token), so it stays here rather than being claimed.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Real phone photo, start to finish (scenario 20 with a real object):** photograph a ~100 mm part beside a ruler from straight above, load it, Set scale, Auto-trace, clean up, Linear to its thickness, Done, then measure the body's width in the Inspector against the object (expect within 1 mm). Then **Share via gist and load it in a second browser**: the photo and its scale come back. The fixture is a flat-shaded JPEG; a real photo has shadows, glare and uneven light. | Open | |
| 2 | **Trace quality on a real photo:** does a tap inside the part follow its edge, or does the shadow join the part (outline too big on one side) or a glare patch split it? Try **Adjust → Threshold** off Auto and nudge it: does the outline re-trace in place to something better, and is the *Auto (n)* readout useful as a starting point? Is the default **Tolerance 0.5 mm** a good balance between point count and fidelity for a printed replacement? | Open | |
| 3 | **Phone, after Finish:** the Sketch toolbar's two rows come back over the top of the canvas (to y 223 at 390 × 844), and the traced Solid's top points can sit under them, next to **Cancel**. In the drive a finger aimed at a top point pressed Cancel and **discarded the whole traced draft in one tap**. Related to sketch-003 row 4 (the laptop's growing toolbar). Decide whether Finish should frame the traced outline clear of the toolbar, or whether Cancel should ask before discarding traced outlines. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 4 | **Phone, Inspector sheet open while Auto-trace or Set scale is armed:** the Slices sheet steps aside (77 % reachable canvas), but an Inspector sheet that was already expanded stays up and cuts the reachable canvas to **56 %**, under the 69 % floor. The drive got there by a stray gesture, so judge on a real phone whether people actually land in this state and, if so, whether arming an image tool should fold the Inspector sheet as well. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### sketch-003 — Sketch reference image: load a photo, set its scale, sanitize it (2026-10-04 16:40)

Scenario 20 (new), 8 (with the hostile fixture), 9, 10 and 1 were driven by hand on laptop Chromium, WebKit and Firefox, with a phone pass using trusted touch, and the traced fixture came out within 0.7 mm of its true 120 × 100 mm. What no headless drive can settle is a real iPhone's camera and photo handling, plus three defaults this unattended run chose without asking.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Real iPhone, Safari:** Slices → **Add image…** offers both camera and library. A photo from each (iOS default format) arrives as a JPEG and appears under the grid. If iOS hands over HEIC, the message must read *Choose a JPEG or PNG — iPhone HEIC photos can be exported as JPEG*. Also try a 48 MP shot (iPhone 14 Pro and later): it is refused as over 40 MP. Is that acceptable, or should import downscale anything up to 8192 px instead? | Open | 2026-11-07: The photo-library, HEIC and 48 MP half, in the iOS Simulator moved to `FIND-testing-027`; the camera half and the downscale decision stay here. |
| 2 | **UNCONFIRMED default:** on a phone and tablet, the Slices sheet **disappears completely** while Set scale is armed (the spec said "collapses to its header"; the header alone measured 67 % reachable canvas against the 69 % floor, 77 % without it), and the length field sits in the top banner at every size (the spec said "next to the line on desktop"). On a real phone, is it clear where the panel went, and is the banner's length entry comfortable with the keyboard up? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 3 | **UNCONFIRMED default:** the photo is its own row in History (*Reference image 1400 × 1000 px*), cannot be edited there, and suppressing it hides the photo (its slice says *switched off in History*). Is a separate row acceptable, or should photo rows be hidden from History? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 4 | Pre-existing, found by the drive: at laptop size, once a Line chain is live the Sketch toolbar grows a Finish / Undo-point row that covers the top ~50 px of the canvas, so a photo's top edge (or anything drawn there) cannot be clicked until you zoom or pan. Decide whether the toolbar should grow sideways, or the editor should open with the origin lower in the view. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 5 | Feel, light and dark mode: is the photo readable under the grid at the default 50 % opacity, and is the *Not to scale* / *1 px = 0.2 mm* badge under its bottom-left corner noticeable without hiding the photo? | OK | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Sketch editor with the e2e bracket photo added (`h2.mjs`), 1440x900 DPR 2. Measured: photo ink against its paper 4.08:1 dark, 2.87:1 light (50% overlay); the 'Not to scale' badge (11 px, 75x15 px) text vs its pill 6.5:1 dark, 10.7:1 light, badge pill vs ground 2.2:1 dark, 1.6:1 light. Panels A and B agree: readable under the grid in dark; in light the photo is pale and its extent fades into the background but the grid and the part are visible; the badge sits just under the photo's bottom-left corner, noticeable, hiding nothing. Agree it is readable, so OK, with the light photo's weak edge noted. Shots `shots/H2-*-photo.png`. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |

### docs-019 — Getting-started page and README tour GIF (2026-10-04 15:25)

The tour spec asserts every step's end state, the guard confirms the README and page embed `tour.gif` (1.31 MB, 17 s, 640 px), and scenarios 1, 4 and 11 were driven by hand. What no assertion can judge is whether the clip reads well to someone who has never seen the app.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Watch `docs/media/tour.gif` at the size GitHub shows it in `README.md`: is each step (drop, select, Subtract, nudge, export) on screen long enough to follow, and is the hole readable at 640 px wide? | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. Each step is ~3 s on screen, but neither could see the hole in the result at 640 px and the Subtract press falls between sampled frames. Filed `FIND-docs-036`. |

### sketch-007 — Snap new outlines to existing ones (2026-10-03 21:54)

Scenarios 9 and 1 and the closed repros passed by hand on all three engines and with trusted touch. The snapped geometry is exact (unit tests to 1e-9; e2e reads the Inspector numbers). What a script cannot judge is whether the pull feels right, so these are left for a person, the first one on a real phone.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Is 12 px the right pull?** At the editor's opening zoom that is ~5 mm. Draw the docs' tube on a real phone without Shift (an r20 circle, then an r15 one from the same centre): the second circle's rim jumps onto the first (*Quadrant* / *On edge*) until you release ~1 mm further in, or tap **Snap** off. Decide: keep 12 px; go smaller (8-10 px); or stop a Circle's rim snapping to a circle it shares a centre with | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | On a real phone, draw a circle with its centre on a rectangle's corner. The marker (lifted 56 px above the finger, with a leader line) shows only while the finger is within ~12 px of the corner. Once the drag carries it further, only the dashed preview, centred on the corner, says the centre snapped. Is that enough confirmation, or should the centre keep a marker for the whole drag? | Open | |
| 3 | On a laptop, hold Shift mid-drag and release it: the point jumps between free and snapped with no pointer movement. Does that read as intended or as jitter? | OK | 2026-11-15 (testing-031): OK. Laptop 1440x900 mouse, Line chain, pointer held 3, 6 and 10 px from an existing vertex, Shift toggled on the next pointer event. The point jumps by exactly the pointer-to-vertex distance (3.4, 6.0 and 9.5 px; 1.4, 2.5 and 3.9 mm at 0.41 mm per px), never more than the 14 px snap radius, nothing at 13 px or more (no snap there), and Shift released returns to the snapped point exactly (239.53 mm both times). The jump needs a pointer event after the key change; the key alone moves nothing. Threshold: jump <= the snap radius and exact return: met. |

### sketch-006 — Continuous Line tool (2026-10-03 20:50)

The scenarios and the closed repros passed by hand (laptop mouse, phone and tablet trusted touch). What a scripted drive cannot judge is timing and feel on a real finger, so these three are left for a person on a real phone or iPad.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone, draw a triangle with four slow taps (the fourth on the first point). A tap within about half a second of a closing tap is swallowed (so a double-tap close does not start a new line): confirm a normal-speed next tap is never eaten, and that a tap on the first point closes it without needing to be pixel-exact (14 px tolerance) | Issue | 2026-11-15 (testing-031): Issue, filed as sketch-009. Production build of the working tree as it stood (Vite build, preview server), Chromium touch emulation (hasTouch, isMobile, DPR 2) at the row viewport unless noted; fingertip taps scattered Gaussian sigma 3.5 mm = 13.2 CSS px with bench/tap-scatter.mjs. The 450 ms swallow window measured exactly: a next tap 100-440 ms after the closing tap was swallowed, 480-1000 ms was never eaten, and five taps on distinct points 80-350 ms apart were all kept (0 eaten). Closing without being pixel-exact: 100 closing taps at sigma 3.5 mm closed the outline 45 % of the time (55 % added a sliver fourth point; 40 % of taps fell inside the 14 px tolerance). Threshold: >= 95 % closure; that needs a radius of about 32 px on touch. |
| 2 | Double-tap the last point to finish the line, on a real touch screen: does it feel natural, or do you reach for **Finish**? (A double-tap adds the point on the first tap, then finishes on the second.) | Open | |
| 3 | Esc-twice to cancel a line (a second Esc within 0.9 s of the one that finished it) has no on-screen cue. Decide whether it needs a toast ("Line discarded") or whether **Undo point** is enough | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### docs-015 — Docs media for the History panel, rollback, step editing, undo and redo (2026-10-03 16:35)

Scenario 12 and 1, and the `data-003` and `ui-044` repros, were driven by hand and passed. Driving them turned up three product questions that are not covered by an acceptance scenario and that this docs task deliberately did not touch (nothing under `src/` changed).

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | The header's Undo / Redo / History cluster is right-aligned, so it shifts about 27 px left when the save chip changes from `Saving…` to `Saved · hh:mm` (about 1 s after every edit). Clicking Undo during that second can land on the neighbouring button or the gap, and nothing happens. Judge whether a fixed-width save chip is wanted. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | Scenario 12 step 12 cannot be driven as written: Fillet Top (+Z) 4 on a cube that already has a 5 mm top chamfer is refused in the Fillet popover with an engineering message (`modify.filletRim: the solid is not prismatic over the rim band ... see the core-003 addendum in docs/decisions/geometry-kernel.md`). Decide whether that refusal text should be user-facing wording, and rewrite step 12 against a dependency that can exist (editing the cube smaller than the chamfer does produce the named `broken` refusal). | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 3 | The History dock is a fixed ~220 px at laptop width, so a five-step model needs scrolling and an open Edit form is cramped. Judge whether it should be taller or resizable. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### docs-014 — Docs media for Hardware, kit and Pi library parts, BOM and Resolution (2026-10-03 15:50)

The stills and movies are asserted, and scenarios 1, 2, 3 and 5 were driven by hand. What is left is two product questions the capture turned up and three readability checks. The Bolt and BOM GIFs run 10.7 to 10.9 s against the 12 s budget.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | The Library has no Screw row (`hardware.screw` has no `ui` block), so a user cannot place a screw at all; `docs/hardware-library.md` says so. Decide whether to file the row (`registry.js` already names the defaults `m4`, 12, `PanHead`). | N/A | 2026-11-13 (`FIND-testing-021`): overtaken by `core-060`. Drove the production build at 1440x900: the Library's Hardware section has one **Bolt / screw** row with a **Type** list (Socket cap, Hex head, Pan head, Flat head, two Wood screws) and a **Size** list per Type. Dragged a Socket cap `m3` into the view with the mouse; it landed selected, Bill of materials read `Bolt / screw M3 socket × 20 mm`. `docs/hardware-library.md` no longer says there is no Screw row. |
| 2 | Subtract with a Pi's `hole1` consumed the Pi along with the plate, so each extra hole needed another Pi. Decided 2026-10-17: the tool part survives (`core-064`, see the entry at the end of this file). | Decided | |
| 3 | Read `rpi-keepout.png` cold: the keep-out is a small 15 x 10 x 1 mm block by the display's power connector. Does the page make that clear, or does it read as a stray red box? | Open | 2026-11-14 (`testing-029` panel): Panel disagrees. A: clear (the inspector names noGoPower, page text explains it). B: unclear (the block has no label; 'Show hidden parts' is not in the screenshot). For the owner. |
| 4 | Look at `resolution-low-vs-high.png`: is the Draft facet edge visible at the size it appears on the page? | OK | 2026-11-14 (`testing-029` panel): A: clear. B: clear. The Draft facets are visible as straight segments against the Print circle. |
| 5 | Read the new page's M12 example as someone who wants "an M3 screw": does it say clearly that the smallest metric bolt or screw is M4? | N/A | 2026-11-13 (`FIND-testing-021`): the premise is false since `core-060` / `ui-068`. Drove the Type list: Socket cap offers `m1.6` to `m20`, Flat head `m2` to `m10`; only Pan head is `m4` alone. The page's M12 example no longer says M4 is the smallest, and its Pan head row states `m4` only. |

### docs-013 — Docs media for Fillet, Chamfer, Enlarge, Fit and Bisect (2026-10-03 15:22)

The movies and stills are asserted, and scenario 1 plus the `core-021`/`core-022` repros were driven by hand. What is left is one product question the capture turned up and two readability checks. The fillet, chamfer and Fit GIFs run 10.5 to 11.1 s against the 12 s budget.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Enlarge and Fit do not carry snapped parts with them: with a lug snapped to a plate's top, Enlarge Z +16 (and Fit Z 24) moved the plate's top to 16 and left the lug at Z 8, buried in the plate; typing the same size in the Inspector's Size field moves the lug up with it (`data-007`). `docs/resize-bisect.md` now says so and points to the Inspector. Decide whether Enlarge/Fit should follow too (a finding to file) or the page note is enough. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | Read `resize-fit.gif` and the Fit example cold: Keep aspect ratio applies the smallest ratio to all three axes, so X 60 to 30 takes Y and Z from 40 to 20. Does the second step read as "keeps its proportions", or does it look like Fit ignored the box? | Open | 2026-11-14 (`testing-029` panel): Panel disagrees. A: clear (the final frame shows 30 x 20 x 20). B: unclear (Y and Z still show 40 until Fit is pressed, and the page never states the result). Both suggest adding the resulting size to the text. For the owner. |
| 3 | `fillet-vs-chamfer.png` is orbited to about 71 degrees elevation so both rims show. Is the rounded rim on the left readable as a fillet at the size it appears on the page? | OK | 2026-11-14 (`testing-029` panel): A: clear. B: clear. The rounded rim reads as a soft band against the crisp bevel, though only by shading; a tighter crop would help. |

### docs-012 — Docs media for Group, Snap, Align and Mirror (2026-10-03 14:52)

The movies and stills are asserted and scenarios 3, 6 and 16 were driven by hand, so what is left is judgment and one product question the capture turned up. The two Snap/Align GIFs sit at about 10.5 to 11 s, close to the 12 s budget.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Group drops a body's own colour: two cubes recoloured red and blue lose both colours when grouped (`data-body-color` and `data-body-part-colors` empty on the group, rendered default blue), while a composite's recipe colours survive. `docs/groups.md` therefore compares Group and Union by what you can open, not by colour. Decide whether a user recolour should carry into the group (a bug to file) or is intended. | N/A | 2026-11-13 (`FIND-testing-021`): the fact is no longer true, so the decision is moot. Coloured one Cube red and one green in the Inspector, selected both, pressed **Group**: the group draws one red and one green Cube. `docs/groups.md` already says *A colour you gave a shape stays on it*. Overtaken by `data-005` and `core-054`. |
| 2 | Read `snap-operation.gif` and the new "Outside +/−" wording in `docs/snap-align.md` cold: the popover's sign names the moving shape's touching side, so `Outside −` puts the lug on the plate's +X side, which reads backwards at first. Is the explanation clear, or should the popover labels change? | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. The on-screen buttons are headed 'out / in / half / ctr' with − and + at the ends; the page and footer say 'outside +' and 'X outside −'. Filed `FIND-docs-036`. |
| 3 | `snap-subpart-operand.gif` uses Align on X and Y against the Pi's `hole1` (a Snap orientation cannot centre a 5.7 mm screw on a 3.25 mm hole). Does a viewer still read it as "the sub-part is the operand"? | OK | 2026-11-14 (`testing-029` panel): A: clear. B: clear. The panel reads *Aligning Screw 1 to Raspberry Pi 1 › hole1* and the screw moves to the hole. |

### docs-011 — Docs media for the booleans page (2026-10-03 14:12)

The movies and stills are asserted, and scenarios 4 and 5 were driven by hand, so what is left is a judgment call on how they read. Three of the GIFs (`boolean-subtract-order`, `boolean-union`, `boolean-subtract`) sit at 10 to 11.5 s, close to the 12 s budget.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Watch `docs/media/boolean-subtract-order.gif` and `boolean-subpart-operand.gif` once as a stranger: is it clear which solid is the base, and that the two orders give different results? | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. The base is named only in small grey text; the two results are never side by side and unlabelled. Filed `FIND-docs-036`. |

### sketch-002 — Sketch vertex editing: move, add, delete points, Simplify, Convert to outline (2026-10-03 02:35)

Every functional path (Convert, point drag, midpoint-dot insert, tap-to-pick, Delete vertex and its 3-point refusal, Delete/Backspace, Simplify, Cancel/Done/Undo) was driven by hand on Chromium/WebKit/Firefox laptop and phone Chromium touch, and is in the 9-way e2e. What is left is feel on real hardware, one design judgment the drive surfaced, and the same zero-slack margin sketch-005 logged.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone and iPad (Safari): drag a corner dot and an edge's hollow midpoint dot with a finger. Does the 44 px target feel right, and can you still see the point you are moving under your fingertip? (WebKit trusted touch *drags* can't be automated here; only Chromium touch was driven.) | Open | |
| 2 | Dense outline under Select: convert a ~20 mm circle at normal zoom (32 dots ~10 px apart). A press anywhere near the line grabs the nearest dot, so a near-miss *inside* the ring pulled a neighbouring point inward and briefly made the outline cross itself (WebKit drive; the status said so and Simplify fixed it). Judge whether that is acceptable or whether the targets should shrink on dense outlines. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 3 | Phone 390 px: with a point picked the status line wraps to two lines (*… 3 points · point 1 selected*), the toolbar is 178 px tall, and reachable canvas still measured exactly 69 % (the ui-020 #3 floor, no slack). Decide whether to shorten the text (e.g. *· pt 1*) before the next toolbar addition. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### sketch-005 — Sketch editor: select, edit, delete an outline (2026-10-03 01:38)

The functional paths (pick, hover, status, Hole, toolbar Delete, Delete/Backspace, Cancel/Done) were driven by hand and in the 9-way e2e. What is left is feel and one measured margin.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, with the Select tool armed, is the picked outline's thicker accent-colour stroke easy to tell from the others in daylight, and is the "Circle, Solid — 15 mm radius" line readable without opening the Inspector? (The stroke is only ~1 px thicker than an unpicked one.) | Open | |
| 2 | On a real phone, does the three-row Sketch toolbar (Select, tools / Hole, Delete, Slices, Extrude / Done, Cancel) leave enough canvas to draw comfortably? The resting reachable canvas measured exactly 69 % (the ui-020 #3 floor), down from 76 %. If it feels cramped, consider moving Slices/Extrude into a menu. | Open | |

### docs-006 — Docs movie pipeline (2026-10-02 21:05)

The pilot GIF passed its budget and frame checks; whether it reads well to a person is a judgment call.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Open `docs/media/primitive-drag-cube.gif`: is the yellow cursor dot easy to follow, and is the drag pace and 1.5 s end hold comfortable? | OK | 2026-11-14 (`testing-029` panel): A: clear. B: clear. The yellow dot is easy to follow; the pace and 1.5 s hold are comfortable (judged from timestamps of sampled frames). |

### sketch-001 — Sketch primitive: draw outlines, extrude to a solid (2026-10-02 19:20)

The run was unattended, so the interaction-model answers this task was told to confirm with
the user first were **not** confirmed: rows 1-7 are those decisions, each a yes/no for the
user (status `Open` until answered; say `Issue` and file a TODO to change one). Rows 8-11 are
the device/feel checks no headless drive can settle. Scenario 9's hand drive (laptop mouse,
phone touch-only via CDP) and the re-drives of 1, 4, 7, 8, 10, 11, 12 already cover the flows.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **UNCONFIRMED default:** a Sketch row sits in Primitives **after Tube**, and its drop opens the editor (nothing in the document until Done; Cancel leaves no body). | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. Observed 2026-11-07 (headless Chromium, 1440×900, drag from the Library): the Sketch row sits after Tube, and the drop opens the editor with Done and Cancel. Cancel leaves no sketch. Owner still to answer yes or no. |
| 2 | **UNCONFIRMED default:** double-click / double-tap a sketch body as an Edit sketch shortcut — **not built**; only the Inspector's Edit sketch exists. Wanted? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. Not tested 2026-11-07. Only the Inspector's Edit sketch control is on the page. Owner to answer whether the shortcut is wanted. |
| 3 | **UNCONFIRMED default:** Loft v1 needs exactly one Solid outline and no Holes per slice (cut holes afterwards with Subtract). | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 4 | **UNCONFIRMED default (implementer's):** while editing on a narrow viewport the nav chrome folds to ✥ even with no sheet open (extends ui-046; it is what keeps the resting editor's reachable canvas ≥ 69 %, 67 % → 76 % at 390 px). | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 5 | **UNCONFIRMED interpretation:** with the Slices/Extrude sheet open the phone's whole-canvas reachability is 47-57 % (tablet 64-74 %), below the task's literal ≥ 69 %; the drawing area round the origin stays 100 % reachable and that is what is asserted. Acceptable, or should the sheet get smaller / collapsible? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 6 | **UNCONFIRMED defaults (implementer's):** Polygon starts at 6 sides; a new slice is placed 50 mm above the highest; a new sketch starts as Linear 10 mm; Revolve 360° / 32 segments; Helical pitch 10 mm × 2 turns; Outline wall 2 mm × 10 mm. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 7 | **UNCONFIRMED (implementer's):** Undo/Redo and Delete are off while the editor is open (the draft isn't in the document yet), and old `sketch.line` records are dropped on load with a chip warning rather than migrated (the spec's own "no migration"). | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. Observed 2026-11-07 (headless Chromium, 1440×900): Undo and Redo are disabled while the editor is open, and still disabled after Cancel. Migration on load not tested. Owner still to answer yes or no. |
| 8 | On a real iPhone and iPad: drag Sketch out of the Library, draw two circles with a finger, tap the inner one, Hole, Extrude ▾ → Linear 30, Done. No accidental orbit, no sheet popping over the drawing, Done/Cancel always reachable. | Open | |
| 9 | On a real phone: two-finger pan/pinch inside the editor while one finger draws — does a two-finger gesture ever leave a stray outline behind? | Open | |
| 10 | Feel: the translucent extrusion preview behind the strokes — readable in both light and dark mode? Is the dashed Hole / amber open outline distinction obvious at a glance? | OK | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Circle r20, a Shift-drawn circle r12 set to Hole, an open amber line chain, Linear 30 (`h2.mjs`). Measured stroke colours from the DOM and pixels: solid blue #38bdf8 vs ground 8.1:1 (dark), #0369a1 5.1:1 (light); the Hole is dashed 7 on 5 in the same blue; the open outline is amber #e5b567 9.3:1 / #9a6a12 4.0:1 against the ground; amber vs blue dE76 89-90; extrusion fill vs ground 2.75:1 dark, 1.64:1 light (fill, not a line). Panels A and B agree: the dashed hole is clearly different from the solid circle and the amber open line from the blue ones in both themes; the preview is readable (fainter in light; A noted the open line is close in hue to the tan fill there). OK. Shots `shots/H2-*-strokes.png`. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |
| 11 | Firefox (any real machine with a working Firefox): `npx playwright test e2e/sketch-primitive.e2e.js` with the firefox projects enabled — not runnable in this sandbox (TROUBLESHOOTING 2026-09-17). | N/A | Closed 2026-11-01 (testing-005): `e2e/sketch-primitive.e2e.js` exists and the firefox projects run in the full e2e gate (`.githooks/pre-push`, build-014); see core-018 row 1. |

### ui-054 — File ▸ New (2026-10-01 22:57)

The native Save-picker and hosted auto-push halves were proven only against a fake picker and a mocked GitHub host.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | In desktop Chrome with a real saved file: File ▸ New, build something, File ▸ Save — the real OS picker appears and the old file is untouched | Moved | Moved 2026-11-07 to `FIND-testing-028`: an AI drive can settle it. |
| 2 | On a phone, the New confirm dialog reads comfortably and Replace is easy to hit | Open | |

### ui-039 — Mirror (2026-10-01 21:12)

Scenario 16 covers the reflect, original-untouched and selection behaviour. What it doesn't judge is how the control reads.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | The ⇋ glyph on the Mirror button reads as "mirror" next to ⤢ ⇱ ✂ (the toolbar-fit half is answered, see Notes) | Open | 2026-11-14 (`testing-029` panel): Glyph half, panel disagrees. A: unclear (guessed 'swap or exchange'). B: guessed Mirror correctly but it is a near-duplicate of Align ⇔. For the owner. Fit half unchanged (OK, see above). 2026-11-13 (`FIND-testing-021`): the fit half is OK. At 390x844 the Operations toolbar is a 4-column icon grid 182 px wide and 180 px tall (since `ui-082`'s groups tier), with Mirror in the last row; with one Cube selected and with none, the page has no horizontal scroll and nothing is clipped. Whether the glyph reads as mirror stays with `FIND-testing-029`. |
| 2 | Blank plane position on a symmetric shape adds an invisible copy sitting on the original — is the popover hint enough, or should it warn on commit? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ui-038 — Bill-of-Materials panel (2026-10-01 20:48)

The tally itself is covered by unit and e2e specs; these are the judgment calls they cannot make.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At 390px with several part types placed, does the BOM section push the Inspector's selected-body detail too far down the sheet? (It sits above the breadcrumb and is open by default.) | OK | 2026-11-15 (testing-031): OK. Phone 390x844: with a Pi selected the BOM section is 74 px (a 44 px header and one 22 px row), 29 % of the 254 px between the sheet top (y 471) and the footer (y 725). The breadcrumb sits 184 px down, 110 px without the BOM; the name field is 218-262 px down (8 px under the footer at rest); Position X is at least 816 px down for a cube and 1939 px for a Pi, below the fold with or without the BOM. Each extra part type adds 22 px. Threshold: BOM <= one third of the visible sheet at one row: met (74 of 254). |
| 2 | Is `Bolt M10 hex × 20 mm` the right wording for a shopping-list line, or should the fit or a Pi's model read differently? | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. × means both length and count, and the total (3) has no label. Judged from the string. Filed `FIND-ui-127`. |

### render-002 — Text/label as a placed body (2026-10-01 17:49)

Placed/retyped labels were driven on laptop Chromium and covered by the e2e matrix; what's left is feel and device behaviour that no scripted check judges.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Is the default label (`Label`, size 10, stroke 1.5, height 2) legible and pleasant to click-select at default zoom — thin strokes are easy to miss with a click; does picking a label feel fiddly? | Issue | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Default label at default zoom projects to 77x45 px (DOM bounds 37.76 x 11.5 x 2 mm). Picking, measured by clicking real points (scripts `h3b.mjs label`, `h3c.mjs`): 132 of 133 clicks on a letter selected it; 11 of 18 within 1 px; 0 of 355 further out; a 12x6 grid over the label's own box hit 27 of 72 (38%). So picking is exact to the stroke with no tolerance, and a click inside the word but between letters misses; filed `FIND-ui-132`. Legibility: panels disagree (A: not clearly legible, reads like 'FOSL' at that size, small target; B: partly legible, letters chunky not thin, unlikely to be missed) so that half is left as a judgement for the owner. Shots `shots/H3-dark-label.png`, `panel2/label-*.png`. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |
| 2 | Typing a label's wording on a real phone/iPad (software keyboard + the Inspector bottom sheet) — does the Text field commit on keyboard Done, not just Enter? | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |

### data-007 — Primitive resize: snapped dependents follow (2026-10-01 15:05)

The scripted e2e covers the snap-follows and fillet-refusal cases at all three viewports; what it cannot judge is how the refusal reads on a phone.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone, shrink a filleted cube's Size X below twice the fillet radius: is the "Fillet on Cube 1 (step 2) would no longer build at this size" line under the boxes readable without scrolling, and does the box repaint with the real value? | Issue | 2026-11-15 (testing-031): Issue, filed as ui-136. Phone 390x844 Chromium touch: a filleted 20 mm cube (4 mm rim), Size X typed as 5. The refusal line (366x76 px) is at y 716-792 and the pinned footer starts at y 725, so 9 px (12 %) of it is visible at the scroll the sheet is left at (scrollTop 300), and the footer is what is under its centre. The size field repaints to the real value (20). Threshold: the message fully above the footer without scrolling: not met. Tablet: clear. |

### core-034 — Drill the mounting holes through raspberrypi.* boards (2026-09-30 18:03)

Volume, hole-centre and hole-rim checks are automated; what no test judges is how it reads. The translucent green board now has through-holes, and I only looked at it from the default camera, too small to see them.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Zoom onto a dropped Pi 5 from above: do the four mounting holes and two fan holes read clearly through the translucent green board, without z-fighting at the rims? | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Pi 5 top view on the real GPU: mounting holes read as clean dark circles, panel A and B both YES (no speckle at the rims). Still-frame difference between 4 captures: 0 px. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/A-pi5-top-still.png, A-pi5-tilt3-still.png. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. Graduating: automated depth/translucency spec filed as `FIND-testing-015` (real-GPU look stays here). 2026-11-13: the headless part (stable, non-speckled pixels across repeated frames and a nudged angle, all three engines and viewports) is automated by `e2e/webgl-depth-translucency.e2e.js` (`testing-015`); the real-GPU look stays with `FIND-testing-030`. |
| 2 | Same on a real iPad/iPhone (WebKit GPU): the coplanar camera-module v1/v2 holes (cutter exactly as tall as the board) render without speckle at the hole walls. | Open | Graduating: automated depth/translucency spec filed as `FIND-testing-015` (real-GPU look stays here). 2026-11-13: the headless coplanar-hole check is automated by `e2e/webgl-depth-translucency.e2e.js` (`testing-015`); this row stays Open for the physical iPad/iPhone look only. |

### core-032 — Open announces itself before it folds (2026-09-30 15:55)

The spinner on the File button is a compositor-driven CSS transform, so it should keep turning while a large file folds; that is unproven on real hardware, and the in-between state is too brief for a screenshot in the e2e spec.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone/iPad, open a large project (200-record fillet fixture): the File button's spinner keeps turning and the chip reads `Opening <name>…` before the pause | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): phone touch, fillet-50 (200 records) opened through File, Open: the File button reads Opening... and the chip reads Opening fillet-50.ndjson... 13-20 ms after the file is handed over, at every throttle, before the pause. The pause itself: worst frame gap 129/499-508/739-743 ms at 1x/4x/6x (two long tasks, 114-725 ms), settled after 0.58/0.99-1.0/1.23-1.25 s. Real iPhone and iPad stay here. |

### core-028 — transform.mirror (2026-09-30 15:25)

Kernel-only; no control yet. One judgment call deferred to `ui-039` because it can only be judged on screen.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Once `ui-039` lands: mirroring a symmetric body with the default (own-centre) point looks like "nothing happened" — confirm the popover's committed point makes the copy visibly appear | OK | 2026-11-14 (`FIND-testing-019`): production build (`npm run build`, `vite preview`), laptop 1440x900, Chromium and WebKit. Mirror's plane field defaults to `0` (the world plane; the old "own-centre" default is now an empty field, and the popover says "a symmetric shape then lands exactly on itself"). A cube dropped off the origin (bounds x -57.75..-17.75) mirrored across X at 0 gives a copy at 17.75..57.75: visibly separate, 2 bodies, copy selected, Undo label `Undo: Mirror Cube 1` (WebKit). A cube centred on X = 0 mirrored at the default gives a second body with identical bounds, so it looks as if nothing happened; plane 60 puts it at 100..140, and an emptied field is committable and also lands on the body. Acceptance 16 step 1 already says to place the cube off to one side. Not filed: by design and disclosed in the popover text. |

### core-027 — hardware.screw family (2026-09-30 14:35)

Kernel-only; nothing in the app reaches it yet. One judgement call the V1 diff can't settle.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | V1's `FlatHead` puts the *wide* end of the cone on z=0 and the thread above the narrow end, so a "flat head" sits upside-down relative to a real countersunk screw (matches V1 and `hardware.bolt`'s head-at-z=0 convention). When the Library row lands, check that a placed FlatHead reads correctly and whether orientation `down` (not ported) is wanted. | Open | 2026-11-14 (`FIND-testing-019`): production build (`npm run build`, `vite preview`), laptop 1440x900, Chromium. Bolt / screw, Type **Flat head**, M10 x 20: one `hardware.bolt`, bounds 18 x 18 x 25 mm, z 0 to 25, volume 2 338.5 mm³. Seen from Front at 7 zoom steps: the cone's **wide end (18 mm, the 5 mm head) is on z = 0** and narrows upward into the 10 mm shank; the thread runs up from there. So it is a countersunk screw standing on its head, the same head-at-z=0 convention as Hex head, not the way up it sits in a hole. The Wood screw, flat head (#8) is the same, bounds 8.4 x 8.4 x 22.5 mm. Whether an orientation `down` (head up, thread down) is wanted stays the owner's call, left Open for `FIND-testing-033`. |

### ui-052 — Edit a composite part's parameters and repair what the change breaks (2026-09-29 21:40)

Scenario 15 and scenarios 2, 3, 5, 6, 10, 12 and 13 were hand-driven at laptop Chromium and phone WebKit (see `TODO/ACCEPTANCE.md`). What is left can only be judged on real hardware or by eye: headless WebKit cannot open iOS's native picker or show the home indicator, and "would a person notice" is not something a drive can measure.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone and iPad, tap a selected Raspberry Pi's **Model** (and a Bolt's **Spec**): it should open as the system wheel picker, and choosing Pi 5 should commit on its own, with no Apply. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 2 | On a real iPhone, open the repair dialog (Pi 4 with a cube snapped to its AV jack → Pi 5): it should be a full-height sheet whose **Apply**/**Cancel** sit clear of the home indicator, with the Fix dropdowns full width and easy to hit. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 3 | At laptop width, after **Leave broken**, the Pi's warning banner sits at the top of the Inspector's detail view, and it is scrolled out of sight if you were down at Parameters when you changed the Model. Does a person notice the problem anyway (the cube stays visible; History badges the row), or should the banner also appear near Parameters? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### core-035 — Design resolution and export resolution (2026-09-28 06:05)

Scenarios 1, 5, 10, 11 and 12 were driven live at laptop Chromium and phone WebKit, and every exported file was checked by independent parsers (0 open edges at Print). What no drive can judge: whether the finer facets actually fix fit in plastic, how the presets look on real GPUs, and how the synchronous main-thread re-fold feels on a real phone.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Print a Ø22 bore (or a bearing seat) exported at **Normal** and again with **Export → Resolution: Print**, and measure both across the flats with calipers. Print should be measurably closer to nominal (docs/resolution.md's table: 0.084 vs 0.019 mm undersize). Open both STLs in a real slicer first; it should report no repairs | Open | 2026-11-07: The slicer half (both STLs open in Cura with no repairs) moved to `FIND-testing-023`; printing and caliper measurement stay here. 2026-11-14 (`FIND-testing-023`, slicer half **OK**): a 40 x 40 x 20 mm block with a Ø22 mm cylinder subtracted, exported through File ▾ → Export… with Resolution **Same as design (Normal)** and with **Print**. `CuraEngine` 5.13.0 (stock Ultimaker Original) slices both with **no warning** (198 layers each). Independent reader: 324 triangles / 486 edges at Normal and 644 triangles / 966 edges at Print, 0 edges not shared by exactly two opposite faces in both. Measured across the flats from the files: Normal 36 sides, 21.916 mm (0.084 undersize); Print 76 sides, 21.981 mm (0.019 undersize), matching `docs/resolution.md`'s table. Files `/private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/exports/bore-normal.stl` and `bore-print.stl`. Printing and calipers stay Open. |
| 2 | On a real iPhone and iPad, open **File ▾ → Resolution…**, step Draft → Normal → Fine → Print on a scene with a large cylinder and a sphere. The re-facet should be visibly different at each step, and Draft should not look broken. The native **Resolution** select in the Export popover should open the iOS picker at a comfortable tap size | Open | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Mac half OK, the real iPhone/iPad half (iOS picker, tap size) stays Open. File ▾ → Resolution… driven through Draft, Normal, Fine, Print on a cylinder and a sphere (`h3b.mjs res`); the dialog labels read Draft 24 sides ≤0.1 mm, Normal 32 / 0.05, Fine 52 / 0.02, Print 72 / 0.01 (for a Ø20 hole). Panels A and B agree: 1 to 2 is clearly different, 2 to 3 visible and 3 to 4 subtle, and Draft looks coarser, not broken. Shots `shots/H3b-*-res-*.png`, `panel2/res-*.png`. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |
| 3 | On a real phone, with a busy scene (a few Pi boards and bolts), change the design resolution to **Print**. It re-folds on the main thread (76 ms median on 24 bodies on an M4 Pro; a phone is several times slower). Judge whether the pause feels acceptable or needs the pending indicator the TODO asked for (`core-032` owns moving cold folds off the main thread) | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): 24 bodies, phone touch, design resolution to Print: the main thread stalls for one long task of 152 ms at 1x, 575-605 ms at 4x and 818-861 ms at 6x (event-to-paint 176/624-648/880-920 ms); the volumes settle after 5.2/5.6/5.9 s; no pending or busy indicator appeared during it (none matched pending, busy, spinner or progress). Whether that pause is acceptable stays here. |

### ui-051 — Delete the selected body, or remove one part of a group (2026-09-28 03:09 UTC)

Delete, Undo, Remove part and reload were driven in Playwright at 1440x900 Chromium/WebKit
and 390x844 WebKit with real touch (`ACCEPTANCE.md` scenario 14). What a sandbox can't
settle is how the **pinned Delete footer** feels on real hardware, and whether a **real
iPad keyboard's** Delete/Backspace reaches the window listener the way desktop WebKit's
does.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone: select a body, the Inspector sheet opens with **Delete** pinned just above the Library tab. Is it easy to hit on purpose and hard to hit by accident when reaching for the Library tab below it? | Open | |
| 2 | On a real iPhone or iPad: does the pinned footer covering the bottom ~67 px of the sheet ever hide something you needed (for example the Pi's **Show hidden parts** toggle before you scroll)? | OK | 2026-11-15 (testing-031): OK. Phone 390x844, Pi selected: the sheet shows y 471-792, the pinned footer (Delete row) 67 px at y 725-792. At scroll 0 the footer covers the op caption (13 px) and Save to library (44 px) and the Library handle covers the Fit row; Show hidden parts sits at y 969 (below the fold, not under the footer) and reaches the open area at scrollTop 270. Sweeping the scroll in 30 px steps, all 174 controls in the sheet become reachable at some scroll position (none permanently hidden). Tablet 820: 172 controls, 0 never reachable, Show hidden parts reachable at scroll 0. Threshold: no control permanently behind the footer: met. Real iPhone safe-area behaviour not covered. |
| 3 | On an iPad with a hardware keyboard: select a body with the Inspector sheet collapsed and press Delete, then Backspace. Each removes the selection, and Backspace inside a Position field only edits the digit. | OK | 2026-11-14 (`FIND-testing-020`): **WebKit** (Playwright WebKit, Mac keyboard), 820x1180, `hasTouch`, e2e-hooks build of HEAD, two Cubes. The premise differs: at 820 px the Inspector is a side panel with no sheet (`inspector-tab` is not visible), so there was no collapsed sheet to arrange; the body was selected by a `touchscreen.tap` on the canvas (focus on `BODY`, selected `c2`, Inspector panel opened by the selection). **Delete**: bodies 2 to 1, selection cleared; Cmd+Z restored it (2 bodies, `c2` selected); **Backspace**: bodies 2 to 1. Backspace inside `inspector-position-x` (value `40`, caret moved to the end): value became `4`, bodies stayed 2, `c2` still selected; Delete in the same field changed nothing else. 0 page errors. A real iPad keyboard is still untested. |

### ui-049 — Objects list folded into the Inspector, hover-to-highlight (2026-09-27 22:34 UTC)

Everything measurable is measured and standing. `e2e/inspector-object-list.e2e.js` covers
every viewport, including hover pixels, the enclosed-body x-ray, the no-touch-hover
regression and the row-name fit. `ACCEPTANCE.md` scenarios 1, 4, 5, 6, 7, 10 and 13 were
re-driven, and `bench/results/2026-09-27-ui-049.md` has the hover sweep. What is left is
judgement a headless drive cannot make: how the new violet hover tint reads on a real
screen, and whether real touch hardware behaves like Playwright's WebKit, whose phantom
mouse after a tap is what the no-touch-hover fix was built against. `ui-047`'s open row and
`ui-041`/`ui-042`'s real-phone rows below were reworded to the new surface, not duplicated
here.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real monitor, in both dark and light themes, hover a row for an unselected light-blue body, a selected (amber) body and a red-recoloured body. Does the violet hover tint read clearly as "this one" without looking like a selection or a rendering glitch? (Headless: light blue went lavender, amber went pale peach, red went magenta-red.) | Open | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Measured (dE00, threshold >=10 for recognisably different): hover vs unhovered, light-blue body 6.9 dark / 5.3 light; default body 7.7 / 6.2; red body 25.5 / 24.0. Hover vs selected amber: 35-41 (cannot be mistaken for selection). Panel agreed hover is not a glitch and differs from selection; A said hover is clear (dark light-blue faint), B said NO for the light-blue cube in both themes (the list row bar carries the signal) and YES for red. Disagreement and dE<10 on the light-blue body: stays Open for the owner. Hovering a row of an already selected body is not reachable at HEAD (the list is replaced by the part's fields). Light via OS emulation and via the Help theme control gave identical pixels. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/B-dark-sys-hover-X.png, B-light-sys-hover-X.png, B-*-hover-Z-red.png. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. The owner's untracked theme files (.storybook/*, themes other than dark/light) do not enter the production build, so they do not change these pictures. |
| 2 | On a real iPhone and iPad (Safari), tap rows and checks in the Inspector's list, including one that changes the selection count so the sheet reflows. No row and no body should ever light up violet from a tap. Then on an iPad with a trackpad, or a touch laptop: after tapping, move the pointer onto a row. It should highlight on the first real movement. | Open | 2026-11-07: The tap half, in the iOS Simulator moved to `FIND-testing-027`; the trackpad and touch-laptop half stays here. |
| 3 | At phone width, select an enclosed body from the list, then fold the Inspector sheet with its tab to reach the gizmo (the sheet stays up after a list selection, as after any selection). Is that one extra tap workable, or does selecting from the list want the sheet to fold on its own? | Open | |
| 4 | Feel of the Objects section: ticking checks keeps the list open, a plain row tap folds it to the body's detail, and the breadcrumb's **Objects** crumb or the bar reopens it. Does that read naturally on a phone, or does the list folding after a plain tap surprise you? | Open | |

### ui-050 — Align to origin: real-device feel of the small grid and the native select (2026-09-27 20:15 UTC)

The precondition gating, the arithmetic, gizmo/field sync, the closed-finding
regressions (`ui-012`, `core-004`), and the 390px layout (no horizontal scroll,
44×44px targets, scrollWidth checked) are all covered by `transform.spec.js`,
`AlignToOrigin.spec.js`, the new `e2e/align-to-origin.e2e.js` (all 3 viewports, 2
non-Firefox engines), and a live hand-drive with screenshots. What is left is judgment
by eye and on real hardware — a native `<select>`'s own platform chrome and a
fingertip's real contact area are exactly the things a headless WebKit emulation
cannot stand in for.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, open the Reference `<select>` for a dropped Raspberry Pi. iOS renders this as its own native picker wheel, not an inline dropdown — confirm it's reachable one-handed and that picking `mb` reads back correctly in the row once dismissed. | Open | 2026-11-07: The picker and read-back half, in the iOS Simulator moved to `FIND-testing-027`; one-handed reach stays here. |
| 2 | On a real iPhone or Android phone, tap through all nine grid buttons (`⊢ min`/`◇ ctr`/`⊣ max` × X/Y/Z) in quick succession on a Cube. Each label is small (0.72rem) inside a 44px target — confirm the text itself is legible without squinting, not just that the tap target measures 44px in a bounding box. | Open | |
| 3 | On a real tablet (iPad), with the Inspector as a persistent side column rather than a sheet, confirm the Align to origin row doesn't visually crowd Position/Rotation/Size above it — the column is narrower than laptop width but the row was only checked at exactly 390px and 1440px in the automated matrix, not at the 820px tablet column width by eye. | N/A | 2026-11-15 (testing-031): N/A as written, the Align to origin row no longer exists in the Inspector (it moved into the Operations toolbar's Align popover; see the note in Inspector.vue). Measured what replaced it at 820x1180: the popover is 352x328 at x 234-586 (9 px short of the Inspector column at 595), 44-45 px cells in three rows, no clipped or overflowing child, every cell reachable at its centre; on the phone it is 352x328 at x 19. |
| 4 | Firefox (desktop): the row, its select, and all ten buttons render and commit correctly. Environment-blocked here (`TROUBLESHOOTING.md` 2026-09-17), so this is untested on this engine at all so far. | OK | 2026-11-14 (`FIND-testing-017`): the premise changed: `ui-060` replaced the Inspector's Align to origin row with the Operations toolbar's **Align** popover (World origin target for one selected body). Driven in Firefox 155 at 1440x900 (production build) with a Raspberry Pi: the popover opens, **Measure from** (`align-reference`) lists 14 parts plus a blank and is 330x44, all 21 position buttons render at 44x44 or larger and none is disabled, and they commit: X centre moved the Pi's X bounds from -93.52..-3.02 to -45..45.5, Y centre to -30..28, a Z position to -2.82..15.73, and **Drop** (lowest point of `mb` to Z=0) to -1.5..17.05. Screenshots `r9-ui050-firefox-laptop-{popover,after}.png`. |

### ui-048 — smaller cone-tipped move arrows (2026-09-27 17:16 UTC)

The sizes and positions are asserted by e2e on 6 of 9 matrix cells, and scenarios 1 and 6 were driven at all three form factors. What is left is judgment by eye and on real hardware, plus the one engine this sandbox cannot launch.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a Raspberry Pi at laptop width (gizmo near its cap), do the ring chevrons (~22-29 px) read as secondary to the new 13-16 px arrow cones, or do they now compete with them? The TODO said to leave the chevrons unchanged; if they compete, file a finding to size them off `gizmoHeadPx` instead of `ringPx`. | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Premise changed: ring chevrons are sized off the arrow head now. DOM boxes: arrow cone 13.5x10.4 px, chevron boxes 13.5x10.4 px laptop (12.7x9.7 phone); both panel agents saw the chevrons as clearly smaller than the arrow heads (bbox includes padding). They do not compete. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/C-laptop-gizmo-crop.png. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |
| 2 | On a real iPad, select a Pi near the middle of the view. At tablet width the viewport column is ~390 px, so a capped gizmo (arm 198 px) can put the X/Y cones under the Inspector column. Is that a real usability problem? The old, larger arms were worse, but the cap may want to scale with viewport width. | OK | 2026-11-15 (testing-031): OK. Tablet 820x1180: the viewport column is x 72-595 and the Inspector column x 595-820. Pi at the default frame: hub x 282, X and Y cone right edges 415, 180 px clear of the Inspector. Zooming in, the arm reach caps at 171 px (cone edge from the hub) from the second zoom step on, so the cones go under the Inspector only when the hub is right of x 424 (the right third of the column). Threshold: cones clear of the Inspector for a Pi near the middle: met. |
| 3 | On a real iPhone, grab the small red cone with a fingertip and drag. It should feel as grabbable as before: the 34 px invisible catchment is unchanged, only the drawn head shrank. | Open | |
| 4 | Firefox (desktop): the arrows show a lit flank and a darker flank, the vertical Z shaft is visibly blue (not missing), and X/Y/Z stay red/green/blue in both themes. Environment-blocked here (`TROUBLESHOOTING.md` 2026-09-17). | OK | 2026-11-14 (`FIND-testing-017`): Firefox 155 at 1440x900, dark and light schemes, production build, one Cube selected. Sampled pixels across each 3 px shaft and each cone through `getScreenCTM`. Dark: X shaft centre rgb(205,109,109) R-dominant, Y rgb(117,175,92) G-dominant, Z rgb(89,166,226) B-dominant; lit-versus-dark flank luminance difference 67.3 (X), 60.1 (Y), 21.1 (Z), cone 122.3 / 114.4 / 59.4. Light: X rgb(184,93,89), Y rgb(92,137,73), Z rgb(30,109,175), shaft 72.4 / 69.1 / 35.5, cone 26.3 / 38.0 / 75.5. The Z shaft is present and blue. Screenshots `r10-ui048-firefox-laptop-{dark,light}.png`. Hand-checked more than once now: graduation filed as `FIND-testing-039`. Graduated 2026-11-15 (`FIND-testing-039`): `e2e/gizmo-overlay-pixels.e2e.js` now keeps this on all three engines; no hand re-check needed. |

### core-033 — a pre-existing dimension mismatch found while porting colour, and real-device colour legibility (2026-09-26 16:53 UTC)

Two things surfaced while walking `raspberrypi.touchDisplay7inch.js` and every other
recipe part-by-part that are genuinely one-off, not covered by an `ACCEPTANCE.md`
scenario, and out of this task's own scope to fix silently:

1. `raspberrypi.touchDisplay7inch.js`'s `NO_GO_POWER_MM.sizeMm` records `[15, 10, 1]`,
   but the V1 source it's quoting (`touch-display-7inch.js:139`) is
   `Parts.Cube({ x: 15, y: 10, z: 7 })` — a `z` of 7, not 1. This predates `core-033`
   (colour was the only thing this task touched) and was left alone rather than
   silently "fixed" as a drive-by; it's noted in `TODO/render-005-visible-nogo-keepout-touchdisplay7inch.md`
   because the block's real-world obtrusiveness (relevant to that finding's own
   opaque-vs-hidden decision) is currently being judged against an undersized sliver,
   not the true 7 mm block.
2. Every `raspberrypi.*` recipe now renders with roughly 150 more real part colours
   than before (measured: 237 record-level colour changes across a 22-variant sweep).
   This was screenshotted and inspected by eye at laptop Chromium and phone WebKit
   during this task's own Step 6 drive and read as sensible in both cases, but a
   from-scratch look on real phone/tablet hardware — this project's own standing
   ask, not just a headless screenshot — hasn't happened yet for this specific
   change.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Fix (or explicitly decide to keep) `touchDisplay7inch`'s `NO_GO_POWER_MM.sizeMm` z-dimension mismatch (1 mm vs V1's 7 mm) — ideally alongside whichever option `render-005` picks, since the two are related | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | On a real phone and tablet (not headless), drop a `raspberrypi.bplus` (any model) and a `raspberrypi.cameraModule`, and confirm the newly-visible per-part colours (lightgray jacks, orange ethernet, gray GPIO, gold camera lensribbon, etc.) read as sensible board components rather than as visual noise, at both the translucent-board and opaque-part boundaries | Open | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Mac half: both panel agents say the lightgray jacks, dark header and small colour parts read as sensible components, not noise, at the translucent-board and opaque-part boundary (Pi 5, headed Chrome). Camera module not looked at. Phone/tablet GPU half stays open. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/A-pi5-top-still.png, A-pi5-tilt3-still.png. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |

### ui-047 — Objects-row indicator for a shown hidden part, deliberately not built (2026-09-26 13:18 UTC)

The task's own Interaction model section asked for "a small indicator (for example on
its Objects row) so a clearance left on isn't mistaken for real geometry" once **Show
hidden parts** is on for a body. This was not built: it sits outside the file's own
Affected files list (`ObjectsPanel.vue`/`objectsPanel.js` are not named there), and the
Inspector's own toggle state — checked, and the body still selected while its
translucent clearance is on screen — is the feedback that shipped instead. Not
covered by an `ACCEPTANCE.md` scenario, because none of the 13 named scenarios exercise
"deselect a body while its hidden parts are still shown" specifically. Worth a real
judgment call on real hardware: does a translucent clearance left on an unselected,
now-decoy-covered body read as confusing without a list-row cue, in practice rather
than in theory?

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Show a Bolt's `tap`, then deselect it (click empty space) and select a different body. Does the still-visible translucent clearance on the deselected bolt read as confusing without any cue in the Inspector's object list that it's still "on"? *(Reworded by `ui-049`: the Objects panel is now the Inspector's object list, and the toggle lives in the bolt's **Parts** section; still no row cue for a shown-hidden body.)* | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. The translucent clearance on the deselected bolt reads as a stray object; the Objects list has no cue, and Show hidden parts is only visible while the bolt is selected. Filed `FIND-ui-128`. |

### render-003 — Recipe-baked part colours actually render (2026-09-26 11:50 UTC)

Everything measurable is measured and standing: `mesh.spec.js`'s new cases (recipe tier,
user-override-beats-recipe, palette regression guard, `depthWrite: false` on alpha < 1),
the new `hardware-library-placement.e2e.js` washer-gray pixel sample (all three
viewports and engines, WebGL material path — proven to bite by a `git stash` A/B of the
`Viewport.vue` wiring alone), and `ACCEPTANCE.md` scenarios 13/3/2 re-driven by hand at
laptop Chromium and phone WebKit with real taps, screenshots inspected by eye. What is
left is the one thing this sandbox's headless/software rasteriser cannot settle —
`core-024`'s own VERIFY entry made the same call for a different z-fighting question.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real GPU (not this sandbox's headless renderer): drop a Raspberry Pi board and orbit close around where its translucent `mb`/`board` part overlaps an opaque part on top of it (a USB stack, the GPIO header). Does the translucent surface read cleanly through, with no flicker or wrong-order blending as the camera moves — the kind of artefact `depthWrite: false` exists to prevent but that a real driver's blend-sorting can still get subtly wrong in a way a still screenshot won't show? | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Pi 5 orbited in 24 steps of about 1.2 degrees at three tilts, canvas frame each step (920x847). Still frames: 0 differing px between repeated captures. Orbit: the only temporal spikes (pixel differs from both neighbours that agree) lie on the grid lines seen through the board (magenta mask /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/A-pi5-tilt3-spikemask.png); worst compact region 80 px (0.01% of canvas), none on part bodies. Panel A and B: no glitch. Chrome/Metal only; Safari not run. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. Graduating: automated depth/translucency spec filed as `FIND-testing-015` (real-GPU look stays here). 2026-11-13: the headless part (stable, non-speckled pixels across repeated frames and a nudged angle, all three engines and viewports) is automated by `e2e/webgl-depth-translucency.e2e.js` (`testing-015`); the real-GPU look stays with `FIND-testing-030`. |
| 2 | Same device: drop two Raspberry Pi boards close enough that their translucent parts overlap each other (not just an opaque part). This project has never needed two *overlapping* translucent surfaces before this task — confirm it still reads sensibly rather than double-darkening or z-fighting between the two translucent layers. | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Two overlapping Pi boards, same orbit method: still-frame diff 0 px, worst orbit region 82 px, on grid lines; panel A and B: plausible layering, no striping or doubled dark patches. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/A-twopi-tilt3-still.png. Chrome/Metal only. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. Graduating: automated depth/translucency spec filed as `FIND-testing-015` (real-GPU look stays here). 2026-11-13: the headless part (stable, non-speckled pixels across repeated frames and a nudged angle, all three engines and viewports) is automated by `e2e/webgl-depth-translucency.e2e.js` (`testing-015`); the real-GPU look stays with `FIND-testing-030`. |

### ui-037 — Inspector color control (2026-09-25 21:15)

Scenario 13 was driven in full at laptop Chromium and phone WebKit with real taps, plus data-005's per-part questions (closed below). What headless drives can't reach is the **native colour picker itself**: the OS dialog was emulated as its `input`/`change` stream on the real element. Everything else here is a look-and-feel judgement or a known geometric limit.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone and iPad (Safari): tap the Color swatch for a selected body. Does the native picker open, does the body change colour **live** while you move around the picker (the `input` preview), and does closing it keep the colour and add exactly one Undo step? Then open it, move to a different colour and **dismiss without choosing**. Does the body go back to its committed colour, or stay showing the abandoned one? The preview clears on `change`, on a selection change, or when another body/part is picked. It deliberately does not clear on `blur`, because some engines blur when the picker opens. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 2 | Dark mode (OS set to dark): select a recoloured body. Is its own colour still recognisable under the selection tint (`OVERRIDE_HIGHLIGHT_INTENSITY` 0.2, lowered from 0.35 during the drive because red read orange), and is it still obvious that it is selected? The drives ran in the light scheme. | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Dark scheme, red recoloured cube selected: pixel #c95e31 vs unselected #a60505 dE00 18.3 and vs the default selected amber #ad874b dE00 19.6 (threshold 10); r:g = 2.1, so it still reads red-orange. Light: 9.9 vs unselected, 15.3 vs amber. Panel A and B: still recognisably red and obviously selected in both themes. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/B-dark-sys-select-Z-red.png, B-light-sys-select-Z-red.png. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |
| 3 | Drop a **Bolt**, look inside it, and colour `head` or `thread`: nothing visibly changes, because the visible `tap` clearance solid (±9.25 mm, 0-27 mm) encloses both. Measured, not a colour bug, and the same interpenetration `ui-016`'s VERIFY row flagged. Decide whether that is acceptable, or whether `tap` should render hidden/translucent (a recipe or `render-003` question). | OK | Closed by `render-004` (2026-09-26): the user chose "hide `tap` by default" — `hardware.bolt.js`'s `tap` record now carries `hidden: true`, the same divergence `hardware.washer.js`'s `clearance` already had. A freshly-dropped Bolt now reads as gray head + silver thread, driven and confirmed on screen at laptop Chromium and phone WebKit (Step 6). `tap` stays addressable for scenario 5's subtract; it just no longer renders or counts toward the bolt's default bounds. See `TODO/done/render-004-bolt-tap-clearance-visibility.md`. |

### data-005 — Per-body / per-part colour override, document model only (2026-09-25 13:57)

No UI exists to create an override yet (`ui-037`), so nothing here is hand-checkable
today — this is a note for whoever drives `ui-037`'s own Step 6, not an open item on
this task. `Body.colorOverrides` tracks a whole-body override and any number of
per-part overrides as independent entries, and a later override never clears an
earlier, differently-targeted one — that's a document-model decision, proven correct
by unit test, but "correct" and "reads as intuitive to a person picking colours" are
different questions this task has no control to ask with yet.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Once `ui-037` exists: override a whole body's colour, then override one of its named sub-parts to a different colour. Does the rendered result read as "that one part is different", not as two colours silently fighting or the whole-body override winning unexpectedly? | OK | Decided and driven in `ui-037` (2026-09-25): a sub-part override wins on its own part and the whole-body override paints the rest (`src/core/colorOverride.js`). Group of two cubes at laptop Chromium and phone WebKit (touch): whole group red, Cube 2 blue rendered 182/4/4 vs 5/5/171, so it reads as "that one part is different". One caveat moved to `ui-037`'s entry below: on a **bolt**, the visible `tap` clearance solid encloses `head` and `thread`, so colouring either of those can't show through at all. |
| 2 | Same setup: clear the sub-part override (once `ui-037` builds a clear affordance — this task deliberately did not). Does the whole-body override reassert itself on that part, or does the part stay stuck at its old sub-part colour? | OK | `ui-037` built the affordance: the Inspector's **Reset** appends a `style.recolor` with `colorOverride: null` (`document.clearColorOverride`), which drops only its own key and is one Undo step. Driven on the same group: Reset on Cube 2 made it 169/5/5, so the whole-body red takes over again. The readout says `#ff0000 (whole body)`, Reset disables, and Undo brings the blue back. |

### ui-046 — Nav chrome folds to a ✥ toggle while a phone sheet is open (2026-09-24 21:16)

Emulated WebKit and Chromium at 390×844 confirmed the fold, the expand and every button inside it (ACCEPTANCE.md scenarios 1, 7 and 9). What emulation can't judge is whether a person on a real phone recognizes the ✥ glyph as "navigation controls" without reading the docs.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone (Safari): select a body so the Inspector opens, then without instructions find a way to orbit with the on-screen buttons. Does the ✥ toggle read as the way in? | Open | 2026-11-07: The cold-read half (a fresh agent with no project context, on screenshots or emulation) moved to `FIND-testing-029`; the real-device half stays here. 2026-11-14 (`testing-029` panel): Cold-read half (emulated 390x844, no instructions): A and B both found orbit via the folded ✥ button in 2 taps, but both say the glyph reads as move/pan, not camera: Issue, filed `FIND-ui-128`. The real-iPhone half stays Open. |
| 2 | Same phone: with the Inspector open, tap a body sitting just above the ✥ toggle. Does it select without nudging the camera? | Open | |

### core-031 — row actions on the fold cache, and what only real hardware can settle (2026-09-24 17:58 UTC)

`core-031` makes every History row action (edit, suppress, move, roll back, roll forward,
insert while rolled back), the Undo fallback and the row-click preview reuse each unchanged
record's build instead of re-folding the whole log. Proved here: results identical to the
uncached fold after every action (unit differential, real kernel), and identical to a cold
reload in the app. In headless Chromium at 4× CPU the worst frame gap for a row action went
284 → 30 ms (200 records) and 458 → 20 ms (24 bodies), and for selecting a row 168 → 19 and
232 → 18 ms. Scenario 12 passed in full in Chromium and WebKit, phone included. Three things
it could not settle headless:

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone and iPad: place two bodies, tap empty grid to deselect, then tap each body. Does each tap select that body? Headless WebKit with trusted touch says **no** after an empty-space tap; Chromium says yes. This decides whether `TODO/ui-045` is a real-device bug or an emulation artifact. | Open | **Narrowed by `ui-045`'s own diagnosis (2026-09-24):** extensive controlled reproduction (instrumented `onPointerUp`/`pickAt`, capture-phase `event.target` logging) never found a case where a trusted tap that genuinely reached the canvas raycast differently than a synthetic one — every failure traced to a stray tap landing on `NavigationChrome`/the gizmo/the Inspector sheet instead of the canvas (`TODO/ui-046`), which the original coordinates happen to sit under once a sheet is open. With coordinates verified clear of every overlay band, the full sequence — including body→body with no intervening empty tap — passed on every repetition, on webkit-phone **and** chromium-phone. So: **on the real device, try it first with the two bodies placed somewhere clearly not under the nav-chrome cluster or a body's own gizmo**, before concluding this is a real WebKit bug — a same-symptom failure there would most likely be the `ui-046` layout hazard, not this file's pointer-handling one. Still worth trying the *original* cramped placement too, since a real device's touch/gesture stack is the one thing this session's tooling could not stand in for. 2026-11-07: An iOS-touch-stack run in the iOS Simulator moved to `FIND-testing-027`; the real-device run stays here. |
| 2 | Desktop Chrome, real GPU: in History, select a mid-log row (the preview strip appears), then press **Back to latest** or **Roll forward**. Does the 3D view flash blank for a frame as the strip goes away and the viewport grows? Headless Chromium captures a blank canvas in the first frame and a correct one by 500 ms. That is pre-existing, and dismissing the strip alone does it too. Say whether a person can see it. | OK | 2026-11-14 (`FIND-testing-020`): **headed Google Chrome 157.0.8103.78** (`channel: 'chrome'`), ANGLE Metal on an Apple M4 Pro, 1440x900, e2e-hooks build of HEAD, the 24-body scene (12 Pis, 12 bolts, 48 History rows). Real-mouse clicks on row 24 (the strip *Previewing step 24 of 48 - read-only* appeared), then **Back to latest**, 3 times; then row 24, **Roll back to here**, **Roll forward**. Display refresh 120 Hz (rAF period 8.3 ms). Every frame was sampled inside the page after the app's own rAF callbacks (the rAF wrapper runs them first, then reads the WebGL canvas into a 32x32 2D canvas): 8 transitions, 1,280 frames, **0 blank frames**; the smallest count of distinct colours in any sampled frame was 178 (a blank canvas would be 1). The canvas did resize at each (920x574 to 920x534 on the strip's arrival at about +300 ms, back on **Back to latest**; 920x519 for the rollback strip) and the frame that carried the new size already held the scene (187 to 211 distinct colours). Worst rAF gap 18.4 ms (2 frames at 120 Hz). Caveat: this reads the drawing buffer before it is presented, so a flash added by the compositor itself would not show; none was visible in the headed window. 0 page errors. |
| 3 | On a phone, on a document of 20+ bodies (Open `bench/`'s 24-body scene or build one): tap a History row, then Edit or Suppress it. Does the row action now feel instant, with no stall between the tap and the viewport updating? | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): 24-body scene, phone 390x844 touch, History panel row 24 then Suppress, tap to result, CPU throttle 1x/4x/6x, worst frame gap: row preview 26/26/37-42 ms (strip after 25/89/107-123 ms), Suppress 30/35/52 ms (settled after 81/119/151-155 ms). No long task. Threshold: <= 100 ms gap: met. |

### core-030 — Undo/Redo by restore, felt on real hardware (2026-09-24 15:59 UTC)

`core-030` makes Undo/Redo restore the state captured with each step instead of re-folding the
log. Proved here: identical results to the always-fold path after every action (a unit
differential against an always-fold twin plus a fresh fold), zero kernel work per press
(counted at the registry), and in headless Chromium the worst frame gap at 4× CPU went
296 → 22 ms (200 records) and 474 → 18.5 ms (24 bodies). Scenario 12 was driven in full in
Chromium and WebKit, phone included. That cannot say how it *feels* on a real GPU and a real
touch screen, or whether the 50-step restore window's memory shows on an older device.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone and iPad: drop about 12 Raspberry Pis and 12 Bolts, then tap **Undo** ten times as fast as you can, then **Redo** ten times. Every tap lands with no visible stall, and the scene ends exactly where it started. Before `core-030` each tap froze the screen for about half a second on this scene. | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): 24 bodies (12 Pis, 12 Bolts), 12 Inspector edits, then ten fast touch taps on Undo and ten on Redo, two runs at 4x and 6x and one at 1x. Worst frame gap 23/28/28 ms at 1x/4x/4x and 34-51 ms at 6x (one frame over 50 ms once, no long task), event-to-paint 48-104 ms; the end state equals the start (same bounds of all 24 bodies, field back to 60). Before core-030 each tap froze about 500 ms. Threshold: gap <= 100 ms: met. Real iPhone and iPad stay here. |
| 2 | Same device, the same heavy scene: make about 60 small edits (move, param edit, place), then Undo all the way back. The first 50 Undos should feel instant. The ones past 50 re-fold and may pause briefly, which is expected. Nothing should reload the tab or run out of memory. | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): same scene, 60 Inspector edits then Undo to the end (60 taps), 4x and 6x, one run each: worst frame gap per tap median 25-30 ms, max 28-34 ms for taps 1-50 and the same for taps 51-60 (no re-fold pause measured), no long task, the tab stayed alive and the JS heap read 92 MB before and after. Real device stays here. |

### core-029 — the evaluation worker on a real phone and tablet, and the ~80 ms drop floor (2026-09-24 02:50 UTC)

`core-029` moved a composite body's volume union into a module worker and stopped `boundsOf`
unioning at all. Proved here: identical answers to the main thread (unit, e2e digit-for-digit
in Chromium and WebKit at all three viewports), the production chunk loading in both engines,
and the freeze gone at 4-6× CPU throttling in headless Chromium. Not provable here: a real iOS
Safari/iPadOS module worker under memory pressure, and what the remaining ~70-90 ms drag-place
gap is — it barely moves with CPU throttling (77 → 80 → 92 ms at 1×/4×/6×), so it is probably
the headless software rasteriser, which says nothing about a real GPU.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone (Safari), drop a Raspberry Pi and then a Bolt. Tap empty space and open the Inspector's **Objects (2)** tab (the Objects list, since `ui-049`): both rows show a size, and the scene responds while they land (no visible hitch on the second drop). If a remote Web Inspector is attached, confirm an `evaluation.worker-*.js` worker exists and the console is clean. | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): phone touch drag-drops, empty document: the first drop (Raspberry Pi) has a worst frame gap of 166/193-199/247-251 ms at 1x/4x/6x (2-3 long tasks of 130-350 ms); the second drop (Bolt) 34/27-32/37-38 ms, no long task, so the 'no hitch on the second drop' half holds. Both bodies carry volumes (22535.7 and 2920.8 mm3). Worker existence and a clean console are not checked here. Real iPhone Safari stays here. |
| 2 | On a real iPad, with ~10 Raspberry Pi boards placed (drag them in), drag one more Cube in and then press Undo. The drag-place should feel instant; Undo will still pause briefly (that is `core-030`, expected). Note roughly how long Undo hangs. | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): ten Pis placed, then a Cube drag-placed: worst frame gap 66/77-78/85 ms at 1x/4x/6x (one long task of 65-86 ms: the drop floor core-029 recorded at about 75 ms is unchanged); then Undo: 21/23-24/31 ms, tap to volumes 29/52-54/65-73 ms (no hang). Real iPad stays here. |
| 3 | Install the PWA, go offline, reload, and drop a Bolt: its measurement must still land (the worker chunk is in the service-worker precache — 9 entries, up from 8 — but offline was not driven here). | OK | 2026-11-14 (`FIND-testing-020`): Chromium, laptop 1440x900, the **production build** (`npm run build`, `vite preview`, service worker registered; no e2e hooks), real mouse drag. The SW became active, the next load was controlled (`navigator.serviceWorker.controller` set), and the Workbox precache `workbox-precache-v2` held 241 entries, among them `evaluation.worker-*.js`, `mesh.worker`, `image.worker` and `export.worker`. `context.setOffline(true)` (`navigator.onLine` false), reload: the app was up in 170 ms and the page loaded `rolldown-runtime`, `index`, `workbox-window` and `evaluation.worker-B0WuGlCW.js` with 0 failed requests. Dragged a Bolt in from the Library: body count 1 and the Inspector read `Bounds 18 × 15.6 × 26.5 mm` (the worker's measurement landed). 0 page errors. |

### ui-043 — phone toolbar/chrome margin is thin: 6px, not 0, but real-Safari font metrics were never checked (2026-09-22 14:36 UTC)

The fix closes both measured overlaps (21px and a previously-unmeasured 6px) to a uniform 6px
*clear gap* at 390×844, confirmed by a standing e2e spec (`e2e/phone-toolbar-chrome-fit.e2e.js`,
which will catch a future regression here automatically) and a hand-drive in this sandbox's
WebKit and Chromium. What none of that proves is that real iOS Safari renders the same 11px
system-font legend at the same pixel width as this sandbox's WebKit build — a font-metric
difference of even a few px would erase the margin. Not a case for a bigger fix (there is no
slack left to spend without reopening the trade the retirement note describes), just a real-device
check the standing spec cannot perform for itself.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone (Safari, 390pt-class device), select one body so the Inspector sheet auto-opens, and confirm the Operations toolbar and the navigation chrome (Orbit/Pan/Select row) do not visually touch or overlap. Repeat with two bodies selected. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |

### ui-042 — Objects list part rows: chevron feel, and a wrong-order empty result (2026-09-22 13:51 UTC)

Everything measurable is measured and standing (`e2e/objects-panel.e2e.js`'s new part-row cases at
three viewports, `ACCEPTANCE.md` scenarios 5/4/6/1). Two things are not, deliberately not
duplicating `ui-041`'s own real-phone-feel row above: the *new* nested-row/chevron interaction
specifically (a level of touch target `ui-041` didn't have), and a kernel behaviour this task's own
hand-drive surfaced but did not introduce or fix.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone, with nothing selected, open the Inspector's **Objects (n)** tab, expand a composite with many parts (a Raspberry Pi), scroll the part list, and tap a hidden part's row and its check: does the indent read clearly as "inside this body" at a glance, does the chevron's rotate-on-open animation feel responsive, and does scrolling the parts ever fight scrolling the Inspector sheet or the page? *(Reworded by `ui-049`: the list moved from the Objects panel into the Inspector sheet.)* | Open | |
| 2 | Addressing a part on the body that ends up as Subtract's *target* (the wrong-order case: e.g. drilling a small part first, then adding a much larger enclosing body second) can make the kernel return a **zero-volume result with no error** — a small solid entirely swallowed by what it's being subtracted with leaves nothing. This is existing kernel/boolean behaviour, not something this task changed, and it committed cleanly in the drive rather than crashing. Does a silently-empty result (one body left in the scene, at zero size) read as confusing or alarming to a real user, and is a "this result is empty" affordance worth a future finding? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

Everything measurable here is measured and standing (`e2e/objects-panel.e2e.js` at three viewports,
`ACCEPTANCE.md` scenario 5). What is left is judgement a Playwright touch emulation cannot make:
whether the new sheet and toggle *feel* right under a real thumb, and whether the hidden-body tint is
legible on a real screen in sunlight rather than a 1440px monitor.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, with nothing selected, tap the Inspector's **Objects (n)** tab, tick one row's check, then a second row's check, then **Subtract**: are the 44px rows and checks comfortable, does the sheet scroll without fighting the page, and does a row tap ever land on the check by mistake (or the reverse)? *(Reworded by `ui-049`: the Objects panel and its header button are gone; the list is the Inspector's.)* | Open | |
| 2 | With a body enclosed in another (open a project that has one), select the enclosed body from the list: is the **teal/amber x-ray tint** legible at phone size in both the dark and light themes, and does it read as "hidden body, selected" rather than as a rendering glitch? At 390px the selected body's gizmo can sit partly under the nav chrome (the phone framing is not adjusted for the sheet) — is that workable, or does it want the camera to re-frame? | OK | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Phone 390x844 touch, both themes (`h3d.mjs`): a 90 mm cube with a 40 mm sphere wholly inside (bounds -97.6,57.6,0 to -57.6,97.6,40 inside -122.6,32.6,-25 to -32.6,122.6,65), the sphere selected from the Inspector's list, sheet then closed. Premise changed: the tint is now a tan/orange body inside a translucent blue box, not teal/amber. Panels A and B agree: it reads as a hidden body inside another, selected, not as a glitch, and the tint is legible (muted in one theme per each agent, the inner shape reads as a disc or blob behind the gizmo origin). The selected body's gizmo sits fully clear of the nav chrome in the screenshot, so the 're-frame' worry does not occur at this framing. Shots `shots/H3d-*-xray-selected.png`. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |

### perf-001 — export moved into a worker, and the slow-export pending state (2026-09-21 19:32 UTC)

Everything measurable here is already measured and standing: the freeze (worst animation-frame gap, 224 → 27 ms at 4x CPU throttling and 346 → 40 ms at 6x, `bench/results/2026-09-21-perf-001.md`, re-runnable with one command), the threshold behaviour (5/5 appearances on a 24-body export, 0/5 on a one-body one even at 6x), the output equivalence (SHA-256 over the ordered vertex list and the whole written STL/OBJ/GLB for all ten `io-004`/`io-005` shapes), and `ACCEPTANCE.md` scenario 11's byte-level re-drive. The e2e matrix covers the pending state at all three viewports in Chromium and WebKit. What is left is the one thing a throttling multiplier is **not**: a real phone.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **On a real iPhone and a real iPad, does a big export still feel alive?** CPU throttling at 4-6x is a stand-in for a phone, not a measurement of one — a real device also differs in memory pressure, thermal throttling and how Safari schedules a module worker. Build a heavy scene (a dozen library boards and bolts), press **Export**, and judge two things by hand: does the viewport really keep responding to a drag *while* `Writing warpcad-scene.stl…` is showing, and does the file still arrive? Then the borderline case the numbers cannot settle: on a fast laptop at 1x a 24-body export lands right at the 100 ms threshold, so the line is absent or a ~10 ms flash. On a phone the same export is several times slower, so it should show properly — **but if it flickers on and off, or appears for so short a time that it reads as a glitch rather than as progress, the threshold is wrong for real hardware** and is worth raising. File it if so. | Open | |
| 2 | **Does the worker actually survive a real mobile Safari backgrounding?** Start a big export on an iPhone and immediately switch apps or lock the screen, then come back. iOS suspends timers and can terminate workers aggressively; the code falls back to the main thread only when a worker cannot be *constructed*, not when a live one is killed mid-job — in that case `runExport` rejects and the popover shows `Export failed: …` rather than quietly retrying. Is that what happens, and is the message survivable (popover still open, Export still pressable)? If iOS kills workers routinely on backgrounding, a retry-on-the-main-thread path becomes worth having and should be filed. | Open | 2026-11-07: A backgrounding run in the iOS Simulator moved to `FIND-testing-027`; real-device worker termination stays here. |

### ui-034 — File ▾ → Export… (2026-09-21 14:50 UTC)

Everything checkable without a person or a real slicer is covered on a standing basis: `e2e/export-ui.e2e.js`
(chromium + webkit, all three viewports — real downloads parsed by an independent reader), `ACCEPTANCE.md`
scenario 11 (driven by hand), and the unit specs. What is left is what only a hand and a real tool can judge:

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Real iPhone Safari: does the download actually land and can you find it?** Export a body as STL from the phone. The chip is a dot on a phone, so the browser's own download sheet (and the Files app's Downloads) is the only confirmation the user sees. Does `union-1.stl` appear, is the `Preparing…` button state on glTF perceptible or a flash, and does pressing Export feel like it did something before the sheet appears? Also: do the popover's 44 px scope/format segments feel like a comfortable thumb target, and does the dimmed **Export…** row's printed reason read as an explanation rather than clutter? | Open | 2026-11-07: The download-lands half, in the iOS Simulator moved to `FIND-testing-027`; the thumb-target and clutter judgments stay here. |
| 2 | **Open one exported STL and one OBJ in a real slicer or mesh checker** (PrusaSlicer / Cura / Bambu Studio / MeshLab) — both a plain Union and a placed bolt. **Precondition and expectation both changed on 2026-09-21 when `io-004` landed: those files are now measured closed** — 0 of 309 undirected edges open on the union (was 9 of 300) and 0 of 342 on the bolt (was 40 of 302), each edge used by exactly two faces in opposite directions, volume within 7e-6 of the kernel's, no zero-area triangles. So this row is no longer "how bad is the defect" but **"does a real tool agree with our own parser"**: the slicer should load it, report nothing to repair, and offer no auto-fix — if it still offers to repair, that is a new finding and the measurement above is wrong about something. Check the `.glb` in a glTF viewer in the same sitting, and on **the same terms, not weaker ones — this changed on 2026-09-21 when `io-005` landed**: the `.glb` is now measured closed too (0 of 276 undirected edges open on that same union, was 44 of 262; 0 of 318 on the bolt, was 46 of 290; 0 zero-area triangles; volume within 4e-8 of the kernel's; outward winding), so a DCC tool importing it should **not** complain about holes — if Blender's *Select → All by Trait → Non Manifold* finds anything, that is a new finding. This remains `ACCEPTANCE.md` scenario 11 step 5, which **no drive has ever been able to perform** — no slicer, mesh viewer or glTF viewer exists in this environment, and nobody has opened any exported file in one, before or after `io-005`. | Open | 2026-11-14 (`FIND-testing-023`): production build, Chromium 1440x900, every file exported through **File ▾ → Export…** (real download). Tools: UltiMaker Cura `CuraEngine` 5.13.0 (`/Applications/UltiMaker Cura.app/Contents/Resources/CuraEngine slice`, stock Ultimaker Original definitions, 100% infill, mesh dropped to the plate; note the binary is in `Resources/`, not `MacOS/`). **STL, done:** a plain Union (`union-1.stl`, 172 triangles, 88 vertices, 258 edges, volume 11,364.525 mm³, bounds -10..16 x -10..10 x -20..20 mm) and a placed M10 hex bolt (`bolt-1.stl`, 180 triangles, 270 edges, 3,697.251 mm³, 18 x 15.59 x 36.5 mm) each slice in `CuraEngine` (398 and 363 layers) with **no warning at all**; independent reader: 0 of 258 and 0 of 270 edges not shared by exactly two faces in opposite directions. The WebKit export of the Union is byte-identical to Chromium's (`cmp`). Positive control: the same slice on a cube missing its top face prints `Mesh has disconnected faces!`. **OBJ:** `union-1.obj` and `bolt-1.obj` read by an independent Python parser: 0 of 258 and 0 of 270 open edges, volumes 11,364.525 and 3,697.251 (equal to the STL). **glTF:** Khronos `gltf-validator` 2.0.0-dev.3.10 (a scratch-directory install, nothing added to `package.json`): `union-1.glb` and `bolt-1.glb` 0 errors, 0 warnings, 0 infos, 0 hints (160 and 164 triangles); the donmccurdy viewer (three.js r176, in Chromium) loads both, and the viewer's three.js geometry has 0 of 240 and 0 of 246 open edges. **Still Open:** MeshLab 2022.02 is installed but `meshlabserver` and `pymeshlab` are absent (nothing was installed) and the `computer-use` skill is not available in this session, so MeshLab's Select non-manifold edges and Compute topological measures were **not run**, and no GUI slicer opened the OBJ. Re-run those two in MeshLab by hand, or with `computer-use`. Scenario 11 step 5 is otherwise driven (see ACCEPTANCE.md). |

### ui-033 — File ▾ menu: Save / Open… / hosted storage (2026-09-21 13:46 UTC)

Everything checkable without a person, a real credential or a real device is covered on a standing
basis: `e2e/save-load-ui.e2e.js` (chromium + webkit, all three viewports), `ACCEPTANCE.md` scenario 10
(re-driven by hand against a mocked `api.github.com`), and the unit specs. The `data-001` rows on real
iOS `<a download>` and `<input type=file accept>` behaviour, and the `io-001` header-feel rows, are **not
repeated** — the File button is in that same header, so check it in the same sitting. Three things are left
that only a real device or a real OS dialog can answer:

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **The native File System Access picker on real desktop Chrome or Edge** — an OS dialog nothing headless can click, proven here only against an injected fake. **Save** should open the picker the first time and then write over the same file with **no** second prompt (`Saved to warpcad-project.ndjson · HH:MM`); **Save As…** should always prompt; cancelling either picker should be silent; **Open…** then **Save** should write back to the file you opened. Edit the file in a text editor between two Saves to see the write really lands on disk. | Moved | Moved 2026-11-07 to `FIND-testing-028`: an AI drive can settle it. |
| 2 | **Real iPhone Safari, the Connect dialog with the keyboard up.** Tap **File ▾ → Connect repository…**, tap the Token field. The inputs are 16px so the page should **not** zoom, and the dialog is top-anchored so the keyboard should not hide the fields or the Connect button. Also: does iOS offer to autofill a saved password or autocorrect/capitalise into the token field despite `autocomplete="off"` / `autocapitalize="none"` (Safari does not always honour the former)? Use a made-up token; do not paste a real one to test this. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 3 | **The File-button status dot at real phone size.** It is a 14px badge on the button's corner (solid green disc in sync, hollow ring pending, spinning ring pushing, amber `!` paused, red `✕` failed), shape-coded so it does not rely on hue. Judgment call: can you tell those five apart at arm's length, in sunlight and in dark mode, and does the spinning ring read as "working" rather than "stuck"? (Reduced-motion users get a dashed ring instead of a spin — check that setting reads too.) | Open | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Mac half OK, real phone/sunlight half stays Open. Connected through the real dialog to a mocked api.github.com (the e2e fake), then the five states set on the live dot element by swapping its `hosted-dot--*` class (the real CSS, but the state transitions themselves are not driven here; `e2e/save-load-ui.e2e.js` covers those). DPR 3 at 390x844: dot 14x14 px on a 48x44 px button. Colours vs the header surface: in sync 10.1:1 / 4.1:1, pending ring 6.8 / 5.0, paused 9.1 / 4.5, failed 5.4 / 6.2 (dark / light). Panels A and B agree: all five (disc, ring, spinner arc, rounded square with !, disc with X) are distinct by shape alone. Reduced motion measured: the spin stops (`animation-name: none`) and the ring turns `dashed`. Shots `shots/H3d-*-filedot-*.png`. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |

### ui-040 — Sub-part-addressed boolean operands (2026-09-20 23:59 UTC)

Everything about *whether it works* is covered by `ACCEPTANCE.md` scenarios 4, 5 and 6, all
re-driven and measured, so only the two judgment calls this task made for phone width are
logged here — both are "does this feel right to a person holding the device", which no
assertion in this repo can answer.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At 390px the operand line (*"Cube 1 then Bolt 1 › tap"*) is **hidden**, because the column above the navigation chrome is already full — measured, 151px against ~147px spent — and the same text is on the buttons' long-press instead. On a real iPhone: is a long-press actually how someone would discover which depth is armed, or does a sub-part boolean feel like it commits blind at that width? If it feels blind, the answer is probably a different home for the line (the Inspector's 2-selected state), not a smaller font. | Open | |
| 2 | A rejected sub-part commit shows its kernel error on the toolbar, and at phone width that message sits in the same band as the navigation chrome's buttons, so the toolbar is lifted above the chrome **only while an error is showing**. On a real device: does that read as an error, or as the toolbar glitching over the nav pad? Reachable by drilling into a part, Shift-clicking a second body, then rolling the History back so the part no longer exists, then clicking Subtract. | Open | |

### ui-032 — Timeline (History) panel (2026-09-20 22:05 UTC)

`ACCEPTANCE.md` scenario 12 was driven in full at laptop/Chromium and phone/WebKit, so nothing
that scenario already covers is repeated here. What is left is genuinely one-off: two *feel*
judgments that only a hand on real hardware can make, and one decision this task was asked to
record. The measured facts behind them — the phone sheet is 34vh with the nav chrome clearing the
Operations toolbar by 57px, and the tablet dock is 220px inside a viewport column roughly 390px
wide at the 820px reference — are in the task's retirement note; what nobody has judged is whether
those numbers *feel* right to use.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **On a real iPhone**, open History with three or four bodies placed and try to actually work: read the rows, tap one, edit a value, roll back. The sheet is 34vh (~287px) and the 3D view above it keeps only ~296px, most of which the Operations toolbar and nav chrome overlay. The arithmetic says nothing *collides*; the open question is whether the remaining sliver of viewport is enough to see what a row action just did to the model, or whether the honest answer at phone width is that History wants a full-screen presentation rather than a sheet. If it is the latter, that is a real finding and wants its own `TODO/<id>.md` | Pass (2026-10-15, user: "yes"). iPhone: History as a sheet is usable with 3-4 bodies; the full-screen question is closed. |
| 2 | **On a real iPad**, same exercise against the 220px bottom dock. At the 820px reference the viewport column is only ~390px wide, so the dock takes over a third of the 3D view's height while it is open. Judge whether the "select a row, watch the viewport" loop the panel is built around actually works at that size, or whether the dock wants to be collapsible to a strip | Pass (2026-10-15, user: "yes"). iPad: the 220px dock works for the select-a-row loop; no collapsible strip needed. |
| 3 | The inline edit form uses 16px inputs specifically so iOS Safari does not zoom the page on focus (`§15`'s own phone rule). Verified by construction, never on a real iPhone. Tap into the Radius field on device and confirm the page does **not** zoom and the form does not scroll out from under the thumb | Pass (2026-10-15, user: "I didn't see it zoom the page"). iPhone: Radius field focus did not zoom. |

### io-003 — Export serialization: STL, OBJ, glTF (2026-09-19 15:21 UTC)

The STL and OBJ bytes were re-read by numpy and three.js's own loaders (closed surface, kernel volume to
1.3e-5 relative) and the `.glb` container by an independent parser, but **no real slicer or glTF viewer has
opened any of them** — `ui-034` (2026-09-21) built the control and drove real downloads, and re-read the bytes by an independent parser (including the glTF root matrix), but still no real viewer was available, so this row is still open. Scenario 11
covers "opens cleanly and matches the viewport"; this entry is only the glTF judgement it does not name — that
the file is the right *size and way up*, which is the one place the export deliberately differs from the
document's space (mm / Z-up in, metres / Y-up out) and which only a real viewer can confirm.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Now that `ui-034` has landed (File ▾ → Export…, choose **glTF (.glb)**): export a body you know the size of (a 40 mm cube standing on the grid) as glTF and open the `.glb` in a real viewer (Blender, `gltf-viewer.donmccurdy.com`, macOS Quick Look). It should stand **upright** (not lying on its side) and read **40 mm / 0.04 m** across, not 40 m or 0.04 mm. **Updated 2026-09-21 (`io-005`) — what the file now is, and what is still unknown:** the `.glb`'s mesh is now **closed** by this repo's own independent POSITION-accessor parser (0 of 276 open edges on the scenario-11 union, 0 of 318 on a placed bolt, 0 of 1023 on a `raspberrypi.bplus`, 0 zero-area triangles, outward winding, volume within 4e-8 of the kernel's) and the mm→m / Z-up→Y-up root matrix is unchanged and re-measured. **No real glTF viewer has still ever opened one of these files** — not before `io-005` and not after — so this row stays `Open` and is now the check on *two* things at once: the size-and-orientation judgement it was always for, and whether a real importer agrees the surface is closed. | OK | 2026-11-14 (`FIND-testing-023`): production build, Chromium 1440x900, 40 mm cube at Z 0..40 exported as `cube-1.glb` (1,844 bytes, 12 triangles). Khronos `gltf-validator` 2.0.0-dev.3.10: 0 errors, 0 warnings, 0 infos, 0 hints (generator `THREE.GLTFExporter r187`). Raw file: POSITION min/max -20..20 x -20..20 x 0..40 and a root matrix of 0.001 scale that maps Z to Y. In the donmccurdy glTF viewer (three.js r176, Chromium) the content measures **0.04 x 0.04 x 0.04 m** (40 mm, not 40 m or 0.04 mm) and the same viewer's loaded geometry has **0 of 18 open edges**. Upright: the Union (26 x 20 x 40 mm in WarpCad) measures 0.026 wide x **0.040 tall** x 0.020 deep, and the bolt (36.5 mm long along Z) is 0.0365 tall, so Z-up arrives as the viewer's Y-up. The viewer re-centres the model, so 'stands on the grid' was read from the raw accessor (min Z 0) instead. Screenshot `/private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/viewer-cube40.glb.png`. |

### io-002 — Hosted git-backend persistence (2026-09-19 14:09 UTC)

Everything about this task that *can* be checked without a real credential is covered on a
standing basis: `src/storage/*.spec.js` + `src/stores/hosted.spec.js` (59 cases, including the
whole auto-push state machine under fake timers), `e2e/hosted-persistence.e2e.js` on chromium +
webkit against an intercepted `api.github.com`, and `ACCEPTANCE.md` scenario 10 — whose hosted
half (steps 8-10, a real scratch repo and a real token) is **already the standing home** for
"does this work against real GitHub", so it is deliberately **not** duplicated here. The two
rows below are the ones a mocked host cannot answer even in principle, because they are claims
about the *real service's* behaviour rather than about this code. The open real-device rows from
`io-001`/`data-002` are not repeated either.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **A project over 1 MB, against real GitHub.** The Contents API stops returning file content above ~1 MB (`"encoding": "none"`, empty `content`), and `hostedBackend.js` follows the blob endpoint rather than reading that as an empty project — which would commit a truncated log over a real one. That branch is tested against a fake answer shaped from the docs, never against the real service. Build a log past 1 MB (a few hundred placements, or a big imported part), Save to a scratch repo, reload with site data cleared, and Load it back: does the whole model return? | Open | |
| 2 | **403 really is two different failures.** A missing `Contents: write` permission and a rate limit both arrive as 403, and they are told apart here by `x-ratelimit-remaining`/the body text, then reported as different messages (*"does not have permission… Contents: read and write"* vs *"Rate limited — try again in N minutes"*). Confirm against the real API with a deliberately read-only fine-grained token: is the wrong-permission message the one that appears, and is it true? | Open | |

### io-001 — Local persistence: IndexedDB autosave, restore and the save-status chip (2026-09-19 13:31)

Autosave/restore, the flush-on-hide path, the blocked-storage state and the chip layout are
all covered on a standing basis (`e2e/local-persistence.e2e.js` on chromium + webkit, and
`ACCEPTANCE.md` scenario 10's local half, re-driven by hand this task). The two open real-device
rows from `data-001`/`data-002`/`data-003` (real iPhone/iPad header feel) are **not repeated**
here — the chip's dot now sits in that same header, so check it in the same sitting. What is
left is what a headless WebKit and a simulated `indexedDB` cannot stand in for:

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Real iPhone Safari, the tab-kill path.** Place a shape, then within about a second swipe to the home screen (or lock the phone) and later reopen the tab/app. Is the last shape still there? The save-on-hide path (`visibilitychange`/`pagehide` → a synchronous `localStorage` copy, then IndexedDB) was found necessary in real Chromium and passes in headless WebKit, but iOS suspends and kills tabs on its own schedule that no headless run reproduces. | Open | 2026-11-07: A Safari-terminate run in the iOS Simulator moved to `FIND-testing-027`; iOS killing tabs on its own schedule on hardware stays here. |
| 2 | The chip is a **10px dot** at phone width, coloured *and* shaped (grey idle, amber ring saving, green disc saved, red square failed). Is it legible at arm's length, in sunlight and in dark mode, and does the ring/disc/square difference actually read without relying on hue? (Judgment call; not asserted anywhere.) | Issue | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Mac half; sunlight and arm's length stay Open. Chip tones set on the live element (class swap) at 390x844, DPR 3: dot 10x10 px in a 20x10 slot. Both panel agents say the five do not separate by shape: idle and saved are both discs, paused and failed are both rounded squares (radius 3 vs 2 px), so they differ only by hue (dE76 idle/saved 46 dark, 39 light; paused/failed 51, 45). Saving (amber ring) is distinct. Contrast of each dot vs the header: 4.1 to 10.1:1. Filed `FIND-ui-133`. Shots `panel2/chip-*.png`. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |
| 3 | **A real private window** in Safari and Firefox (not the simulated throw the e2e uses). Does WebKit/Gecko actually block IndexedDB there, and if so does the chip go red with the app usable? `docs/save-load.md` claims only that private windows *in some browsers* block or wipe storage — tighten or loosen that sentence to what you see. | Moved | Moved 2026-11-07 to `FIND-testing-028`: an AI drive can settle it. |

### data-004 — Edit a past timeline entry's params in place and replay after it (2026-09-19 04:59)

Almost everything this task built is already covered on a standing basis — `ACCEPTANCE.md`
scenario 12 owns the whole edit/suppress/reorder/rollback surface, and 39 unit cases cover
the mechanism — so only the three things below are logged here, and none of them is a
restated pass. Two are **judgment calls that need a human looking at a screen**, which is
exactly what this file is for and what no assertion of mine can settle; the third is a
number that should be re-taken on real hardware rather than trusted from a laptop.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | The full re-fold measured 67 ms for a 200-record, 50-fillet document on this Mac. That is a **row action, not a frame**, so it is within budget by design — but it is also the first operation in this app whose cost scales with document length. Re-take it on the **iPad and the iPhone** once `ui-032` gives it a trigger: if a mid-history edit on a real phone feels like a hang rather than a pause, the incremental re-fold this task deliberately did not build becomes a real task rather than a deferred one. Record the device and the felt latency, not just the number | Seems OK (2026-10-15, user). Device not stated; the user did not try it much, so the felt latency is not recorded in detail. Re-take on a phone with a larger document if it matters. |
| 2 | A `transform.rotate` row is **not editable at all** (its only param is the absolute rotation `core-004` carries forward, so editing one row's copy would be silently overwritten by the next). This is correct and is now stated in code — but it is a capability a user may well expect. When `ui-032` lands, judge by hand whether the disabled `Edit` button's reason reads as *an honest limitation* or as *a bug*. If it reads as a bug, that is a real finding and wants its own `TODO/<id>.md`, not a wording tweak | Pass (2026-10-15, user: "works"). Reads as an honest limitation, not a bug, per the user's reading that the disabled Edit works as intended. |
| 3 | Section 18's inactive-tail `broken` flag is informational by decision: an insert that breaks a tail row still succeeds. `data-004` measured that **36% of roll-back-then-move cases** break at least one row (filed as `TODO/data-006`). Once `ui-032` can show the chip, drive scenario 12 step 10 a few times as an exploring human and judge whether being told "this later step can no longer be built, Suppress it or Undo" is *acceptable* or *infuriating* — that judgment, not the 36%, is what should decide whether `data-006` gets built | N/A | Closed 2026-11-01 (testing-005): duplicate of the open row in the `data-006` entry (scenario 12 step 10 as an exploring human, with the Re-link button in place). |

### data-003 — Undo/redo command stack scoped by transaction origin (2026-09-19 03:58)

The mechanism itself is covered by standing checks and is deliberately not restated here:
`ACCEPTANCE.md` scenarios 1, 2, 4 and 12 were all re-driven by hand for this task, and
`src/core/history.spec.js` plus `e2e/undo-redo.e2e.js` (3 viewports x chromium/webkit)
cover the rest. What is left is three things a scenario genuinely does not check — a
layout cost the confirmed design accepted on paper but nobody has seen on glass, a
contract with no reachable trigger in the app yet, and a threshold this task moved in
another task's spec.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **On a real iPhone and a real iPad**: the header is now ~53px tall at phone width (was ~30px) because Undo/Redo are 44px tap targets, and the mouse-oriented hint text is hidden below 641px. Does the taller bar feel right, and are the two buttons comfortably thumb-reachable one-handed? The 390px budget was checked arithmetically and in a screenshot, never on glass. | Open | |
| 2 | The undo **refusal** path (`history-refusal`, `role="alert"`) cannot be triggered from the app today — nothing produces a non-local record until the MCP surface or `io-002` exists — so it is proven only by `history.spec.js`. When `io-002` lands, confirm the message actually appears and reads sensibly, and fold it into `ui-033`'s shared `save-status` chip rather than leaving a second status surface. | Open | 2026-11-14 (`FIND-testing-019`): `npm run dev`, Chromium 1440x900, stand-in agent (no key, no network). A hand-placed cube plus one `webmcp` record (`operate` `transform.translate` on it), then header **Undo**: the refusal appears (`history-refusal`, `role="alert"`) and changes nothing (cube stays at 10..50, Undo still enabled): `document.undo: "cuboid-oprfjy-1-move-oprfjy-2", added via webmcp, depends on "Place Cube 1" — suppress or edit it first`. It does **not** share the `save-status` chip: it is a separate red block in the header bar (239.6 x 39 px, three lines, the app hint squeezed to "Drag a shape from the Lib…") while the chip still reads `Saved · 14:28`. Wording leaks the internal prefix and a record id. Filed `FIND-ui-125`. Left Open for the owner's call on the shared chip. |
| 3 | `e2e/snap-align-operation.e2e.js`'s two fixture-sanity guards were lowered `> 5` → `> 4` because this task's taller phone header shifts the phone camera's projection (that fixture's X separation went 5.61 mm → 4.69 mm). The guards still sit ~90x above the 0.05 mm tolerance they protect, and the shared drop fractions were deliberately left alone. Worth a second opinion on whether the fixture should instead be re-positioned when someone next touches that file. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### data-002 — M6 interaction-model Q&A (2026-09-19 03:10)

This task shipped no code, so nothing here is about how something looks. One claim in
`docs/decisions/interaction-model-qa.md` section 10 is **from memory, not measured**, is
load-bearing for `io-001`, and cannot be checked by any automated spec (Playwright's WebKit
is not iOS Safari): that an `<input type="file">` on iOS Safari **greys out files whose type
it does not recognise**, which is why the Q&A asks `io-001` to use an `accept` list of
`.ndjson,.json,.txt` plus `text/plain` rather than a custom extension alone. If a real
iPhone lets a plain `.ndjson` be picked from the Files app with any `accept` value, the
constraint is moot; if it cannot with `.ndjson,.json,.txt`, `io-001` needs a different
project-file extension. Cheap, and worth doing before `io-001` starts, alongside the two
open rows in the `data-001` entry below (same devices, same scratch page). The header's
390px width budget is also arithmetic rather than measurement, but `ui-033` will hand-drive
it at 390px as part of its own acceptance run, so it is not a separate row here.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On real iPhone **and** iPad Safari, put `<input type="file" accept=".ndjson,.json,.txt,text/plain">` on a scratch page, and try to pick a file named `project.ndjson` saved in the Files app. Then try again with a bare `accept=".ndjson"` and with no `accept` at all. Record which of the three let the file be selected. If only the no-`accept` case works, `io-001` should drop `accept` entirely and validate the file's content instead of its extension. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |

### data-001 — Persistence/export Library decision (2026-09-18 20:20)

This task shipped no code, so nothing here is about how something looks. It is here
because `docs/decisions/persistence-export.md` makes **one load-bearing claim about real
devices that was taken from caniuse and MDN rather than measured on hardware**, and
`io-001` is about to build its whole Save/Open path on top of it. The claim: File System
Access is desktop-Chromium-only (~30.85% global, no pickers on Safari, Firefox, or
**Chrome for Android**), therefore the `<a download>` / `<input type="file">` fallback is
the *primary* path on every phone and tablet this project supports, not an edge case.

Both rows below are cheap, and both are worth doing **before** `io-001` starts rather
than after, because each one would invalidate a different part of that plan. Row 2 is the
one that actually worries me: iOS Safari has historically handled `<a download>` on a
blob URL by *opening* the file in a tab rather than saving it, and if that is still true
then the fallback this decision calls "primary" does not work on the two devices the
second attempt's stop note specifically complained about. No acceptance scenario covers
this (scenario 10 is "not yet built"), and no automated spec can, since Playwright's
WebKit is not iOS Safari and does not share its download behaviour.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | In a JS console (or a scratch page) on real iPhone Safari, real iPad Safari, and desktop Chrome, evaluate `typeof window.showSaveFilePicker`. Expect `"undefined"` on both iOS devices and `"function"` on desktop Chrome. Anything else means the capability gate in `docs/decisions/persistence-export.md` sub-decision 2 is wrong and `io-001`'s branch needs rethinking before it is written. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |
| 2 | On real iPhone **and** iPad Safari, trigger a plain `<a download="test.ndjson">` pointing at a `Blob` object URL and see what actually happens: does a file land somewhere the user can retrieve it (Files app / Downloads), or does it just open the text in a new tab? If it opens rather than downloads, the "fallback is the primary path" plan is broken on iOS specifically, and `io-001` needs a different Save mechanism there (Web Share API `files:`, or copy-to-clipboard) — file it as its own TODO and put the id in Notes. | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |

### ui-036 — Angled Bisect controls (2026-09-18 19:14)

Measured live at 390x844 (WebKit): the six-field popover is 260 x 466 px, no internal scroll, and every control hit-tests. What automation cannot judge is how it *reads*: the popover's glass background lets the Inspector sheet's text show through behind it now that it sits above that sheet.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone, open Bisect with a body selected and read the popover over the auto-opened Inspector sheet: is the faint Inspector text ("INSPECTOR", part name) showing through behind the fields distracting enough to want a more opaque popover background at phone width? | Open | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Mac half OK (emulation, not an iPhone), real iPhone Safari backdrop stays Open. Bisect popover over the auto-opened Inspector sheet at 390x844, DPR 2 (`h3d.mjs`): in the popover's empty bands the pixels are flat, luminance range 0.0007 dark and 0.0024 light, and the Inspector's text and Save-to-library button that lie behind it do not show through anywhere inside it (they appear only left of the popover's edge). Premise changed: the popover is the shared overlay, not the old translucent glass. No panel agent needed. Shots `shots/H3d-*-bisect.png`. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |
| 2 | On a real iPhone, tap into the Angle field and check the numeric keyboard offers a minus sign (Angle accepts negative degrees); `type="number"` keyboards without one are an iOS quirk the desktop drive cannot show | Moved | Moved 2026-11-07 to `FIND-testing-027`: an AI drive can settle it. |

### ui-035 — an occluded sub-part still cannot be picked, and one feel question about the new operand line (2026-09-18 01:55)

The operand mechanism itself needs no hand-check and is deliberately not listed below:
`TODO/ACCEPTANCE.md` scenario 3 now carries it as a standing check, driven live against
a real Raspberry Pi 5 at both laptop and phone and verified as arithmetic against an
independent kernel probe (the `ethernet` part sits at (+34.50, -17.30) mm from the
board's bbox centre, and the live move implies exactly that to the hundredth of a
millimetre, in both directions of addressing). What is left is one real gap this task
cannot close from inside itself, and one judgment no measurement settles.

Row 1 is the important one, and it is the reason `docs/snap-align.md` no longer uses a
mounting hole in its worked example. This task's own Goal names "a specific hole on a Pi
board" as the case it exists to enable. The *operand* half of that now works. The
*selection* half does not: a mounting hole passes through the PCB, so a raycast hits
`mb` in front of it every time. A 289-point pointer sweep across a real Pi 5 at the
default camera reached only `mb`, `ethernet`, `usb1` and `usb2` — four of the board's
thirty-odd named parts. This is a `ui-016` picking limitation reached from a new
direction, and `ui-032` (the enclosed-body picking task scenario 5 is also blocked on)
is the natural place for it rather than a task of its own; the sweep result is recorded
here so that scoping does not have to rediscover it.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Confirm the occlusion gap and decide where it belongs. Place a Raspberry Pi 5, try by hand to drill into `hole1`-`hole4` — including by orbiting underneath the board, which the automated sweep did not try, since the hole's underside is coplanar with the PCB's and may or may not win the depth tie. If it is genuinely unreachable from every angle, fold it into `ui-032`'s scope (an occluded *part*, alongside its enclosed *body*) rather than filing a fourth picking task. `docs/snap-align.md` already tells users to orbit until the part faces them, which is the honest workaround only if it actually works. | OK | 2026-11-14 (`FIND-testing-019`): production build (`npm run build`, `vite preview`), laptop 1440x900, Chromium and WebKit, Raspberry Pi 5 (hole centres from the Inspector: hole1 -39.25,-24; hole2 18.75,-24; hole3 -39.25,25; hole4 18.75,25; 3.25 mm, z 2.16, 8 mm tall). Real clicks on the centre and four points 1 mm round each, Pi already selected, five clicks per hole. **Show hidden parts off:** the holes are drawn as through-holes, so from Top and Bottom a click lands on the grid and deselects (0 of 5 each); from the 35 degree Home view hole1 reaches `usbc` (5/5), hole4 `usb1` (5/5), hole2 and hole3 `mb` (3-4/5); from -72.7 degrees under the board nothing (Chromium, 0/5) or `mb` (WebKit, 2/5). **Show hidden parts on:** from Top and from Bottom every hole is reached 5/5 in both engines; from Home hole2 and hole3 3/5 (the rest `mb`) and hole1, hole4 never (`usbc`, `usb1` in front); from -72.7 degrees under, all four 5/5 in Chromium and 3-4/5 in WebKit. Also reachable by name from the Inspector Parts list (all four selected, positions above). So the occlusion gap closed when the cutters became hidden parts: reachable by click from above, below or under with Show hidden parts on, and from the list always. `docs/snap-align.md` already points at the Objects list for holes. |
| 2 | Feel check on the new operand line ("Aligning **Raspberry Pi 1 › ethernet** to **Cube 1**"), on real phone and tablet hardware rather than an emulated viewport. It measured fully inside the popover at 390px with no page scroll, but two things are judgment: whether it reads as *confirmation to check* or as decoration one skims past on the way to the commit button, and whether a genuinely long composite part name (the catalogue ships names like `powerswitch-button` and `clearance-statusled`) wrapping to three lines pushes the Cancel/commit pair uncomfortably far down a 390px-tall popover. | Open | |

### core-024 — a placed composite is now meshed part-by-part; look at the two interpenetrating recipes on real hardware (2026-09-18 00:52)

`src/render/mesh.js` draws a `Group` body one mesh per visible part instead of one
combined solid, and warned in its own module doc that two shipped composites
interpenetrate — `hardware.bolt`'s `tap` overlaps `head` and `thread`, and
`kit.anchor`'s `hole` shares a **coplanar face** with its `post` — asking for a look
"when those rows land". Before this task no *placed* composite ever reached that path,
because the drop translate flattened it; now every one does.

**Already measured, so this is not an open question so much as a second opinion on a
different GPU.** A/B screenshots at a hard zoom and from the Front view, with the change
stashed and unstashed (the toggle itself verified live, so it is a real comparison):
`hardware.bolt` is **byte-identical** both ways, and `kit.anchor` differs by **52 pixels
out of 1 296 000** (max channel delta 55) in the 3/4 view and 19 px (max delta 9) from
the front — present, and far below visible. That was headless Chromium on this machine.
Depth-buffer precision and coplanar-face tie-breaking are exactly the things that differ
between GPUs and drivers, which is the one reason this is worth a human's eye rather
than closed on the numbers. `mesh.js`'s own documented fix, if it reads badly, is to
fall back to the combined mesh for that body (the `holes` branch is the pattern),
trading its pick depth for a clean surface — not to re-union everything.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Place an **Anchor** (Kit Parts) on a real phone/tablet, zoom in hard, and orbit slowly around the join between its `post` and its `hole` — looking for a flickering or shimmering seam where the two share a face, which is what a z-fight looks like in motion and what a still screenshot cannot show | Open | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Mac half: Anchor orbited in 24 steps at three views, still-frame diff 0 px, worst temporal-spike region 3-30 px, no compact blob at the post/hole join. Device half stays open. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/A-boltanchor-*.png. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |
| 2 | Same, for a **Bolt**, at the base of the head where `head` and `tap` share the `z = 0` plane — the one coincident surface in that recipe, normally face-down on the grid and so usually hidden | Open | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Mac half: Bolt, same orbit, worst region 3-30 px, still-frame diff 0 px, no seam at the head/tap plane. Device half stays open. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/A-boltanchor-*.png. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |
| 3 | Confirm a placed composite still reads as one solid object rather than visibly separate pieces, at ordinary working zoom on a real device — the question the pixel diff answers only for one GPU | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Bolt and Anchor at ordinary zoom: both panel agents see each part as one solid object, no seams. Both noted a dark purple ellipse on the anchor's bottom face (probably the cavity; not looked into). Chrome/Metal only. Shot /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/A-boltanchor-tilt3z4-still.png. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |

### ui-031 — the Inspector's collapsed tab overlaps the bottom of the open Library sheet at phone width (2026-09-18 00:05)

One layout observation the Step 6 drive surfaced and **measured**, which no acceptance
scenario covers and which this task did not create but did make far easier to reach.
At 390x844, with the Library sheet open *and a body selected*, the Inspector's collapsed
tab occupies y 748-792 while the Library sheet still spans y 456-844 — so the tab sits on
top of the sheet's bottom **96 px**, about two rows' worth. With `ui-030`'s eleven rows
you rarely scrolled that far; with this task's twenty-six you routinely do, and the last
row (PiTFT 2.4) is exactly where you end up.

**Ruled out already, so nobody re-checks it**: this does not block anything. The sheet
scrolls (`overflow-y: auto`, `scrollHeight` 1499 against a 388 px sheet), every row can
be brought above the tab, and the drive placed a Pi 5 by touch from the Raspberry Pi
section at the bottom of the list with no trouble. It is also not row-count-dependent in
its *cause* — the same overlap exists with two rows — so it is a pre-existing
sheet-stacking question, not a regression. What is new is only how often you meet it.
Left as a judgment call rather than fixed here, because deciding how two bottom sheets
share one slot is a layout concern of its own and not this task's to settle unilaterally.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real iPhone: open the Library sheet with something selected, scroll to the bottom of the Raspberry Pi section, and judge whether the Inspector tab sitting over the last ~2 rows reads as broken or as ordinary sheet stacking. If broken, file it as its own `ui-*` task (inset the sheet's bottom padding by the tab's height, or collapse one sheet when the other opens). | Open | |
| 2 | Same viewport: confirm the two Model dropdowns are comfortable to operate with a thumb. They are 32 px tall rather than the rows' 44 px — a deliberate call so twelve extra controls don't cost twelve rows of height in a 46vh sheet, but 32 px is below the usual 44 px tap-target guidance and only a real thumb can settle whether that was the right trade. | Open | |

### ui-030 — hardware parts are much smaller than the primitives they share a grid with (2026-09-17 19:35)

Two visual/feel judgments that the acceptance drive surfaced but cannot settle, both
about *scale* rather than correctness — the geometry is right and dimensionally verified
against V1, and `ACCEPTANCE.md` scenarios 1, 2 and 5 already cover placement, selection
and the Inspector on a standing basis, so only what they cannot judge is logged here.

An M4 nut is about 8 mm across and an M6 washer about 12 mm, against a default Cube of
40 mm, and at the viewport's default zoom the nut and washer render as a few pixels each
(visible in the drive's own screenshot: the bolt reads clearly, the nut and washer are
specks). Nothing is wrong — those are the real sizes of those parts — but whether the
defaults should be bigger, or the camera should frame a newly-placed body, is a taste
call for a human at a real screen. The related, sharper consequence *is* already logged
where it belongs (a bolt inside a shell cannot be picked by clicking at all — scenario 5's
own entry, and `TODO/core-024`).

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At the default zoom on a real screen, are a placed Nut and Washer big enough to see and to click, or should the Hardware rows' default specs be larger (or the camera frame what was just dropped)? | Issue | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. At default zoom a placed M4 Nut projects to 18x16 px and a Washer to 26x17 px at laptop width (canvas 920 px wide); at phone width the nut is about 16 px across (read off the screenshot). Thresholds: 24 px (WCAG 2.5.8) and 44 px for touch. Filed as TODO/FIND-ui-130. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/E-laptop-nut-full.png, E-phone-nut-full.png. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |
| 2 | On a real phone and a real tablet: the Library sheet now holds eleven rows and Hardware is below the fold, so reaching Bolt is a genuine scroll inside a 46vh sheet. Does that scroll feel right with a thumb, or does the sheet want to be taller / the sections collapsible? | Open | |

### core-021 — a Y-axis bisect now names its halves the other way round (2026-09-17 13:56)

One entry, and it is a genuine judgment call rather than a restated pass. `core-021`
found that `core-019`'s straight `bisect` was wrong on the `y` axis — V1 builds that
one cut plane from a left-handed basis pair, so its `negative` is the **maximum**-side
half on `y` and the minimum-side half on `x`/`z`. The port now reproduces V1 exactly,
which is this project's standing rule and is fully covered by fixture cases on both the
straight and angled forms. What no test can decide is whether faithfully reproducing
what is almost certainly a V1 *oversight* is the right call for a human driving the
app, who has no reason to expect one axis to behave differently from the other two. The
alternative — "negative is always the lower side", diverging from V1 and documenting it
— is equally defensible and was not chosen unilaterally. Everything else this task
touched is covered: 848 unit tests, and `e2e/resize-bisect-operation.e2e.js` re-run
green including its real Y-axis cut.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Bisect a cube on **Y** in the running app, drill into each half, and judge whether `negative` landing on the far side reads as a bug. If it does, that is a decision to diverge from V1 — file it as its own TODO rather than patching it here | Issue | Decided without waiting for the hand-drive: the user judged it a real inconsistency at this task's own check-in (2026-09-17) and chose to diverge from V1 rather than keep it. Filed as `TODO/core-022-bisect-negative-always-min-side.md` |
| 2 | Read `docs/resize-bisect.md`'s new "a cut on **Y** names them the other way round" paragraph cold and judge whether it actually prevents the surprise, or just documents it after the fact | N/A | Moot once `core-022` ships — that paragraph is removed rather than kept, since there's no longer a per-axis exception to explain |

### core-018 — a broken Firefox toolchain, and two shapes no bounding box can judge (2026-09-16 23:28)

Step 6 re-drove five acceptance scenarios and re-ran two closed findings' repros, and all four
new recipes were evaluated through the real render bridge in both Chromium and WebKit (identical
triangle counts, all-finite vertex data, no page errors). What is left here is one environment
fault that needs a human on their own machine, and two judgments that are about whether a shape
looks *right*, which V1 agreement cannot settle — the port can reproduce V1 exactly and V1 can
still be a shape nobody wants to print.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Firefox will not launch in this environment at all** — `browserType.launch: Could not find profile folder`, failing all 276 firefox-project e2e tests. Confirmed pre-existing and unrelated to this task by reproducing it on a clean stashed tree at HEAD. Chromium and WebKit are unaffected (587 passed, 0 failed). Needs a human to decide whether the Playwright Firefox install is corrupt here only (`npx playwright install firefox`) or whether CI sees it too — until then, one of the three engines `CLAUDE.md` names as a real target is unverified for every task, not just this one. | N/A | Closed 2026-11-01 (testing-005): Firefox projects launch and run in every full e2e run now (`playwright.config.js` firefox projects; `TODO/done/testing-001-firefox-tablet-file-menu-flake-under-load.md` traced a firefox-tablet run on 2026-10-15; `.githooks/pre-push` requires a full e2e run). |
| 2 | **Does the `Spacer`'s diagonal cross-brace look right, and is it printable?** Its geometry reproduces V1 to 0.000000 mm³ and its angle is asserted against closed-form trigonometry, so it is provably the shape V1 makes — but nobody has looked at a picture of one. Worth a glance specifically at where the two mirrored bars cross near the centre and at the 3.0mm-rounded ends (V1 asks for 3.1 and is silently clamped): a brace that is correct and still has a sliver or a near-tangent overlap there is a print problem, not a geometry problem. | OK | 2026-11-14 (`FIND-testing-019`): production build (`npm run build`, `vite preview`), laptop 1440x900, Chromium. Spacer placed from the Library (bounds 64.2 x 55.2 x 11 mm, volume 2 427.5 mm³), rendered from Top and Home, zoomed. The two mirrored braces cross cleanly at the centre (no sliver or notch at the crossing) and the rounded ends sit on the corner pads. `check_printability` through the tool registry: 0 errors, 5 warnings, all "Wall 1 mm thick ... below the 1.2 mm minimum wall" at z = 9 ((26.1, 25.7), (-25.9, 24.8), (29.7, 21.5), (-9.5, 21.4), (9.7, 21.5)), the frame lip and brace-to-pad joins, not the crossing; the heuristic note applies. Faithful to the V1 dimensions, so not filed. |
| 3 | **Is the `hatStandoff`'s peg-through-pad the intended solid?** V1 unions a 2.8mm peg straddling z=0 with a 6.2mm pad, so the peg protrudes 1.5mm *both* above and below the pad rather than standing on it. That is faithfully ported and fixture-confirmed, but it means the part as built has a spigot on its underside; whether a real HAT standoff should be printed that way, or whether V1's shape assumes the underside gets cut by whatever it mounts into, is a call for someone who has handled one. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### core-017 — one pre-existing rim-op limit, and a hidden-volume judgment call (2026-09-14 19:34)

The geometry needs no hand-check and is deliberately not listed below: every part of all
four small displays is diffed against real `jscad-raspberrypi@62a8e3b` bounding boxes in
`__fixtures__/raspberrypi.smallDisplays.v1-reference.json`, mutation-tested three ways, and
all four were rendered live in the viewport during Step 6 as genuinely drawn boards rather
than blank frames. What is left is one limit that predates this task and one call a bounding
box cannot settle.

Row 1 is the important one. It was **found by driving the app during this task's Step 6 but
is not caused by it** — it reproduces identically against `git show HEAD:src/core/kernel/
fillet.js`, verified directly. It is a genuine contradiction between `ui-027`'s stated
Interaction model and `fillet.js`'s `assertPrismaticBand` guard, and settling it is a product
decision (narrow the doc, or relax the guard for the cases where the band really is
prismatic) rather than a bug fix, which is why it is logged here instead of being fixed
inside a commit about display recipes.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | `ui-027` says "committing a *second* Fillet/Chamfer against a *different* face of the same, already-rounded body must work identically — nothing about this control is one shot per body." It is not so for a **perpendicular** face: fillet a 40mm cube's Top (+Z) at r=3, then try Chamfer on Right (+X) at r=2, and the popover shows *"the solid is not prismatic over the rim band — cross-section area changes from 1590.044mm² at the cut plane to 1481.431mm² at the face."* The guard is correct (the rounded top really does make the x-section non-prismatic) and it fails loudly rather than returning wrong geometry, so nothing is unsafe — but the documented promise is wrong as written. Decide which side moves, and file the follow-up: narrow `docs/fillet-chamfer.md` and `ui-027`'s wording to "a different face, provided the band is still prismatic", or teach the guard to accept a band whose section change is itself the previous rim op. Note the *opposite* face (`z-` after `z+`) should still work — worth confirming while you are here. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | `miniPiTFT`'s `display-clearance` is the catalogue's first **outward-flared** volume (V1's `.chamfer(-5, 'z+')`) — a frustum 10mm wider at the top than the display it protects. It is hidden geometry, so nothing renders it and no acceptance scenario can see it. Once something consumes clearance volumes for real (an enclosure generator, or a Library row that can place one visibly), eyeball the flare against a real Adafruit Mini PiTFT: is a 5mm-per-side draft over the top 5mm actually the clearance a printed case wants, or was V1's number chosen for a different bezel? The port reproduces V1 exactly either way; this is asking whether V1 was right. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 3 | `fillet.js`'s cross-section is read through `project`, whose `unionGeom2` round-trip inflates the outline by a shape-dependent ~6e-6 to 6e-5 mm. Harmless and invisible on an inward rim (it lands inside the remainder), and the reason `display-clearance` is compared to V1 at 4 decimal places rather than the 9 every other part uses. If a future task ever needs a rim op accurate to better than a micron — or starts stacking outward flares, where the error would compound — this is the place it comes from, and the fix is a section reader that does not round-trip through `unionGeom2`. Nothing to do today; recorded so the next person does not rediscover it from scratch. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### core-016 — the touch-display attachment a user cannot yet perform by hand (2026-09-13 19:50)

The geometry needs no hand-check and is deliberately not listed below: every part of both
screens is diffed against real `jscad-raspberrypi@62a8e3b` bounding boxes in
`raspberrypi.touchDisplay7inch.spec.js` / `raspberrypi.touchScreen2.spec.js`, that diff
was mutation-tested so it cannot be a test that never bites, and Step 6 drove the whole
assembly live in the running app — a real `raspberrypi.bplus` plus each real screen,
attached with the sub-part-addressed `group.align`/`group.snap` records, matching V1 to
1.4e-14 mm. `TODO/ACCEPTANCE.md` scenario 3 now carries that as a standing check, so it
is not restated here.

What is left is one real gap and two judgment calls no bounding box can settle.

Row 1 is the important one. This task's whole design is that the board-attachment step
becomes *the user's own* `ui-026` Snap/Align action — but the popover states, in its own
copy, **"Whole-object snap/align only — sub-part addressing isn't available yet."**
`core-013` registered `pieces` and the kernel honours it (proved live), but no UI builds
such an operand, so a user can snap the screen to the Pi as whole objects and cannot say
"this mounting pad against that hole". That is the same standing blocker scenario 5
records as its "Blocker 2", now reached from a second direction, and it is the difference
between this recipe pair being *usable as designed* and merely *correct*. It wants its
own `ui-*` task rather than another VERIFY row next time it is noticed.

Row 2 is the `noGoPower` narrowing, which is exact for the case V1 itself produced and
only diverges outside it — worth one look by someone who actually designs enclosures,
since they are the only person who can say whether the frozen offset matters.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Snap/Align cannot address a sub-part from the UI, so the board attachment this task is designed around is reachable only through the command layer. Confirm the gap, then file it as its own `ui-*` task (sub-part operands for `group.snap`/`group.align`, feeding off `ui-016`'s pick-depth selection) rather than logging it here again. | N/A | 2026-11-13 (`FIND-testing-021`): overtaken by `ui-040` and `ui-063`. Drove it at 1440x900: grouped two Cubes, placed a Cylinder, opened the Inspector's Objects list, expanded `Group 1`, ticked its `Cube 1` part with the mouse (the count read *2 selected*), pressed **Align**. The popover headed *Aligning Cylinder 1 to Group 1 › Cube 1* with a Target list, so a sub-part is an operand from the UI. The popover's old *Whole-object snap/align only* sentence is gone. |
| 2 | `raspberrypi.touchScreen2`'s hidden `noGoPower` marker is frozen at the offset a stock B+ at the stock attachment datum produces (zero divergence from V1 there, asserted). Judgment call for whoever designs a real enclosure: does a marker that no longer tracks the header on a non-stock board cause a real problem, or is the frozen constant fine? If it is a problem, that is revival condition #2 in `docs/decisions/composite-recipe-geometry.md` (reopen recipe nesting), not an ad-hoc fix. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 3 | Both screens are large parts (193×111 mm and 143×91 mm) next to a 85×56 mm board. Eyeball on a real phone and tablet whether a freshly placed screen frames sensibly at the default camera distance, or whether it arrives clipped/oversized enough that a Library row for these would need its own framing behaviour. | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Projected size at the default camera, bounding box of changed pixels: Raspberry Pi Screen 449x239 px (49% of the canvas width) and touchScreen2 348x181 px at laptop, unclipped; board 217x121. On the phone emulation the screen fills the width but is not cut off (screenshot). Real phone/tablet not tested. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/E-laptop-screen-default.png, E-phone-screen-default-full.png. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |

### core-015 — three camera-module judgment calls a bounding box cannot answer (2026-09-13 19:15)

The geometry is not in question and needs no hand-check: every part of all five variants
(plus the flipped HQ) is diffed against the real `jscad-raspberrypi@62a8e3b` library's own
bounding boxes in `raspberrypi.cameraModule.spec.js`, that diff was mutation-tested so it
genuinely bites, and a v3 and an HQ were both rendered in the real viewport during this
task's Step 6 drive. What is left is three things a number cannot settle — two of them
*port decisions with no V1 precedent to check against*, which is what separates them from
`core-014`'s row 1 below.

Nothing here belongs in `TODO/ACCEPTANCE.md`: no scenario can reach this recipe yet (there
is still no Hardware/Kit Library row to drag a camera from), and all three are one-time
looks rather than standing checks.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Render each of the five models and eyeball them against the real cameras (or V1's own `test/images/create a camera v*.snap.png`): do the sensor, lens barrel, ribbon and mount read as the right parts in the right places to someone who knows the hardware? The fixture proves the port matches *V1*; it cannot prove V1 was right. | Open | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Side-by-sides, V1 snapshot left and WarpCad render right (light theme, home view; V1 images copied from `~/src/jscad/jscad-raspberrypi/test/images/`, read-only): `/private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/sbs/cam-v2.png`, `cam-v1.png`, `cam-hq.png` (V1 has no v3 or Arducam match for the v3 default). What matches: the board outline, the four mounting holes, the sensor block and lens barrel in the same place and size ratio on v1/v2; on the HQ camera the lens ring, the tripod/mount block on the left and the two holes match in position. What differs: colours (V1 draws the flex ribbon red and blue, WarpCad draws it dark green and blue-grey and it is mostly hidden under the board at this view; V1's HQ mount is grey and WarpCad's is blue; the lens barrel is black in both). Nothing is in a different place. Whether V1 itself was right stays with someone who knows the hardware, so the row stays Open. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |
| 2 | Confirm `DEFAULT_MODEL = 'v3'` is the right default. This is a **port decision with no V1 answer to check against** — V1 ships five separate factories and no shared entry point, so nothing was carried over here. `v3` was chosen as the current-generation standard camera and to keep the op usable with no params, like every sibling composite. If a different default (or requiring `model` outright) is wanted, it is a one-line change in `raspberrypi.cameraModule.js`. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 3 | Confirm which way `flipTripodMount` should default for the HQ camera. V1's `HQCameraModule(flipTripodMount = false)` gives the name but not the intent; measured here, `true` raises the tripod post in z relative to the mount block (`3.68..15.18` vs `-0.2..11.3`). Whether the `false` default matches how a real HQ camera's tripod boss actually sits needs the hardware in hand. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### core-014 — two judgment calls only a Raspberry Pi owner can settle (2026-09-13 18:44)

The geometry itself is not in question and does not need a hand-check: every one of the
115 parts across models 2/3/4/5 is diffed part-by-part against the real
`jscad-raspberrypi@62a8e3b` library's own bounding boxes in
`raspberrypi.bplus.spec.js`, matching to 1.4e-14 mm, and the board was rendered in the
real viewport during this task's Step 6 drive. What is left is two things a number
cannot answer, both deliberately chosen rather than discovered, and both needing an eye
that knows the actual hardware — which is this project's own author (they wrote
`jscad-raspberrypi`).

Neither belongs in `TODO/ACCEPTANCE.md`: no scenario can reach this recipe yet (there is
no Hardware/Kit Library row to drag a Pi from — see the retired task's Interaction model
section), and row 1 is a one-time look, not a standing check.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Render a `raspberrypi.bplus` at each model and eyeball it against a real board (or V1's own `test/images/create a bplus.snap.png`): do the connectors read as the right parts in the right places to someone who knows the hardware? The diff proves it matches *V1*; it cannot prove V1 was right, and V1's own dimensions were eyeballed with the `dimCheck` rulers this port drops. | Open | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Side-by-sides, V1 left and WarpCad right (`/private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/sbs/bplus.png`, `bplus3.png`, `bplus4.png`; WarpCad models Pi 2/B+, 3 and 4 against V1 `bplus`, `bplus3`, `bplus4`). What matches: board outline, the long GPIO header along the back edge, the shorter header and the small header at the left, the USB stack and Ethernet block at the right, the audio jack and micro-USB at the front-left, the corner holes; all in the same places and proportions. What differs: colours (WarpCad's Ethernet is orange where V1's is light grey, the audio jack is blue-grey where V1's is a black plug on a grey body, the board is a translucent green with grid lines showing through where V1's is opaque, V1's holes show gold rings) and the camera is zoomed out compared with V1. The hardware-knowledge half (was V1 right) stays Open. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |
| 2 | Decide whether the board should render **drilled**. V1 assigns `group.holes`, so its combined board has the four mounting holes cut through it; this port carries them as hidden `hole1`-`hole4` parts only, because no `OpRecord` field reaches `group.js`'s `addHole` (see the retired task's deviation 2). The board therefore renders solid. If drilled is wanted, it needs either a record-level hole flag or a `boolean.subtract` in the recipe — file whichever as its own TODO. Note V1's own subtraction also carves the micro-USB shell, which overlaps `hole1`, so "match V1 exactly" is probably not the right answer. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ui-029 — a frozen field's affordance, and a second kernel-error surface (2026-09-12 22:05)

Editable Inspector parameters are functionally verified (unit suite, the full 9-way
e2e matrix, and a hand-drive at laptop/Chromium, laptop/Firefox and phone/WebKit that
moved `ACCEPTANCE.md` scenario 2 off its long-standing PARTIAL blocker). Two things
left over turn on human judgment an automated check cannot render, and both are
deliberately *shared* with `ui-027`'s entry above rather than diverging from it —
if either is changed, both surfaces should move together.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | A body carrying a Fillet/Chamfer has its **Parameters** fields frozen, with a note naming the op. The note is legible and correct at all three reference widths (checked). What is *not* settled: whether a frozen field **looks** frozen at a glance before anyone reads the note. The only visual difference is `:read-only`'s `color: var(--text-2)` against `--text-1` plus the absent `--editable` border, which in the laptop screenshot is subtle enough that the Diameter box reads much like an editable one. Decide on a real screen whether that needs a stronger treatment (dimmed ground, a lock glyph) — and if so, apply it to *every* read-only field in the panel (Size, sub-part Transform), not just this case | Open | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Premise changed: since `data-007` a filleted body's Parameters fields stay editable (checked: after a z+ fillet of 5 mm every `inspector-param-*` input is `readOnly: false`; e2e `inspector-param-edit.e2e.js` 'a filleted body stays editable'). The read-only look that remains is the Transform section's Size x/y/z boxes (`readOnly: true`). Measured against Position (dark / light): text colour dE76 23.1 / 26.5, text contrast 6.8 vs 12.9:1 / 7.9 vs 17.8:1, border dE76 9.0 / 9.8, background identical. The panel could not answer: my crop showed Position and Rotation but not the Size boxes (both agents said so), and the panel budget was spent. Left Open: the question is whether the dimmer text and border read as 'locked' at a glance. Shots `shots/H3b-*-transform.png`. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |
| 2 | The Inspector's kernel-error message reuses `ui-027`'s convention verbatim, which means it also inherits its wording problem: a rejected diameter shows `document.append: primitive.cylinder could not be applied — primitive.cylinder: height must be a positive number of millimetres, got 0`. The second half is genuinely useful; the `document.append:` prefix and the repeated op key are internals leaking into a user-facing panel. Judge on a real screen whether to strip the command-layer prefix at the display boundary — this is the same row as `ui-027`'s own error-wording check, and the fix belongs in one shared place now that there are two surfaces showing it | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. The op key prefix `primitive.cylinder:` leaks; both propose `Height must be more than 0 mm.` The `document.append:` prefix is already stripped. Filed `FIND-ui-129`. |

### ui-027 — icon-only phone toolbar, and the first user-facing kernel-error message (2026-09-12 15:58)

Two things this task shipped are functionally verified (headless e2e, all three
engines and viewports, plus a hand-driven check against the real dev server) but
turn on human judgment an automated check can't render:

1. Adding Fillet/Chamfer made the Operations toolbar's phone-width layout run out of
   vertical room — 4 wrapped rows of 2 buttons reached into `NavigationChrome`'s own
   space once the Inspector sheet pushed it up on selection (measured: `y≈242` vs.
   the chrome's `y≈207`). The fix hides each button's text label below 640px width,
   leaving icon + `title`/`aria-label` only — the same `--tap-compact` square-icon
   pattern `NavigationChrome.vue` already uses at its own breakpoint, not a new one.
   Confirmed this clears the collision and that every `*.e2e.js` spec covering this
   toolbar still passes at phone width. Not confirmed: whether eight bare glyphs
   (∪ − ∩ ⊞ ⇥ ⇔ ◠ ◢) are actually *identifiable* at a glance on a real phone, or
   whether they read as an opaque row of symbols until tapped once.
2. `commitFilletChamfer`'s catch block is this toolbar's first path that shows a
   *thrown kernel error* to the user (every op before this validated only shape, not
   a value like radius-vs-solid-size) — a plain `<p>` inside the popover, unstyled as
   an alert (this codebase has no `--danger` token yet — see the CSS comment). Its
   *existence* and *trigger condition* are e2e-tested; its wording
   (`fillet.js`'s own `Error` message, e.g. `"modify.filletRim: radius 45mm must be
   less than the solid's 40mm extent along the axis"`) has not been read by anyone
   who didn't already know what it meant.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone, glance at the Operations toolbar with a body selected (all 8 icon-only buttons visible) *before* reading any documentation. Can you guess what Fillet (◠) and Chamfer (◢) do from the glyph alone, or only from `title` on long-press? If it's illegible, a future task should swap in real SVG icons rather than Unicode glyphs. | Open | 2026-11-14 (`testing-029` panel): Cold-read half (emulated 390x844): A and B both guessed Fillet (◠) as round and Chamfer (◢) as bevel from the glyph alone, so the glyphs pass. Weak glyphs: Align ⇔, Split ⫽. The real-phone half stays Open. |
| 2 | Trigger the radius-too-large error (Fillet a face with a radius at or past the solid's own extent) and read the resulting popover message as a first-time user would, not as the person who wrote it. Does "radius 45mm must be less than the solid's 40mm extent along the axis" make sense without already knowing what `fillet.js` means by "extent along the axis"? | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. 'modify.filletRim … extent along the axis' is jargon and gives no limit. Judged from the string (the code says 'narrower than'). Filed `FIND-ui-129`. |

### ui-020 — sketch mode on real touch hardware, and the lines' lifetime (2026-09-12 17:35)

Scenario 9 now covers sketch mode's whole flow on a standing basis, and the Step 6
drive already measured the layout numerically at all three reference viewports
(bounding-box collision checks against the orientation gizmo and nav chrome, plus a
10×10 hit-test grid of how much canvas is actually reachable — 69% at phone width in
sketch mode). What that *cannot* settle is fingertip precision and the feel of a
drawing gesture, neither of which a synthetic pointer or a headless engine reproduces.
Rows 1-2 are that. Row 3 is a limitation this task knowingly ships rather than a thing
to judge.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone and iPad, draw several lines in a row with a fingertip. Is the 14px pick tolerance (`SKETCH_PICK_TOLERANCE_PX`) enough to reliably *select* a thin line by tapping it, and are the 11px endpoint handles grabbable without zooming in first? A fingertip contact patch is far larger than either number, and both were tuned against a mouse. | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): Production build of the working tree as it stood (Vite build, preview server), Chromium touch emulation (hasTouch, isMobile, DPR 2) at the row viewport unless noted; fingertip taps scattered Gaussian sigma 3.5 mm = 13.2 CSS px with bench/tap-scatter.mjs. Phone 390, sketch Select tool on a thin open two-segment polyline, 200 taps scattered around a segment midpoint: 78 % selected it, 22 % selected nothing (14 px tolerance, sigma 13.2 px). With the line selected, a 30 px drag started at sigma 13.2 px around an 11 px endpoint handle grabbed it 81.5 % of the time (16 % deselected the line, 2.5 % left it selected). Real thumb and iPad stay here. |
| 2 | On the same hardware, judge whether the drawn stroke reads clearly against the grid in **both** colour schemes — the line is `--sketch-stroke` (a bright cyan) and the grid's major lines are close in weight. A stroke that disappears into the grid on a sunlit phone screen is the same class of defect as the second attempt's too-dark scene, and the only device that can answer it is a real one outdoors. | Open | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Mac half OK; the sunlit-phone half stays Open. Sketch stroke `--sketch-stroke` #38bdf8 (dark) / #0369a1 (light), 1.75 px: contrast vs ground 8.1:1 / 5.1:1 (threshold 3:1 for non-text UI); vs the strongest grid line pixel 4.2:1 / 2.6:1 (light is just under 3:1) but the hue difference is large (dE76 53 / 40) and the stroke is 1.75 px against a 1 px grid line. Panels A and B (batch 1) saw the strokes as clearly distinct in both themes. Shots `shots/H2-*-strokes.png`. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |
| 3 | Confirm the missing-delete story is acceptable for now: there is **no way to delete a sketch line**, so a mis-drawn line stays for the session (`docs/sketch-mode.md` says so out loud under "Coming later"). Undo/redo does not exist yet either, so this is not an oversight specific to sketching — but sketching is the first feature where a user can create clutter in one careless gesture. If it grates in practice, that is a signal to pull a delete/undo task forward rather than leave it to the sketch-tools milestone. | N/A | 2026-11-13 (`FIND-testing-021`): overtaken by `sketch-005` and `data-003`. Drove a Sketch at 1440x900: drew two rectangles with the mouse, chose the Select tool, clicked one rectangle's edge, pressed the toolbar's trash (**Delete**); only the other rectangle stayed. **Done** committed a Sketch 1 measuring the surviving rectangle, and the header Undo then read *Undo: Place Sketch 1*. A line can be deleted, and undo exists. |

### ui-026 — Snap/Align operation (2026-09-11 20:20)

The Snap/Align popover is a **modal-style overlay with a full-page, click-catching
backdrop** — a departure from `ui-019`'s row-anchored gear popover, forced by a real
phone-width collision with `NavigationChrome` (see the retired TODO's own note and
`OperationsToolbar.vue`'s `.ops__popover` CSS comment for the mechanics). Functionally
verified by headless Chromium and Firefox/WebKit-equivalent hit-testing (a real click
on a background control while the popover is open is genuinely blocked), but the
*feel* of a centred modal appearing over the viewport — rather than growing out of the
button the way every other popover in this app does — hasn't been judged on real
phone/tablet hardware.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On real phone/tablet hardware, open Snap/Align and judge whether the popover reads as "this button opened a thing" or as a jarring, disconnected overlay. | Open | |

### ui-016 — look at `hardware.bolt` and `kit.anchor` on screen the moment they get Library rows (2026-09-11 20:02)

`ui-016` changed how **every** Group-valued body is rendered: one mesh per named part
instead of one mesh built from `combine()`, which is a CSG union. That union used to
merge parts that interpenetrate into a single clean surface; separate meshes do not, so
two overlapping parts can show a seam or z-fight along their shared boundary.

This is not a hypothetical. Measured during this task's regression check rather than
assumed, by comparing each composite's per-part boxes:

- **`hardware.bolt`** — its visible `tap` part overlaps *both* `head` and `thread`.
- **`kit.anchor`** — its `hole` part overlaps `post`, and the two share a **coplanar
  face** at `y = -5`, which is the worst case for z-fighting specifically.

Every other composite is clean (`kit.board`, `hardware.washer`: one visible part each;
no group anywhere carries `holes`, so the combined-mesh fallback never triggers today).

**Why this is a manual item and not a spec or a scenario**: neither composite is
reachable from the Library — the Hardware and Kit sections are M2 — so nothing a user
can place today renders through the overlapping path at all, and there is no scenario
that could drive it. It is also a pure *visual* judgment: "does this read as one part
or as two badly-drawn ones" is not a number a test can assert. `ACCEPTANCE.md`
scenario 5 (the bolt's tap clearance) is still marked NOT DRIVEABLE for the same
reachability reason, so it does not cover this either.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | When `hardware.*` / `kit.*` get Library rows (M2), place a **Bolt** and an **Anchor**, orbit right around each one, and look for a seam or flickering surface where `tap` meets `head`/`thread` and where `hole` meets `post` — at all three reference viewports, and in WebKit as well as Chromium (depth-buffer precision differs between engines, so a z-fight can be engine-specific). If either reads badly, the fix is documented at `createBodyObject` in `src/render/mesh.js`: fall back to the combined mesh for that body — trading its pick depth for a clean surface — rather than re-unioning every group and losing pick depth for the ones that never needed it. | Open | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Chrome half OK, WebKit and phone/tablet orbit not run (desktop Safari automation does not work here; stays Open). Premise changed: Bolt and Anchor are now Library rows. Laptop Chrome, a Bolt and an Anchor dropped and orbited in 24 steps at three tilts: still-frame difference 0 px between repeated captures; worst temporal-spike region 3 to 30 px of a 920x847 canvas (0.004%), no compact blob at the tap/head or hole/post join (stage-1 run of the same scene, `/private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/stageA-boltanchor.json`, shots `A-boltanchor-*.png`). Headless all-engine depth spec `e2e/webgl-depth-translucency.e2e.js` still covers the rest. Acceptance 5 re-driven by hand in this run (scripts `g3.mjs`): Cube 40 mm dropped, Bolt dropped inside it, nothing selected, the Cube's check then the Bolt's `tap` part check in the Inspector list, toolbar read `Cube 1 then Bolt / screw 1 › tap`, Subtract: one body, volume 64000.000 to 60362.401 mm3 (a tap cut of 3637.6 mm3, larger than the bolt's metal 2920.801, so the clearance and not the metal cut), Undo restored both bodies. PASS; note that the part names are now `tap-head`, `tap-thread` and `tap`. Shots `shots/G-acc5-*.png`. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. Graduating: automated depth/translucency spec filed as `FIND-testing-015` (real-GPU look stays here). 2026-11-13: the headless part (stable, non-speckled pixels across repeated frames and a nudged angle, all three engines and viewports) is automated by `e2e/webgl-depth-translucency.e2e.js` (`testing-015`); the real-GPU look stays with `FIND-testing-030`. |

### core-020 — the snap radius is wider than the parts, so two solids cannot be drag-placed *partially* overlapping (2026-09-10 22:25)

Found while driving `ACCEPTANCE.md` scenario 4 during `core-020`'s Step 6. Not a
regression and not this task's code — `ui-013`'s snap, behaving as specified — but it
makes a scenario step unperformable as written, and the failure it produces looks exactly
like the bug `core-020` just fixed, which is why it is worth a human's eyes rather than
another assertion.

At the default camera distance the snap engagement radius is 48 px converted to mm, which
scenario 3 already measured at **~83.7 mm** — *wider than a 40 mm cube*. So dragging a
second cube anywhere near the first does not give a partial overlap; it pulls the ghost
into **exact coincidence** (both bodies measured at `-21.62,-21.62,20.00`). Subtracting
two coincident solids then returns an empty body, correctly — but on screen it reads as
"Subtract deleted my model". Scenario 4's step 1 ("drag two solids into the viewport so
they overlap") therefore cannot be performed by drag alone at default zoom; five taps of
zoom-in shrinks the radius enough, and that is how the 29 484.3 mm³ result recorded
against scenario 4 was actually reached.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Judge, by hand on real hardware, whether the snap should refuse a *centre-on-centre* alignment when both solids are already within each other's bounds — or whether an overlapping drop should snap to a face rather than a centre. This is a feel question about what a user means by dropping a part on top of another one, not a numeric one. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | Related and cheap to check at the same time: whether an empty boolean result should say so out loud (a toast, or a refusal) rather than silently leaving a `0 × 0 × 0` body in the scene list. Two coincident operands are the common way to reach it by accident. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ui-014 — a *nearly* coplanar subtract reports the uncut size (2026-09-10 17:20)

Not a feel question and not `ui-014`'s own code — pre-existing `@jscad/modeling` numerics,
reachable since `core-001` — but it surfaces *through* the new Operations toolbar, it is
not covered by any acceptance scenario (scenario 4 measures volume, which is correct), and
it is the kind of thing only a human reading the panel would notice. Logged with the
measurement so nobody has to rediscover it.

When two solids' faces are **nearly but not exactly** coplanar, `boolean.subtract` leaves
paper-thin sliver polygons along those faces, and the slivers keep the result's bounding
box at the **uncut** extent. The material really is removed — the volume is right — but the
three dimension lines and the Inspector's Size row quote the original size, which is the
number a user would actually read and act on.

Measured, two 40 mm cubes overlapping 20 mm, in Chromium:

| faces | polygons | volume (expect 32 000) | reported size |
|---|---|---|---|
| exactly coplanar | 6 | 32 000 | 20 × 40 × 40 ✅ |
| clearly non-coplanar | 6 | 32 000 | 20 × 40 × 40 ✅ |
| **off by ~0.001 mm** | **10** | **32 004.54** | **40 × 40 × 40** ❌ |

The near-coplanar case is not exotic: it is what you get by **typing a rounded coordinate
for one body against another that was dragged into place**, which is exactly how a user
lines two things up. Reached in `ui-014`'s own drive without trying to.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Decide whether this is worth its own finding (a tolerance-snap on operand coordinates, a post-boolean sliver cleanup, or measuring the result some way other than its raw bounding box) or is acceptable as-is. Judge it by dragging two cubes into rough overlap by hand and typing a round position for one of them, then reading the dimension lines against the shape actually on screen. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ui-014 — the Inspector shows an empty PARAMETERS heading for a boolean result (2026-09-10 17:20)

Cosmetic, one-off, and genuinely a judgement call rather than a defect. A boolean result
has no creation parameters, so selecting one leaves the Inspector's **PARAMETERS** section
header standing over nothing, with the Transform section below it. It is not wrong — the
body really has no parameters — but an empty labelled section reads as something that
failed to load.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Look at it and decide: hide the header when a body has no params, or say something in the empty space ("this shape was built from others"). Visible in the drive's `Subtract 1` screenshot. | N/A | 2026-11-13 (`FIND-testing-021`): the heading no longer stands over nothing. Subtracted two Cubes by mouse and selected the result: PARAMETERS now carries the sentence *This shape is a Subtract of other shapes, so it has no parameters of its own. Select one of the shapes it was built from to change its size.* That is the explain option of the decision this row asked for (`ParamFields.vue`). |

### ui-013 — does a 48 px snap radius *feel* right on real hardware? (2026-09-09 13:12)

A feel judgement, not a correctness question. `SNAP_TOLERANCE_PX = 48` is pinned by unit
tests and its zoom behaviour was measured during the drive (engagement shrank from 83.7 mm
apart at camera distance 420 to ~7 mm at 110, so zooming in genuinely buys finer control),
but "is the assist helpful or grabby" is the one thing neither a test nor a headless
screenshot can answer. At default zoom on a laptop the guides start about 80-110 px out;
on a phone about 60 px.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone and a real iPad, drop three or four solids near each other in a row and judge whether the snap helps or fights you — in particular whether you can still place something deliberately *just* beside another part without it jumping flush, and whether a fingertip's own imprecision makes 48 px feel too small rather than too large. | Open | |
| 2 | Look at the magenta guides on a real screen against the dark grid, at an angle and in daylight. They were chosen (over `--accent`) on a desktop screenshot, where they read clearly; a phone at low brightness is the case that screenshot can't stand in for. | Open | testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Mac half OK; low brightness and daylight on a phone stay Open. Guides while a Cube row is dragged beside a placed Cube: `snap-guide-x` dashed 6 4 and `snap-guide-y` dash-dot, 1.5 px, #e879f9 (dark) / #a21caf (light); contrast vs ground 7.1:1 / 5.4:1 (threshold 3:1). Panels A and B agree: clearly visible against the grid in both themes (light a little less punchy, thin). Shots `shots/H3b-*-guides.png`. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |

### ui-024 — marquee drag feel on real touch hardware (2026-09-07 18:41)

A device-specific quirk, not a correctness question — `e2e/selection-inspector.e2e.js`'s
new marquee tests run across all three engines at all three reference viewports
including phone/tablet, but Playwright's touch emulation dispatches synthetic
`PointerEvent`s directly; it does not reproduce a real capacitive touchscreen's own
scroll-suppression, momentum, or contact-area quirks. Not covered by a standing
`TODO/ACCEPTANCE.md` scenario (scenario 7, touch-only navigation, predates this
control and doesn't cover selection).

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | On a real phone/tablet, tap the nav chrome's **Select** button, then drag a finger from empty grid space: the box should track the finger smoothly with no visible lag, and the gesture must not also scroll the page or trigger the browser's own pull-to-refresh/back-swipe — `touch-action: none` is already set on the canvas for orbit/pan (`ui-018`'s own fix for exactly this class of bug on iPad), but the marquee is new code sharing that same element, not a guarantee it inherited by itself without a real device confirming it. | Open | |
| 2 | Confirm the **Select** button itself is comfortably tappable at phone width next to the existing Orbit/Pan buttons — the chrome row grew by one button for this task, and only a bounding-box assertion (`>=36px`) checked size in e2e, not whether three adjacent small buttons are comfortable to hit accurately with a real thumb. | Issue | 2026-11-15 (testing-031): Issue, filed as ui-135. Production build of the working tree as it stood (Vite build, preview server), Chromium touch emulation (hasTouch, isMobile, DPR 2) at the row viewport unless noted; fingertip taps scattered Gaussian sigma 3.5 mm = 13.2 CSS px with bench/tap-scatter.mjs. Phone 390, Chromium, 200 taps per button. The mode buttons are 48.3x30 px (the gear 26x30), below tap size, 4 px apart. Intended button fired on Orbit 76 %, Pan 79 %, Select 76.5 %, gear 57.5 %; a different control fired on 5 %, 7 %, 8.5 % and 9.5 % (Select went to Pan 4 %, the gear 3.5 %, Zoom in 1 %); 14-33 % of taps selected nothing. Threshold: <= 2 % of taps on a different control: not met. |

### ui-021 — gradient/shadow subtlety at the gizmo's floor size, and on real touch hardware (2026-09-07 17:09)

A visual/feel judgment call, not a correctness question — the e2e spec asserts the
gradients and shadow filter are actually wired up (real `<defs>` entries, real stop
colours, three genuinely distinct axis hues), and a hand-drive at laptop width in
Chromium/Firefox/WebKit confirmed the effect renders and doesn't break hit-testing. What
that drive could not judge: whether the effect still *reads* as 3D shading, rather than
disappearing into noise, at the extremes this task's own Testing section flagged as
worth a second look.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At the gizmo's floor size (58px arm / 40px ring, `ui-017`'s minimum — the size most selections actually render at on an average-sized part) the gradient's highlight band is only a few pixels wide. Screenshots taken during this task's own drive looked fine at 1440×900 desktop resolution, but that is not the same claim as legible on a real phone/tablet screen's pixel density and viewing distance — CLAUDE.md's Responsive Layout section asks for real on-device hand-testing, not just a Chromium viewport emulation, and this task's own drive was desktop-emulation only. | Open | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Panel disagreed: A saw no highlight band on the arrows, B saw a faint lighter stripe. Stays Open with both answers. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/D-phone-floor-gizmo.png, C-laptop-gizmo-crop.png. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |
| 2 | The double-stroke ring "tube" cue (a dim gradient band plus a thin bright core, both drawn from the same points) is the subtlest of the three techniques used here — worth a specific glance on a real device to confirm it doesn't just look like a slightly-thicker single ring, which would mean that particular technique earned its added draw call for nothing. | Issue | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. At the 40 px ring floor (390x844, DPR 3) the double-stroke ring is a 3 px band over a 1 px core. Both panel agents saw a single flat stroke. Filed with TODO/FIND-ui-130. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/D-phone-floor-gizmo.png. Earlier: 2026-11-07: The part this Mac's real GPU and Retina screen can show (headed Chrome and Safari, screenshots, measured contrast) moved to `FIND-testing-030`; the real phone or tablet part stays here. |

### ui-022 — ring arrowhead legibility at phone width and at the gizmo's floor size (2026-09-07 16:17)

A visual/feel judgment call, not a correctness question — the maths is asserted exactly
in `annotate.spec.js` and the e2e spec confirms the markers render, but neither can judge
whether the chevrons *read* as an arrow to a person rather than as a stray dot once the
gizmo shrinks. Not a standing acceptance scenario: scenario 2's gizmo-drag half checks
that dragging still works, not how the ring's own decoration looks at a given size.

`ringArrowheads`' size (`RING_ARROW_SIZE_RATIO = 0.16` of the ring's own screen radius)
was only eyeballed at laptop width against a body sized comfortably above the gizmo's
58px/40px floor (`ui-017`). Two cases that ratio was never looked at:

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | At phone width (390×844), with the ring at or near `GIZMO_RING_FLOOR_PX` (40px) — confirm the two chevrons per ring are still individually distinguishable as arrows, not a single blob, at a real fingertip's viewing distance. | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Ring at the floor (80 px wide gizmo, radius 40): chevron 5.4x4.2 px, the two chevrons of a ring 61-70 px apart; both panel agents saw arrow shapes, not blobs. Emulation only. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/D-phone-floor-gizmo.png. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |
| 2 | On a heavily edge-on ring (camera looking nearly along that axis, e.g. after a standard-view snap) — confirm the chevron near the ring's collapsed end doesn't visually merge into the ring's own line. | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Edge-on rings (top and front snaps) at the floor: chevrons 3.2x2.2 px beside a 3 px ring line; both panel agents could still tell them from the line. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/D-phone-floor-edge-front.png, D-phone-floor-edge-top.png. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |

### core-004 — how a rotation number wrapping past ±180° feels mid-drag (2026-09-06 19:18)

A feel judgment about a number on screen, not a correctness question, which is why it is
here rather than an acceptance scenario: the geometry is right either way, and scenario 2
already checks the *sizes* on a standing basis.

The carried rotation is now canonical — yaw and roll in `(-180, 180]`, pitch in
`[-90, 90]` — instead of a running total. That is what makes a typed absolute rotation
and a dragged one comparable at all, and it is inherent to any faithful representation
(a quaternion decomposes the same way). But it means a ring dragged steadily past half a
turn makes the Inspector's number flip sign — `179°` to `-179°` — rather than counting
on to `200°`. The same is true of the two angles that are not being dragged: they can
move on their own during a single-ring drag, because the composed orientation genuinely
has components on all three axes.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Drag one rotate ring slowly through more than half a turn on a laptop and watch the Rotation fields. Does the sign flip read as the app losing track, or as an obviously-equivalent way of saying the same angle? If the former, the fix is a display concern (an unwrapped "turns" readout, or holding the pre-drag branch for the duration of a gesture), not a change to what is stored — file it as its own `ui-*` finding. | OK | 2026-11-15 (testing-031): OK. Z ring swept through 312 deg at 60 and 150 px/s (laptop mouse, and phone touch), logged each frame. The dial readout keeps counting through the wrap (-301, -302, -303 deg) while the Rotation field flips from -179.2 to +179.8 in one frame: one field sign flip per +-180 crossing, none elsewhere, no other jump. Threshold: one flip per crossing and a continuous drag readout: met. The field is still the only place the wrap shows, so whether the flip reads as lost tracking stays a judgment; no unwrapped-turns field was built. |
| 2 | Same drag on the phone (390×844), where the fields are in a bottom sheet and a thumb is over part of the viewport, so there is less peripheral context for what the number is doing. | Open | 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): phone 390x844 touch, Z ring sweeps as in row 1 behave identically (one field flip per crossing, readout unwrapped). With a cube selected the Rotation Z field is 1274 px down the sheet, outside the visible 471-725 px: the drag readout is the only number on screen. A thumb over the viewport is not covered. |

### ui-023 — legibility of diagonal dimension lines on a tilted part (2026-09-06 19:02)

Purely a visual/feel judgment, which is why it is here and not an acceptance scenario:
the numbers themselves are now correct and are checked on a standing basis by scenario 1's
rotated-body half.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Tip a cylinder over about 60° and look at it on a **phone** (390×844). At laptop width the three lines are clearly readable, but they now run diagonally *through* the gizmo's rotate rings rather than sitting square around the silhouette, and the laptop screenshot is already a little busy where a `40 mm` label crosses a ring. Judge whether the labels stay readable at phone width, or whether the lines want a larger offset (`DIMENSION_OFFSET_PX` in `Viewport.vue`) once they are no longer axis-aligned. | Issue | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Tipped cylinder 60 degrees at 390x844: both panel agents say a line or arrowhead crosses digits of the "50 mm" and "40 mm" labels (also at laptop, less clearly) and the phone view is too busy; the operations toolbar also covers part of the body. Filed with TODO/FIND-ui-130. Shots /private/tmp/claude-502/-Users-johncole-src--WarpCad-warpcad/9d8e1dda-860a-4e56-8e8b-ef82674eabda/scratchpad/shots/C-phone-tipped60.png, C-laptop-tipped60.png. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |
| 2 | While there: two of the three labels can end up close together when a rotation lines two local axes up on nearly the same screen direction (the degenerate case covered numerically in `annotate.spec.js`). The maths is right and the lines are separated by the perspective divide, but whether that separation is *enough* to read at phone size is an eye judgment no assertion makes. | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. 72 views (3 elevations x 24 azimuths) of the tipped cylinder: labels overlapped each other in 1 view (laptop and phone), centre gap under 24 px in 1 view, min 16-17 px; both panel agents: labels clearly separated. Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |

### build-002 — Fix bright white flash before first paint (FOUC) on app load (2026-09-06 18:22)

One entry. The TODO's own Testing section asked for the throttled-load re-check to be
done "by eye" specifically because the defect is a paint-timing race that a numeric
assertion can approximate but not fully stand in for. What was actually run was a
Playwright script (Chromium/Firefox/WebKit) that delays JS/CSS responses by 2s and
samples the `<html>`/`<body>` computed background color and the `color-scheme` meta's
presence 150ms after navigation commit — confirming the dark background (`#10131a`)
and the meta tag are both already in place well before the delayed resources resolve,
on all three engines. That is a solid proxy for "the race is closed," but it is not the
same as a human actually watching a real Slow-3G-throttled load in DevTools and judging
whether any white frame is perceptible to the eye — a synthetic 150ms sample can miss a
one-compositor-frame flash that a live visual watch would catch, and Playwright's route
delay doesn't reproduce a real mobile network's connection-setup latency.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Watch a real Slow-3G + 4x-CPU-throttled load in Chrome/Firefox/Safari DevTools by eye**, on a real machine, and confirm no white frame is visible between navigation and the dark UI appearing — per the TODO's own Testing section, this matters most for WebKit/Safari specifically, since this defect is very plausibly the same white-flash bug both previous attempts shipped on iPad/Safari. | Moved | Moved 2026-11-07 to `FIND-testing-026`: an AI drive can settle it. |

### ui-018 — Shift+left-drag or right-drag pans the viewport (2026-09-06 16:08)

One entry, a real trackpad/mouse-hardware feel judgment the automated suite and the
hand-drive (both driven through synthetic `PointerEvent`s at fixed pixel deltas) cannot
make. Everything *functional* — Shift+left and right-button both pan regardless of the
chrome toggle, a Shift+left click with no real drag still additively selects, the
native context menu is suppressed, and a plain left-drag still follows the toggle
unchanged — is now covered on a standing basis by `TODO/ACCEPTANCE.md` scenarios 1 and
7, so none of it is restated here.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Right-button drag on a laptop trackpad with no physical right button.** Most trackpads synthesize a right-click via a two-finger tap/click-and-hold rather than a true held "button 2" during a drag, and some trackpad drivers only fire `button: 2` on the initial press, not on subsequent `pointermove` events during the drag. Try an actual two-finger-click-and-drag on a real Mac trackpad and a real two-button mouse and confirm both actually pan smoothly for the drag's whole duration, not just flicker into pan mode for the first frame (the constant to check is `pressButton` in `src/components/viewport/Viewport.vue`, captured once at `pointerdown`). | Open | |

### ui-012 — Gizmo move/rotate ↔ numeric-field sync (2026-09-06 13:09)

Two entries, both feel judgments the acceptance drive genuinely cannot make. Everything
*functional* about this task — the fields tracking a drag live, a typed value moving the
mesh, and above all "exactly one body after a move" — is now covered on a standing basis
by `TODO/ACCEPTANCE.md` scenarios 1 and 2, so none of it is restated here.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **The dimension lines do not turn during a rotate-ring drag.** They track a *translate* drag exactly, but during a rotation the preview keeps the body's axis-aligned bounding box and only settles onto the real turned bounds on release (`src/composables/useSelectedBody.js` says why: the true bounds of a partly-turned solid need the kernel to rotate it, which is precisely the per-frame work the preview exists to avoid). Functionally correct, and the numbers are right the instant you let go. The open question is whether it *reads* as broken mid-drag — three dimension lines visibly not following the solid they annotate — or whether nobody notices because they are watching the solid. Judge it by eye on a Cube at laptop width; if it reads badly, the cheap fix is hiding the lines while a rotate preview is active, not measuring the turned solid every frame. | Open | 2026-11-14 (`testing-029` panel): Panel disagrees. A (laptop): unclear/misleading, dimension lines stayed on the unrotated box mid-drag and after release disagree with Inspector bounds 50.3 x 50.3 x 40. B: clear, the lines re-attached to the rotated solid. For the owner. |
| 2 | **Rotate-ring drag feel under a real finger.** A ring drag maps the pointer's sweep *around the gizmo hub* to degrees, so how much rotation a given finger movement produces depends on how far out from the hub you grabbed — near the hub a small movement spins it fast. That is the correct dial behaviour and it felt fine with a synthesised pointer, but a fingertip has contact area and lands less precisely than a mouse: the driven sweeps produced about −52° at laptop width and about −105° at phone width for the same 70px gesture, purely because the fatter phone hit target moves the effective grab point. Try it on a real iPhone and iPad and say whether the phone case is too fast to control; if it is, the fix is clamping the effective grab radius in `rotateDeltaDeg`'s caller, not shrinking the touch target back down. | Open | |

### ui-011 — Selection → inspector + dimension lines + gizmo (2026-09-06 01:22)

One entry. The two *structural* defects this task's acceptance drive found — the two
bottom sheets stacking, and the nav chrome sitting behind the sheet's edge — were fixed
in the task and re-driven, so they belong in `TODO/ACCEPTANCE.md`'s scenario 2 note, not
here. What is left is a genuine visual judgment call that no assertion can settle.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Dimension-label collisions at phone width.** The three labels are placed at each dimension line's midpoint, pushed outward from the solid's screen centre (`updateDimensionAnnotation` in `src/render/annotate.js`). That keeps them off the solid, which is the hard part — but nothing stops one from landing under the orientation-gizmo card in the top-right corner, and at 390px that card is large relative to the screen. It happened once in the drive: the X label drifted behind the card while the camera was near the home view on a body placed high in the viewport. Nothing was *wrong* — the number is also in the Inspector's Size row — but it looks untidy. Worth a few minutes of orbiting on a real phone to judge whether this is rare enough to leave, or whether the labels want a simple clamp inside a safe area. Do not reach for a general label-collision solver before deciding it is actually a problem. | OK | testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Same 72-view sweep: a label under the orientation-gizmo card in 0 views at laptop and at phone width. Caveat for ui-130: at phone width a label box crosses the viewport edge in 57 of 72 views (7 at laptop). Earlier: Moved 2026-11-07 to `FIND-testing-030`: this Mac’s real GPU and screen, with measurements, can settle it. |

### ui-010 — Drag-place a primitive (2026-09-06 00:58)

One entry only. The scenario-1 drive covers whether placement *works*; what it cannot
cover is whether the gesture feels right under a real finger, because every drag in
that drive was a synthesised `PointerEvent` sequence with no contact area, no
momentum, and no chance of the sheet being in the way of the hand holding it.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Sheet-to-viewport drag on real phone hardware.** At 390px the Library is a bottom sheet, so the drag starts near the bottom of the screen, crosses the sheet's own edge, and has to end up somewhere in the visible strip of grid above it — a path that only exists at phone width and that no other gesture in the app takes. Try it on an actual iPhone: is there enough uncovered viewport above the open sheet to drop into comfortably, or does the sheet want to be shorter (its `max-height` is `46vh` in `src/components/layout/LibraryPanel.vue`)? Does the translucent ghost read clearly against the grid at that size, or does a thumb cover it entirely? | Open | |

### render-001 — App shell + viewport scaffold (2026-09-05 21:10)

Both items are physical-hardware feel judgments that the scenario-7 drive cannot make
for itself: an emulated 820×1180 WebKit context registers a tap or a drag perfectly,
where a real finger has contact area and a real wrist has momentum.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Orbit sensitivity on a real touchscreen.** Drag speed is a fixed 0.4° of orbit per pixel, slightly faster than three.js's own OrbitControls default at this viewport height. In the driven pass a single 260px diagonal swipe rotated ~104° and parked the camera flat against the top-down pole — correct clamping, but possibly too twitchy in the hand. Try a few casual swipes on an iPhone and an iPad and say whether it wants lowering (the constant is `ORBIT_DEG_PER_PX` in `src/components/viewport/Viewport.vue`). | Open | |
| 2 | **Orientation-triad cap tap targets.** The six axis caps are 32px (30px at phone width) rather than the 44px used for the navigation chrome — six 44px targets will not fit a 116px dial without overlapping. The e2e matrix proves they are hittable at their centres; what it can't tell us is whether a thumb reliably picks the intended cap when two are visually adjacent. If it doesn't, the fix is a bigger dial at touch widths, not bigger caps in the same space. | Issue | 2026-11-15 (testing-031): Issue, filed as ui-134. Threshold: a different cap fires on <= 2 % of taps. Production build of the working tree as it stood (Vite build, preview server), Chromium touch emulation (hasTouch, isMobile, DPR 2) at the row viewport unless noted; fingertip taps scattered Gaussian sigma 3.5 mm = 13.2 CSS px with bench/tap-scatter.mjs. Phone 390, Chromium, 200 taps per cap: the intended cap fired on Top 54.5 %, Front 58 %, Right 59 %, Left 50.5 %, Back 49.5 %, Bottom 61 %, and a different cap fired on 22.5-35 % (sigma 3 mm: 13-28 %, sigma 4 mm: 28-44 %). WebKit phone (100 taps): intended 54-72 %, wrong cap 25-46 %. Tablet 820 Chromium (100 taps): intended 51-60 %, wrong cap 24-39 %. The six caps are 30x30 boxes whose centres are 23-27 px apart on the 106 px dial (Left and Front overlap by 3 px), and the Home button fired 78-87 %. Touch-only navigation (acceptance 7) still passes at 820: Top and Front caps snap the camera at a centred tap. |

### docs-018 — Phone and tablet media (2026-10-03 19:08)

Two device-specific questions that Chromium captures cannot answer and no acceptance scenario
covers.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Inspector sheet after a tap, on a real phone (Safari and Chrome).** In a trusted-touch Chromium drive at 390x844, tapping a body at a spot that ends up under the raised sheet's top edge (y about 426) selected it, opened the Inspector, and closed it again 7 ms later: the browser's synthesized click lands on the sheet's tab, which toggles it. The docs pictures avoid it by panning the scene up first. On a real phone, tap a body low in the view (below the middle) with the Inspector closed and see whether the sheet stays up. If it flickers shut, file a `ui-` finding. | open | Seen only in Chromium emulation. `ui-045`'s WebKit tap path is the neighbouring known issue. |
| 2 | **`docs/mobile.md` against the real thing.** Read the page on a phone and a tablet and follow its "Try it" steps: tap Library, drag Cube up, two-finger pan, pinch, tap the triad. The pictures are Chromium at 390 and 820 px, not Safari. | open | Also try a pinch that starts with a finger on a selected shape's gizmo arrow: the gizmo claims it and nothing zooms. Probably intended, but worth a feel check. |

### build-006 — PWA icons and favicon (2026-10-15)

The e2e spec proves every icon is served at its declared size. It cannot show how the icon looks
once a phone masks it, or confirm that the install prompt appears.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **The icon on a real home screen.** Once deployed, add WarpCad to the home screen on an iPhone and an iPad (Safari → Share → Add to Home Screen) and install it from Chrome on Android, following the new section in `docs/getting-started.md`. Is the cube centred and clear of the mask, and does the label read **WarpCad**? On desktop Chrome, does the address-bar install icon appear? | open | iOS uses the full-bleed `apple-touch-icon.png` and Android the full-bleed maskable icon, both from `npm run icons`. |

### data-006 — Re-link an inactive tail onto the record an insert moved (2026-10-15)

Driven with real mouse input at laptop width and covered by `e2e/timeline-panel.e2e.js` at all
three viewports (the 390 px fit is asserted there). What is left is the judgment call only.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Scenario 12 step 10, as an exploring human.** Roll back, move a body a later step uses, and decide whether the amber `broken` row plus **Re-link to the moved step** reads as clear or as clutter. Also whether the button label is understood without the docs. This is the `data-004` check 3 judgment, now with the button in place | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. The row is grey with red *inactive* and *broken* chips and internal-id text; the repair is **Re-link to the moved step** (History, clipped in a ~130 px panel) or **Resolve…** (Inspector, amber): two names, two colours. Filed `FIND-ui-129`. |

### core-063 — Wording of the Repeat sheet for a step you did not make (2026-10-17 21:54)

A step the Assistant, Claude Code or a merge added to the first part no longer stops Apply; the sheet lists it and the copies leave it out. The words are a judgment call and the spec's two halves disagreed, so the owner should read them once.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Decision for the owner:** the spec's Problem says "let Apply copy it", its Proposed fix and Testing say the step is *left out of every copy*. The second shipped. Is "Bolt 1 keeps the Assistant's step, the copies do not" what you wanted, or should the copies carry it? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | Read the line under *Not part of the repeat* cold: *From the Assistant, so it is left out of the copies* (and *From Claude Code…*, *From a merge…*, *On another body, so it is not copied*). Does it say clearly that Bolt 1 keeps the step? | Issue | 2026-11-14 (`testing-029` panel): A: unclear. B: unclear. The line never says Bolt 1 keeps the step. Filed `FIND-ui-127`. |
| 3 | Read the one remaining refusal: *The only step that points at hole1 is from the Assistant, and it is left out of the copies, so there is nothing to repeat. Make that step yourself.* Clear, or too long on a phone? | Issue | 2026-11-14 (`testing-029` panel): A: unclear (too long for 340 px). B: unclear (too long, vague next step). Filed `FIND-ui-127`. |

### core-064 — A Pi that survives its own hole Subtract (2026-10-17)

One Pi now drills every hole: a Subtract that cuts with only the Pi's mounting holes (`hole1`-`hole4`, a Pi 5's `fan1hole`/`fan2hole`) leaves the Pi in the scene. Two judgment calls are still yours.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Decision for the owner:** should the HAT's, the Camera Module's and the touch screens' mounting holes also keep their part when used to Subtract? Today only the Pi does; those still use their part up, as does the Ethernet jack, a `clearance-*` keep-out, a Pi's hole mixed with another piece, and a bolt's `tap` (scenario 5). One line per op in `DRILL_PARTS` (`src/core/kernel/registry.js`) switches one on. | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |
| 2 | **Feel:** drill two holes with one Pi, then move the Pi. The holes already drilled stay where they were (each Subtract reads the Pi as it was at that step); only a later Subtract uses the new place. A model edit on the Pi (say Pi 4 to Pi 5) does re-fold the holes. Does the first read as a bug to someone who has not read `docs/hardware-library.md`? | Issue | 2026-11-14 (`testing-029` panel): A: unclear (reads as a bug until explained, jargon). B: unclear, same; it does explain once read. Filed `FIND-docs-036`. |
| 3 | **Decision for the owner:** Repeat now refuses a source whose steps include a Subtract (from the seed's first mention onward), with *"... a repeat would copy the whole of <body> once per target. Subtract the other parts one at a time instead ..."*. It is not reachable from the UI today, so no one sees it by hand; it is there so a kept Pi cannot make Repeat add one whole extra plate per hole. Keep it, or drop it and accept that case? | Moved | Moved 2026-11-07 to `FIND-testing-033`: an owner decision, gathered with a drafted recommendation. |

### ui-087 — Moving the operation panels (Stage 1)

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | **Feel, on a real iPhone and iPad:** drag the Align panel by its grip with a thumb. It should follow the finger at 1:1 with no page scroll or rubber-banding, and the grip (44 px tall on a phone) should be easy to hit. Only a scripted touch drag (Chromium CDP) has been tried. | open | |
| 2 | **Safari desktop and Firefox:** drag, arrow-key nudge and double-click reset on the Align and Fillet panels (the e2e covers the Align drag on all three engines; the feel is unjudged). | open | |

### ui-114 — Base button: stage 2 families (2026-11-14 14:00)

The 48 px dialogs, DeleteButton, the strips and toasts, four sketch panels, six Inspector rows and the Assistant panel now
draw their buttons with `BaseButton`. Four looks changed on purpose and are a judgment call, not something a test settles.

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Primary buttons that used to be an accent outline (Disk change Reload, Trace and Scale Apply, the Inspector's Save and Create rows) are now the filled accent look: read each in both themes. | Open | |
| 2 | Toast and banner buttons lost their hover/focus accent border; the shared focus ring replaces it. Visible on a keyboard Tab in Firefox and Safari? | Open | |
| 3 | The Assistant's three height buttons and Watch keep square corners and 8 px padding through a parent selector. At 390 px does the header row still wrap the same way? | Open | |
| 4 | The Show all toggle on a long reply is now an underlined link. Reads as a link, not a stray label? | Open | |

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
