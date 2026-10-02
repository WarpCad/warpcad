---
title: Edit a past timeline entry's params in place and replay every entry after it
category: data
kind: feature
priority: medium
model: opus
milestone: M6
depends: [data-003]
status: done
---

> ## What actually shipped, and the decisions behind it
>
> **This file predates `data-002`'s answers and `data-003`'s code**, and both override it
> where they disagree. The file asks "full re-fold or incremental?" and "what shape does a
> broken downstream take?" as open ground; `docs/decisions/interaction-model-qa.md`
> sections 15-18 had since decided the user-facing half (atomic rejection naming the row,
> plus informational `broken` flags on the inactive tail via a shadow check), and
> `data-003` had already built the mechanism — `rebuildFrom(nextEntries)`, a full re-fold
> through the *same* `ingest` function `append` uses, atomic via
> `captureDerived`/`resetDerived`, with redo as an insert-at-index. So this task
> **widened that one primitive** rather than building a second replay engine, exactly as
> `data-003`'s own retirement note asked.
>
> ### The widening, in one line
>
> `rebuildFrom(nextEntries, nextRollbackAt)`. Entries may now carry `suppressed`, and the
> fold stops at a **rollback marker** stored as the count of active entries. That is the
> whole mechanism; sections 15-18's four features are four ways to call it:
>
> | Section | Method | What it hands `rebuildFrom` |
> |---|---|---|
> | 15 edit in place | `replaceRecord(id, record, tx)` | one entry's record swapped |
> | 16 suppress | `setSuppressed(id, bool, tx)` | one entry flagged |
> | 17 reorder | `canMove(id, delta)` / `moveStep(id, delta, tx)` | two entries swapped |
> | 18 rollback | `rollBackTo(id, tx)` / `rollForward(tx)` / `insertAt(i, records, tx)` | a new marker / a splice |
>
> `appendAll` now inserts at the marker when one is set, which is what makes section 18's
> "nothing is blocked" true for drag-place, the toolbar, the gizmo, the Inspector and
> Sketch **without any of them knowing the marker exists**.
>
> ### The broken-downstream contract `ui-032` consumes
>
> The file asked for this to be answered here first, and it is, as a **typed object** the
> panel never has to parse out of a string:
>
> - `BrokenStep` = `{ id, step, label, reason }` — `step` is the **1-based row number**
>   section 15's `Step 4 (…)` message means, not an array index.
> - `ReplayRejection extends Error` carries one on `.step`, and is **thrown** by every
>   action on the *active* document that cannot complete. Message shape:
>   `Step 4 (Fillet Cube 1) can't be built: radius 4 mm doesn't fit`. Atomic: the document,
>   including every derived index, is exactly as it was.
> - `document.brokenSteps()` returns them for the **inactive tail**, and `TimelineRow.broken`
>   carries the reason per row — informational, never a rejection, per section 18's "the
>   insert itself still succeeds".
> - Exactly **two** reason shapes, deliberately: `needs <body name>` (the row references a
>   record this fold no longer has) and `can't be built: <why>` (the record's own build
>   threw). The second is the reuse this file's Proposed fix asked for — `assertRadiusFits`
>   already throws, and nothing invented an "invalid downstream" concept beside it. The
>   first exists because `ingest` names an **id** where a user needs a **name**, which is
>   why `displayNameOf` walks `supersedes` back to the lineage root.
>
> `document.timeline()` is the row list the panel renders: `{ step, id, record, origin,
> label, suppressed, active, broken }`. `document.recordOf(id)` reads off `entries`, not
> the derived indexes, so it answers for suppressed and inactive rows too.
> `document.rollbackAt()` is the marker as an active-entry count, which is the form every
> consumer actually asks for (`Rolled back to step 2 of 5`).
>
> ### The read-only guard, revisited as the file demanded
>
> The file says `ui-029`'s fillet/chamfer freeze "needs revisiting, since replaying past
> such an op is this task's point". Revisited — and it turned out to be a **different
> question**, not a wrong answer. `paramEditability` guards the *append* path, where a
> rebuilt creation record genuinely discards the fillet sitting above it; it is correct and
> is unchanged. The new `stepParamEditability` guards the *replace* path, where the fillet
> record is still there and still replays, so there is nothing to freeze. What the replace
> path refuses instead is narrower: a boolean/group row (no params of its own — section
> 15's "This step has no parameters"), a composite row (a catalogue choice needing a
> dropdown, same reason `ui-029`/`ui-030` gave), and the `rotation` param on any row.
>
> **That last one is a real, stated capability gap, not an oversight**: `core-004` decided
> rotation is carried as an **absolute** value on every later transform record, so editing
> one row's copy would be silently overwritten by the next — the "wrong geometry, no error"
> class this milestone exists to catch. A consequence worth naming out loud: a
> `transform.rotate` row's *only* param is that value, so **such a row is not editable at
> all today**. `ui-032` should disable its `Edit` with that reason rather than showing an
> empty form. Making it editable is a new task, not a tweak.
>
> ### Measured, as CLAUDE.md's Performance section requires
>
> Full re-fold, worst case (editing the **first** row so everything re-folds), against the
> real kernel with a `modify.filletRim` on every body — the most expensive op in the
> registry:
>
> | Log | Median full re-fold |
> |---|---|
> | 40 records, 10 bodies | 17 ms |
> | 100 records, 25 bodies | 34 ms |
> | 200 records, 50 bodies | 67 ms |
>
> Linear in record count and dominated by the kernel, not by this module's bookkeeping. A
> re-fold happens on a deliberate row action, never per frame, so the 16 ms budget (which
> is about pan/zoom/drag) is not the bar. No incremental re-fold until a document is big
> enough for that to be measured as a real problem — which is what this file's own Proposed
> fix asked for, and now has a number behind it.
>
> ### Section 18's "Unsure" — measured, and filed rather than built
>
> Section 18 asked this task to measure how often an insert breaks a tail row by
> superseding the record that row targets. Measured over a representative 7-record session
> at **every** legal rollback point, for the most ordinary insert ("move this body"):
> **4 of 11 (36%)** of (rollback point × body) pairs break at least one tail row. That is a
> real papercut, and it is **not** built here: section 18 requires the flag-and-resolve
> contract (which is built) and explicitly does not require re-parenting. Rewriting what a
> record points at is a guess about intent, and this project's Verification section exists
> because silent guesses about geometry are how the second attempt shipped wrong solids
> under a green suite. Filed as `TODO/data-006`, `depends: [data-004, ui-032]`, with the
> number, three candidate feedback shapes and a recommendation — and a note to drive
> `ui-032` by hand before starting it.
>
> ### Smaller things, recorded rather than left implicit
>
> - **`nextId` was hardened.** It checked candidates against `originById`, which holds only
>   *ingested* records — so a suppressed or rolled-back row's id could have been handed out
>   again and collided the moment that row came back. It now checks `entries` too. Latent
>   before this task; reachable after it.
> - **`replaceRecord` refuses to change `op`/`supersedes`/`consumes`/`target`/`operands`.**
>   That guard is what makes the re-fold "the same fold, one input changed" rather than a
>   re-parent with its own correctness argument, and it is what keeps `canMove`'s static
>   check honest. `data-006` has to widen it knowingly if it is ever built.
> - **Undo of a row action is an inverse, not a snapshot.** Restoring a before/after
>   snapshot of `entries` would silently delete any record another writer appended in
>   between — the exact thing section 19's origin scoping exists to prevent. So a
>   `HistoryStep` may carry a `LogRevision` (`replace`/`suppress`/`reorder`/`rollback`) that
>   undo inverts, plus `rollbackBefore`/`rollbackAfter` so Undo moves the marker back with
>   the row it removes, per section 18.
> - **While rolled back, a *non-local* append also inserts at the marker.** Section 18 only
>   discusses local mutations, but appending a remote record past the marker would land it
>   in the inactive tail where the user would never see the arrival section 19 point 3 says
>   must announce itself.
> - **Tests went in `src/core/timeline.spec.js`**, not `document.spec.js` as this file's
>   Testing section says — `document.spec.js` is already 1,100 lines of append/lineage
>   rules, and `history.spec.js` set the one-file-per-feature-area precedent one task
>   earlier. 39 cases, against both a fake registry and the real kernel.
> - **No `*.e2e.js`, stated explicitly as `TODO/README.md` requires**: this task has no UI
>   surface of its own. `ui-032` owns the reachable end-to-end spec, and until it exists
>   `ACCEPTANCE.md` scenario 12 stays a partial pass — its mechanism is built and
>   unit-proven, its reachability is unchanged.

