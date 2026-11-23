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
| [2](#2-questions--answer-from-anywhere) | Questions | 110 now (Q16-Q127; Q94-Q127 sit above the groups), in 7 groups | ~1 min each | the follow-up work each answer files |
| [3](#3-quick-checks-at-the-mac) | Quick checks at the Mac | 20 | 66 min total | closes rows |
| [4](#4-accounts-and-settings) | Accounts and settings | 7 | 48 min total | closes rows |
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
| [`testing-033`](FIND-testing-033-owner-decisions-from-verify.md), part 1 | Done 2026-11-17: 76 decisions drafted as Q18-Q93 in §2 (three more were settled by evidence). Only your answers are left for you | 76 decisions |
| [`testing-045`](FIND-testing-045-drive-github-gist-and-repo-checks.md) | Gist and hosted-repo checks against real GitHub, with your `gh` login (U1 answered) | 9 |
| [`testing-028`](FIND-testing-028-verify-native-dialog-checks-with-computer-use.md) | Native dialogs, the Mac app and the iOS Simulator's own UI, driven with computer use. **Running** in the Claude desktop app (U2 done) | 5 + 19 |
| [`testing-026`](FIND-testing-026-verify-desktop-safari-checks-with-safaridriver.md) | Desktop Safari through safaridriver. U3 done; in the runner's queue | 6 |
| Bookkeeping, decided 2026-11-17 | Commit the three filed native rows (`build-040`, `io-034`, `ai-043`) and the `testing-037` status edit in `warpcad-native`, leaving the files of unknown origin alone (`TODO/ROADMAP.md`, M19 notes) | — |

---

## 1. Unblockers — a minute each, then the runner takes over

All five answered 2026-11-17 (see **Answered**). New ones go here.

---

## 2. Questions — answer from anywhere

The 76 decisions from `testing-033` were drafted 2026-11-17 and sit below Q17 in 7 groups (`### Q-group:`), each with the recommendation first. Each group offers **Accept all recommendations**.

All fifteen written questions were answered 2026-11-17 (see **Answered**).

#### Q127 · Keep the tablet view cube's Home and Views row under the cube, rather than tucked into the box's corners (ui-161)?

**Question:** `ui-161` shrank the touch-tablet cube to a 64 px side in a 111 px box, so the whole block (cube, Home, Views, caption) is about 111 x 159 px portrait and 111 x 175 px landscape. I assumed the Home and Views buttons stay in a row under the box at the 44 px tap height, because corner placement could overlap a face at some orientation and I did not build it. Keep that?

**Background:** The box is √3 x the side so the cube's silhouette fits at any angle; its empty corners are small beside two 44 px buttons. Moving the row into the corners would save roughly 50 px of height and risk a face under a button. Measured at 1180x820 the block does not meet the Operations toolbar.

**Options:**
- **Keep the row under the box (Recommended):** nothing changes.
- **File a task to try the corners:** an S task, with a face-overlap check at every orientation.
- **Explain more**
- **Defer**

#### Q126 · Keep 20 % as the tablet's allowed wrong-face share for a scattered fingertip tap (ui-161)?

**Question:** `ui-161` relaxed the tablet scattered-tap bound in `e2e/orientation-tap.e2e.js` from 3 % to the phone's 20 %, because Views is the exact path. Measured on the 64 px cube: 11.3 % on chromium-tablet and 9.3 % on webkit-tablet. Keep the 20 % bound, or set a tighter one such as 15 %?

**Background:** The phone's 55 px cube misfires about 12 % and is accepted. A tighter bound leaves less noise margin on a loaded run and flags a regression sooner.

**Options:**
- **Keep 20 % (Recommended):** matches the phone and the finding's proposal.
- **Tighten to 15 %:** closer to the measurement, less headroom.
- **Explain more**
- **Defer**

#### Q125 · Accept `resize-fit.gif` and `timeline-relink.gif` as good enough, after three cold-read passes (docs-039, -040, -041)?

**Question:** `docs-041`'s cold read, shown frames once a second, rated `resize-fit.gif` CLEAR and `timeline-relink.gif` PARTIAL. What is left in the relink movie is mostly presses that fall between one-second samples (the chamfer Apply, the Enter on the typed 60, the Roll forward press), the dimmed grey row after Re-link, a four-frame hold on *Select step 3*, and a static closing hold. Per the stop rule I filed no `docs-042`. Accept both movies as they are?

**Background:** Every press now has its caption and a hovered pointer, and the History panel is enlarged for the reason text; the movie is at its 24 s budget (21.5 s light), so more captions would need other beats cut.

**Options:**
- **Accept both as they are (Recommended):** nothing changes.
- **File `docs-042` for the relink remainders:** a caption on the Re-link outcome and visible Enter and Apply presses, at the cost of cutting other beats. An S task.
- **Explain more**
- **Defer**

#### Q124 · Keep the green save dot and the green "fits" chip as they are beside a broken step, and keep a broken step chipped `broken` only (not also `inactive`)?

**Question:** `ui-160`'s cold read, shown only the phone screenshots, still rated two items partial: the green dot (the save status, top right) and the green **fits** chip (build volume) sit near the broken warning and read as "all fine", and the strip's "2 later steps inactive" sits beside a step 3 that is chipped `broken` but not `inactive`. I changed neither: the dot says *Saved* and the chip says the part fits, both true, and the row drops its grey `inactive` chip on purpose (`ui-146`: one treatment for one problem). Keep both?

**Background:** The dot has a distinct shape per state for colour-blind users and is the app's one status surface; recolouring it while a step is broken would make it lie about whether the file is saved. The alternative for the row is showing `inactive` beside `broken`, which brings back the two-chip look `ui-146` removed.

**Options:**
- **Keep both as they are (Recommended):** nothing changes.
- **Show `inactive` beside `broken` on a rolled-back broken row:** a TimelineRow change and e2e update. An S task.
- **Explain more**
- **Defer**

**If deferred:** nothing changes.

**Answer:** question

#### Q123 · Keep the view cube's testids as `view-cube` and `gizmo-views`, with `orientation-dial` and `data-touch-picker` gone?

**Question:** `ui-158` renamed the gizmo's handles: the cube container is `view-cube`, the new Views button is `gizmo-views`, `orientation-dial` and the `data-touch-picker` attribute are removed, and the picker ids (`gizmo-picker*`) are unchanged. Keep it?

**Background:** Specs and docs media were moved to the new ids in the same commit. Keeping the old `orientation-dial` id on the cube would have been a lie about what it is.

**Options:**
- **Keep the new ids (Recommended):** nothing changes.
- **Restore `orientation-dial` on the cube:** a rename across the specs and docs media. An S task.
- **Explain more**
- **Defer**

**If deferred:** nothing changes.

**Answer:** question

#### Q122 · Keep the cube bare, with no card behind it and a glass background on the caption alone?

**Question:** `ui-158` draws the cube bare in the corner, as WarpCad1 did, and gives the `az · el` caption its own glass background so it stays readable over the grid. Keep it?

**Background:** The triad sat in a glass card. The owner's description of the cube was "bare in the viewport's top-right corner with no card around it", so I followed it.

**Options:**
- **Keep it bare (Recommended):** nothing changes.
- **Put the cube back in a glass card:** a CSS change. An S task.
- **Explain more**
- **Defer**

**If deferred:** nothing changes.

**Answer:** question

#### Q121 · Keep the view cube's colours as `--view-cube-*` tokens in the theme files, over six `--pebble-*` greys in `base.css`?

**Question:** The task said the face shades go in `src/styles/tokens.css`, which does not exist. `ui-158` put six `--pebble-*` greys in `src/styles/base.css` and the `--view-cube-top/front/right/back/left/bottom/edge` tokens in `themes/dark.css` and `light.css`, pinned by `tokens.spec.js`. Keep it?

**Background:** That is where this repo's other colour tokens live, so no new file was invented.

**Options:**
- **Keep it (Recommended):** nothing changes.
- **Create `src/styles/tokens.css` and move them:** a file move plus the spec. An S task.
- **Explain more**
- **Defer**

**If deferred:** nothing changes.

**Answer:** question

#### Q120 · Keep the phone cube taking taps on its faces directly, at about 12 % landing on a neighbour, with Views as the precise path?

**Question:** On a phone the cube is 55 px a side beside the Operations toolbar. The rewritten `e2e/orientation-tap.e2e.js` measured the scattered-tap wrong-face rate at 12.0 % on chromium-phone and 12.7 % on webkit-phone, so its phone bound is 20 %, not the task's 3 %, which is geometrically out of reach at that size. Keep it?

**Background:** `ui-148` instead opened the Views grid on a touch tap of the phone cube, which never misfires but costs a second tap. Tablet (96 px side) is predicted at 0.9 % and measured separately.

**Options:**
- **Keep direct taps (Recommended):** nothing changes.
- **Touch tap on the phone cube opens Views:** ui-148's behaviour; an S task.
- **Explain more**
- **Defer**

**If deferred:** nothing changes.

**Answer:** question

#### Q119 · Keep the view cube at 55 px a side in a 96 px box on a phone and laptop, and 96 px a side in a 168 px box on a coarse pointer 600 px and wider?

**Question:** These are the sizes `ui-158` settled on. The gizmo block stays inside the 184 px (full) and 150 px (compact) reserves the Operations toolbar leaves it. Keep them?

**Background:** 96 px is WarpCad1's cube. The touch size gives a corner-on face a short diagonal above 44 px.

**Options:**
- **Keep the sizes (Recommended):** nothing changes.
- **Make the phone cube bigger:** it would crowd the Operations toolbar at 390 px; an M task.
- **Explain more**
- **Defer**

**If deferred:** nothing changes.

**Answer:** question

#### Q118 · Keep each cube face a flat 2D `matrix()` button, with an edge-on or turned-away face hidden, instead of a `preserve-3d` solid?

**Question:** `ui-158` places the six faces with `matrix()` from `src/render/viewCube.js` rather than a `preserve-3d` context, and a face with depth at or below 1e-9 gets `visibility: hidden`, `pointer-events: none`, `aria-hidden` and `tabindex=-1`. Keep it?

**Background:** Engines disagree on hit-testing back-facing `preserve-3d` children; the flat form is the same on Chromium, Firefox and WebKit. The look is the same (orthographic, flat shades).

**Options:**
- **Keep the flat faces (Recommended):** nothing changes.
- **Rebuild as `preserve-3d`:** engine-specific hit-test work; an M task.
- **Explain more**
- **Defer**

**If deferred:** nothing changes.

**Answer:** question

#### Q117 · Keep the clearance tag as a fixed line in the upper view, not anchored to the red body?

**Question:** `ui-153` labels a shown clearance (the translucent red body around a bolt's tap hole) with a small tag over the 3D view reading *Red ghost: room kept clear around Bolt / screw 1, not a part*. Keep it as a fixed line near the top of the view, or anchor it to the red body so it follows the body as the camera moves?

**Background:** I assumed the fixed line: it needs no projection maths in the render path and survives a body that is off screen. A cold read said it floats with no tie to the red object (`ui-159`). Anchoring means projecting the hidden parts' centre each frame into the DOM overlay, the same way the dimension lines do, and hiding the tag when the body is out of view. `ui-159` (2026-11-23) took the recommended default again: the wording is now *Red area: space kept free around Bolt / screw 1, not a real part* and the tag is still a fixed line. A fresh cold read rated it PARTIAL: the words are plain but nothing ties the tag to the red shape, and "space kept free" is still a little loose.

**Options:**
- **Keep the fixed line for now (Recommended):** the smaller, reversible change; the wording is done (`ui-159`).
- **Anchor it to the body:** an M task with a render-path check.

**If deferred:** nothing changes.

**Answer:** question

#### Q116 · Keep the three io-040 assumptions: ASCII STL only, the document's name before the file name, notes published as literal Markdown?

**Question:** `io-040` lets an agent stage a gist's name and extra files. Keep how I resolved the open points?

**Background:** The Gist API takes file content as a JSON string, so a 3MF, a binary STL or a PNG cannot be published (`docs/decisions/gist-storage.md`). I assumed: (1) a staged STL is **ASCII STL** (about 5× the binary size) and there is no 3MF or picture kind; (2) the Name the Share sheet starts from is the typed name, then the gist's own title on Update, then the agent's `set_project_name`, then the saved file name, and it never renames a file; (3) a staged note is published as Markdown with HTML made literal and every `@` broken, so it cannot ping anyone.

**Options:**
- **Keep them (Recommended):** the smaller, reversible reading, and the same escaping the README uses.
- **File a follow-up for a picture or 3MF:** needs a git push path or a base64 sidecar; an M-size task.

**If deferred:** nothing changes.

**Answer:** question

#### Q115 · Is it acceptable that an older WarpCad build refuses a variable that has a description?

**Question:** `ui-157` added an optional `description` to `var.define` and `var.derive` records. A build from before it checks each variable record's keys against a fixed list, so it flags a record carrying `description` as malformed and does not define that variable (anything bound to it then shows as broken). Files only carry `description` once someone writes one with the new build, and the installed app updates itself, but a file shared with someone on an old cached build would open with those variables missing. Keep the addition as it is, or bump the project-file version (`data-011`) so an old build refuses the whole file by name instead?

**Background:** Assumed keep as is. A version bump would make every new build's files unreadable by older builds even when no variable has a description, which costs more than the narrow case it protects. The behaviour is recorded in `docs/decisions/project-variables.md`.

**Options:**
1. **Keep as is (Recommended)**: description is opt-in; an old build shows the affected variables as missing.
2. **Bump the project-file version**: an old build refuses the file clearly, for every file.
3. **Explain more**
4. **Defer**

**If deferred:** it stays as is.

**Answer:** question

#### Q114 · Is the amber "is empty" note plus the existing refusal enough for an emptied Subtract in Export?

**Question:** `io-039` could not reproduce a silent Export on a Subtract the cutter swallowed whole (a 32k scan or a box, imported as mm, nine projects): the red refusal *Cannot export "Subtract 1": it has no triangles* already shows and nothing downloads. So it added an amber line when the panel opens, *"Subtract 1" is empty — nothing is left of it, so it cannot be exported*, and left Export enabled so pressing it gives the red line. Keep that?

**Background:** Assumed yes. The finding's expected result was either a note or a refusal, and both now exist. If you still see a silent press, send the exact steps and file: the path this drive did not hit is then the real bug. Q91 asks the related question of a toast at Subtract time.

**Options:**
1. **Keep note plus refusal (Recommended)**: it says so before and after the press.
2. **Also dim Export when a body is empty**: stricter, but then the reason has to be the dimmed button's.
3. **Explain more**
4. **Defer**

**If deferred:** both lines stay.

**Answer:** question

#### Q113 · Should both Re-link buttons (History row and Inspector box) be the solid blue primary button?

**Question:** `ui-154` made the Inspector's amber "1 step is broken" box use the same solid blue **Re-link…** button as the History row's **Re-link**, because a fresh reader had rated the solid-against-outlined difference as two names for one repair. Every other Inspector banner button is the plain outlined style, so the broken-step box is now the one place in the Inspector with a solid blue button.

**Background:** Assumed yes. The finding asked for one variant in both places and named primary; the repair is the one action the amber box exists to offer. It is a one-word change (`variant="primary"` in `DependentsBanner.vue`) to undo.

**Options:**
1. **Keep both primary (Recommended)**: one repair, one look.
2. **Make both outlined**: quieter, but the row's button was made primary on purpose so a phone user finds it.
3. **Explain more**
4. **Defer**

**If deferred:** both stay primary.

**Answer:** question

#### Q112 · May the navigation chrome's mode buttons be 44 px tall with 12 px gaps, and the phone's Operations toolbar one column wider?

**Question:** `ui-149` makes Orbit, Pan, Select and the gear a real 44 px tall with 12 px between them, so a fingertip scattered around one fires a different control on 0.5 to 1.5 % of taps (it was 1.5 to 7 %; the aim is 2 %). The chrome is 14 px taller and about 20 px wider at 390 px (178 by 211, was 164 by 189 to 196). To keep the Operations toolbar clear of it (`ui-043`), the toolbar at phone width now reserves 150 px for the 106 px gizmo instead of 184 px, so it is 216 px wide with five buttons to a row and three rows instead of four. The `ui-084` pad limits moved from 166 by 196 to 179 by 212. Keep that?

**Background:** Assumed yes. The finding authorised moving the `ui-084` limits and asked for the height to be found elsewhere; the toolbar's extra width still ends about 50 px short of the gizmo. A 6 px gap left the middle buttons at 3.75 to 4.75 % wrong, so 12 px was needed.

**Options:**
1. **Keep the 44 px row and the wider toolbar (Recommended)**: meets the 2 % aim with every budget green.
2. **Go back to 30 px buttons with the invisible hit area**: shorter cluster, 4 to 8 % wrong taps.
3. **Explain more**
4. **Defer**

**If deferred:** the 44 px row stands.

**Answer:** question

#### Q111 · On a phone, should a tap on the orientation triad open a big view picker?

**Question:** `ui-148` fixes the phone's orientation caps, which were 23 px apart so a fingertip fired a neighbouring cap on 31 % of scattered taps. Of the three designs the finding offered (a collapsed dial that opens to a large picker, a two-row layout in the dial's footprint, or moving the toolbar so a 190 px dial fits) it took the first: on a phone a touch tap on the 96 px triad opens a 3 by 2 picker of six 68 by 64 px buttons (Top, Front, Right, Bottom, Back, Left) plus Home and Close. A mouse or keyboard click on the triad's own caps still snaps directly. Wrong-cap taps fell from 31 % to under 3 %. The cost is one extra tap to change view by touch on a phone.

**Background:** Assumed yes. A two-row layout in the 112 px footprint cannot get cells wider than 32 px, which is still about 20 % wrong; the 190 px dial only fits by shrinking the Operations toolbar and breaking the toolbar and chrome budget (`ui-043`) and the over-20 px gap (`ui-045`). The picker leaves the tablet's 190 px dial, the toolbar and the chrome untouched.

**Options:**
1. **Keep the picker (Recommended)**: six big targets, no layout change elsewhere on the phone.
2. **Go back to the compact caps and accept about 31 % wrong taps**: one tap fewer, many mis-taps.
3. **Explain more**
4. **Defer**

**If deferred:** the picker stands.

**Answer:** question

#### Q110 · May a dimension label step off its line so a gizmo ring does not cross its digits?

**Question:** `ui-147` keeps each dimension number ("50 mm", "40 mm") clear of the gizmo's rotate rings and arrows. When a ring would run through the digits, the number moves to the other side of its dimension line, slides along it, or (if nothing along the line is clear) sits up to about 84 px from the line, while the line and arrowheads stay put. A label already clear never moves. Keep a number that can sit a little away from its line, over a number that sits on its line with a ring through it?

**Background:** Assumed yes. The finding offered two routes, moving the label or drawing it above the gizmo layer; moving was taken because a ring drawn under a halo still reads as a cut number. A body that fills the phone screen has rings larger than the viewport, and then the label takes the least-crossed spot and may still be crossed. The number jumps between spots as you orbit, since each spot is chosen fresh per frame.

**Options:**
1. **Move the number off the ring (Recommended)**: the digits stay readable.
2. **Keep the number on its line**: a ring may cross it.
3. **Explain more**
4. **Defer**

**If deferred:** the number moves off the ring.

**Answer:** question

#### Q109 · Is the dense-model cut done when its 50 ms landing target is met on a real GPU but not headless?

**Question:** `core-085` asked that a whole-model Subtract of two copies of the `5036 RGB Matrix 2.5mm` 3MF never block the main thread for more than 16 ms at the click or 50 ms when the result lands. After the fix, in Chromium with the Mac's GPU, the click reads 14 ms (worst 17) and the landing 47 ms (worst 48), with no Long Tasks at either moment. In headless Chromium, which draws with a software rasteriser, the landing still reads about 110 ms. Most of that is the rasteriser drawing the 220,000-triangle result: a bare WebGL test of the same size takes 79 to 113 ms per frame there. Count the GPU numbers as meeting the target, and file the headless draw cost as its own finding?

**Background:** Assumed yes. Before the fix the same pair read 208 ms at the click and 119 ms at landing on the GPU, and 210 and 244 ms headless. The app's own work at landing is now about 30 ms (fold, mesh build, normals). Getting the headless number under 50 ms would mean drawing fewer vertices, for example an indexed mesh with flat shading in the material. That is a rendering change with a visual risk, so it is out of this task's scope.

**Options:**
1. **Count the GPU numbers, file the headless draw separately (Recommended)**: the TODO itself calls software-rasteriser numbers pessimistic.
2. **Keep core-085 open until headless is under 50 ms too**: this needs the rendering change above.
3. **Explain more**
4. **Defer**

**If deferred:** the GPU numbers count, and the headless draw is a separate finding.

**Answer:** question

#### Q108 · Should the dense-cut e2e test cut a Cube with the dense model, and allow 80 ms at landing?

**Question:** `core-085`'s new test in `e2e/import-3mf.e2e.js` imports a generated dense 3MF (25 parts, 217,800 triangles, the RGB Matrix's shape), drops a Cube on it and subtracts the whole model from the Cube, on the laptop project of all three engines. The TODO asked for the model to be imported twice and cut from itself. With a 220,000-triangle result, though, the headless rasteriser's draw alone breaks 50 ms whatever the app does. With the Cube, the click still sends the full dense model, and the result stays small. The test asserts under 50 ms at the click and under 80 ms at landing. Keep it that way?

**Background:** Assumed yes. Measured after the fix: click 0, 8 and 13 ms, landing 65, 47 and 27 ms (Chromium, Firefox, WebKit). Before the fix the click was 95 to 137 ms (Chromium) and 133 ms (Firefox), so the click assertion fails on the old code. The landing bound allows for the rasteriser's own frame: a frame that draws the result costs about 55 ms. The two-copy case is measured by `bench/evaluation-mainthread.mjs --only whole-model-cut` (headless and `--headed`).

**Options:**
1. **Cube target, 50 ms at the click and 80 ms at landing (Recommended)**: it fails the old code at the click and does not fail on the rasteriser.
2. **Two copies, as the TODO wrote it**: the landing has to be recorded rather than asserted under 50 ms in headless runs.
3. **Explain more**
4. **Defer**

**If deferred:** the test stays as written.

**Answer:** question

#### Q107 · Should the "another device" refusal say to update again, rather than to wait a minute?

**Question:** `io-038` proposed *Another device updated this gist a moment ago. Try again in a minute.* for an **Update gist** that could not take in another device's change in one tap. WarpCad remembers that change, and the very next **Update gist** merges it, so there is no need to wait. Use *Another device updated this gist a moment ago. Update gist again to merge its changes.*?

**Background:** Assumed yes (`src/core/gistMessages.js`, kind `missed-revision`). It reads like the existing GitHub-409 sentence, *This gist changed while it was being updated. Update again to merge those changes.* The refusal shows only when a third revision lands during the recovery, or when the recovery's read or merge fails (those show their own sentences).

**Options:**
1. **Say to update again (Recommended)**: accurate, since a retry works at once.
2. **Say to wait a minute**: the finding's wording. A retry works either way.
3. **Explain more**
4. **Defer**

**If deferred:** the "update again" wording stays.

**Answer:** question

#### Q106 · When Update gist finds it replaced another device's change, should it merge and write again by itself?

**Question:** If GitHub's read is stale even with the token, an **Update gist** write can land on top of a revision another device wrote a few seconds earlier. The write's reply shows this. `io-038` merges that revision in, read by its exact revision id, and writes again in the same tap: the person sees *Merged 1 step from the gist*, then *Gist updated*, and the gist's history gains two revisions instead of one. Keep that, rather than only refusing?

**Background:** Assumed yes. Refusing alone cannot recover the change: the gist would already hold this device's write, so a later Update reads it as this device's own revision and never merges the lost one. The missed revision is also remembered for this session, so if the recovery fails (offline, History previewing, a conflict), the next Update merges it first. After a reload that memory is gone, though the revision stays in the gist's history on GitHub. Whether the safety net ever fires depends on K7: if GitHub's authenticated read is fresh, it never does.

**Options:**
1. **Merge and write again by itself (Recommended)**: no lost edit and no extra tap. The cost is one extra revision in the gist's history.
2. **Refuse only, and merge on the next tap**: one revision per tap, but the person has to tap twice.
3. **Explain more**
4. **Defer**

**If deferred:** it merges and writes again by itself.

**Answer:** question

#### Q105 · Should the offset leave grown corners sharp?

**Question:** `ai-049`'s `modify.offset` moves every face by one distance and keeps each corner sharp, where a true constant-distance offset would round every convex edge of a grown part. Keep corners sharp?

**Background:** Assumed yes: a clearance cutter for a printed part wants the same corner the part has, and `@jscad/modeling`'s `expand` (which rounds) was rejected for this reason (`docs/decisions/geometry-kernel.md`, "Offsetting a solid"). On a sphere or a cone tip the corner is approximate.

**Options:**
1. **Keep corners sharp (Recommended)**: matches the part's own corners.
2. **Round grown corners**: a true offset, but a clearance cutter no longer has the part's corners.
3. **Explain more**
4. **Defer**

**If deferred:** corners stay sharp.

**Answer:** question

#### Q104 · Should a group be offset part by part, with holes going the other way?

**Question:** `modify.offset` on a group moves every face of every part by the distance, so a hole through a part gets smaller when the offset is positive (its faces point into the hole). Keep this?

**Background:** Assumed yes: it is what "every face moves outward from the material" means, and a positive offset on a plate with a bore makes a cutter that fits a bigger plate. The other reading (grow the outline only) needs a way to tell a hole from a pocket.

**Options:**
1. **Part by part, holes the other way (Recommended)**: the geometric offset.
2. **Outline only**: holes keep their size.
3. **Explain more**
4. **Defer**

**If deferred:** parts offset one by one, holes shrink on growth.

**Answer:** question

#### Q103 · Should offset refuse two opposed faces in one plane rather than handle them?

**Question:** `modify.offset` refuses a corner where two faces in one plane face opposite ways (a part flush with another's face and running past it, like the Pi's AV jack barrel under its block). Keep refusing, or build handling for it?

**Background:** Assumed refuse: any distance would have to move that corner both ways, so there is no single right answer, and `add-clearances` falls back to `modify.enlarge`, which still works for boxes and cylinders. Handling it needs a rule for which face wins.

**Options:**
1. **Keep refusing (Recommended)**: honest, with a fallback.
2. **File a task to handle it**: needs a rule for which face wins.
3. **Explain more**
4. **Defer**

**If deferred:** it stays refused.

**Answer:** question

#### Q102 · Is a 0.53 mm lid tongue on a 2 mm enclosure wall acceptable?

**Question:** `ai-048` lets `splitWithJoint` put a tongue in a 2 mm shell wall by sizing it from the wall: a 0.53 mm rib with 0.53 mm walls either side, one printed line. It only locates the lid. Keep this, or require a thicker wall for a tongue?

**Background:** Assumed yes: the other readings (refusing under 3.8 mm) leave the default enclosure with no joint, which Q3 asked to fix. Not test-printed. A wall under 1.9 mm is still refused. The `create-enclosure` skill was not re-run with `claude -p` (the warpcad MCP server was down); the kernel was driven directly on a Pi-sized shell with ports.

**Options:**
1. **Keep it (Recommended)**: thin lip, lid locates itself.
2. **Require 3.8 mm walls**: sturdier ribs, but the 2 mm default has no joint.
3. **Explain more**
4. **Defer**

#### Q101 · Keep a Raspberry Pi in the scene after you cut a port opening with its keep-out?

**Question:** `ai-047` made a Subtract with only a Pi's `clearance-*` keep-outs leave the Pi in the scene, like its mounting holes (before, it was used up). Keep this?

**Background:** Assumed yes, because the owner asked for keep-out cuts in Q3 and one Pi then cuts every port. It changes the Operations toolbar too: `ui-040`'s case cut no longer removes the Pi. Saved projects are unaffected. The `create-enclosure` skill was not re-driven with `claude -p --model haiku` (the warpcad MCP server was down).

**Options:**
1. **Keep it (Recommended)**: the Pi stays, one Pi cuts every port.
2. **Revert**: restore the Pi being used up and keep cutter bodies.
3. **Explain more**
4. **Defer**

#### Q100 · Should the camera zoom in on a small part you just dropped?

**Question:** `ui-130` fixed the dimension labels and the ring cue but not item 1: an M4 Nut drops 18 px wide at the default camera. Keep the camera where it is, or zoom to frame a small dropped part?

**Background:** The docs promise the camera stays where it was after a drop (`docs/viewport-navigation.md`, `docs/mobile.md`), and a zoom would move every later drop's frame too. A part under about 24 px across is below WCAG 2.5.8's target size and well under the 44 px touch size, so a finger cannot easily select it.

**Options:**
- **Keep the camera (Recommended):** nothing moves unasked; the user can zoom with the pad or pinch.
- **Zoom only when the dropped part projects under 24 px:** a small, bounded reframe. An M-size task with a phone check and a docs change.
- **Always frame the dropped part:** the camera follows every drop; changes a documented promise.

**If deferred:** the camera stays where it is.

#### Q99 · Rename the History chip `via mcp` to a plain phrase?

**Question:** `ai-039` kept `via mcp`, `via ai` and `via webmcp` as they are. The cold readers called `via mcp` a developer term; rename it to *via an external tool (MCP)*?

**Background:** Done: an unrecognised origin reads *via unknown source* and a merge reads *via a merge*. Renaming `via mcp` touches about 30 quoted copies (`docs/mcp.md`, `docs/README.md`, `docs/design-intent.md`, `docs/merging.md`, five docs specs, four e2e specs) and widens a chip that already wraps at 390 px. The docs define MCP on first use.

**Options:**
- **Keep `via mcp` (Recommended):** the docs explain it, and the chip is the same word the Assistant header's *MCP agent* uses.
- **Rename it:** an S-M task: one string, 30 quoted copies and a phone-width check.

**If deferred:** nothing changes.

#### Q98 · Keep `ui-129` split, with the broken History row's layout filed as `ui-146`?

**Question:** `ui-129` had four message fixes and the broken step's layout; I did the messages and filed the layout as `ui-146`. Keep that?

**Background:** Done: the fillet radius, size-field and broken-step messages read as plain sentences at the display boundary (popovers, toolbar, Inspector, History row and strip), replica ids in the Assistant's activity rows read `Cuboid 1`, and the image notice says *billed to your own API key*. Left: one name and one amber treatment for the broken step, and the repair button on the row instead of below a 130 px panel; that is phone-width layout work with its own checks.

**Options:**
- **Keep the split (Recommended):** `ui-146` is queued and ready.
- **Fold `ui-146` back into one task:** merge the layout into a single longer run.
- **Drop the layout work:** the plain message already says what to do.

**If deferred:** the split stays and `ui-146` waits in Next up.

#### Q97 · Keep `docs-036` split, with the five movie re-records filed as `docs-038`?

**Question:** `docs-036` listed six fixes and two additions; I did the sentences and the keep-out picture and filed the movie re-records as `docs-038`. Keep that?

**Background:** Re-recording means editing five docs scripts and re-encoding 15 or more movies through a scoped folder (never `docs:gifs`, which rewrites every GIF), then looking at each result. Done now: the Align button names, the Rotation X step, the kept-Pi and Repeat sentences, the Fit result, the keep-out sentence, and `rpi-keepout.png` now labelled *Keep-out: power connector*.

**Options:**
- **Keep the split (Recommended):** `docs-038` is queued and ready.
- **Fold it back into one task:** merge the movie work into a single longer run.
- **Drop the movie work:** the sentences now say what the movies failed to show.

**If deferred:** the split stays and `docs-038` waits in Next up.

#### Q96 · Keep `ui-128` split in two?

**Question:** `ui-128` listed nine cold-read fixes; I did four (1, 2, 3, 5) and filed the other five as `ui-145`. Keep that split?

**Background:** The file said "items 1, 2, 3 and 5 first" and "split into sub-tasks if the owner prefers". Nine UI changes with their e2e specs, docs and pictures in one commit was too much to review, and two of the five left over (the connector caption, the Align glyphs) need a design choice about phone room. Shipped: Share and Export sit under the Save rows in File ▾ (reason now *Add a shape first*); the folded navigation toggle reads ✥ over the word *View*; each Size bind button carries X, Y or Z and a bound axis keeps its column; the mixed eye is a struck eye with a *1 of 6 parts hidden* tooltip.

**Options:**
- **Keep the split (Recommended):** `ui-145` is queued and ready.
- **Fold `ui-145` back into one task:** merge its items into a single longer run.
- **Drop items 7 to 9:** the connector caption, Align strips and glyphs stay as they are.

**If deferred:** the split stays and `ui-145` waits in Next up.

#### Q95 · Keep the home page on manual deploys, with a release-checklist step?

**Question:** `build-039` assumed you want to keep manual-only deploys of `warpcad.com` (your `b3c72b6` choice); keep that?

**Background:** The home page's Help links come from the app's live `help/index.json` when its `pages` workflow runs, and nothing runs it after a release. `native-apps` and `import` were missing for that reason. I took the option that respects your choice: file those two pages into `docs-groups.json`, fix the README, and add "run the home page's `pages` workflow" to `docs/decisions/release.md`.

**Options:**
- **Keep manual deploys (Recommended):** no token, no cost; the step can be forgotten, so the gap can come back after a release.
- **Restore a daily `schedule`:** the page never goes stale; one cheap build a day (the workflow runs no tests now).
- **Dispatch it from the app's Release workflow:** automatic, but needs a token with access to the other repository.

**If deferred:** manual deploys stay.

#### Q94 · Keep the spacing snap I chose when `ui-123` put padding and gap on tokens?

**Question:** Padding and gap values off the `--space-1…8` scale were snapped; keep that?

**Background:** 10px (117 uses) and 14px (20 uses) got two new half steps, `--space-4h` and `--space-5h`, so they did not move. Rarer values snapped to the nearest step: 1px to 2px, 3px to 4px, 5/7px to 6px, 9px to 8px, 13px to 12px, 18px to 16px, 20/22/28px to 24px, 34px to 32px (44 declarations, 1 to 4px each). 83 screenshots were regenerated: 54 docs pictures and 29 layout baselines (`git show --stat` on the `ui-123` commit lists them). Margin is not guarded.

**Options:**
- **Keep the snap (Recommended):** a 1 to 4px shift in 44 places, and every picture was regenerated and re-checked on all engines.
- **Restore exact pixels:** add tokens for each odd value. About ten more tokens, which defeats the scale.

**If deferred:** nothing changes.

**Answer:** question

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

### Q-group: Sketch editor

17 decisions from `testing-033`, each with the recommendation first. `/owner` offers **Accept all recommendations** for this group.

#### Q18 · Should Cancel ask before discarding a traced draft on a phone?

**Question:** After Finish on a phone, should Cancel ask first when the draft holds traced outlines?

**Background:** At 390 x 844 the Sketch toolbar returns over the top of the canvas (to y 223) after Finish, and a finger aimed at a top point of the traced Solid pressed Cancel and discarded the whole traced draft in one tap (`sketch-004` #3).

**Options:**
- **Ask before discarding traced outlines (Recommended):** a confirm on Cancel only when the draft holds a traced outline protects the user's work and touches nothing else. An S-size task.
- **Frame the traced outline clear of the toolbar:** fixes the cause but changes the camera after every Finish.

**If deferred:** nothing changes; `sketch-004` #3 stay `Owner`.

**Answer:** question

#### Q19 · Should arming Auto-trace or Set scale fold an already-open Inspector sheet on a phone?

**Question:** Leave the Inspector sheet alone, or fold it when an image tool is armed?

**Background:** At phone width the Slices sheet steps aside while Auto-trace or Set scale is armed (77 % reachable canvas), but an Inspector sheet that was already expanded stays up and cuts reachable canvas to 56 %, under the 69 % floor. The drive got there by a stray gesture (`sketch-004` #4).

**Options:**
- **Leave it (Recommended):** nothing shows people land in this state, and the user opened that sheet on purpose.
- **Fold the Inspector sheet when an image tool is armed:** matches how the Slices sheet behaves. An S-size task.

**If deferred:** nothing changes; `sketch-004` #4 stay `Owner`.

**Answer:** question

#### Q20 · Is the Slices sheet disappearing while Set scale is armed clear enough?

**Question:** Keep the Slices sheet hidden while Set scale is armed, with the length field in the top banner?

**Background:** The spec said the sheet "collapses to its header". The header alone measured 67 % reachable canvas against the 69 % floor, 77 % without it. The length field sits in the top banner at every size (`sketch-003` #2).

**Options:**
- **Keep it hidden (Recommended):** it is the only layout that clears the 69 % floor; the banner states what is armed.
- **Collapse to the header as the spec said:** follows the spec but fails the floor by 2 points.

**If deferred:** nothing changes; `sketch-003` #2 stay `Owner`.

**Answer:** question

#### Q21 · Should a reference photo have its own History row?

**Question:** Keep the photo as its own History row (not editable there, suppress hides it)?

**Background:** The photo shows in History as *Reference image 1400 x 1000 px*; suppressing it hides the photo and its slice says *switched off in History* (`sketch-003` #3).

**Options:**
- **Keep the row (Recommended):** it is a real document step, so hiding it would break the rule that History shows everything that changes the project.
- **Hide photo rows from History:** less clutter, but a suppressed photo would have no way back.

**If deferred:** nothing changes; `sketch-003` #3 stay `Owner`.

**Answer:** question

#### Q22 · Should the Sketch toolbar stop covering the top of the canvas once a Line chain is live?

**Question:** Keep the growing toolbar at laptop size, or change it?

**Background:** Pre-existing, found by the drive: once a Line chain is live, the Finish / Undo-point row covers the top ~50 px of the canvas, so a photo's top edge cannot be clicked until you zoom or pan (`sketch-003` #4).

**Options:**
- **Leave it for now (Recommended):** zoom and pan clear it, and `sketch-004` #3 above may change the toolbar anyway; decide both together later.
- **File a follow-up:** grow the toolbar sideways, or open the editor with the origin lower. An S-size task.

**If deferred:** nothing changes; `sketch-003` #4 stay `Owner`.

**Answer:** question

#### Q23 · Should a Circle's rim stop snapping to a circle it shares a centre with?

**Question:** Keep the 12 px snap pull, or stop concentric circles snapping to each other's rim?

**Background:** At the opening zoom 12 px is about 5 mm. Drawing the docs' tube without Shift (an r20 circle, then an r15 one from the same centre), the second circle's rim jumps onto the first until you release about 1 mm further in or turn Snap off (`sketch-007` #1).

**Options:**
- **Stop a Circle's rim snapping to a concentric circle (Recommended):** it removes the case that actually misleads and leaves the pull as is. An S-size task.
- **Keep 12 px as it is:** no change; Shift or Snap off already works around it.

**If deferred:** nothing changes; `sketch-007` #1 stay `Owner`.

**Answer:** question

#### Q24 · Should cancelling a Line with Esc-twice show a toast?

**Question:** Add a "Line discarded" cue when the second Esc cancels a line?

**Background:** A second Esc within 0.9 s of the one that finished a line cancels it, and nothing on screen says so (`sketch-006` #3). Undo point does not bring back a discarded line.

**Options:**
- **Add a short "Line discarded" toast (Recommended):** cheap, and a silent discard is the surprising kind. An XS task.
- **Leave it:** the 0.9 s window makes an accidental double Esc unlikely.

**If deferred:** nothing changes; `sketch-006` #3 stay `Owner`.

**Answer:** question

#### Q25 · Should Offset X/Y and Twist share one compact row in the Slices card?

**Question:** Put Offset X/Y and Twist on one row so Add image and Set scale stay above the fold at laptop height?

**Background:** On a 900 px tall laptop the Slices card is taller, so **Add image…** and **Set scale** sit below its fold and need a scroll inside the card (`sketch-008` #2).

**Options:**
- **Put them on one compact row (Recommended):** it recovers the height with no feature lost. An S-size task.
- **Leave the card as it is:** the scroll inside the card works, just less discoverable.

**If deferred:** nothing changes; `sketch-008` #2 stay `Owner`.

**Answer:** question

#### Q26 · Should the point-grab targets shrink on dense outlines?

**Question:** Keep the nearest-dot grab on a 32-dot circle, or shrink the targets when dots are close?

**Background:** On a ~20 mm circle at normal zoom (32 dots ~10 px apart), a near-miss inside the ring pulled a neighbouring point inward and briefly made the outline cross itself (WebKit drive). The status line said so and Simplify fixed it (`sketch-002` #2).

**Options:**
- **Leave it (Recommended):** the app says what happened and offers the fix; Undo is one tap. Revisit if a user reports it.
- **Shrink grab targets when dots are closer than about 12 px:** prevents the near-miss. An S-size task.

**If deferred:** nothing changes; `sketch-002` #2 stay `Owner`.

**Answer:** question

#### Q27 · Should the phone status line for a picked point be shortened?

**Question:** Shorten "… 3 points · point 1 selected" so it fits on one line at 390 px?

**Background:** At 390 px the status line wraps to two lines with a point picked; the toolbar is 178 px tall and reachable canvas measures exactly 69 %, the floor, with no slack (`sketch-002` #3).

**Options:**
- **Shorten the text, for example "· pt 1" (Recommended):** it gives back a line of height before the next toolbar addition. An XS task.
- **Leave it:** it passes the floor today.

**If deferred:** nothing changes; `sketch-002` #3 stay `Owner`.

**Answer:** question

#### Q28 · Is the Sketch row after Tube in Primitives, opening the editor on drop, right?

**Question:** Keep the Sketch row after Tube, with a drop opening the editor and Cancel leaving no body?

**Background:** Observed 2026-11-07 in headless Chromium at 1440 x 900: the row sits after Tube and the drop opens the editor with Done and Cancel; Cancel leaves no sketch (`sketch-001` #1).

**Options:**
- **Keep it (Recommended):** it works as described and matches the rule that geometry is placed in the 3D view.
- **Move or rename the row:** file a follow-up with the place you want.

**If deferred:** nothing changes; `sketch-001` #1 stay `Owner`.

**Answer:** question

#### Q29 · Do you want double-click on a sketch body to edit it?

**Question:** Build double-click or double-tap as an Edit sketch shortcut?

**Background:** Not built. Only the Inspector's Edit sketch exists (`sketch-001` #2).

**Options:**
- **Do not build it now (Recommended):** the Inspector control works; add the shortcut when someone asks.
- **Build it:** a double-tap on touch collides with zoom gestures, so it needs care. An M-size task.

**If deferred:** nothing changes; `sketch-001` #2 stay `Owner`.

**Answer:** question

#### Q30 · Is "Loft needs exactly one Solid and no Holes per slice" acceptable for v1?

**Question:** Keep the v1 Loft limit (one Solid outline, no Holes per slice; cut holes afterwards with Subtract)?

**Background:** This is the implementer's default from `sketch-001` (#3).

**Options:**
- **Keep it (Recommended):** a refusal is clear and Subtract covers the need.
- **Allow Holes in a Loft:** larger kernel work; file it when a model needs it.

**If deferred:** nothing changes; `sketch-001` #3 stay `Owner`.

**Answer:** question

#### Q31 · Should the nav chrome fold to the ✥ toggle while editing on a narrow viewport?

**Question:** Keep the nav chrome folded to ✥ at narrow widths while a sketch is open, even with no sheet open?

**Background:** It extends `ui-046` and is what keeps the resting editor's reachable canvas at or above 69 % (67 % to 76 % at 390 px) (`sketch-001` #4).

**Options:**
- **Keep it (Recommended):** it is the measured way to stay above the floor.
- **Show the full chrome:** the editor would drop below the floor at 390 px.

**If deferred:** nothing changes; `sketch-001` #4 stay `Owner`.

**Answer:** question

#### Q32 · Is the phone sheet's whole-canvas reachability of 47-57 % acceptable?

**Question:** Accept the literal shortfall against 69 % with the Slices/Extrude sheet open, since the area round the origin stays 100 % reachable?

**Background:** With the sheet open the phone's whole-canvas reachability is 47-57 % (tablet 64-74 %). The test asserts the area round the origin instead (`sketch-001` #5).

**Options:**
- **Accept it (Recommended):** the sheet is open on purpose and the drawing area stays reachable.
- **Make the sheet smaller or collapsible:** a layout task for each width.

**If deferred:** nothing changes; `sketch-001` #5 stay `Owner`.

**Answer:** question

#### Q33 · Are the sketch editor's starting defaults right?

**Question:** Keep the starting defaults: Polygon 6 sides, new slice 50 mm above the highest, Linear 10 mm, Revolve 360 degrees / 32 segments, Helical pitch 10 mm x 2 turns, Outline wall 2 mm x 10 mm?

**Background:** These are the implementer's defaults (`sketch-001` #6); the user changes any of them in the sheet.

**Options:**
- **Keep them (Recommended):** each is a one-line change later and none loses work.
- **Change a default:** say which in Other.

**If deferred:** nothing changes; `sketch-001` #6 stay `Owner`.

**Answer:** question

#### Q34 · Is it right that Undo/Redo and Delete are off while the sketch editor is open?

**Question:** Keep Undo, Redo and Delete off while a sketch is open, and drop old `sketch.line` records on load with a warning?

**Background:** The draft is not in the document until Done. Observed 2026-11-07: Undo and Redo are disabled while the editor is open and after Cancel. Migration on load was not tested (`sketch-001` #7).

**Options:**
- **Keep it (Recommended):** the spec said no migration, and Cancel leaves the document untouched.
- **Migrate old sketch.line records:** a data task with no known project that needs it.

**If deferred:** nothing changes; `sketch-001` #7 stay `Owner`.

**Answer:** question

### Q-group: Repeat, groups and parts

7 decisions from `testing-033`, each with the recommendation first. `/owner` offers **Accept all recommendations** for this group.

#### Q35 · Should Repeat refuse a source with a step the Assistant or a merge added?

**Question:** Keep Apply disabled when the first part has a step you did not make, or let Apply copy it?

**Background:** Apply is disabled with "… has a step you didn't make … Cancel and make the part by hand" because `core-061` copies the source's whole lineage. The spec said such a step is listed under *Not part of the repeat* (`ui-069` #1).

**Options:**
- **Keep the stricter rule (Recommended):** copying a step the user never made would put it in every copy unseen.
- **Let Apply copy it:** matches the spec wording but changes what every copy contains.

**If deferred:** nothing changes; `ui-069` #1 stay `Owner`.

**Answer:** question

#### Q36 · Should Repeat on a Group's sub-part need a numbered name family?

**Question:** Leave Repeat enabled on a Group's sub-part, which has no name family like `hole1`?

**Background:** Repeat is enabled there and seeds on a member with no name family. Harmless so far (`ui-069` #4).

**Options:**
- **Leave it (Recommended):** nothing breaks and no one has asked for the rule.
- **Require a numbered family:** refuses a case that works today.

**If deferred:** nothing changes; `ui-069` #4 stay `Owner`.

**Answer:** question

#### Q37 · Should copies carry the Assistant's step, or only the original?

**Question:** Keep "Bolt 1 keeps the Assistant's step, the copies do not"?

**Background:** The spec's Problem says "let Apply copy it"; its Proposed fix and Testing say the step is left out of every copy. The second shipped (`core-063` #1).

**Options:**
- **Keep what shipped (Recommended):** it is built, tested and the safer reading.
- **Make the copies carry it:** a behaviour change in Repeat.

**If deferred:** nothing changes; `core-063` #1 stay `Owner`.

**Answer:** question

#### Q38 · Should the HAT's, Camera Module's and touch screens' mounting holes keep their part on Subtract, as the Pi's do?

**Question:** Extend `DRILL_PARTS` to those ops?

**Background:** Only the Pi keeps its part when used to Subtract; the others use their part up, as do the Ethernet jack, a `clearance-*` keep-out and a bolt's `tap`. One line per op in `src/core/kernel/registry.js` switches one on (`core-064` #1).

**Options:**
- **Extend it to the HAT, camera and touch-screen mounting holes (Recommended):** it makes mounting holes behave the same across boards. An S-size task.
- **Leave it as is:** only the Pi behaves this way, which is inconsistent.

**If deferred:** nothing changes; `core-064` #1 stay `Owner`.

**Answer:** question

#### Q39 · Keep Repeat refusing a source whose steps include a Subtract?

**Question:** Keep the refusal ("a repeat would copy the whole of <body> once per target")?

**Background:** It is not reachable from the UI today. It exists so a kept Pi cannot make Repeat add one whole extra plate per hole (`core-064` #3).

**Options:**
- **Keep it (Recommended):** it prevents a wrong result and costs nothing.
- **Drop it:** accepts the extra-plate case.

**If deferred:** nothing changes; `core-064` #3 stay `Owner`.

**Answer:** question

#### Q40 · Should Enlarge and Fit carry snapped parts like the Inspector's Size field does?

**Question:** File a follow-up so Enlarge and Fit move snapped parts, or keep the page note?

**Background:** With a lug snapped to a plate's top, Enlarge Z +16 (and Fit Z 24) left the lug at Z 8, buried in the plate; typing the same size in the Inspector's Size field moves the lug with it (`data-007`). `docs/resize-bisect.md` now says so (`docs-013` #1).

**Options:**
- **File a follow-up (Recommended):** two ways to do one action should give one result. An M-size task.
- **Keep the page note:** cheapest; the Inspector route works.

**If deferred:** nothing changes; `docs-013` #1 stay `Owner`.

**Answer:** question

#### Q41 · Is the popover hint enough when Mirror's plane position is blank on a symmetric shape?

**Question:** Keep only the hint, or warn on commit when Mirror would add an invisible copy on top of the original?

**Background:** A blank plane position on a symmetric shape adds a copy sitting exactly on the original (`ui-039` #2).

**Options:**
- **Keep the hint (Recommended):** Undo removes the copy and the result is visible in Objects.
- **Warn on commit:** an extra step for a rare case.

**If deferred:** nothing changes; `ui-039` #2 stay `Owner`.

**Answer:** question

### Q-group: Share, merge and the project file

10 decisions from `testing-033`, each with the recommendation first. `/owner` offers **Accept all recommendations** for this group.

#### Q42 · Does a phone need a persistent "Published" indicator?

**Question:** Add a dot on **File ▾** at 390 px when the project is published, or leave Share under File ▾ with no indicator?

**Background:** At 390 px Share is under File ▾ and the chip is hidden, so nothing shows that a project is published (`io-017` #3).

**Options:**
- **Leave it (Recommended):** publishing is a deliberate one-off and the Share sheet shows the state when opened.
- **Add a dot on File ▾:** a small badge; an S-size task.

**If deferred:** nothing changes; `io-017` #3 stay `Owner`.

**Answer:** question

#### Q43 · Is the "Published. Link copied" toast covering the Share title acceptable?

**Question:** Leave the toast over the sheet's Share title for about 4 s at tablet and laptop width?

**Background:** The toast covers the title while it is up (`io-017` #4).

**Options:**
- **Leave it (Recommended):** it is brief and the sheet's content is untouched.
- **Move the toast:** an S-size layout task.

**If deferred:** nothing changes; `io-017` #4 stay `Owner`.

**Answer:** question

#### Q44 · Is the "Saved to gist" toast covering the Operations toolbar acceptable?

**Question:** Leave the toast over part of the Operations toolbar (Chamfer, Enlarge) for a few seconds at 1440 px?

**Background:** It sits over the toolbar for a few seconds after Save as gist (`io-021` #1).

**Options:**
- **Leave it (Recommended):** transient, and the same toast position as the other toasts.
- **Move toasts elsewhere:** a layout change for every toast.

**If deferred:** nothing changes; `io-021` #1 stay `Owner`.

**Answer:** question

#### Q45 · Is a banner naming whichever step lost a move-versus-fillet conflict clear enough?

**Question:** Keep the banner, with the flagged step chosen by replica id when clocks tie?

**Background:** When both clocks tie the flagged row is chosen by replica ids, so it can be either step on different runs (`io-010` #4).

**Options:**
- **Keep the banner (Recommended):** the banner names the step that lost, so nothing is lost silently.
- **Prefer the local step:** deterministic, but it overrides a collaborator's edit.

**If deferred:** nothing changes; `io-010` #4 stay `Owner`.

**Answer:** question

#### Q46 · Is the merge strip pushing the workspace down 49-70 px acceptable on a phone?

**Question:** Keep the strip in the layout, or overlay it?

**Background:** The strip moves the workspace down when it appears and back up when it goes (`ui-062` #1).

**Options:**
- **Keep it in the layout (Recommended):** an overlay would cover the very toolbar the user may need next, and the jump is one-off per merge.
- **Overlay it:** no jump, but it covers content.

**If deferred:** nothing changes; `ui-062` #1 stay `Owner`.

**Answer:** question

#### Q47 · Is a conflicted row's fix easy enough to find in History?

**Question:** Leave the History action bar as it is at laptop height 900 and on a phone sheet?

**Background:** The selected-row action bar is cramped at the bottom of the panel at 900 px, and on a phone sheet "Roll back to here" sits under the peek bars (`ui-062` #2).

**Options:**
- **Leave it (Recommended):** the controls are all reachable and the cramped case needs a real conflict to meet.
- **Rework the action bar:** a layout task.

**If deferred:** nothing changes; `ui-062` #2 stay `Owner`.

**Answer:** question

#### Q48 · Should the clean-merge strip dismiss itself?

**Question:** Keep the strip until dismissed, or let a clean merge auto-dismiss after a few seconds?

**Background:** The strip never times out (`ui-062` #3).

**Options:**
- **Auto-dismiss clean merges after about 8 s; keep conflicts until dismissed (Recommended):** a lingering success message reads as stale. An XS task.
- **Keep it until dismissed:** no timer to get wrong.

**If deferred:** nothing changes; `ui-062` #3 stay `Owner`.

**Answer:** question

#### Q49 · Is the merge section's share of a project file small enough to skip `data-012`'s tighter encoding?

**Question:** Skip `data-012` (the tighter merge encoding) before `ui-062`?

**Background:** Measured 2026-11-14 on your own files, saved as version 2: the merge section is 14.2 % of `fan-duct` and 15.0 % of `warpcad-project` (the two largest real projects), 18-23 % of the small ones, and 2-3 % of the three files dominated by user part definitions (`data-011` #2).

**Options:**
- **Skip it (Recommended):** about 15 % of the file does not justify a format change.
- **Do it first:** worth it only if file size becomes a problem.

**If deferred:** nothing changes; `data-011` #2 stay `Owner`.

**Answer:** question

#### Q50 · Should the Shared view get full-size 44 px chrome on phone and tablet?

**Question:** Give the Shared view 44 px controls instead of the editor's compact 28-38 px nav pad and view box?

**Background:** The Shared view reuses the editor's compact controls (`--tap-compact`). A first-time visitor with a thumb gets small targets (`io-016` #6). `CLAUDE.md` says tap targets stay at tap size.

**Options:**
- **File a follow-up (Recommended):** the Shared view is the first thing a recipient sees. An S-size task.
- **Leave it:** the editor's compact controls already ship.

**If deferred:** nothing changes; `io-016` #6 stay `Owner`.

**Answer:** question

#### Q51 · Is a ~15 MB extra precache acceptable on a first phone install?

**Question:** Keep the Help precache, or narrow `HELP_PRECACHE_GLOBS` in `scripts/vite-plugin-help.mjs`?

**Background:** First install on a phone connection downloads about 15 MB more so Help works offline (`ui-061` #3).

**Options:**
- **Keep it (Recommended):** it is one time and offline Help is the point.
- **Narrow the precache:** smaller install, Help needs a connection.

**If deferred:** nothing changes; `ui-061` #3 stay `Owner`.

**Answer:** question

### Q-group: AI and MCP

14 decisions from `testing-033`, each with the recommendation first. `/owner` offers **Accept all recommendations** for this group.

#### Q52 · Should the History row also show the prompt?

**Question:** Show the prompt in the History row, as the finding's Feedback line says, or keep the note icon only?

**Background:** History rows made over MCP carry a note icon with the reason (`ai-003`, Q17 above); the finding's Feedback line also mentioned the prompt itself (`ai-031` #3).

**Options:**
- **Keep the icon only (Recommended):** a prompt in every row would crowd the list; the row expands to show it.
- **Show the prompt in the row:** an S-size task.

**If deferred:** nothing changes; `ai-031` #3 stay `Owner`.

**Answer:** question

#### Q53 · Does Undo AI turn looking greyed for about 1.5 s feel right?

**Question:** Leave the short grey-out while the "Claude Code working" chip lingers?

**Background:** It is greyed for about 1.5 s after a call (`ai-012` #4).

**Options:**
- **Leave it (Recommended):** it matches the chip, which says work is still landing.
- **Enable it sooner:** risks undoing a half-landed turn.

**If deferred:** nothing changes; `ai-012` #4 stay `Owner`.

**Answer:** question

#### Q54 · Is a browser-driven runner for scenario 18 worth building?

**Question:** Build the runner, or rely on the live scenario?

**Background:** An image needs a canvas and `capture_view` needs a GPU, so the scripted runner is not built (`ai-011` #4).

**Options:**
- **Rely on the live scenario (Recommended):** it already covers the path and the runner would need a GPU in CI.
- **Build the runner:** an L-size task.

**If deferred:** nothing changes; `ai-011` #4 stay `Owner`.

**Answer:** question

#### Q55 · Is the `askedOrAssumed` check good enough?

**Question:** Keep the crude text check (a question mark, or the word "assume")?

**Background:** It is the test used for the ambiguous and under-specified cases (`ai-011` #5).

**Options:**
- **Keep it (Recommended):** it has not misjudged a recorded case; tighten it when one fails.
- **Write a stricter check:** a judge call per case, costing tokens.

**If deferred:** nothing changes; `ai-011` #5 stay `Owner`.

**Answer:** question

#### Q56 · Should there be a recorder that saves a live run as a transcript?

**Question:** Add a transcript recorder once a live run exists?

**Background:** Transcripts are hand-written (`ai-010` #4).

**Options:**
- **Not yet (Recommended):** hand-written ones are small and reviewed; revisit when there are many.
- **Build the recorder:** an M-size task.

**If deferred:** nothing changes; `ai-010` #4 stay `Owner`.

**Answer:** question

#### Q57 · Should hosted references (`github:owner/repo/path`) be built?

**Question:** Build read-only hosted references with `WARPCAD_GITHUB_TOKEN` for writes, or keep them deferred?

**Background:** They are deferred (`ai-009` #2).

**Options:**
- **Keep them deferred (Recommended):** no current use, and a token path is outward-facing.
- **Build them:** an L-size task.

**If deferred:** nothing changes; `ai-009` #2 stay `Owner`.

**Answer:** question

#### Q58 · Are per-call limits over MCP acceptable, or should there be a session cap?

**Question:** Keep limits per tool call rather than per user turn?

**Background:** MCP limits apply per call (`ai-009` #4).

**Options:**
- **Keep per-call limits (Recommended):** the app's own AI turn already caps the turn; MCP clients drive their own loop.
- **Add a session-level cap:** an S-size task.

**If deferred:** nothing changes; `ai-009` #4 stay `Owner`.

**Answer:** question

#### Q59 · Is the optional `request` field the right way for intent to travel over MCP?

**Question:** Keep the optional `request` field on write tools?

**Background:** It is how design intent is saved with each step over MCP (`ai-009` #5).

**Options:**
- **Keep it (Recommended):** it is optional and already in use across the tools.
- **Make it required:** would break clients that omit it.

**If deferred:** nothing changes; `ai-009` #5 stay `Owner`.

**Answer:** question

#### Q60 · Is the reference overlay at 0.55 opacity with the grid hidden the right look?

**Question:** Keep 0.55 opacity with the grid hidden for judging a match?

**Background:** The overlay draws the model at 0.55 with the grid hidden (`ai-008` #3).

**Options:**
- **Keep it (Recommended):** it is legible against the model in both themes.
- **Change the look:** say what you want in Other.

**If deferred:** nothing changes; `ai-008` #3 stay `Owner`.

**Answer:** question

#### Q61 · Should a cancelled turn forget the scale it set?

**Question:** Keep the scale for the rest of the session after a cancelled turn (the project is untouched)?

**Background:** A cancelled turn keeps its scale (`ai-008` #4).

**Options:**
- **Keep it (Recommended):** the user can still see and reset it; forgetting would repeat the work.
- **Forget on cancel:** a cancel then fully rewinds the session.

**If deferred:** nothing changes; `ai-008` #4 stay `Owner`.

**Answer:** question

#### Q62 · Should a new message dismiss a pinned Save proposal?

**Question:** Keep a pinned Save proposal until Confirm or Not now, even if you send a new message?

**Background:** The proposal stays pinned (`ai-008` #5).

**Options:**
- **Keep it pinned (Recommended):** dismissing it silently could lose the proposed save.
- **Dismiss it on a new message:** less clutter.

**If deferred:** nothing changes; `ai-008` #5 stay `Owner`.

**Answer:** question

#### Q63 · Should the app test the saved key once on open?

**Question:** Keep the hollow-ring dot ("saved, not yet checked"), or test the key when the Assistant opens?

**Background:** The dot is a hollow ring until a test this visit (`ai-004` #4). A test is a real API call, and a key bills tokens.

**Options:**
- **Keep the dot, no automatic test (Recommended):** an automatic test spends the owner's tokens on every visit.
- **Test once on open:** a clearer dot at a small token cost per visit.

**If deferred:** nothing changes; `ai-004` #4 stay `Owner`.

**Answer:** question

#### Q64 · Do you want a Settings toggle for the always-on Library memory?

**Question:** Keep the memory always on, or add a "remember" toggle?

**Background:** The spec said to add a toggle only if the always-on memory surprises someone (`ui-068` #3).

**Options:**
- **Keep it always on, no toggle (Recommended):** no one has been surprised; add the toggle if someone is.
- **Add the toggle:** an S-size task.

**If deferred:** nothing changes; `ui-068` #3 stay `Owner`.

**Answer:** question

#### Q65 · Is the empty space under Undo AI turn in the connected column acceptable?

**Question:** Leave the connected column filling its grid cell at laptop width?

**Background:** The column keeps its width with empty space under Undo AI turn (`ui-071` #2).

**Options:**
- **Leave it (Recommended):** cosmetic, and narrowing it moves the chat when connecting.
- **Narrow the column while connected:** an S-size layout task.

**If deferred:** nothing changes; `ui-071` #2 stay `Owner`.

**Answer:** question

### Q-group: Layout, toasts and small controls

14 decisions from `testing-033`, each with the recommendation first. `/owner` offers **Accept all recommendations** for this group.

#### Q66 · Should a row drag from a section pop-out suppress text selection?

**Question:** Stop the pop-out text from highlighting during a row drag?

**Background:** Dragging a row from the Raspberry Pi pop-out's text can highlight that text, on all three engines, during a mouse drag (`ui-081` #1).

**Options:**
- **Suppress selection during a row drag (Recommended):** the highlight is noise during a drag and the change is local. An XS task.
- **Leave it:** cosmetic.

**If deferred:** nothing changes; `ui-081` #1 stay `Owner`.

**Answer:** question

#### Q67 · Is dropping a model file onto the icon rail doing nothing acceptable?

**Question:** Keep the rail refusing a dropped model file (the ⋯ menu is the way in)?

**Background:** The labelled column accepts a dropped file; the rail does nothing (`ui-084` #6).

**Options:**
- **Keep it (Recommended):** the rail is narrow and the ⋯ menu works.
- **Accept the drop on the rail:** an S-size task.

**If deferred:** nothing changes; `ui-084` #6 stay `Owner`.

**Answer:** question

#### Q68 · Do you want a "face the cut" button in the Split sheet?

**Question:** Add a button that turns the view square-on to the cut?

**Background:** On an iPad at 820 px the Split sheet covers the orientation cube, so the face can only be turned before opening Split or by dragging (`ui-067` #1).

**Options:**
- **Not yet (Recommended):** dragging works and no one has asked.
- **Add the button:** an S-size task.

**If deferred:** nothing changes; `ui-067` #1 stay `Owner`.

**Answer:** question

#### Q69 · Should the offset handle hide or shrink while Place connectors is on?

**Question:** Leave the 44 px offset handle at the centre of a small cut face?

**Background:** It covers much of a small face until you zoom in (`ui-067` #2).

**Options:**
- **Leave it (Recommended):** 44 px is the tap size and zooming clears it.
- **Hide or shrink it:** shrinking breaks the tap size rule.

**If deferred:** nothing changes; `ui-067` #2 stay `Owner`.

**Answer:** question

#### Q70 · Is mouse and touch only acceptable for connector markers in v1?

**Question:** Leave connector markers without a keyboard path to move or remove them?

**Background:** Markers are SVG only (`ui-067` #4).

**Options:**
- **Accept it for v1 (Recommended):** the marker is placed and removed with its own button; a keyboard path can follow.
- **Add a keyboard path now:** an S-size task.

**If deferred:** nothing changes; `ui-067` #4 stay `Owner`.

**Answer:** question

#### Q71 · Should the sheet tab stay on a phone with an empty scene?

**Question:** Keep the **+** tab visible when the scene is empty?

**Background:** With an empty scene at phone width there is no sheet tab, so + is unreachable until something is placed (`ui-059` #5).

**Options:**
- **Keep the tab on an empty scene (Recommended):** a new user on a phone would otherwise have nothing to tap. An S-size task.
- **Leave it:** the Library is reachable another way.

**If deferred:** nothing changes; `ui-059` #5 stay `Owner`.

**Answer:** question

#### Q72 · Is committing a typed value on blur before Delete surprising?

**Question:** Keep committing a typed variable value when focus leaves it, even if the next tap is Delete?

**Background:** The typed value commits on blur first (`ui-059` #6).

**Options:**
- **Keep it (Recommended):** it is how every field in the app behaves, and Undo reverses it.
- **Discard on Delete:** inconsistent with other fields.

**If deferred:** nothing changes; `ui-059` #6 stay `Owner`.

**Answer:** question

#### Q73 · Should the save chip have a fixed width?

**Question:** Give the save chip a fixed width so Undo / Redo / History do not shift about 27 px when `Saving…` becomes `Saved · hh:mm`?

**Background:** The cluster is right-aligned and shifts after every edit; a click on Undo during that second can land on the gap (`docs-015` #1).

**Options:**
- **Fix the chip's width (Recommended):** a mis-tap on Undo is the worst place for a shift. An XS task.
- **Leave it:** the shift lasts about a second.

**If deferred:** nothing changes; `docs-015` #1 stay `Owner`.

**Answer:** question

#### Q74 · Should the Fillet refusal read as user wording?

**Question:** Replace the engineering message (`modify.filletRim: the solid is not prismatic over the rim band … see the core-003 addendum`) with plain wording, and rewrite scenario 12 step 12?

**Background:** Fillet Top (+Z) 4 on a cube that already has a 5 mm top chamfer is refused with the kernel's message. Scenario 12 step 12 cannot be driven as written (`docs-015` #2).

**Options:**
- **Reword the refusal and fix the step (Recommended):** a user sees this text. An S-size task.
- **Leave the wording:** only the step is rewritten.

**If deferred:** nothing changes; `docs-015` #2 stay `Owner`.

**Answer:** question

#### Q75 · Should the History dock be taller or resizable at laptop width?

**Question:** Leave the fixed ~220 px History dock?

**Background:** A five-step model needs scrolling and an open Edit form is cramped (`docs-015` #3).

**Options:**
- **Leave it (Recommended):** the dock scrolls and has not blocked a task.
- **Make it taller or resizable:** a layout task.

**If deferred:** nothing changes; `docs-015` #3 stay `Owner`.

**Answer:** question

#### Q76 · Does the cut plane need to be larger or brighter on a long thin bar?

**Question:** Leave the cut plane as the body's cross-section?

**Background:** On a long thin bar it is a small slot behind the gizmo (docs `split-sheet.png`) (`io-007` #4).

**Options:**
- **Leave it (Recommended):** it shows exactly where the cut falls.
- **Draw a larger or brighter plane:** an S-size task.

**If deferred:** nothing changes; `io-007` #4 stay `Owner`.

**Answer:** question

#### Q77 · Should the 45-entry Spec list be grouped on a phone?

**Question:** Split the flat Spec list into `<optgroup>`s?

**Background:** The list is flat with 45 entries (`core-052` #2).

**Options:**
- **Group it with `<optgroup>`s (Recommended):** a native picker shows the groups and the long list is easier to scan. An S-size task.
- **Leave it flat:** it works today.

**If deferred:** nothing changes; `core-052` #2 stay `Owner`.

**Answer:** question

#### Q78 · How should the Library Type dropdown show its longest label?

**Question:** Fix "Wood screw, flat head" clipping to "Wood screw, fla" in the 197 px Library column?

**Background:** The dropdown clips its longest labels (`core-060` #1).

**Options:**
- **Let the select show the full label (Recommended):** a clipped label hides which screw you are choosing. An XS task.
- **Leave it:** the value is still selectable.

**If deferred:** nothing changes; `core-060` #1 stay `Owner`.

**Answer:** question

#### Q79 · Does the Pi warning banner need to appear near Parameters too?

**Question:** Leave the banner at the top of the Inspector detail view after Leave broken?

**Background:** It is scrolled out of sight if you were down at Parameters when you changed the Model; the cube stays visible and History badges the row (`ui-052` #3).

**Options:**
- **Leave it (Recommended):** History also badges the row, so the problem is findable.
- **Also show it near Parameters:** an S-size task.

**If deferred:** nothing changes; `ui-052` #3 stay `Owner`.

**Answer:** question

### Q-group: Hardware and Pi recipes

10 decisions from `testing-033`, each with the recommendation first. `/owner` offers **Accept all recommendations** for this group.

#### Q80 · Is a legacy bolt's old Spec form in the History Edit acceptable?

**Question:** Leave the History Edit form showing a legacy `hardware.bolt`'s old Spec (`m10 hex`)?

**Background:** Submitting writes the new Type + Size shape (`core-060` #3).

**Options:**
- **Leave it (Recommended):** it converts itself on the first edit.
- **Convert on load:** a migration task.

**If deferred:** nothing changes; `core-060` #3 stay `Owner`.

**Answer:** question

#### Q81 · Should the BOM show the resolved size when a bolt's Size or Fit is bound to a variable?

**Question:** Show the resolved value in the BOM line?

**Background:** The line reads `Bolt / screw hex × 20 mm` and drops the size because the bound value is not a string. This predates `core-060` (`core-060` #4).

**Options:**
- **Show the resolved value (Recommended):** a BOM that drops the size is not useful. An S-size task.
- **Leave it:** the bolt is still listed.

**If deferred:** nothing changes; `core-060` #4 stay `Owner`.

**Answer:** question

#### Q82 · Should `touchDisplay7inch`'s no-go-power marker use V1's 7 mm z-size?

**Question:** Fix the `NO_GO_POWER_MM.sizeMm` z mismatch (1 mm here, 7 mm in V1)?

**Background:** The mismatch is in a hidden marker (`core-033` #1).

**Options:**
- **Match V1's 7 mm (Recommended):** it removes a known difference from the original. An XS task.
- **Keep 1 mm:** record the reason.

**If deferred:** nothing changes; `core-033` #1 stay `Owner`.

**Answer:** question

#### Q83 · Is the `hatStandoff`'s peg-through-pad the intended solid?

**Question:** Keep V1's shape, a 2.8 mm peg straddling z=0 through a 6.2 mm pad (so a spigot shows on the underside)?

**Background:** It is faithfully ported and fixture-confirmed; whether a real standoff should print that way needs someone who has handled one (`core-018` #3).

**Options:**
- **Keep V1's shape (Recommended):** it is the original design and changing it needs the hardware in hand.
- **Stand the peg on the pad:** a shape change from V1.

**If deferred:** nothing changes; `core-018` #3 stay `Owner`.

**Answer:** question

#### Q84 · Which side moves for a second Fillet/Chamfer on a perpendicular face?

**Question:** Narrow the wording ("a different face, provided the band is still prismatic") or teach the guard to accept it?

**Background:** Fillet a cube's Top at r=3, then Chamfer Right (+X) at r=2: the popover refuses with "the solid is not prismatic over the rim band". The guard is correct and fails loudly, but `ui-027`'s promise is wrong as written (`core-017` #1).

**Options:**
- **Narrow the wording in `docs/fillet-chamfer.md` and `ui-027` (Recommended):** it is the smaller, reversible change and the refusal is already safe. An XS task.
- **Teach the guard:** an L-size kernel task.

**If deferred:** nothing changes; `core-017` #1 stay `Owner`.

**Answer:** question

#### Q85 · Is `miniPiTFT`'s outward-flared clearance the right clearance?

**Question:** Keep V1's 5 mm-per-side flare over the top 5 mm until something consumes it?

**Background:** It is hidden geometry that nothing renders yet (`core-017` #2).

**Options:**
- **Keep V1's number (Recommended):** nothing consumes it yet; check it against a real Mini PiTFT when an enclosure generator does.
- **Change it now:** needs the hardware in hand.

**If deferred:** nothing changes; `core-017` #2 stay `Owner`.

**Answer:** question

#### Q86 · Is the frozen `noGoPower` marker on `touchScreen2` a real problem on a non-stock board?

**Question:** Keep the marker frozen at the stock-board offset?

**Background:** It does not track the header on a non-stock board; a fix would reopen recipe nesting (`docs/decisions/composite-recipe-geometry.md` condition #2) (`core-016` #2).

**Options:**
- **Keep it frozen (Recommended):** no one has hit the problem and a fix is architectural.
- **Reopen recipe nesting:** a large task.

**If deferred:** nothing changes; `core-016` #2 stay `Owner`.

**Answer:** question

#### Q87 · Is `DEFAULT_MODEL = 'v3'` the right camera default?

**Question:** Keep `v3` as the Camera Module default?

**Background:** It was chosen as the current standard camera and so the op works with no params (`core-015` #2).

**Options:**
- **Keep v3 (Recommended):** matches how every sibling composite works with no params.
- **Another default, or require `model`:** a one-line change in `raspberrypi.cameraModule.js`.

**If deferred:** nothing changes; `core-015` #2 stay `Owner`.

**Answer:** question

#### Q88 · Which way should `flipTripodMount` default for the HQ camera?

**Question:** Keep `flipTripodMount = false`, as in V1?

**Background:** V1 gives the name but not the intent; `true` raises the tripod post relative to the mount block. Which matches a real HQ camera needs the hardware in hand (`core-015` #3).

**Options:**
- **Keep false (Recommended):** it is V1's default and a flag flips it.
- **Default to true:** only if the hardware says so.

**If deferred:** nothing changes; `core-015` #3 stay `Owner`.

**Answer:** question

#### Q89 · Should the Pi board render drilled?

**Question:** Keep the board solid, with the four mounting holes as hidden parts only?

**Background:** V1 cuts the holes through the combined board; this port carries them as hidden `hole1`-`hole4` parts because no record field reaches `addHole`. "Match V1 exactly" would also carve the micro-USB shell (`core-014` #2).

**Options:**
- **Keep it solid (Recommended):** nothing needs it drilled, and a drilled board needs its own task either way.
- **File a task to drill it:** via a record-level hole flag or a `boolean.subtract` in the recipe.

**If deferred:** nothing changes; `core-014` #2 stay `Owner`.

**Answer:** question

### Q-group: Snap, booleans and tests

4 decisions from `testing-033`, each with the recommendation first. `/owner` offers **Accept all recommendations** for this group.

#### Q90 · Should an overlapping drop snap to a face rather than centre-on-centre?

**Question:** Keep the snap as it is when both solids already sit within each other's bounds?

**Background:** This is a feel question about what a user means by dropping a part on top of another (`core-020` #1).

**Options:**
- **Keep it (Recommended):** no one has reported a bad snap, and the ghost shows where it lands before release.
- **Snap to a face when overlapping:** a placement rule change.

**If deferred:** nothing changes; `core-020` #1 stay `Owner`.

**Answer:** question

#### Q91 · Should an empty Subtract result say so?

**Question:** Show a message (a toast or a refusal) when a boolean leaves a 0 x 0 x 0 body, instead of leaving it silently?

**Background:** Two coincident operands, or a small solid wholly inside the one it is subtracted from, leave a zero-size body in the scene list with no error (`core-020` #2, `ui-042` #2).

**Options:**
- **Say so with a toast (Recommended):** a silent empty body is confusing and the fix is small. An S-size task.
- **Leave it:** Undo removes the result.

**If deferred:** nothing changes; `core-020` #2, `ui-042` #2 stay `Owner`.

**Answer:** question

#### Q92 · Is the boolean result's bounding box off by a sliver acceptable?

**Question:** Leave sliver-size differences between the dimension lines and the shape after a boolean?

**Background:** Dragging two cubes into rough overlap and typing a round position can leave a result whose raw bounding box differs from the visible shape by a sliver (`ui-014` #1).

**Options:**
- **Leave it (Recommended):** it is within tolerance and needs a snap or a cleanup pass to fix.
- **File a follow-up:** a tolerance snap on operand coordinates or a sliver cleanup.

**If deferred:** nothing changes; `ui-014` #1 stay `Owner`.

**Answer:** question

#### Q93 · Should `snap-align-operation.e2e.js`'s fixture be repositioned?

**Question:** Leave the guards at `> 4` (about 90 times the 0.05 mm tolerance they protect), or move the fixture?

**Background:** The guards were lowered from `> 5` because a taller phone header shifted the fixture's X separation from 5.61 mm to 4.69 mm (`data-003` #3).

**Options:**
- **Leave it until someone next touches that file (Recommended):** the guards still protect the tolerance.
- **File a task to reposition it:** an XS task.

**If deferred:** nothing changes; `data-003` #3 stay `Owner`.

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

#### M22 · Desktop Safari: a sideways swipe over the Library does not scroll the page

`ui-085` #1 · 3 min · filed 2026-11-07

**Steps:** 1. Open https://app.warpcad.com in desktop Safari at laptop width, open the Library. 2. Swipe two fingers sideways over the Library list. 3. System Settings → Appearance → Show scroll bars: **Automatically**, repeat; then **Always**, repeat. Put your setting back.

**Pass if:** The page never moves sideways, with either setting.

**Answer:** validation

#### M23 · Desktop Safari: Combine pop-out at about 720 px

`ui-082` #1 · 3 min · filed 2026-11-07

**Steps:** 1. In desktop Safari drag the window to about 720 px wide. 2. Place two Cubes, select both, press **Combine ▾**. 3. Click outside the pop-out.

**Pass if:** The pop-out opens under the launcher without covering the orientation triad, Union is easy to hit, and the outside click closes it.

**Answer:** validation

#### M24 · Safari: no white frame on a slow load

`build-002` #1 · 5 min · filed 2026-10-10

**Steps:** 1. Safari → Develop → Network Conditions (or Web Inspector throttling) on https://app.warpcad.com, a slow profile, hard reload. 2. Watch from navigation until the UI appears. 3. Repeat in Chrome and Firefox DevTools if you like.

**Pass if:** No white frame shows between navigation and the dark UI.

**Answer:** validation

#### M25 · Claude in Chrome: the copied setup works first time

`ui-156` · 5 min · filed 2026-11-20

**Steps:** 1. Chrome with the WebMCP flag on, WarpCad open, Assistant open. 2. Tap **Copy setup for a browser agent**. 3. In the Claude in Chrome pane, paste, Shift+Enter, type "add a 40 mm cube and put a 20 mm sphere on top of it", send.

**Pass if:** Both bodies land with no correction from you, and History marks both **via webmcp**.

**Answer:** validation

#### M26 · Claude in Chrome: a discarded attempt is deleted, not hidden

`ai-051` · 5 min · filed 2026-11-20

**Steps:** 1. Chrome with the WebMCP flag on, WarpCad open. 2. In the Claude in Chrome pane ask: "make a 40 mm cube, then change your mind and make a 30 mm cylinder instead, and leave only the cylinder". 3. Look at the viewport and open History.

**Pass if:** One body is left, no scratch body or extra boolean row exists, and the cube's Delete row is marked **via webmcp**. **Undo AI turn** brings it back.

**Answer:** validation

#### M27 · The view cube is the one you liked (laptop and phone)

`ui-158` #1 · Mac · 3 min · filed 2026-11-22

**Steps:** 1. Run `npm run build && npm run preview` (or use the deployed app) and open it in Chrome at about 1440 px wide. 2. Look at the top-right corner of the 3D view, then open `~/src/WarpCad1/e2e/app-shell.e2e.js-snapshots/app-shell-laptop-laptop-darwin.png` beside it. 3. Narrow the window to about 390 px (or use the phone preset in dev tools) and look again. 4. Click the white top face, then **Home**, then **Views** → **Bottom**.

**Pass if:** It is the cube you liked: solid, unlabelled, about 96 px, lit white on top and darker below with dark edges, bare in the corner, and it turns as you orbit. In Other, say what is off if not (size, shades, edges, the Home and Views buttons under it).

**Answer:** validation

---

## 4. Accounts and settings

Things only your signed-in accounts can do.

#### K0 · Push the home page fix and run its `pages` workflow

`build-039` · 3 min · filed 2026-11-18

**Steps:** 1. In `~/src/@WarpCad/warpcad.github.io`, review the local commit and `git push origin main`. 2. github.com → warpcad.github.io → Actions → pages → Run workflow, from `main`. 3. When it finishes, open `https://warpcad.com/` and look for **Native apps** and **Import** under the Help links.

**Pass if:** Every slug in `https://app.warpcad.com/help/index.json` has an `app.warpcad.com/#/help/<slug>` link on the home page (the runner re-compares it if you type "done" in Other).

**Answer:** action

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

#### K7 · Two devices updating one gist 3 s apart keep both edits (real GitHub)

`io-038` (Testing: Real GitHub) · Mac, two browser windows · 10 min · filed 2026-11-19

**Steps:** 1. Say `/owner K7`: the runner builds and serves the production bundle locally (the `run-warpcad` skill) and gives you the URL. Agents may not touch real GitHub, so the rest is yours. 2. Open the URL in a normal Chrome window (**A**) and in a Chrome Incognito window (**B**), so the two have separate storage. 3. In A: File ▾ → connect GitHub for short links with a fine-grained token that has only **Gists: read and write**. Place a cuboid and a sphere. Share → **Publish to a gist** (secret). Then File ▾ → **Download copy**. 4. In B: File ▾ → **Open…** the downloaded file, and connect the same token. 5. In B: place a cylinder, Share → **Update gist**, and wait for *Gist updated*. 6. Within 3 seconds, in A: place a cuboid, Share → **Update gist**. 7. Open the gist on github.com: count the bodies in its project file, and look at its Revisions tab.

**Pass if:** A shows *Merged 1 step from the gist* and then *Gist updated* (or the sentence *Another device updated this gist a moment ago. Update gist again to merge its changes.*, and a second **Update gist** then merges), never *Gist updated* with no merge. The gist's project file holds four bodies, B's cylinder among them. In Other, say how many revisions A's Update added after B's: **one** means GitHub's authenticated read was fresh (fix 1 alone works); **two** means the read was stale and the write-then-merge safety net fired. Afterwards: Share → **Stop sharing** in A (deletes the gist), and delete the token.

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
