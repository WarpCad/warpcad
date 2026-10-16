---
title: Re-parent an inactive tail row onto the record an insert superseded
category: data
kind: feature
priority: low
model: opus
milestone: M16
depends: [data-004, ui-032]
status: done
---

> **Status (2026-10-15): ready to pick up, not started.** The build was parked on purpose, so
> `/run-todos` will not reach it on its own schedule. Two things to know before running
> `/fix-todo data-006`:
>
> - **The hand-drive gate is still owed.** The Proposed fix below says to wait for `ui-032` to
>   be driven by hand. Scenario 12 step 10 has not been tried yet (`TODO/VERIFY.md`, `data-004`
>   check 3), so the "is being told it can't be built acceptable?" judgment is still missing.
> - **Feedback shape chosen: option (c)**, "offer it, with a `Re-link to the moved step`
>   button", as decided by the user on 2026-10-15. The hand-drive is "most done" per the user;
>   whatever part is still open is the one scenario 12 step 10 judgment above.

> **What actually shipped (2026-10-15).** Option (c): a `Re-link to the moved step` button
> (`timeline-relink`) on a selected broken tail row. Three things differ from the text above.
> The offer is decided from the lineage indexes, not from a `needs…` reason: the row's real
> reason is `can't be built: supersedes "…", which has itself already been superseded by "…"`,
> and the chip just says `broken`. The offer also covers a tail **Union/Subtract** over a moved
> body (`consumes`/`operands`), wider than `supersedes`/`target`. It is structural only: it
> does not promise the row builds. `replaceRecord`'s shape guard accepts exactly the one record
> `relinkPlanOf` offers and refuses every other shape change as before.

## Goal

`docs/decisions/interaction-model-qa.md` section 18's own **"Unsure — how often the tail
breaks, and re-parenting"**, filed as a real task because `data-004` measured it rather
than leaving it as prose. Section 18 fixed the contract `data-004` had to build (flag the
row `broken`, let the user Suppress it or Undo the insert) and explicitly said it does
*not* require re-parenting — but it asked `data-004`'s Step 2 to "measure how common the
conflict is and say whether re-parenting is worth the extra contract". It was measured;
this file is the answer, and the work if the user wants it.

### The measurement

Records in this project are addressed **by id**, and every ordinary edit — a gizmo drag,
an Inspector param commit, a typed position — appends a record that `supersedes` the
body's current terminal. So rolling back, then touching a body that a later row also
builds on, supersedes the exact record that row targets, and the row is flagged `broken`.

Measured over a representative session (three bodies placed, each nudged, one filleted —
7 records, 4 of them carrying `supersedes`), across **every** legal rollback point and
every body that exists at it, for the most ordinary possible insert, "move this body":

| | |
|---|---|
| (rollback point × body) pairs where the body exists | 11 |
| ...where a "move this body" insert breaks ≥1 tail row | **4 (36%)** |

36% is high enough to be a real papercut and low enough that the flag-and-resolve
contract is not obviously wrong — most inserts touch a body whose rows are already behind
the marker. Reproduce with the script shape recorded in `TODO/done/data-004`'s retirement
note.

"Done" looks like: while rolled back, moving or resizing a body that a later inactive row
also builds on leaves that row **buildable** — the row is re-pointed at the inserted
record — instead of chipped `broken` with the user's only options being Suppress or Undo.

## Interaction model

- **Precondition** — a rollback marker is active (section 18) and at least one inactive
  tail row references a record an insert has just superseded.
- **Trigger** — none of its own. This changes what an *existing* trigger (any local
  mutation while rolled back) does to the tail. That is deliberate and is the risk: a
  silent re-point is a document edit the user never asked for.
- **Feedback** — **this is the real design question and must not be defaulted.** Three
  shapes, none yet chosen: (a) silent re-parent, tail row simply stays green; (b)
  re-parent and say so, the row briefly chipped `re-linked to step 4` so the user can see
  their history was rewritten; (c) offer it — the row stays `broken` with a `Re-link to
  the moved step` action in its action bar, so nothing changes without a press. **(c) is
  the recommendation**, because it keeps section 18's "never produces wrong geometry"
  property intact: a re-parent is a guess about intent, and this project's whole
  Verification section exists because silent guesses about geometry are how the second
  attempt shipped wrong solids under a green suite.
- **Selection count** — n/a (a row action, not a body selection).
- **Small-screen behavior** — if (c), one more 44px button in the already-crowded
  selected-row action bar at 390px; check it fits before committing to the wording.

## Documentation

- **Page** — a section in `docs/timeline.md` (created by `ui-032`), not a new page.
- **Example**: "Roll back to before a step, then move a body that a later step also uses.
  That step turns amber and says it can no longer be built. Press **Re-link to the moved
  step** to point it at the body's new position instead, then **Roll forward**."

## Affected files

- `src/core/document.js` — `rebuildFrom`/`ingestRow` already know which reference is
  missing and which record superseded it (`shadowCheckTail` computes exactly this to
  produce the `needs …` reason). Re-parenting is a `replaceRecord`-shaped edit of the tail
  row's `supersedes`/`target`, so it should reuse that primitive rather than add a second
  way to rewrite a record. Note `replaceRecord` deliberately **refuses** to change those
  fields today — that guard is load-bearing and this task has to widen it knowingly, not
  delete it.
- `src/components/timeline/` and `src/composables/useTimelineCommands.js` (`ui-032`'s) —
  whichever of (a)/(b)/(c) is chosen.
- `docs/timeline.md`.

## Proposed fix

**Do not start this until `ui-032` has been driven by hand and the 36% has been felt
rather than read.** The honest reason this is `priority: low` and not `medium`: the
number above is a static count over one synthetic session, and whether a user *minds*
depends entirely on whether the rows that break are ones they cared about. `ui-032`'s own
first real drive is the cheapest possible source of that evidence, and it costs nothing to
wait for it.

If it is built: re-parent **only** the exact case section 18 names — the insert
`supersedes` the precise record the tail row targets — and never the general case. A tail
row that broke because its own build threw is a different failure with no re-parent
available, and must keep the `can't be built:` reason it has now.

## Effort

M — small mechanism, real design ambiguity in the feedback shape, and a correctness
requirement that it never re-points a row onto a record the user did not mean. `model:
opus` per `TODO/README.md`'s guidance on real architectural ambiguity in the document
model.

## Testing

- `timeline.spec.js`: roll back, move a body a tail row builds on, confirm the row is
  re-parented and **builds on roll-forward**; confirm a tail row broken for the *other*
  reason (its own build throws) is untouched; confirm a re-parent is one undoable step and
  that undoing it restores the original `supersedes`.
- `ui-032`'s `e2e/timeline-panel.e2e.js` extended, if the feedback shape is (b) or (c) —
  a new control needs the reachability gate like any other.
- **`TODO/ACCEPTANCE.md` scenario 12** by name — specifically step 10, which rolls back
  and inserts. Scenario 1 re-drive, since this changes what the fold evaluates.
- **Closed-finding regression surface**: `core-020`'s repro after a re-parent, and
  `data-004`'s own atomicity repro (a refused edit changes nothing, including the derived
  indexes) — re-parenting writes to the same `rebuildFrom` path.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
