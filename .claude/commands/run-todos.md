# Run the TODO Backlog (Fixed Batch + Go/No-Go)

Works through `TODO/ROADMAP.md` in dependency order, one finding/feature at a time via
`/fix-todo`, paced by a **fixed task-count batch with an explicit check-in** —
see `TODO/BUDGET.md`'s own header for why this replaced the previous attempt's
token-window-estimation scheme (it never tracked real usage and needed its own
calibration constant raised twice in three days while still being wrong).

**Intended invocation: `/loop /run-todos`** (no interval — self-pacing dynamic mode).
Each firing is one tick: check whether the current batch has room, run at most one
TODO if it does, either continue the batch or stop for a check-in. Do not batch
multiple TODOs into one tick — that's `/fix-todo`'s own rule (never batch ids into one
invocation) and it applies here too.

Running `/run-todos` once, outside a loop, does exactly one tick and stops.

---

## Standing authorization note — read this before the first run

Starting `/loop /run-todos` is the "scheduled routine the user created specifically to
run `/fix-todo` end-to-end" that `/fix-todo` Step 9 requires before it will skip the
live commit confirmation. Once a batch is running, every task it completes within that
batch gets committed automatically — you will not be asked to confirm each one. But the
batch itself is bounded (see `TODO/BUDGET.md`'s Config) and **always stops for an
explicit human go/no-go at the end of every batch** — this is not an unbounded
autonomous loop the way the previous attempt's was. `/fix-todo` Step 9 still prints the
full commit message, social-post drafts, and the `TODO/VERIFY.md` entry it wrote — but
since Step 5 below runs `/fix-todo` inside a per-tick isolated agent, that printed
output lands in the agent's own transcript, which isn't otherwise visible to the user.
Step 5 requires the agent to report the commit message, social drafts, verification
notes, and the Step 6 acceptance-scenario PASS/FAIL report back, and requires this loop
to print them itself before moving on — so the transcript stays the record, same
guarantee as before, just relayed through one more hop. If you want to review before
every commit, don't run this as a loop — invoke `/fix-todo <id>` by hand instead.

---

## Step 0 — Start cold

Same discipline as `/fix-todo`'s Notes section: treat this tick as a fresh invocation
even if it's the same conversation as a previous tick minutes or hours ago. Re-read
`TODO/BUDGET.md`, `TODO/ROADMAP.md`, `TODO/ACCEPTANCE.md`, and the `TODO/` directory
listing fresh — never reuse a "next id" or batch-progress conclusion computed on an
earlier tick. Repo state can have moved (a manual commit, another session) even when
nothing in this conversation looks like it changed.

`/loop`'s self-pacing keeps this session's conversation alive across ticks (so context
and prompt caching persist) — "start cold" here means *re-verify facts from files*, not
*discard the process*. If the loop has been running long enough that context has been
auto-compacted more than once or twice, that's fine and expected; don't try to prevent
it.

---

## Step 1 — Check whether the current batch has room

Read `TODO/BUDGET.md`'s **Config** (batch size, wall-clock cap) and the most recent
**Runner Log** row that doesn't show `ended because` filled in yet (an in-progress
batch), if any.

- **No in-progress batch** (last row is complete, or the log is empty): this tick
  starts a new batch. Record the current UTC time as the new batch's start. Go to
  Step 2.
- **An in-progress batch exists**: count how many ids it's completed so far and check
  the elapsed wall-clock time since its start.
  - If it's already at or past **Batch size** tasks, or past the **Hard wall-clock cap**:
    close the batch (fill in `ended because` and the end time) and go to Step 6 for the
    check-in — don't start another task this tick.
  - Otherwise, continue the in-progress batch. Go to Step 2.

---

## Step 2 — Pick the next candidate TODO

