# TODO/ROADMAP.md — Remaining Work

Only what is still open. Everything finished is in [TODO/ROADMAP-DONE.md](ROADMAP-DONE.md). This file is the source
`/run-todos` reads for order, and the table `/fix-todo` edits when a task opens, closes or changes priority.

**Snapshot:** 2026-11-20. Counts are in the [Status summary](#status-summary) at the foot of this file.

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

**Decided 2026-11-20 (owner):** a WebMCP agent reported "WarpCad has no delete" and merged its discarded attempts into a scratch body for the owner to clean up. The app has deleted bodies since `ui-051`, but no AI tool wraps `deleteBodies`. Filed as `ai-051` and run first in the Findings queue; closed 2026-11-20 (`delete_bodies`).

**Decided 2026-11-20 (owner):** an agent-made project's Variables panel shows labels like "Wall thickness (4 × 0.4 mm passes = 1.6)" broken one syllable per line. "Variables need a description as well as a name, so that the names can be smaller." Filed as `ui-157` and run first in the Findings queue; closed 2026-11-20 (`description` field, `describe_variable`, short labels, a row that no longer squeezes its title).

**Decided 2026-11-21 (owner):** "Is there a way for the agent to set the project description when it's done? If not, make a todo so that as soon as an agent is done creating something, the project is ready to be saved as a gist with any additional files or info already to go." The description already has a tool (`set_description`, all three paths). The rest was filed as `io-040` and shipped 2026-11-21.

**Decided 2026-11-22 (owner):** "In the previous attempt at warpcad, I really like the position cube that one made… Write a to do to switch to that one." The cube is the second attempt's (`~/src/WarpCad1`, `render-003`/`render-008`); the first attempt had none. Filed as `ui-158`, moved to the head of Next up by the owner the same day ("make the new todos the next ones"), and shipped 2026-11-22. Built as CSS 3D faces rather than a second WebGL canvas; that choice and its alternative are in the task file.

**Decided 2026-11-23 (owner, from an iPad screenshot):** "the new view cube gizmo looks good. Two issues, it's plain. Can you add the axis text and colors to the cube? Also on my ipad, the cube takes up a LOT of room… make it smaller (especially now that it has the views popup). And the orbit controls at the bottom left take up a lot of room too, so making it possible to open/close it would be nice." Filed as `ui-161` (smaller tablet cube), `ui-162` (face labels and axis colours, sized after `ui-161`) and `ui-163` (fold the navigation pad at every width, remembered), and put first in the Findings queue like the earlier owner requests.

**Order, and why.** The 2026-11-13 run closed every row from 1 to 35 except `perf-004` (parked on an owner question) and
`ui-108`; the numbers of the rows that closed are gone. What is left is the three
follow-ups the closed theme chain filed (36–38), then the findings the VERIFY.md drives filed, in the order they were filed
(43–66). Row numbers are stable ids, not positions: a gap means a row closed.
**Opus tasks** (each splits into an Opus half and a Sonnet half): none open.
**New findings a task files** get a Findings row at the bottom of the table and the next free Next up number, unless the owner re-ranks them.

| # | State | Milestone | Task | Model |
|---|---|---|---|---|
| [M19](#m19--native-ios-app-tauri) | 1 queued (ready) + 10 held | Re-queued 2026-11-23: the local native rows, each with its device check parked in OWNER.md so it finishes without the iPad. Never push `warpcad-native`; nothing to App Store Connect. |
| [Findings](#findings-open-rows) | 1 queued (ready) + 1 held + 1 running | The runner's queue: `testing-045`. Running in the desktop app: `testing-028`. Held: `testing-027` (unblocks itself if `testing-028` finds the iOS 26.0 switch: `build-034` #1, handed over from `testing-044`). |
| 81 | ▶ Ready | `FIND` | [`testing-045`](FIND-testing-045-drive-github-gist-and-repo-checks.md) Gist and hosted-save checks against real GitHub, with the owner's `gh` login (OWNER.md U1) | sonnet |
| 124 | ▶ Ready | `M19` | [`build-018`](../../warpcad-native/TODO/M19-build-018-tauri-ios-device-probe.md) Everything in the device probe that needs no iPad, and the probe build ready for OWNER.md I13 | ▶ Ready (Next up row 124) |

---

## Held — not run by /run-todos

**Native app (M19), the rows that leave this Mac.** Owner rule 2026-11-13, kept 2026-11-15: nothing for the native app is pushed
yet, to GitHub or to the App Store. The local rows run (owner, 2026-11-15); the held ones are listed under "Still held" in
[M19](#m19--native-ios-app-tauri).

**Findings that wait on one owner item** (each is in [`TODO/OWNER.md`](OWNER.md); `/owner` moves the row into the Findings table when the item is answered):

- [`testing-028`](FIND-testing-028-verify-native-dialog-checks-with-computer-use.md) Native dialogs, the Mac app and the iOS Simulator's own screens, with computer use (5 + 19 rows). **Running 2026-11-17** in the Claude desktop app (OWNER.md U2 done); not in the runner's queue
- [`testing-027`](FIND-testing-027-verify-ios-safari-checks-in-the-simulator.md) iOS Safari checks in the Simulator (34 rows). iOS 27.2 simulators have no Remote Automation switch; `testing-044` installed the iOS 26.0 runtime; `testing-028` (`build-034` #1) opens its Settings › Safari › Advanced and un-holds this row itself if the switch is there

**Device checks:**

- None. `testing-043` closed 2026-11-23 (its desktop half ran; its iPad half is OWNER.md I1-I4, now pointing at that id).

---

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
| [`testing-027`](FIND-testing-027-verify-ios-safari-checks-in-the-simulator.md) Drive the VERIFY.md iOS Safari behaviour checks in the iOS Simulator | finding | high | sonnet | Held (owner first) |
| [`testing-028`](FIND-testing-028-verify-native-dialog-checks-with-computer-use.md) Drive the VERIFY.md checks blocked on native OS dialogs and private windows, with computer use | finding | medium | sonnet | Running 2026-11-17 in the desktop app |
| [`build-019`](../../warpcad-native/TODO/M19-build-019-ios-signing-and-testflight.md) Signing and a TestFlight build (M19) | feature | high | sonnet | Held (native) |
| [`build-018`](../../warpcad-native/TODO/M19-build-018-tauri-ios-device-probe.md) Measure the app on the iPad; settle the decision record's unknowns (M19) | feature | high | sonnet | Held (native) |
| [`testing-011`](../../warpcad-native/TODO/M19-testing-011-acceptance-scenario-28-ios-app.md) Scenario 28 on the device, then the free-form pass (M19) | feature | high | sonnet | Held (native) |
| [`build-020`](../../warpcad-native/TODO/M19-build-020-app-store-submission-readiness.md) Listing, privacy, licence audits; stops before Submit (M19) | feature | high | sonnet | Held (native) |
| [`io-026`](../../warpcad-native/TODO/M19-io-026-lidar-scan-to-mesh-part.md) Scan an object with the iPad Pro's LiDAR into My parts (1.1) (M19) | feature | medium | opus | Held (native) |
| [`testing-035`](../../warpcad-native/TODO/M19-testing-035-device-checks-from-architecture-audit.md) Check the architecture audit's nine browser assumptions on real web views (M19) | finding | medium | sonnet | Held (desktop app, computer use) |
| [`build-030`](../../warpcad-native/TODO/M19-build-030-universal-links-open-share-links-in-the-app.md) Share links open in the installed app (universal links; 1.1) (M19) | feature | medium | sonnet | Held (native) |
| [`build-036`](../../warpcad-native/TODO/M19-build-036-macos-distribution.md) Mac app: entitlements, hardened runtime, signing, notarized or Mac App Store build (M19) | feature | medium | sonnet | Held (native) |
| [`build-037`](../../warpcad-native/TODO/M19-build-037-android-play-store-readiness.md) Android app: manifest, backups, credentials, signing, Play internal testing (M19) | feature | low | sonnet | Held (native) |
| [`build-038`](../../warpcad-native/TODO/M19-build-038-windows-distribution.md) Windows app: build, sign, test, choose a store (M19) | feature | low | sonnet | Held (native) |
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
> **Decided 2026-11-23 (owner):** clean all three. The origins were traced: the `ios-release.sh` `--debug` edit is `testing-037` step 1 (commit it); the `DEVELOPMENT_TEAM` line in `project.pbxproj` and the two `Info.plist` keys were written by a build whose restore trap did not run (restore them, never commit the team ID); `src-tauri/plugins/lidar/.tauri/` is a `probe/io-026` build cache (delete it). `testing-037` (row 117) does it.
>
> **Decided 2026-11-17 (owner, in `/whats-next`):** file the eight unrun iPad checks (D4, E6, F2 to F5, G, H) now as held rows in `warpcad-native`. Superseded by the owner-queue triage below: no row files were written.
>
> **2026-11-17 (owner-queue triage):** the eight checks are items in `TODO/OWNER.md` instead of separate row files: H → I5, F2-F5 → I9-I12 (wait on I20, the F1 re-check, since `ai-043` closed 2026-11-23), G → I13 (waits on the probe build), D4 → W1 (overnight), E6 → Z1 (parked, API key). The bookkeeping commit above is `testing-044` step 0.
>
> **Decided 2026-11-15 (owner):** "Continue adding things, but do not push the native repo yet. Test on this mac or
> iPad (it should work now)." So the local rows below are back in the runner's queue: Gate 0 of
> [`RELEASE-CHECKLIST.md`](../../warpcad-native/TODO/RELEASE-CHECKLIST.md), the local iPad pass (`testing-037`) and three
> local follow-ups. **Never push `warpcad-native`**, and nothing goes to App Store Connect (the checklist puts every store
> build after the GitHub push, Gate 2). Supersedes the 2026-11-13 hold for these rows only. The runner reads this table before
> Findings, so these run first. A `/fix-todo` agent works in `warpcad-native` for these and commits there; it never pushes.

**Local rows, in run order** (re-queued 2026-11-23). Each runs on this Mac and the iOS simulator. Its device check is an
`OWNER.md` §5a item, so the row finishes without the iPad, and the iPad session is done once, later, for all of them.
`testing-037` goes first because the rows after it need a clean `warpcad-native` tree.

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `build-018` | The device probe's agent half: `.ipa` size, wry's process-kill handling, the Claude iOS connector question, the probe build ready for OWNER.md I13 | Feature | — | 10 |

The gated rows below carry a **Run gate** banner in their file: what has to be true before they are queued, and the
decisions already taken so they do not stop part-way.

**Still held** (a list, so the runner cannot pick them up). Each contacts something outside this Mac, or waits on a row that does:

- [`build-019`](../../warpcad-native/TODO/M19-build-019-ios-signing-and-testflight.md) Signing and a TestFlight build. **Held:** uploads to App Store Connect.
- [`testing-011`](../../warpcad-native/TODO/M19-testing-011-acceptance-scenario-28-ios-app.md) Scenario 28 on the device, then the free-form pass. **Held:** needs the device and a human.
- [`build-020`](../../warpcad-native/TODO/M19-build-020-app-store-submission-readiness.md) Listing, privacy, licence audits; stops before Submit. **Held:** App Store work; waits on `build-019`, `testing-011` and the Part 6 legal gate.
- [`io-026`](../../warpcad-native/TODO/M19-io-026-lidar-scan-to-mesh-part.md) Scan an object with the iPad Pro's LiDAR into My parts (1.1). **Held:** needs the device (probe branch `probe/io-026`, runbook `PROBE-io-026.md`).
- [`testing-035`](../../warpcad-native/TODO/M19-testing-035-device-checks-from-architecture-audit.md) Check the architecture audit's nine browser assumptions on real web views. **Held:** runs in the Claude desktop app with computer use after `testing-028` (Playwright cannot reach the web view); no person needed.
- [`build-030`](../../warpcad-native/TODO/M19-build-030-universal-links-open-share-links-in-the-app.md) Share links open in the installed app (universal links; 1.1). **Held:** waits on `build-019` and publishes a hosted file with the team ID.
- [`build-036`](../../warpcad-native/TODO/M19-build-036-macos-distribution.md) Mac app: sandbox entitlements, hardened runtime, signing, Mac App Store build. **Held:** Decided 2026-11-13: Mac App Store; after the iOS submission.
- [`build-037`](../../warpcad-native/TODO/M19-build-037-android-play-store-readiness.md) Android app: manifest, backups, credentials, signing, Play internal testing. **Held:** After the iOS submission; needs a Play account.
- [`build-038`](../../warpcad-native/TODO/M19-build-038-windows-distribution.md) Windows app: build, sign, test, choose a store. **Held:** After the iOS submission; needs a Windows machine.

**Gated order (2026-11-23).** After the local table above: the owner's iPad session (OWNER.md §5a, all the parked
device checks in one sitting) → Gate 2, the push (owner says go) → `build-019` → `testing-011` (owner with the iPad and
iPhone) → `build-020` (ends at Ready to Submit) → 1.1: `build-030`, `io-026` → `build-036`, `build-037`, `build-038`.
`testing-035` runs whenever the desktop app is free after `testing-028`. Each row's Run gate banner lists what must be
true before it is queued; the order list below is the 2026-11-08 history.

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
- Held rows: the 16 held M19 rows and two findings (`testing-027`, `testing-028`), in [Held](#held--not-run-by-run-todos) and [M19](#m19--native-ios-app-tauri).
- **iPad checks left over from `testing-037`** (closed 2026-11-16, partly run): the eight unrun checks are `TODO/OWNER.md` items I5, I9–I13, W1 and Z1.
- **Free-form passes:** none owed. The 2026-10-17 decision records the M5–M10, M12, M16 and M17 passes as done.
  The next one falls due when the next milestone completes. M19's is `testing-011` on the iPad and the iPhone.

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
| [Findings](#findings-open-rows) | 1 queued + 1 held | 1 ready for `/run-todos` (`testing-045`); `testing-027` held; `testing-028` running in the desktop app. |
| [M19 — Native iOS app](#m19--native-ios-app-tauri) | 1 queued + 10 held | Queued 2026-11-23: `build-018` (agent half); `testing-043`, `ai-043` and `ai-042` closed 2026-11-23. Held behind a Run gate (push, upload, publish, or a store account or machine): `build-019`, `testing-011`, `build-020`, `build-030`, `io-026`, `build-036`–`build-038`; `testing-035` waits for the desktop app. |
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
