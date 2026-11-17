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
| [2](#2-questions--answer-from-anywhere) | Questions | 9 now, 79 being drafted | ~1 min each | the follow-up work each answer files |
| [3](#3-quick-checks-at-the-mac) | Quick checks at the Mac | 21 | 63 min total | closes rows |
| [4](#4-accounts-and-settings) | Accounts and settings | 5 | 38 min total | closes rows |
| [5](#5-device-sessions) | Device sessions: iPad, iPhone, either | 18 + 11 + 7 | ~45 + 25 + 15 min | Gate 1 follow-ups, file types, Live MCP |
| [6](#6-start-now-check-later) | Start now, check later | 6 | a few minutes, days apart | closes rows |
| [7](#7-at-the-printer-or-bench) | At the printer or bench | 13 | print time | closes rows |
| [8](#8-older-device-feel-checks--see-q1) | Older device feel checks | 89 | depends on Q1 | — |
| [9](#9-parked--not-asked) | Parked | 19 | none until reopened | — |

**Next for you:** Q1 (1 min, replace the 89 older device feel checks with free-form passes?).

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

#### Q1 · Replace the 89 older device feel checks with free-form passes?

**Question:** Should the 89 real-device "feel" checks filed before November (§8) be closed as superseded,
and replaced with one 10-minute free-form pass on the iPhone plus the 36 current device checks in §5?

**Background:** These rows date from 2026-09-05 to 2026-10-31. Each asks for a judgement on a real phone or
iPad ("is this easy to hit", "does this read clearly"). Most surfaces have been reworked since: the Inspector
sheet, the Library rail, the nav chrome, the toolbars and the button system. Agents have already done the half
that emulation can show: tap-accuracy models (`testing-031`), real-GPU looks (`testing-030`), cold reads
(`testing-029`). Gate 1 passed 22 of 33 hands-on checks on the iPad on 2026-11-16. Checking all 89 one by one is
several hours, mostly on screens that no longer look the way the row describes.

**Options:**
- **Close them; do a free-form iPhone pass (Recommended):** the runner sets the 89 rows to `N/A` with
  "superseded 2026-11-17, replaced by free-form passes". §8 is deleted. A 10-minute free-form iPhone item is
  added to §5, and anything it turns up is filed as a finding. `CLAUDE.md` already requires a free-form pass at
  every milestone end.
- **Keep them as an optional long tail:** §8 stays. `/owner older` walks it when you have time, newest first.

**If deferred:** nothing changes. §8 stays at the bottom and is never asked unless you ask for it.

**Answer:** question

#### Q2 · Which style values the guard should enforce (`ui-123`)

**Question:** Should the style guard spec also forbid literal `border-radius` and spacing values, the way it
already forbids literal colours?

**Background:** `src/styles/guard.spec.js` fails the build on a literal colour, z-index or font size, so a
restyle only touches the token file. Spacing and corner radius are still literals: 649 `padding`/`gap` values
and 58 `border-radius` values across the `.vue` files. Radius is cheap to bring in (50% and 999px map to
existing tokens). Spacing is a large mechanical sweep that will shift screenshots.

**Options:**
- **Radius only (Recommended):** 58 values, low risk. Spacing stays local, since layout padding is rarely
  restyled.
- **Radius and spacing:** the full sweep. Large diff, many snapshot changes to review.

Leave-it-as-is is the third answer (type it in Other). **If unanswered when the runner reaches `ui-123`, it
goes ahead with radius only**, which is reversible. The native window colour half needs no decision.

**Answer:** question

#### Q3 · Which of the five AI tool gaps to build (`ai-044`)

**Question:** Which of the five MCP tool gaps left after `ai-041` should become ready work?

**Background:** `ai-041` taught the AI tools to keep a group's other parts, name bodies and measure parts in a
group. Five gaps remain, each with a workaround in the skills: (2) no tool reads a part's operation and
parameters, or copies a part, so `add-clearances` can rebuild only boxes, not round pins; (5) no offset
operation (`enlarge` scales about the centre); (6) a tongue joint is refused on a hollow box, so the enclosure
lid gets no joint; (7) keep-out parts other than the Pi's holes are used up when subtracted, so the enclosure
skill makes separate cutters; (8) no direct parameter edit, so resizing a placed body needs a variable or a new
step.

**Options:**
- **Build 2 and 8 now, hold 5, 6 and 7 (Recommended):** 2 is what blocks clearances on round parts, and 8 is
  the most basic edit an agent needs. 5 is hard geometry, and 6 and 7 have workarounds that work today.
- **Build all five:** five new rows. Two are Opus-sized (offset, hollow-box joint).

**If deferred:** `ai-044` stays held. The skills keep their workarounds.

**Answer:** question

#### Q4 · Default clearances in the `add-clearances` skill (`ai-035` #5)

**Question:** Keep the AI's default fit clearances: 0.2 mm per side for snug and press fits, 0.4 mm per
side for sliding fits, and no default for resin or CNC?

**Background:** When you ask an agent to "add clearance" without a number, it uses these. They were chosen
without you (`docs/decisions/ai-partner.md` Decision 14; numbers in `mcp/skills/add-clearances/SKILL.md`).
They are typical FDM values. Your printer tests in §7 (tenons, dovetails, butterfly keys at 0.2 mm) will show
whether 0.2 fits your printer.

**Options:**
- **Keep them (Recommended):** revisit after the §7 prints.
- **Change them:** type the numbers in Other, and the skill and the decision record are updated.

**Answer:** question

#### Q5 · Where the "Reading… / Imported…" line sits on a phone (`ui-107` #3)

**Question:** At phone width the import status line shows at the top centre, over the operations toolbar row,
the same place as the Library's toast. Keep it there?

**Background:** It shows for a few seconds while a model file reads and lands. It covers toolbar buttons only
for that time, the same way the existing Library toast does.

**Options:**
- **Keep it, matching the Library toast (Recommended):** brief, and consistent with an existing toast.
- **Move it below the toolbar:** a small finding is filed. The Library toast probably moves too.

**Answer:** question

#### Q6 · "Saves this group as a fixed part" on a single imported mesh (`ui-107` #4)

**Question:** When you save one imported STL to My parts, the sheet says "Saves this **group** as a fixed
part". Reword it for a single mesh?

**Background:** The sentence was written for groups and predates model import. For one mesh "group" is
wrong, though harmless.

**Options:**
- **Reword it for one mesh (Recommended):** "Saves this as a fixed part" when it is one body. Added to the
  wording batch already queued (`ui-127`), so no new task.
- **Keep it:** no change.

**Answer:** question

#### Q7 · Flat-head screws stand on their heads (`core-027` #1)

**Question:** A placed flat-head screw has its wide head on the grid and its thread pointing up, upside down
compared with how it sits in a countersunk hole. Add a head-up orientation?

**Background:** Driven 2026-11-14: Bolt / screw, Type Flat head, M10 × 20: the 18 mm head is at z = 0 and the
thread runs up (same for Wood screw, flat head #8). This matches the original library and Hex head's head-at-z=0
convention. To cut a countersunk hole you would rotate it 180° first. Screws, threads and gears are deferred
(owner, 2026-11-13).

**Options:**
- **Leave it; note it for the screws work (Recommended):** a line goes into the deferred screws task
  (`core-065`), so it lands with the rest of the screw work.
- **File it now as ready work:** a small finding at the bottom of the queue.

**Answer:** question

#### Q8 · Hover tint on light-blue bodies is faint (`ui-049` #1)

**Question:** Hovering a row in the Objects list tints its body violet, but on the default light-blue body
the change is faint. Make it stronger?

**Background:** Measured on this Mac's GPU (2026-11-14), colour difference ΔE00, where ≥ 10 reads as clearly
different: light-blue body 6.9 dark / 5.3 light, default body 7.7 / 6.2, red body 25.5 / 24.0. Hover cannot be
mistaken for selection (35-41). Two cold readers split: one called it clear, one said no for the light-blue
body (the highlighted list row carried the signal).

**Options:**
- **Strengthen it (Recommended):** a small finding to raise the tint on light bodies to ΔE ≥ 10, checked
  by the same measurement.
- **Keep it:** the list row's highlight is enough.

**Answer:** question

#### Q9 · Dimension lines don't turn during a rotate drag (`ui-012` #1)

**Question:** While you drag a rotate ring, the dimension lines stay on the unrotated box and jump to the
turned shape only on release. Hide them during the drag?

**Background:** Measuring the turned solid every frame would need the kernel per frame, which the preview
avoids (`src/composables/useSelectedBody.js`). The numbers are right the moment you let go. Two cold readers
split: one found it misleading, one didn't notice.

**Options:**
- **Hide the lines while rotating (Recommended):** the cheap fix the original task named. Nothing wrong is
  shown, and the lines come back on release.
- **Keep them:** no change.

**Answer:** question

---

## 3. Quick checks at the Mac

Each takes 1-5 minutes at this Mac or in a desktop browser. Any order.

#### M1 · Mac Dock icon size

`build-023` #3 · 1 min · filed 2026-11-07

**Steps:** 1. Launch the built WarpCad Mac app. 2. Look at its Dock tile and Cmd-Tab switcher tile beside Finder and Safari.

**Pass if:** The tile sits in Apple's rounded grid at about the same size as stock apps.

**Answer:** validation

#### M2 · Claude Code attaches the WarpCad guide

`ai-028` #2 · 1 min · filed 2026-10-29

**Steps:** 1. Same session. 2. Type `@warpcad:warpcad://guide` and send a message.

**Pass if:** The guide is attached (it shows as an attachment and the model can quote it).

**Answer:** validation

#### M3 · Trackpad right-drag pans

`ui-018` #1 · 1 min · filed 2026-09-06

**Steps:** 1. On the MacBook trackpad (no mouse), two-finger click and hold, then drag in the view.

**Pass if:** The view pans. If it does not, try Shift+drag and note in Other which worked.

**Answer:** validation

#### M4 · My parts: project-only esp8266 row on your profile

`ui-096` #1 · 2 min · filed 2026-11-06

**Steps:** 1. In the browser profile you normally use for WarpCad, open Library → My parts. 2. Open ⋯ on **esp8266 feather**. 3. Read the note, then tap **Delete…**.

**Pass if:** The note says why it is listed, and Delete… explains with Cancel only. In Other, say which case: (a) placed, (b) nested, (c) stale.

**Answer:** validation

#### M5 · My parts: the broken nested part on your profile

`ui-095` #1 · 2 min · filed 2026-11-06

**Steps:** 1. Same browser profile. 2. Open Library → My parts. 3. Find the row with ⚠. 4. ⋯ → Delete… → Delete.

**Pass if:** The banner names the broken part, the row shows ⚠ and the reason, and Delete removes it.

**Answer:** validation

#### M6 · Claude Code lists the WarpCad prompts

`ai-029` #1 · 2 min · filed 2026-10-29

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

`core-015` #1 · 5 min · filed 2026-09-13 · **waits on:** testing-044 regenerates the side-by-side pictures

**Steps:** 1. Open the side-by-side images the runner lists in this item (V1 left, WarpCad right) for camera v1, v2, HQ. 2. Compare against what you know of the boards.

**Pass if:** Sensor, lens barrel, ribbon and mount read as the right parts in the right places.

**Answer:** validation

#### M21 · Pi boards against the real boards

`core-014` #1 · 5 min · filed 2026-09-13 · **waits on:** testing-044 regenerates the side-by-side pictures

**Steps:** 1. Open the side-by-sides for Pi 2/B+, 3 and 4. 2. Compare against a real board or your memory of one.

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

## 8. Older device feel checks — see Q1

Filed before 2026-11-01. Never asked unless Q1 keeps them; then `/owner older` walks them newest first.

#### L1 · Gist README carries the project brief

`io-023` #2 · iPhone · filed 2026-10-31

**Check:** On a real iPhone in Safari, open a short link to a project that has a description: the About popup sits over the model, **View the model** dismisses it, and the header **About** button brings it back.

**Answer:** validation

#### L2 · Tiered Library and Operations panels

`ui-079` #3 · iPad · filed 2026-10-29

**Check:** Drag a window edge slowly 1440 to 390 px and back in Chrome, Firefox and Safari, and on a real iPad (portrait, landscape, Split View): no jumps, text squash or cover of the gizmo/nav chrome

**Already known:** 2026-11-07: The desktop-engine half (a 1440 to 390 px sweep in Chromium, Firefox and WebKit) moved to `FIND-testing-017`; the real-iPad half stays here. 2026-11-07: The real-Safari window resize moved to `FIND-testing-026`; the real-iPad half stays here. 2026-11-14 (`FIND-testing-017`): the desktop-engine half is answered. A 1440 to 390 px sweep and back in 10 px steps (106 steps each way, height 900) in Chromium, …

**Answer:** validation

#### L3 · File ▾ → Save as gist…

`io-021` #2 · iPhone · filed 2026-10-28

**Check:** On a real iPhone, Save as gist's dialog as a bottom sheet with the on-screen keyboard up in the Name field: is the Save button always reachable?

**Answer:** validation

#### L4 · File ▾ → Save as gist…

`io-021` #3 · iPhone · filed 2026-10-28

**Check:** On a real phone, the header's chip reads "Saving…" for about a second after Save as gist, then "Saved to gist". Noticeable or fine?

**Answer:** validation

#### L5 · Store and share a project as a gist

`io-017` #2 · iPhone · filed 2026-10-28

**Check:** One real publish, read and delete with a throwaway token from a real iPhone: does **Publish** put the link on the clipboard (Safari refuses a copy that follows network calls; the sheet starts the write inside the tap), is the token field above the on-screen keyboard in the bottom sheet, how the link and the gist's README look in Messages and on github.com, and do GitHub's real token-page labels match "no repository access" and "Gists: Read and write" in the docs

**Answer:** validation

#### L6 · Share a project by link

`io-016` #1 · iPhone · filed 2026-10-27

**Check:** Paste a long share URL (try the dovetail example's link, then a padded one around 6, 10 and 20 KB) into an iPhone Messages thread and a Gmail draft; record where each stops linkifying, wraps badly or truncates, then set the ceiling in `docs/decisions/share-link.md`

**Answer:** validation

#### L7 · Share a project by link

`io-016` #3 · iPhone · filed 2026-10-27

**Check:** Does an unpadded base64url payload survive being tapped in Messages and Mail without a trailing character being eaten (`-`, `_` at the end)?

**Answer:** validation

#### L8 · Share a project by link

`io-016` #4 · iPhone · filed 2026-10-27

**Check:** Stage 2 (2026-10-27): the link preview card Messages draws for a WarpCad share link — does it use the generic `og:title` / `og:description` / `og:image` from `index.html` (the WarpCad social preview), and does the card hide or mangle the link?

**Answer:** validation

#### L9 · Align popover: seven positions per axis

`ui-086` #1 · iPhone, then iPad · filed 2026-10-26

**Check:** On a real iPhone and iPad (Safari), the seven-icon strips read clearly at 44 px: can you tell **half −** from **inside −** by the icon alone, and does a tap land on the button you aimed at (no gaps between them)?

**Already known:** 2026-11-07: The cold-read half (a fresh agent with no project context, on screenshots or emulation) moved to `FIND-testing-029`; the real-device half stays here. 2026-11-14 (`testing-029` panel): Cold-read half (emulated 390x844): A: mostly clear (column headers rescue the icons), B: unclear; both say *half −* and *inside −* differ by a few pixels of the sliver. Filed `FIND-ui-128`. Taps: 21 of 21 landed on the …

**Answer:** validation

#### L10 · Library icon rail and compact viewport chrome

`ui-084` #1 · iPad · filed 2026-10-21

**Check:** On a real iPad, drag a window or rotate between 1024 and 790 px wide and watch the Library column turn into the rail at its own step, then the pad and triad shrink, with no text squash and nothing over the triad

**Already known:** Partly observed 2026-11-07 (headless Chromium, emulated width, not an iPad): the Library column is gone at 1024 px and the rail is present at 900 px, so the step falls between them. The shrink and text squash are not measured. Real iPad still needed.

**Answer:** validation

#### L11 · Warn on focus when the file may have changed

`io-012` #1 · iPhone · filed 2026-10-21

**Check:** On an iPhone (390×844) in Safari: open a project file, change it in another app, return to WarpCad. The status chip should read *This file may have changed. Use File ▾ → Merge file… to bring it in.* and wrap without pushing the header.

**Answer:** validation

#### L12 · Live MCP access entry in the phone header

`ui-075` #1 · iPhone · filed 2026-10-19

**Check:** On a real iPhone (Safari), the header's Live MCP button ring/dot is legible and a tap does not hit **Redo**/**File** beside it (gaps are 4 px)

**Already known:** 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): the Live MCP header button is not in the production build (dev host only; the grouped AI menu replaced it, ui-078), so the neighbours measured are the production header at 390 px: Undo, Redo, History 44x44 and File …

**Answer:** validation

#### L13 · Version label in the header

`ui-077` #1 · iPhone · filed 2026-10-18

**Check:** On a real iPhone, the `WarpCad` / `dev` stack reads clearly in the top bar and the controls to its right stay tappable.

**Answer:** validation

#### L14 · Phone Library sheet: how much canvas is left to drop into

`ui-072` #1 · iPhone · filed 2026-10-17

**Check:** On a real phone, open the Library and drop two parts in a row: is the visible canvas strip tall enough to aim at without the toolbar or nav chrome getting in the way, and is it clear which row to scroll for (a row below the sheet's clip, such as Sphere, is hidden until the sheet is scrolled)?

**Already known:** 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): phone 390x844, Library open: sheet top at y 367 (433 px tall); 7 of 24 rows fit above the clip (Cuboid to Sketch), Sphere is the first row hidden (y 819, clip 800) and 16 rows are below it. The free canvas is a 125 …

**Answer:** validation

#### L15 · Third-party notices

`build-011` #2 · iPhone · filed 2026-10-17

**Check:** On a real iPhone, the two footer links wrap cleanly and each is easy to tap.

**Already known:** 2026-11-07: The wrap half, in the iOS Simulator moved to `FIND-testing-027`; whether each link is easy to tap stays here.

**Answer:** validation

#### L16 · Bundle load time on the real deploy

`perf-002` #2 · iPhone · filed 2026-10-17 · **waits on:** perf-006 lands

**Check:** On a real phone over a real mobile connection, load the hosted app cold and judge by eye whether the first usable frame feels any different once `perf-003` ships.

**Answer:** validation

#### L17 · Assistant folds to its header while an MCP agent is connected

`ui-071` #1 · iPhone · filed 2026-10-17

**Check:** On a real iPhone, with a real MCP agent connected, does the compact Assistant (header + Undo AI turn, about 159 px) feel right, and is the Inspector reachable enough by closing the Assistant first? Decide whether the phone should keep the Inspector tab docked above the compact sheet instead.

**Answer:** validation

#### L18 · Repeat button and panel

`ui-069` #5 · iPhone · filed 2026-10-17

**Check:** Phone: the shrunk bar lifts the Inspector sheet by 54 px while it is up. Real-thumb check that the bar, the Delete row and the Library tab all stay tappable.

**Answer:** validation

#### L19 · The Library remembers each part's last-used params

`ui-068` #2 · iPhone · filed 2026-10-17

**Check:** On a real phone, is the ↺ Reset button easy to hit and clearly not a drag handle (44 x 44 at the row's right edge)?

**Answer:** validation

#### L20 · Import an STL (and later OBJ / 3MF) into My parts

`io-009` #3 · iPhone · filed 2026-10-15

**Check:** On a real iPhone, **Import model file…** opens Files and iCloud (no camera-only picker), and an STL in iCloud Drive reads without a timeout.

**Already known:** 2026-11-07: The picker-type half, in the iOS Simulator moved to `FIND-testing-027`; the iCloud Drive read stays here.

**Answer:** validation

#### L21 · Phone library item: model, case, enlarge and separate plateau

`core-057` #3 · either · filed 2026-10-15

**Check:** On real phone/tablet hardware, are the Model and Case dropdowns under the Phone row easy to tap and legible (they are 32 px tall like the Pi's; the TODO suggested 44 px)?

**Answer:** validation

#### L22 · A changed project file merges into the open project

`io-010` #2 · iPhone · filed 2026-10-15

**Check:** In Safari (desktop and iPhone), open the same file, have Claude Code add a step, then **File ▾ → Merge file…** and pick it: the step comes in with `Merged 1 step from <file name>` and **Undo merge**; nothing appears by itself

**Already known:** 2026-11-07: The desktop-Safari half moved to `FIND-testing-026`; the iPhone half stays here.

**Answer:** validation

#### L23 · Rotate rings pick the step from drag speed on every pointer type

`ui-066` #2 · either · filed 2026-10-15

**Check:** On a real iPad or iPhone, repeat the fling, creep, rest drag on a ring: coarse then `fine 0.1°`, camera does not orbit, readout clear of the finger. (A synthetic CDP touch drive was inconclusive; the e2e touch-type pointer test passes.)

**Answer:** validation

#### L24 · Docs inside the app, help buttons

`ui-061` #1 · iPhone · filed 2026-10-15

**Check:** Installed PWA on an iPhone: open once online, go to airplane mode, relaunch, File menu → Help and documentation opens with text and stills

**Answer:** validation

#### L25 · Docs inside the app, help buttons

`ui-061` #2 · iPhone · filed 2026-10-15

**Check:** Same offline: a GIF you never opened online shows its alt text rather than a broken box; one you opened online still plays

**Answer:** validation

#### L26 · Name a part in the Inspector

`ui-056` #2 · iPad · filed 2026-10-15

**Check:** On a real iPad, the pencil and the name are easy to hit, and the field does not zoom the page on focus

**Already known:** 2026-11-07: The no-zoom-on-focus half, in the iOS Simulator moved to `FIND-testing-027`; whether the pencil and name are easy to hit stays here.

**Answer:** validation

#### L27 · Variables panel and bind control: feel and device checks

`ui-059` #1 · iPhone · filed 2026-10-11

**Check:** On a real iPhone, tap a bind link button and judge the popover bottom sheet: does it cover the field you are binding, and is **Close** reachable one-handed?

**Answer:** validation

#### L28 · Save to library and My parts

`ui-055` #1 · iPhone · filed 2026-10-10

**Check:** On a real iPhone, drag a My parts row (including a long press on the thumbnail) into the view; the page must not scroll or select the image, and the Inspector tab must not sit over the last Library row.

**Answer:** validation

#### L29 · Print prep: split, joint and Print pieces

`io-007` #3 · iPhone · filed 2026-10-10

**Check:** On a real phone, drag the cut-plane handle with a finger while the Split sheet is open. A trusted-touch drive in emulation passed after two fixes (sheet no longer buries the handle, a cancelled touch no longer throws the plane away), but only hardware shows whether a thumb can reach the handle and the sheet's fields comfortably.

**Answer:** validation

#### L30 · Sketch reference image: load a photo, set its scale, sanitize it

`sketch-003` #1 · iPhone · filed 2026-10-04

**Check:** **Real iPhone, Safari:** Slices → **Add image…** offers both camera and library. A photo from each (iOS default format) arrives as a JPEG and appears under the grid. If iOS hands over HEIC, the message must read *Choose a JPEG or PNG — iPhone HEIC photos can be exported as JPEG*. Also try a 48 MP shot (iPhone 14 Pro and later): it is refused as over 40 MP. Is that acceptable, or should import downscale anything up to 8192 px instead?

**Already known:** 2026-11-07: The photo-library, HEIC and 48 MP half, in the iOS Simulator moved to `FIND-testing-027`; the camera half and the downscale decision stay here.

**Answer:** validation

#### L31 · Snap new outlines to existing ones

`sketch-007` #2 · iPhone · filed 2026-10-03

**Check:** On a real phone, draw a circle with its centre on a rectangle's corner. The marker (lifted 56 px above the finger, with a leader line) shows only while the finger is within ~12 px of the corner. Once the drag carries it further, only the dashed preview, centred on the corner, says the centre snapped. Is that enough confirmation, or should the centre keep a marker for the whole drag?

**Answer:** validation

#### L32 · Continuous Line tool

`sketch-006` #2 · either · filed 2026-10-03

**Check:** Double-tap the last point to finish the line, on a real touch screen: does it feel natural, or do you reach for **Finish**? (A double-tap adds the point on the first tap, then finishes on the second.)

**Answer:** validation

#### L33 · Sketch vertex editing: move, add, delete points, Simplify, Convert to outline

`sketch-002` #1 · iPhone, then iPad · filed 2026-10-03

**Check:** On a real iPhone and iPad (Safari): drag a corner dot and an edge's hollow midpoint dot with a finger. Does the 44 px target feel right, and can you still see the point you are moving under your fingertip? (WebKit trusted touch *drags* can't be automated here; only Chromium touch was driven.)

**Answer:** validation

#### L34 · Sketch editor: select, edit, delete an outline

`sketch-005` #1 · iPhone · filed 2026-10-03

**Check:** On a real iPhone, with the Select tool armed, is the picked outline's thicker accent-colour stroke easy to tell from the others in daylight, and is the "Circle, Solid — 15 mm radius" line readable without opening the Inspector? (The stroke is only ~1 px thicker than an unpicked one.)

**Answer:** validation

#### L35 · Sketch editor: select, edit, delete an outline

`sketch-005` #2 · iPhone · filed 2026-10-03

**Check:** On a real phone, does the three-row Sketch toolbar (Select, tools / Hole, Delete, Slices, Extrude / Done, Cancel) leave enough canvas to draw comfortably? The resting reachable canvas measured exactly 69 % (the ui-020 #3 floor), down from 76 %. If it feels cramped, consider moving Slices/Extrude into a menu.

**Answer:** validation

#### L36 · Sketch primitive: draw outlines, extrude to a solid

`sketch-001` #8 · iPhone, then iPad · filed 2026-10-02

**Check:** On a real iPhone and iPad: drag Sketch out of the Library, draw two circles with a finger, tap the inner one, Hole, Extrude ▾ → Linear 30, Done. No accidental orbit, no sheet popping over the drawing, Done/Cancel always reachable.

**Answer:** validation

#### L37 · Sketch primitive: draw outlines, extrude to a solid

`sketch-001` #9 · iPhone · filed 2026-10-02

**Check:** On a real phone: two-finger pan/pinch inside the editor while one finger draws — does a two-finger gesture ever leave a stray outline behind?

**Answer:** validation

#### L38 · File ▸ New

`ui-054` #2 · iPhone · filed 2026-10-01

**Check:** On a phone, the New confirm dialog reads comfortably and Replace is easy to hit

**Answer:** validation

#### L39 · Drill the mounting holes through raspberrypi.* boards

`core-034` #2 · either · filed 2026-09-30

**Check:** Same on a real iPad/iPhone (WebKit GPU): the coplanar camera-module v1/v2 holes (cutter exactly as tall as the board) render without speckle at the hole walls.

**Already known:** Graduating: automated depth/translucency spec filed as `FIND-testing-015` (real-GPU look stays here). 2026-11-13: the headless coplanar-hole check is automated by `e2e/webgl-depth-translucency.e2e.js` (`testing-015`); this row stays Open for the physical iPad/iPhone look only.

**Answer:** validation

#### L40 · Open announces itself before it folds

`core-032` #1 · either · filed 2026-09-30

**Check:** On a real iPhone/iPad, open a large project (200-record fillet fixture): the File button's spinner keeps turning and the chip reads `Opening <name>…` before the pause

**Already known:** 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): phone touch, fillet-50 (200 records) opened through File, Open: the File button reads Opening... and the chip reads Opening fillet-50.ndjson... 13-20 ms after the file is handed over, at every throttle, before the …

**Answer:** validation

#### L41 · Design resolution and export resolution

`core-035` #2 · iPhone, then iPad · filed 2026-09-28

**Check:** On a real iPhone and iPad, open **File ▾ → Resolution…**, step Draft → Normal → Fine → Print on a scene with a large cylinder and a sphere. The re-facet should be visibly different at each step, and Draft should not look broken. The native **Resolution** select in the Export popover should open the iOS picker at a comfortable tap size

**Already known:** testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Mac half OK, the real iPhone/iPad half (iOS picker, tap size) stays Open. File ▾ → Resolution… driven through Draft, Normal, Fine, Print on a cylinder and a …

**Answer:** validation

#### L42 · Design resolution and export resolution

`core-035` #3 · iPhone · filed 2026-09-28

**Check:** On a real phone, with a busy scene (a few Pi boards and bolts), change the design resolution to **Print**. It re-folds on the main thread (76 ms median on 24 bodies on an M4 Pro; a phone is several times slower). Judge whether the pause feels acceptable or needs the pending indicator the TODO asked for (`core-032` owns moving cold folds off the main thread)

**Already known:** 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): 24 bodies, phone touch, design resolution to Print: the main thread stalls for one long task of 152 ms at 1x, 575-605 ms at 4x and 818-861 ms at 6x (event-to-paint 176/624-648/880-920 ms); the volumes settle after …

**Answer:** validation

#### L43 · Delete the selected body, or remove one part of a group

`ui-051` #1 · iPhone · filed 2026-09-28

**Check:** On a real iPhone: select a body, the Inspector sheet opens with **Delete** pinned just above the Library tab. Is it easy to hit on purpose and hard to hit by accident when reaching for the Library tab below it?

**Answer:** validation

#### L44 · Objects list folded into the Inspector, hover-to-highlight

`ui-049` #2 · iPhone, then iPad · filed 2026-09-27

**Check:** On a real iPhone and iPad (Safari), tap rows and checks in the Inspector's list, including one that changes the selection count so the sheet reflows. No row and no body should ever light up violet from a tap. Then on an iPad with a trackpad, or a touch laptop: after tapping, move the pointer onto a row. It should highlight on the first real movement.

**Already known:** 2026-11-07: The tap half, in the iOS Simulator moved to `FIND-testing-027`; the trackpad and touch-laptop half stays here.

**Answer:** validation

#### L45 · Objects list folded into the Inspector, hover-to-highlight

`ui-049` #3 · iPhone · filed 2026-09-27

**Check:** At phone width, select an enclosed body from the list, then fold the Inspector sheet with its tab to reach the gizmo (the sheet stays up after a list selection, as after any selection). Is that one extra tap workable, or does selecting from the list want the sheet to fold on its own?

**Answer:** validation

#### L46 · Objects list folded into the Inspector, hover-to-highlight

`ui-049` #4 · iPhone · filed 2026-09-27

**Check:** Feel of the Objects section: ticking checks keeps the list open, a plain row tap folds it to the body's detail, and the breadcrumb's **Objects** crumb or the bar reopens it. Does that read naturally on a phone, or does the list folding after a plain tap surprise you?

**Answer:** validation

#### L47 · Align to origin: real-device feel of the small grid and the native select

`ui-050` #1 · iPhone · filed 2026-09-27

**Check:** On a real iPhone, open the Reference `<select>` for a dropped Raspberry Pi. iOS renders this as its own native picker wheel, not an inline dropdown — confirm it's reachable one-handed and that picking `mb` reads back correctly in the row once dismissed.

**Already known:** 2026-11-07: The picker and read-back half, in the iOS Simulator moved to `FIND-testing-027`; one-handed reach stays here.

**Answer:** validation

#### L48 · Align to origin: real-device feel of the small grid and the native select

`ui-050` #2 · iPhone · filed 2026-09-27

**Check:** On a real iPhone or Android phone, tap through all nine grid buttons (`⊢ min`/`◇ ctr`/`⊣ max` × X/Y/Z) in quick succession on a Cube. Each label is small (0.72rem) inside a 44px target — confirm the text itself is legible without squinting, not just that the tap target measures 44px in a bounding box.

**Answer:** validation

#### L49 · smaller cone-tipped move arrows

`ui-048` #3 · iPhone · filed 2026-09-27

**Check:** On a real iPhone, grab the small red cone with a fingertip and drag. It should feel as grabbable as before: the 34 px invisible catchment is unchanged, only the drawn head shrank.

**Answer:** validation

#### L50 · a pre-existing dimension mismatch found while porting colour, and real-device colour legibility

`core-033` #2 · either · filed 2026-09-26

**Check:** On a real phone and tablet (not headless), drop a `raspberrypi.bplus` (any model) and a `raspberrypi.cameraModule`, and confirm the newly-visible per-part colours (lightgray jacks, orange ethernet, gray GPIO, gold camera lensribbon, etc.) read as sensible board components rather than as visual noise, at both the translucent-board and opaque-part boundaries

**Already known:** testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Mac half: both panel agents say the lightgray jacks, dark header and small colour parts read as sensible components, not noise, at the …

**Answer:** validation

#### L51 · Nav chrome folds to a ✥ toggle while a phone sheet is open

`ui-046` #1 · iPhone · filed 2026-09-24

**Check:** On a real iPhone (Safari): select a body so the Inspector opens, then without instructions find a way to orbit with the on-screen buttons. Does the ✥ toggle read as the way in?

**Already known:** 2026-11-07: The cold-read half (a fresh agent with no project context, on screenshots or emulation) moved to `FIND-testing-029`; the real-device half stays here. 2026-11-14 (`testing-029` panel): Cold-read half (emulated 390x844, no instructions): A and B both found orbit via the folded ✥ button in 2 taps, but both say the glyph reads as move/pan, not camera: Issue, filed `FIND-ui-128`. The real-iPhone half stays …

**Answer:** validation

#### L52 · Nav chrome folds to a ✥ toggle while a phone sheet is open

`ui-046` #2 · iPhone · filed 2026-09-24

**Check:** Same phone: with the Inspector open, tap a body sitting just above the ✥ toggle. Does it select without nudging the camera?

**Answer:** validation

#### L53 · row actions on the fold cache, and what only real hardware can settle

`core-031` #1 · iPhone, then iPad · filed 2026-09-24

**Check:** On a real iPhone and iPad: place two bodies, tap empty grid to deselect, then tap each body. Does each tap select that body? Headless WebKit with trusted touch says **no** after an empty-space tap; Chromium says yes. This decides whether `TODO/ui-045` is a real-device bug or an emulation artifact.

**Already known:** **Narrowed by `ui-045`'s own diagnosis (2026-09-24):** extensive controlled reproduction (instrumented `onPointerUp`/`pickAt`, capture-phase `event.target` logging) never found a case where a trusted tap that genuinely reached the canvas raycast differently than a synthetic one — every failure traced to a stray tap landing on `NavigationChrome`/the gizmo/the Inspector sheet instead of the canvas (`TODO/ui-046`), …

**Answer:** validation

#### L54 · row actions on the fold cache, and what only real hardware can settle

`core-031` #3 · iPhone · filed 2026-09-24

**Check:** On a phone, on a document of 20+ bodies (Open `bench/`'s 24-body scene or build one): tap a History row, then Edit or Suppress it. Does the row action now feel instant, with no stall between the tap and the viewport updating?

**Already known:** 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): 24-body scene, phone 390x844 touch, History panel row 24 then Suppress, tap to result, CPU throttle 1x/4x/6x, worst frame gap: row preview 26/26/37-42 ms (strip after 25/89/107-123 ms), Suppress 30/35/52 ms …

**Answer:** validation

#### L55 · Undo/Redo by restore, felt on real hardware

`core-030` #1 · iPhone, then iPad · filed 2026-09-24

**Check:** On a real iPhone and iPad: drop about 12 Raspberry Pis and 12 Bolts, then tap **Undo** ten times as fast as you can, then **Redo** ten times. Every tap lands with no visible stall, and the scene ends exactly where it started. Before `core-030` each tap froze the screen for about half a second on this scene.

**Already known:** 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): 24 bodies (12 Pis, 12 Bolts), 12 Inspector edits, then ten fast touch taps on Undo and ten on Redo, two runs at 4x and 6x and one at 1x. Worst frame gap 23/28/28 ms at 1x/4x/4x and 34-51 ms at 6x (one frame over 50 …

**Answer:** validation

#### L56 · Undo/Redo by restore, felt on real hardware

`core-030` #2 · either · filed 2026-09-24

**Check:** Same device, the same heavy scene: make about 60 small edits (move, param edit, place), then Undo all the way back. The first 50 Undos should feel instant. The ones past 50 re-fold and may pause briefly, which is expected. Nothing should reload the tab or run out of memory.

**Already known:** 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): same scene, 60 Inspector edits then Undo to the end (60 taps), 4x and 6x, one run each: worst frame gap per tap median 25-30 ms, max 28-34 ms for taps 1-50 and the same for taps 51-60 (no re-fold pause measured), …

**Answer:** validation

#### L57 · the evaluation worker on a real phone and tablet, and the ~80 ms drop floor

`core-029` #1 · iPhone · filed 2026-09-24

**Check:** On a real iPhone (Safari), drop a Raspberry Pi and then a Bolt. Tap empty space and open the Inspector's **Objects (2)** tab (the Objects list, since `ui-049`): both rows show a size, and the scene responds while they land (no visible hitch on the second drop). If a remote Web Inspector is attached, confirm an `evaluation.worker-*.js` worker exists and the console is clean.

**Already known:** 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): phone touch drag-drops, empty document: the first drop (Raspberry Pi) has a worst frame gap of 166/193-199/247-251 ms at 1x/4x/6x (2-3 long tasks of 130-350 ms); the second drop (Bolt) 34/27-32/37-38 ms, no long …

**Answer:** validation

#### L58 · the evaluation worker on a real phone and tablet, and the ~80 ms drop floor

`core-029` #2 · iPad · filed 2026-09-24

**Check:** On a real iPad, with ~10 Raspberry Pi boards placed (drag them in), drag one more Cube in and then press Undo. The drag-place should feel instant; Undo will still pause briefly (that is `core-030`, expected). Note roughly how long Undo hangs.

**Already known:** 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): ten Pis placed, then a Cube drag-placed: worst frame gap 66/77-78/85 ms at 1x/4x/6x (one long task of 65-86 ms: the drop floor core-029 recorded at about 75 ms is unchanged); then Undo: 21/23-24/31 ms, tap to …

**Answer:** validation

#### L59 · Objects list part rows: chevron feel, and a wrong-order empty result

`ui-042` (Objects list part rows: chevron) #1 · iPhone · filed 2026-09-22

**Check:** On a real phone, with nothing selected, open the Inspector's **Objects (n)** tab, expand a composite with many parts (a Raspberry Pi), scroll the part list, and tap a hidden part's row and its check: does the indent read clearly as "inside this body" at a glance, does the chevron's rotate-on-open animation feel responsive, and does scrolling the parts ever fight scrolling the Inspector sheet or the page? *(Reworded by `ui-049`: the list moved from the Objects panel into the Inspector sheet.)*

**Answer:** validation

#### L60 · Objects list part rows: chevron feel, and a wrong-order empty result

`ui-042` (Objects list part rows: chevron) #1 · iPhone · filed 2026-09-22

**Check:** On a real iPhone, with nothing selected, tap the Inspector's **Objects (n)** tab, tick one row's check, then a second row's check, then **Subtract**: are the 44px rows and checks comfortable, does the sheet scroll without fighting the page, and does a row tap ever land on the check by mistake (or the reverse)? *(Reworded by `ui-049`: the Objects panel and its header button are gone; the list is the Inspector's.)*

**Answer:** validation

#### L61 · export moved into a worker, and the slow-export pending state

`perf-001` #1 · iPhone, then iPad · filed 2026-09-21

**Check:** **On a real iPhone and a real iPad, does a big export still feel alive?** CPU throttling at 4-6x is a stand-in for a phone, not a measurement of one — a real device also differs in memory pressure, thermal throttling and how Safari schedules a module worker. Build a heavy scene (a dozen library boards and bolts), press **Export**, and judge two things by hand: does the viewport really keep responding to a drag *while* `Writing warpcad-scene.stl…` is showing, and does the file still arrive? Then the borderline case the numbers cannot settle: on a fast laptop at 1x a 24-body export lands right at the 100 ms threshold, so the line is absent or a ~10 ms flash. On a phone the same export is several times slower, so it should show properly — **but if it flickers on and off, or appears for so short a time that it reads as a glitch rather than as progress, the threshold is wrong for real hardware** and is worth raising. File it if so.

**Answer:** validation

#### L62 · export moved into a worker, and the slow-export pending state

`perf-001` #2 · iPhone · filed 2026-09-21

**Check:** **Does the worker actually survive a real mobile Safari backgrounding?** Start a big export on an iPhone and immediately switch apps or lock the screen, then come back. iOS suspends timers and can terminate workers aggressively; the code falls back to the main thread only when a worker cannot be *constructed*, not when a live one is killed mid-job — in that case `runExport` rejects and the popover shows `Export failed: …` rather than quietly retrying. Is that what happens, and is the message survivable (popover still open, Export still pressable)? If iOS kills workers routinely on backgrounding, a retry-on-the-main-thread path becomes worth having and should be filed.

**Already known:** 2026-11-07: A backgrounding run in the iOS Simulator moved to `FIND-testing-027`; real-device worker termination stays here.

**Answer:** validation

#### L63 · File ▾ → Export…

`ui-034` #1 · iPhone · filed 2026-09-21

**Check:** **Real iPhone Safari: does the download actually land and can you find it?** Export a body as STL from the phone. The chip is a dot on a phone, so the browser's own download sheet (and the Files app's Downloads) is the only confirmation the user sees. Does `union-1.stl` appear, is the `Preparing…` button state on glTF perceptible or a flash, and does pressing Export feel like it did something before the sheet appears? Also: do the popover's 44 px scope/format segments feel like a comfortable thumb target, and does the dimmed **Export…** row's printed reason read as an explanation rather than clutter?

**Already known:** 2026-11-07: The download-lands half, in the iOS Simulator moved to `FIND-testing-027`; the thumb-target and clutter judgments stay here.

**Answer:** validation

#### L64 · File ▾ menu: Save / Open… / hosted storage

`ui-033` #3 · iPhone · filed 2026-09-21

**Check:** **The File-button status dot at real phone size.** It is a 14px badge on the button's corner (solid green disc in sync, hollow ring pending, spinning ring pushing, amber `!` paused, red `✕` failed), shape-coded so it does not rely on hue. Judgment call: can you tell those five apart at arm's length, in sunlight and in dark mode, and does the spinning ring read as "working" rather than "stuck"? (Reduced-motion users get a dashed ring instead of a spin — check that setting reads too.)

**Already known:** testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Mac half OK, real phone/sunlight half stays Open. Connected through the real dialog to a mocked api.github.com (the e2e fake), then the five states set on the …

**Answer:** validation

#### L65 · Sub-part-addressed boolean operands

`ui-040` #1 · iPhone · filed 2026-09-20

**Check:** At 390px the operand line (*"Cube 1 then Bolt 1 › tap"*) is **hidden**, because the column above the navigation chrome is already full — measured, 151px against ~147px spent — and the same text is on the buttons' long-press instead. On a real iPhone: is a long-press actually how someone would discover which depth is armed, or does a sub-part boolean feel like it commits blind at that width? If it feels blind, the answer is probably a different home for the line (the Inspector's 2-selected state), not a smaller font.

**Answer:** validation

#### L66 · Sub-part-addressed boolean operands

`ui-040` #2 · iPhone · filed 2026-09-20

**Check:** A rejected sub-part commit shows its kernel error on the toolbar, and at phone width that message sits in the same band as the navigation chrome's buttons, so the toolbar is lifted above the chrome **only while an error is showing**. On a real device: does that read as an error, or as the toolbar glitching over the nav pad? Reachable by drilling into a part, Shift-clicking a second body, then rolling the History back so the part no longer exists, then clicking Subtract.

**Answer:** validation

#### L67 · Local persistence: IndexedDB autosave, restore and the save-status chip

`io-001` #1 · iPhone · filed 2026-09-19

**Check:** **Real iPhone Safari, the tab-kill path.** Place a shape, then within about a second swipe to the home screen (or lock the phone) and later reopen the tab/app. Is the last shape still there? The save-on-hide path (`visibilitychange`/`pagehide` → a synchronous `localStorage` copy, then IndexedDB) was found necessary in real Chromium and passes in headless WebKit, but iOS suspends and kills tabs on its own schedule that no headless run reproduces.

**Already known:** 2026-11-07: A Safari-terminate run in the iOS Simulator moved to `FIND-testing-027`; iOS killing tabs on its own schedule on hardware stays here.

**Answer:** validation

#### L68 · Undo/redo command stack scoped by transaction origin

`data-003` #1 · iPhone, then iPad · filed 2026-09-19

**Check:** **On a real iPhone and a real iPad**: the header is now ~53px tall at phone width (was ~30px) because Undo/Redo are 44px tap targets, and the mouse-oriented hint text is hidden below 641px. Does the taller bar feel right, and are the two buttons comfortably thumb-reachable one-handed? The 390px budget was checked arithmetically and in a screenshot, never on glass.

**Answer:** validation

#### L69 · Angled Bisect controls

`ui-036` #1 · iPhone · filed 2026-09-18

**Check:** On a real iPhone, open Bisect with a body selected and read the popover over the auto-opened Inspector sheet: is the faint Inspector text ("INSPECTOR", part name) showing through behind the fields distracting enough to want a more opaque popover background at phone width?

**Already known:** testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Mac half OK (emulation, not an iPhone), real iPhone Safari backdrop stays Open. Bisect popover over the auto-opened Inspector sheet at 390x844, DPR 2 (`h3d.mjs`): in the popover's empty bands the pixels are flat, …

**Answer:** validation

#### L70 · an occluded sub-part still cannot be picked, and one feel question about the new operand line

`ui-035` #2 · either · filed 2026-09-18

**Check:** Feel check on the new operand line ("Aligning **Raspberry Pi 1 › ethernet** to **Cube 1**"), on real phone and tablet hardware rather than an emulated viewport. It measured fully inside the popover at 390px with no page scroll, but two things are judgment: whether it reads as *confirmation to check* or as decoration one skims past on the way to the commit button, and whether a genuinely long composite part name (the catalogue ships names like `powerswitch-button` and `clearance-statusled`) wrapping to three lines pushes the Cancel/commit pair uncomfortably far down a 390px-tall popover.

**Answer:** validation

#### L71 · a placed composite is now meshed part-by-part; look at the two interpenetrating recipes on real hardware

`core-024` #1 · either · filed 2026-09-18

**Check:** Place an **Anchor** (Kit Parts) on a real phone/tablet, zoom in hard, and orbit slowly around the join between its `post` and its `hole` — looking for a flickering or shimmering seam where the two share a face, which is what a z-fight looks like in motion and what a still screenshot cannot show

**Already known:** testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Mac half: Anchor orbited in 24 steps at three views, still-frame diff 0 px, worst temporal-spike region 3-30 px, no compact blob at the post/hole …

**Answer:** validation

#### L72 · a placed composite is now meshed part-by-part; look at the two interpenetrating recipes on real hardware

`core-024` #2 · either · filed 2026-09-18

**Check:** Same, for a **Bolt**, at the base of the head where `head` and `tap` share the `z = 0` plane — the one coincident surface in that recipe, normally face-down on the grid and so usually hidden

**Already known:** testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Mac half: Bolt, same orbit, worst region 3-30 px, still-frame diff 0 px, no seam at the head/tap plane. Device half stays open. Shots …

**Answer:** validation

#### L73 · the Inspector's collapsed tab overlaps the bottom of the open Library sheet at phone width

`ui-031` #1 · iPhone · filed 2026-09-18

**Check:** On a real iPhone: open the Library sheet with something selected, scroll to the bottom of the Raspberry Pi section, and judge whether the Inspector tab sitting over the last ~2 rows reads as broken or as ordinary sheet stacking. If broken, file it as its own `ui-*` task (inset the sheet's bottom padding by the tab's height, or collapse one sheet when the other opens).

**Answer:** validation

#### L74 · the Inspector's collapsed tab overlaps the bottom of the open Library sheet at phone width

`ui-031` #2 · iPhone · filed 2026-09-18

**Check:** Same viewport: confirm the two Model dropdowns are comfortable to operate with a thumb. They are 32 px tall rather than the rows' 44 px — a deliberate call so twelve extra controls don't cost twelve rows of height in a 46vh sheet, but 32 px is below the usual 44 px tap-target guidance and only a real thumb can settle whether that was the right trade.

**Answer:** validation

#### L75 · hardware parts are much smaller than the primitives they share a grid with

`ui-030` #2 · either · filed 2026-09-17

**Check:** On a real phone and a real tablet: the Library sheet now holds eleven rows and Hardware is below the fold, so reaching Bolt is a genuine scroll inside a 46vh sheet. Does that scroll feel right with a thumb, or does the sheet want to be taller / the sections collapsible?

**Answer:** validation

#### L76 · sketch mode on real touch hardware, and the lines' lifetime

`ui-020` #1 · either · filed 2026-09-12

**Check:** On a real phone and iPad, draw several lines in a row with a fingertip. Is the 14px pick tolerance (`SKETCH_PICK_TOLERANCE_PX`) enough to reliably *select* a thin line by tapping it, and are the 11px endpoint handles grabbable without zooming in first? A fingertip contact patch is far larger than either number, and both were tuned against a mouse.

**Already known:** 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): Production build of the working tree as it stood (Vite build, preview server), Chromium touch emulation (hasTouch, isMobile, DPR 2) at the row viewport unless noted; fingertip taps scattered Gaussian sigma 3.5 mm = …

**Answer:** validation

#### L77 · sketch mode on real touch hardware, and the lines' lifetime

`ui-020` #2 · iPhone · filed 2026-09-12

**Check:** On the same hardware, judge whether the drawn stroke reads clearly against the grid in **both** colour schemes — the line is `--sketch-stroke` (a bright cyan) and the grid's major lines are close in weight. A stroke that disappears into the grid on a sunlit phone screen is the same class of defect as the second attempt's too-dark scene, and the only device that can answer it is a real one outdoors.

**Already known:** testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Mac half OK; the sunlit-phone half stays Open. Sketch stroke `--sketch-stroke` #38bdf8 (dark) / #0369a1 (light), 1.75 px: contrast vs ground 8.1:1 / 5.1:1 (threshold 3:1 for non-text UI); vs the strongest grid line pixel …

**Answer:** validation

#### L78 · Snap/Align operation

`ui-026` #1 · either · filed 2026-09-11

**Check:** On real phone/tablet hardware, open Snap/Align and judge whether the popover reads as "this button opened a thing" or as a jarring, disconnected overlay.

**Answer:** validation

#### L79 · look at `hardware.bolt` and `kit.anchor` on screen the moment they get Library rows

`ui-016` #1 · either · filed 2026-09-11

**Check:** When `hardware.*` / `kit.*` get Library rows (M2), place a **Bolt** and an **Anchor**, orbit right around each one, and look for a seam or flickering surface where `tap` meets `head`/`thread` and where `hole` meets `post` — at all three reference viewports, and in WebKit as well as Chromium (depth-buffer precision differs between engines, so a z-fight can be engine-specific). If either reads badly, the fix is documented at `createBodyObject` in `src/render/mesh.js`: fall back to the combined mesh for that body — trading its pick depth for a clean surface — rather than re-unioning every group and losing pick depth for the ones that never needed it.

**Already known:** testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Chrome half OK, WebKit and phone/tablet orbit not run (desktop Safari automation does not work here; stays Open). Premise changed: Bolt and Anchor are now Library rows. Laptop Chrome, a Bolt and an Anchor dropped and …

**Answer:** validation

#### L80 · does a 48 px snap radius *feel* right on real hardware?

`ui-013` #1 · either · filed 2026-09-09

**Check:** On a real phone and a real iPad, drop three or four solids near each other in a row and judge whether the snap helps or fights you — in particular whether you can still place something deliberately *just* beside another part without it jumping flush, and whether a fingertip's own imprecision makes 48 px feel too small rather than too large.

**Answer:** validation

#### L81 · does a 48 px snap radius *feel* right on real hardware?

`ui-013` #2 · iPhone · filed 2026-09-09

**Check:** Look at the magenta guides on a real screen against the dark grid, at an angle and in daylight. They were chosen (over `--accent`) on a desktop screenshot, where they read clearly; a phone at low brightness is the case that screenshot can't stand in for.

**Already known:** testing-030 stage 2, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0); phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B), screenshots only. Mac half OK; low brightness and daylight on a phone stay Open. Guides while a Cube row is dragged beside a placed Cube: `snap-guide-x` dashed 6 4 and …