## Goal

`ui-029` built "rebuild the selected body's own creation record" — editing a *currently
selected, currently terminal* body's own params and reapplying its pose via
`lineageOf`/`moveToRecord`/`rotateToRecord`. This task generalises that from "the
selected body's own current state" to **any record, anywhere in any body's history**,
which is the actual capability `TODO/ACCEPTANCE.md` scenario 12 is modeled on: chamfer
an edge 5mm, place more items afterward, then decide the chamfer should have been 3mm —
editing a step that is **not** the current terminal of its lineage and that other,
later, unrelated steps already depend on existing.

"Done" looks like: pick any past entry (via `ui-032`'s eventual timeline panel, which
this task's mechanism feeds), change one of its params, and every entry after it in the
document replays against the new value — the edited body's own later transforms/rim-ops
still apply correctly, and anything placed independently afterward (the scenario's
sphere) is untouched. If a later entry's own validity depended on the old value in a way
that's now broken, the app surfaces that explicitly rather than silently producing wrong
geometry.

## Interaction model

n/a directly for this task — it is the **data-layer replay mechanism**, not a control;
`ui-032` is the control that calls it. State explicitly per `TODO/README.md`. One
contract this task must define that the UI consumes directly: what shape does "this
edit broke a downstream entry" take (a thrown error naming the entry? a returned list of
now-invalid downstream ids?) — `ui-032` cannot build correct feedback without this
answered here first.

