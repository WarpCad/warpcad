# TODO/ROADMAP.md — Remaining Work

Only what is still open. Everything finished is in [TODO/ROADMAP-DONE.md](ROADMAP-DONE.md). This file is the source
`/run-todos` reads for order, and the table `/fix-todo` edits when a task opens, closes or changes priority.

**Snapshot:** 2026-11-19. Counts are in the [Status summary](#status-summary) at the foot of this file.

> **What do I run next?** `/run-todos` runs **two tables, top to bottom: [M19](#m19--native-ios-app-tauri), then
> [Findings](#findings-open-rows)**. Together they are in the same order as [Next up](#next-up--recommended-todos). M19 rows
> work in `../warpcad-native` and are never pushed (owner, 2026-11-15). Everything else here is held, deferred or reserved, and
> held or deferred work is written as a list, not a table, so the runner cannot pick it up. `⏳ Waits on N` means row N
> has to land first. Run `/fix-todo <id>` for one task, or `/loop /run-todos` to work down the table.
> **Filenames name the milestone, not the order.** `ls TODO` groups the backlog as `FIND-…` (the Findings table) and
> `DEFER-…` (parked); the native `M19-…` files are in `warpcad-native/TODO/`. The ranked order lives only in Next up.

> **What needs you is in [`TODO/OWNER.md`](OWNER.md)**, sorted quickest first, and `/owner` walks it. Nothing that
> needs the owner is tracked anywhere else. Rows below that wait on one of its items say which.

## Contents

- [Next up — recommended TODOs](#next-up--recommended-todos)
- [Held — not run by /run-todos](#held--not-run-by-run-todos)
- [Decided 2026-10-24 and still waiting on you](#decided-2026-10-24-and-still-waiting-on-you)
- [All open work](#all-open-work)
- [Open milestones](#open-milestones)
  - [M19 — Native iOS app (Tauri)](#m19--native-ios-app-tauri)
  - [M18 — Launch (owner steps only)](#m18--launch-owner-steps-only)
  - [M15 — A mergeable project file (reserved rows)](#m15--a-mergeable-project-file-reserved-rows)
  - [Findings (open rows)](#findings-open-rows)
- [Open work outside any milestone](#open-work-outside-any-milestone)
- [Keeping this file up to date](#keeping-this-file-up-to-date)
- [Status summary](#status-summary)
- [How to read this file](#how-to-read-this-file)

---

## Next up — recommended TODOs

*Reordered 2026-11-13 for one unattended `/loop /run-todos` run of 34 tasks, with the owner's answers given beforehand (below).
Before that 2026-11-12 (signing setup cleared), 2026-11-11 (renumbered as one queue), 2026-11-10 (architecture-audit rows added);
the full history is in git.*

**Decided 2026-11-13 (owner, asked before the run):**

1. **One batch for the whole run.** `TODO/BUDGET.md` Config: batch size 40, 24 h cap. The loop stops only on a failure.
2. **A failed task is stashed and skipped**, not a stop: its work goes to a named `git stash`, its row here gets ⚠, and the run
   continues with tasks that don't depend on it. Two failures in a row stop the loop. Rule in `TODO/BUDGET.md` Config.
3. **Screws, threads and gears stay deferred**: `core-065`, `core-074`, `ui-080` and the seven M11 rows are renamed `DEFER-…`
   and listed under [Deferred](#open-work-outside-any-milestone), out of every table the runner reads.
4. **`testing-032` runs in the loop**, with `claude -p` on the owner's subscription (`testing-022` ran the same way and is closed).
5. **`testing-026` (closed 2026-11-17) and `testing-027` are held** (setup still missing; see [Held](#held--not-run-by-run-todos)).
6. **`testing-033` is held** and run by hand, because its job is to ask questions. *(Superseded 2026-11-17: split. Its drafting half runs in the loop as row 80, and the asking is `/owner`.)*
7. **Nothing native is pushed**, to GitHub or the App Store. Every M19 row is held. *(Relaxed 2026-11-15, below.)*

**Decided 2026-11-15 (owner):** "Continue adding things, but do not push the native repo yet. Test on this mac or iPad (it
should work now)." The 11 local M19 rows (67–77) are back in the queue and run first; every row that uploads, publishes or
waits on one stays held. Rows that collide with another session's uncommitted edits in this repository (`ui-108`, `ui-122`,
`ui-123`, `testing-038`, `ui-126`, and `ai-038`, since closed) were parked ⚠ until those edits were committed. They were
(`87398c2f`, the six styles), so the rows were unparked the same day. The stash-on-failure rule in `TODO/BUDGET.md` now
stashes only the failed task's own paths.

**Decided 2026-11-17 (owner, in `/whats-next`):** commit the 7 uncommitted files (`TODO/BUDGET.md`, `TODO/OWNER.md`, `TODO/VERIFY.md`, `docs/user-library.md`, `docs/webmcp.md`, `chat/bluesky-posts.md`, `chat/linkedin-posts.md`) as bookkeeping with `/commit`, before the runner resumes. Nothing is pushed. Committed the same day (`testing-044` step 0). No reason beyond the recommendation was given.

**Decided 2026-11-19 (owner):** "I want a way to select one of the themes in the ui." Filed as `ui-151` and run first in the Findings queue (closed 2026-11-19: `File ▾ → Appearance…`). The picker already existed at the bottom of the Help sheet, but only once a Help page had loaded, and no e2e spec chose a style.

**Order, and why.** The 2026-11-13 run closed every row from 1 to 35 except `perf-004` (parked on an owner question) and
`ui-108`; the numbers of the rows that closed are gone. What is left is the three
follow-ups the closed theme chain filed (36–38), then the findings the VERIFY.md drives filed, in the order they were filed
(43–66). Row numbers are stable ids, not positions: a gap means a row closed.
**Opus tasks** (each splits into an Opus half and a Sonnet half): none open.
**New findings a task files** get a Findings row at the bottom of the table and the next free Next up number, unless the owner re-ranks them.

| # | State | Milestone | Task | Model |
|---|---|---|---|---|
| [M19](#m19--native-ios-app-tauri) | 0 queued + 16 held | `testing-037` closed by owner decision 2026-11-16 and `io-035`/`io-036` are done, so the runner has no local native row left. Never push `warpcad-native`; nothing to App Store Connect. |
| [Findings](#findings-open-rows) | 13 queued (all ready) + 1 held + 1 running | The runner's queue, led by `testing-045`. Running in the desktop app: `testing-028`. Held: `testing-027` (unblocks itself if `testing-028` finds the iOS 26.0 switch: `build-034` #1, handed over from `testing-044`). |
| 81 | ▶ Ready | `FIND` | [`testing-045`](FIND-testing-045-drive-github-gist-and-repo-checks.md) Gist and hosted-save checks against real GitHub, with the owner's `gh` login (OWNER.md U1) | sonnet |
| 74 | Closed 2026-11-16 by owner decision (partly run; not in the runner's queue) | `M19` | [`testing-037`](../../warpcad-native/TODO/M19-testing-037-ipad-pass-on-a-locally-installed-build.md) Test the whole app on the iPad from a locally installed build (**owner with the iPad**) | sonnet |
| 97 | ▶ Ready | `FIND` | [`docs-039`](FIND-docs-039-cold-read-gif-remainders-after-docs-038.md) Fix what a fresh cold reader still rated partial after docs-038: resize-fit camera, tour Subtract press, relink History crop, subpart drill-in caption | sonnet |
| 98 | ▶ Ready | `FIND` | [`ui-146`](FIND-ui-146-broken-history-row-one-name-and-visible-repair.md) Give a broken History step one name, one amber treatment and a repair button visible without scrolling | sonnet |
| 99 | ▶ Ready | `FIND` | [`ui-147`](FIND-ui-147-dimension-label-crossed-by-gizmo-rings.md) Keep a dimension label's digits clear of the gizmo rings and arrowheads that cross them | sonnet |
| 100 | ▶ Ready | `FIND` | [`ui-148`](FIND-ui-148-phone-orientation-caps-overlap-and-miss-on-touch.md) Make the phone orientation dial caps tappable without overlap (split from ui-134) | sonnet |
| 101 | ▶ Ready | `FIND` | [`ui-149`](FIND-ui-149-nav-chrome-mode-buttons-real-44px-height.md) Give the navigation chrome's Orbit, Pan, Select and gear buttons real 44 px height by relaxing the ui-043 and ui-084 size budgets (split from ui-135) | sonnet |
| [`ui-150`](FIND-ui-150-sketch-toolbar-overlaps-orientation-gizmo-on-tablet-and-laptop.md) Stop the Sketch toolbar overlapping the orientation gizmo on webkit-tablet and firefox-laptop | finding | medium | sonnet | ▶ Ready (Next up row 102) |
| [`io-039`](FIND-io-039-export-of-an-empty-subtract-result-downloads-nothing-silently.md) Say so when Export is pressed on a Subtract that left nothing | finding | low | sonnet | ▶ Ready (Next up row 103) |
| [`render-009`](FIND-render-009-dense-result-draws-slowly-on-a-software-rasteriser.md) Draw a dense whole-model cut's result as indexed geometry (headless landing about 110 ms) | finding | low | sonnet | ▶ Ready (Next up row 105) |
| [`core-086`](FIND-core-086-send-less-to-the-worker-and-avoid-a-gc-pause-after-the-pack.md) Keep dense operands in the worker so the click sends nothing; check a 1 s GC after the pack | finding | low | sonnet | ▶ Ready (Next up row 106) |
| [`ui-152`](FIND-ui-152-viewport-script-and-pointer-gestures-remainder.md) Take the next three slices out of Viewport.vue's script and pointerGestures.js | finding | low | sonnet | ▶ Ready (Next up row 107) |
| [`ui-153`](FIND-ui-153-cold-read-chrome-partials-after-ui-145.md) Four cold-read items ui-145 improved but a fresh reader still rates partial | finding | low | sonnet | ▶ Ready (Next up row 108) |
| 102 | ▶ Ready | `FIND` | [`ui-150`](FIND-ui-150-sketch-toolbar-overlaps-orientation-gizmo-on-tablet-and-laptop.md) Stop the Sketch toolbar overlapping the orientation gizmo on webkit-tablet and firefox-laptop (pre-existing e2e failure found during io-032) | sonnet |
| 103 | ▶ Ready | `FIND` | [`io-039`](FIND-io-039-export-of-an-empty-subtract-result-downloads-nothing-silently.md) Say so when Export is pressed on a Subtract that left nothing, instead of downloading nothing silently | sonnet |
| 105 | ▶ Ready | `FIND` | [`render-009`](FIND-render-009-dense-result-draws-slowly-on-a-software-rasteriser.md) Draw a dense whole-model cut's result as indexed geometry so a software rasteriser lands it in under 50 ms (real-GPU landing already passes) | sonnet |
| 106 | ▶ Ready | `FIND` | [`core-086`](FIND-core-086-send-less-to-the-worker-and-avoid-a-gc-pause-after-the-pack.md) Keep dense operands in the worker so the click sends nothing, and check a 1 s GC after the pack | sonnet |
| 107 | ▶ Ready | `FIND` | [`ui-152`](FIND-ui-152-viewport-script-and-pointer-gestures-remainder.md) Take the next three slices out of `Viewport.vue`'s script (819 lines) and `pointerGestures.js` (781); the remainder of `ui-144` | sonnet |
| 108 | ▶ Ready | `FIND` | [`ui-153`](FIND-ui-153-cold-read-chrome-partials-after-ui-145.md) Finish the four cold-read items `ui-145` improved but a fresh reader still rates partial (clearance label in the view, Split caption under Apply, Align strip size, Align and Split at a glance) | sonnet |

---

## Held — not run by /run-todos

**Native app (M19), the rows that leave this Mac.** Owner rule 2026-11-13, kept 2026-11-15: nothing for the native app is pushed
yet, to GitHub or to the App Store. The local rows run (owner, 2026-11-15); the held ones are listed under "Still held" in
[M19](#m19--native-ios-app-tauri).

**Findings that wait on one owner item** (each is in [`TODO/OWNER.md`](OWNER.md); `/owner` moves the row into the Findings table when the item is answered):

- [`testing-028`](FIND-testing-028-verify-native-dialog-checks-with-computer-use.md) Native dialogs, the Mac app and the iOS Simulator's own screens, with computer use (5 + 19 rows). **Running 2026-11-17** in the Claude desktop app (OWNER.md U2 done); not in the runner's queue
- [`testing-027`](FIND-testing-027-verify-ios-safari-checks-in-the-simulator.md) iOS Safari checks in the Simulator (34 rows). iOS 27.2 simulators have no Remote Automation switch; `testing-044` installed the iOS 26.0 runtime; `testing-028` (`build-034` #1) opens its Settings › Safari › Advanced and un-holds this row itself if the switch is there

---

- [`testing-043`](../../warpcad-native/TODO/M19-testing-043-verify-warpcad-file-types-on-device.md) Verify the `.warpcad` file types on a real iPad and in Safari, then run the owed acceptance scenarios (10, 22, 23, 28). **Held:** a manual run; filed 2026-11-16 to close `io-035` and `io-036`.

## Decided 2026-10-24 and still waiting on you

**Decided 2026-10-24**

1. **Threads:** `core-074` no longer depends on `core-073`, so the M5 threads pair is ready. The JSCAD V3 family
   (`core-066`–`core-073`) stays deferred.
2. **Push:** `testing-007` is closed (2026-10-26); push `9d0b5de` and `dedfbc0` once a full e2e run is green. Nothing is pushed yet.
3. **Rows:** `ui-079`, `testing-009`, `testing-005` and `testing-010` now have rows in the Findings table, so `/run-todos` reaches them.
4. **Order:** `ui-079` is second in Next up. (Superseded the same day by item 5: M19 now runs first.)
5. **Native iOS app (M19):** built with **Tauri 2, not Capacitor**, overriding the decision record's
   recommendation (`docs/decisions/native-mobile-shell.md`, "Owner decision"); in the sibling repository
   `~/src/@WarpCad/warpcad-native`; bundles the full build; includes local file access and an MCP server inside the
   app. Scheduled first.

**Still waiting on you**

- **For M19 to start `build-019`:** membership and bundle identifier `com.warpcad.app` were cleared 2026-10-31, but **as of 2026-11-08 the owner cannot sign anything yet**. Next up row 7 lists the signing setup. Every device install waits on it; Next up rows 1–7 do not.
  - **Decided 2026-11-12:** the signing setup is done except the Apple Distribution certificate. Done: paid team signed in under Xcode's Apple Accounts, App ID `com.warpcad.app` registered, App Store Connect app record created, iPhone "Socrates" visible to Xcode, Developer Mode on for the iPad (the iPhone's was not confirmed), App Store Connect API key (App Manager) in `~/.private_keys/` (mode 600; key ID kept out of the repo). Not done: the distribution certificate, because Xcode 27's Apple Accounts pane has no Manage Certificates button; `build-019` lets automatic signing create it on the first build and stops with the error if it can't. Row 7 is cleared, so `build-019` is ready.
  - **Superseded 2026-11-13:** `build-019` is held with the rest of M19. Nothing for the native app is pushed yet, to GitHub or the App Store.
- **For M19 to finish `build-020`:** the price amount and countries, and the Part 6 review in `docs/decisions/app-store-licensing.md`. **Decided 2026-11-07:** the owner will not contact a lawyer, so Part 6 has no outside reviewer and stays not done in substance; the store submission is still gated on it as written. Help-content and prose licence are decided (see below). iPad scope and Sentry were decided 2026-11-07 (see `build-020`). The
  submission itself is yours.
  - **Decided 2026-11-07 (in `build-020`):** paid app at one price, age rating 4+. Help GIFs fetched from the web, not bundled. **Decided 2026-11-07:** the app loads all Help from the web and ships none of it (prose licence option (b)). Still open: the price amount and countries, and the Part 6 legal review.

**Decided 2026-11-12:** no workflows run on GitHub. `warpcad-native` gets no remote for now (the question of where to push it is closed by this), and `build-027` keeps only its local half: the `npm run check` script and the `deny.toml` fix. Owner reason: "I don't want any workflows running on github." ~~Not decided: whether to delete the existing `warpcad-native/.github/workflows/windows.yml`, which cannot run without a remote~~ Moot 2026-11-16: `warpcad-native` has no `.github/` directory on any branch, so there is nothing to delete. Still not decided: whether a local `pre-push` hook should stand in for CI.

**Decided 2026-11-12:** push the 20 unpushed commits on `main` after a full unit run and a full e2e run are green on the current HEAD and the three uncommitted doc edits (`TROUBLESHOOTING.md`, `docs/decisions/release.md`, `docs/native-apps.md`) are committed. Pushing still needs the owner's go-ahead at the moment of the push. No reason beyond the recommendation was given.

**Decided 2026-11-13:** push `main` (55 unpushed commits) after the current loop's check-in: commit `ui-113`, run the full unit and full e2e matrix once on the final HEAD, then push, still with the owner's go-ahead at the moment of the push. Supersedes the 2026-11-12 push count of 20. No reason beyond the recommendation was given.

**Deferred 2026-10-27:** start `build-017` (the Tauri scaffold) next? — parked, no decision yet.

**Deferred 2026-10-29:** start `build-017` (the Tauri scaffold) next? — parked, no decision yet.

**Decided 2026-10-31:** start `build-017` now. Run order unchanged (it is already row 1 of Next up).

**Decided 2026-10-31:** bundle identifier `com.warpcad.app` confirmed. The Apple Developer Program membership is not active yet, so `build-019` stays blocked on it.

**Decided 2026-10-31:** the Apple Developer Program membership is now active. The owner step for `build-019` is cleared; `build-019` still waits on `build-017`.

**Deferred 2026-11-02:** where the native app repository (`warpcad-native`) lives. `build-017` assumes `~/src/@WarpCad/warpcad-native`, which is not on this machine — parked, no decision yet.

**Decided 2026-11-07:** create the native repository at `~/src/@WarpCad/warpcad-native`, as `build-017` specifies. The task creates it and stops before any GitHub remote.

- **Owner steps on `build-016`** (dual licence): Part 4 (repository settings) and Part 6 (review) are still open in
  `TODO/VERIFY.md`. The row is marked done, so these are tracked only there.

---

## All open work

Every open task, with where it stands. Only the rows marked ▶ or ⏳ are in the runner's queue (the Findings table).

| Task | Kind | Priority | Model | State |
|---|---|---|---|---|
| [`testing-045`](FIND-testing-045-drive-github-gist-and-repo-checks.md) Gist and hosted-save checks against real GitHub (7 of 9 rows settled; `io-011`, `io-035` #4 left) | finding | medium | sonnet | ▶ Ready (Next up row 81) |
| [`docs-039`](FIND-docs-039-cold-read-gif-remainders-after-docs-038.md) Fix what a fresh cold reader still rated partial after docs-038: resize-fit camera, tour Subtract press, relink History crop, subpart drill-in caption | finding | low | sonnet | ▶ Ready (Next up row 97) |
| [`ui-146`](FIND-ui-146-broken-history-row-one-name-and-visible-repair.md) Give a broken History step one name, one amber treatment and a visible repair button | finding | medium | sonnet | ▶ Ready (Next up row 98) |
| [`ui-147`](FIND-ui-147-dimension-label-crossed-by-gizmo-rings.md) Keep a dimension label's digits clear of the gizmo rings and arrowheads | finding | low | sonnet | ▶ Ready (Next up row 99) |
| [`ui-148`](FIND-ui-148-phone-orientation-caps-overlap-and-miss-on-touch.md) Make the phone orientation dial caps tappable without overlap (split from ui-134) | finding | medium | sonnet | ▶ Ready (Next up row 100) |
| [`ui-149`](FIND-ui-149-nav-chrome-mode-buttons-real-44px-height.md) Give the navigation chrome's Orbit, Pan, Select and gear buttons real 44 px height by relaxing the ui-043 and ui-084 size budgets (split from ui-135) | finding | medium | sonnet | ▶ Ready (Next up row 101) |
| [`testing-027`](FIND-testing-027-verify-ios-safari-checks-in-the-simulator.md) Drive the VERIFY.md iOS Safari behaviour checks in the iOS Simulator | finding | high | sonnet | Held (owner first) |
| [`testing-028`](FIND-testing-028-verify-native-dialog-checks-with-computer-use.md) Drive the VERIFY.md checks blocked on native OS dialogs and private windows, with computer use | finding | medium | sonnet | Running 2026-11-17 in the desktop app |
| [`build-019`](../../warpcad-native/TODO/M19-build-019-ios-signing-and-testflight.md) Signing and a TestFlight build (M19) | feature | high | sonnet | Held (native) |
| [`build-018`](../../warpcad-native/TODO/M19-build-018-tauri-ios-device-probe.md) Measure the app on the iPad; settle the decision record's unknowns (M19) | feature | high | sonnet | Held (native) |
| [`testing-011`](../../warpcad-native/TODO/M19-testing-011-acceptance-scenario-28-ios-app.md) Scenario 28 on the device, then the free-form pass (M19) | feature | high | sonnet | Held (native) |
| [`build-020`](../../warpcad-native/TODO/M19-build-020-app-store-submission-readiness.md) Listing, privacy, licence audits; stops before Submit (M19) | feature | high | sonnet | Held (native) |
| [`io-026`](../../warpcad-native/TODO/M19-io-026-lidar-scan-to-mesh-part.md) Scan an object with the iPad Pro's LiDAR into My parts (1.1) (M19) | feature | medium | opus | Held (native) |
| [`testing-035`](../../warpcad-native/TODO/M19-testing-035-device-checks-from-architecture-audit.md) Check the architecture audit's nine browser assumptions on real web views (M19) | finding | medium | sonnet | Held (native) |
| [`build-030`](../../warpcad-native/TODO/M19-build-030-universal-links-open-share-links-in-the-app.md) Share links open in the installed app (universal links; 1.1) (M19) | feature | medium | sonnet | Held (native) |
| [`testing-037`](../../warpcad-native/TODO/M19-testing-037-ipad-pass-on-a-locally-installed-build.md) Test the whole app on the iPad from a locally installed build, before any push or upload (M19) | feature | high | sonnet | Closed 2026-11-16 by owner decision: partly run, 8 checks to be filed as rows |
| [`build-036`](../../warpcad-native/TODO/M19-build-036-macos-distribution.md) Mac app: entitlements, hardened runtime, signing, notarized or Mac App Store build (M19) | feature | medium | sonnet | Held (native) |
| [`build-037`](../../warpcad-native/TODO/M19-build-037-android-play-store-readiness.md) Android app: manifest, backups, credentials, signing, Play internal testing (M19) | feature | low | sonnet | Held (native) |
| [`build-038`](../../warpcad-native/TODO/M19-build-038-windows-distribution.md) Windows app: build, sign, test, choose a store (M19) | feature | low | sonnet | Held (native) |
| [`ai-042`](../../warpcad-native/TODO/M19-ai-042-mcp-loopback-token-on-mobile.md) Require the MCP token for loopback peers on iOS and Android (M19) | finding | medium | opus | Held (native) |
| [`testing-043`](../../warpcad-native/TODO/M19-testing-043-verify-warpcad-file-types-on-device.md) Verify the `.warpcad` file types on a real iPad and in Safari, then scenarios 10, 22, 23, 28 (M19) | finding | medium | sonnet | Held (device) |
| [`build-040`](../../warpcad-native/TODO/M19-build-040-help-has-no-version-line-on-the-ipad.md) Help has no version line on the iPad (M19) | finding | low | sonnet | Held (native) |
| [`io-034`](../../warpcad-native/TODO/M19-io-034-ipad-files-does-not-offer-warpcad-for-ndjson.md) Files does not offer WarpCad for `.ndjson` on the iPad (M19) | finding | medium | sonnet | Held (native) |
| [`ai-043`](../../warpcad-native/TODO/M19-ai-043-live-mcp-access-does-not-start-on-the-ipad.md) Live MCP access does not start on the iPad (M19) | finding | medium | sonnet | Held (native) |
| [`build-041`](../../warpcad-native/TODO/M19-build-041-mac-icon-mark-too-small-in-the-tile.md) The cube mark in the macOS icon reads small in the Dock (M19) | finding | low | sonnet | Held (native) |
| [`core-065`](DEFER-core-065-wood-screw-holes-cite-asme-not-albany.md) Wood-screw hole table cites ASME B18.6.1 instead of Albany County Fasteners' chart (was M18) | finding | high | sonnet | Deferred 2026-11-07 |
| [`core-074`](DEFER-core-074-thread-geometry-recipes.md) Real helical threads: external and internal thread generator (was M5) | feature | medium | opus | Deferred 2026-11-07 |
| [`ui-080`](DEFER-ui-080-threads-library-section-and-inspector.md) Threads section in the Library, drag-to-place, Inspector fields (was M5) | feature | medium | sonnet | Deferred 2026-11-07 |
| [`core-048`](DEFER-core-048-gear-hub-bore-keyway-and-set-screw.md) Gear hubs, bores, D-flats, keyways and set-screw holes (was M11) | feature | medium | sonnet | Deferred 2026-11-07 |
| [`core-049`](DEFER-core-049-planetary-gear-set.md) Planetary gear set (was M11) | feature | low | opus | Deferred 2026-11-07 |
| [`core-062`](DEFER-core-062-herringbone-relief-groove.md) Herringbone relief groove (was M11) | feature | low | sonnet | Deferred 2026-11-07 |
| [`ui-057`](DEFER-ui-057-gears-library-section-and-inspector.md) Gears section in the Library, drag-to-place, parametric Inspector (was M11) | feature | high | sonnet | Deferred 2026-11-07 |
| [`ui-058`](DEFER-ui-058-gear-mesh-operation.md) Mesh operation for two gears (was M11) | feature | high | opus | Deferred 2026-11-07 |
| [`testing-002`](DEFER-testing-002-acceptance-scenario-19-gear-train.md) Acceptance scenario 19, the gear train (was M11) | feature | medium | sonnet | Deferred 2026-11-07 |
| [`docs-021`](DEFER-docs-021-media-gears-and-porting-guide.md) Gear docs media and a "porting a jscad-gears script" guide (was M11) | feature | low | sonnet | Deferred 2026-11-07 |
| `data-012` Tombstone and position-key compaction (`data-011` measured the section at 34-43% of an edited file) | reserved | — | — | 📝 no file yet |
| `io-013` Import another project's bodies into this one (id remap) | reserved | — | — | 📝 no file yet |
| `ai-019` Standalone live-bridge host: `mcp/server.js --live` over a loopback WebSocket | reserved | — | — | 📝 no file yet |
| `ai-018` Relax `ai-012`'s one-writer refusals now that a merge exists | reserved | — | — | 📝 no file yet |

---

## Open milestones

[↑ Contents](#contents)

M18 has only owner steps and M15 has only reserved ids, so `/run-todos` works from two tables: M19's local rows, then Findings.
M20 is done ([ROADMAP-DONE.md](ROADMAP-DONE.md#m20--home-page-at-warpcadcom)). The open rows of M5, M11 and M18 were deferred on 2026-11-07 and are listed
under [Deferred](#open-work-outside-any-milestone).

### M19 — Native iOS app (Tauri)

[↑ Contents](#contents)

> **Widened 2026-10-26: targets are iOS, iPadOS, macOS, Android and Windows.** `build-017` scaffolds all five
> and ends by **moving every native-app TODO (`build-018`–`build-020`, `render-006`, `io-014`, `io-015`, `ai-025`,
> `ai-026`, `testing-011`) into `warpcad-native/TODO/`**; this section then shrinks to a pointer to
> `~/src/@WarpCad/warpcad-native/TODO/ROADMAP.md`. The rows below keep their iOS wording until that move; the
> per-platform follow-ups are filed there, since 2026-11-13: `build-036` (macOS), `build-037` (Android, Play) and `build-038` (Windows).

Added 2026-10-24 at the owner's request, scheduled first. The owner's goal is a native iOS app, working and ready to
publish, this weekend. It is built with **Tauri 2**, overriding the Capacitor recommendation in
`docs/decisions/native-mobile-shell.md` (see its "Owner decision" section for what changes). It lives in the
**sibling repository `~/src/@WarpCad/warpcad-native`**, which bundles this repository's `npm run build:native`
output. So most rows change **both repositories**: commit each one separately, and retire the row in this repository's
commit. The new repository has no pre-push gate of its own; its gates are `cargo fmt`, `clippy` and `cargo deny`
(`build-017`).

Playwright cannot drive a WKWebView inside an app. Each row's `*.e2e.js` runs at `/` with a fake Tauri boundary
(`e2e/fixtures/nativeShell.js`, `build-017`), and each row is checked on the macOS shell and the iOS simulator, which need no signing. **The device checks for
`render-006`, `io-014`, `io-015`, `ai-025` and `ai-026` are all in scenario 28** (`testing-011`, steps 3–9), so those
rows close without a device.
Scenario 28 (`testing-011`) is the one acceptance check only the device can pass.

**Filed 2026-11-13 from the native audit** (code, TODO files and release path, read on `probe/io-026` and `main`). The
order to run them, and the gates for the iPad test, the GitHub push and each store, are in
[`RELEASE-CHECKLIST.md`](../../warpcad-native/TODO/RELEASE-CHECKLIST.md). **The owner reordered M19 the same day:** the first device install is a
local build over the cable (`testing-037`), then GitHub, then App Store Connect. That supersedes the "Order" list below.

> **Decided 2026-11-16 (owner):** "I'm at the ipad now." `testing-037` (the local iPad pass) is unparked and ready. Its install and
> checklist run are for a `/fix-todo testing-037` session with the owner present; the pass ran that day (22 of 33 checks passed; 3 failed, filed as `build-040`, `io-034` and `ai-043`; 8 not run).
> **Decided 2026-11-16 (owner):** close now, file the rest. `testing-037` is out of the runner's queue. Its `status:` field closes through `/fix-todo testing-037`. The 8 unrun checks (D4, E6, F2 to F5, G, H) are to be filed as their own rows, not yet filed.
>
> **Decided 2026-11-17 (owner, in `/whats-next`):** commit the three filed rows (`build-040`, `io-034`, `ai-043`) and the `testing-037` status edit in `warpcad-native`. Leave `scripts/ios-release.sh`, the Xcode project, `Info.plist` and `src-tauri/plugins/` uncommitted: their origin is not yet known. Committed in `warpcad-native` as `725aad7`; those four paths are still uncommitted.
>
> **Decided 2026-11-17 (owner, in `/whats-next`):** file the eight unrun iPad checks (D4, E6, F2 to F5, G, H) now as held rows in `warpcad-native`. Superseded by the owner-queue triage below: no row files were written.
>
> **2026-11-17 (owner-queue triage):** the eight checks are items in `TODO/OWNER.md` instead of separate row files: H → I5, F2-F5 → I9-I12 (wait on `ai-043`), G → I13 (waits on the probe build), D4 → W1 (overnight), E6 → Z1 (parked, API key). The bookkeeping commit above is `testing-044` step 0.
>
> **Decided 2026-11-15 (owner):** "Continue adding things, but do not push the native repo yet. Test on this mac or
> iPad (it should work now)." So the local rows below are back in the runner's queue: Gate 0 of
> [`RELEASE-CHECKLIST.md`](../../warpcad-native/TODO/RELEASE-CHECKLIST.md), the local iPad pass (`testing-037`) and three
> local follow-ups. **Never push `warpcad-native`**, and nothing goes to App Store Connect (the checklist puts every store
> build after the GitHub push, Gate 2). Supersedes the 2026-11-13 hold for these rows only. The runner reads this table before
> Findings, so these run first. A `/fix-todo` agent works in `warpcad-native` for these and commits there; it never pushes.

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `testing-037` | Test the whole app on the iPad from a locally installed build (over the cable; nothing uploaded). **Needs the owner with the iPad**: the agent installs and stops for the pass | Finding | — | 28 (local build) |

**Still held** (a list, so the runner cannot pick them up). Each contacts something outside this Mac, or waits on a row that does:

- [`build-019`](../../warpcad-native/TODO/M19-build-019-ios-signing-and-testflight.md) Signing and a TestFlight build. **Held:** uploads to App Store Connect.
- [`build-018`](../../warpcad-native/TODO/M19-build-018-tauri-ios-device-probe.md) Measure the app on the iPad; settle the decision record's unknowns. **Held:** needs the device in hand (probe branch `probe/build-018`, runbook `PROBE-build-018.md`).
- [`testing-011`](../../warpcad-native/TODO/M19-testing-011-acceptance-scenario-28-ios-app.md) Scenario 28 on the device, then the free-form pass. **Held:** needs the device and a human.
- [`build-020`](../../warpcad-native/TODO/M19-build-020-app-store-submission-readiness.md) Listing, privacy, licence audits; stops before Submit. **Held:** App Store work; waits on `build-019`, `testing-011` and the Part 6 legal gate.
- [`io-026`](../../warpcad-native/TODO/M19-io-026-lidar-scan-to-mesh-part.md) Scan an object with the iPad Pro's LiDAR into My parts (1.1). **Held:** needs the device (probe branch `probe/io-026`, runbook `PROBE-io-026.md`).
- [`testing-035`](../../warpcad-native/TODO/M19-testing-035-device-checks-from-architecture-audit.md) Check the architecture audit's nine browser assumptions on real web views. **Held:** needs a person driving the macOS shell's web view (Playwright cannot) and publishes a real gist.
- [`build-030`](../../warpcad-native/TODO/M19-build-030-universal-links-open-share-links-in-the-app.md) Share links open in the installed app (universal links; 1.1). **Held:** waits on `build-019` and publishes a hosted file with the team ID.
- [`build-040`](../../warpcad-native/TODO/M19-build-040-help-has-no-version-line-on-the-ipad.md) Help has no version line on the iPad (Gate 1 check A2). **Held:** filed 2026-11-16; the owner has not ranked it yet.
- [`io-034`](../../warpcad-native/TODO/M19-io-034-ipad-files-does-not-offer-warpcad-for-ndjson.md) Files does not offer WarpCad for `.ndjson` on the iPad (Gate 1 check C4). **Held:** filed 2026-11-16; same root cause as `io-030`, so it waits for that.
- [`ai-043`](../../warpcad-native/TODO/M19-ai-043-live-mcp-access-does-not-start-on-the-ipad.md) Live MCP access does not start on the iPad (Gate 1 check F1). **Held:** filed 2026-11-16; needs a device re-check, and F2 to F5 are blocked by it.
- [`build-036`](../../warpcad-native/TODO/M19-build-036-macos-distribution.md) Mac app: sandbox entitlements, hardened runtime, signing, Mac App Store build. **Held:** Decided 2026-11-13: Mac App Store; after the iOS submission.
- [`build-037`](../../warpcad-native/TODO/M19-build-037-android-play-store-readiness.md) Android app: manifest, backups, credentials, signing, Play internal testing. **Held:** After the iOS submission; needs a Play account.
- [`build-038`](../../warpcad-native/TODO/M19-build-038-windows-distribution.md) Windows app: build, sign, test, choose a store. **Held:** After the iOS submission; needs a Windows machine.
- [`ai-042`](../../warpcad-native/TODO/M19-ai-042-mcp-loopback-token-on-mobile.md) Require the MCP token for loopback peers on iOS and Android. **Held:** waits on `build-018` item 10 (on a device); split from `ai-036` item 5, 2026-11-15.

**Order (reordered 2026-11-08: the owner cannot sign yet, so no device install is possible until the signing gate).**

1. **On this Mac, no signing:** `build-017` → `render-006` → `io-015` → `ai-025` → `ai-026` (and `build-024`, done 2026-11-12). Each is checked on the macOS shell and the
   iOS simulator. `render-006` and `ai-025` do not depend on each other.
2. **The signing gate (owner):** the setup listed in `build-019` and in Next up row 7.
3. **On the iPad, then the iPhone (reordered 2026-11-13):** the first install is the local build over the
   cable, `testing-037` (**stop for the owner at the iPad**), before any push or upload. The GitHub push follows,
   then `build-019` (the upload, from TestFlight) → `build-018` (measure it; a contradicting
   answer files a finding against rows 2–6) → `testing-011` (**stop for the five-minute free-form pass**) →
   `build-020` (**stop for the owner's legal review and Submit**). `io-026` comes after that, as a 1.1 feature.
   The order of the gates is in `warpcad-native/TODO/RELEASE-CHECKLIST.md`.

**If time runs short**, the cut line that still gives a publishable app is: `build-017`, `render-006`,
then the signing gate, `testing-037` (the local install on the iPad), `build-019`, `build-018`, `testing-011` (with steps 7 and 8 marked not driven) and
`build-020`. `io-015`, `ai-025` and `ai-026` can follow in a 1.1 update.

### M18 — Launch (owner steps only)

[↑ Contents](#contents)

The launch is live at `app.warpcad.com`. Seven of the eight rows are done (see
[ROADMAP-DONE.md](ROADMAP-DONE.md#m18--launch-publish-appwarpcadcom-sentry-and-ga)). Its last task row, `core-065`, was deferred with the other screw work on 2026-11-07 (see [Deferred](#open-work-outside-any-milestone)).
What remains is yours:

**Owner steps still open**

- **GA** (`TODO/VERIFY.md`, `build-007` rows 3–6): `GA_MEASUREMENT_ID` is set (`G-JFYXCZJ1HN`). Turn **Enhanced
  measurement OFF**, then check Realtime and DebugView show one page view with no `#` in the path, and the
  console is clean.
- **Close** (step 11): open `https://app.warpcad.com`, check the Help version line shows the deployed commit, and
  check the console has no CSP error naming a Sentry or Google host. Then M18 is complete.

No free-form pass is owed for M18: the 2026-10-17 decision records the owed passes as done.

### M15 — A mergeable project file (reserved rows)

[↑ Contents](#contents)

Seven rows are done (see [ROADMAP-DONE.md](ROADMAP-DONE.md#m15--a-mergeable-project-file-the-ai-as-a-second-writer)).
The four reserved rows below have no task file yet. Each becomes its own `/fix-todo`-sized task when it is worked.

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `data-012` | *(reserved)* Tombstone and position-key compaction, once `data-011` has measured real file growth | Core | `data-011` | 10 |
| `io-013` | *(reserved; was `io-012` until 2026-10-17)* Import another project's bodies into this one (id remap), the case `ui-062` refuses as "a different project" | Creation | `ui-062` | new |
| `ai-019` | *(reserved)* Standalone live-bridge host: `mcp/server.js --live` with a loopback WebSocket (`ws` 8.x, health check re-run) for a built or hosted app, Chromium/Firefox only (WebKit measured blocked) | Control | `ai-012` | live-bridge scenario |
| `ai-018` | *(reserved)* Relax `ai-012`'s one-writer refusals ("the user is editing; try again") now that a merge exists | Control | `ai-012`, `ai-017` | live-bridge scenario |

### Findings (open rows)

[↑ Contents](#contents)

**This is the runner's queue.** Rows are in run order, the same order as Next up. Open findings that belong to no single milestone. Closed findings are in
[ROADMAP-DONE.md](ROADMAP-DONE.md#findings). `/fix-todo` Step 8 marks rows here the same way as a milestone table.

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `testing-045` | Gist and hosted-save checks against real GitHub (9 VERIFY.md rows), with the owner's `gh` login: secret gists and a private `warpcad-scratch` repo, all deleted after. Un-held 2026-11-17 by OWNER.md U1 | Finding | — | none |
| `docs-039` | The `docs-038` cold read left resize-fit UNCLEAR and tour, timeline-relink and boolean-subpart-operand PARTIAL (camera reframes, press between samples, History cropped, drill-in uncaptioned). Filed 2026-11-19 | Finding | — | none |
| `ui-146` | The broken History row's layout half from `ui-129`: one name, one amber treatment, the repair button visible without scrolling. Filed 2026-11-18 | Finding | — | 12, 15 |
| `ui-147` | A ring or arrowhead still crosses a dimension label's digits at phone width, split from `ui-130`. Filed 2026-11-18 | Finding | — | 1 |
| `ui-148` | The 96px phone orientation dial still overlaps its caps (22-35% of scattered taps hit a neighbour, 390px); split from `ui-134`, which fixed tablet. Filed 2026-11-18 | Finding | — | 1 |
| `ui-149` | The Orbit, Pan and Select buttons are still 30-32 px tall (wrong-control taps 4-8 %, target 2 %); real 44 px needs the `ui-043` toolbar-overlap and `ui-084` compact-size budgets relaxed. Split from `ui-135`. Filed 2026-11-18 | Finding | — | 7 |
| `ui-150` | The Sketch toolbar overlaps the orientation gizmo on webkit-tablet and firefox-laptop; `sketch-primitive.e2e.js:533` fails on plain HEAD. Filed 2026-11-18 | Finding | — | 102 |
| `io-039` | Export of a Subtract that left nothing (an STL in inches imported as mm) downloads nothing and shows no error; same at HEAD. Filed 2026-11-18 | Finding | — | 11, 26 |
| `render-009` | A dense whole-model cut's result lands in about 110 ms headless (non-indexed mesh, 660 k vertices for 220 k triangles on a software rasteriser); real GPU passes 50 ms (filed 2026-11-19 from core-085) | Finding | — | 1, 26, 31 |
| `core-086` | The whole-model cut still sends every operand triangle each click, and one headless run paused 1 s in a GC after the pack (filed 2026-11-19 from core-085) | Finding | — | 26, 31 |
| `ui-152` | `Viewport.vue`'s script is still 819 lines and `pointerGestures.js` 781 after `ui-144`'s three slices (filed 2026-11-20 as its remainder) | Finding | — | 1, 4, 6, 7, 9 |
| `ui-153` | Four cold-read items `ui-145` improved but a fresh reader still rates partial (clearance label, Split caption, Align strip size, Align and Split glyph size). Filed 2026-11-20 | Finding | — | 4, 5 |

---

## Open work outside any milestone

Items that are open but have no row in a milestone table, or are not live work yet. `/run-todos` does not reach the
first group, so each one needs a row before it can be scheduled.

**Open files with no roadmap row:** none. (`core-075` and `io-016` got their Findings rows on 2026-10-26.)

The four that lacked a row on 2026-10-24 (`ui-079`, `testing-009`, `testing-005`, `testing-010`) now have Findings rows.

**Deferred, not scheduled**

- **Screws, threads and gears** (deferred 2026-11-07, confirmed 2026-11-13). Parked, no decision yet on when they resume. Gear
  work was the M11 milestone; `core-065` was M18's last row. `core-065` stops to ask if ASME B18.6.1 lacks a column, so answer that
  first when it is unparked.
  - [`core-065`](DEFER-core-065-wood-screw-holes-cite-asme-not-albany.md) Wood-screw hole table cites ASME B18.6.1 instead of Albany County Fasteners' chart (was M18)
  - [`core-074`](DEFER-core-074-thread-geometry-recipes.md) Real helical threads: external and internal thread generator (was M5)
  - [`ui-080`](DEFER-ui-080-threads-library-section-and-inspector.md) Threads section in the Library, drag-to-place, Inspector fields (was M5)
  - [`core-048`](DEFER-core-048-gear-hub-bore-keyway-and-set-screw.md) Gear hubs, bores, D-flats, keyways and set-screw holes (was M11)
  - [`core-049`](DEFER-core-049-planetary-gear-set.md) Planetary gear set (was M11)
  - [`core-062`](DEFER-core-062-herringbone-relief-groove.md) Herringbone relief groove (was M11)
  - [`ui-057`](DEFER-ui-057-gears-library-section-and-inspector.md) Gears section in the Library, drag-to-place, parametric Inspector (was M11)
  - [`ui-058`](DEFER-ui-058-gear-mesh-operation.md) Mesh operation for two gears (was M11)
  - [`testing-002`](DEFER-testing-002-acceptance-scenario-19-gear-train.md) Acceptance scenario 19, the gear train (was M11)
  - [`docs-021`](DEFER-docs-021-media-gears-and-porting-guide.md) Gear docs media and a "porting a jscad-gears script" guide (was M11)

- The JSCAD V3 family: [`core-066`](DEFER-core-066-switch-kernel-to-jscad-v3.md) through
  [`core-073`](DEFER-core-073-jscad-v3-land-the-switch.md). Each file says deferred until the owner chooses the switch.
  See decision 2 above.
- [`io-025`](DEFER-io-025-read-step-directly.md) Read STEP files directly, after `io-024`. Parked 2026-11-02 at the owner's
  choice: every ready-made reader is LGPL, so it starts with an owner decision on the licence.
- [`testing-006`](DEFER-testing-006-redrive-connected-scenarios-with-phone-header-entry.md) Hand-drive scenarios 24, 25 and the `ui-071` repro on the phone header entry. Parked 2026-11-07 due to cost: scenario 24 needs a real Anthropic API key, which bills against purchased tokens.

**Owed**

- Owner steps for `build-016` (Parts 4 and 6), in `TODO/VERIFY.md`.
- Owner checks for `build-007` (GA) and the M18 close, above.
- Held rows: the 11 M19 rows that leave this Mac and five findings, in [Held](#held--not-run-by-run-todos).
- **M19 free-form pass:** `testing-037` (row 74) is the owner's iPad pass on a local build; the loop stops for it.
- **Free-form passes:** none owed. The 2026-10-17 decision records the M5–M10, M12, M16 and M17 passes as done.
  The next one falls due when the next milestone completes. M19's is `testing-037` on the iPad (row 74), then `testing-011` on the iPad and the iPhone.

---

## Keeping this file up to date

This file holds only open work, so a row moves out of it when it closes:

**When a task finishes** (`/fix-todo` Step 8 does all of this in the same commit)

0. `git mv` the file out of `TODO/` into `TODO/done/` **and drop its milestone prefix**
   (`TODO/M19-build-017-x.md` → `TODO/done/build-017-x.md`). Links into `done/` never carry a prefix.
1. Move the task's row from its milestone table here to [ROADMAP-DONE.md](ROADMAP-DONE.md), in that file's
   milestone section, with the ✅ prefix.
2. Append the Completion Log row to the bottom of [ROADMAP-DONE.md](ROADMAP-DONE.md).
3. Delete the row from **All open work** and from **Next up**, if it was listed there.
   Then drop its row number from every `⏳ Waits on …` cell in Next up and in Findings (a cell left empty becomes
   `▶ Ready`). Row numbers are what those cells point at, so a deleted row leaves them stale.
4. Find what it unblocked: any open file whose `depends:` ids all have a file in `TODO/done/` is now ready. Change
   its State cell to `▶ ready`, and give it a row in Next up if it outranks what is there.
5. Bump the milestone's count in the Status summary. When the last open row of a milestone closes, move the
   milestone's heading and its remaining prose to ROADMAP-DONE.md, and note any owed human pass under
   [Owed](#open-work-outside-any-milestone).

**When a task is added or re-prioritised**

1. Write `TODO/<MILESTONE>-<id>-<slug>.md` with the usual front matter (`priority`, `milestone`, `depends`, `status`,
   `model`). `<MILESTONE>` is `M19` (in `warpcad-native`), `FIND` (Findings table) or `DEFER`; older prefixes (`M05`, `M11`, `M18`, `M20`) apply if those milestones reopen
   (see [TODO/README.md](README.md#naming-convention)). If a task changes milestone, `git mv` it to the new prefix and fix
   every link to it in the same commit.
2. Add a row to its milestone table here, or to **Findings** if it has none. A file with no row is invisible to
   `/run-todos`. A held or deferred task is written as a list item, never a table row, so the runner cannot reach it.
3. Add or edit its row in **All open work**, and re-rank Next up if the priority changed.

**Rules for the summary rows**

- One line, under ~200 characters. Counts and what is left, never the story of how it was built. That belongs in
  the task's retirement note and its Completion Log row.
- Counts come from the tables, not from memory: count the open rows here. `npm run roadmap:check` enforces the Findings
  counts and that Next up and the Findings table list the same ready ids; it runs in `.githooks/pre-push` too.
- Bump the **Last reviewed** date in Next up whenever you re-rank it.

**Spot check** (finds open files with no row in either roadmap file; expect only `core-067`–`core-072`, which the deferred JSCAD V3 range above names without listing each)

```sh
for f in TODO/*-[a-z]*-[0-9]*.md; do id=$(basename "$f" | grep -oE '^[A-Z0-9]+-[a-z]+-[0-9]+[a-z]?' | sed -E 's/^[A-Z0-9]+-//'); \
  grep -q "\`$id\`" TODO/ROADMAP.md TODO/ROADMAP-DONE.md || echo "missing from ROADMAP: $id"; done
```

---

## Status summary

One line per milestone. Closed milestones are listed in [ROADMAP-DONE.md](ROADMAP-DONE.md).

| Milestone | Open rows | What is left |
|---|---|---|
| [Findings](#findings-open-rows) | 13 queued + 1 held | 13 ready for `/run-todos`, `testing-045` first; `testing-027` held; `testing-028` running in the desktop app. |
| [M19 — Native iOS app](#m19--native-ios-app-tauri) | 0 queued + 16 held | `io-030`, `io-035`, `io-036` done; their device checks are `testing-043`. `testing-037` closed by owner decision 2026-11-16 (partly run). Held (they upload, publish, need a device or wait on a row that does): `build-018`–`build-020`, `build-030`, `build-036`–`build-038`, `build-040`, `build-041`, `ai-042`, `ai-043`, `io-026`, `io-034`, `testing-011`, `testing-035`, `testing-043`. |
| [M18 — Launch](#m18--launch-owner-steps-only) | owner steps | GA checks and the close check. `core-065` deferred. |
| [M15 — Mergeable project file](#m15--a-mergeable-project-file-reserved-rows) | 4 reserved | `data-012`, `io-013`, `ai-018`, `ai-019`. No task files yet. |
| Deferred | 10 + JSCAD V3 + 2 | Screws, threads and gears (`core-065`, `core-074`, `ui-080`, seven ex-M11 rows); the JSCAD V3 family; `io-025`; `testing-006`. |
| Outside milestones | owed only | `build-016` owner steps. |

---

## How to read this file

- **A file's name starts with its milestone** (`M19-build-017-…`, `FIND-ui-090-…`), so `ls TODO` groups the backlog.
  That is grouping only: the order to work in is **Next up** at the top of this file.
- Each milestone is a table. A row is either an **open task** (a link to a written `TODO/<id>.md`) or a **reserved
  id** (no file yet, named here so dependency order and numbering are fixed). Closed rows are in
  [ROADMAP-DONE.md](ROADMAP-DONE.md).
- **Kind** marks Creation vs. Operation per `CLAUDE.md`'s non-negotiable split. Never mixed in one control, never
  one dropdown.
- **Acceptance** names which `Initial design.md` §9 / `TODO/ACCEPTANCE.md` scenario the row plausibly affects, so
  every `/fix-todo` run knows what to re-drive.
- Milestones were grouped by distinct interaction pattern, not by literal catalog row. See the granularity decision
  in [ROADMAP-DONE.md](ROADMAP-DONE.md#a-granularity-decision-this-file-had-to-make-stated-explicitly).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
