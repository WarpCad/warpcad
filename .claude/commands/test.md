---
model: haiku
---

# Run All Tests (Unit + E2E)

Run the project's full test suite from the repo root and report clean pass/fail results.
Any other skill or instruction that needs to "run the tests" should invoke this skill
(`/test`) instead of hand-rolling the individual commands.

---

## Who runs this — always the cheapest model, never the one that wrote the code

Running tests is mechanical and its raw output is large (a Playwright run prints
hundreds of lines). Reading that output at Sonnet/Opus prices is the single biggest
avoidable token cost in the TODO workflow. So:

- **If you are not already Haiku, do not run the stages yourself.** Spawn one `Agent`
  call (`subagent_type: "claude"`, `model: "haiku"`, foreground) and brief it to: run
  Steps 1-3 below, then reply with **only** the compact report in Step 4. Haiku absorbs
  the raw output; your context only ever sees the summary.
- **Haiku never fixes anything.** It runs, reads, and reports. A failure goes back to
  the caller, which owns the fix (see the escalation ladder below).
- **Stop at the first red stage.** Later stages can't be trusted on a tree that already
  fails an earlier one, and running them just buys more output to read. Say which
  stages were skipped.
- **The stored results are the green check (`TODO/build-014`).** The vitest and playwright
  reporters write every finished run to `.todo-progress/_runs.json` (fingerprint of `src/`,
  `full`/`partial` scope, counts, failing test ids). They do this for every run, whoever starts
  it: `/test`, a run typed by hand, or anything else. Nothing else records a pass, and nothing
  needs to be set afterwards. `node scripts/todo-progress.mjs stamp check` reads that file.
  - Exit 0: both suites have a stored *full*, unmoved, failure-free run on the current `src/`.
    Report `green (stored run, not re-run)` and skip the suite.
  - Exit 1: it prints which suite is stale and the command that refreshes it. Run the suite.
  - Changes outside `src/` (docs, `TODO/`, `chat/`, config, lockfiles, `e2e/` specs) do not
    make the check stale, by design. Only code under `src/` does.
  - The caller passes `force` in its brief to skip the check and run the suite anyway. The
    `/run-todos` verification does this, so an agent's claim is checked by a fresh run.
  - A clean, unfiltered **pair run** (the default `npm run test:e2e:headless`) or `test:e2e:full` stores
    `full` and makes the tree green. A *targeted* run (one spec file, a `--grep`), a `one`- or
    `changed`-scope run stores `partial`, which never makes the tree green. A clean partial run on
    code a stored full run already covers leaves that full run in place (`recordRun`), so a targeted
    run does not cost the next commit a re-run. A partial run that fails is stored, and the tree
    is then not green until an unfiltered run passes.
  - `node scripts/todo-progress.mjs stamp results` shows what is stored.
  - `.githooks/pre-push` reads the same file and refuses a push of `main` unless unit and e2e both
    ran in full on the pushed commit.
  - Never write `_runs.json` by hand, and never run a suite just to refresh the check: run it once
    and the reporters record it.

### Scope — the rotating pair (default), or the full matrix

The e2e stage is a 9-way matrix (3 engines x 3 viewports) plus `guards` and docs projects. Running
all nine on every run made each step slow, so **the default run executes every spec on just two
projects, and the pair changes each run.** A clean pair run is a **green run**: the reporter stores
it as `full`, so `stamp check` and the pre-push gate accept it.

`npm run test:e2e:headless` is `node scripts/e2e-rotate.mjs`. It picks the next pair, runs
`playwright test --project=<a> --project=<b> --project=guards`, and moves the rotation on only
when the run is clean and unfiltered. State is in `.todo-progress/e2e-rotation.json`
(gitignored, per developer).

- **The cycle.** Nine pairs; each pairs projects that differ in **both** engine and viewport, and
  every project appears in two of them, so the whole matrix is covered within five runs
  (`chromium-phone + webkit-tablet`, `chromium-tablet + webkit-laptop`, `chromium-laptop +
  firefox-phone`, ...). `npm run test:e2e:next` prints the pair the next run will use.
- **A red pair repeats.** The rotation does not advance on a failure, so the fix is proven on the
  projects that failed. The next clean run moves to a new pair.
