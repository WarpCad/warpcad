---
title: Decide whether hardware.bolt's visible `tap` clearance solid should stay opaque red
category: render
kind: finding
priority: medium
model: sonnet
milestone: M7
depends: [core-026, render-003]
status: open
---

## Problem

`render-003` made composite recipes' own baked-in colours actually render. Doing so
exposed a pre-existing, V1-faithful fact about `hardware.bolt` that nothing had ever
looked at on screen before: its `tap` part — the clearance envelope, a union of
`tap-head`/`tap-thread` — is **not hidden** (`hidden` defaults to `false` on that
record; confirmed by reading `src/core/kernel/recipes/hardware.bolt.js`'s own
`tap` record, which carries no `hidden: true`) and is coloured **opaque red**
(`v1ColorToRecord('red')`, alpha 1). `tap` is also, by construction, **larger than and
fully enclosing** both `head` and `thread` (grown by `fitDiameterMm - bodyDiameterMm`
in both diameter and height) — already called out as an accepted interpenetration in
`src/render/mesh.js`'s own module doc (`core-024`) and in `ui-037`'s
`TODO/VERIFY.md` row 3.

So a freshly-dropped Bolt, once recipe colours render, looks like a plain **opaque red
cylinder** (or hex-topped cylinder) — `head`'s gray and `thread`'s silver are
completely hidden inside it. This is not a rendering bug: it reproduces V1's own
behaviour exactly (`core-026`'s retirement note measured `tap`'s colour/hidden state
directly from `jscad-hardware.jscad`, and `hardware.bolt.spec.js`'s V1-diff fixture
pins it). But it does mean this task's own stated bar — "make sure a freshly dropped
bolt looks like a bolt" — is not met, and changing it would mean **diverging from V1**,
which `render-003` itself judged out of scope for a "keep it minimal" fix (see that
task's retirement note and `CLAUDE.md`'s prior precedent for this exact kind of call —
`core-021`/`core-022`, where a V1-faithful behaviour that read as wrong to a human was
deliberately filed as its own diverge-from-V1 finding rather than patched inline).

## Options, not yet chosen

1. **Leave it exactly as V1 has it.** `tap` is arguably supposed to read as "the
   clearance zone", and a hardware/engineering audience may want that signal more than
   a photorealistic bolt. Costs nothing; keeps this task's own "looks like a bolt" bar
   unmet.
2. **Give `tap` (and its hidden `tap-*` children, for consistency) a render-only
   translucency default** — lower `colorAlpha`, e.g. to `0.35`-`0.5` — so `head`/
   `thread` read through it, similar to the Pi boards' own translucent `mb`/`board`.
   Diverges from V1's own opaque red; would need to be recorded as a divergence
   (`docs/decisions/` or a code comment) rather than silently changed, the same
   discipline `core-022` applied.
3. **Hide `tap` by default and show it only when relevant** (e.g., while addressing it
   as a boolean operand, or via a "show clearance" toggle) — a bigger, real UI feature
   (Interaction model, a trigger, feedback), not a one-line recipe tweak.
4. **Something else** — e.g. render `tap` with a wireframe/outline style instead of a
   filled solid.

## Affected files (once an option is chosen)

- `src/core/kernel/recipes/hardware.bolt.js` — if colour/alpha/hidden changes (options
  2-3), each needs its own V1-comparison note per `core-026`'s established convention,
  since this recipe's fixture (`hardware.bolt.spec.js`) diffs it against measured V1
  output.
- `src/render/mesh.js` / `Inspector.vue` — if a render-only (non-recipe) toggle is
  chosen instead (option 3).
- `TODO/VERIFY.md`'s `ui-037` entry, row 3 — closes once this lands, referencing
  whichever option was picked.

## Testing

Whatever is chosen needs its own RED/GREEN pass appropriate to the option: a
`hardware.bolt.spec.js` fixture update and a re-run of `core-026`'s V1-diff regression
(options 1-2), or a full Interaction-model spec/e2e/docs treatment (option 3, since
that adds a real trigger).

- **`TODO/ACCEPTANCE.md`**: scenario 13 (recolouring), scenario 5 (hidden-part
  boolean — `tap` is exactly the part scenario 5 subtracts with), since either touches
  the same part.
- **Closed-finding regression surface**: `core-020`'s repro, since this is the same
  `hardware.bolt` composite that finding was filed against.
