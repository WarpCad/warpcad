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
- **Green-stamp.** After a *full* green run, `node scripts/todo-progress.mjs stamp set`.
  Before starting a full run, `node scripts/todo-progress.mjs stamp gate` — it exits 1
  at once on a stale stamp (run the tests). On a match (the code is byte-identical to a
  tree that already passed everything, sha256 token printed) it asks "Run them again?" on a
  terminal, or with no terminal waits 60s (`--wait=N`) and then exits 1; exit 0 means
  skip, and you report "green (stamp match <token>, not re-run)". Callers
  that need an *independent* check (the `/run-todos` loop verifying an agent's claim)
  pass `--force` in the brief, which skips the check. A *targeted* run (one spec file),
  a `one`-scope run, or a run that skipped an engine never sets the stamp (see Scope below).

### Scope — full matrix, or one e2e project

The e2e stage is a 9-way matrix (3 engines x 3 viewports) plus `guards` and docs
projects, and it is the expensive part of a run. The caller picks a scope in the brief:

| Scope | When | E2E command |
|---|---|---|
| `full` (default) | Nothing said, or the caller asks for the full suite | `npm run test:e2e:headless` |
| `changed` | The work is confined to a specific area (a component category, one subsystem) | the matching specs, **all engines**, see below |
| `fast` | The user asks for a "fast" test suite | `touch .test-fast`, then `npm run test:e2e:headless` (see below) |
| `one` | The caller says "one suite", "single project", or passes `--project=<name>` | `npm run test:e2e:headless -- --project=<name> --project=guards` |

- **`fast` — all tests, two projects.** When the user asks for a "fast" test suite, run
  **every** e2e spec but only on **Chrome desktop (`chromium-laptop`) and Safari on iPad
  (`webkit-tablet`, 820×1180 touch)**. The choice is carried by the gitignored marker file
  `.test-fast` at the repo root, which `playwright.config.js` checks: while it exists, a bare
  `npm run test:e2e:headless` runs just those two projects plus `guards` (smoke projects are
  dropped as redundant; `docs-*` projects are still available when named by `npm run docs:*`).
  Create it with `touch .test-fast` when the user asks for fast; **delete it** (`rm -f .test-fast`)
  when they ask for the full suite again or when a task needs a `full` run. Typecheck and unit
  still run in full. Like `one`, report it as `green (fast: chromium-laptop + webkit-tablet)`
  and **never `stamp set`** after it. Firefox is not run, so say so in the report. The file is
  per-developer and never committed.
- **`changed` — test what's changing, on every engine.** When a task's diff stays inside
  one area, run only the specs that cover it, but run them across **all engine-viewport
  projects** rather than one:
  1. List the changed files (`git diff --name-only HEAD`, plus untracked).
  2. Unit: `npm run test:unit -- --run related <changed src files>` (Vitest's `related`
     follows imports), plus any `.spec.js` the TODO's Testing section names.
  3. E2E: the `*.e2e.js` specs the TODO's Testing section names, plus specs whose filename
     or `data-testid`s match the touched `src/components/<category>/` or subsystem (grep
     `e2e/` for the component/store/feature name). Playwright's `--only-changed` does not
     help here, because e2e specs drive `/` rather than importing source.
  4. Run them as `npm run test:e2e:headless -- <spec files>` (all projects, minus the
     Firefox exclusion below) and add `--project=guards` only if docs/media changed.
  5. **Fall back to `full`** when the diff touches shared infrastructure (`src/core/`
     kernel or document layer, the render loop, `playwright.config.js`, `package.json`,
     shared stores, global styles), when no spec can be mapped to the change, or at a
     milestone boundary. Never narrow because the full run is slow and the change "looks
     small."
  Report the list of specs run and why each was chosen. Like `one`, it never sets the stamp.
- **Picking the project for `one`.** If the caller names one, use it. Otherwise pick
  **one at random** from the engine-viewport projects (`chromium-phone`, `chromium-tablet`,
  `chromium-laptop`, and the `firefox-*` / `webkit-*` equivalents; `webkit-*` and `firefox-*`
  only when the environment rule below allows), e.g.
  `node -e "const p=process.argv.slice(1);console.log(p[Math.floor(Math.random()*p.length)])" chromium-phone chromium-tablet chromium-laptop webkit-phone webkit-tablet webkit-laptop`.
  Always add `guards` (cheap, file-level). **Report which project ran** so a failure
  is reproducible with the same flag.
- **Typecheck and unit always run in full.** `one` only narrows the e2e stage.
- **Environment rule — skip Firefox in the Claude app / cloud.** When running in the Claude
  app or Claude Code on the web (`CLAUDE_CODE_REMOTE=true` in the environment, or the
  user says so), Firefox's Playwright browser does not start reliably. Run every
  e2e command with `--project=chromium-* --project=webkit-* --project=guards` style
  selection — i.e. **exclude every `firefox-*` project** — in **both** scopes, and say in
  the report that Firefox was skipped for that reason. Firefox still runs on a
  local machine in `full` scope. A skipped engine is a coverage gap, not a pass: note it
  so the user knows the cross-engine claim in `CLAUDE.md` Browser Support is unverified for it.
- **A `one` or `changed` run, or one that skipped Firefox, is not a full green.** Report it as
  `green (one: <project>)` / `green (firefox skipped)`, and **never `stamp set`** after it —
  the stamp means "everything passed". Only a `full`, Firefox-included run sets it.
- Which scope a workflow uses: `/fix-todo` Step 5 and `/run-todos` default to `changed`
  when the area is confined, else `full`; either accepts `one` (see their own notes). A milestone's last task, or anything
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
typecheck  →  test:unit -- --run  →  test:browser -- --run  →  test:storybook -- --run  →  test:e2e:headless
```

So a full run is up to five stages in order: **typecheck, unit, browser, component
workshop, e2e**. The component-workshop and e2e stages assume Storybook and Playwright
respectively — both are carried-forward defaults from the previous attempt, not yet
re-confirmed for this one (see `CLAUDE.md`'s Stack table). If a different tool gets
picked at kickoff, update this table to match, and prefer that `webServer`/equivalent
auto-starts the dev server and any workshop tool — never start those manually first.

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
| Unit | `npm run test:unit -- --run` | ~1s / 223 tests (2026-09-06, ui-010) | 60s |
| Browser | `npm run test:browser -- --run` | *(stage not defined in package.json)* | 90s |
| Component workshop | `npm run test:storybook -- --run` | *(stage not defined in package.json)* | 90s |
| E2E | `npm run test:e2e:headless` (or a `--project=` subset, see Scope) | ~31s / 225 tests, 9-way matrix (2026-09-06, ui-010) | 180s |

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
