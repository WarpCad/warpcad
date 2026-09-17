---
title: Decide how a boolean operand can address a composite's hidden sub-part
category: core
kind: feature
priority: high
model: opus
milestone: M5
depends: [core-013, ui-030]
status: open
---

## Goal

`core-013` wired `group.snap`/`group.align` to accept a sub-part-addressed operand
(`{ id, pieces }`), but deliberately made `boolean.union`/`subtract`/`intersect` refuse
one outright — confirmed still in place as of `core-018` and re-verified live in the
browser in `TODO/ACCEPTANCE.md`'s scenario-3 re-checks ("the guard also fires in the
browser: `boolean.subtract` handed a `{ id, pieces }` operand throws by name rather than
silently measuring the whole bolt"). That guard is the **last of scenario 5's two named
blockers** — `ui-030` closes the first (no Bolt Library row) but explicitly does not
touch this one, naming it as this task in its own Proposed fix.

"Done" looks like: a documented, tested decision on **how** (not whether) a boolean
operand names a composite's hidden sub-part — e.g. subtracting `hardware.bolt`'s `tap`
clearance geometry from a case shell, rather than the bolt's whole visible head/thread
mesh — with the guard either removed or narrowed to match, and scenario 5 finally
driveable end to end once `ui-030`'s Library row also exists.

## Interaction model

n/a directly — this is a kernel-semantics decision inside `boolean.*`'s operand
resolution, not a new control. It unblocks `ui-014`'s existing Union/Subtract/Intersect
buttons to accept an operand the user already selected via `ui-016`'s pick-depth
mechanism (drilling into a sub-part is already a real, shipped selection state); no new
trigger, menu item, or gesture is added by this task itself. State this explicitly per
`TODO/README.md` rather than omit the section.

## Documentation

n/a — no new user-visible control. If the eventual fix changes what "select a sub-part,
then Subtract" *does* (e.g. it previously silently used the whole body and now correctly
uses the tap clearance), that's a correctness fix worth one sentence in
`docs/booleans.md`'s existing text once this lands, not a new page.

## Affected files

- `src/core/kernel/index.js` — `evaluate()`'s operand-resolution path, where `core-013`
  added the `{ id, pieces }` acceptance for `group.snap`/`group.align` and where
  `boolean.*`'s current refusal lives (confirmed live via
  `TODO/ACCEPTANCE.md`'s scenario-3 browser check, exact line not yet located — first
  step of this task is finding the guard's own comment, which should already explain
  *why* it refuses this, per `core-013`'s own retirement note).
- `src/core/kernel/registry.js` — `boolean.union`/`subtract`/`intersect`'s registry
  entries, if the fix is a new `rawOperands`-style flag rather than a change to shared
  operand resolution.
- `src/core/kernel/group.spec.js`, `registry.spec.js` — new coverage.

## Proposed fix

**This is a real design decision, not a known port — investigate before proposing a
specific mechanism.** Candidates to weigh at Step 2:

1. **Resolve `{ id, pieces }` to the named sub-part's own geometry before the boolean
   runs**, the same resolution `group.snap`/`group.align` already do via
   `combine(group, pieces)`. The open question this raises: a composite's sub-part (e.g.
   `tap`) is itself `hidden: true` and was never meant to be independently meaningful
   outside its parent group's assembly — booleaning against it in isolation needs to be
   confirmed geometrically sound (does the tap clearance solid alone, without the rest
   of the bolt, produce the intended hole shape?), not assumed.
2. **A narrower, purpose-built op** (e.g. `boolean.subtractHidden` or a `hiddenPart`
   argument on the existing ops) that explicitly only allows addressing a **hidden**
   sub-part for a **subtract**, rather than opening full sub-part addressing to all
   three boolean ops and both selection directions. Smaller surface, easier to reason
   about, but a second boolean-shaped op registered next to the existing three needs its
   own justification for not just extending the existing ones.

