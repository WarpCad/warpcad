---
title: Drive the VERIFY.md rows an agent can settle, and check the cold-read rows against the queued wording fixes
category: testing
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-17 from the owner-queue triage (TODO/OWNER.md)
depends: []
status: open
---

> **Progress 2026-11-17 (first sitting, kept open).** Settled in `TODO/VERIFY.md`: the two docs-033 rows, `ai-041` #1, `ui-108` #1/#3/#4/#5/#6/#7, `io-035` #1/#2, `ui-122` #1, `ai-036` #6, `ui-114` (dialog) #2/#3 and (stage 2) #3, `build-016` #3, `build-007` #1, `ai-029` #4, `build-032` #2, `ui-027` #1; `build-033` #3, `core-075` #3 and `ui-039` #1 moved to `testing-042` / `ui-128`; `ai-041` #2 and five cold-read rows are `Owner` (Q10 to Q15 in `TODO/OWNER.md`). Step 0: iOS 26.0 runtime installed; the on-screen half of `build-034` #1 and the Remote Automation toggle wait for `testing-028`; the native bookkeeping commit is done. **Still `Moved` here:** `io-035` #6, `build-034` #1 (on-screen), `ai-035` #4 and #6, `testing-032` #2, `ui-114` (dialog) #1, `ui-114` (stage 2) #1/#2/#4, `io-027` #1/#2, `core-079` #1/#2, `ui-105` #2, `perf-003` #3, `core-075` stage 2 #2, `ai-021` #4, `ai-014` #2, `ai-007` #1/#2, `ai-003` #3, `ui-034` #2, `data-003` #2, plus the core-014 and core-015 Pi side-by-sides.

## Problem

