# Fix a TODO Audit Finding

Implement one `TODO/<category>-<NNN>-*.md` finding end to end: verify the baseline is
green, implement the fix with TDD, verify again — including the acceptance-scenario
and regression-surface checks below, which is what this project's second attempt
skipped — retire the file, and commit.

Trigger on requests like "fix the todo core-013", "do core-013", "implement
ui-007", or `/fix-todo core-013`. The user will give a category-number id
(e.g. `core-013`), not the full filename.

---

## Step 1 — Locate the TODO

Resolve the id to a file:
- Match `TODO/<id>-*.md` (e.g. `core-013` → `TODO/core-013-cache-tessellation-results.md`).
- If it's not in `TODO/`, check `TODO/done/`. If found there, tell the user it's
  already marked `done` and ask whether they want it redone or if they meant a
  different id — do not silently reopen it.
- If no file matches, list the closest ids you can find (same category, nearby
  numbers) and ask the user to confirm which one they meant.

---

## Step 2 — Read and confirm scope

Read the TODO file in full and the files it lists under **Affected files**.

Post a short summary back to the user: one sentence on the problem, one on the
proposed fix, the effort estimate. TODO files are written to be self-contained
specs (see `TODO/README.md`), so this is a confirmation, not a discovery
interview — skip re-asking questions the file already answers. Only ask the
user something if the proposed fix is ambiguous, conflicts with code you're
now seeing, or looks stale (files moved/renamed since the finding was written).

**If this is a `ui`-category or otherwise UI-touching task, check the file's
Testing section names a real `*.e2e.js` spec against the running app (`/`), not
only a `.spec.js` or `.story.e2e.js`.** If it doesn't, and the capability being
added has no other task that already owns wiring it into a view, stop and ask
the user before proceeding — implementing it without that gate is exactly how
a capability ends up shipped-but-unreachable (see `PREVIOUS-ATTEMPT.md`). If
the file explicitly and correctly defers assembly to a named later task, that's
fine — just don't let it default to unstated.

**Same check for the Documentation section**: if this task has an Interaction
model section, it must also have a filled-in Documentation section naming a
`docs/<page>.md` and a concrete usage example — not "n/a" by omission. If it's
missing or empty, stop and ask the user before proceeding, same as a missing
e2e spec above; a control nobody can find instructions for is the same class
of gap as one that isn't mounted (`CLAUDE.md`'s Interaction Model section).

**Same check for the Testing section's `TODO/ACCEPTANCE.md` bullet**: it must
say which acceptance scenarios (or "none") this change could plausibly break,
and — if this task extends a subsystem a previously closed finding touched —
which finding's original repro steps get re-run. If this bullet is missing
entirely (an older file written before this convention existed), don't block
on it — just do the analysis yourself in Step 6 below rather than skipping it.

Note the frontmatter's `model` field (default `sonnet` if the file predates
this field) — it determines who does Step 4, below.

---

## Step 3 — Preflight: confirm the baseline is green

Before changing anything, run the test suite(s) that cover the TODO's
`category` and the **Affected files**:

| category | suite |
|---|---|
| `core` | `npm run test:unit -- --run` (the kernel's tests are plain Node — fast, run them all) |
| `data` | `npm run test:unit -- --run`, plus any persistence/round-trip fixture tests |
| `render` | `npm run test:unit -- --run` plus browser/e2e-headless suites if the change is visible on canvas |
| `ui` | `npm run test:unit -- --run` (add browser/component-workshop/e2e suites if the affected files touch components, stories, or flows those suites cover) |
| `io` | `npm run test:unit -- --run`, plus any fixture-file round-trip tests |
| `perf` | run the relevant benchmark from `.claude/prompts/perf-benchmark.md` to capture a **before** number, then the unit suite |
| `testing` | run whatever suite(s) the finding is trying to add coverage to |
| `docs` | no test suite; skip straight to Step 4 |

If a suite is ambiguous or the finding spans categories, run all that apply. Use the
`test` skill (`/test`) rather than hand-rolling commands, and if any command name above
doesn't match what `package.json` actually defines yet (this project may not have all
stages scaffolded), use whatever `/test` reports instead of inventing one.