**Answer:** validation

#### L82 · marquee drag feel on real touch hardware

`ui-024` #1 · either · filed 2026-09-07

**Check:** On a real phone/tablet, tap the nav chrome's **Select** button, then drag a finger from empty grid space: the box should track the finger smoothly with no visible lag, and the gesture must not also scroll the page or trigger the browser's own pull-to-refresh/back-swipe — `touch-action: none` is already set on the canvas for orbit/pan (`ui-018`'s own fix for exactly this class of bug on iPad), but the marquee is new code sharing that same element, not a guarantee it inherited by itself without a real device confirming it.

**Answer:** validation

#### L83 · gradient/shadow subtlety at the gizmo's floor size, and on real touch hardware

`ui-021` #1 · iPhone · filed 2026-09-07

**Check:** At the gizmo's floor size (58px arm / 40px ring, `ui-017`'s minimum — the size most selections actually render at on an average-sized part) the gradient's highlight band is only a few pixels wide. Screenshots taken during this task's own drive looked fine at 1440×900 desktop resolution, but that is not the same claim as legible on a real phone/tablet screen's pixel density and viewing distance — CLAUDE.md's Responsive Layout section asks for real on-device hand-testing, not just a Chromium viewport emulation, and this task's own drive was desktop-emulation only.

**Already known:** testing-030, 2026-11-14, headed Chrome 157 on Apple M4 Pro (ANGLE Metal), production build of HEAD (v1.17.0), laptop 1440x900 at DPR 1-2; phone rows are 390x844 touch emulation on the same GPU (emulation, not a phone). Panels = two fresh haiku agents (A and B) per batch. Panel disagreed: A saw no highlight band on the arrows, B saw a faint lighter stripe. Stays Open with both answers. Shots …