Find the earliest not-`✅` id in `TODO/ROADMAP.md`'s milestone tables whose `depends`
(from the corresponding `TODO/<id>-*.md` file's frontmatter) are all `status: done`.
Skip and continue past any id that's blocked on an open dependency — don't stop the
scan at the first blocked one.

- **If an eligible id is found**, continue to Step 3.
- **If every remaining id is blocked** (backlog non-empty but nothing is currently
  runnable): close the current batch (`ended because: blocked on open dependencies`)
  and go to Step 6 with a 1-hour check-back rather than stopping indefinitely — deps
  may resolve from outside this loop.
- **If there are no remaining ids at all** (everything in `TODO/ROADMAP.md` is `✅`):
  close the batch (`ended because: backlog empty`), go to Step 6, then call
  `ScheduleWakeup` with `stop: true` after reporting — the backlog is finished, don't
  keep ticking.

---

## Step 3 — Check the milestone-boundary rule before running

If the candidate id from Step 2 is the **last remaining task in its milestone** (every
other row in that milestone's block is already `✅`), running it will complete the
milestone. That's fine to do — but per `CLAUDE.md`'s Verification section, completing
a milestone requires a five-minute human free-form pass at the reference viewports
before the *next* milestone's work starts. Note this now (you'll act on it in Step 6)
rather than discovering it after the fact.

---

## Step 4 — Run exactly one TODO, in an isolated agent

Every id runs in a fresh `Agent` tool call now, never inline in this loop's own
conversation — regardless of the TODO's `model` field. This is what keeps this
conversation's context from accumulating tick over tick across a long `/loop
/run-todos` run. It's a `/run-todos`-specific concern: `/fix-todo` invoked directly by
a user still runs in that user's own conversation, unchanged — see `/fix-todo` Step 4's
own note on why its opus-delegation sub-step doesn't also fire here.

Before spawning, read the chosen TODO file's frontmatter `model` field (default
`sonnet` if absent, same default `/fix-todo` Step 2 uses) — that's the tier the agent
runs as. "Isolated context" and "model tier" are two independent choices: every tick
is isolated now; the `model` field only picks which model that isolated run uses (see
`TODO/README.md`'s Model field section).

Spawn one `Agent` tool call, foreground (its result gates Step 5 — the Runner Log entry
needs its outcome):

- `subagent_type: "claude"`
- `model`: the TODO's `model` field value (`"opus"` or `"sonnet"`)
- prompt — brief it like a handoff, not a summary, matching how `/fix-todo`'s own
  Step 4 opus-delegation already briefs its agent:
  - Tell it to run `/fix-todo <id>` end to end, through its own Step 9 commit (per
    the standing-authorization note above) — don't shortcut its preflight, RED/GREEN,
    Step 6 acceptance-scenario re-drive, or verification steps just because this is
    automated. The acceptance-scenario re-drive is not optional here just because the
    loop is unattended — it's the check that most needs to survive automation intact.
  - Paste the TODO's full **Problem**/**Goal**/**Affected files**/**Proposed
    fix**/**Testing** sections verbatim so the agent isn't re-deriving them from a
    filename.
  - State the RED/GREEN order: write the failing test(s) the Testing section
    describes first, confirm they fail for the right reason, then implement the
    minimum fix, then re-run the full suite, then drive the relevant
    `TODO/ACCEPTANCE.md` scenarios via the `run` skill per `/fix-todo` Step 6.
  - Tell it explicitly that it *is* the `/run-todos` Step 4 isolated agent, so when it
    reaches `/fix-todo`'s own Step 4, it should skip that step's opus-delegation
    sub-check entirely and just do the fix directly at this agent's own model tier —
    that sub-check exists only for a user invoking `/fix-todo` directly.
  - Tell it to report back: which files it touched, the final test output (all
    stages, not just the targeted tests), the Step 6 acceptance-scenario PASS/FAIL
    report in full, and — since Step 9's commit happens inside this agent and its own
    transcript isn't otherwise visible — the full commit message, both social-post
    drafts, and the complete `TODO/VERIFY.md` entry it wrote (if any), all as printed
    in its own Step 9.

When it finishes (whether it completed normally, already turned out to be done, or hit
a preflight failure and stopped per its own Step 3 rules), **verify independently
before trusting its summary** — delegation doesn't relax this:
- Run `git diff` (or `git log -p` if it already committed) yourself and read the
  actual changes.
- Re-run the test suite yourself (`/test`) — don't take the agent's reported output as
  sufficient on its own.
- **Read its Step 6 acceptance-scenario report.** If it reports a FAIL, or if it skipped
  Step 6 entirely without a stated reason (e.g. `TODO/ACCEPTANCE.md` genuinely not
  existing yet), do not treat this task as complete — this is exactly the gate that
  distinguishes this attempt's process from the one that shipped a passing-tests app
  that didn't work.
- Check the `TODO/VERIFY.md` entry the agent wrote (if any) is actually specific to
  this task, not generic boilerplate. If it's thin or generic, fix it up yourself
  before moving on.
- Print the agent's reported commit message, social-post drafts, `TODO/VERIFY.md`
  entry, and Step 6 PASS/FAIL report as plain output in *this* conversation. The
  standing-authorization note above relies on "the transcript is the record" for
  skipping live commit confirmation — that guarantee only holds if this loop relays
  what the agent did back into its own visible output.

Note the outcome — this feeds the Runner Log row in Step 5. If `/fix-todo` stopped on
a pre-existing test failure, or on a Step 6 acceptance-scenario FAIL it couldn't
resolve, **do not** try to fix that yourself in this tick and do not treat it as
license to skip ahead to the next id automatically — report it to the user and stop
the loop (`ScheduleWakeup stop: true`) rather than ticking forward on a broken
baseline.

---

## Step 5 — Log the tick

Append (or update, if continuing an in-progress batch) the current batch's Runner Log
row in `TODO/BUDGET.md`: start time, the id just completed (append to the `ids`
column), and leave `ended because` blank if the batch continues.

Then loop back to Step 1 to check whether the batch has room for another task — don't
call `ScheduleWakeup` yet unless Step 1 or Step 2 already routed you to Step 6.

---

## Step 6 — Check in and schedule (or stop)

This is the explicit go/no-go the previous attempt's estimation scheme never had.
Report to the user, in plain output (not just the Runner Log):

- Which ids completed this batch, and how the batch ended (task-count reached,
  wall-clock reached, blocked, backlog empty, or stopped on a failure).
- **If Step 3 flagged a milestone boundary**, say so explicitly and ask for the
  five-minute free-form human pass at phone/tablet/laptop viewports before continuing
  — per `CLAUDE.md`'s Verification section, this is the one check with no scripted
  expectations, and it only works if a human actually does it. Don't schedule the next
  batch until that's confirmed done (or the user explicitly says to proceed without
  it).
- Any acceptance-scenario or regression-surface concerns surfaced during the batch,
  even if ultimately resolved before commit.

Then call `ScheduleWakeup`:

- **Backlog empty** — report completion, `stop: true`, no further fields.
- **Blocked on dependencies** — `delaySeconds: 3600`, `noop: true`, reason: "backlog
  blocked on open dependencies, re-check hourly."
- **Stopped on a pre-existing failure or an unresolved acceptance-scenario FAIL** —
  don't call `ScheduleWakeup` at all; this needs the user's attention before any
  further automated ticking, same as `/fix-todo`'s own rule for a pre-existing failure.
- **Batch complete, no milestone boundary** — schedule a check-in at a delay the user
  is comfortable with (default `1200`-`1800`, i.e. 20-30 minutes, per
  `ScheduleWakeup`'s own guidance for an idle tick with no specific external signal to
  watch), `noop: false`, reason: summarize what the batch completed.
- **Batch complete, milestone boundary pending human review** — schedule a longer
  check-in (`1800`-`3600`) rather than immediately starting the next batch, `noop:
  false`, reason: "waiting on milestone free-form review before continuing."

`prompt` is the literal `/run-todos` (the same `/loop` input the user gave to start
this loop) — echo it back verbatim each tick per `ScheduleWakeup`'s own instructions.

**Never schedule a wakeup without first appending the Runner Log row** (Step 5) — the
log is what makes a batch's history auditable later without replaying the whole
transcript.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
