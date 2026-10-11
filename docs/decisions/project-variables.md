# Project variables: named values in the log, bound by name

Status: **Accepted** (`TODO/core-050`, 2026-10-10). This is the core only. The Variables
panel and the per-field bind control are `TODO/ui-059`. No new dependency.

## The decision in one paragraph

A variable is a **log record**, `{ id, op: 'var.define', params: { name, kind, value,
label?, unit?, min?, max?, options? } }`. A param slot is bound to one by holding
`{ "$var": "<name>" }` where the literal would be: either the whole value or one element of
an array param. `src/core/variables.js` has a pure `resolveRecord` that replaces each binding
with the variable's value. `document.js`'s fold calls it in exactly one place, just before a
record's params reach the kernel. Every op, composite recipe and user part therefore takes
variables without knowing they exist. Changing a value is a `reviseRecords` on the one
definition record, so the whole log re-folds as **one Undo step**. A binding that cannot be
resolved becomes a **broken row that names the variable, the record and the param**. It is
never replaced by a guess.

## Why log records, not a side table

| Option | Rejected because |
|---|---|
| A `variables` section on `project.js`'s state line, as `core-037`'s part definitions are | The state line is outside both undo stacks and outside the transaction origin. Changing a variable changes geometry on every bound body, so it **must** be an Undo step with an origin. Putting it on the state line would mean adding undo, origin scoping, AI visibility and gist/hosted sync a second time. `core-037` put definitions on the state line because a definition builds nothing *and changing it does not re-fold a placed instance*. Neither is true here. |
| A Pinia store | Breaks CLAUDE.md's rule that document state never lives in the UI store, and a store neither saves nor syncs. |
| **A `var.define` record** (chosen) | Undo/redo, the origin chip, NDJSON round-trip, the History row, the AI's `get_timeline` and the MCP server all come with it, because every one of them already handles records. The fold routes the record past the kernel the same way it routes `asset.image`. It builds nothing, is never a lineage and is never a body. |

**Not a kernel-registry entry.** The task's Affected files said to register `var.define` in
`kernel/registry.js`. We did not. Neither existing data record (`asset.image`, `body.delete`)
has a registry entry: a registry entry means "the kernel can evaluate this". `list_ops`,
`create` and the Library all derive from the registry, so an entry would offer
"create a variable" as if it were geometry. `document.js` and `replay.js` route the op past
the kernel directly. `paramOptions`, the schema read `bindableParams` needs, was already
exported, so the registry did not need to change. The one registry edit is the `OpRecord.when`
typedef, which now also allows `{ var, in }`.

**Deleting a variable removes its record** inside the same revision that rewrites its
bindings. `reviseRecords` gained `options.remove`, which takes out at most one record, and
Undo puts it back at its old position. A tombstone was considered and rejected. A body is
tombstoned because later records still reference its lineage by id. A variable is referenced
only by name, and a delete is refused while anything still names it.

## Why `$var` in the param's own slot

- **One resolution point, no op knows.** Because the binding sits where the literal sat,
  resolution is just "replace these slots". It runs once, before composite expansion, so a
  Pi's `model`, a bolt's `spec` and a user part's exposed `width` all bind with no per-op
  code. That is what "available for any parameter of any object" means in practice.
- **Still plain JSON.** `Initial design.md` §3 and `registry.js` require params to be
  JSON-primitive-shaped and never a function or code. A one-key object is plain JSON.
- **No collision.** We checked every op's params. The only object-valued params are a
  sketch's `slices`/`extrusion` and user-part internals, and no op uses a `$`-prefixed key.
  An object with `$var` *and* any other key is refused by name. So is a `$var` nested deeper
  than one array element: a binding stands for a whole value or one element, nothing else.
- **The log keeps the binding.** `recordOf`, `Body.params` and the saved file all show
  `{ "$var": "piModel" }`, which is what the user wrote. Only the kernel sees the resolved
  copy. Resolved copies are memoised per record and per variable values, so an unchanged
  record hands the kernel the *same* object and `core-031`'s identity-keyed fold cache still
  hits.

## Why by name

The NDJSON a person or an AI partner reads should say `piModel`, not `v_a7f3`. The cost is
on rename: `renameVariable` rewrites the definition, every binding and every `{ var }`
condition in **one** `reviseRecords` batch, which is one Undo step. That covers the whole
log, including suppressed and rolled-back rows, so nothing dangles when one is brought back.
A stable-id indirection would have made rename free and every file unreadable.

Names are identifier-shaped (`[A-Za-z_][A-Za-z0-9_]*`), at most 40 characters, and
case-sensitive (`wall` and `Wall` are different). Names `Object.prototype` already answers
to (`__proto__`, `constructor`, …) are refused. The table is a `Map`, and resolution writes
with `defineProperty`, so even a hostile *param key* such as `__proto__` stays an own field.

## Read from the log, not from the fold position

`condition.js` made this choice for the same reason. Someone who places the enclosure first
and defines `piModel` second must still be able to bind to it. Only active, unsuppressed
definitions count. Reading a value can never create a cycle, because a variable never
depends on a record. Like conditions, any append to a document that uses variables re-folds
the whole log (through `insertAt`), so a new definition also repairs an earlier binding.

## What can be bound: inherited, not invented

`bindableParams(op, params, tables?, variables?)` is the data the bind control reads:

- **A described composite** (`paramOptions` has entries) offers its schema params, enums and
  numbers with their limits, plus any boolean it holds as a literal (the HQ camera's
  `flipTripodMount`). A bolt's `fit` is marked `dependsOn: ['spec']`.
