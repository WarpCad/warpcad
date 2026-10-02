---
model: haiku
---

# Run All Tests (Unit + E2E)

Run the project's full test suite from the repo root and report clean pass/fail results.
Any other skill or instruction that needs to "run the tests" should invoke this skill
(`/test`) instead of hand-rolling the individual commands.

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
| E2E | `npm run test:e2e:headless` | ~31s / 225 tests, 9-way matrix (2026-09-06, ui-010) | 180s |

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

Show a compact summary per stage (files/tests passed, duration) and the full output of
any failure. All stages must be green before the calling workflow (commit, feature,
TDD, fix-todo, refactor-ui) proceeds.

---

## Notes

- Single test file: `npx vitest run --reporter=verbose <filename>`
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