**Answer:** validation

#### L84 · how a rotation number wrapping past ±180° feels mid-drag

`core-004` #2 · iPhone · filed 2026-09-06

**Check:** Same drag on the phone (390×844), where the fields are in a bottom sheet and a thumb is over part of the viewport, so there is less peripheral context for what the number is doing.

**Already known:** 2026-11-07: The measured part (emulation, 4-6x CPU throttle, or simulated fingertip taps with jitter) moved to `FIND-testing-031`; the real-device feel stays here. 2026-11-15 (testing-031, measured half): phone 390x844 touch, Z ring sweeps as in row 1 behave identically (one field flip per crossing, readout unwrapped). With a cube selected the Rotation Z field is 1274 px down the sheet, outside the visible 471-725 …

**Answer:** validation

#### L85 · Gizmo move/rotate ↔ numeric-field sync

`ui-012` #2 · either · filed 2026-09-06

**Check:** **Rotate-ring drag feel under a real finger.** A ring drag maps the pointer's sweep *around the gizmo hub* to degrees, so how much rotation a given finger movement produces depends on how far out from the hub you grabbed — near the hub a small movement spins it fast. That is the correct dial behaviour and it felt fine with a synthesised pointer, but a fingertip has contact area and lands less precisely than a mouse: the driven sweeps produced about −52° at laptop width and about −105° at phone width for the same 70px gesture, purely because the fatter phone hit target moves the effective grab point. Try it on a real iPhone and iPad and say whether the phone case is too fast to control; if it is, the fix is clamping the effective grab radius in `rotateDeltaDeg`'s caller, not shrinking the touch target back down.

