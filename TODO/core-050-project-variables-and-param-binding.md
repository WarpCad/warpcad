---
title: Project variables — a named value any parameter of any record can be bound to
category: core
kind: feature
priority: high
model: opus
milestone: M12
depends: [data-004, ui-052]
status: open
---

## Goal

"Set a variable that is used by the parts." In the jscad1 projects a case for a Raspberry Pi
starts with `const piVersion = 4`, and every part that cares reads it. WarpCad has no such
thing: to switch the design from a Pi 4 to a Pi 5 a person has to find the Pi body and edit its
`model` param, and then fix whatever else assumed a Pi 4. Today the only cross-record link is
`when: { ref, param, in }` (`src/core/condition.js`), which *reads* one body's param; nothing
lets one value *drive* many.

"Done": a document can hold **named variables**, and **any param of any record** can be bound
to one instead of holding a literal. Changing the variable's value re-folds the whole log, so
every bound param, on every body, takes the new value in one step and one undo. Concretely, the
motivating case works end to end in core: a variable `piModel` (enum, `3`/`4`/`5`) is bound to
the Pi composite's `model`, the enclosure's AV-jack cut-out is conditional on `piModel`, and
setting `piModel` to `5` rebuilds the board and swaps the cut-outs without touching either
record.

Core only. The panel and the per-field bind control are `ui-059`.

## Design