**If everything passes:** proceed to Step 4.

**If anything fails:** stop. Do not start on the TODO. Report exactly which
test(s) are failing and the error output, then ask: *"Tests were already
failing before I touched anything — want me to fix those first, or is this
expected?"* Only continue once the user answers. Don't fold an unrelated
pre-existing failure into this TODO's commit unless the user asks for that.

---

## Step 4 — RED/GREEN: implement the fix

Follow the TODO's **Testing** section as the spec for what to write first:

1. Write or update the test(s) it describes. Run them — they must fail for
   the reason the TODO describes (missing behavior, not a typo). If a test
   passes immediately, stop and ask the user before proceeding — either the
   fix already landed or the test isn't exercising the right thing.
2. Implement the **Proposed fix** — the minimum change to make those tests
   pass. Stay inside the **Affected files** unless the fix genuinely requires
   touching more; if scope grows, tell the user what expanded and why before
   continuing.
3. Re-run the suite(s) from Step 3. All new and existing tests must be green.
   For a `perf` finding, capture the **after** number with the same benchmark,
   on the same machine, and report both.
4. **If this task adds or changes a user-visible control**, confirm it is
   actually mounted somewhere the app's root view renders — not only
   registered in a list/registry — and that the real-app `*.e2e.js` spec from
   Step 2 exercises it. This is a condition of Step 4 being done, not
   something Step 5's broader run merely happens to catch.
5. **If this task's Documentation section applies**, write or update the
   `docs/<page>.md` page it names now, with the concrete example it
   specifies — not deferred to a later `/docs` pass. This is a condition of
   Step 4 being done, exactly like sub-step 4 above. If the end-user docs
   site doesn't exist yet, stop and ask the user how to proceed rather than
   skipping the page silently.

**If this invocation is itself running inside an agent spawned by `/run-todos`
Step 5,** skip this whole sub-step and do Step 4 directly, regardless of the
TODO's `model` field. `/run-todos` Step 5 already reads that field itself and
spawns this entire `/fix-todo` run at the matching model tier before you ever
reach this point — delegating again here would nest an agent inside an agent
for no benefit, and just lose context. "Isolated context per task" is a
`/run-todos` Step 5 concern now, applied once, up front, to the whole
`/fix-todo` run; this sub-step's job is narrower and doesn't also need to fire.

