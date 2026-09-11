---
title: "Decide: how does a composite recipe measure geometry it didn't create? (blocks M4)"
category: core
kind: feature
priority: high
model: opus
milestone: M4
depends: []
status: open
---

## Goal

`core-001`'s retirement note flagged an open question and named two candidate fixes
without picking one: *"a recipe emits records before any geometry exists, so it can't
call `group.snap` against arbitrary geometry it didn't itself create ... needs to
decide between a two-phase expand→evaluate→measure→re-expand, or making `group.snap`
a real op record the fold resolves."* `TODO/ROADMAP.md`'s M4+ section says this
"blocks every other row in this milestone" (every RPi accessory recipe). This task is
the decision spike — but the investigation below, done against the real
`jscad-raspberrypi` source rather than guessed at, finds **the question is already
answered, by a decision this roadmap already made for an unrelated reason.**

## The investigation

`core-013` already shipped resolution 2 named above — `group.snap`/`group.align` are
now real, fold-resolved registry ops (`src/core/kernel/registry.js:661-701`) — but
that alone doesn't prove it's *sufficient* for the RPi+camera case, since a composite
recipe's own expansion still runs in isolation from the rest of the document
(`core-020`'s fix made this explicit and correct: *"a composite record's recipe
always expands against an empty fold, never against this scene"*). A recipe cannot
reach `byId` for a sibling top-level body no matter how `group.snap` is registered.
So the real question is narrower than it first reads: **does any real RPi recipe
actually need to reach outside its own expansion to measure something else's
geometry**, or does the "board snapping a camera against its own mounting holes"
framing describe something recipes already handle?

Surveyed every `.snap(`/`.align(` call in the real `jscad-raspberrypi` source
(`~/src/jscad/jscad-raspberrypi/src/*.js`, not test fixtures) rather than assuming
from the roadmap's own one-line framing:

- **`camera-module-v3.js`** (lines 14, 42-43, 51-52, 64-65, 74-75, 82-85, 92-94,
  102-103, 113) — every single `.snap`/`.align` call targets `g.parts.board` or
  `g.parts.sensor`, both parts **the same recipe just built itself**, a few lines
  earlier in the same function. Same pattern in `camera-module-v2.js`,
  `arducam_hq_camera-module.js` (`camera.parts.board`), and `boardutils.js`
  (`boardGroup.parts[hole]`, built by the same function two lines above).
- **`bplus-mounting.js`** (lines 21-22, 52-53) — `.snap(mb, ...)` where `mb` is a
  parameter built earlier in the *same* call, not a reference to a separately placed
  body.
- **`bplus.js`** (the actual board recipe) — `'camera'`/`'camera0'`/`'camera1'` appear
  only as **named connector-port labels** (a small footprint at an analytic position
  from the spec table, like `hardware.bolt`'s own baked offsets), never as a call that
  measures a real camera module's geometry. **The real V1 source never builds a board
  and a camera together in one recipe at all** — nothing in `~/src/jscad/
  jscad-raspberrypi/src/` attaches a real camera-module group to a real board group.

**Conclusion, evidenced rather than assumed**: every real cross-part measurement in
this library is a recipe measuring **its own, already-built** parts — exactly the
pattern `core-012`'s `kit.anchor` already proved out in this codebase (throwaway probe
geometry built directly via `@jscad/modeling` calls inside the recipe, measured with
`calcSnap`/`calcCenterWith`, then baked into a `transform.translate` — no fold
round-trip needed because the geometry being measured was built moments earlier in the
same function). **Attaching a separately-built camera module to a separately-built
board is not done inside any real recipe** — it is left to whatever top-level code
uses both, which in this project's document model is exactly a top-level
`group.snap`/`group.align` record between two independently placed bodies
(`core-013`'s kernel op, `ui-026`'s UI surface, both landing this same session).

## Decision

**No fold redesign is needed. Neither of `core-001`'s two candidate fixes has to be
built as a general mechanism**, because the specific problem they were both proposed
to solve — a recipe reaching into geometry it didn't create — does not actually occur
in the real source this project is porting from. Two-phase
expand→evaluate→measure→re-expand is **not adopted**: it would add real complexity
(every composite recipe's expansion would need to become resumable/re-entrant) to
solve a case the survey above found no evidence of.

The two patterns already in this codebase jointly cover every real case:

1. **A recipe measuring its own just-built parts** — `core-012`'s `kit.anchor`
   pattern (throwaway probe geometry, measured with the pure `calcSnap`/
   `calcCenterWith` functions, baked into the recipe's own emitted
   `transform.translate`). This is what a future `raspberrypi.bplus` needs for its
   own internal standoffs/connectors, and what a future camera-module recipe needs for
   its own sensor/mount/ribbon placement against its own board — both already proven
   patterns, not new work.
2. **Assembling two separately-placed bodies** — `group.snap`/`group.align` as a
   top-level document operation (`core-013` + `ui-026`), addressing a named sub-part
   of either side via `{ id, pieces }`. This is what a user (or a future assembly
   helper) uses to position a placed Camera Module against a placed
   B+/Zero/4/5's mounting holes — the scenario 3 "full RPi+camera+screen assembly"
   case `TODO/ROADMAP.md` names.

**Escalation path, stated rather than assumed away**: if `core-014` or a later RPi
recipe task hits a real case that doesn't fit either pattern above — something this
survey's real-source sample didn't cover — that is new evidence this decision doesn't
have, and should reopen this file's decision rather than force-fit the case into
pattern 1 or 2. This is a decision made on the evidence gathered, not a guarantee no
edge case exists.

## Interaction model

n/a — architecture decision, no UI surface.

## Documentation

- **Page**: `docs/decisions/composite-recipe-geometry.md` (new) — write up the
  investigation and decision above in the same format `docs/decisions/document-sync.md`
  uses for a deferred-not-built decision (options considered, evidence, the explicit
  trigger condition for revisiting). Not a `docs/` end-user page — this has no UI
  surface, so `TODO/README.md`'s Documentation-section requirement doesn't apply.

## Affected files

- `docs/decisions/composite-recipe-geometry.md` (new) — the decision record.
- `TODO/ROADMAP.md` — update `core-014`/`015`/`016`/`017`/`018`'s M4+ note to drop
  "blocks every other row in this milestone," since this task's finding removes the
  blocker without new engineering; each can be scoped on its own merits once someone
  is ready to write its spec table.
- No source code changes — this task produces a decision, not an implementation,
  same shape as `docs-001`/`docs-002`.

## Proposed fix

Write the decision doc citing the exact file:line evidence above (already gathered by
this scoping pass — a future implementer confirming this file's claims should re-check
`~/src/jscad/jscad-raspberrypi/src/*.js` fresh rather than trust a possibly-stale
survey, the same "start cold" discipline every `/fix-todo` run already follows). State
the two patterns, the escalation condition, and cross-reference `core-012` (pattern 1's
proof) and `core-013`/`ui-026` (pattern 2's proof) by task id so a future reader lands
on real shipped code, not just this file's prose.

## Effort

S — the investigation is the task, and it is already done above; what remains is
writing it up as a real decision doc and trimming the now-stale "blocks everything"
language out of `TODO/ROADMAP.md`. `model: opus`: not because the remaining work is
hard, but because judging whether a survey is *actually* conclusive (not just
convenient) before removing a milestone-wide blocker is exactly the kind of "real
architectural ambiguity" call `TODO/README.md`'s Model field guidance reserves for
opus — getting this wrong would silently reopen the blocker three tasks later.

## Testing

None — no code changes. The "test" for a decision doc is the citation trail: every
claim above names a real file and line range, checkable directly.

**Acceptance scenarios**: none directly. Unblocks scenario 3's full RPi+camera+screen
version for later tasks, per the roadmap's own note — this task itself changes no
runtime behavior.

**Regression surface**: none — no code touched.
