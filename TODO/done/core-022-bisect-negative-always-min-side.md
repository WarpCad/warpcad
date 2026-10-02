---
title: "Bisect's negative half should always be the min-side piece, regardless of axis"
category: core
kind: finding
priority: medium
model: sonnet
milestone: M4
depends: [core-021]
status: done
---

> **What actually shipped.** Exactly the Proposed fix below, no scope changes.
> `NEGATIVE_IS_MAX_SIDE` and its consulting branch in `asGroup` are gone;
> `asGroup` now unconditionally returns `{ negative: lower, positive: upper }`
> for both the straight and angled cut paths. `bisect`'s own doc comment lost
> the "which cut axes name their maximum-side half `negative`" section and now
> states the min-side/max-side convention as holding "on every axis, with no
> exception," citing this task and `core-021` for why `y` used to differ and
> why that's now a deliberate divergence rather than an oversight left in.
>
> `group.spec.js` got a new `expectedPartsFor(axis, fixtureParts)` helper: for
> `y`-axis fixture cases it swaps which of the fixture's own measured
> `negative`/`positive` halves this port's `negative`/`positive` are expected
> to match (the fixture itself — real, measured V1 output — is untouched, per
> the TODO's own instruction not to regenerate it). Both `it.each` blocks
> (`v1Reference.bisect`, `v1Reference.bisectAngled`) route through it now. The
> two direct `y`-specific assertions from `core-021` flipped back to
> min-side-is-`negative` (`bisect(cube(), 'y', 3).parts.negative` is the 3mm
> piece, `.positive` the 7mm piece — the same shape as `x`/`z`, not a special
> case). The old dedicated "puts negative on the max side for a y cut" test was
> replaced outright with a new contract test that asserts, for each of
> `x`/`y`/`z`, that `negative`'s bounds sit entirely on the minimum side of
> `positive`'s bounds along the cut axis — checked on real geometry, not
> inferred from size or the fixture.
>
> `docs/resize-bisect.md`'s "a cut on Y names them the other way round" caveat
> paragraph is deleted; the surrounding prose now just says `negative` is
> always the lower side, positive the higher, on every axis including Y.
>
> Full unit suite (848 tests, 42 files) and typecheck both green.
> `e2e/resize-bisect-operation.e2e.js` re-run on `chromium-laptop`, confirmed
> genuinely name-agnostic as claimed (`expect(['negative','positive']).toContain(partName)`,
> no dependency on which physical half gets which name) — 6/6 green, no spec
> changes needed. Full `npm run test:e2e:headless` also run: all Chromium and
> WebKit projects green (623 passed); the three `firefox-*` projects failed at
> browser launch, a pre-existing sandbox defect logged in `TROUBLESHOOTING.md`
> (2026-09-17) and confirmed unrelated to this change by that entry's own
> methodology (an unrelated already-shipped spec fails the same way).
>
> No `TODO/ACCEPTANCE.md` scenario re-drive: none of the 9 fixed scenarios
> touches bisect naming (checked all 9 headings, including the closest
> candidate, "Group vs. sub-part selection" — no mention of bisect/negative/
> positive there), matching this task's own Testing section reasoning.
> `TODO/VERIFY.md`'s `core-021` row was already updated at scoping time to
> point at this task as its resolution; no further edit needed.

## Goal

`core-021` found and faithfully reproduced a real V1 (`jscad-utils@3.2.0`) quirk: a
`y`-axis `bisect` names its two halves the **opposite** way round from `x`/`z` — V1
builds its cut plane from `util.normalVector(axis).orthoNormalCartesian`, which is a
*left*-handed basis pair for `y` (`['X','Z']`, confirmed at
`node_modules/jscad-utils/src/util.js:906-923`) against right-handed pairs for `x`/`z`,
so V1's own `negative` is the **maximum**-side half on `y` alone. `core-021` shipped
this faithfully (`NEGATIVE_IS_MAX_SIDE = { x: false, y: true, z: false }` in
`src/core/kernel/group.js`) per this project's standing measured-V1-fidelity rule, and
logged the open question in `TODO/VERIFY.md`'s `core-021` entry rather than deciding it
alone: *"whether faithfully reproducing what is almost certainly a V1 oversight is the
right call for a human driving the app, who has no reason to expect one axis to behave
differently from the other two."*

**Decided explicitly by the user (2026-09-17): diverge from V1.** `negative` should
always mean the minimum-side half and `positive` the maximum-side half, on every axis,
with no per-axis exception — least-surprise over V1 fidelity for this one naming
convention. This is a deliberate, stated divergence, the same kind of call
`hardware.washer`'s `clearance: hidden: true` (diverging from V1's visible-red-part
default) or `ui-027`'s unnamed-`supersedes`-record choice already made and documented
on the record rather than silently — not a bug fix reverting `core-021`'s own
correctness work, which was right about what V1 actually does.

## Proposed fix

