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
