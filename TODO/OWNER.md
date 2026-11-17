# TODO/OWNER.md — Everything Waiting on the Owner

The one queue of things only the owner can do: answer a question, check something on a device, sign in
somewhere, or wait a week and look. Everything an agent can drive itself has been taken out and given to the
runner (section 0). **Built 2026-11-17** from all 275 `Open` rows in `TODO/VERIFY.md`, the 79 parked
decisions in `testing-033`, and the owner notes in `TODO/ROADMAP.md`.

**Walk it with `/owner`.** It asks one item after another through `AskUserQuestion`, records each answer,
and goes straight to the next. It never waits for you to say "next". Type `stop` in **Other** to end a sitting.
`/owner ipad`, `/owner iphone`, `/owner mac`, `/owner questions` or `/owner <item>` start at that section or item.

## At a glance

| § | What | Items | Your time | What it unlocks |
|---|---|---|---|---|
| [0](#0-the-runner-does-these--nothing-for-you) | The runner does these | 79 rows | none | runs first in `/run-todos` |
| [1](#1-unblockers--a-minute-each-then-the-runner-takes-over) | Unblockers | 0 | done 2026-11-17 | 39 more rows the runner can then drive |
| [2](#2-questions--answer-from-anywhere) | Questions | 2 now (Q16, Q17), 79 being drafted | ~1 min each | the follow-up work each answer files |
| [3](#3-quick-checks-at-the-mac) | Quick checks at the Mac | 19 | 63 min total | closes rows |
| [4](#4-accounts-and-settings) | Accounts and settings | 6 | 38 min total | closes rows |
| [5](#5-device-sessions) | Device sessions: iPad, iPhone, either | 18 + 11 + 7 | ~45 + 25 + 15 min | Gate 1 follow-ups, file types, Live MCP |
| [6](#6-start-now-check-later) | Start now, check later | 6 | a few minutes, days apart | closes rows |
| [7](#7-at-the-printer-or-bench) | At the printer or bench | 13 | print time | closes rows |
| [8](#8-older-device-feel-checks) | Older device feel checks | closed (Q1) | none | — |
| [9](#9-parked--not-asked) | Parked | 19 | none until reopened | — |

**Next for you:** M7 (2 min, Chrome's local-network prompt wording). M2, M4, M5 and M6 were skipped 2026-11-17.

## How answers work

Three kinds of prompt. Each has four buttons and the automatic **Other** for typed text, and each passes the
`ask-guard` hook (`~/.claude/hooks/ask-guard.mjs`).

| Kind | Buttons | What each one does |
|---|---|---|
| **validation** (a check) | **Pass** · **Fail** · **Explain more** · **Skip (defer)** | Pass: the VERIFY row becomes `OK`, dated, with the device. Fail: the row becomes `Issue`; one follow-up asks what you saw (type it in Other), and a finding is filed at the end of the sitting. Explain more: the agent explains what to look for, shows the evidence, and asks again. Skip: stays here, marked `Skipped <date>`. Other: your words go in Notes and the agent acts on them. |
| **question** (a decision) | **<recommended> (Recommended)** · **<alternative>** · **Explain more** · **Defer** | The answer is recorded as `**Decided YYYY-MM-DD:**` in the file that owns it, and any follow-up row is filed. Defer: stays here, marked `Deferred <date>`. |
| **action** (something to do) | **Done** · **Hit a problem** · **Explain more** · **Not now (defer)** | Done: the agent checks the result where it can (a file, a command) and starts the work it unblocks. Hit a problem: one follow-up asks what happened. |

A device session starts with one **action** prompt for its setup, then asks its checks in order.

**For agents adding to this file.** Never stop a task to ask what you could drive yourself (`run` skill,
Playwright on every engine, Claude in Chrome, `xcrun simctl`, `claude -p` on the subscription, a scratch
project). Finish the task, then add only what truly needs the owner here, in the right section, in the item
format below, and set its VERIFY.md row's Status to `Owner` with the item code in Notes. One item per check.
Put the steps in the item. Never write "check this". Item format:

```markdown
#### <code> · <short title>

`<task-id>` #<VERIFY row> · <device> · <minutes> min · filed <date> [· **waits on:** <id or event>]

**Steps:** 1. … 2. …            (or **Check:** for a row whose text already reads as steps)

**Pass if:** <what you should see>

**Answer:** validation | question | action
```

---

## 0. The runner does these — nothing for you

These were sitting in VERIFY.md as `Open` but need no owner. `/run-todos` runs them first.

| Task | What it does | Rows |
|---|---|---|
| [`testing-044`](FIND-testing-044-drive-agent-drivable-verify-rows.md) | Drives the rows an agent can settle: app checks by mouse and keyboard, emulated phone widths, `claude -p` on the subscription, docs fixes, closed-by-evidence rows. Also checks 11 cold-read rows against the queued wording findings (`ui-127`, `ui-128`, `ui-129`, `docs-036`) and moves them or turns them into questions here. Step 0: download the iOS 26.0 simulator runtime (`build-034` #1), and if its Safari has the Remote Automation switch, put `testing-027` (23 iOS Simulator rows) back in the queue | 40 + 11 |
| [`testing-033`](FIND-testing-033-owner-decisions-from-verify.md), part 1 | Gathers the evidence for the 79 parked product decisions and writes a recommendation for each, as questions in §2. Only your answers are left for you | 79 decisions |
| [`testing-045`](FIND-testing-045-drive-github-gist-and-repo-checks.md) | Gist and hosted-repo checks against real GitHub, with your `gh` login (U1 answered) | 9 |
| [`testing-028`](FIND-testing-028-verify-native-dialog-checks-with-computer-use.md) | Native dialogs, the Mac app and the iOS Simulator's own UI, driven with computer use. **Running** in the Claude desktop app (U2 done) | 5 + 19 |
| [`testing-026`](FIND-testing-026-verify-desktop-safari-checks-with-safaridriver.md) | Desktop Safari through safaridriver. U3 done; in the runner's queue | 6 |
| Bookkeeping, decided 2026-11-17 | Commit the three filed native rows (`build-040`, `io-034`, `ai-043`) and the `testing-037` status edit in `warpcad-native`, leaving the files of unknown origin alone (`TODO/ROADMAP.md`, M19 notes) | — |

---

## 1. Unblockers — a minute each, then the runner takes over

All five answered 2026-11-17 (see **Answered**). New ones go here.

---

## 2. Questions — answer from anywhere

The 79 decisions from `testing-033` join this section, grouped, as the runner drafts them. Each group offers
**Accept all recommendations**.

All fifteen written questions were answered 2026-11-17 (see **Answered**).

#### Q16 · Does a `capture_view` picture read well enough, and is the Bolt's single colour misleading? (`ai-007` #1 and #2)

**Question:** Keep `capture_view` as it is (faint grid, one colour per body), or change it?

**Background:** Look at `TODO/owner-media/testing-044-ai-007.png`, a real `capture_view` (iso, 768 x 576) of an M10 hex bolt, 40 mm long, and a 30 x 30 x 20 mm block, made 2026-11-17 over the live bridge. Row #1: the grid shows only as faint lines toward the far edge of the frame and nothing under the bodies; the bodies read plainly, with shaded faces, so the model can tell what it built and roughly where. Row #2: the Bolt is drawn in one blue, while on screen its head and thread are two greys; a picture of a composite loses the recipe's per-part colours. The model uses the picture to judge shape and placement, and measures with `measure` and `describe_body` for sizes, so neither looks harmful.

**Options:**
- **Keep it, change nothing (Recommended):** both are cosmetic for the model's job; the cost of drawing the grid heavier is a busier picture, and per-part colours need the capture path to read recipe colours.
- **File a follow-up:** draw the grid a little heavier, and draw a composite's per-part colours. An S-size task each.

**If deferred:** nothing changes; `ai-007` #1 and #2 stay `Owner`.

**Answer:** question

#### Q17 · Does the History note icon read as "why this step exists"? (`ai-003` #3)

**Question:** Is the small document icon at the end of a History row clear enough without its tooltip?

**Background:** Look at `TODO/owner-media/testing-044-ai-003.png`: History with two steps, *Cube 1 — placed* (made by hand) and *Sphere 1 — placed* (made over MCP). Only the second has the icon, a small page with lines, after the `via mcp` chip. That the hand-made row has none is by design: the icon is drawn only when a step carries design intent (the request and the model's reason). The tooltip, and the screen-reader label, read *Why this step exists*, but touch has no hover. The `via mcp` chip beside it already says the step came from an agent.

**Options:**
- **Keep the icon (Recommended):** the glyph is a conventional "note" and sits next to the `via mcp` chip, which gives it its context; the row expands on tap and shows the words.
- **Add a visible word:** *Why* next to the icon, on touch widths at least. An S-size task.

**If deferred:** nothing changes; `ai-003` #3 stays `Owner`.

**Answer:** question

---

## 3. Quick checks at the Mac

Each takes 1-5 minutes at this Mac or in a desktop browser. Any order.

#### M2 · Claude Code attaches the WarpCad guide

`ai-028` #2 · 1 min · filed 2026-10-29 · **Skipped 2026-11-17**

**Steps:** 1. Same session. 2. Type `@warpcad:warpcad://guide` and send a message.

**Pass if:** The guide is attached (it shows as an attachment and the model can quote it).

**Answer:** validation

#### M4 · My parts: project-only esp8266 row on your profile

`ui-096` #1 · 2 min · filed 2026-11-06 · **Skipped 2026-11-17**

**Steps:** 1. In the browser profile you normally use for WarpCad, open Library → My parts. 2. Open ⋯ on **esp8266 feather**. 3. Read the note, then tap **Delete…**.

**Pass if:** The note says why it is listed, and Delete… explains with Cancel only. In Other, say which case: (a) placed, (b) nested, (c) stale.

**Answer:** validation

#### M5 · My parts: the broken nested part on your profile

`ui-095` #1 · 2 min · filed 2026-11-06 · **Skipped 2026-11-17**

**Steps:** 1. Same browser profile. 2. Open Library → My parts. 3. Find the row with ⚠. 4. ⋯ → Delete… → Delete.

**Pass if:** The banner names the broken part, the row shows ⚠ and the reason, and Delete removes it.

**Answer:** validation

#### M6 · Claude Code lists the WarpCad prompts

`ai-029` #1 · 2 min · filed 2026-10-29 · **Skipped 2026-11-17**

**Steps:** 1. In a Claude Code session with the `warpcad` MCP server connected (`npm run mcp:add` once), type `/`. 2. Look for `mcp__warpcad__start`, `build`, `check-print`. 3. Run `/mcp__warpcad__start` on an empty project file.

**Pass if:** All three are listed; `start` says the file is empty, asks what to build, and writes nothing.

**Answer:** validation

#### M7 · Chrome local-network prompt wording

`ai-012` #2 · 2 min · filed 2026-10-14

**Steps:** 1. `npm run dev`. 2. In Chrome open the Live access sheet and connect for the first time.

**Pass if:** Chrome's local-network prompt appears and the sheet's wording had prepared you to choose Allow.

**Answer:** validation

#### M8 · Safari Connect sheet: WebKit note

`ai-012` #3 · 2 min · filed 2026-10-14

**Steps:** 1. `npm run dev`. 2. Open http://localhost:5183 in desktop Safari, open the Connect sheet.

**Pass if:** The WebKit note is the right amount of warning (not alarming, not missing).

**Answer:** validation

#### M9 · Read-only Size fields look read-only

`ui-029` #1 · 2 min · filed 2026-09-12

**Steps:** 1. Select any body. 2. Look at the Transform section: the Size x/y/z boxes are read-only, Position is editable.

**Pass if:** You can tell Size is not editable before trying to type in it.

**Answer:** validation

#### M10 · Desktop Firefox: storage prompt on first save

`io-028` #2 · 3 min · filed 2026-11-13

**Steps:** 1. Open https://app.warpcad.com in desktop Firefox (a fresh private window is fine). 2. Drag a Cube in. 3. File ▾ → Save.

**Pass if:** Either Firefox asks to store data or it does not, and WarpCad saves either way (chip reads Saved). Say which in Other if you like.

**Answer:** validation

#### M11 · Import your own RV-8803 3MF

`ui-107` #2 · 3 min · filed 2026-11-10

**Steps:** 1. Open the app. 2. File ▾ → Import model… and pick your `6538 RV-8803…` 3MF (the file from the original report). 3. Drop it in the view.

**Pass if:** It appears in the view and in Objects, and My parts is unchanged.

**Answer:** validation

#### M12 · Marquee start under the Operations toolbar

`ui-083` #1 · 3 min · filed 2026-10-24

**Steps:** 1. On the laptop, place two Cubes. 2. Tap **Select** in the nav chrome. 3. Try to start a box-select drag at the very top-left of the canvas, under the toolbar.

**Pass if:** You can start it, or the dead zone is obvious and not annoying. Fail if it feels broken. In Other: would a hint or pan-first fix it?

**Answer:** validation

#### M13 · Sentry shows the release and unminifies

`build-013` #3 · 3 min · filed 2026-10-18

**Steps:** 1. Open sentry.io → the WarpCad project → Releases. 2. Find the release named by the latest tagged commit's SHA. 3. Open any recent issue in it.

**Pass if:** The release exists and the stack trace shows source file names, not minified `index-*.js` only.

**Answer:** validation

#### M14 · GA4 Realtime shows a page view

`build-007` #4 · 3 min · filed 2026-10-17

**Steps:** 1. Open analytics.google.com → WarpCad property → Reports → Realtime. 2. In another tab open https://app.warpcad.com.

**Pass if:** Realtime shows 1 active user and a page path without a `#` part.

**Answer:** validation

#### M15 · Repeat panel over the drop area (laptop)

`ui-069` #3 · 3 min · filed 2026-10-17

**Steps:** 1. Laptop width. 2. Drop a Bolt, open ⟳ **Repeat**. 3. Try to drop the first copy in the lower middle of the view.

**Pass if:** The floating panel does not get in your way in real use (you naturally drop higher). Fail if it does.

**Answer:** validation

#### M16 · Retry the Mac DMG build with Finder free

`build-034` #5 · 5 min · filed 2026-11-16

**Steps:** 1. Close any Finder dialogs. 2. In Terminal: `cd ~/src/@WarpCad/warpcad-native && npm run mac:build`. 3. If macOS asks whether Terminal may control Finder, click **Allow**.

**Pass if:** A `.dmg` appears under `src-tauri/target/release/bundle/dmg/` with no `-1712` error.

**Answer:** validation

#### M17 · Hold a drag while Claude Code changes the file

`io-010` #3 · 5 min · filed 2026-10-15

**Steps:** 1. Open a project file in the app (laptop). 2. Start dragging a Library part and keep holding. 3. Have Claude Code (or `claude -p`) add a step to the same file. 4. Switch back and release.

**Pass if:** The chip says `Changes waiting to merge`, the view does not jump, and the merge lands on release. Judge whether the wait felt right.

**Answer:** validation

#### M18 · WebMCP with two tabs

`ai-021` #3 · 5 min · filed 2026-10-14

**Steps:** 1. Chrome with the WebMCP flag on. 2. Open two WarpCad tabs, look at the second. 3. Ask a WebMCP client to add a cube.

**Pass if:** The cube lands in the tab you are looking at.

**Answer:** validation

#### M19 · WebMCP: big results come back whole in real Chrome

`ai-021` #5 · 5 min · filed 2026-10-14

**Steps:** 1. Chrome with WebMCP. 2. Open a project with ~50 bodies (the runner can make one). 3. Ask the client to `measure` and `check_printability` over all of them.

**Pass if:** Both results come back whole, each with an `oversize` note.

**Answer:** validation

#### M20 · Pi camera models against the real cameras

`core-015` #1 · 5 min · filed 2026-09-13

**Steps:** 1. Open `TODO/owner-media/testing-044-core-015-pi-cameras.png` (V1's own snapshot left, the WarpCad render right, for camera v1, v2 and HQ; regenerated 2026-11-17, light theme, Home view, so the right side includes the app's controls; WarpCad hides V1's red keep-out blocks and paints the uncoloured HQ parts in the default blue where V1 is grey). 2. Compare against what you know of the boards.

**Pass if:** Sensor, lens barrel, ribbon and mount read as the right parts in the right places.

**Answer:** validation

#### M21 · Pi boards against the real boards

`core-014` #1 · 5 min · filed 2026-09-13

**Steps:** 1. Open `TODO/owner-media/testing-044-core-014-pi-boards.png` (V1's own snapshot left, the WarpCad render right, for Pi 2/B+, 3 and 4; regenerated 2026-11-17, light theme, Home view, so the right side includes the app's controls). 2. Compare against a real board or your memory of one.

**Pass if:** Connectors read as the right parts in the right places.

**Answer:** validation

---

## 4. Accounts and settings

Things only your signed-in accounts can do.

#### K1 · Confirm the GitHub LFS free limits

`build-012` #4 · 2 min · filed 2026-10-17

**Steps:** 1. github.com → Settings → Billing and plans → Git LFS. 2. Read the storage and bandwidth included.

**Pass if:** Both are 10 GiB. If not, type the figures in Other and the runner edits `docs/decisions/hosting.md`.

**Answer:** action

#### K2 · GA4 data-stream settings

`build-007` #3 · 5 min · filed 2026-10-17

**Steps:** 1. analytics.google.com → Admin → Data streams → the WarpCad stream. 2. Enhanced measurement: OFF (every toggle, especially "Page changes based on browser history events"). 3. Admin → Data retention: 2 months. 4. Admin → Data collection: Google signals OFF.

**Pass if:** All four set.

**Answer:** action

#### K3 · Unsigned PR from a second account is blocked

`build-016` #1 · 10 min · filed 2026-10-21

**Steps:** 1. From a second GitHub account, fork WarpCad/warpcad and open a PR with one commit, no `Signed-off-by`, no CLA comment.

**Pass if:** `cla` and `dco` both fail and the merge button is blocked.

**Answer:** action

#### K4 · Apply the GitHub repository settings (Part 4)

`build-016` #4 · 10 min · filed 2026-10-21

**Steps:** Follow the Part 4 checklist in `docs/decisions/app-store-licensing.md`: a ruleset requiring `cla` and `dco`, code-owner review, contributor approval for first-time contributors, squash-merge only.

**Pass if:** Settings applied.

**Answer:** action

#### K5 · Sign the CLA from that account

`build-016` #2 · 11 min · filed 2026-10-21 · **waits on:** the unsigned-PR check just above

**Steps:** 1. On that PR, from the second account, comment the CLA sentence. 2. Amend the commit with `git commit -s --amend` and force-push.

**Pass if:** `cla` turns green, then `dco` passes.

**Answer:** action

#### K6 · A read-only token gets the "does not have permission" message

`io-002` #2 · 4 min · filed 2026-11-17

**Steps:** 1. github.com → Settings → Developer settings → Fine-grained tokens → Generate. Repository access: only one scratch repository you own; Permissions: Contents **Read-only**, nothing else. Copy it. 2. In WarpCad: File ▾ → Save to a repository…, connect that repository with this token, then Save.

**Pass if:** the sheet says the token does not have permission to write to that repository and needs Contents: read and write (a 403), not "Repository not found". Say what it showed in Other. Delete the token afterwards.

**Answer:** validation

---

## 5. Device sessions

### 5a. iPad session (18 checks, ~45 min)

**Setup (action):** 1. Plug Socrates in over the cable and unlock it. 2. Say `/owner ipad`. The agent
installs the current local build (`scripts/ios-release.sh --install "Socrates"`) and writes three test files to
`~/Desktop/warpcad-ipad-test/`: `x.warpcad`, `y.ndjson`, and `log.ndjson` (three lines of log JSON, not a
project). 3. AirDrop the folder to the iPad and save it in Files → On My iPad. Answer **Done**.

The Live MCP checks (marked *waits on ai-043*) come last and are skipped until `ai-043` is fixed.

#### I1 · Save as name.warpcad, keep opening .ndjson

`io-035` #3 · iPad · filed 2026-11-16

**Check:** Acceptance scenario 28 on the iPad: Save in the app, then the file shows as a WarpCad project in Files (needs io-036's device pass too)

**Answer:** validation

#### I2 · Save as name.warpcad, keep opening .ndjson

`io-035` #5 · iPad · filed 2026-11-16

**Check:** iPad Safari (PWA, not the app): Open… can select a `.warpcad` file (ACCEPT_ATTRIBUTE). WebKit's accept list was checked by spec; the greying-out cannot be reproduced in Playwright

**Answer:** validation

#### I3 · iOS declares .warpcad and imports .ndjson

`io-036` #3 · iPad · filed 2026-11-16

**Check:** iPad, owner present, local build over the cable: the same three files, plus io-034's reproduction (Open in lists WarpCad with the app closed and open)

**Answer:** validation

#### I4 · iOS declares .warpcad and imports .ndjson

`io-036` #4 · iPad · filed 2026-11-16

**Check:** Acceptance scenario 28 step 9 and the inbound-file steps, on the iPad

**Answer:** validation

#### I5 · Five-minute free-form pass on the iPad (Gate 1 H)

`testing-037` #H · iPad · 5 min · filed 2026-11-16

**Check:** Five-minute free-form pass

**Already known:** Deferred by owner.

**Answer:** validation

#### I6 · One set of overlay behaviours

`ui-110` #1 · iPad · filed 2026-11-13

**Check:** On a real iPad or iPhone with a hardware keyboard attached, open the Key sheet and press Tab: focus cycles inside it and never reaches the toolbar behind (the trap moves focus itself, because Safari does not Tab to buttons)

**Answer:** validation

#### I7 · Native app icons, launch background and accent

`build-023` #1 · iPad · filed 2026-11-07

**Check:** iPhone and iPad home screen: the WarpCad mark is full-bleed with no ring or pre-rounded corners

**Answer:** validation

#### I8 · Native app icons, launch background and accent

`build-023` #2 · iPad · filed 2026-11-07

**Check:** Launch screen is `#10131a` with no white frame, on iPhone and iPad

**Answer:** validation

#### I9 · Live MCP (Gate 1 F2): paste on the Mac, a cylinder lands, Undo removes it

`testing-037` #F2 · iPad · filed 2026-11-16 · **waits on:** ai-043 (Live MCP access on the iPad) is fixed

**Check:** Paste on Mac; 20 mm cylinder lands; Undo removes it

**Already known:** Not run: blocked by F1.

**Answer:** validation

#### I10 · Live MCP (Gate 1 F3): no token and a wrong token both get 401

`testing-037` #F3 · iPad · filed 2026-11-16 · **waits on:** ai-043 is fixed

**Check:** `curl` with no token and a wrong token: 401 both

**Already known:** Not run: blocked by F1.

**Answer:** validation

#### I11 · Live MCP (Gate 1 F4): lock the iPad 60 s mid-request

`testing-037` #F4 · iPad · filed 2026-11-16 · **waits on:** ai-043 is fixed

**Check:** Lock 60 s mid-request: agent told the call may not have landed

**Already known:** Not run: blocked by F1.

**Answer:** validation

#### I12 · Live MCP (Gate 1 F5): access off, a request from the Mac is refused

`testing-037` #F5 · iPad · filed 2026-11-16 · **waits on:** ai-043 is fixed

**Check:** Access off, ask from Mac: refused

**Already known:** Not run: blocked by F1.

**Answer:** validation

#### I13 · Device measurements (Gate 1 G) from the probe build

`testing-037` #G · iPad · filed 2026-11-16 · **waits on:** the runner builds `probe/build-018` and installs it

**Check:** Measurements (`probe/build-018`)

**Already known:** Not run: needs the probe build.

**Answer:** validation

#### I14 · The in-app MCP listener binds one Wi-Fi address, caps requests and does not follow a network change

`ai-036` #1 · iPad · filed 2026-11-15 · **waits on:** ai-043 is fixed

**Check:** Mac shell (`npm run mac:dev`) or the iPad: enable access, turn on **Allow devices on this Wi-Fi**. From a second computer on that Wi-Fi: `curl -i http://<address>:5184/mcp -X POST -H 'Content-Type: application/json' -d '{}'` gets 401 without the token.

**Answer:** validation

#### I15 · The in-app MCP listener binds one Wi-Fi address, caps requests and does not follow a network change

`ai-036` #2 · iPad · filed 2026-11-15 · **waits on:** ai-043 is fixed

**Check:** Same, with `-H "Authorization: Bearer <token>"` and a small valid `initialize` body: the request gets past the gate (not 401, not 413).

**Answer:** validation

#### I16 · The in-app MCP listener binds one Wi-Fi address, caps requests and does not follow a network change

`ai-036` #3 · iPad · filed 2026-11-15 · **waits on:** ai-043 is fixed

**Check:** Same, with the token and a 2 MiB body (`head -c 2097152 /dev/zero \| tr '\0' a`): the reply is `413`. With `-H 'Transfer-Encoding: chunked'` it is `411`.

**Answer:** validation

#### I17 · The in-app MCP listener binds one Wi-Fi address, caps requests and does not follow a network change

`ai-036` #4 · iPad · filed 2026-11-15 · **waits on:** ai-043 is fixed

**Check:** On the iPad with access and the Wi-Fi switch on, move to a different Wi-Fi network and return to WarpCad: **Allow devices on this Wi-Fi** is off and the sheet says the address changed. The old address no longer answers. Turn it on again: the new address shows and answers.

**Answer:** validation

#### I18 · The in-app MCP listener binds one Wi-Fi address, caps requests and does not follow a network change

`ai-036` #5 · iPad · filed 2026-11-15 · **waits on:** ai-043 is fixed

**Check:** With the Wi-Fi switch on, turn Wi-Fi off on the iPad (cellular on) and return to WarpCad: the switch is off with a message, and the cellular address does not answer.

**Answer:** validation

### 5b. iPhone session (11 checks, ~25 min)

**Setup (action):** iPhone in hand, Safari on https://app.warpcad.com (or the home-screen app where a check
says so). Unless a check says otherwise, start each from a fresh project (File ▾ → New).

#### H0 · Ten-minute free-form pass on the iPhone

free-form · iPhone · 10 min · added 2026-11-17 by Q1

**Steps:** Use the app on the iPhone for ten minutes with no script: place and move parts, sketch an outline and extrude it, use the Library and Inspector sheets, Undo, save and reopen. Note anything hard to hit, hard to read or broken.

**Pass if:** nothing got in your way. **Fail** with what you saw (type it in Other); each thing is filed as a finding.

**Answer:** validation

#### H1 · does the simulated fingertip match a real thumb?

`testing-031` #1 · iPhone · filed 2026-11-15

**Check:** On a real phone, tap each of the six orientation caps and the Orbit, Pan and Select buttons ten times, aiming at the middle of each, and count taps that hit a neighbour (the model predicts 22-35 % for the caps and 5-9 % for the buttons). If real thumbs are far better, say by how much; the three findings' thresholds are written against the model.

**Answer:** validation

#### H2 · One NumberField for every size field

`ui-115` #1 · iPhone, then iPad · filed 2026-11-14

**Check:** On the iPhone and iPad, tap Fillet **Radius**, Split **Offset** and the Inspector **Size X**: the keyboard is the decimal pad, the whole value is selected on focus (a typed digit replaces it), and the page does not zoom

**Answer:** validation

#### H3 · Safe-area chrome on a real notched phone

`ui-120` #2 · iPhone · filed 2026-11-11

**Check:** Same device, Safari with the app added to the home screen (standalone mode): repeat row 1

**Answer:** validation

#### H4 · Import model… from the File menu, placed in the view

`ui-107` #1 · iPhone, then iPad · filed 2026-11-10

**Check:** On a real iPhone and iPad: File → Import model…, then drag the waiting ghost with one finger and lift. Does the ghost start where you can see it (with and without a model already selected and the Inspector sheet open), and does it follow the finger without lag on a 30k-triangle file?

**Answer:** validation

#### H5 · Refusal message under the edited field

`ui-100` #1 · iPhone · filed 2026-11-08

**Check:** On a real phone, refuse a Cube's Corner radius (for example 12 on a 40x20 box) and confirm the message reads clearly above Delete with no overlap

**Answer:** validation

#### H6 · Save to library checks names against My parts only, no Adjustable sizes

`ui-105` #1 · iPhone, then iPad · filed 2026-11-08

**Check:** On the iPhone and the iPad, select a group, tap **To library**: the sheet is shorter, Name/Category/Cancel/Save are still thumb-sized, and the *built from a part with that name* line wraps cleanly under the field

**Answer:** validation

#### H7 · A My parts entry that fails to load can be deleted

`ui-095` #2 · iPhone, then iPad · filed 2026-11-06

**Check:** On iPhone and iPad hardware: the broken row's reason wraps and the ⋯ sheet's Delete is easy to hit. On iPad, the rail tile's pop-out shows the reason (the rail has no banner)

**Already known:** 2026-11-07: The wrap and iPad pop-out half, in the iOS Simulator moved to `FIND-testing-027`; whether Delete is easy to hit stays here.

**Answer:** validation

#### H8 · Rename a part of a group

`ui-094` #1 · iPhone · filed 2026-11-05

**Check:** On an iPhone, name all 29 parts of `esp8266 feather.3mf` (tap the row, tap the name, type, Done). Count the gestures per part and the minutes in total; say whether a batch-naming table is worth filing

**Already known:** 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): phone 390x844 touch, a copy of ~/Downloads/esp8266 feather.3mf (original not touched), 29 parts renamed. The Objects list collapses after each rename, so per part: 4 taps (3 for the first: Objects header, part row, …

**Answer:** validation

#### H9 · Prompts view, highlight, part links and editing

`ui-092` #3 · iPhone · filed 2026-11-05

**Check:** The same hand check on a real phone, if one is available (390 px, touch only).

**Answer:** validation

#### H10 · phone header grouped AI menu

`ui-078` #1 · iPhone · filed 2026-11-05

**Check:** At 390x844 on a real phone, tap ✦ then Live MCP access; the access sheet opens and the menu closes. Judge the tap target and the popover placement.

**Answer:** validation

#### H11 · Group popover on real hardware

`core-076` #2 · iPhone · filed 2026-11-02

**Check:** With five or more rows (two Pis and three Cubes) on the same phone, does the list scroll inside the panel without the page moving behind it?

**Answer:** validation

### 5c. Either device (7 checks, ~15 min)

Do these on whichever device you are holding at the end of 5a or 5b.

#### E1 · overlay and annotation sync out of Viewport.vue

`ui-108` #2 · either · filed 2026-11-17

**Check:** Scenario 7 touch navigation by hand on a touch device (this run used mouse only)

**Answer:** validation

#### E2 · Three sketch pickers moved onto SegmentedToggle

`ui-122` #2 · either · filed 2026-11-16

**Check:** Feel: the three adopted rows read as the segmented style on a phone and a tablet, with tap targets at tap size.

**Answer:** validation

#### E3 · The iOS status bar and launch screen follow the theme

`ui-121` #1 · either · filed 2026-11-16

**Check:** On the iPhone or iPad, with the device in Dark, open Help, tap **Light** (then **Minimal**, then **System**): the clock and battery turn dark at once, and back to light on System

**Answer:** validation

#### E4 · The iOS status bar and launch screen follow the theme

`ui-121` #2 · either · filed 2026-11-16

**Check:** Cold-launch with the device in Light: the launch frame is light grey, not dark, before the app draws (the asset catalog has both variants; the frame was not captured)

**Answer:** validation

#### E5 · The 3D view's colours on a real GPU and screen

`render-008` #1 · either · filed 2026-11-14

**Check:** On a real phone or iPad, switch System/Dark/Light in the Help footer with a cube, a cylinder and both selected: the body, amber selection, teal secondary selection and red/green axis lines are distinct and comfortable against the ground in both themes (light-theme axes are now deeper than dark's).

**Answer:** validation

#### E6 · One NumberField for every size field

`ui-115` #2 · either · filed 2026-11-14

**Check:** With the device set to a comma-decimal region, type `2,5` into the same three fields: each shows `2.5`

**Answer:** validation

#### E7 · Theme switch: System, Dark, Light

`ui-113` #1 · either · filed 2026-11-13

**Check:** On a real iPhone or iPad set to Dark, choose Light in Help, then reload and cold-start the installed app: the dark frame before the light theme applies is brief enough not to read as a flash

**Answer:** validation

---

## 6. Start now, check later

Each has a start step and a check step, hours or days apart. `/owner later` asks for the start, records the
date, and asks for the check when it falls due.

#### W1 · Overnight relaunch (Gate 1 D4)

`testing-037` #D4 · iPad · 2 min · filed 2026-11-16 · **start:** in the evening

**Steps:** Evening: open a project in the iPad app, wait for Saved, leave the app in the background. Next morning: open WarpCad from the home screen.

**Pass if:** The project is there, unchanged, with no error.

**Answer:** validation

#### W2 · iPad: 15 minutes in the background with a heavy project

`build-033` #1 · iPad · 3 min · filed 2026-11-15

**Steps:** Open a heavy project (24 bodies), wait for the saved indicator, switch to another app for 15 minutes, come back.

**Pass if:** The project is there with no tap, and History lists what you placed.

**Answer:** validation

#### W3 · iPhone Safari: seven days unused

`io-028` #1 · iPhone · 2 min · filed 2026-11-13

**Steps:** Day 0: in iPhone Safari (not the home-screen app) make a project, wait for Saved. Do not open WarpCad in that Safari for seven days. Day 7: open it.

**Pass if:** Either the project is back, or a clear **Your browser cleared WarpCad's saved data** message shows. Fail on a silent empty project.

**Answer:** validation

#### W4 · Installed PWA picks up a new deploy on reload

`build-005` #1 · iPhone · 3 min · filed 2026-10-17 · **waits on:** the next deploy to Pages

**Steps:** After the next deploy: on the home-screen app, reload once or twice, then open Help.

**Pass if:** Help's version line shows the new commit, with no site-data clearing.

**Answer:** validation

#### W5 · Update banner across a deploy

`build-005` #2 · iPhone · 2 min · filed 2026-10-17 · **waits on:** the next deploy to Pages

**Steps:** Leave the home-screen app open across a deploy, then return to it within 30 minutes.

**Pass if:** The banner *A new version of WarpCad is available.* appears; **Reload** applies it and the project survives.

**Answer:** validation

#### W6 · iPhone Safari: standing instructions after seven days

`ai-003` #2 · iPhone · 2 min · filed 2026-10-06

**Steps:** Day 0: open a file with standing instructions, press **Use this project's instructions**. Day 7+: come back.

**Pass if:** The choice is remembered, or the app asks again cleanly. Fail on a broken state.

**Answer:** validation

---

## 7. At the printer or bench

Needs printed parts, calipers or a real object. Print the files the item names, then answer.

#### X1 · seam profiles: sliding dovetail, puzzle tabs, half lap, finger joint

`core-075` (seam profiles: sliding) #1 · filed 2026-10-27

**Check:** Print both halves of a 200 x 60 x 8 mm panel split with **Half lap** at 0.2 mm clearance: does the lap go together without sanding, and does `assembly.txt` read correctly against what is on the bench?

**Answer:** validation

#### X2 · seam profiles: sliding dovetail, puzzle tabs, half lap, finger joint

`core-075` (seam profiles: sliding) #2 · filed 2026-10-27

**Check:** Print a **Sliding dovetail** split: does B slide on along the rail the way `assembly.txt` says, snug but not stuck?

**Answer:** validation

#### X3 · loose tenons and disc magnets

`core-075` (loose tenons and disc) #1 · filed 2026-10-27

**Check:** Print `plank-tenon-x2.stl` flat on the owner's printer at 0.2 mm clearance: does the chamfered side print clean without supports, and does the tenon go into both mortises with a push fit (not slop, not a hammer)?

**Answer:** validation

#### X4 · loose tenons and disc magnets

`core-075` (loose tenons and disc) #2 · filed 2026-10-27

**Check:** Glue a real 6 × 3 mm magnet into a pocket: does it sit flush with the cut face, and do the pieces attract with the `assembly.txt` mark-out / mark-in rule?

**Answer:** validation

#### X5 · Butterfly keys

`core-075` (Butterfly) #1 · filed 2026-10-27

**Check:** Print the plank's `plank-butterfly-key-x2.stl` and press a key into its pocket on the owner's printer: does it go in by hand, and does it hold?

**Answer:** validation

#### X6 · Phone library item: model, case, enlarge and separate plateau

`core-057` #1 · filed 2026-10-15

**Check:** Hold a real phone in its case against the placed stand-in (iPhone 17 Pro, or whichever you own): is the plateau's size and position, and the case's added width and length, within a millimetre or two? Every plateau and every Android size is an estimate; adjust with Case enlarge and note the real caliper numbers here.

**Answer:** validation

#### X7 · Phone library item: model, case, enlarge and separate plateau

`core-057` #2 · filed 2026-10-15

**Check:** Print or cut a pocket from a Subtract of `plateau` and test-fit the phone: does it lie flat with the camera in the pocket?

**Answer:** validation

#### X8 · Print prep: split, joint and Print pieces

`io-007` #1 · filed 2026-10-10

**Check:** Print the tongue-and-groove wing halves (and a pins-and-sockets pair on a thicker bar) with the default 0.2 mm clearance and see whether they press together. There is no printer-tolerance setting, so 0.2 mm is a guess for a typical FDM printer.

**Answer:** validation

#### X9 · Curve helpers and a lofted wing

`sketch-008` #1 · filed 2026-10-09

**Check:** Print the docs' wing panel (2412, 120 mm to 70 mm, Offset X 30, Twist -2, 200 mm span) and judge whether the sweep and washout look right; also whether twisting about the leading edge (the slice origin) is the pivot a wing designer expects, or the quarter-chord would feel better

**Answer:** validation

#### X10 · AI vision and measurement tools

`ai-007` #3 · filed 2026-10-09

**Check:** `check_clearance` over-reads slightly where two edges cross at the closest point (documented). Compare against a real Pi-and-case gap you can measure by hand.

**Answer:** validation

#### X11 · Auto-trace a photographed part to scale

`sketch-004` #1 · filed 2026-10-06

**Check:** **Real phone photo, start to finish (scenario 20 with a real object):** photograph a ~100 mm part beside a ruler from straight above, load it, Set scale, Auto-trace, clean up, Linear to its thickness, Done, then measure the body's width in the Inspector against the object (expect within 1 mm). Then **Share via gist and load it in a second browser**: the photo and its scale come back. The fixture is a flat-shaded JPEG; a real photo has shadows, glare and uneven light.

**Answer:** validation

#### X12 · Auto-trace a photographed part to scale

`sketch-004` #2 · filed 2026-10-06

**Check:** **Trace quality on a real photo:** does a tap inside the part follow its edge, or does the shadow join the part (outline too big on one side) or a glare patch split it? Try **Adjust → Threshold** off Auto and nudge it: does the outline re-trace in place to something better, and is the *Auto (n)* readout useful as a starting point? Is the default **Tolerance 0.5 mm** a good balance between point count and fidelity for a printed replacement?

**Answer:** validation

#### X13 · Design resolution and export resolution

`core-035` #1 · filed 2026-09-28

**Check:** Print a Ø22 bore (or a bearing seat) exported at **Normal** and again with **Export → Resolution: Print**, and measure both across the flats with calipers. Print should be measurably closer to nominal (docs/resolution.md's table: 0.084 vs 0.019 mm undersize). Open both STLs in a real slicer first; it should report no repairs

**Already known:** 2026-11-07: The slicer half (both STLs open in Cura with no repairs) moved to `FIND-testing-023`; printing and caliper measurement stay here. 2026-11-14 (`FIND-testing-023`, slicer half **OK**): a 40 x 40 x 20 mm block with a Ø22 mm cylinder subtracted, exported through File ▾ → Export… with Resolution **Same as design (Normal)** and with **Print**. `CuraEngine` 5.13.0 (stock Ultimaker Original) slices both with …

**Answer:** validation

---

## 8. Older device feel checks

Closed 2026-11-17 by Q1: the 89 rows are `N/A` in VERIFY.md (superseded), replaced by the free-form iPhone pass in §5b.

---

## 9. Parked — not asked

Reopen any of these by telling an agent "unpark Z<n>".

| Item | Row | Check | Why it is parked |
|---|---|---|---|
| Z1 | `testing-037` #E6 | Anthropic key survives relaunch (optional, spends tokens) | needs a real Anthropic API key (bills tokens; parked 2026-11-07) |
| Z2 | `build-035` #3 | Gate 3 of `TODO/RELEASE-CHECKLIST.md`: after `ios:release` validates the signed archive, App Store Connect raises no privacy-manifest … | App Store Connect; native uploads are held |
| Z3 | `build-035` #4 | App Store Connect, App Privacy: answer **Crash Data** collected, **not linked to you**, **not used for tracking**, purpose **App … | App Store Connect; native uploads are held |
| Z4 | `build-033` #2 | On the iPad, if iOS kills the web content a second time within a few seconds of a reload, the window stays as it is (dark, empty); closing … | cannot be triggered on demand; note it if it ever happens |
| Z5 | `testing-032` #1 | With the in-app Assistant and a key (deferred, cost): does the activity row read *Set piModel to 5* with the impact line once `FIND-ai-040` … | needs a real Anthropic API key (bills tokens; parked 2026-11-07) |
| Z6 | `build-029` #4 | Windows and Android: the same, when a machine or emulator is available | needs Windows or Android hardware you do not have here |
| Z7 | `build-024` #1 | Android launcher and recents show the WarpCad cube under circle, squircle and square masks | needs Windows or Android hardware you do not have here |
| Z8 | `build-024` #2 | No white frame at launch, status and navigation bars are `#10131a` | needs Windows or Android hardware you do not have here |
| Z9 | `build-023` #4 | Windows taskbar and Start menu show the tile | needs Windows or Android hardware you do not have here |
| Z10 | `io-016` #5 | Stage 2: how a share link looks and behaves in Gmail on Android (linkified whole? the Shared view opens in Chrome from the Gmail in-app … | needs Windows or Android hardware you do not have here |
| Z11 | `build-016` #6 | Part 6 lawyer review of `CLA.md`, governing-law clause (placeholder), AI authorship, docs-licence choice; record reviewer and date in the … | Part 6 legal review: you decided 2026-11-07 not to use a lawyer; it gates only the App Store submission, which is held |
| Z12 | `ai-023` #1 | Register the live endpoint with GitHub Copilot's MCP support (the reported failure was never reproduced), enable 15 minutes, and ask it to … | only if you use GitHub Copilot |
| Z13 | `ai-011` #1 | Run `ANTHROPIC_API_KEY=… npm run eval:ai` once (about $1-3 at the default model; `--max-cost` caps it), look at `bench/results/ai/*.md`, … | needs a real Anthropic API key (bills tokens; parked 2026-11-07) |
| Z14 | `ai-011` #2 | Calibrate the case thresholds against that first run: the hole volume range (60500-63800), bracket fill (at most 0.85), wing length … | needs a real Anthropic API key (bills tokens; parked 2026-11-07) |
| Z15 | `ai-008` #2 | Real iPhone: **Attach** opens the camera / photo picker, the phone half sheet shows the Confirm card without scrolling, the overlay … | needs a real Anthropic API key (bills tokens; parked 2026-11-07) |
| Z16 | `ai-006` #2 | On a phone, **Attach image** offers the camera as well as the photo library, and a photo taken there arrives as a thumbnail | needs a real Anthropic API key (bills tokens; parked 2026-11-07) |
| Z17 | `ai-004` #2 | On a real iPhone and iPad (Safari), save a key, close the tab, reopen the next day: still **Connected**, or it falls back to the key sheet … | needs a real Anthropic API key (bills tokens; parked 2026-11-07) |
| Z18 | `ai-002` #1 | Send `createToolRegistry().definitions('ai')` as `tools`, each `{ name, description, input_schema: toStrictWire(inputSchema), strict: true … | needs a real Anthropic API key (bills tokens; parked 2026-11-07) |
| Z19 | `ai-002` #2 | Measure the real tool-list size with `count_tokens`. If `apply_records`' duplicated schemas cost too much, decide (with `ai-011`) whether … | needs a real Anthropic API key (bills tokens; parked 2026-11-07) |

---

## Answered

One line per answered item, newest first: `YYYY-MM-DD · <code> · <answer> · <where it was recorded>`.

- 2026-11-17 · M3 · Pass · VERIFY `ui-018` #1 OK
- 2026-11-17 · M1 · Fail: the cube mark is small inside the tile · VERIFY `build-023` #3 Issue; filed warpcad-native `M19-build-041`
- 2026-11-17 · Q15 · Keep the siblings · filed `FIND-ui-141`, Next up row 89
- 2026-11-17 · Q14 · Add the result to the text and redo the GIF · `FIND-docs-036`; VERIFY `docs-013` #2 Moved
- 2026-11-17 · Q13 · Label + one sentence · `FIND-docs-036`; VERIFY `docs-014` #3 Moved
- 2026-11-17 · Q12 · New image-notice wording · `FIND-ui-129`; VERIFY `ai-008` #6 Moved
- 2026-11-17 · Q11 · Add Min/Max fields · filed `FIND-ui-140`, Next up row 88
- 2026-11-17 · Q10 · Reword the paragraph and re-record both GIFs · filed `FIND-docs-037`, Next up row 87
- 2026-11-17 · Q9 · Hide the lines while rotating · filed `FIND-ui-139`, Next up row 86
- 2026-11-17 · Q8 · Strengthen the hover tint · filed `FIND-ui-138`, Next up row 85
- 2026-11-17 · Q7 · Note it for the screws work · `DEFER-core-065`; VERIFY `core-027` #1 Moved
- 2026-11-17 · Q6 · Reword for one mesh · `FIND-ui-127`; VERIFY `ui-107` #4 Moved
- 2026-11-17 · Q5 · Keep it like the Library toast · VERIFY `ui-107` #3 OK
- 2026-11-17 · Q4 · Keep the clearance defaults · `docs/decisions/ai-partner.md` Decision 14; VERIFY `ai-035` #5 OK
- 2026-11-17 · Q3 · Build all five AI tool gaps · `FIND-ai-044` Decided; un-held, Findings row
- 2026-11-17 · Q2 · Radius and spacing · `FIND-ui-123` Decided; `ROADMAP.md` row
- 2026-11-17 · Q1 · Close the 89 older feel checks; add a free-form iPhone pass · `VERIFY.md` 89 rows N/A; §5b H0
- 2026-11-17 · U5 · Done (saved as `warcad-test-nogist-token`; agent copied it to `warpcad-test-nogist-token`). Probe answered 404, not 403 · `VERIFY.md` io-017 #1 Issue; filed `FIND-io-037`, Next up row 83
- 2026-11-17 · U4 · Done (agent verified the Keychain DSN matches `SENTRY_DSN`; `--check` output unconfirmed) · `VERIFY.md` build-035 #1 OK; `FIND-testing-028`
- 2026-11-17 · U3 · Done: Safari quit, safaridriver enabled · `FIND-testing-026`; `ROADMAP.md` Next up row 82
- 2026-11-17 · U2 · Done: `testing-028` started in the Claude desktop app with computer use · `FIND-testing-028`, `ROADMAP.md` Held
- 2026-11-17 · U1 · Use my gh login (secret gists, private `warpcad-scratch`) · `FIND-testing-045`; `ROADMAP.md` Next up row 81

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