- **Filtered runs use the current pair but do not advance it.** `npm run test:e2e:headless --
  e2e/foo.e2e.js` runs that spec on the current pair. It stores a `partial` run (a spec filter
  never vouches for the tree) and leaves the rotation where it was.
- **An explicit `--project=<name>` bypasses the rotation** and runs exactly what was typed. It
  is always `partial`.
- **`npm run test:e2e:full`** is the whole 9-way matrix with no rotation. Use it at a milestone's
  last task, before a release, or when a failure only reproduces on an engine the pair skipped.
- **Report the pair.** The compact report names the pair that ran (`green (pair:
  chromium-phone + webkit-tablet)`) so a failure is reproducible with the same projects.
- **Typecheck and unit always run in full.**

| Scope | When | E2E command |
|---|---|---|
| `pair` (default) | Nothing said, or any normal check | `npm run test:e2e:headless` |
| `changed` | The work is confined to a specific area (a component category, one subsystem) | the matching specs on the current pair, see below |
| `full` | The caller asks for the full matrix, a milestone's last task, a release | `npm run test:e2e:full` |
| `one` | The caller passes `--project=<name>` | `npm run test:e2e:headless -- --project=<name> --project=guards` |

- **`changed` — test what's changing.** When a task's diff stays inside one area, run only the
  specs that cover it, on the current pair:
  1. List the changed files (`git diff --name-only HEAD`, plus untracked).
  2. Unit: `npm run test:unit -- related <changed src files>` (Vitest's `related`
     follows imports), plus any `.spec.js` the TODO's Testing section names.
  3. E2E: the `*.e2e.js` specs the TODO's Testing section names, plus specs whose filename
     or `data-testid`s match the touched `src/components/<category>/` or subsystem (grep
     `e2e/` for the component/store/feature name). Playwright's `--only-changed` does not
     help here, because e2e specs drive `/` rather than importing source.
  4. Run them as `npm run test:e2e:headless -- <spec files>` and add `--project=guards` only
     if docs/media changed (a pair run already includes it).
  5. **Fall back to a pair run of the whole suite** when the diff touches shared infrastructure
     (`src/core/` kernel or document layer, the render loop, `playwright.config.js`,
     `package.json`, shared stores, global styles), when no spec can be mapped to the change.
     Escalate to `full` at a milestone boundary. Never narrow because the run is slow and the
     change "looks small."
  Report the list of specs run and why each was chosen. It stores a `partial` e2e result.
- **Picking the project for `one`.** If the caller names one, use it. Otherwise pick
  **one at random** from the engine-viewport projects (`chromium-phone`, `chromium-tablet`,
  `chromium-laptop`, and the `firefox-*` / `webkit-*` equivalents; `webkit-*` and `firefox-*`
  only when the environment rule below allows), e.g.
  `node -e "const p=process.argv.slice(1);console.log(p[Math.floor(Math.random()*p.length)])" chromium-phone chromium-tablet chromium-laptop webkit-phone webkit-tablet webkit-laptop`.
  Always add `guards` (cheap, file-level). **Report which project ran** so a failure
  is reproducible with the same flag.
- **Typecheck and unit always run in full.** `one` only narrows the e2e stage.
- **Environment rule — skip Firefox in the Claude app / cloud.** When running in the Claude
  app or Claude Code on the web (`CLAUDE_CODE_REMOTE=true`, or `E2E_SKIP_FIREFOX=1`),
  Firefox's Playwright browser does not start reliably. The rotation then cycles over the six
  chromium and webkit projects only, with no flag needed, and `full` runs must be given
  `--project=chromium-* --project=webkit-* --project=guards` style selection. Say in the report
  that Firefox was skipped. A skipped engine is a coverage gap: the cross-engine claim in
  `CLAUDE.md` Browser Support is unverified for it until a local run covers a Firefox pair.
- **What counts as green.** A clean pair run reports `green (pair: <a> + <b>)`. A `one` or
  `changed` run reports `green (one: <project>)` / `green (changed: <specs>)` and is partial.
  A Firefox-skipped pair still stores `full` (it is a real pair run); the coverage gap above is
  the user's call, not the stamp's.