Delete `NEGATIVE_IS_MAX_SIDE` and the branch in `asGroup` that consults it
(`src/core/kernel/group.js:845`, `:968-969`) — `asGroup` goes back to the simpler
`{ negative: lower, positive: upper }` unconditionally, for both the straight and
angled paths (`asGroup` is shared by both per `core-021`'s own module doc). This is a
deletion, not new logic: the axis-dependent table `core-021` introduced is exactly the
thing being removed.

The fixture-comparison side needs more care than the implementation does, because the
*fixture data itself* is real, measured V1 output and does not change — V1 really did
produce that geometry under its own `negative`/`positive` labels, and regenerating the
fixture would misrepresent what V1 actually does. What changes is which fixture-labeled
half this port's own `negative`/`positive` keys are expected to match:

- `scripts/generate-v1-modify-fixture.cjs`'s existing `bisectCases`/`bisectAngledCases`
  arrays and the generated `modify.v1-reference.json` **stay as they are** — they are a
  historical record of real V1 output, not a statement of this port's naming contract.
- `src/core/kernel/group.spec.js`'s fixture-diff tests (`it.each(v1Reference.bisect)`,
  `it.each(v1Reference.bisectAngled)`) need a small per-axis swap when comparing against
  the fixture for `y`-axis cases specifically: this port's `parts.negative` should be
  asserted against the fixture's measured **max**-side geometry for `y` (and its
  `parts.positive` against the fixture's measured min-side geometry), while `x`/`z`
  keep comparing `negative`↔`negative` and `positive`↔`positive` directly. Write this
  as an explicit small helper (e.g. `expectedPartsFor(axis, fixtureEntry)`) with a
  comment stating why `y` is swapped and citing this file, not as an inline ternary
  easy to misread as a leftover bug.
- The two direct `y`-specific assertions `core-021` added (`group.spec.js` — the
  `bisect(cube(), 'y', 3).parts.negative`/`.positive` checks) invert back to their
  pre-`core-021` values (`negative` = 7, `positive` = 3, i.e. the min-side/low value
  again), since the port itself now always returns min-side as `negative`.

## Affected files

- `src/core/kernel/group.js` — delete `NEGATIVE_IS_MAX_SIDE`, simplify `asGroup`,
  update `bisect`'s own doc comment (the "Which cut axes name their maximum-side half
  `negative`" section this task removes, and the "V1's `negative` is the maximum-side
  piece" line in the main doc comment).
- `src/core/kernel/group.spec.js` — flip the two direct `y` assertions back; add the
  per-axis fixture-comparison helper described above for both the `bisect` and
  `bisectAngled` `it.each` blocks; add a new explicit test asserting `negative` is
  always the min-side half across all three axes (the actual contract this task adds,
  not just a fixture diff — assert on the returned group's own geometry/bounds
  directly, not only against the fixture).
- `docs/resize-bisect.md` — remove the "A cut on Y names them the other way round..."
  paragraph (lines 91-98 currently); `negative`/`positive` need no per-axis caveat once
  this ships.
- `TODO/VERIFY.md` — mark `core-021`'s entry resolved (Status: `Issue` → filed here, or
  however the row's own convention records "decided, see `core-022`"), rather than
  leaving it open indefinitely once this lands.

No `registry.js` change expected — the registry forwards params to `bisect()` unchanged
either way; only which half gets which name inside `bisect()` moves.

## Effort

S. The hard analytical part — figuring out *why* V1's `y` axis differs and confirming
it against real source — is `core-021`'s already-done work; this task is a documented
reversal of one small table plus updating the tests/docs that were written to match it.
The one place needing real care is the fixture-comparison helper (matching the *right*
fixture-measured half under the new mapping, not just deleting the old table and
letting a stale expectation slip through) — sized S rather than XS for that reason.

## Testing

`src/core/kernel/group.spec.js`, extending the existing `bisect`/`bisectAngled`
`describe` blocks:

- All ten `v1Reference.bisectAngled` cases and all `v1Reference.bisect` cases still
  pass, now comparing through the per-axis swap helper for `y` — this is the regression
  check that the fixture (real V1 output) is still matched correctly, just under the
  new naming.
- New explicit contract test: for a cut on each of `x`/`y`/`z`, `parts.negative`'s
  bounds are on the minimum side of the cut and `parts.positive`'s on the maximum side
  — asserted directly on geometry (min/max bounds along the cut axis), not merely
  inferred from the fixture matching.
- The two direct `y` assertions from `core-021` (`group.spec.js` lines ~533, ~555-556)
  updated to their pre-`core-021` values.

`e2e/resize-bisect-operation.e2e.js` (from `ui-028`) re-run as a regression check —
per `core-021`'s own retirement note this spec is already **name-agnostic**
(`expect(['negative','positive']).toContain(partName)`), so it should need no changes
and stay green; run it anyway to confirm rather than assume.

No acceptance-scenario re-drive needed — same reasoning `core-021` gave: this changes
which name a half gets, not the two-part `Group` shape `ui-016`'s subsystem cares
about, and there is still no UI surface for the angled form. `TODO/VERIFY.md`'s
`core-021` entry (row 1, "judge whether negative landing on the far side reads as a
bug") is resolved by this task shipping, not by further hand-driving — the decision
was already made explicitly by the user, this task just implements it.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
