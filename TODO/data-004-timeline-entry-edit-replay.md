---
title: Edit a past timeline entry's params in place and replay every entry after it
category: data
kind: feature
priority: medium
model: opus
milestone: M6
depends: [data-003]
status: open
---

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