- Which scope a workflow uses: `/fix-todo` Step 5 and `/run-todos` default to `changed`
  when the area is confined, else `pair`; either accepts `one` (see their own notes). A milestone's last task, or anything
  touching the kernel/WebGL/persistence, should still get one `full` run locally.

### Escalation ladder when a stage is red

The cheap model finds the failure; a stronger one fixes it, and only as strong as needed.

1. **Task tier first.** The caller (whoever is running the TODO at its `model` tier,
   Sonnet by default) reads the compact report and fixes it, then re-runs through Haiku
   again. Up to **2** fix attempts at this tier.
2. **Opus once.** Still red after two attempts: spawn one `Agent` with `model: "opus"`,
   briefed with the failing report, the diff, and what the two attempts tried and why they
   didn't work. One attempt.
3. **Stop.** Still red: stop and report to the user with all three attempts' notes. Do not
   loop, do not loosen an assertion or a snapshot threshold to get green.

Record each hop with `node scripts/todo-progress.mjs step <id> <n> --state=escalated
--model=opus --note="<stage> red after 2 sonnet attempts"` so the progress mod shows it.

---

## What this runs

Once the test harness is scaffolded, the root `package.json` should chain the suites
with `run-s` (or equivalent), something like:

```
typecheck  →  test:unit  →  test:browser -- --run  →  test:storybook -- --run  →  test:e2e:headless
```

