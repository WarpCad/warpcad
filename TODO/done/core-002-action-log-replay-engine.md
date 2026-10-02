---
title: Action-log schema + replay engine
category: core
kind: feature
priority: high
model: sonnet
milestone: M0
depends: [core-001]
status: done
---

> Note: implemented as scoped (`src/core/ndjson.js`, `src/core/replay.js`), plus a
> small, additive, backward-compatible extension to `core-001`'s `evaluate()`
> (`src/core/kernel/index.js`) and its operand-count helpers
> (`src/core/kernel/registry.js`) to accept a caller-supplied registry/seed state —
> `applyAction` reuses `evaluate`'s dispatch logic rather than duplicating it, wrapping
> a single-record call in try/catch for the lenient, never-halts-the-fold semantics
> this task needs. Surfaced and fixed a real pre-existing bug while doing this:
> `assertOperandCount`/`acceptsOperandCount`/`getEntry` always checked the real
> hardcoded registry regardless of `evaluate`'s own `options.registry`, so a custom
> registry's own ops were rejected as "unknown" the moment they had operands to count
> — never caught by `core-001`'s own tests because none of them ever exercised a
> genuinely custom registry. Regression tests added directly to `core-001`'s own spec
> files (`registry.spec.js`, `index.spec.js`), and its full existing suite re-verified
> with zero regressions before this closed. Explicitly exercises
> `Initial design.md` §9 scenario 8 ("Remote-load safety") end to end against the real
> kernel registry, including the exact malicious-`op` example from this file's own
> Testing section.


## Goal

Build the NDJSON action-log schema and replay engine in `src/core/` (framework-free),
per `Initial design.md` §3: read/write NDJSON (one JSON action record per line), and
the `applyAction` pure fold — `actions.reduce((scene, action) => applyAction(scene,
action, registry), emptyScene())` — wired against `core-001`'s registry. This is the
document model's evaluation engine: replaying the whole action array is how every edit
is applied, exactly matching JSCAD V1's own "call `main(params)` again" model.

Done when: a document (an array/NDJSON stream of action records matching §3's record
shape) can be loaded, replayed into a scene via `applyAction`, and re-serialized back to
NDJSON round-trip-safe, using `core-001`'s registry for the actual geometry calls.

## Interaction model

n/a — framework-free core engine, no UI surface. The UI that edits a document through
this engine (adding/moving/deleting action records) is a separate future task.

## Documentation

n/a for end-user docs — this is an internal engine with no user-facing control yet.

## Affected files

- `src/core/replay.js` (new — the `applyAction` fold and `emptyScene()`)
- `src/core/ndjson.js` (new — NDJSON parse/serialize)
- `src/core/replay.spec.js`, `src/core/ndjson.spec.js` (new)

## Proposed fix

`applyAction(scene, action, registry)` looks up `action.op` in the registry
(`core-001`); an unknown `op` is skipped with a reported warning, never thrown as an
exception that halts the fold and never `eval`/`new Function`-executed — this is the
load-bearing security property §3 calls out: a malformed or malicious NDJSON file can
name a bogus `op` string, but there is no code path anywhere in this file that could
turn that string into executed code. `target`/`operands`/`reference` fields resolve
against other records' `id`s within the same array; a reference to a nonexistent `id`
is a reported error on that one record, not a fold-halting throw (so later records
still replay). Keep `ndjson.js` pure string-in/array-out — no file-system or network
code here (that's `src/storage/`'s job later).

## Effort

M (a few hours)

## Testing

Vitest, plain Node. Numeric-tolerance and degenerate-case tests per `CLAUDE.md`'s
numerical-code convention:
- a zero-length bolt / zero-size primitive record replays without crashing
- an `op` record referencing a nonexistent `target`/`operands` id is reported and
  skipped, not thrown
- an unknown `op` string is skipped/reported — and assert directly that no code
  execution occurs (e.g. a record whose `op` value contains something that would be
  dangerous if ever `eval`'d, like `"op": "constructor.constructor(\"return 1\")()"`,
  is treated as an inert unrecognized string, not executed)
- NDJSON round-trip: parse → serialize → parse again produces an identical array

No `*.e2e.js` spec — no UI surface exists yet; deferred to whichever future task first
wires document editing into a view.

Acceptance scenarios: none can run yet (`TODO/ACCEPTANCE.md` doesn't exist until
`docs-004`), but this task is the direct implementation underneath `Initial design.md`
§9 scenario 8 ("Remote-load safety") — note that connection for `docs-004` rather than
gating this task on it now. No closed findings exist yet to re-check.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