- **Any other op** offers each finite-number literal, each element of a number array, and
  each boolean literal.
- **Never** bindable: whatever `paramEdit.js` already refuses. That is a record with no params
  of its own (a boolean or a group, a reference photo, a composite nobody described),
  `rotation` and `segments` on any row, and a variable definition. **A whole
  `transform.rotate` row is also refused.** The task named only `rotation`. A rotate row's
  `angles` are what produce the absolute rotation every later transform carries forward, so
  binding them would be overwritten by the next move exactly as a bound `rotation` would. It
  is the same "wrong geometry, no error" class, so the safe reading is the whole row.

At fold time, a binding is checked against the registry's schema for the params *after*
resolution. A number variable binds a number param and must satisfy its `exclusiveMin` and
`min`/`max`. An enum variable binds an enum param and must be one of its current options. An
array element takes a number. Then every enum in the schema is re-checked, so a `spec` change
that strands the bolt's literal or bound `fit` is reported by name and never coerced.

**Where the registry has no schema, the fold is permissive.** A native op's params are
validated in code, not in data (`requirePositive(...)` inside each `build`), so a whole-value
binding on, say, a cylinder's `height` resolves and the op's own validation judges it. A
value that fails there is an ordinary fold failure: an atomic refusal of the change, loud,
with nothing committed. The impact check below shows it before commit. A follow-up could add
a boolean kind to the registry's `ParamSchema` so the Inspector and the bind control agree
on booleans too. It was left out here because `ParamFields.vue` would need to render it.

## Changing a variable runs the impact check over every consumer

`dependents.js`'s `variableImpactOf(document, name, value)` folds the candidate log in the
same tolerant throwaway document `impactOf` uses and diffs the broken rows against the live
document's. Editing a variable is, in effect, editing every bound record at once. So unlike
`impactOf`, a bound record that itself stops building is *reported* in the list, not thrown.
The user needs the whole list, by name, before committing. `setVariable` itself refuses only
a value outside the variable's own kind, range or options.

## Deleting a variable that is in use

`deleteVariable` throws `VariableInUseError` with the list of consumers, by display name. With
`{ keepValues: true }` it rewrites each binding to the literal it currently resolves to, in
the same transaction, and removes the definition. A **condition** that reads the variable has
no literal to keep, so it still refuses, by name. Silently dropping the condition would show
or hide geometry, and the condition has to be edited first.

## Why no expressions yet

`outer = inner + 2 * wall` is the likely next request, and the jscad1 projects do compute
like that. It brings cycle detection, an evaluator that has to be safe on hostile files
(`ACCEPTANCE.md` scenario 8) and a story for units, and none of that is needed for "one
switch drives many parts". When it is wanted, it is its own task. That task would add a
bounded, non-Turing-complete evaluator behind the same `{ "$var" }` slot, for example a
`var.derive` record. The binding format does not change. This build already skips any
`var.*` op it does not know, with a named load warning, so a file from that future build
opens here with its derived variables missing and their bindings broken. The file is never
refused.

## What the jscad1 `const` pattern maps onto

| jscad1 | WarpCad |
|---|---|
| `const piVersion = 4` at the top of `main.jscad` | `defineVariable(doc, { name: 'piVersion', kind: 'enum', value: 4, options: [...] })`: one `var.define` row |
| `RaspberryPi.BPlus(piVersion)` | the Pi record's `params: { model: { "$var": "piVersion" } }` |
| `if (piVersion === 4) case = case.subtract(avJack)` | the subtract record's `when: { var: 'piVersion', in: [4] }` |
| `const wall = 2; cube({ size: [wall, 20, 10] })` | `size: [{ "$var": "wall" }, 20, 10]` |
| `const outer = inner + 2 * wall` | not yet. See "Why no expressions yet" |

## Hostile-input caps (`VARIABLE_LIMITS`, enforced in code)

| Cap | Value | On a loaded file |
|---|---|---|
| Name | identifier, ≤ 40 chars, not a prototype name | definition dropped, named `LoadWarning` |
| Enum options | 1–100, values text or finite numbers, no duplicates | definition dropped, named warning |
| Variables per project | 500 | the excess are dropped, named warning |
| Duplicate name | first definition wins | later ones dropped, named warning |
| Bindings per document | 10 000 | one warning. Steps past the cap, and whatever builds on them, load left broken. The fold enforces the same cap in log order. |
| Binding to an undefined name | none | one warning per name. The bound steps and their dependents load left broken. |
| `$var` with extra keys, nested, in a record with no params, bound to itself | none | a broken row naming the reason at fold time |
| An unknown `var.*` op | none | skipped with a "newer version" warning |

Nothing in this path is a refused file or a hang. Parsing is linear in the file and the
binding walk is depth-capped. **An older build** that predates this task meets `var.define`
as an unknown op and refuses the file by naming that step, which is how every unknown op
has always been handled. That is the one place the task's "an older build must skip with a
named warning" could not be met: shipped builds cannot be changed. The forward-compatible
skip described above is what this build does for whatever comes next.

## AI surface

The pure functions are `defineVariable`, `setVariable`, `bindParam`, `unbindParam`,
`renameVariable`, `deleteVariable`, `variablesOf`, `bindableParams` and
`dependents.variableImpactOf`. They are the path the UI will use, and the path tools should
use. The tool names are recorded in `TODO/done/ai-002-ai-tool-registry.md`. They are not
wired into `src/ai/tools/` yet: that needs schemas, turn limits, the reference table and
`docs/mcp.md`, which belongs to its own task. `var.define` does not appear in `list_ops`,
because it is not a registry op. `get_timeline` already shows each definition as a
`Define <name>` row.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