So a full run is up to five stages in order: **typecheck, unit, browser, component
workshop, e2e**. The component-workshop and e2e stages assume Storybook and Playwright
respectively — both are carried-forward defaults from the previous attempt, not yet
re-confirmed for this one (see `CLAUDE.md`'s Stack table). If a different tool gets
picked at kickoff, update this table to match, and prefer that `webServer`/equivalent
auto-starts its server and any workshop tool — never start those manually first.

**The e2e stage runs against the production build** (`npm run build` + `vite preview`, port
5184), not the dev server (`TODO/build-015`): the first run pays a one-off build, every spec
then runs faster, and the production CSP and service worker are the ones under test. The
config sets `E2E_PREVIEW=1` itself, which the specs read. `E2E_DEV=1` is the opt-out — it
serves `npm run dev` on 5183 and is required for the dev-only specs (`ai-scripted`'s
scripted mode, the live-MCP-access paths in `webmcp`, `library-remember-params`'s scripted
test), which report themselves skipped in the default run. The production service worker is **blocked on every engine** by default (its "ready to work offline" strip resizes the canvas under snapshots at an unpredictable moment); the specs that exercise it (`pwa-update`, `help`) opt in with `test.use({ serviceWorkers: 'allow' })`. Specs that read the app's stores call `window.__e2eImport('/src/…')` (`src/e2eHooks.js`), present only in the e2e build (`VITE_E2E_HOOKS=1`), because a bundle has no `/src` URLs. A preview server is not reused
between runs (it would serve a stale `dist/`); set `E2E_REUSE=1` to reuse one you know is fresh.

> **This project is greenfield — none of this exists yet.** If `package.json` doesn't
> yet define a stage listed below, skip it and say so in the report rather than
> inventing a command. Update this file's table once the build/scaffold task actually
> defines each stage, including real warm-baseline timings measured on this machine —
> don't carry forward numbers from a different project's build.

---

## Step 1 — Run stage by stage, not one giant `npm test`

Even though root `npm test` runs everything, execute the stages as **separate
commands**, each with its own timeout. This is functionally identical to `npm test`,
but if one stage hangs you can tell exactly which one, kill only that process, and
avoid re-running stages that already passed.

| Stage | Command | Warm baseline | Abort timeout |
|---|---|---|---|
| Typecheck | `npm run typecheck` | ~1s (2026-09-06, ui-010) | 30s |
| Unit | `npm run test:unit` | ~1s / 223 tests (2026-09-06, ui-010) | 60s |
| Browser | `npm run test:browser -- --run` | *(stage not defined in package.json)* | 90s |
| Component workshop | `npm run test:storybook -- --run` | *(stage not defined in package.json)* | 90s |
| E2E | `npm run test:e2e:headless` (the rotating pair; `test:e2e:full` for all nine, see Scope) | *(re-measure a pair run; the old 9-way number was ~31s / 225 tests, 2026-09-06, ui-010)* | 180s |

**Record the warm baseline for each stage in this file the first time you measure it**
(warm cache, `node_modules/.vite` populated, single machine), so future sessions can
tell "slow" from "wedged". Re-measure occasionally as real features land rather than
trusting an old number forever.

The browser and E2E stages drive real canvas/WebGL rendering, so they are expected to
be the slowest and the most sensitive to machine load once real specs exist. A cold run
(first install, empty cache) can legitimately take longer than usual — that's not a
hang. Keep the timeouts above with a wide margin specifically so cold-cache runs don't
trip a false abort.

Use the Bash tool's `timeout` parameter (milliseconds) for each stage so a hang is
detected automatically instead of blocking the session indefinitely.

---

## Step 2 — If a stage times out, abort and retry once

1. Kill the timed-out process (and, for the e2e stage, any orphaned dev-server or
   component-workshop process left on its port).
2. For any stage, re-run that single stage command once.
3. **Only retry once per stage.** If it hangs or fails again on the retry, stop —
   don't loop. Report which stage, the exact command, and the last output captured
   before the timeout, and ask the user how to proceed.
4. If the retry reveals a real, reproducible environment quirk (a known tool hang, a
   telemetry prompt blocking startup, etc.), log it via `/troubleshoot` so the next
   session doesn't rediscover it from scratch.

---

## Step 3 — A failing test is a real failure

There is no known-flaky suite in this project (none exists yet). Do not dismiss a
failure as flaky, and do not re-run a stage hoping for green — investigate it.

If you do establish that a failure is genuinely nondeterministic (it passes in
isolation and fails only under parallel load, and you've found the mechanism), that is
a `/troubleshoot` entry and a `TODO/testing-*` finding, not something to wave past.
Until it's root-caused and written down, it counts as red.

Rendering tests have a specific trap worth knowing once they exist: a canvas/WebGL
snapshot that differs by a pixel or two is usually a real difference in device pixel
ratio or antialiasing settings between environments, not noise. Find which, rather than
loosening the threshold until it passes.

---

## Step 4 — Report results

Keep it compact — this is what the caller pays to read. Per stage one line (`unit: 223
passed, 1.1s`). For each failure: the test's full name, the file:line, and the **first
~40 lines** of its error (assertion diff + stack top), not the whole log. Name any stage
skipped because an earlier one was red. All stages must be green before the calling
workflow (commit, feature, TDD, fix-todo, refactor-ui) proceeds.

---

## Notes

- Single test file: `npx vitest run --reporter=verbose --reporter=./scripts/test-progress/vitest.mjs <filename>`
- **Always load the progress reporters.** `playwright.config.js` and `vitest.config.js`
  register `scripts/test-progress/{playwright,vitest}.mjs`, which feed the test-progress
  mod (`.test-progress/*.json`). A CLI `--reporter` flag **replaces** the configured list,
  so a bare `--reporter=line` / `--reporter=verbose` silently turns the mod off. Prefer no
  `--reporter` flag at all. When you need another console view, list the progress reporter
  too:
  - Playwright: `--reporter=line,./scripts/test-progress/playwright.mjs`
  - Vitest: `--reporter=verbose --reporter=./scripts/test-progress/vitest.mjs`
- Never pipe e2e output to `tail` — Playwright (or whichever E2E tool is chosen) prints
  failures at the top and the summary at the bottom; `tail -N` hides failures and can
  make a red run look green.
- Never run a bare headed E2E invocation (may open a headed browser, producing
  snapshots that don't match CI) — always use the headless script, with a grep/filter
  flag to target one spec, or an update-snapshots flag to refresh visual baselines.
- Responsive/layout specs snapshot at three reference viewports — phone (390×844),
  tablet (820×1180), laptop (1440×900+); see `CLAUDE.md`'s Responsive Layout section.
  Configure these as E2E-tool `projects` (or the equivalent concept) in the test config
  so the headless e2e run covers all three consistently, rather than scattering manual
  viewport-size calls through individual specs.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
