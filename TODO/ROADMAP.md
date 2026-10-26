# TODO/ROADMAP.md — Remaining Work

Only what is still open. Everything finished is in [TODO/ROADMAP-DONE.md](ROADMAP-DONE.md). This file is the source
`/run-todos` reads for order, and the table `/fix-todo` edits when a task opens, closes or changes priority.

**Snapshot:** 2026-10-24. Counts are in the [Status summary](#status-summary) at the foot of this file.

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

*Last reviewed 2026-10-26 (M19 scheduled first at the owner's request; `ai-027`–`ai-030` added as row 21).*

**Goal:** this weekend, a native iOS app built with **Tauri 2** (owner decision 2026-10-24, not Capacitor) that
bundles the full WarpCad build, saves real files the Files app can see, hosts an MCP server for agents, and is
ready for the owner to submit to the App Store. It lives in the sibling repository `~/src/@WarpCad/warpcad-native`.
See [M19](#m19--native-ios-app-tauri). The web push is still held on `testing-007` (row 12): M19 rows that change
this repository need the same green full run before they are pushed.

| # | Task | Why now | Model |
|---|---|---|---|
| 1 | ▶ [`build-017`](build-017-tauri-ios-shell-scaffold.md) Scaffold the Tauri 2 iOS app beside this repo, bundling the build | Everything in M19 builds on it | opus |
| 2 | [`build-018`](build-018-tauri-ios-device-probe.md) Measure the app on the iPhone; settle the decision record's unknowns | Its answers set `io-014`'s and `ai-026`'s scope | sonnet |
| 3 | [`build-019`](build-019-ios-signing-and-testflight.md) Signing and a TestFlight build | Early on purpose: Tauri's open iOS bugs are in this step. **Owner steps first** (Apple Developer account, bundle id) | sonnet |
| 4 | [`render-006`](render-006-webgl-context-restore.md) Restore the 3D view after a lost WebGL context | "Reload the page" is a dead end with no browser chrome | opus |
| 5 | [`io-014`](io-014-native-app-file-mode.md) Save, open and export real files, visible in the Files app | Local file access | opus |
| 6 | [`io-015`](io-015-native-durable-autosave-and-library.md) Mirror the autosave and My parts to native files | iOS can evict WebView storage | sonnet |
| 7 | [`ai-025`](ai-025-native-keychain-credentials.md) API key and GitHub token in the Keychain | Secrets out of evictable storage | sonnet |
| 8 | [`ai-026`](ai-026-mcp-server-in-the-native-app.md) An MCP server inside the app | MCP service for agents | opus |
| 9 | [`testing-011`](testing-011-acceptance-scenario-28-ios-app.md) Scenario 28, the iOS app end to end, on the iPhone; free-form pass | The only check a fake Tauri boundary cannot stand in for | sonnet |
| 10 | [`build-020`](build-020-app-store-submission-readiness.md) App Store listing, privacy, licence audits; stops at the owner's **Submit** | Ends at the Part 6 legal gate | sonnet |
| 11 | ▶ M20 home page: [`docs-026`](docs-026-home-page-site-decision.md) → [`build-021`](build-021-home-page-repo-scaffold.md) → [`testing-012`](testing-012-help-deep-link-from-outside.md) → [`docs-027`](docs-027-home-page-content-and-docs-links.md) → [`build-022`](build-022-home-page-live-on-warpcad-com.md) | `warpcad.com` is a parking page; the docs can only be found from inside the app. `docs-026` and `testing-012` are ready | sonnet |
| 12 | ▶ [`testing-007`](testing-007-e2e-failures-present-before-ui-075.md) E2E specs that fail on a clean tree | Full suite is red; this gates the push | sonnet |
| 13 | ▶ [`ui-079`](ui-079-tiered-library-and-operations-panels.md) Shrink the Library and Operations panels between laptop and phone width | High; stages 1–3 are implemented per its file | opus |
| 14 | ▶ [`testing-010`](testing-010-ai-working-chip-docs-screenshot-drifts.md) Docs screenshot `ai-working-chip` drifts on laptop | Found by the `ui-083` commit gate; decide intended change or regression | sonnet |
| 15 | ▶ [`testing-006`](testing-006-redrive-connected-scenarios-with-phone-header-entry.md) Hand-drive scenarios 24, 25 and the `ui-071` repro on the phone header entry | Closes `ui-075`'s Testing section | sonnet |
| 16 | ▶ [`ui-078`](ui-078-phone-header-width-budget.md) Give the 390 px header a real width budget | No width left after `ui-075` | sonnet |
| 17 | ▶ [`ui-074`](ui-074-repeat-note-wording.md) Repeat body Inspector note wording | Small | sonnet |
| 18 | ▶ [`perf-003`](perf-003-defer-code-unused-at-boot.md) Defer code unused at boot (Sentry included) | Faster cold start | sonnet |
| 19 | ▶ [`testing-005`](testing-005-triage-verify-md-open-rows.md) Triage the ~347 open rows in `TODO/VERIFY.md` | Keeps the manual queue small | sonnet |
| 20 | ▶ [`testing-008`](testing-008-print-prep-split-sheet-still-flakes-under-load.md) Print-prep split-sheet flake under load | Low | sonnet |
| 21 | ▶ [`ai-030`](ai-030-list-ops-summary-and-filter.md) and ▶ [`ai-027`](ai-027-mcp-instructions-carry-the-working-method.md) → [`ai-028`](ai-028-mcp-guide-resource.md) → [`ai-029`](ai-029-mcp-prompts-as-slash-commands.md) Teach agents WarpCad up front: a cheap `list_ops`, instructions, a guide resource, slash-command recipes and a Copy starter button | Agents relearn the tools every session; `list_ops` alone is ~7.6k tokens a call, the MCP instructions 1.1k characters against the in-app prompt's 9.8k | sonnet |
| 22 | M18 owner checks: GA rows and the close check (see [M18](#m18--launch-open-rows)) | Owner steps; no agent can run them | — |
| 22 | [`testing-009`](testing-009-webkit-scaffold-flakes-and-app-header-drift.md) WebKit viewport-scaffold specs fail under load, and two app-header screenshots drifted | Medium; now on a Findings row | sonnet |
| 23 | M5 threads: [`core-074`](core-074-thread-geometry-recipes.md), then [`ui-080`](ui-080-threads-library-section-and-inspector.md) | Ready; its dependency on `core-073` was dropped 2026-10-24 | opus / sonnet |
| 24 | Gears (M11, runs last): `ui-057` → `ui-058` → `core-048` → `core-049` → `core-062` → `testing-002` → `docs-021` | Order from M11's suggested order | sonnet / opus |

`core-065` stays parked (decided 2026-10-17: keep the Albany table for now) and is not ranked.

**Runner order** (`/run-todos` follows table order): [M19](#m19--native-ios-app-tauri) first, then
[M20](#m20--home-page-at-warpcadcom), then [M18](#m18--launch-open-rows), then the open milestone tables in this file's order, then
[M11](#m11--gears-open-rows) last.

---

## Decided 2026-10-24 and still waiting on you

**Decided 2026-10-24**

1. **Threads:** `core-074` no longer depends on `core-073`, so the M5 threads pair is ready. The JSCAD V3 family
   (`core-066`–`core-073`) stays deferred.
2. **Push:** hold `9d0b5de` and `dedfbc0` until `testing-007` is closed and a full e2e run is green. Nothing is pushed yet.
3. **Rows:** `ui-079`, `testing-009`, `testing-005` and `testing-010` now have rows in the Findings table, so `/run-todos` reaches them.
4. **Order:** `ui-079` is second in Next up. (Superseded the same day by item 5: M19 now runs first.)
5. **Native iOS app (M19):** built with **Tauri 2, not Capacitor**, overriding the decision record's
   recommendation (`docs/decisions/native-mobile-shell.md`, "Owner decision"); in the sibling repository
   `~/src/@WarpCad/warpcad-native`; bundles the full build; includes local file access and an MCP server inside the
   app. Scheduled first.

**Still waiting on you**

- **For M19 to start `build-019`:** an active Apple Developer Program membership, and confirmation of the bundle
  identifier (`build-017` proposes `com.warpcad.app`; it cannot change once App Store Connect has the record).
- **For M19 to finish `build-020`:** the Help-content / prose-licence choice, iPad or iPhone-only, Sentry in the
  app, price and age rating, and the Part 6 legal review in `docs/decisions/app-store-licensing.md`. The
  submission itself is yours.

- **Owner steps on `build-016`** (dual licence): Part 4 (repository settings) and Part 6 (review) are still open in
  `TODO/VERIFY.md`. The row is marked done, so these are tracked only there.

---

## All open work

Every open row in the milestone tables, plus the reserved rows. The milestone sections below repeat these rows
with their dependencies and acceptance columns; keep the two in step when a row changes.

| Milestone | Task | Kind | Priority | Model | State |
|---|---|---|---|---|---|
| M19 — Native iOS app | [`build-017`](build-017-tauri-ios-shell-scaffold.md) Scaffold the Tauri 2 iOS app in `~/src/@WarpCad/warpcad-native`, bundling the WarpCad build | feature | high | opus | ▶ **ready** |
| M19 — Native iOS app | [`build-018`](build-018-tauri-ios-device-probe.md) Measure the app on the owner's iPhone; settle the decision record's unverified rows | feature | high | sonnet | ⏳ after `build-017` |
| M19 — Native iOS app | [`build-019`](build-019-ios-signing-and-testflight.md) Distribution signing and a TestFlight build | feature | high | sonnet | ⏳ after `build-017`; owner steps first |
| M19 — Native iOS app | [`render-006`](render-006-webgl-context-restore.md) Restore the 3D view after a lost WebGL context | finding | high | opus | ⏳ after `build-017` |
| M19 — Native iOS app | [`io-014`](io-014-native-app-file-mode.md) Save, open and export real files in the app, visible in the Files app | feature | high | opus | ⏳ after `build-017`, `build-018` |
| M19 — Native iOS app | [`io-015`](io-015-native-durable-autosave-and-library.md) Mirror the autosave and My parts to native files | feature | medium | sonnet | ⏳ after `io-014` |
| M19 — Native iOS app | [`ai-025`](ai-025-native-keychain-credentials.md) API key and GitHub token in the iOS Keychain | feature | medium | sonnet | ⏳ after `build-017` |
| M19 — Native iOS app | [`ai-026`](ai-026-mcp-server-in-the-native-app.md) An MCP server inside the app (loopback, opt-in Wi-Fi with a token) | feature | high | opus | ⏳ after `build-017`, `build-018` |
| M19 — Native iOS app | [`testing-011`](testing-011-acceptance-scenario-28-ios-app.md) Acceptance scenario 28 on the iPhone, plus the free-form pass | feature | high | sonnet | ⏳ after `build-019`, `render-006`, `io-014`, `io-015`, `ai-025`, `ai-026` |
| M19 — Native iOS app | [`build-020`](build-020-app-store-submission-readiness.md) App Store readiness; stops at the owner's Submit | feature | high | sonnet | ⏳ after `build-019`, `testing-011` |
| M20 — Home page | [`docs-026`](docs-026-home-page-site-decision.md) Decide the home page's generator, canonical host, docs-link scheme and analytics; owner confirms three answers | feature | medium | sonnet | ▶ **ready** |
| M20 — Home page | [`build-021`](build-021-home-page-repo-scaffold.md) Scaffold `~/src/@WarpCad/warpcad.github.io`: build, tests at 3×3, SPDX, CNAME guard, Pages workflow; stops before `gh repo create` | feature | medium | sonnet | ⏳ after `docs-026` |
| M20 — Home page | [`testing-012`](testing-012-help-deep-link-from-outside.md) A cold `app.warpcad.com/#/help/<page>` link opens Help on that page; pin the unknown-slug outcome | feature | medium | sonnet | ▶ **ready** |
| M20 — Home page | [`docs-027`](docs-027-home-page-content-and-docs-links.md) The home page: hero, what it does, every docs page linked into Help from `help/index.json`, source, support | feature | medium | sonnet | ⏳ after `build-021`, `testing-012` |
| M20 — Home page | [`build-022`](build-022-home-page-live-on-warpcad-com.md) Verify the domain, move `warpcad.com` DNS off Squarespace, enforce HTTPS; `app` untouched. Owner steps | feature | medium | sonnet | ⏳ after `docs-027` |
| M18 — Launch | [`core-065`](core-065-wood-screw-holes-cite-asme-not-albany.md) Wood-screw hole table cites ASME B18.6.1 instead of Albany County Fasteners' chart (stops to ask if the pilot columns are not in the standard) | finding | high | sonnet | ⏸ **parked** (decided 2026-10-17: keep the Albany table for now) |
| Findings | [`testing-010`](testing-010-ai-working-chip-docs-screenshot-drifts.md) The docs screenshot "ai-working-chip still" fails on laptop; decide whether the chip changed on purpose or regressed | finding | medium | sonnet | ▶ **ready** (found 2026-10-24 by the `ui-083` commit gate) |
| Findings | [`ui-087`](ui-087-operations-popovers-hide-the-targets.md) The Align (and other operation) popovers cover the solids they act on and block orbiting; make them movable, non-modal, and open beside the selection | finding | medium | sonnet | ▶ **ready** (reported 2026-10-26 while testing Align/Snap) |
| Findings | [`ui-090`](ui-090-objects-section-hides-show-all-when-a-body-is-selected.md) The Objects section collapses while a body is selected, hiding its "N hidden · Show all" line exactly when a split piece has just been hidden; keep the summary in the header | finding | medium | sonnet | ▶ **ready** (found 2026-10-26 by the `ui-089` hand pass) |
| Findings | [`testing-006`](testing-006-redrive-connected-scenarios-with-phone-header-entry.md) Hand-drive scenarios 24, 25 and the `ui-071` repro with the phone header entry | feature | medium | sonnet | ▶ **ready** after `ui-075` |
| Findings | [`ui-078`](ui-078-phone-header-width-budget.md) The 390 px header has no width budget left; decide the layout before `ui-077` | finding | medium | sonnet | ▶ **ready** after `ui-075` |
| Findings | [`testing-007`](testing-007-e2e-failures-present-before-ui-075.md) E2E specs failing on a clean tree: colour control, selection, sketch operand, help footer | finding | high | sonnet | ▶ **ready** |
| Findings | [`testing-008`](testing-008-print-prep-split-sheet-still-flakes-under-load.md) Print-prep split-sheet still differs under full-suite load | finding | low | sonnet | ▶ **ready** |
| M5 — Hardware Library | [`core-074`](core-074-thread-geometry-recipes.md) Real helical threads: external and internal thread generator | feature | medium | opus | ▶ **ready** (dependency on `core-073` dropped 2026-10-24) |
| M5 — Hardware Library | [`ui-080`](ui-080-threads-library-section-and-inspector.md) Threads section in the Library, drag-to-place, Inspector fields | feature | medium | sonnet | ⏳ after `core-074`, `ui-052` |
| Findings | [`ui-074`](ui-074-repeat-note-wording.md) Repeat body Inspector note says the repeats follow every move | finding | low | sonnet | ▶ **ready** |
| Findings | [`perf-003`](perf-003-defer-code-unused-at-boot.md) Defer the code the app does not use at boot (Sentry, the AI agent and tool registry, a dev-only provider) | feature | low | sonnet | ▶ **ready** (from `perf-002`) |
| Findings | [`ui-079`](ui-079-tiered-library-and-operations-panels.md) Shrink the Library and Operations panels in steps between laptop and phone width | finding | high | opus | ▶ **ready** |
| Findings | [`testing-009`](testing-009-webkit-scaffold-flakes-and-app-header-drift.md) Two WebKit viewport-scaffold specs fail under parallel load; two app-header screenshots have drifted | finding | medium | sonnet | ▶ **ready** |
| Findings | [`testing-005`](testing-005-triage-verify-md-open-rows.md) Triage the ~347 Open rows in `TODO/VERIFY.md`: move, graduate or close each | finding | medium | sonnet | ▶ **ready** |
| Findings | [`ai-027`](ai-027-mcp-instructions-carry-the-working-method.md) MCP server instructions carry the working method, inside Claude Code's 2,048-character cap | feature | high | sonnet | ▶ **ready** |
| Findings | [`ai-028`](ai-028-mcp-guide-resource.md) The full modelling guide as the MCP resource `warpcad://guide`, one text with the in-app prompt | feature | high | sonnet | ⏳ after `ai-027` |
| Findings | [`ai-029`](ai-029-mcp-prompts-as-slash-commands.md) MCP prompts `start`, `build`, `check-print` (Claude Code slash commands), plus Copy starter buttons in the Assistant | feature | medium | sonnet | ⏳ after `ai-028` |
| Findings | [`ai-030`](ai-030-list-ops-summary-and-filter.md) `list_ops` summary and per-op filter, so learning the catalogue stops costing ~7.6k tokens a call | feature | high | sonnet | ▶ **ready** |
|  | `data-012` Tombstone and position-key compaction — `data-011` measured the section at 34-43% of an edited file (`bench/results/2026-10-12-data-011.md`), so the encoding proposals there are this task's starting point | reserved | — | — | 📝 no file yet; ▶ measured, ready to write up |
|  | `io-013` Import another project's bodies into this one (id remap) | reserved | — | — | 📝 no file yet; waits on `ui-062` |
|  | `ai-019` Standalone live-bridge host: `mcp/server.js --live` over a loopback WebSocket | reserved | — | — | 📝 no file yet; waits on `ui-062` |
|  | `ai-018` Relax `ai-012`'s one-writer refusals now that a merge exists | reserved | — | — | 📝 no file yet; waits on `ai-012`, `ai-017` |
|  | [`ui-057`](ui-057-gears-library-section-and-inspector.md) Gears section in the Library, drag-to-place, and a parametric Inspector with derived readouts | feature | high | sonnet | ⏳ waits on `core-041`, `core-048` |
|  | [`ui-058`](ui-058-gear-mesh-operation.md) Mesh operation — select two gears, click Mesh, and the second moves to the correct centre dista… | feature | high | opus | ⏳ waits on `ui-057` (`core-044` done) |
|  | [`core-048`](core-048-gear-hub-bore-keyway-and-set-screw.md) Gear hubs, bores, D-flats, keyways and set-screw holes — what every V1 gear project bolted on b… | feature | medium | sonnet | ▶ **ready** (`core-041` done) |
|  | [`testing-002`](testing-002-acceptance-scenario-19-gear-train.md) Acceptance scenario 19 — place two gears, mesh them, and confirm they turn without interpenetra… | feature | medium | sonnet | ⏳ waits on `ui-057`, `ui-058` |
|  | [`core-049`](core-049-planetary-gear-set.md) Planetary gear set — sun, planets, ring and carrier from one parameter record | feature | low | opus | ▶ **ready** (`core-043` and `core-044` done) |
|  | [`core-062`](core-062-herringbone-relief-groove.md) Herringbone relief groove — an optional gap at mid-thickness (`grooveMm`), split out of `core-042` | feature | low | sonnet | ▶ **ready** (`core-042` done) |
|  | [`docs-021`](docs-021-media-gears-and-porting-guide.md) Docs media for gears, and a "porting a jscad-gears script" guide | feature | low | sonnet | ⏳ waits on `ui-057`, `ui-058`, `testing-002` |

---

## Open milestones

Milestones appear in runner order: M19, then M18, M5, M15, Findings, and M11 last. A milestone whose rows are all
done is not listed here; its owed human passes are in [Owed](#open-work-outside-any-milestone).

### M19 — Native iOS app (Tauri)

[↑ Contents](#contents)

Added 2026-10-24 at the owner's request, scheduled first. The owner's goal is a native iOS app, working and ready to
publish, this weekend. It is built with **Tauri 2**, overriding the Capacitor recommendation in
`docs/decisions/native-mobile-shell.md` (see its "Owner decision" section for what changes). It lives in the
**sibling repository `~/src/@WarpCad/warpcad-native`**, which bundles this repository's `npm run build:native`
output. So most rows change **both repositories**: commit each one separately, and retire the row in this repository's
commit. The new repository has no pre-push gate of its own; its gates are `cargo fmt`, `clippy` and `cargo deny`
(`build-017`).

Playwright cannot drive a WKWebView inside an app. Each row's `*.e2e.js` runs at `/` with a fake Tauri boundary
(`e2e/fixtures/nativeShell.js`, `build-017`), and **every row also names what it drives on the owner's iPhone**.
Scenario 28 (`testing-011`) is the one acceptance check only the device can pass.

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `build-017` | Scaffold `warpcad-native` (Tauri 2), `build:native` here, `src/native/shell.js` (no `@tauri-apps/api` dependency: its licence expression is not on the allow-list), capabilities default-deny, `cargo deny`; Tauri health check re-run | Build | — | 1, 7; on device |
| `build-018` | On-device probe: size, cold start, memory, context loss, storage survival, `ws://`, file picker, Files visibility, **which agents can reach an in-app MCP server** | Build | `build-017` | 10 |
| `build-019` | Distribution signing and a TestFlight build, early, because Tauri's open iOS issues are in this step. Owner steps first | Build | `build-017` | 1, 7, 10 on device |
| `render-006` | `webglcontextrestored` rebuild plus a **Restore view** fallback; no page reload | Finding | `build-017` | 1, 7, 10 |
| `io-014` | `native-app` file mode: Save in place to Documents (shown in Files), Open + Browse…, exports as real files, Open in WarpCad | Operation | `build-017`, `build-018` | 10, 11, 22, 23, 26 |
| `io-015` | Native mirror of the autosave and My parts; restore on launch when IndexedDB was evicted | Core | `io-014` | 1, 10 |
| `ai-025` | Keychain behind `createCredentialStore`; one-time migration | Control | `build-017` | 24 |
| `ai-026` | `rmcp` Streamable HTTP server in the app relaying to `TabEndpoint`; lease from the existing sheet; loopback by default, Wi-Fi opt-in with a token; works only while the app is on screen | Control | `build-017`, `build-018` | 24, 25, 27 |
| `testing-011` | Acceptance scenario **28**, the iOS app end to end, driven on the iPhone; the M19 free-form pass | Testing | `build-019`, `render-006`, `io-014`, `io-015`, `ai-025`, `ai-026` | creates 28; 1, 7, 10, 25 |
| `build-020` | Listing, privacy labels and manifest, icons, native and asset licence audits, owner decisions; **stops before Submit** (Part 6 legal gate) | Build | `build-019`, `testing-011` | 28, 1, 7, 10 |

**Suggested order** (the owner can use the app after each step): `build-017` (app on the phone from Xcode) →
`build-018` → `build-019` (app from TestFlight) → `render-006` → `io-014` → `io-015` → `ai-025` → `ai-026` →
`testing-011` (**stop for the five-minute free-form pass on the iPhone**) → `build-020` (**stop for the owner's
legal review and Submit**). `render-006`, `ai-025` and `build-019` do not depend on each other and can run in any
order after `build-017`.

**This is a lot for one weekend.** Seven of the ten rows involve the device or an owner step, which the runner
cannot speed up. If time runs short, the cut line that still gives a publishable app is: `build-017`, `build-019`,
`render-006`, `io-014`, `testing-011` (with steps 7 and 8 marked not driven), `build-020`. `io-015`, `ai-025` and
`ai-026` can follow in a 1.1 update.

### M20 — Home page at warpcad.com

[↑ Contents](#contents)

Added 2026-10-24 at the owner's request: a WarpCad home page with links to the documentation, in the new
**sibling repository `~/src/@WarpCad/warpcad.github.io`** (the WarpCad org's Pages site). `docs/decisions/hosting.md`
kept the bare domain free for exactly this; today `warpcad.com` and `www` still resolve to a Squarespace parking page.
The docs stay where they are, rendered in the app's Help. The home page links each one as
`https://app.warpcad.com/#/help/<slug>`, built from the app's published `help/index.json`, so a new docs page shows up
at the next daily rebuild. `testing-012` is the one row in this repository: it turns that URL into a tested contract
before another site depends on it, and `perf-003` must keep it green. The home repository runs its own gates
(`build-021`); it has no LFS and no pre-push hook.

| id | Task | Kind | Depends | Acceptance |
|---|---|---|---|---|
| `docs-026` | Decision record `home-page.md`: generator (proposed plain HTML + zero-dep build), org-site routing, canonical host, docs via in-app Help, index at build time, no analytics, licence, deploy gate, App Store support URL | Docs | — | none |
| `build-021` | Scaffold `warpcad.github.io`: placeholder page, `build.mjs`/`serve.mjs`, Playwright 3 engines × 3 viewports, SPDX, CNAME guard (refuses `app.warpcad.com`), Pages workflow (push, daily, dispatch). Stops before `gh repo create` | Build | `docs-026` | none (no app change) |
| `testing-012` | `e2e/help-deep-link.e2e.js`: cold `/#/help/<slug>` and topic ids open Help, Esc clears the hash, `#/gist/` keeps priority, unknown slug gets a readable line; 3 × 3 | Testing | — | 1 (from a cold help link) |
| `docs-027` | The page: hero with Open WarpCad, What it does, every index page grouped by `docs-groups.json` (unknown → More, missing → build fails), source and licences, support, footer; CSP `script-src 'none'` | Docs | `build-021`, `testing-012` | none (no app change) |
| `build-022` | Owner steps in `TODO/VERIFY.md`: create repo, verify `warpcad.com` for the org, Squarespace A/AAAA/`www` records (leave `app`), Pages domain + HTTPS, live checks | Build | `docs-027` | 1 on the live app |

**Suggested order:** `docs-026` and `testing-012` (independent; either first) → `build-021` → `docs-027` → `build-022`
(**stop for the owner's DNS and Pages steps, then the five-minute free-form pass on `warpcad.com`**). If `docs-026`
makes `warpcad.com` the App Store support URL, `build-020` gains a dependency on `build-022`.

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
| `testing-006` | Hand-drive scenarios 24, 25 and the `ui-071` repro against the phone header entry. Split from `ui-075` 2026-10-18 | Feature | `ui-075` | 24, 25 |
| `ui-078` | The 390 px header has no width budget left after `ui-075`; decide the layout before `ui-077`. Filed 2026-10-18 | Finding | `ui-075` | 24, 25 |
| `testing-007` | E2E specs that fail on a clean tree (colour control, selection, sketch operand, help footer). Filed 2026-10-18 | Finding | — | 1, 5, 10 |
| `testing-008` | Print-prep split-sheet docs still differs by 2% under full-suite load, passes alone. Filed 2026-10-18 | Finding | — | none |
| `ui-074` | Repeat body Inspector note says the repeats follow every move, but a later Pi move moves only the Pi. Decided 2026-10-17 | Finding | `core-061` | 15 |
| `perf-003` | Defer the code the app does not use at boot (Sentry, the AI agent and tool registry, a dev-only provider); filed by `perf-002` with measured targets | Feature | `perf-002` | 1 |
| `testing-010` | The docs screenshot "ai-working-chip still" fails on laptop; decide whether the chip changed on purpose or regressed | Finding | — | none |
| `testing-005` | Triage the ~347 open rows in `TODO/VERIFY.md`: move, graduate or close each | Finding | — | none |
| `ui-079` | Shrink the Library and Operations panels in steps between laptop and phone width | Finding | — | 1, 5, 10 |
| `testing-009` | Two WebKit viewport-scaffold specs fail under parallel load, and two app-header screenshots have drifted | Finding | — | none |
| `ai-027` | MCP server instructions carry the working method (placement, operands, checks, printing defaults) inside Claude Code's 2,048-character cap. Filed 2026-10-26 | Feature | — | 23, 25 |
| `ai-028` | Serve the full modelling guide as `warpcad://guide` on both MCP servers, split out of `SYSTEM_PROMPT` so one text serves both. Filed 2026-10-26 | Feature | `ai-027` | 23, 25 (17, 18 if the chat prompt changes) |
| `ai-029` | Three MCP prompts (`start`, `build`, `check-print`), shown as `/mcp__warpcad__…` in Claude Code, each embedding the guide; **Copy starter** buttons in the subscription and Live MCP sheets. Filed 2026-10-26 | Feature | `ai-028` | 1, 23, 25 |
| `ai-030` | `list_ops` takes `detail: summary` (~4.1k vs 30.5k characters), `ops: [...]` and `kind`; no input unchanged; guidance names the cheap path. Filed 2026-10-26 | Feature | — | 17, 23, 24, 25, 27 |

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

**Open files with no roadmap row:** none as of 2026-10-24. The four that lacked a row (`ui-079`, `testing-009`,
`testing-005`, `testing-010`) now have Findings rows.

**Deferred, not scheduled**

- The JSCAD V3 family: [`core-066`](core-066-switch-kernel-to-jscad-v3.md) through
  [`core-073`](core-073-jscad-v3-land-the-switch.md). Each file says deferred until the owner chooses the switch.
  See decision 2 above.

**Owed**

- Owner steps for `build-016` (Parts 4 and 6), in `TODO/VERIFY.md`.
- Owner checks for `build-007` (GA) and the M18 close, above.
- **Free-form passes:** none owed. The 2026-10-17 decision records the M5–M10, M12, M16 and M17 passes as done.
  The next one falls due when the next milestone completes. M19's is taken inside `testing-011`, on the iPhone.

---

## Keeping this file up to date

This file holds only open work, so a row moves out of it when it closes:

**When a task finishes** (`/fix-todo` Step 8 does all of this in the same commit)

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

1. Write `TODO/<id>.md` with the usual front matter (`priority`, `milestone`, `depends`, `status`, `model`).
2. Add a row to its milestone table here, or to **Findings** if it has none. A file with no row is invisible to
   `/run-todos`.
3. Add or edit its row in **All open work**, and re-rank Next up if the priority changed.

**Rules for the summary rows**

- One line, under ~200 characters. Counts and what is left, never the story of how it was built. That belongs in
  the task's retirement note and its Completion Log row.
- Counts come from the tables, not from memory: count the open rows here.
- Bump the **Last reviewed** date in Next up whenever you re-rank it.

**Spot check** (finds open files with no row in either roadmap file; expect the three untracked items above)

```sh
for f in TODO/[a-z]*-[0-9]*.md; do id=$(basename "$f" | grep -oE '^[a-z]+-[0-9]+[a-z]?'); \
  grep -q "\`$id\`" TODO/ROADMAP.md TODO/ROADMAP-DONE.md || echo "missing from ROADMAP: $id"; done
```

---

## Status summary

One line per milestone. Closed milestones are listed in [ROADMAP-DONE.md](ROADMAP-DONE.md).

| Milestone | Open rows | What is left |
|---|---|---|
| [M19 — Native iOS app](#m19--native-ios-app-tauri) | 10 | Runs first. `build-017` ready; the rest wait on it. Tauri 2 in `warpcad-native`; ends at the owner's App Store submit. |
| [M20 — Home page](#m20--home-page-at-warpcadcom) | 5 | `docs-026` and `testing-012` ready. New repo `warpcad.github.io`; ends at the owner's DNS steps for `warpcad.com`. |
| [M18 — Launch](#m18--launch-open-rows) | 1 | `core-065` (parked); GA checks and the close check. Publish, domain, Sentry and the clean-up rows are done. |
| [M5 — Hardware Library](#m5--hardware-library-open-rows) | 2 | `core-074` and `ui-080`, the threads pair. Ready; `core-074` no longer depends on the deferred `core-073`. |
| [M15 — Mergeable project file](#m15--a-mergeable-project-file-reserved-rows) | 4 reserved | `data-012`, `io-013`, `ai-018`, `ai-019`. No task files yet. |
| [Findings](#findings-open-rows) | 14 | `testing-006`, `ui-078`, `testing-007`, `testing-008`, `ui-074`, `perf-003`, `testing-010`, `testing-005`, `ui-079`, `testing-009`, `ai-027`, `ai-028`, `ai-029`, `ai-030`. |
| [M11 — Gears](#m11--gears-open-rows) | 7 | Runs last. `core-048`, `core-049`, `core-062`, `ui-057`, `ui-058`, `testing-002`, `docs-021`. |
| Outside milestones | owed only | `build-016` owner steps; the deferred JSCAD V3 family. |

---

## How to read this file

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