- **Variables are log records, not a side table.** A new non-geometry op `var.define`
  carries `{ name, kind, value, label?, unit?, min?, max?, options? }`. Putting them in the log
  gets undo/redo, the transaction origin, NDJSON round-trip, gist/hosted sync and the AI's
  `describe_scene` for free, and keeps CLAUDE.md's rule that every mutation goes through the
  command layer. Changing a value is `document.reviseRecords` on that one record (the
  `data-004` replace path `paramEdit.js` already uses), so it is **one undo step by
  construction** — mirror `ui-044`'s grouping, don't invent a second mechanism. `var.define`
  produces no geometry: read how `document.js` and the fold treat the existing non-geometry
  records (and `core-037`'s planned `library.define`) and mirror that, rather than special-casing
  it in the fold.
- **A binding is plain JSON in the param's own slot**: `{ "$var": "piModel" }` where a
  literal would be. It may stand for the whole value or for **one element of an array param**
  (`"size": [{ "$var": "wall" }, 20, 10]`), because most dimensional params are vectors. It is
  never a function, code string or expression — `registry.js` and `Initial design.md` §3
  ("`params` is always JSON-primitive-shaped") hold. **Before building, grep every op's param
  shapes for an existing object-valued param** that could be mistaken for a binding; the
  `$var` key is chosen to be impossible to collide with a real one, and the validator rejects
  an object with other keys alongside `$var`.
- **One resolution point, no op knows about variables.** A pure
  `resolveParams(params, variables) → { params, errors }` runs in exactly one place: where the
  fold hands a record's params to the kernel op (and to `condition.js`). Every `primitive.*`,
  `hardware.*`, `raspberrypi.*`, `transform.*` and composite then gets variables **for free**
  — that is what "available for any parameter for any object" means in practice, and it is
  why this is not a per-op feature. Resolution happens **before** composite expansion, so a
  user part's exposed parameters (`core-037`) and a gear's params (M11) can be bound with no
  extra code; the spec asserts this on at least one composite.
- **Variables are read from the log, not from the fold position** — the same decision
  `condition.js` makes and for the same reason: a person who drops the enclosure first and
  defines `piModel` second must still be able to bind to it. Reading a *value* cannot create a
  cycle, because a variable never depends on a record.
- **Names**: identifier-shaped (`[A-Za-z_][A-Za-z0-9_]*`, ≤ 40 chars), unique
  case-sensitively, bound **by name** so the NDJSON an AI partner or a human reads says
  `piModel`, not `v_a7f3`. Rename is therefore one `reviseRecords` batch that rewrites the
  variable and every binding atomically — one undo step — rather than a stable-id indirection.
- **Kinds (v1)**: `number` (optional `unit` `mm | deg | ''`, optional `min`/`max`), `boolean`,
  `enum` (explicit `options: [{ value, label }]`). No `string` kind yet — no op has a free-text
  geometry param.
- **Type compatibility is checked against the registry's own schema**
  (`paramOptions` / the param schemas near `registry.js:1552`), not re-described: a `number`
  variable binds a `NumberParamSchema` param (and an array element of one), an `enum` variable
  binds an `EnumParamSchema` param, and a bound value must satisfy the param's own limits
  (`exclusiveMin`, the enum's current options). A `bindableParams(op, params, tables)` function
  returns exactly what the UI may offer, so the bind control is data-driven, not a hand list.
- **Two things that must stay unbindable**, inherited rather than invented:
  1. whatever `paramEditability` / `stepParamEditability` (`paramEdit.js`) already refuses —
     a boolean or group (no params of its own), an undescribed composite, and **`rotation`
     on any transform row** (carried forward as an absolute value by `transform.js`, so a bound
     value would be silently overwritten by the next transform — the "wrong geometry, no error"
     class);
  2. a param whose enum options **depend on another param** (`hardware.bolt`'s `fit` is read
     from the chosen `spec`'s table row). It may be bound, but it is validated **after** the
     params it depends on are resolved, and a variable change that leaves `fit` invalid is
     reported, never coerced.
- **A binding that cannot be resolved is reported by name, never guessed.** Missing variable,
  wrong kind, a value outside `min`/`max` or outside the enum, a deleted option: each is an
  `invalid` result with a reason naming the variable, the record and the param, and the fold
  shows a broken row — exactly `condition.js`'s `invalid` verdict. Silently substituting the
  literal or `0` would change geometry with no explanation.
- **Changing a variable runs the same impact check a param edit does.** Editing a
  variable's value is, in effect, editing every bound record at once, so
  `core/dependents.js`'s check (the one `useParamCommands.js` runs before committing a resize)
  must run over **all** consumers and report, by name, any rim op or snap that no longer fits
  — before commit, not after.
- **Deleting a variable that is in use is refused with the list of consumers**, and offers
  the alternative the UI can surface: *delete and keep current values* — rewrite each binding
  to its current literal in the same transaction. Nothing is ever left dangling by a delete.
- **`when` can read a variable.** Extend `Condition` to `{ var, in }` alongside the existing
  `{ ref, param, in }`. This is what makes the Pi case a single switch (the AV-jack cut-out
  is `when: { var: 'piModel', in: ['4'] }`), and it removes the `condition.js` restriction
  that the controlling thing be a *body's* enum param. Same membership-only, enum/boolean-only,
  plain-JSON rule; an expression language stays out of scope.
- **Out of scope, stated so nobody adds it silently**: derived variables and arithmetic
  (`outer = inner + 2 * wall`). The jscad1 projects do compute like this, and it is the likely
  next request, but it brings cycle detection, an evaluator that must be safe on hostile
  files (scenario 8), and a unit story, and none of that is needed for "one switch drives
  many parts". If it is wanted, it is its own task that adds a bounded, non-Turing-complete
  evaluator behind the same `{ "$var" }` slot — the binding format does not change.
- **Hostile input**: a file may carry a variable named `__proto__`, a 10 000-element enum, a
  binding to itself, a 100 000-record log of bindings, or a `$var` inside an op that takes no
  params. Name charset/length, option count and bindings-per-document caps are enforced at
  load; each failure is a named `LoadWarning`, never a refused file or a hang (same posture as
  `core-037`). An older build that meets `var.define` or `$var` must skip with a named warning,
  not crash.
- **AI surface**: `ai-002` owns the tool registry. This task exposes the pure functions
  (`defineVariable`, `setVariable`, `bindParam`, `unbindParam`, `renameVariable`,
  `deleteVariable`) and appends the matching tool names to `ai-002`'s list so the AI can drive
  them by the same path as the UI. Variables are design intent: the model can set `piModel`
  rather than hunting for the Pi record.

## Interaction model

n/a here — core only. The Variables panel and the per-field bind control are `ui-059`.

## Documentation

n/a — no user-visible control in this task; `ui-059` documents the flow. This task does
add `docs/decisions/project-variables.md` (below), which is decision prose, not end-user docs.

## Affected files

- `src/core/variables.js` (record shape, `readVariables(log)`, `resolveParams`, `bindableParams`,
  validation, rename/delete rewrites; + `variables.spec.js`)
- `src/core/kernel/registry.js` (register `var.define` as a non-geometry op; expose whatever
  param-schema read `bindableParams` needs — don't copy the schemas)
- `src/core/document.js` (the one resolution point in the fold; non-geometry-record handling;
  `defineVariable` etc. as command-layer functions with a transaction origin)
- `src/core/condition.js` (+ spec) — the `{ var, in }` form
- `src/core/paramEdit.js` — consult its editability checks from `bindableParams` (do not fork them)
- `src/core/dependents.js` — impact check over all consumers of a changed variable
- `src/core/project.js` (+ spec) — serialize/parse round-trip, caps, named `LoadWarning`s
- `docs/decisions/project-variables.md` — why log records, why `$var` in the slot, why by
  name, why no expressions yet, and what the jscad1 `const` pattern maps onto
- `TODO/ai-002-ai-tool-registry.md` — append the variable tools to its tool list

## Effort

L.

## Testing

- **Unit** (`variables.spec.js`, plus the touched specs). Numerical assertions use `toBeCloseTo`
  with a stated tolerance of 1e-6 mm:
  - **the motivating case**: `piModel` bound to the Pi's `model`, an enclosure cut-out `when`
    on `piModel`; set `piModel` `4 → 5 → 4`: bounds, volume and part names equal a hand-written
    document that used the literal at each step, and the final state equals the first
    (round-trip, no residue);
  - **any param, any op**: a number bound into an array element of `primitive.cuboid` `size`;
    an enum into `hardware.bolt` `spec`; a boolean into a composite; **a bound param inside a
    `core-037` user part's exposed parameters** (expansion happens after resolution);
  - **one variable, many consumers**: one number bound in three records on two bodies changes
    all three on one `setVariable`, and one `undo` restores all three — a single transaction;
  - **dependent enum**: change `spec` through a variable so the bound `fit` is no longer valid
    → a named broken row, not a coerced value;
  - **rename** rewrites every binding atomically (and undoes as one step); **delete** is
    refused with the consumer list, and *delete and keep values* leaves the literals the
    bindings resolved to;
  - **degenerate/hostile**: unbound name; wrong kind (a `boolean` into a `number` param);
    value below `exclusiveMin`; value outside `min`/`max`; empty `options`; a name of
    `__proto__`/`constructor`/an empty string/41 characters; duplicate names (case-sensitive);
    `$var` with extra sibling keys; `$var` in a record whose op has no params; a binding to a
    variable defined *after* its consumer in the log (must resolve); the unbindable cases above
    (a `transform.rotate` row, a group) each refused with a reason; an older-build record
    skipped with a warning;
  - **impact check**: shrinking a bound size that a snapped body depends on reports the
    dependent by name before commit (this is the `data-007` repro, driven through a variable).
- **Boundary**: kernel worker mocked, as everywhere (`CLAUDE.md`). No DOM, no WebGL.
- **No `*.e2e.js` spec in this task**: no UI surface. `ui-059` owns the first end-to-end use
  and must not be marked done without it. Chromium only is therefore sufficient here; the
  persistence round-trip is covered at unit level against the in-memory project text, and
  `ui-059` runs the IndexedDB/save-load path in all three engines.
- **Acceptance scenarios this could plausibly break**: 1 (two primitives), 2 (hardware
  property edit), 3 (snap placement), 4 (boolean gating), 10 (save, reload), 12 (edit a
  mid-history step and replay), 14 (delete, restore, reload) and **15 (change a part's model
  under a dependent)**, because the fold's param hand-off changes for every record and 15 is
  the existing scenario closest to this feature. Re-drive them live (the `run` skill), not only by
  spec, and report PASS/FAIL per `/fix-todo` Step 8.
- **Closed findings that are standing regression surfaces here**: `data-007` (resize with a
  snapped dependent — re-run its repro through a variable), `ui-052` (composite param edit with
  dependent repair — the composite path now also resolves bindings), and `ui-044` (a param edit
  is one undo step — a variable edit must be too).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