**Answer:** validation

#### L86 · Drag-place a primitive

`ui-010` #1 · iPhone · filed 2026-09-06

**Check:** **Sheet-to-viewport drag on real phone hardware.** At 390px the Library is a bottom sheet, so the drag starts near the bottom of the screen, crosses the sheet's own edge, and has to end up somewhere in the visible strip of grid above it — a path that only exists at phone width and that no other gesture in the app takes. Try it on an actual iPhone: is there enough uncovered viewport above the open sheet to drop into comfortably, or does the sheet want to be shorter (its `max-height` is `46vh` in `src/components/layout/LibraryPanel.vue`)? Does the translucent ghost read clearly against the grid at that size, or does a thumb cover it entirely?

**Answer:** validation

#### L87 · App shell + viewport scaffold

`render-001` #1 · either · filed 2026-09-05

**Check:** **Orbit sensitivity on a real touchscreen.** Drag speed is a fixed 0.4° of orbit per pixel, slightly faster than three.js's own OrbitControls default at this viewport height. In the driven pass a single 260px diagonal swipe rotated ~104° and parked the camera flat against the top-down pole — correct clamping, but possibly too twitchy in the hand. Try a few casual swipes on an iPhone and an iPad and say whether it wants lowering (the constant is `ORBIT_DEG_PER_PX` in `src/components/viewport/Viewport.vue`).

