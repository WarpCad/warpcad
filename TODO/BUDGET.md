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
| 2026-09-11 14:03 | 2026-09-11 14:41 | `ui-015` | user chose to stop after 1 of 3 tasks rather than also scope+run `ui-016` (the next M3 row, itself unblocked by `ui-015` but still reserved with no file) — asked explicitly since `ui-016` is a materially different kind of task (new Inspector breadcrumb/click-depth UI) than `ui-015`'s toolbar-button addition, not assumed to carry the same go-ahead automatically | no — M3, `ui-016`/`ui-026`/`core-019` still unscoped |
| 2026-09-11 18:57 | 2026-09-11 18:57 | *(none)* | blocked — same scoping gap as the prior three batches, re-confirmed fresh via `ls TODO/*.md` and `TODO/done/`: `ui-016` (deps `ui-015`, now done), `ui-026` (deps `core-013`, now done), and `core-019` (deps `core-001`, done) are all dependency-unblocked but still reserved with no `TODO/<id>-*.md` file, so there is nothing for `/fix-todo` to run. This invocation was a plain `/run-todos`, not `/loop /run-todos`, so it stops here for the user rather than scheduling a check-in | no — M3, no eligible task run |
| 2026-09-11 19:00 | 2026-09-11 19:33 | `ui-016` | user chose to scope `ui-016` now and run it in the same tick, after the scoping-gap check-in above — scoped in `TODO/ui-016-group-subpart-selection.md` (commit `e091f2b`), run to completion by a fresh opus agent (commit `5fc938a`), independently re-verified (typecheck clean, 521/521 unit, 653 passed/122 skipped/0 failed e2e, matching the agent's own reported numbers exactly). Single-tick `/run-todos` invocation (not `/loop /run-todos`), so it stops here rather than continuing toward the 3-task batch cap | no — M3, `ui-026`/`core-019` still unscoped |
| 2026-09-11 19:52 | 2026-09-12 15:15 | `ui-026`, `core-019` | milestone boundary (M3 complete) — batch stopped at 2 of 3 tasks rather than pull in an M4 row, since `core-019` completing M3 triggers the check-in regardless of the task-count cap not yet being hit, per this file's own Milestone boundary rule | yes — M3 |

Note on the row above: `core-019`'s own run was interrupted mid-Step-7 by an Opus API
rate limit (session-limit 429, reset ~18h30m later) after its implementation and Step 6
acceptance-drive were already complete and independently verified (typecheck clean,
559/559 unit, 671/158/0 e2e — matching the interrupted agent's own in-progress claims
exactly). Rather than discard that verified work, a fresh sonnet agent was spawned to
finish only the remaining bookkeeping (retirement note, ROADMAP.md, commit) once the
rate limit had cleared — the implementation was never redone. `ui-026` ran cleanly
start to finish in one agent, no interruption. **M3 is now fully ✅ — this milestone
boundary needs the five-minute free-form human pass at phone/tablet/laptop viewports
before M4 work starts**, per `CLAUDE.md`'s Verification section.

Note on the row above: the M3 milestone-boundary pass was done by the user directly
(2026-09-12, outside this loop) and surfaced a real bug — a Cylinder's Diameter field
in the Inspector doesn't accept edits — scoped as `TODO/ui-029-editable-primitive-
parameters.md` (M4, commit `4bd4a50`). Confirmed explicitly with the user at the start
of this tick that this counts as the required pass; M4 work may proceed. Two other
pending changes found uncommitted at the same time were committed separately first:
`TODO/VERIFY.md`'s checkbox-to-table reformat (commit `fb0030e`) and the `ui-029`
scoping itself (`4bd4a50`); a draft LinkedIn post was found alongside them but held
out per the user's explicit choice, not committed.

| 2026-09-12 16:41 | 2026-09-12 16:56 | `core-014a` | single-tick invocation (plain `/run-todos`, not `/loop /run-todos`) — stops after one task per this file's own header | no — M4, `core-014`/`015`/`016`/`017`/`018`/`ui-020`/`ui-027`/`ui-029`/`core-021`/edge-fillet all still open |

Note on the row above: `core-014a` was a decision-doc task with no code changes, so
Step 6's acceptance-scenario re-drive did not apply (explicitly stated as such, not
silently skipped) — see the retired file's own Testing section and the commit
message. Worth flagging here because the task's own re-verification step overturned
its original survey: the scoping pass had concluded no real `jscad-raspberrypi`
recipe measures a separately-built accessory against a separately-built board: a
fresh survey found eight that do, two requiring it. The decision (no two-phase fold
redesign needed) survived on different grounds, and `core-016`/`017`/`018` now carry
a named requirement in `TODO/ROADMAP.md` as a result. Independently re-verified:
typecheck clean, 559/559 unit, 671/158/0 e2e, matching the agent's own reported
numbers exactly; `git show --stat` confirms only the decision doc, `ROADMAP.md`, the
retirement note, and two chat drafts changed — no source touched.

| 2026-09-12 16:59 | 2026-09-12 22:12 | `ui-020`, `ui-027`, `ui-029` | task-count reached (3) | no — M4, `core-014`–`018` (reserved), `ui-028` (reserved), Bearing (unscoped, blocked on data) all still open |
| 2026-09-13 18:14 | 2026-09-13 20:05 | `core-014`, `core-015`, `core-016` | task-count reached (3) | no — M4, `core-017`, `core-018`, `ui-028`, `core-021` (reserved), edge-fillet (blocked on user decision) still open |

Note on the row above: `core-017` ran to completion (commit `c1af594`) outside this loop's own bookkeeping — a real task, properly scoped and closed, just not logged as its own Runner Log row when it happened. Recorded here rather than silently absorbed into the next row, per this file's own "history, not logic the runner reads back" convention.

| 2026-09-16 23:34 | 2026-09-17 13:14 | `core-018` | wall-clock reached (batch found still open on a fresh tick, real elapsed time well past the 3h cap; not a continuous unattended run) | no — M4, `ui-028` still open; `core-021` (reserved), Bearing (unscoped, blocked on data), edge-fillet (blocked on user decision) not eligible |

Note on the row above: this tick's Step 0 also found substantial *uncommitted* work for
`ui-028` already sitting in the tree (full `OperationsToolbar.vue` implementation plus
its 466-line e2e spec) — not logged in this file, so it came from outside this loop's
own bookkeeping, mid-flight rather than complete (TODO file still `status: open`, no
docs page, no `ROADMAP.md` update, no retirement note, nothing committed). Verified
before asking: typecheck clean, 826/826 unit tests, and the new e2e spec's own 6 tests
all pass on `chromium-laptop`. Asked the user explicitly rather than guessing; they
chose to finish it now rather than discard or commit it half-done. See the next row.

| 2026-09-17 13:14 | 2026-09-17 13:41 | `ui-028` | blocked — every remaining M4 row (`core-021` reserved and deliberately deferred, Bearing unscoped/blocked on a user data table, edge-fillet blocked on the OpenCascade.js user decision) needs a human input this loop cannot supply, not another task | no — M4 not fully ✅, but its only remaining rows are all blocked on the same kind of input |

Note on the row above: `ui-028`'s own uncommitted implementation (found at Step 0, see
the row above) was picked up by a fresh sonnet agent rather than redone — it reviewed
the existing diff against the TODO's own spec, ran the full 3-viewport×3-engine e2e
matrix (8/9 green; the 3 `firefox-*` cells fail at browser launch in this sandbox,
confirmed pre-existing and unrelated by reproducing the identical failure against the
already-shipped `fillet-chamfer-operation.e2e.js`, logged to `TROUBLESHOOTING.md`),
wrote `docs/resize-bisect.md`, updated `ROADMAP.md`, wrote the retirement note, and
committed (`fc876fd`, plus `739ef0b` for the social drafts). Independently re-verified
by this loop before logging: typecheck clean, 826/826 unit, a spot-check of
`chromium-phone`/`chromium-tablet`/`webkit-laptop` (18/18) plus the previously-confirmed
`chromium-laptop` (6/6), and the Firefox failure re-reproduced against the older spec.
`TODO/ACCEPTANCE.md` scenario 1 and `ui-016`'s original closed-finding repro (re-run
against a Bisect-produced group for the first time) both read as real, specific PASS
reports, not boilerplate. The untracked `chat/linkedin-third-times-the-charm.md` draft
was confirmed untouched throughout, per the user's implicit "don't touch that one."

At the check-in, asked the user how to handle the three blocked M4 rows rather than
silently scheduling an hourly recheck; they chose to resolve `core-021` by scoping it
now (commit `45910f7`, `TODO/core-021-angled-bisect.md`) rather than answer the
OpenCascade.js question or provide a Bearing spec table. Scoping found the roadmap
row's own premise was too pessimistic: the angled cut reduces to a coordinate-transform
composition of `core-019`'s existing straight-cut machinery, not new boolean geometry
— confirmed by reading real V1 (`jscad-utils@3.2.0`) and `@jscad/csg` source rather than
guessing. Kept `model: opus` per this project's convention for rotation-center/axis
numerics, not because the technique itself is novel. The user then chose to continue
the loop and run it immediately rather than stop for the day.

| 2026-09-17 13:44 | 2026-09-17 13:56 | `core-021` | blocked — same two remaining M4 blockers as before (Bearing, edge-fillet), both still needing a user decision/data this loop cannot supply; `core-021` was the only eligible row and is now done | no — M4 not fully ✅, but its only remaining rows are both blocked on the same kind of input |

Note on the row above: this is a real finding, not a routine port — worth reading in
full before treating this row as routine bookkeeping. The angled-bisect implementation
(`0c4d08d`, plus `2f764dc` for social drafts) landed exactly as scoped
(coordinate-transform composition, no new boolean geometry), but its own new V1
fixture cases exposed a **latent, already-shipped defect**: `core-019`'s straight
`bisect` was wrong on the `y` axis specifically — V1 builds that one cut plane from a
left-handed basis pair (`['X','Z']`, confirmed directly against
`node_modules/jscad-utils/src/util.js:906-923` by this loop, not just trusted from the
agent's report), so V1's own `negative` half is the **maximum**-side piece on `y` alone,
opposite of `x`/`z`. `core-019`'s original fixture only covered `x`/`z`, so nothing
measured it, and `group.spec.js` had encoded the wrong expectation since `core-019`
shipped. Fixed in both the straight and angled paths via one `NEGATIVE_IS_MAX_SIDE`
table, pinned by two new straight-`y` fixture cases. This is a **behavior change to
already-shipped, user-reachable code** (a `y`-axis Bisect via `ui-028`'s popover now
names its halves the other way round) — flagged explicitly in a new `TODO/VERIFY.md`
entry as an open product judgment call (reproduce V1's quirk faithfully, which is what
shipped, vs. diverge for least-surprise), not silently decided either way. Independently
re-verified by this loop: typecheck clean, 848/848 unit (+22 from before), the vendored
V1 source directly inspected to confirm the handedness claim, and
`e2e/resize-bisect-operation.e2e.js` re-run green on both `chromium-laptop` and
`webkit-laptop` (12/12), including its real Y-axis Bisect case. No acceptance-scenario
re-drive was needed or attempted — this task has no UI surface of its own and doesn't
change the two-part `Group` shape `ui-016`'s subsystem cares about, only which half
carries which name, per the task's own Testing section.

At the check-in, asked the user what to do about the Y-axis finding directly (not just
log it and move on); they chose to diverge from V1 for least-surprise rather than keep
the faithfully-reproduced-but-inconsistent naming. Scoped that as `core-022`
(commit `7ed12df`) — a small (S), well-precedented reversal of `core-021`'s own
`NEGATIVE_IS_MAX_SIDE` table — and resolved `TODO/VERIFY.md`'s `core-021` entry
accordingly rather than leaving it open. User chose to continue the loop and run it.

| 2026-09-17 14:19 | 2026-09-17 14:32 | `core-022` | blocked — same two remaining M4 blockers as before (Bearing, edge-fillet); `core-022` was the only eligible row and is now done | no — M4 not fully ✅, but its only remaining rows are both blocked on the same kind of input |

Note on the row above: `negative`/`positive` now always mean min-side/max-side on every
axis (`8dad197`, plus `cf9d4b1` for social drafts) — `NEGATIVE_IS_MAX_SIDE` deleted,
`asGroup` simplified unconditionally, the real V1 fixture data left untouched (it's a
historical record of measured output, not a naming contract) with a new
`expectedPartsFor` swap helper handling the `y`-axis comparison instead. The agent also
caught and fixed a real internal inconsistency in this loop's own scoping file (the
Proposed fix's example values contradicted its own "min-side" label); resolved by the
geometrically-correct reading, matching the Goal section. Independently re-verified:
typecheck clean, 848/848 unit, `e2e/resize-bisect-operation.e2e.js` green on both
`chromium-laptop` and `webkit-laptop` (12/12), and the "e2e spec is name-agnostic"
claim this task's own file made was confirmed by reading the spec, not just trusted.
No acceptance-scenario re-drive needed, same reasoning as `core-021`.

At the check-in the user asked to work on the Bearing blocker directly ("do the bearing
spec table") rather than recheck hourly or answer the OpenCascade.js question. Sourced a
real DIN 625/ISO 15 deep-groove ball bearing table (608, 6000-6004, 6200-6204,
6300-6304) via `WebSearch`/`WebFetch`, cross-checked against two independent published
sources (igus and ISK/Be-cu), which agreed exactly on every value — presented to the
user before scoping. Scoped as `core-023` (commit `e0ee671`), unblocking the roadmap's
long-standing "unscoped — needs a spec table" Bearing row. User chose to continue the
loop and run it immediately.

| 2026-09-17 15:35 | 2026-09-17 15:48 | `core-023` | blocked — one remaining M4 row (edge-fillet) still needs the OpenCascade.js user decision; `core-023` was the only eligible row and is now done | no — M4 not fully ✅, but its only remaining row is blocked on that one input |

Note on the row above: `hardware.bearing` registered (`d8463a8`, plus `478ac3e` for
social drafts) as a one-record `primitive.tube` composite — the simplest of the four
`hardware.*` recipes, no `fit`/conditional part, since there's no V1 source to mirror
one from at all (`core-003` already confirmed `jscad-hardware` has no `Bearing`
factory). The table-injection wiring turned out to live in `kernel/index.js`'s
`DEFAULT_TABLES`, not `registry.js` — confirmed by reading rather than assumed, per the
task's own flagged uncertainty. Volume sanity check (`608` built through the real fold
at 64 segments) measured **2305.363mm³**, matching `core-003`'s own already-recorded
spike figure exactly — strong evidence the table and tessellation assumptions haven't
drifted, in place of the V1 fixture diff this recipe can't have. Independently
re-verified by this loop: typecheck clean, 879/879 unit (+28), the bearing spec file's
own 28 tests re-run directly, and the spec table's 16 values checked against this
loop's own independently-sourced data — exact match on every row. No acceptance-scenario
or closed-finding re-drive needed — kernel-only, no UI surface, same reasoning
`core-010`/`core-011`/`core-012` gave for their own `hardware.*`/`kit.*` additions.

**M4's last open row is now `edge-fillet`, blocked on the user's own OpenCascade.js
fork decision** — nothing else remains for `/run-todos` to pick up.
