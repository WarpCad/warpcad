# TODO/ROADMAP.md — Remaining Work

Only what is still open. Everything finished is in [TODO/ROADMAP-DONE.md](ROADMAP-DONE.md). This file is the source
`/run-todos` reads for order, and the table `/fix-todo` edits when a task opens, closes or changes priority.

**Snapshot:** 2026-10-26. Counts are in the [Status summary](#status-summary) at the foot of this file.

> **What do I run next?** Take row 1 of [Next up](#next-up--recommended-todos), the lowest-numbered row whose
> state is not ⏳ and not an owner step, and run `/fix-todo <id>` (or `/loop /run-todos` to work down the table).
> **Filenames name the milestone, not the order.** `ls TODO` groups the backlog as `M19-…`, `M20-…`, `M18-…`,
> `M05-…`, `M11-…`, `FIND-…` (the Findings table) and `DEFER-…` (parked). The ranked order lives only in Next up.
> A ⏳ row is waiting on the ids in its State cell; a ▶ row has nothing in its way.

## Contents

- [Next up — recommended TODOs](#next-up--recommended-todos)
- [Decided 2026-10-24 and still waiting on you](#decided-2026-10-24-and-still-waiting-on-you)
- [All open work](#all-open-work)
- [Open milestones](#open-milestones)
  - [M19 — Native iOS app (Tauri)](#m19--native-ios-app-tauri)
  - [M20 — Home page at warpcad.com](#m20--home-page-at-warpcadcom)
  - [M18 — Launch (open rows)](#m18--launch-open-rows)
  - [M5 — Hardware Library (open rows)](#m5--hardware-library-open-rows)
  - [M15 — A mergeable project file (reserved rows)](#m15--a-mergeable-project-file-reserved-rows)
  - [Findings (open rows)](#findings-open-rows)
  - [M11 — Gears (open rows)](#m11--gears-open-rows)
- [Open work outside any milestone](#open-work-outside-any-milestone)
- [Keeping this file up to date](#keeping-this-file-up-to-date)
- [Status summary](#status-summary)
- [How to read this file](#how-to-read-this-file)

---

## Next up — recommended TODOs

*Last reviewed 2026-11-08 (M19 reordered so it can actually be done: the owner cannot sign yet, so rows 1–7 are Mac-only work, row 8 is the signing gate, and every device run comes after it. Before that 2026-11-07 (rows 22w–22za added from the VERIFY.md third pass: cold reads, real-GPU looks, measured taps, model behaviour over MCP, and the owner-decision batch. Before that, rows 22t–22v added from the VERIFY.md Safari pass: desktop Safari, the iOS Simulator and native dialogs, each waiting on one owner setup step. Before that, 13 rows 22g–22s added from the VERIFY.md AI-drivable pass: rows an AI drive can settle, handed to TODO files. Before that, six ready findings added as rows 22a–22f, per the owner's decision that day; `core-065`, the gear tasks and the threads tasks are deferred, so they are not in the table. `core-080` rounded Cube closed, with `ui-100`–`ui-103` filed from its acceptance drive). Before that 2026-11-06 (`ui-099` a coloured part goes back to its recipe colour once ticked Hidden by default, added as row 11 from the owner's report). Before that 2026-11-06 (`ui-097` closed: second tick on a part check now deselects the body, Measure to added for the target; was row 11). Before that 2026-11-06 (`ui-096` closed). Before that 2026-11-06 (`ui-096` project-only My parts row added as row 11 from the owner's report). Before that 2026-11-06 (`ui-095` closed). Before that 2026-11-05 (`ui-095` broken My parts entry added as row 11 from the owner's report). Before that 2026-11-05 (`ui-094` rename a part of a group added as row 12, at the owner's request). Before that 2026-11-01 (`testing-014` added as row 0; files renamed with a milestone prefix; Milestone column added).*

**Goal:** this weekend, a native app built with **Tauri 2** (owner decision 2026-10-24, not Capacitor) for **iOS, iPadOS, macOS, Android and Windows**
(widened 2026-10-26; iOS first) that
bundles the full WarpCad build, saves real files the Files app can see, hosts an MCP server for agents, and is
ready for the owner to submit to the App Store. It lives in the sibling repository `~/src/@WarpCad/warpcad-native`.
See [M19](#m19--native-ios-app-tauri). The web push is no longer held on `testing-007` (closed 2026-10-26); M19 rows that change
this repository still need a green full run before they are pushed.

| # | Milestone | Task | Why now | Model |
|---|---|---|---|---|
| 1 | `M19` | ▶ [`build-017`](M19-build-017-tauri-ios-shell-scaffold.md) Scaffold the Tauri 2 app beside this repo, bundling the build, then hand the native TODOs to it. Groundwork landed; still open: the macOS launch, the iOS simulator run, the M19 hand-off and the first `warpcad-native` commit | Everything in M19 builds on it. **Mac only, no signing** | opus |
| 2 | `M19` | [`render-006`](../../warpcad-native/TODO/M19-render-006-webgl-context-restore.md) Restore the 3D view after a lost WebGL context | "Reload the page" is a dead end with no browser chrome. Mac shell + simulator; device check in `testing-011` | opus |
| 3 | `M19` | [`io-014`](../../warpcad-native/TODO/M19-io-014-native-app-file-mode.md) Save, open and export real files, visible in the Files app | Local file access. Mac shell + simulator (it has a Files app); device check in `testing-011` | opus |
| 4 | `M19` | [`io-015`](../../warpcad-native/TODO/M19-io-015-native-durable-autosave-and-library.md) Mirror the autosave and My parts to native files | iOS can evict WebView storage. After `io-014`; device check in `testing-011` | sonnet |
| 5 | `M19` | [`ai-025`](../../warpcad-native/TODO/M19-ai-025-native-keychain-credentials.md) API key and GitHub token in the Keychain | Secrets out of evictable storage. Mac + simulator Keychain, mocked endpoint; device check in `testing-011` | sonnet |
| 6 | `M19` | [`ai-026`](../../warpcad-native/TODO/M19-ai-026-mcp-server-in-the-native-app.md) An MCP server inside the app | MCP service for agents. macOS shell first, as the file already says; iPhone over Wi-Fi in `testing-011` | opus |
| 7 | `M19` | [`build-024`](../../warpcad-native/TODO/M19-build-024-native-android-icons-and-defaults.md) Android launcher icons, splash and colours (split from `build-023`) | No signing needed. **Owner OK first** to install the Android SDK and NDK (several GB) | sonnet |
| 8 | `M19` | **Owner step: signing setup.** Apple ID in Xcode with the paid team, team ID, Apple Distribution certificate, iPhone registered, App Store Connect record for `com.warpcad.app`, an App Store Connect API key. The full list is in [`build-019`](../../warpcad-native/TODO/M19-build-019-ios-signing-and-testflight.md) | **The gate: nothing installs on a device before this.** Rows 1–7 do not wait for it | — |
| 9 | `M19` | [`build-019`](../../warpcad-native/TODO/M19-build-019-ios-signing-and-testflight.md) Signing and a TestFlight build | First app on the iPhone. Tauri's open iOS bugs are in this step | sonnet |
| 10 | `M19` | [`build-018`](../../warpcad-native/TODO/M19-build-018-tauri-ios-device-probe.md) Measure the TestFlight build on the iPhone; settle the decision record's unknowns | First device run. A device answer that contradicts rows 2–6 files a finding against that row | sonnet |
| 11 | `M19` | [`testing-011`](../../warpcad-native/TODO/M19-testing-011-acceptance-scenario-28-ios-app.md) Scenario 28, the iOS app end to end, on the iPhone; free-form pass | Holds every on-device check from rows 2–6. The only check a fake Tauri boundary cannot stand in for | sonnet |
| 11a | `M19` | [`build-020`](../../warpcad-native/TODO/M19-build-020-app-store-submission-readiness.md) App Store listing, privacy, licence audits; stops at the owner's **Submit** | Ends at the Part 6 legal gate | sonnet |
| 11b | `M19` | [`io-026`](../../warpcad-native/TODO/M19-io-026-lidar-scan-to-mesh-part.md) Scan an object with the iPad Pro's LiDAR into My parts (a Swift Tauri plugin) | Owner request 2026-11-07. **After `build-020`**: a 1.1 feature, not on the submission's cut line | opus |
| 13 | `FIND` | ▶ [`testing-010`](FIND-testing-010-ai-working-chip-docs-screenshot-drifts.md) Docs screenshot `ai-working-chip` drifts on laptop | Found by the `ui-083` commit gate; decide intended change or regression | sonnet |
| 16f | `FIND` | [`testing-016`](FIND-testing-016-part-default-hidden-canvas-same-flakes.md) Canvas "same" checks in `part-default-hidden.e2e.js` flake, alone and in the full suite | Filed 2026-11-04 while landing core-078 Part 2; reproduces on HEAD | sonnet |
| 17a | `FIND` | [`perf-004`](FIND-perf-004-kernel-registry-metadata-in-the-main-bundle.md) Split the op registry's metadata from its code (~380 kB of kernel out of the main bundle) | Low; follows `perf-003` | opus |
| 21 | `M18` | M18 owner checks: GA rows and the close check (see [M18](#m18--launch-open-rows)) | Owner steps; no agent can run them | — |
| 22 | `FIND` | [`testing-009`](FIND-testing-009-webkit-scaffold-flakes-and-app-header-drift.md) WebKit viewport-scaffold specs fail under load, and two app-header screenshots drifted | Medium; now on a Findings row | sonnet |
| 22c | `FIND` | [`testing-013`](FIND-testing-013-getting-started-tour-times-out-under-full-load.md) The getting-started docs tour times out under the full e2e matrix | Medium; passes alone | sonnet |
| 22f | `FIND` | [`testing-015`](FIND-testing-015-webgl-depth-and-translucency-specs.md) Automate the z-fight, coplanar-hole and translucency checks on all three engines | Low; waits on `testing-005` (done) | sonnet |
| 22g | `FIND` | ▶ [`testing-017`](FIND-testing-017-verify-layout-and-engine-checks-in-emulation.md) Drive the VERIFY.md layout and engine checks emulation and the three engines can settle (11 rows) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22h | `FIND` | ▶ [`testing-018`](FIND-testing-018-verify-checks-on-copies-of-owner-files.md) Drive the VERIFY.md checks that name the owner’s files, against copies (7 rows) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22i | `FIND` | ▶ [`testing-019`](FIND-testing-019-verify-desktop-flow-checks.md) Drive the VERIFY.md flow checks that need only the built app at laptop width (13 rows) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22j | `FIND` | ▶ [`testing-020`](FIND-testing-020-verify-touch-timing-and-offline-checks.md) Drive the VERIFY.md touch, timing and offline checks emulation can settle (8 rows) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22k | `FIND` | ▶ [`testing-021`](FIND-testing-021-verify-rows-overtaken-by-later-work.md) Re-check VERIFY.md rows later work appears to have answered; close or reword (7 rows) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22l | `FIND` | ▶ [`testing-022`](FIND-testing-022-verify-mcp-checks-with-claude-code-as-client.md) Drive the VERIFY.md MCP and live-bridge checks with a real Claude Code as client (12 rows) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22m | `FIND` | ▶ [`testing-023`](FIND-testing-023-verify-exported-files-in-real-tools.md) Open exported STL, OBJ and glTF files in Cura, MeshLab and a glTF viewer (6 rows) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22n | `FIND` | ▶ [`testing-024`](FIND-testing-024-verify-deployed-site-and-github-checks.md) Answer the VERIFY.md deploy and CI checks from the live site and gh run history (10 rows) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22o | `FIND` | ▶ [`testing-025`](FIND-testing-025-verify-git-hook-and-build-output-checks.md) Drive the pre-push hook against a scratch remote, the dev-only specs and the build notices (6 rows) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22p | `FIND` | ▶ [`docs-031`](FIND-docs-031-verify-external-facts-docs-cite.md) Check the outside facts (trademarks, ISO 4032, prices, WebMCP trial, MCP cap) VERIFY.md rows cite (5 rows) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22q | `FIND` | ▶ [`docs-032`](FIND-docs-032-link-agent-prompting-guide-from-home-page.md) Link the agent prompting guide from the warpcad.com home page (`docs-029` #3) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22r | `FIND` | ▶ [`docs-033`](FIND-docs-033-regenerate-objects-hide-split-piece-still.md) Regenerate the `objects-hide-split-piece` still without rewriting every GIF (2 rows) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22s | `FIND` | ▶ [`perf-005`](FIND-perf-005-bundle-load-bench-against-deployed-url.md) Point the bundle-load bench at the deployed Pages build (`perf-002` #1) | From the 2026-11-07 VERIFY.md pass: rows an AI drive can settle | sonnet |
| 22t | `FIND` | [`testing-026`](FIND-testing-026-verify-desktop-safari-checks-with-safaridriver.md) Drive the desktop-Safari checks in real Safari through safaridriver (6 rows; session start still times out) | From the 2026-11-07 VERIFY.md Safari pass; owner setup step first (see the file) | sonnet |
| 22u | `FIND` | [`testing-027`](FIND-testing-027-verify-ios-safari-checks-in-the-simulator.md) Drive the iOS Safari behaviour checks (keyboard, zoom, pickers, safe areas, fonts) in the iOS Simulator (34 rows; Remote Automation off in the simulator) | From the 2026-11-07 VERIFY.md Safari pass; owner setup step first (see the file) | sonnet |
| 22v | `FIND` | [`testing-028`](FIND-testing-028-verify-native-dialog-checks-with-computer-use.md) Drive the checks blocked on native OS dialogs and private windows, with computer use (6 rows; needs the desktop app) | From the 2026-11-07 VERIFY.md Safari pass; owner setup step first (see the file) | sonnet |
| 22w | `FIND` | ▶ [`testing-029`](FIND-testing-029-verify-cold-read-panel.md) Cold-read panel: fresh agents answer the VERIFY.md “does a stranger understand this” rows | From the 2026-11-07 VERIFY.md third pass | sonnet |
| 22x | `FIND` | ▶ [`testing-030`](FIND-testing-030-verify-look-and-legibility-on-real-gpu.md) Look-and-legibility rows on the Mac’s real GPU and screen, with contrast, ΔE and flicker measurements | From the 2026-11-07 VERIFY.md third pass | sonnet |
| 22y | `FIND` | ▶ [`testing-031`](FIND-testing-031-verify-tap-timing-reach-and-step-counts.md) Measure tap accuracy (scattered fingertip taps), timing, reach and step counts for the VERIFY.md phone rows | From the 2026-11-07 VERIFY.md third pass | sonnet |
| 22z | `FIND` | ▶ [`testing-032`](FIND-testing-032-verify-model-behaviour-over-mcp.md) Model-behaviour rows through Claude Code over MCP instead of an API key | From the 2026-11-07 VERIFY.md third pass | sonnet |
| 22za | `FIND` | ▶ [`testing-033`](FIND-testing-033-owner-decisions-from-verify.md) Gather the ~80 owner decisions parked in VERIFY.md, draft a recommendation each, ask in batches | From the 2026-11-07 VERIFY.md third pass; ends in questions for the owner | sonnet |
| 23 | `M05` | M5 threads: [`core-074`](M05-core-074-thread-geometry-recipes.md), then [`ui-080`](M05-ui-080-threads-library-section-and-inspector.md) | Ready; its dependency on `core-073` was dropped 2026-10-24 | opus / sonnet |
| 25 | `M11` | Gears (M11, runs last): `ui-057` → `ui-058` → `core-048` → `core-049` → `core-062` → `testing-002` → `docs-021` | Order from M11's suggested order | sonnet / opus |

`core-065` stays parked (decided 2026-10-17: keep the Albany table for now) and is not ranked. **Decided 2026-11-07:** switch the table's citation to ASME B18.6.1, as the task file already records for 2026-10-17. This supersedes the "keep Albany" note. Its Step 1 check still applies first: if the standard does not print pilot or clearance sizes, the task stops and asks.

**Deferred 2026-11-07:** all gear work (the M11 milestone: core-048, core-049, core-062, ui-057, ui-058, testing-002, docs-021) and all screw and thread work (core-074, ui-080 for threads; core-065 for the wood-screw table). Parked, no decision yet on when they resume. Nothing else is changed; the Next up order is untouched.

**Runner order** (`/run-todos` follows table order): [M19](#m19--native-ios-app-tauri) first, then
[M20](#m20--home-page-at-warpcadcom), then [M18](#m18--launch-open-rows), then the open milestone tables in this file's order, then
[M11](#m11--gears-open-rows) last.

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

- **For M19 to start `build-019`:** membership and bundle identifier `com.warpcad.app` were cleared 2026-10-31, but **as of 2026-11-08 the owner cannot sign anything yet**. Next up row 8 lists the signing setup. Every device install waits on it; Next up rows 1–7 do not.
- **For M19 to finish `build-020`:** the price amount and countries, and the Part 6 review in `docs/decisions/app-store-licensing.md`. **Decided 2026-11-07:** the owner will not contact a lawyer, so Part 6 has no outside reviewer and stays not done in substance; the store submission is still gated on it as written. Help-content and prose licence are decided (see below). iPad scope and Sentry were decided 2026-11-07 (see `build-020`). The
  submission itself is yours.
  - **Decided 2026-11-07 (in `build-020`):** paid app at one price, age rating 4+. Help GIFs fetched from the web, not bundled. **Decided 2026-11-07:** the app loads all Help from the web and ships none of it (prose licence option (b)). Still open: the price amount and countries, and the Part 6 legal review.

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

Every open row in the milestone tables, plus the reserved rows. The milestone sections below repeat these rows
with their dependencies and acceptance columns; keep the two in step when a row changes.

| Milestone | Task | Kind | Priority | Model | State |
|---|---|---|---|---|---|
| M19 — Native iOS app | [`build-017`](M19-build-017-tauri-ios-shell-scaffold.md) Scaffold the Tauri 2 iOS app in `~/src/@WarpCad/warpcad-native`, bundling the WarpCad build | feature | high | opus | ▶ **ready** |
| M19 — Native iOS app | [`build-018`](../../warpcad-native/TODO/M19-build-018-tauri-ios-device-probe.md) Measure the app on the owner's iPhone; settle the decision record's unverified rows | feature | high | sonnet | ⏳ after `build-019` (first device run) |
| M19 — Native iOS app | [`build-019`](../../warpcad-native/TODO/M19-build-019-ios-signing-and-testflight.md) Distribution signing and a TestFlight build | feature | high | sonnet | ⏳ after `build-017`; **owner signing setup first** (Next up row 8) |
| M19 — Native iOS app | [`render-006`](../../warpcad-native/TODO/M19-render-006-webgl-context-restore.md) Restore the 3D view after a lost WebGL context | finding | high | opus | ⏳ after `build-017` |
| M19 — Native iOS app | [`io-014`](../../warpcad-native/TODO/M19-io-014-native-app-file-mode.md) Save, open and export real files in the app, visible in the Files app | feature | high | opus | ⏳ after `build-017` |
| M19 — Native iOS app | [`io-015`](../../warpcad-native/TODO/M19-io-015-native-durable-autosave-and-library.md) Mirror the autosave and My parts to native files | feature | medium | sonnet | ⏳ after `io-014` |
| M19 — Native iOS app | [`ai-025`](../../warpcad-native/TODO/M19-ai-025-native-keychain-credentials.md) API key and GitHub token in the iOS Keychain | feature | medium | sonnet | ⏳ after `build-017` |
| M19 — Native iOS app | [`ai-026`](../../warpcad-native/TODO/M19-ai-026-mcp-server-in-the-native-app.md) An MCP server inside the app (loopback, opt-in Wi-Fi with a token) | feature | high | opus | ⏳ after `build-017` |
| M19 — Native iOS app | [`testing-011`](../../warpcad-native/TODO/M19-testing-011-acceptance-scenario-28-ios-app.md) Acceptance scenario 28 on the iPhone, plus the free-form pass | feature | high | sonnet | ⏳ after `build-018`, `build-019`, `render-006`, `io-014`, `io-015`, `ai-025`, `ai-026` |
| M19 — Native iOS app | [`build-020`](../../warpcad-native/TODO/M19-build-020-app-store-submission-readiness.md) App Store readiness; stops at the owner's Submit | feature | high | sonnet | ⏳ after `build-019`, `testing-011` |
| M19 — Native iOS app | [`build-024`](../../warpcad-native/TODO/M19-build-024-native-android-icons-and-defaults.md) Android launcher icons, splash and colours (split from `build-023`) | feature | medium | sonnet | ⏳ needs the Android SDK; before `build-020` |
| M19 — Native iOS app | [`io-026`](../../warpcad-native/TODO/M19-io-026-lidar-scan-to-mesh-part.md) Scan an object with the iPad Pro's LiDAR camera and add it to My parts as a mesh part | feature | medium | opus | ⏳ after `build-017`, `build-018`, `render-006`; scheduled after `build-020` |
| M18 — Launch | [`core-065`](M18-core-065-wood-screw-holes-cite-asme-not-albany.md) Wood-screw hole table cites ASME B18.6.1 instead of Albany County Fasteners' chart (stops to ask if the pilot columns are not in the standard) | finding | high | sonnet | ▶ **ready** (unparked 2026-11-07: switch to ASME B18.6.1, see the note under "Decided 2026-11-07" above the open-work tables) |
| M5 — Hardware Library | [`core-074`](M05-core-074-thread-geometry-recipes.md) Real helical threads: external and internal thread generator | feature | medium | opus | ▶ **ready** (dependency on `core-073` dropped 2026-10-24) |
| M5 — Hardware Library | [`ui-080`](M05-ui-080-threads-library-section-and-inspector.md) Threads section in the Library, drag-to-place, Inspector fields | feature | medium | sonnet | ⏳ after `core-074`, `ui-052` |
|  | `data-012` Tombstone and position-key compaction — `data-011` measured the section at 34-43% of an edited file (`bench/results/2026-10-12-data-011.md`), so the encoding proposals there are this task's starting point | reserved | — | — | 📝 no file yet; ▶ measured, ready to write up |
|  | `io-013` Import another project's bodies into this one (id remap) | reserved | — | — | 📝 no file yet; waits on `ui-062` |
|  | `ai-019` Standalone live-bridge host: `mcp/server.js --live` over a loopback WebSocket | reserved | — | — | 📝 no file yet; waits on `ui-062` |
|  | `ai-018` Relax `ai-012`'s one-writer refusals now that a merge exists | reserved | — | — | 📝 no file yet; waits on `ai-012`, `ai-017` |
|  | [`ui-057`](M11-ui-057-gears-library-section-and-inspector.md) Gears section in the Library, drag-to-place, and a parametric Inspector with derived readouts | feature | high | sonnet | ⏳ waits on `core-041`, `core-048` |
|  | [`ui-058`](M11-ui-058-gear-mesh-operation.md) Mesh operation — select two gears, click Mesh, and the second moves to the correct centre dista… | feature | high | opus | ⏳ waits on `ui-057` (`core-044` done) |
|  | [`core-048`](M11-core-048-gear-hub-bore-keyway-and-set-screw.md) Gear hubs, bores, D-flats, keyways and set-screw holes — what every V1 gear project bolted on b… | feature | medium | sonnet | ▶ **ready** (`core-041` done) |
|  | [`testing-002`](M11-testing-002-acceptance-scenario-19-gear-train.md) Acceptance scenario 19 — place two gears, mesh them, and confirm they turn without interpenetra… | feature | medium | sonnet | ⏳ waits on `ui-057`, `ui-058` |
|  | [`core-049`](M11-core-049-planetary-gear-set.md) Planetary gear set — sun, planets, ring and carrier from one parameter record | feature | low | opus | ▶ **ready** (`core-043` and `core-044` done) |
|  | [`core-062`](M11-core-062-herringbone-relief-groove.md) Herringbone relief groove — an optional gap at mid-thickness (`grooveMm`), split out of `core-042` | feature | low | sonnet | ▶ **ready** (`core-042` done) |
|  | [`docs-021`](M11-docs-021-media-gears-and-porting-guide.md) Docs media for gears, and a "porting a jscad-gears script" guide | feature | low | sonnet | ⏳ waits on `ui-057`, `ui-058`, `testing-002` |

---

## Open milestones

Milestones appear in runner order: M19, then M18, M5, M15, Findings, and M11 last. A milestone whose rows are all
done is not listed here; its owed human passes are in [Owed](#open-work-outside-any-milestone).

### M19 — Native iOS app (Tauri)

[↑ Contents](#contents)

> **Widened 2026-10-26: targets are iOS, iPadOS, macOS, Android and Windows.** `build-017` scaffolds all five
> and ends by **moving every native-app TODO (`build-018`–`build-020`, `render-006`, `io-014`, `io-015`, `ai-025`,
> `ai-026`, `testing-011`) into `warpcad-native/TODO/`**; this section then shrinks to a pointer to
> `~/src/@WarpCad/warpcad-native/TODO/ROADMAP.md`. The rows below keep their iOS wording until that move; the
> per-platform follow-ups (macOS notarization, Android Play, Windows signing, per-OS credentials) are filed there.

Added 2026-10-24 at the owner's request, scheduled first. The owner's goal is a native iOS app, working and ready to
publish, this weekend. It is built with **Tauri 2**, overriding the Capacitor recommendation in
`docs/decisions/native-mobile-shell.md` (see its "Owner decision" section for what changes). It lives in the
**sibling repository `~/src/@WarpCad/warpcad-native`**, which bundles this repository's `npm run build:native`
output. So most rows change **both repositories**: commit each one separately, and retire the row in this repository's
commit. The new repository has no pre-push gate of its own; its gates are `cargo fmt`, `clippy` and `cargo deny`
(`build-017`).

Playwright cannot drive a WKWebView inside an app. Each row's `*.e2e.js` runs at `/` with a fake Tauri boundary
(`e2e/fixtures/nativeShell.js`, `build-017`), and each row is checked on the macOS shell and the iOS simulator, which need no signing. **The iPhone checks for
`render-006`, `io-014`, `io-015`, `ai-025` and `ai-026` are all in scenario 28** (`testing-011`, steps 3–9), so those
rows close without a device.
Scenario 28 (`testing-011`) is the one acceptance check only the device can pass.

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `build-017` | Scaffold `warpcad-native` (Tauri 2), `build:native` here, `src/native/shell.js` (no `@tauri-apps/api` dependency: its licence expression is not on the allow-list), capabilities default-deny, `cargo deny`; Tauri health check re-run | Build | — | 1, 7 on the macOS shell and the simulator |
| `build-018` | On-device probe: size, cold start, memory, context loss, storage survival, `ws://`, file picker, Files visibility, **which agents can reach an in-app MCP server**. First device run, on the TestFlight build | Build | `build-019` | 1, 7, 10 |
| `build-019` | Distribution signing and a TestFlight build, early, because Tauri's open iOS issues are in this step. Owner signing setup first; the first device install | Build | `build-017` | opens on device |
| `render-006` | `webglcontextrestored` rebuild plus a **Restore view** fallback; no page reload | Finding | `build-017` | 1, 7, 10 |
| `io-014` | `native-app` file mode: Save in place to Documents (shown in Files), Open + Browse…, exports as real files, Open in WarpCad | Operation | `build-017` | 10, 11, 22, 23, 26 |
| `io-015` | Native mirror of the autosave and My parts; restore on launch when IndexedDB was evicted | Core | `io-014` | 1, 10 |
| `ai-025` | Keychain behind `createCredentialStore`; one-time migration | Control | `build-017` | 24 |
| `ai-026` | `rmcp` Streamable HTTP server in the app relaying to `TabEndpoint`; lease from the existing sheet; loopback by default, Wi-Fi opt-in with a token; works only while the app is on screen | Control | `build-017` | 24, 25, 27 |
| `testing-011` | Acceptance scenario **28**, the iOS app end to end, driven on the iPhone; the M19 free-form pass | Testing | `build-018`, `build-019`, `render-006`, `io-014`, `io-015`, `ai-025`, `ai-026` | creates 28; 1, 7, 10, 25 |
| `build-020` | Listing, privacy labels and manifest, icons, native and asset licence audits, owner decisions; **stops before Submit** (Part 6 legal gate) | Build | `build-019`, `testing-011` | 28, 1, 7, 10 |
| `io-026` | LiDAR scan → My parts mesh part: a Swift Tauri plugin (Object Capture by default, scene reconstruction if the iPad can't), a `WCSCAN1` buffer parsed in `src/io/meshFormats/`, metres Y-up → mm Z-up at that boundary. Post-submit 1.1 | Operation | `build-017`, `build-018`, `render-006` | 26, 31, 10, 28 |

**Order (reordered 2026-11-08: the owner cannot sign yet, so no device install is possible until the signing gate).**

1. **On this Mac, no signing:** `build-017` → `render-006` → `io-014` → `io-015` → `ai-025` → `ai-026`, plus
   `build-024` whenever the owner agrees to the Android SDK install. Each is checked on the macOS shell and the
   iOS simulator. `render-006`, `ai-025` and `io-014` do not depend on each other.
2. **The signing gate (owner):** the setup listed in `build-019` and in Next up row 8.
3. **On the iPhone:** `build-019` (first install, from TestFlight) → `build-018` (measure it; a contradicting
   answer files a finding against rows 2–6) → `testing-011` (**stop for the five-minute free-form pass**) →
   `build-020` (**stop for the owner's legal review and Submit**). `io-026` comes after that, as a 1.1 feature.

**If time runs short**, the cut line that still gives a publishable app is: `build-017`, `render-006`, `io-014`,
then the signing gate, `build-019`, `build-018`, `testing-011` (with steps 7 and 8 marked not driven) and
`build-020`. `io-015`, `ai-025` and `ai-026` can follow in a 1.1 update.

### M20 — Home page at warpcad.com

[↑ Contents](#contents)

Added 2026-10-24 at the owner's request: a WarpCad home page with links to the documentation, in the new
**sibling repository `~/src/@WarpCad/warpcad.github.io`** (the WarpCad org's Pages site). `docs/decisions/hosting.md`
kept the bare domain free for exactly this; today `warpcad.com` and `www` still resolve to a Squarespace parking page.
The docs stay where they are, rendered in the app's Help. The home page links each one as
`https://app.warpcad.com/#/help/<slug>`, built from the app's published `help/index.json`, so a new docs page shows up
at the next daily rebuild. `testing-012` is the one row in this repository: it turns that URL into a tested contract
before another site depends on it, and `perf-003` must keep it green. The home repository runs its own gates
(`build-021`, now scaffolded locally); it has no LFS and no pre-push hook.

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|

The App Store support URL is GitHub Issues (`docs-026`), so `build-020` does not depend on `build-022`.

### M18 — Launch (open rows)

[↑ Contents](#contents)

The launch is live at `app.warpcad.com`. Seven of the eight rows are done (see
[ROADMAP-DONE.md](ROADMAP-DONE.md#m18--launch-publish-appwarpcadcom-sentry-and-ga)). The one open row:

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `core-065` | Wood-screw hole table: cite ASME B18.6.1 instead of Albany County Fasteners' © 2025 chart. Step 1 finds out what the standard prints; **stops to ask the user** if it lacks the pilot-hole columns | Finding | — | 2, 3, 5, 10, 15; `core-050`, `ui-052` repros |

**Owner steps still open**

- **GA** (`TODO/VERIFY.md`, `build-007` rows 3–6): `GA_MEASUREMENT_ID` is set (`G-JFYXCZJ1HN`). Turn **Enhanced
  measurement OFF**, then check Realtime and DebugView show one page view with no `#` in the path, and the
  console is clean.
- **Close** (step 11): open `https://app.warpcad.com`, check the Help version line shows the deployed commit, and
  check the console has no CSP error naming a Sentry or Google host. Then M18 is complete.

No free-form pass is owed for M18: the 2026-10-17 decision records the owed passes as done.

### M5 — Hardware Library (open rows)

[↑ Contents](#contents)

Seven rows of this milestone are done (see [ROADMAP-DONE.md](ROADMAP-DONE.md#m5--hardware-library-surface-closing-the-fastener-reachability-gap)).
The two open rows are the threads pair the owner requested on 2026-10-20. `core-074` no longer depends on `core-073` (dropped 2026-10-24; see [Decided](#decided-2026-10-24-and-still-waiting-on-you)).

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `core-074` | Real helical threads: external and internal thread generator (rod, hole cutter, nut). Requested by the user 2026-10-20 | Feature | — | 2, 10 |
| `ui-080` | Threads section in the Library, drag-to-place, Inspector fields. Requested by the user 2026-10-20 | Feature | `core-074`, `ui-052` | 1, 2, 3, 7, 10 |

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

Open findings that belong to no single milestone. Closed findings are in
[ROADMAP-DONE.md](ROADMAP-DONE.md#findings). `/fix-todo` Step 8 marks rows here the same way as a milestone table.

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `testing-010` | The docs screenshot "ai-working-chip still" fails on laptop; decide whether the chip changed on purpose or regressed | Finding | — | none |
| `testing-009` | Two WebKit viewport-scaffold specs fail under parallel load, and two app-header screenshots have drifted | Finding | — | none |
| `testing-013` | The getting-started docs tour times out at 30 s in the full e2e matrix, and passes alone | Finding | — | none |
| `testing-015` | Automate the z-fight, coplanar-hole and overlapping-translucency checks on all three engines | Finding | `testing-005` | none |
| `perf-004` | Split the op registry's metadata from its code, so about 380 kB of kernel leaves the main bundle | Finding | — | none |
| `testing-017` | Drive the VERIFY.md layout and engine checks emulation and the three engines can settle (11 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | none (part of 6) |
| `testing-018` | Drive the VERIFY.md checks that name the owner’s files, against copies (7 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | 31, 10 |
| `testing-019` | Drive the VERIFY.md flow checks that need only the built app at laptop width (13 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | 6, 10, 11, 16 |
| `testing-020` | Drive the VERIFY.md touch, timing and offline checks emulation can settle (8 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | 7 (if `ui-062` #4 reproduces) |
| `testing-021` | Re-check VERIFY.md rows later work appears to have answered; close or reword (7 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | none |
| `testing-022` | Drive the VERIFY.md MCP and live-bridge checks with a real Claude Code as client (12 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | 23, 25 |
| `testing-023` | Open exported STL, OBJ and glTF files in Cura, MeshLab and a glTF viewer (6 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | 11, 26 |
| `testing-024` | Answer the VERIFY.md deploy and CI checks from the live site and gh run history (10 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | none |
| `testing-025` | Drive the pre-push hook against a scratch remote, the dev-only specs and the build notices (6 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | 24, 25 (scripted only) |
| `docs-031` | Check the outside facts (trademarks, ISO 4032, prices, WebMCP trial, MCP cap) VERIFY.md rows cite (5 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | none |
| `docs-032` | Link the agent prompting guide from the warpcad.com home page (`docs-029` #3). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | none |
| `docs-033` | Regenerate the `objects-hide-split-piece` still without rewriting every GIF (2 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | none |
| `perf-005` | Point the bundle-load bench at the deployed Pages build (`perf-002` #1). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | none |
| `testing-026` | Drive the desktop-Safari checks in real Safari through safaridriver (6 rows; session start still times out). Filed 2026-11-07 from the VERIFY.md Safari pass | Finding | — | 22 |
| `testing-027` | Drive the iOS Safari behaviour checks (keyboard, zoom, pickers, safe areas, fonts) in the iOS Simulator (34 rows; Remote Automation off in the simulator). Filed 2026-11-07 from the VERIFY.md Safari pass | Finding | — | 10, 13, 15 |
| `testing-028` | Drive the checks blocked on native OS dialogs and private windows, with computer use (6 rows; needs the desktop app). Filed 2026-11-07 from the VERIFY.md Safari pass | Finding | — | 10, 23 |
| `testing-029` | Cold-read panel: fresh agents answer the VERIFY.md “does a stranger understand this” rows. Filed 2026-11-07 from the VERIFY.md third pass | Finding | — | none |
| `testing-030` | Look-and-legibility rows on the Mac’s real GPU and screen, with contrast, ΔE and flicker measurements. Filed 2026-11-07 from the VERIFY.md third pass | Finding | — | 5, 13 |
| `testing-031` | Measure tap accuracy (scattered fingertip taps), timing, reach and step counts for the VERIFY.md phone rows. Filed 2026-11-07 from the VERIFY.md third pass | Finding | — | 7 |
| `testing-032` | Model-behaviour rows through Claude Code over MCP instead of an API key. Filed 2026-11-07 from the VERIFY.md third pass | Finding | — | 17, 18 (MCP route) |
| `testing-033` | Gather the ~80 owner decisions parked in VERIFY.md, draft a recommendation each, ask in batches. Filed 2026-11-07 from the VERIFY.md third pass | Finding | — | none |

---

### M11 — Gears (open rows)

[↑ Contents](#contents)

**Runs last** (moved 2026-10-16 at the user's request): this section sits after Findings, so `/run-todos` only
reaches the gear rows once nothing else is open. The rest of the gears milestone is done (see
[ROADMAP-DONE.md](ROADMAP-DONE.md#m11--gears-the-jscad-gears-library-ported-and-extended)).

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `core-048` | Hub, bore, D-flat, keyway, nut trap, set screw, lightening holes — named parts | Creation | `core-041` | 3, 6 |
| `core-049` | Planetary set (`R = S + 2P`, equal-spacing constraint, ratios, carrier) | Creation | `core-043`, `core-044` | 1, 3, 10 |
| `core-062` | Herringbone relief groove (`grooveMm`), filed from `core-042`'s decision to refuse it | Creation | `core-042` | 1, 3, 10 |
| `ui-057` | **Gears** Library section, drag-to-place, parametric Inspector with derived readouts, `docs/gears.md` | Creation | `core-041`, `core-048`, `ui-052` | 1, 3, 6, 7, 10; `ui-053` repro |
| `ui-058` | **Mesh** operation — exactly two gears selected, centre distance + phase, compatibility messages | Operation | `ui-057`, `core-044` | 1, 3, 6, 7, 10, 16, 19; `ui-035/036/053` repros |
| `testing-002` | Acceptance scenario **19** (place two gears, mesh, union, save, export), driven live once | Testing | `ui-057`, `ui-058` | creates 19 |
| `docs-021` | Gear media and a "porting a jscad-gears script" page | Docs | `ui-057`, `ui-058`, `docs-006/007`, `testing-002` | — |

**Suggested order** (the user can hand-use something after each step): `core-039` →
`core-040` → `core-041` → `core-044` → `ui-057` → `ui-058` (**two meshed spur gears, the
`window-motor` and `bf-gear` cases, are now reachable — stop and do the five-minute
free-form pass here, and run scenario 19's steps 1-4 by hand**) → `core-048` → `core-043` →
`core-042` → `core-045` → `core-046` (the `drive-wheel` case) → `core-047` → `core-049` →
`testing-002` → `docs-021`. `core-048` can land any time after `core-041` and should before
anyone prints a gear.

---

## Open work outside any milestone

Items that are open but have no row in a milestone table, or are not live work yet. `/run-todos` does not reach the
first group, so each one needs a row before it can be scheduled.

**Open files with no roadmap row:** none. (`core-075` and `io-016` got their Findings rows on 2026-10-26.)

The four that lacked a row on 2026-10-24 (`ui-079`, `testing-009`, `testing-005`, `testing-010`) now have Findings rows.

**Deferred, not scheduled**

- The JSCAD V3 family: [`core-066`](DEFER-core-066-switch-kernel-to-jscad-v3.md) through
  [`core-073`](DEFER-core-073-jscad-v3-land-the-switch.md). Each file says deferred until the owner chooses the switch.
  See decision 2 above.
- [`io-025`](DEFER-io-025-read-step-directly.md) Read STEP files directly, after `io-024`. Parked 2026-11-02 at the owner's
  choice: every ready-made reader is LGPL, so it starts with an owner decision on the licence.
- [`testing-006`](DEFER-testing-006-redrive-connected-scenarios-with-phone-header-entry.md) Hand-drive scenarios 24, 25 and the `ui-071` repro on the phone header entry. Parked 2026-11-07 due to cost: scenario 24 needs a real Anthropic API key, which bills against purchased tokens.

**Owed**

- Owner steps for `build-016` (Parts 4 and 6), in `TODO/VERIFY.md`.
- Owner checks for `build-007` (GA) and the M18 close, above.
- **Free-form passes:** none owed. The 2026-10-17 decision records the M5–M10, M12, M16 and M17 passes as done.
  The next one falls due when the next milestone completes. M19's is taken inside `testing-011`, on the iPhone.

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
4. Find what it unblocked: any open file whose `depends:` ids all have a file in `TODO/done/` is now ready. Change
   its State cell to `▶ ready`, and give it a row in Next up if it outranks what is there.
5. Bump the milestone's count in the Status summary. When the last open row of a milestone closes, move the
   milestone's heading and its remaining prose to ROADMAP-DONE.md, and note any owed human pass under
   [Owed](#open-work-outside-any-milestone).

**When a task is added or re-prioritised**

1. Write `TODO/<MILESTONE>-<id>-<slug>.md` with the usual front matter (`priority`, `milestone`, `depends`, `status`,
   `model`). `<MILESTONE>` is `M05`, `M11`, `M18`, `M19`, `M20`, `FIND` (Findings table) or `DEFER`
   (see [TODO/README.md](README.md#naming-convention)). If a task changes milestone, `git mv` it to the new prefix and fix
   every link to it in the same commit.
2. Add a row to its milestone table here, or to **Findings** if it has none. A file with no row is invisible to
   `/run-todos`.
3. Add or edit its row in **All open work**, and re-rank Next up if the priority changed.

**Rules for the summary rows**

- One line, under ~200 characters. Counts and what is left, never the story of how it was built. That belongs in
  the task's retirement note and its Completion Log row.
- Counts come from the tables, not from memory: count the open rows here.
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
| [M19 — Native iOS app](#m19--native-ios-app-tauri) | 11 | Runs first. `build-017` ready; the rest wait on it. Tauri 2 in `warpcad-native`; ends at the owner's App Store submit. `io-026` (LiDAR scan) follows the submit as a 1.1 row. |
| [M20 — Home page](#m20--home-page-at-warpcadcom) | 6 | New repo `warpcad.github.io`; ends at the owner's DNS steps for `warpcad.com`. |
| [M18 — Launch](#m18--launch-open-rows) | 1 | `core-065` (ready, unparked 2026-11-07); GA checks and the close check. Publish, domain, Sentry and the clean-up rows are done. |
| [M5 — Hardware Library](#m5--hardware-library-open-rows) | 2 | `core-074` and `ui-080`, the threads pair. Ready; `core-074` no longer depends on the deferred `core-073`. |
| [M15 — Mergeable project file](#m15--a-mergeable-project-file-reserved-rows) | 4 reserved | `data-012`, `io-013`, `ai-018`, `ai-019`. No task files yet. |
| [Findings](#findings-open-rows) | 27 | `testing-010`, `testing-009`, `testing-013`, `testing-015`, `testing-016`, `perf-004`, and from the 2026-11-07 VERIFY.md pass `testing-017` to `testing-025`, `docs-031`, `docs-032`, `docs-033`, `perf-005`, and from the Safari pass `testing-026`, `testing-027`, `testing-028`, and from the third pass `testing-029` to `testing-033`. |
| [M11 — Gears](#m11--gears-open-rows) | 7 | Runs last. `core-048`, `core-049`, `core-062`, `ui-057`, `ui-058`, `testing-002`, `docs-021`. |
| Outside milestones | owed only | `build-016` owner steps; the deferred JSCAD V3 family; the deferred `io-025`. |

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