Investigate real usage before picking: this project's own hidden-part convention
(`hardware.bolt`'s `tap-*`, `hardware.washer`'s `clearance`) exists specifically so a
subtract can use it — check whether every real V1 call site that does this
(`.subtract(shell, bolt.parts.tap)`-shaped code, if the user's `~/src/jscad/` corpus has
it) always targets a single named hidden part directly, or ever combines multiple, since
that shapes whether `pieces` needs to stay array-valued here.

## Effort

L — real architectural ambiguity with no existing pattern to extend cleanly (`core-013`
solved the *positioning* case; the *boolean* case has different correctness
requirements, since a boolean discards geometry rather than repositioning it), and a
wrong choice here risks a silent-wrong-geometry defect exactly like `core-020`'s. `model:
opus` per `TODO/README.md`'s guidance on cross-layer contracts with no existing pattern
to mirror closely.

## Testing

- `group.spec.js`/`registry.spec.js`: a hidden sub-part boolean produces the
  geometrically correct result (measured by volume, per this project's own established
  convention since `ui-014`), not just that it doesn't throw. Degenerate cases: a
  `pieces` name that doesn't exist on the operand (should throw by name, same as
  `core-013`'s existing guard style), a non-hidden sub-part addressed the same way (state
  explicitly whether this is allowed or refused, don't leave it undefined).
- **`TODO/ACCEPTANCE.md` scenario 5** (hidden-part boolean) by name — this is the second
  and final named blocker; re-drive in full once both this task and `ui-030` have
  landed, expecting a full PASS for the first time rather than NOT DRIVEABLE.
  **Scenario 1** — re-drive, since this changes `evaluate()`'s shared operand-resolution
  path every op goes through, the same standing-regression-surface reasoning `core-013`
  itself used.
- **Closed-finding regression surface**: `core-020`'s repro (a composite must not absorb
  an unrelated earlier body) — re-run specifically through a boolean that now resolves a
  sub-part operand, since this is new code in the exact fold `core-020` fixed.

## Measured update from `ui-030`'s Step 6 drive (2026-09-17)

`ui-030` has landed, so the "no Bolt Library row" blocker is gone and this file's
"second and final named blocker" framing needs one correction before this task is
scoped: **there are now two things in the way, not one, and the second was not visible
until a composite could actually be placed by hand.**

1. The guard this task is about is unchanged, re-confirmed verbatim against the current
   code during that drive:
   *"boolean.subtract: operand "bolt-1-drop-2" names pieces ("tap"), but boolean.subtract
   consumes whole solids — only group.snap/group.align can address a sub-part"*.
2. **A *placed* composite has no named sub-parts left to address.** A drag-drop of a
   composite commits the recipe's record plus a trailing `transform.translate` that
   supersedes it (`src/core/library.js`'s `recordsForDrop`), and the fold hands every
   native op a flat `Geom3` — `src/core/kernel/index.js`'s own operand-resolution note
   says so deliberately: *"a boolean or a transform has no use for a composite's part
   breakdown and would have to collapse it anyway."* Measured, same session: the bolt as
   built reports `names: ["head","thread","tap"]` (identical to the batch `evaluate()`
   path), and the same bolt after its drop translate reports `names: undefined`. This is
   **not** specific to the drop: the gizmo's own `transform.translate` already flattens
   any group a user drags, so it applies to every composite the moment it is moved.

So lifting this file's guard alone would leave scenario 5 still unpassable: there would
be a route to name `tap`, and nothing named `tap` on the body the user actually placed.
Whatever this task decides has to say explicitly whether a composite's part breakdown
survives a transform — either by making the transform ops group-aware, or by resolving a
sub-part operand through the body's *lineage* (the creation record still expands to the
named parts) rather than through its evaluated terminal geometry. `ui-035` (sub-part
snap/align operands) sits on the same question and should be scoped with it.

Related UI observation from the same drive, worth knowing before scoping: with a bolt
standing inside a 40 mm shell the bolt is **completely enclosed and cannot be picked by
clicking at all** — probing a grid of points over it never selected it. Until there is a
timeline or scene list to select from (`ui-032`), scenario 5's "select both the shell and
the bolt" step has no hand-driveable route once the two actually overlap, independent of
either kernel question above.