## Documentation

n/a directly — no UI surface of its own. `ui-032`'s Documentation section owns the
end-user page for "editing a timeline step," once a real control exists to document.

## Affected files

- `src/core/document.js` — needs a real **replay-from-point** operation: given an
  edited record (identified by id, anywhere in `entries`, not just the terminal),
  rebuild it and re-fold every record after it in original order, producing a new
  `entries`/`byId`/lineage-index state. This is structurally different from `ui-012`'s
  incremental `applyAction` (append-only) and from `ui-029`'s `paramEdit.js` (only ever
  targets a lineage's *current* terminal) — neither can be reused unmodified.
- `src/core/paramEdit.js` — `ui-029`'s existing record-building function generalises
  from "the root's current params, editing this body" to "an arbitrary historical
  record's params, anywhere in `entries`"; the lineage-walk read-only guard `ui-029`
  built (a fillet/chamfer in the chain freezes Parameter edits) needs revisiting here
  too, since replaying *past* such an op is exactly this task's whole point rather than
  something to refuse.
- `src/core/replay.js` — `core-002`'s NDJSON fold engine is the batch-evaluation
  primitive this likely reuses (replay-from-point is "fold from an edited midpoint
  forward," which is structurally a partial re-run of the same fold `replay.js` already
  does in full) — read this file closely at Step 2 before designing a new mechanism.
- New `.spec.js` coverage, see Testing.

## Proposed fix

**Investigate before proposing a specific mechanism — this is real, undesigned
ground.** The core question: is "replay from point" a full re-fold of `entries` with one
record's params substituted (simplest, reuses `replay.js`'s existing batch fold
directly, correctness is easy to argue since it's "the same fold, one input changed"),
or an incremental re-fold starting partway through `entries` (faster for a large
document, but needs a correctness argument that partial-refold produces identical
output to full-refold, which is exactly the kind of subtle fold-equivalence bug
`core-020` shows this codebase can get wrong).

**Recommend the full-refold approach first** unless a real performance problem is
measured — `CLAUDE.md`'s Performance section requires measuring before optimizing, and
correctness-by-construction (reusing the already-proven batch fold verbatim) is worth
more here than a speed win with no measured need yet.

**The "downstream validity broke" contract** (per Interaction model above) needs a
concrete mechanism: recommend the full-refold path simply **lets a downstream record's
own build throw** (the same way `modify.filletRim`'s `assertRadiusFits` already throws
today when a param doesn't fit its target geometry) and catches it at the top of the
replay, reporting which record failed — reusing an existing failure mode rather than
inventing a new "invalid downstream" concept.

## Effort

L — real, undesigned data-model work with a direct correctness requirement
(`CLAUDE.md`'s "never silently produce wrong geometry" bar, the exact failure class
`SECOND-ATTEMPT.md` names), building directly on `data-003`'s not-yet-designed
transaction-origin/inverse-append model (the two must agree on what "history" means).
`model: opus` per `TODO/README.md`'s guidance on geometry/numerics correctness risk and
real architectural ambiguity with no existing pattern to mirror.

## Testing

- `document.spec.js`: edit a **non-terminal** record (a chamfer applied before a later
  unrelated placement) and confirm (a) the chamfered body reflects the new value, (b)
  the later unrelated body is byte-identical to before the edit, (c) `bodies()` reports
  the same count as before. Degenerate case named in the Goal: a downstream record whose
  own build now throws against the new value — confirm the replay reports which record
  failed rather than silently producing a partial or wrong document.
- No `*.e2e.js` required directly by this task, per `TODO/README.md`'s rule that a task
  with no UI surface states this explicitly — `ui-032` owns the reachable end-to-end
  spec once a control exists to drive this mechanism from.
- **`TODO/ACCEPTANCE.md` scenario 12** by name — this is the scenario the whole
  milestone is modeled on; drive it in full once `ui-032` also exists to provide the
  trigger, per that scenario's own Steps (chamfer 5mm, place a sphere, edit the chamfer
  to 3mm, confirm the sphere untouched and the app surfaces any broken downstream step
  rather than silently producing wrong geometry).
- **Closed-finding regression surface**: `core-020`'s repro, re-run after a mid-history
  edit specifically (edit a step *before* a composite placement in the timeline, confirm
  the composite still holds only its own parts after the replay).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