The 2026-11-17 triage of all 275 `Open` rows in `TODO/VERIFY.md` found that 40 of them need no owner at all.
They were left `Open` because the task that filed them wrote "by hand" when it meant "not driven in this run":
mouse and keyboard checks in the running app, emulated phone widths, `claude -p` runs on the subscription, a
docs fix, rows already settled by evidence in their own Notes. Another 11 are cold-read questions ("does this
glyph read", "is this wording clear") whose panels split, and which the wording and discoverability findings
already queued (`ui-127`, `ui-128`, `ui-129`, `docs-036`) probably cover. Sitting in the owner's queue, they made
the owner the bottleneck for work an agent can finish unattended (see `TODO/OWNER.md`, section 0).

## Affected files

- `TODO/VERIFY.md`: each row below becomes `OK`, `Issue` (with the new finding's id) or `N/A`, with a dated note
- `TODO/OWNER.md`: rows that turn out to need a judgement become questions or quick checks there, in its format
- `docs/mcp.md` (row `ai-041` #1), `docs/media/open-project.gif` (row `io-035` #6), possibly baselines (row `build-033` #3)
- New `TODO/FIND-…` files for any `Issue`

## Proposed fix

**Step 0, before the rows (long downloads first, in the background):**

1. `xcodebuild -downloadPlatform iOS -buildVersion 26.0` (about 8 GB). When it lands, create an iPhone on iOS 26.0
   and run `build-034` #1 (`npm run ios:dev -- "<that iPhone>"` in `../warpcad-native`). Then open that
   simulator's Settings › Safari › Advanced. **If Remote Automation is there**, turn it on, record the route in
   `TROUBLESHOOTING.md` via `/troubleshoot`, and move `testing-027` from Held into the Findings queue directly
   below this row. If it is not, add one line to `testing-027` saying iOS 26.0 lacks it too.
2. Bookkeeping the owner decided on 2026-11-17 (`TODO/ROADMAP.md`, M19 notes): in `../warpcad-native`, commit
   `TODO/M19-build-040-*`, `TODO/M19-io-034-*`, `TODO/M19-ai-043-*` and the `testing-037` status edit, signed off.
   Leave `scripts/ios-release.sh`, the Xcode project, `Info.plist` and `src-tauri/plugins/` uncommitted. Never push.
3. Two rows in VERIFY.md still say `Moved` to `docs-033`, which is closed. Settle each from `TODO/done/docs-033-*`.

**Then the rows.** Drive each one like an exploring user, with the `run` skill (production build) or Claude in
Chrome. Use Playwright for Firefox and WebKit checks and `claude -p` (owner's subscription, never an API key)
for model behaviour. Record what you saw in the row's Notes with the date, build and engine.

- A row that needs a judgement no measurement settles (taste, wording you cannot decide): save a screenshot to
  `TODO/owner-media/<task-id>-<row>.png` (git-ignored, so it stays on this Mac; never a scratchpad, which is how
  `testing-030`'s pictures were lost), and add a **question** to `TODO/OWNER.md` §2 with the picture's path,
  the evidence and a recommendation. Set the row to `Owner` with that question's code.
- A row that would need a real phone or iPad after all: move it to the right device session in `TODO/OWNER.md` §5.
- Cold-read rows (second table): open the queued finding the hint under that table names, and see whether its Proposed
  fix covers the row. If it does, set the row to `Moved` and add the row to that finding's Testing section so it
  is re-checked. If not, write it as an `OWNER.md` question with the panel's split as the evidence.
- `ai-007` #1 and #2: produce a real `capture_view` PNG over MCP (dev live bridge) of a scene with a Bolt and a
  grid, and pass it to the owner as a question with the picture.
- Pi side-by-sides for `OWNER.md` M20 and M21 (`core-014` #1, `core-015` #1): regenerate them (V1 images are in
  `~/src/jscad/jscad-raspberrypi/test/images/`, read-only) into `TODO/owner-media/` and put the paths
  into those two items.

**Never stop to ask the owner during this task.** Anything that needs the owner goes to `TODO/OWNER.md` and the
task carries on with the next row.

### Rows an agent can drive

| Row | Check |
|---|---|
| `ai-041` #1 | `docs/mcp.md` around line 237 says a rebuilt group comes back "Group 1" and must be renamed in the app. That is now stale: `create` takes `name`, and `operate` offers `style.rename`. Fix the wording. |
| `ai-041` #2 | The human Operations toolbar still writes the flat boolean, because `keepParts` is opt-in. Check in the app that Subtract on one part of a group keeps the others, or decide that the toolbar stays as it is. |
| `ui-108` #1 | Scenario 6 (group vs sub-part selection) by hand, not only by spec |
| `ui-108` #3 | Scenario 9 remainder by hand: a hole cut and a boolean on the extruded sketch |
| `ui-108` #4 | ui-012 live update: Position fields change during the gizmo drag, not only after it |
| `ui-108` #5 | ui-049 hover tint on a list row is visible on the 3D body (too faint to confirm at 0.5 scale) |
| `ui-108` #6 | ui-013 dashed snap guides appear mid-drag from a Library row over an existing item |
| `ui-108` #7 | sketch-006 Line chain: Esc finishes, double-Esc cancels, Enter finishes, double-click finishes |
| `io-035` #1 | Acceptance scenario 10 (save, reload, nothing changed): Save As suggests `.warpcad`; reload shows the same file |
| `io-035` #2 | Acceptance scenario 22 (merge a copy) and 23 (Claude Code edits the open file via `npm run mcp:add -- x.warpcad`) |
| `io-035` #6 | `npm run docs:gifs` regenerates `open-project.gif` (stale, recorded from an older save-load spec) in a scoped movies directory, not the whole set |
| `ui-122` #1 | Keyboard: in the Sketch toolbar's Extrude panel and the inspector's Solid/Hole row, Tab onto the row, then Arrow keys move the selection and Enter or Space commits it; the disabled method (when it has a problem) is skipped. |
| `build-034` #1 | **iOS 26.0 runtime.** Install it (Xcode, Settings, Components, iOS 26.0 simulator runtime, or `xcodebuild -downloadPlatform iOS -buildVersion 26.0`), create an iPhone on it, run `npm run ios:dev -- "<that iPhone>"`: the app launches with the Keychain library loaded, places a cube, and shows no … |
| `ai-036` #6 | The sheet shows the sentence that the address and token are sent unencrypted, under the switch, readable at phone width without horizontal scrolling. |
| `build-033` #3 | The Align pop-up help screenshot (`help.e2e.js:148`) fails on firefox-phone on `main` with or without this task. Decide whether to refresh that baseline or fix the Help sheet's layout. |
| `build-032` #2 | With Wi-Fi off, Help shows "Help needs a connection"; after Wi-Fi returns, **Retry** loads it |
| `ai-035` #4 | A model other than Haiku (Sonnet or Opus, the owner's usual) follows both skills the same way |
| `ai-035` #6 | The same `Housing` request with the project open in the app: the merged steps show as **via mcp** and the rebuilt group is selectable |
| `testing-032` #2 | Is Haiku's result the floor? Repeat the `ai-014` #1 and scenario 17 MCP drives on a stronger model (`--model sonnet`) and compare; Haiku is the cheapest model, not the one most owners use. |
| `ui-114` (Base button: dialog) #1 | The storage dialogs' buttons are now 80 px wide, not 96 px (Connect, Save as gist, Replace confirm, Project settings): do the two-button rows still look balanced at phone, tablet and laptop? |
| `ui-114` (Base button: dialog) #2 | The Step limit sheet's Save is now the filled primary look, not an accent outline: read it in both themes. |
| `ui-114` (Base button: dialog) #3 | The keyboard focus ring (`--focus-ring`, 2 px offset) on dialog buttons in Firefox and Safari: visible and not clipped by the sheet edge? |
| `io-027` #1 | NeoPixel ring imported via File → Import model…: the board reads green, the LEDs white, the pads amber on screen |
| `io-027` #2 | Reset after a recolour on an LED returns to `#f6f6f3`, not the theme palette |
| `core-079` #1 | At 390 px width, the "Subtract in progress…" line does not push the operation buttons off-screen or cause horizontal scroll |
| `core-079` #2 | On a denser 3MF than the Feather, the main-thread commit after a whole-model Subtract stays under 16 ms |
| `ui-105` #2 | Follow `docs/user-library.md` *Saving another size* exactly as written on a saved part; every step does what the page says |
| `perf-003` #3 | Acceptance scenario 25, "An MCP agent edits the project you have open": `npm run dev`, a loopback MCP client, lease enabled, steps 1–7, plus phone reachability of the access control. |
| `ai-029` #4 | Does headless `claude -p "/mcp__warpcad__build …"` expand MCP prompts at all? Also paste the other-agent paragraph into a client without prompt support |
| `build-016` #3 | Owner's and Dependabot's PRs are exempt from both checks |
| `build-007` #1 | Create a separate GA4 property for WarpCad and a web data stream for the hosted host (see the checklist in `TODO/done/build-007-google-analytics.md`); copy the `G-XXXXXXXXXX` Measurement ID. |
| `ai-021` #4 | Whether a deployed (https) app needs an origin-trial token before the API exists for ordinary visitors, and the trial's end date. `docs/webmcp.md` deliberately leaves this out until confirmed from Chrome's own page. |
| `ai-014` #2 | At phone width (390x844) the *Set piModel to 5* row and a revisions-only **Undo AI turn** are reachable in the half-height chat sheet and the Variables tab shows Pi 5 behind it. |
| `ai-007` #1 | Grid lines nearly vanish in a `capture_view` PNG after the 2x downscale. Does a captured view still read well enough for a person to tell what the model saw? |
| `ai-007` #2 | Per-part recipe colours inside a group (a Bolt's head and thread) are not drawn in captures, only the body colour. Judge whether the thumbnail is misleading on a composite. |
| `ui-034` #2 | **Open one exported STL and one OBJ in a real slicer or mesh checker** (PrusaSlicer / Cura / Bambu Studio / MeshLab) — both a plain Union and a placed bolt. **Precondition and expectation both changed on 2026-09-21 when `io-004` landed: those files are now measured closed** — 0 of 309 undirected … |
| `ui-114` (Base button: stage 2) #1 | Primary buttons that used to be an accent outline (Disk change Reload, Trace and Scale Apply, the Inspector's Save and Create rows) are now the filled accent look: read each in both themes. |
| `ui-114` (Base button: stage 2) #2 | Toast and banner buttons lost their hover/focus accent border; the shared focus ring replaces it. Visible on a keyboard Tab in Firefox and Safari? |
| `ui-114` (Base button: stage 2) #3 | The Assistant's three height buttons and Watch keep square corners and 8 px padding through a parent selector. At 390 px does the header row still wrap the same way? |
| `ui-114` #4 | The Show all toggle on a long reply is now an underlined link. Reads as a link, not a stray label? |

### Cold-read rows to check against the queued wording findings

| Row | Check |
|---|---|
| `core-075` #3 | At 390 px the Place connectors kind row is seven icon-only buttons (Post, Wedge, Screw boss, Dowel, Butterfly, Tenon, Magnet). Is each one recognisable from its glyph on a real phone, or does it need a label? |
| `core-075` (Butterfly) #2 | The bowtie marker glyph for a hand-placed Butterfly does not rotate to match the edge it snapped to; judge whether that reads clearly on a phone |
| `docs-020` #1 | Watch `ai-wing-airfoil.gif` and `ai-drawing-to-group.gif` cold: does a stranger understand what the Assistant did, and is the *Scripted* badge in `ai-chat-panel.png` explained well enough by the caption in `docs/ai-partner.md`? |
| `core-050` #1 | In the `ui-059` panel, type a value past a variable's max: is the refusal clear *before* commit, and if a file arrives with such a value, is "3 parts disappeared" explained by name on screen? |
| `ai-008` #6 | Wording: *Image sent to Anthropic with your request, using your key. It is not sent anywhere else.* Right words? |
| `ai-003` #3 | Any device: in History, is the small note icon at the end of a row recognisable as "why this step exists" without its tooltip (touch has no hover)? A feel judgement. |
| `docs-014` #3 | Read `rpi-keepout.png` cold: the keep-out is a small 15 x 10 x 1 mm block by the display's power connector. Does the page make that clear, or does it read as a stray red box? |
| `docs-013` #2 | Read `resize-fit.gif` and the Fit example cold: Keep aspect ratio applies the smallest ratio to all three axes, so X 60 to 30 takes Y and Z from 40 to 20. Does the second step read as "keeps its proportions", or does it look like Fit ignored the box? |
| `ui-039` #1 | The ⇋ glyph on the Mirror button reads as "mirror" next to ⤢ ⇱ ✂ (the toolbar-fit half is answered, see Notes) |
| `data-003` #2 | The undo **refusal** path (`history-refusal`, `role="alert"`) cannot be triggered from the app today — nothing produces a non-local record until the MCP surface or `io-002` exists — so it is proven only by `history.spec.js`. When `io-002` lands, confirm the message actually appears and reads … |
| `ui-027` #1 | On a real phone, glance at the Operations toolbar with a body selected (all 8 icon-only buttons visible) *before* reading any documentation. Can you guess what Fillet (◠) and Chamfer (◢) do from the glyph alone, or only from `title` on long-press? If it's illegible, a future task should swap in … |

Which finding to check first: glyph rows → `ui-128`; wording and messages → `ui-129` or `ui-127`; docs pictures and
captions → `docs-036`.

## Effort

L (many small drives). Split across ticks freely: each row is independent. If the task runs past one tick,
commit what is settled, leave the rest `Moved`, and say so in the Runner Log.

## Testing

- No production code change is expected. Where a row turns into a fix (a docs line, a baseline), the usual
  `/test` `changed` scope covers it.
- Engines: as each row names. Firefox and WebKit through Playwright, Chromium through the run skill.
- Acceptance scenarios re-driven: 6, 7 (mouse half), 9, 10, 22, 23 and 25, as the rows name them.
- Closed-finding regression: the rows themselves are closed findings' reproductions.

## Interaction model

Not UI-touching (a verification pass).

## Documentation

- **Page**: `docs/mcp.md` (row `ai-041` #1). Otherwise n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