**Answer:** validation

#### L88 · The tall Align popover on a real phone

`ui-060` (row 1) · iPhone · filed 2026-10-15

**Check:** On a real phone, select two cubes, open Align, tap X ⇤ + side then Z ◇ ctr: no scrolling needed for the common taps, and the shapes are still visible

**Answer:** validation

#### L89 · The tall Align popover on a real tablet

`ui-060` (row 2) · iPad · filed 2026-10-15

**Check:** On a real tablet, the popover does not hide the body being moved

**Answer:** validation

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

- 2026-11-17 · U5 · Done (saved as `warcad-test-nogist-token`; agent copied it to `warpcad-test-nogist-token`). Probe answered 404, not 403 · `VERIFY.md` io-017 #1 Issue; filed `FIND-io-037`, Next up row 83
- 2026-11-17 · U4 · Done (agent verified the Keychain DSN matches `SENTRY_DSN`; `--check` output unconfirmed) · `VERIFY.md` build-035 #1 OK; `FIND-testing-028`
- 2026-11-17 · U3 · Done: Safari quit, safaridriver enabled · `FIND-testing-026`; `ROADMAP.md` Next up row 82
- 2026-11-17 · U2 · Done: `testing-028` started in the Claude desktop app with computer use · `FIND-testing-028`, `ROADMAP.md` Held
- 2026-11-17 · U1 · Use my gh login (secret gists, private `warpcad-scratch`) · `FIND-testing-045`; `ROADMAP.md` Next up row 81

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
