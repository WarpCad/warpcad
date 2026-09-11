# Backlog Runner Cadence — Fixed Batch + Go/No-Go

Read (and appended to) by `/run-todos` on every tick. This file replaces the previous
attempt's token-window-estimation scheme, which never worked in practice — see
`SECOND-ATTEMPT.md` section 5 and this note's own history for why.

## Why this file doesn't do token math anymore

The second attempt paced `/run-todos` against three rolling-window token-spend
estimates (trailing 5h/24h/7d), computed from self-reported per-task token figures. Its
own `BUDGET.md` had to raise the calibration constant twice in three days (10% → 50% →
300% of the daily rate) because the estimate routinely overshot the user's actual,
directly-checked usage by anywhere from 1.2x to roughly 40x — always in the same
direction, never the other way, across more than a dozen manual checkpoints. The loop
had no way to cross-check its own arithmetic against reality except a human manually
reporting a usage percentage, which defeats the point of automating the pacing
decision in the first place. `SECOND-ATTEMPT.md`'s own recommendation: *"If [the
harness] can't [expose real usage], don't build a self-estimating budget gate that
swings between stalling and overrunning while it calibrates against a number it can't
see — a fixed, conservative task-count-per-check-in cadence with an explicit user
go/no-go is more honest."*

This file is that fixed cadence. If a future session gains reliable access to a real,
queryable usage figure (not a self-reported estimate), that's worth revisiting — but
don't rebuild the estimation math without one.

## Config

- **Batch size**: 3 tasks per unattended run, before stopping for a check-in.
  Start conservative; raise this number once a few batches have actually run and the
  user is comfortable with how much unattended work that represents — but raise it
  because the user said so, not because the loop estimated it had headroom.
- **Hard wall-clock cap per batch**: 3 hours. Whichever limit — task count or
  wall-clock — is hit first ends the batch and triggers the check-in.
- **Milestone boundary**: if a batch's last task also happens to complete the current
  `TODO/ROADMAP.md` milestone, the check-in additionally names the milestone and asks
  for the five-minute free-form human pass from `CLAUDE.md`'s Verification section
  before the next batch starts — even if the task-count/wall-clock limits above hadn't
  been hit yet. See `.claude/commands/run-todos.md`.

Edit **Batch size** any time. Everything below this line is a log, not logic the runner
reads back — treat it as a human-readable history of what ran.

## Runner Log

Append one row per batch (not per task) here: start time, end time, task ids
completed (in order), how the batch ended (task-count reached / wall-clock reached /
blocked on dependencies / backlog empty / stopped on a pre-existing test failure), and
whether a milestone boundary was hit.

| batch start (UTC) | batch end (UTC) | ids | ended because | milestone boundary? |
|---|---|---|---|---|
| 2026-09-05 19:35 | 2026-09-05 20:00 | `docs-004`, `core-003` | milestone boundary (M0 complete) | yes — M0 |
| 2026-09-05 20:38 | 2026-09-06 01:22 | `render-001`, `ui-010`, `ui-011` | task-count reached (3) | no |
| ~2026-09-06 12:44 (approximate — not logged synchronously at Step 1) | 2026-09-06 13:14 | `ui-012` | milestone boundary (M1 complete) | yes — M1 |
| ~2026-09-06 15:24 (approximate) | 2026-09-06 16:38 | `ui-017`, `ui-018`, `ui-019` | task-count reached (3); also a milestone boundary (M1 complete, 2nd time) | yes — M1 |
| 2026-09-06 18:16 | 2026-09-06 19:23 | `build-002`, `ui-023`, `core-004` | task-count reached (3) | no |
| 2026-09-07 16:04 | 2026-09-07 18:47 | `ui-022`, `ui-021`, `ui-024` | task-count reached (3) | no |
| 2026-09-07 18:53 | 2026-09-07 18:58 | `ui-025` | milestone boundary (M1.5 complete) | yes — M1.5 |
| 2026-09-09 12:37 | 2026-09-09 13:38 | `ui-013`, `core-010`, `core-011` | task-count reached (3) | no |
| 2026-09-09 14:02 | 2026-09-09 14:37 | `core-012` | milestone boundary (M2 complete) | yes — M2 |
| 2026-09-10 15:25 | 2026-09-10 15:57 | `core-013` | blocked — every remaining M3 row is a *reserved* id (`ui-014`, `ui-015`, `ui-016`, `ui-026`, `core-019`) with no `TODO/<id>-*.md` file yet, so there is nothing for `/fix-todo` to run; this is a scoping gap, not an open-dependency block | no — M3, not last remaining row |

Note on the row above: the M2 milestone-boundary five-minute free-form pass (flagged by
the previous row) had not been confirmed done when this batch started. Asked the user
explicitly at Step 0 of this tick; they said skip it and proceed. Recorded here rather
than silently treated as satisfied.

| 2026-09-10 16:49 | 2026-09-10 22:29 | `ui-014`, `core-020` | blocked — every remaining M3 row (`ui-015`, `ui-016`, `ui-026`, `core-019`) is again a reserved id with no file; batch also stopped short of task-count (2 of 3) rather than scope a third row without checking in again | no — M3, not last remaining row |

Note on the row above: `ui-014` was unblocked by scoping it as its own task first
(commit `beef31c`, `TODO/ui-014-boolean-operations.md`), per the user's explicit
"scope it now, then keep going" answer to the batch-10 check-in. `core-020` was filed
by `ui-014`'s own acceptance drive (a real pre-existing composite-fold bug, not a
scoping gap) and picked up next since it already had a real file and satisfied deps,
ahead of the still-unscoped `ui-015`/`ui-016`/`ui-026`/`core-019` reserved rows.

| 2026-09-11 13:58 | 2026-09-11 13:58 | *(none)* | blocked — identical scoping gap as the previous two batches: every remaining M3 row with satisfied deps (`ui-015`, `ui-026`, `core-019`) is still a reserved id with no `TODO/<id>-*.md` file (confirmed via a fresh `ls TODO/*.md` and `TODO/done/`, not assumed from this file's own history); `ui-016` additionally depends on the still-unscoped `ui-015`. No file was created for any of them since the last check-in, so this tick asked the user directly rather than re-running the same hourly re-check a third time | no — M3, no eligible task run |
| 2026-09-11 14:03 | 2026-09-11 14:35 | `ui-015` | 1 of 3 tasks — continuing this batch | no — M3, `ui-016`/`ui-026`/`core-019` still unscoped |