**Otherwise** (a user invoked `/fix-todo <id>` directly, not via
`/run-todos`): **if the TODO's `model` field is `opus`** (geometry/numerics, a
rendering algorithm, large multi-module orchestration, or real architectural
ambiguity — see `TODO/README.md`'s Model field section) and the active session
model is not already Opus-tier, do sub-steps (1) and (2) as a single `Agent`
tool call with `model: "opus"` (`subagent_type: "claude"`, foreground — the
result gates Step 5) instead of writing the code yourself. Brief that agent
like a handoff, not a summary: paste the TODO's full
**Problem**/**Affected files**/**Proposed fix**/**Testing** sections verbatim,
state the RED/GREEN order above, and tell it to report back which files it
touched and the final test output. When it returns, read its diff yourself
(`git diff`) before trusting the summary — you still own steps 5-9. If the
session model is already Opus or better, skip the delegation and just do
Step 4 directly — spawning a same-tier agent would only lose context for no
benefit.

---

## Step 5 — Full verification

Run the complete suite set (not just the targeted tests) to catch regressions
elsewhere: run the `test` skill (`/test`).

All stages must be green before moving on. Fix any regression before continuing —
don't hand back a partially-passing state.

---

## Step 6 — Drive the acceptance scenarios and check the regression surface

**This step is the one the second attempt's process didn't have, and its absence is
the single biggest reason that attempt shipped a passing-tests app that didn't
actually work — read `CLAUDE.md`'s Verification section before treating this as
optional or as a formality Step 5 already covers.** A green test suite proves the
code does what its own author's assertions say. It does not prove a human driving the
app by hand gets the same result, and it does not by itself catch a new feature
silently reintroducing a bug a past finding already fixed.

1. **Read `TODO/ACCEPTANCE.md`.** If it doesn't exist yet (pre-kickoff, or a very early
   task before it's been written), skip this step and note that in Step 8's retirement
   note — don't block on a file that hasn't been created yet. Otherwise, identify which
   named scenarios this task's change could plausibly affect — reuse the Testing
   section's own bullet on this if the TODO file has one (Step 2 above), otherwise
   judge it fresh from what actually changed.
2. **Actually launch the app and drive each plausibly-affected scenario yourself** —
   use the `run` skill ("launch and drive this project's app") rather than a scripted
   Playwright run. Follow the scenario's own **Steps** as a human would perform them,
   not as a fixed selector sequence; the point is to notice what a fixed script
   wouldn't, so don't shortcut this into re-running the same e2e spec Step 5 already
   ran.
3. **Report PASS/FAIL for each scenario driven**, explicitly, even if everything
   passed. Update that scenario's **Last run** line in `TODO/ACCEPTANCE.md` with the
   timestamp and result.
4. **If this task extends a subsystem a previously closed finding (in `TODO/done/`)
   was filed against**, re-run that finding's own original reproduction steps against
   the new code now, not just its new spec — a new feature kind added to a pipeline a
   past bug was fixed in is exactly the class of change that silently reintroduces the
   old symptom (see `CLAUDE.md`'s Verification section for the second attempt's own
   two examples of this happening).
5. **Any FAIL here stops the task.** Do not proceed to retirement or commit with a
   failing acceptance scenario or a reintroduced regression — fix it and re-drive
   before continuing, the same discipline as a failing automated test in Step 5.

---

## Step 7 — Retire the TODO file

- Set `status: done` in the file's frontmatter.
- Move it into `TODO/done/` with `git mv` (`TODO/` is tracked, so the move
  itself is part of the commit):
  ```
  git mv TODO/<id>-<slug>.md TODO/done/<id>-<slug>.md
  ```
- If the fix was smaller or different from what the file proposed, add a
  one-paragraph note at the top explaining what actually shipped.

---

## Step 8 — Mark the roadmap entry done

Find this id's row in `TODO/ROADMAP.md` (the milestone tables, or the
`## Findings` table) and mark it complete in the same diff that will be
committed — don't leave this for a later pass:

1. Prefix the id cell with `✅ `, e.g. `| 23 | ✅ `core-005` | Extrude | M |`.
2. Append one row to a `## Completion Log` table at the bottom of
   `TODO/ROADMAP.md` (create the section, with a header row, if this is the
   first entry):

   ```
   | id | completed | duration |
   |---|---|---|
   | `core-005` | 2026-08-28 16:42 | 1h42m |
   ```

   - **completed** — today's date and time, UTC, `YYYY-MM-DD HH:MM`.
   - **duration** — wall-clock elapsed from the start of Step 3 (preflight) to
     now. Note the time at the start of Step 3 so this is measured, not
     estimated. `TODO/BUDGET.md`'s wall-clock-per-batch cap reads this column,
     so keep it real rather than rounding generously.

   This project's `/run-todos` paces itself with a fixed task-count-per-batch
   cadence rather than estimating token spend (see `TODO/BUDGET.md`'s own header for
   why), so there is no `tokens` column to maintain here — don't add one back in.

This entry becomes part of Step 9's commit, not a separate one.

---

## Step 9 — Commit

Hand off to the `/commit` skill for message formatting, the pre-commit test
gate (already satisfied by Step 5, but `/commit` will re-verify), and the
social-post drafts. Make sure the commit message body references the TODO id
and mentions the file move, e.g.:

```
perf(core): cache tessellation results per shape revision (TODO/core-013)

<why, 2-4 sentences>

Resolves TODO/core-013-cache-tessellation-results.md (moved to TODO/done/).
```

**Before committing, write manual verification notes to `TODO/VERIFY.md`** — but
keep this narrow, per `CLAUDE.md`'s Verification section: this file is not the
per-task checklist it was in the previous attempt (that grew to ~2,000 lines and
nobody could keep up with it). Only add an entry for something genuinely one-off and
not already covered by Step 6's acceptance-scenario re-drive — a visual/feel judgment
call, a device-specific quirk, something this task's Testing section explicitly
deferred. If Step 6 already exercised everything worth checking for this task, write
nothing here rather than padding the file with a restated pass.

Create the file (with the header below) if it somehow doesn't exist yet:

```markdown
# TODO/VERIFY.md — Manual Verification Queue (kept small, on purpose)

Appended by `/fix-todo` Step 9, but narrower in scope than the previous attempt's file
of the same name — see `CLAUDE.md`'s Verification section. Only what's genuinely
one-off and not already covered by a standing `TODO/ACCEPTANCE.md` scenario belongs
here. Newest entry at the top. Each entry is a short prose note followed by a table —
one row per thing to check by hand. Fill in Status and Notes as you actually verify;
leave the entry and its filled-in rows in place afterward as a record.

Status values: `Open` (not yet checked), `OK` (checked, fine as-is), `Issue` (checked,
found a real problem — file it as its own TODO and put the id in Notes), or `N/A` (no
longer checkable as written — say why in Notes). Notes is free text: what you actually
saw, on what device.

## Queue
```

Then **prepend** (not append — newest first, per the header above) one entry
per completed task that has something worth logging. A one-row entry looks like:

```markdown
### <id> — <title> (<UTC timestamp, same format as the Completion Log>)

<one or two sentences: why this is here, what was already measured or ruled out>

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | <specific thing not covered by an acceptance scenario: visual/UX feel, cross-device behavior, a case this task explicitly deferred> | Open | |
```

Add one row per thing worth checking, not one entry per thing — a task that surfaces
several related checks is one heading with a multi-row table, not several headings.
Leave **Status** as `Open` and **Notes** blank when writing the entry; those columns
are filled in later, by whoever actually drives the check by hand, not by this skill.

Only commit once the user confirms, per `/commit` Step 9 — unless this
invocation is running from a scheduled/unattended context that was set up with
standing authorization to commit without a live confirmation (a `/loop` or a
scheduled routine the user created specifically to run `/fix-todo`
end-to-end). In that case, skip the wait but never skip the *showing*: print
the full commit message, both social-media drafts, and the `TODO/VERIFY.md`
entry just written (if any), plus the Step 6 PASS/FAIL report, as plain output
in this session before committing, exactly as Step 9 of `/commit` would show
the first two to an interactive user. That output is the only record the user
gets when they read back the scheduled session's transcript later.

**If this invocation is part of an automated queue**, that's `/run-todos`
(`.claude/commands/run-todos.md`, normally driven by `/loop /run-todos`) — it
paces itself by a fixed task-count-per-batch cadence against `TODO/BUDGET.md` rather
than an estimated token budget, and calls this skill for exactly one id at a time,
never batched. See the Notes section below.

---

## Notes

- Never batch multiple TODO ids into one invocation of this skill — one
  finding, one focused diff, one commit, matching `TODO/README.md`'s "one
  suggestion per file" rule.
- If `/refactor-ui` or `/tdd` already cover the mechanics of a given fix (e.g.
  a `ui-*` finding that's really a view decomposition), use that skill for
  Step 4 instead of reinventing it, then return here for Steps 5-9.
- **Running back-to-back or from a recurring loop:** treat every invocation as
  starting cold, even if it's the same conversation as a prior run minutes or
  hours ago. Re-resolve the id in Step 1, re-read the TODO file in Step 2, and
  re-run the Step 3 baseline check against the *current* working tree — never
  reuse a file listing, test result, or "next id" conclusion from earlier in
  this transcript. Repo state can have moved (another session, a manual
  commit) even when nothing in this conversation looks like it changed.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
