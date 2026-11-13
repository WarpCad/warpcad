# TODO/ROADMAP.md — Remaining Work

Only what is still open. Everything finished is in [TODO/ROADMAP-DONE.md](ROADMAP-DONE.md). This file is the source
`/run-todos` reads for order, and the table `/fix-todo` edits when a task opens, closes or changes priority.

**Snapshot:** 2026-11-13. Counts are in the [Status summary](#status-summary) at the foot of this file.

> **What do I run next?** `/run-todos` runs **only the [Findings](#findings-open-rows) table**, top to bottom. That table
> is in the same order as [Next up](#next-up--recommended-todos). Everything else here is held, deferred or reserved, and
> held or deferred work is written as a list, not a table, so the runner cannot pick it up. `⏳ Waits on N` means row N
> has to land first. Run `/fix-todo <id>` for one task, or `/loop /run-todos` to work down the table.
> **Filenames name the milestone, not the order.** `ls TODO` groups the backlog as `FIND-…` (the Findings table) and
> `DEFER-…` (parked); the native `M19-…` files are in `warpcad-native/TODO/`. The ranked order lives only in Next up.

## Contents

- [Next up — recommended TODOs](#next-up--recommended-todos)
- [Held — not run by /run-todos](#held--not-run-by-run-todos)
- [Decided 2026-10-24 and still waiting on you](#decided-2026-10-24-and-still-waiting-on-you)
- [All open work](#all-open-work)
- [Open milestones](#open-milestones)
  - [M19 — Native iOS app (Tauri), held](#m19--native-ios-app-tauri-held)
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
4. **`testing-022` and `testing-032` run in the loop**, with `claude -p` on the owner's subscription. Consent for `testing-022`'s
   `ai-028` #1 row and its temporary MCP-config edit is recorded in its file.
5. **`testing-026` and `testing-027` are held** (setup still missing; see [Held](#held--not-run-by-run-todos)).
6. **`testing-033` is held** and run by hand, because its job is to ask questions.
7. **Nothing native is pushed**, to GitHub or the App Store. Every M19 row is held.

**Order, and why.** Rows 1–3 fix flaky and drifted tests first, so later tasks' full runs start green. Rows 4–10 are independent
fixes, ending with the two big Opus refactors; `ui-108` splits `Viewport.vue` before the theme chain touches the renderer.
Rows 11–20 are the theme chain; the guard (`testing-036`) lands right after the token split so the migrations can't regress it,
and the umbrella `ui-111` closes last. Rows 21–34 drive the parked VERIFY.md checks against the finished UI.
**Opus tasks** (each splits into an Opus half and a Sonnet half): `perf-004`, `ui-108`, `render-008`.
**New findings a task files** get a Findings row at the bottom of the table and run after row 34, unless the owner re-ranks them.

| # | State | Milestone | Task | Model |
|---|---|---|---|---|
| 9 | ▶ Ready | `FIND` | [`perf-004`](FIND-perf-004-kernel-registry-metadata-in-the-main-bundle.md) Split the op registry's metadata from its code (~380 kB out of the main bundle) | opus |
| 10 | ▶ Ready | `FIND` | [`ui-108`](FIND-ui-108-viewport-vue-holds-interaction-logic.md) Move `Viewport.vue`'s interaction logic into render controllers and composables | opus |
| 14 | ▶ Ready | `FIND` | [`ui-114`](FIND-ui-114-base-button-and-icon-button.md) Base Button and IconButton; 68 components move off their own button rule | sonnet |
| 15 | ▶ Ready | `FIND` | [`ui-115`](FIND-ui-115-base-field-and-number-field.md) Base form fields; one unit-aware NumberField | sonnet |
| 16 | ▶ Ready | `FIND` | [`ui-116`](FIND-ui-116-base-dialog-sheet-popover.md) Base Dialog, Sheet and Popover on `ModalShell` | sonnet |
| 17 | ⏳ Waits on 14 | `FIND` | [`ui-117`](FIND-ui-117-base-toast-banner-chip-heading.md) Base Toast, Banner, Chip, SectionHeading, ListRow | sonnet |
| 18 | ▶ Ready | `FIND` | [`render-008`](FIND-render-008-renderer-theme-bridge.md) The 3D view reads its colours from the theme tokens | opus |
| 19 | ⏳ Waits on 14–18 | `FIND` | [`ui-118`](FIND-ui-118-theme-migration-sweep.md) Theme migration sweep; empty the guard's allow-list (last in the chain) | sonnet |
| 20 | ⏳ Waits on 14–19 | `FIND` | [`ui-111`](FIND-ui-111-theme-architecture-umbrella.md) Close the theme umbrella: check every step is in `TODO/done/` and the guard's allow-list is empty (no code) | sonnet |
| 21 | ▶ Ready | `FIND` | [`testing-021`](FIND-testing-021-verify-rows-overtaken-by-later-work.md) Re-check VERIFY.md rows later work appears to have answered (7 rows) | sonnet |
| 22 | ▶ Ready | `FIND` | [`testing-017`](FIND-testing-017-verify-layout-and-engine-checks-in-emulation.md) Drive the VERIFY.md layout and engine checks (11 rows) | sonnet |
| 23 | ▶ Ready | `FIND` | [`testing-018`](FIND-testing-018-verify-checks-on-copies-of-owner-files.md) Drive the VERIFY.md checks on the owner's files, against copies (7 rows) | sonnet |
| 24 | ▶ Ready | `FIND` | [`testing-019`](FIND-testing-019-verify-desktop-flow-checks.md) Drive the VERIFY.md flow checks at laptop width (13 rows) | sonnet |
| 25 | ▶ Ready | `FIND` | [`testing-020`](FIND-testing-020-verify-touch-timing-and-offline-checks.md) Drive the VERIFY.md touch, timing and offline checks (8 rows) | sonnet |
| 26 | ▶ Ready | `FIND` | [`testing-022`](FIND-testing-022-verify-mcp-checks-with-claude-code-as-client.md) Drive the VERIFY.md MCP and live-bridge checks with Claude Code as client (12 rows) | sonnet |
| 27 | ▶ Ready | `FIND` | [`testing-023`](FIND-testing-023-verify-exported-files-in-real-tools.md) Open exported STL, OBJ and glTF files in real tools (6 rows) | sonnet |
| 28 | ▶ Ready | `FIND` | [`testing-024`](FIND-testing-024-verify-deployed-site-and-github-checks.md) Answer the VERIFY.md deploy and CI checks from the live site and gh history (10 rows) | sonnet |
| 29 | ▶ Ready | `FIND` | [`testing-025`](FIND-testing-025-verify-git-hook-and-build-output-checks.md) Drive the pre-push hook, dev-only specs and build notices (6 rows) | sonnet |
| 30 | ▶ Ready | `FIND` | [`testing-029`](FIND-testing-029-verify-cold-read-panel.md) Cold-read panel: fresh agents answer the "does a stranger understand this" rows | sonnet |
| 31 | ▶ Ready | `FIND` | [`testing-030`](FIND-testing-030-verify-look-and-legibility-on-real-gpu.md) Look-and-legibility rows on the Mac's real GPU, with contrast, ΔE and flicker measurements | sonnet |
| 32 | ▶ Ready | `FIND` | [`testing-031`](FIND-testing-031-verify-tap-timing-reach-and-step-counts.md) Tap accuracy, timing, reach and step counts for the VERIFY.md phone rows | sonnet |
| 33 | ▶ Ready | `FIND` | [`testing-032`](FIND-testing-032-verify-model-behaviour-over-mcp.md) Model-behaviour rows through Claude Code over MCP, not an API key | sonnet |
| 34 | ▶ Ready | `FIND` | [`perf-005`](FIND-perf-005-bundle-load-bench-against-deployed-url.md) Point the bundle-load bench at the deployed Pages build | sonnet |
| 35 | ▶ Ready | `FIND` | [`ai-035`](FIND-ai-035-serve-skills-over-mcp.md) Serve WarpCad skills (add clearances, create an enclosure) from the MCP server, per SEP-2640 | opus |

---

## Held — not run by /run-todos

**Native app (M19), all rows.** Owner rule 2026-11-13: nothing for the native app is pushed yet, to GitHub or to the App Store. The
rest need the iPad in hand. Details in [M19](#m19--native-ios-app-tauri-held).

**Findings that need the owner first:**

- [`testing-026`](FIND-testing-026-verify-desktop-safari-checks-with-safaridriver.md) Desktop-Safari checks through safaridriver (6 rows; session start still times out). **Held:** `safaridriver` is enabled and **Allow remote automation** is on, but `POST /session` still times out connecting to Safari (probed 2026-11-13, inside and outside the sandbox). Not yet diagnosed: try with Safari quit and no profile picker or modal open. Give it a Findings row once a session starts
- [`testing-027`](FIND-testing-027-verify-ios-safari-checks-in-the-simulator.md) iOS Safari behaviour checks in the iOS Simulator (34 rows). **Held:** each simulator needs Settings › Safari › Advanced › **Remote Automation** turned on first
- [`testing-028`](FIND-testing-028-verify-native-dialog-checks-with-computer-use.md) Checks blocked on native OS dialogs and private windows, with computer use (6 rows). **Held:** needs computer use, which only the Claude desktop app has
- [`testing-033`](FIND-testing-033-owner-decisions-from-verify.md) Gather the ~80 owner decisions parked in VERIFY.md; ask in batches. **Held:** its whole job is asking the owner ~80 questions in batches; run it by hand with `/fix-todo testing-033`, never in the loop

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

**Decided 2026-11-12:** no workflows run on GitHub. `warpcad-native` gets no remote for now (the question of where to push it is closed by this), and `build-027` keeps only its local half: the `npm run check` script and the `deny.toml` fix. Owner reason: "I don't want any workflows running on github." Not decided: whether to delete the existing `warpcad-native/.github/workflows/windows.yml`, which cannot run without a remote, and whether a local `pre-push` hook should stand in for CI.

**Decided 2026-11-12:** push the 20 unpushed commits on `main` after a full unit run and a full e2e run are green on the current HEAD and the three uncommitted doc edits (`TROUBLESHOOTING.md`, `docs/decisions/release.md`, `docs/native-apps.md`) are committed. Pushing still needs the owner's go-ahead at the moment of the push. No reason beyond the recommendation was given.

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
| [`perf-004`](FIND-perf-004-kernel-registry-metadata-in-the-main-bundle.md) Keep the kernel's implementations out of the main-thread bundle (split the op registry's metadata from its code) | finding | low | opus | ▶ Ready (Next up row 9) |
| [`ui-108`](FIND-ui-108-viewport-vue-holds-interaction-logic.md) Move Viewport.vue's interaction logic into render controllers and composables | finding | medium | opus | ▶ Ready (Next up row 10) |
| [`ui-114`](FIND-ui-114-base-button-and-icon-button.md) Base Button and IconButton, and move every hand-styled button onto them | finding | medium | sonnet | ▶ Ready (Next up row 14) |
| [`ui-115`](FIND-ui-115-base-field-and-number-field.md) Base form fields, with one unit-aware NumberField in place of two number-entry patterns | finding | high | sonnet | ▶ Ready (Next up row 15) |
| [`ui-116`](FIND-ui-116-base-dialog-sheet-popover.md) Base Dialog, Sheet and Popover frames, built on ModalShell | finding | medium | sonnet | ▶ Ready (Next up row 16) |
| [`ui-117`](FIND-ui-117-base-toast-banner-chip-heading.md) Base Toast, Banner, Chip, SectionHeading and ListRow | finding | low | sonnet | ⏳ Waits on 14 (Next up row 17) |
| [`render-008`](FIND-render-008-renderer-theme-bridge.md) The 3D view reads its colours from the theme tokens | finding | high | opus | ▶ Ready (Next up row 18) |
| [`ui-118`](FIND-ui-118-theme-migration-sweep.md) Theme migration sweep — replace the remaining style literals and empty the guard's allow-list | finding | low | sonnet | ⏳ Waits on 14–18 (Next up row 19) |
| [`ui-111`](FIND-ui-111-theme-architecture-umbrella.md) Theme architecture — restyle the whole UI from a small, known set of files (umbrella) | finding | high | sonnet | ⏳ Waits on 14–19 (Next up row 20) |
| [`testing-021`](FIND-testing-021-verify-rows-overtaken-by-later-work.md) Re-check the VERIFY.md rows that later work appears to have answered, then close or reword them | finding | low | sonnet | ▶ Ready (Next up row 21) |
| [`testing-017`](FIND-testing-017-verify-layout-and-engine-checks-in-emulation.md) Drive the VERIFY.md layout and engine checks that emulated viewports and the three Playwright engines can settle | finding | medium | sonnet | ▶ Ready (Next up row 22) |
| [`testing-018`](FIND-testing-018-verify-checks-on-copies-of-owner-files.md) Drive the VERIFY.md checks that name the owner's own project files, against copies | finding | medium | sonnet | ▶ Ready (Next up row 23) |
| [`testing-019`](FIND-testing-019-verify-desktop-flow-checks.md) Drive the VERIFY.md flow checks that only need the built app at laptop width | finding | medium | sonnet | ▶ Ready (Next up row 24) |
| [`testing-020`](FIND-testing-020-verify-touch-timing-and-offline-checks.md) Drive the VERIFY.md touch, timing and offline checks that emulation and real timers can settle | finding | medium | sonnet | ▶ Ready (Next up row 25) |
| [`testing-022`](FIND-testing-022-verify-mcp-checks-with-claude-code-as-client.md) Drive the VERIFY.md MCP and live-bridge checks with a real Claude Code as the client | finding | medium | sonnet | ▶ Ready (Next up row 26) |
| [`testing-023`](FIND-testing-023-verify-exported-files-in-real-tools.md) Open WarpCad's exported STL, OBJ and glTF files in real tools on this Mac | finding | medium | sonnet | ▶ Ready (Next up row 27) |
| [`testing-024`](FIND-testing-024-verify-deployed-site-and-github-checks.md) Answer the VERIFY.md deploy and CI checks from the live site and the GitHub run history | finding | medium | sonnet | ▶ Ready (Next up row 28) |
| [`testing-025`](FIND-testing-025-verify-git-hook-and-build-output-checks.md) Drive the VERIFY.md pre-push hook, dev-only spec and build-output checks locally | finding | low | sonnet | ▶ Ready (Next up row 29) |
| [`testing-029`](FIND-testing-029-verify-cold-read-panel.md) Run a cold-read panel on the VERIFY.md "does a stranger understand this" rows | finding | medium | sonnet | ▶ Ready (Next up row 30) |
| [`testing-030`](FIND-testing-030-verify-look-and-legibility-on-real-gpu.md) Drive the VERIFY.md look-and-legibility rows on this Mac's real GPU and screen, with measurements | finding | medium | sonnet | ▶ Ready (Next up row 31) |
| [`testing-031`](FIND-testing-031-verify-tap-timing-reach-and-step-counts.md) Measure the VERIFY.md tap-accuracy, timing, reach and step-count rows in emulation | finding | medium | sonnet | ▶ Ready (Next up row 32) |
| [`testing-032`](FIND-testing-032-verify-model-behaviour-over-mcp.md) Drive the VERIFY.md model-behaviour rows through Claude Code over MCP instead of an API key | finding | medium | sonnet | ▶ Ready (Next up row 33) |
| [`perf-005`](FIND-perf-005-bundle-load-bench-against-deployed-url.md) Point the bundle-load bench at the deployed GitHub Pages build | finding | low | sonnet | ▶ Ready (Next up row 34) |
| [`ai-035`](FIND-ai-035-serve-skills-over-mcp.md) Serve WarpCad skills from the MCP server using the Skills extension (SEP-2640) | feature | medium | opus | ▶ Ready (Next up row 35) |
| [`testing-026`](FIND-testing-026-verify-desktop-safari-checks-with-safaridriver.md) Drive the VERIFY.md desktop-Safari checks in real Safari through safaridriver | finding | medium | sonnet | Held (owner first) |
| [`testing-027`](FIND-testing-027-verify-ios-safari-checks-in-the-simulator.md) Drive the VERIFY.md iOS Safari behaviour checks in the iOS Simulator | finding | high | sonnet | Held (owner first) |
| [`testing-028`](FIND-testing-028-verify-native-dialog-checks-with-computer-use.md) Drive the VERIFY.md checks blocked on native OS dialogs and private windows, with computer use | finding | medium | sonnet | Held (owner first) |
| [`testing-033`](FIND-testing-033-owner-decisions-from-verify.md) Gather the owner decisions parked in VERIFY.md, draft a recommendation for each, and ask in batches | finding | medium | sonnet | Held (owner first) |
| [`build-019`](../../warpcad-native/TODO/M19-build-019-ios-signing-and-testflight.md) Signing and a TestFlight build (M19) | feature | high | sonnet | Held (native) |
| [`build-018`](../../warpcad-native/TODO/M19-build-018-tauri-ios-device-probe.md) Measure the app on the iPad; settle the decision record's unknowns (M19) | feature | high | sonnet | Held (native) |
| [`testing-011`](../../warpcad-native/TODO/M19-testing-011-acceptance-scenario-28-ios-app.md) Scenario 28 on the device, then the free-form pass (M19) | feature | high | sonnet | Held (native) |
| [`build-020`](../../warpcad-native/TODO/M19-build-020-app-store-submission-readiness.md) Listing, privacy, licence audits; stops before Submit (M19) | feature | high | sonnet | Held (native) |
| [`io-026`](../../warpcad-native/TODO/M19-io-026-lidar-scan-to-mesh-part.md) Scan an object with the iPad Pro's LiDAR into My parts (1.1) (M19) | feature | medium | opus | Held (native) |
| [`testing-035`](../../warpcad-native/TODO/M19-testing-035-device-checks-from-architecture-audit.md) Check the architecture audit's nine browser assumptions on real web views (M19) | finding | medium | sonnet | Held (native) |
| [`build-030`](../../warpcad-native/TODO/M19-build-030-universal-links-open-share-links-in-the-app.md) Share links open in the installed app (universal links; 1.1) (M19) | feature | medium | sonnet | Held (native) |
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

M19 is held, M18 has only owner steps, M15 has only reserved ids, so the Findings table is the only one `/run-todos` works from.
M20 is done ([ROADMAP-DONE.md](ROADMAP-DONE.md#m20--home-page-at-warpcadcom)). The open rows of M5, M11 and M18 were deferred on 2026-11-07 and are listed
under [Deferred](#open-work-outside-any-milestone).

### M19 — Native iOS app (Tauri), held

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

> **Held 2026-11-13 (owner):** nothing for the native app is pushed yet, to GitHub or to the App Store, so `/run-todos`
> runs none of these. They are a list, not a table, so the runner cannot pick them up. Each is run by hand when the owner
> has the device and wants it.

- [`build-019`](../../warpcad-native/TODO/M19-build-019-ios-signing-and-testflight.md) Signing and a TestFlight build. **Held:** uploads to App Store Connect.
- [`build-018`](../../warpcad-native/TODO/M19-build-018-tauri-ios-device-probe.md) Measure the app on the iPad; settle the decision record's unknowns. **Held:** needs the device in hand (probe branch `probe/build-018`, runbook `PROBE-build-018.md`).
- [`testing-011`](../../warpcad-native/TODO/M19-testing-011-acceptance-scenario-28-ios-app.md) Scenario 28 on the device, then the free-form pass. **Held:** needs the device and a human.
- [`build-020`](../../warpcad-native/TODO/M19-build-020-app-store-submission-readiness.md) Listing, privacy, licence audits; stops before Submit. **Held:** App Store work; waits on `build-019`, `testing-011` and the Part 6 legal gate.
- [`io-026`](../../warpcad-native/TODO/M19-io-026-lidar-scan-to-mesh-part.md) Scan an object with the iPad Pro's LiDAR into My parts (1.1). **Held:** needs the device (probe branch `probe/io-026`, runbook `PROBE-io-026.md`).
- [`testing-035`](../../warpcad-native/TODO/M19-testing-035-device-checks-from-architecture-audit.md) Check the architecture audit's nine browser assumptions on real web views. **Held:** needs a person driving the macOS shell's web view (Playwright cannot) and publishes a real gist.
- [`build-030`](../../warpcad-native/TODO/M19-build-030-universal-links-open-share-links-in-the-app.md) Share links open in the installed app (universal links; 1.1). **Held:** waits on `build-019` and publishes a hosted file with the team ID.

**Order (reordered 2026-11-08: the owner cannot sign yet, so no device install is possible until the signing gate).**

1. **On this Mac, no signing:** `build-017` → `render-006` → `io-015` → `ai-025` → `ai-026` (and `build-024`, done 2026-11-12). Each is checked on the macOS shell and the
   iOS simulator. `render-006` and `ai-025` do not depend on each other.
2. **The signing gate (owner):** the setup listed in `build-019` and in Next up row 7.
3. **On the iPhone:** `build-019` (first install, from TestFlight) → `build-018` (measure it; a contradicting
   answer files a finding against rows 2–6) → `testing-011` (**stop for the five-minute free-form pass**) →
   `build-020` (**stop for the owner's legal review and Submit**). `io-026` comes after that, as a 1.1 feature.

**If time runs short**, the cut line that still gives a publishable app is: `build-017`, `render-006`,
then the signing gate, `build-019`, `build-018`, `testing-011` (with steps 7 and 8 marked not driven) and
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
| `perf-004` | Split the op registry's metadata from its code, so about 380 kB of kernel leaves the main bundle | Finding | — | none |
| `ui-108` | Move `Viewport.vue`'s 3,900 lines of interaction logic into render controllers and composables. Filed 2026-11-10 from the architecture audit | Finding | — | 1, 4, 6, 7, 9 |
| `ui-114` | Base Button and IconButton; 68 components move off their own button rule. Filed 2026-11-10 from the architecture audit | Finding | `ui-112` | 1, 4, 7, 10, 24 |
| `ui-115` | Base form fields; one unit-aware NumberField replaces two number-entry patterns that disagree on `12,5` and `12.5 mm`. Filed 2026-11-10 from the architecture audit | Finding | `ui-112` | 2, 12, 21 |
| `ui-116` | Base Dialog, Sheet and Popover on `ModalShell`; ten hand-rolled overlays move on. Filed 2026-11-10 from the architecture audit | Finding | `ui-110`, `ui-112` | 7, 10, 11, 17, 21, 24, 29 |
| `ui-117` | Base Toast (queued), Banner, Chip, SectionHeading, ListRow. Filed 2026-11-10 from the architecture audit | Finding | `ui-112`, `ui-114` | 6, 18, 22, 29 |
| `render-008` | The 3D view reads its colours from the theme tokens (one read per theme change, never per frame). Filed 2026-11-10 from the architecture audit | Finding | `ui-112`, `ui-113` | 1, 4, 13 |
| `ui-118` | Theme migration sweep: replace the remaining style literals and empty the guard's allow-list. Filed 2026-11-10 from the architecture audit | Finding | `ui-112`, `testing-036`, `ui-114`–`ui-117`, `render-008` | 1, 4, 7, 9, 10, 13 |
| `ui-111` | Theme architecture umbrella, closed last (re-wired 2026-11-13: it depends on its chain, not the other way round): token layers, base components, theme switch, renderer bridge, guard. Its three owner decisions were answered 2026-11-10. Filed 2026-11-10 from the architecture audit | Finding | `ui-112`–`ui-118`, `testing-036`, `render-008` | 1, 4, 7, 9, 10, 13 |
| `testing-021` | Re-check VERIFY.md rows later work appears to have answered; close or reword (7 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | none |
| `testing-017` | Drive the VERIFY.md layout and engine checks emulation and the three engines can settle (11 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | none (part of 6) |
| `testing-018` | Drive the VERIFY.md checks that name the owner’s files, against copies (7 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | 31, 10 |
| `testing-019` | Drive the VERIFY.md flow checks that need only the built app at laptop width (13 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | 6, 10, 11, 16 |
| `testing-020` | Drive the VERIFY.md touch, timing and offline checks emulation can settle (8 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | 7 (if `ui-062` #4 reproduces) |
| `testing-022` | Drive the VERIFY.md MCP and live-bridge checks with a real Claude Code as client (12 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | 23, 25 |
| `testing-023` | Open exported STL, OBJ and glTF files in Cura, MeshLab and a glTF viewer (6 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | 11, 26 |
| `testing-024` | Answer the VERIFY.md deploy and CI checks from the live site and gh run history (10 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | none |
| `testing-025` | Drive the pre-push hook against a scratch remote, the dev-only specs and the build notices (6 rows). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | 24, 25 (scripted only) |
| `testing-029` | Cold-read panel: fresh agents answer the VERIFY.md “does a stranger understand this” rows. Filed 2026-11-07 from the VERIFY.md third pass | Finding | — | none |
| `testing-030` | Look-and-legibility rows on the Mac’s real GPU and screen, with contrast, ΔE and flicker measurements. Filed 2026-11-07 from the VERIFY.md third pass | Finding | — | 5, 13 |
| `testing-031` | Measure tap accuracy (scattered fingertip taps), timing, reach and step counts for the VERIFY.md phone rows. Filed 2026-11-07 from the VERIFY.md third pass | Finding | — | 7 |
| `testing-032` | Model-behaviour rows through Claude Code over MCP instead of an API key. Filed 2026-11-07 from the VERIFY.md third pass | Finding | — | 17, 18 (MCP route) |
| `perf-005` | Point the bundle-load bench at the deployed Pages build (`perf-002` #1). Filed 2026-11-07 from the VERIFY.md AI-drivable pass | Finding | — | none |
| `ai-035` | Serve skills (add clearances to a group, create an enclosure) from the MCP server per SEP-2640; opens with an SDK-support check. Filed 2026-11-13 at the owner's request | Finding | — | none (re-run `testing-022` MCP checks) |

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
- Held rows: every M19 native row and four findings, in [Held](#held--not-run-by-run-todos).
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
   `model`). `<MILESTONE>` is `M19` (in `warpcad-native`), `FIND` (Findings table) or `DEFER`; older prefixes (`M05`, `M11`, `M18`, `M20`) apply if those milestones reopen
   (see [TODO/README.md](README.md#naming-convention)). If a task changes milestone, `git mv` it to the new prefix and fix
   every link to it in the same commit.
2. Add a row to its milestone table here, or to **Findings** if it has none. A file with no row is invisible to
   `/run-todos`. A held or deferred task is written as a list item, never a table row, so the runner cannot reach it.
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
| [Findings](#findings-open-rows) | 33 queued + 4 held | The runner's queue: test health, independent fixes, `perf-004` and `ui-108`, the theme chain (`ui-112`–`ui-118`, `testing-036`, `render-008`, closed by `ui-111`), then the VERIFY.md drives. Held: `testing-026`, `testing-027`, `testing-028`, `testing-033`. |
| [M19 — Native iOS app](#m19--native-ios-app-tauri-held) | 7 held | `build-019`, `build-018`, `testing-011`, `build-020`, `io-026`, `testing-035`, `build-030`. Nothing native is pushed yet (owner, 2026-11-13). |
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
