---
title: AI tools for project variables — list, define, set, bind, unbind, rename, delete
category: ai
kind: feature
priority: medium
model: opus
milestone: M12
depends: [core-050, ai-002]
status: done
---

> **What shipped (2026-10-11).** The seven tools as specified (`src/ai/tools/variables.js`, both
> transports, one registry), plus three changes the spec did not list, each forced by the same
> fact: variable writes **revise** and **remove** existing rows, and the agent could only land
> new ones. (1) `src/ai/agent.js` lands a turn by diffing the fork against the live log **by id**
> (new ids via `insertAt`, revised rows via one `ai` `reviseRecords`, removed rows via one
> `removeRecords`, all in one `document.batch`); `AiTurn` gained `revised`/`removed`,
> `TurnOutcome` gained `revisedIds`/`removedIds`, and a new `undoAiTurn(live, turn)` applies the
> exact inverse. (2) `src/core/document.js` `insertAt` accepts `transaction.entryOrigins`, so
> Undo AI turn can restore a deleted user-made variable with its `local` origin without touching
> the user's undo stack. (3) `src/composables/useAgent.js` calls `undoAiTurn`, and Undo AI turn is
> enabled for a revisions-only turn. Behaviours worth knowing: `set_variable` with breakages
> writes nothing and returns `{ error, breakages }`; `rationale` is accepted on the six write
> tools but stored only on `define_variable` (a revision keeps the row's intent); known edges are
> recorded in comments (landing order insert, revise, remove; rename then re-define in one turn
> briefly has two same-named variables; a removed row is restored assuming it sat before the
> rollback marker). `mcp/projectFile.js` now writes the file for a revise-only or remove-only
> call and names `revised`/`removed` rows.


## Goal

`core-050` shipped project variables as pure functions in `src/core/variables.js` and
`src/core/dependents.js`, but did not wire them into the AI tool registry in `src/ai/tools/`
(each tool needs a schema, limits, intent and docs, which is more than a small change; see the
"Later additions" note in `TODO/done/ai-002-ai-tool-registry.md`). "Done": a model can set the
`piModel` variable instead of hunting for the Pi record, through the same path the UI uses,
and over MCP as well as the chat panel, because both transports share one registry
(`docs/decisions/ai-partner.md`).

## Interaction model

n/a — no human-facing control. The tools are the AI's trigger; the feedback is the tool result
(the new value, the breakages the impact check reported) and the `ai`-origin batch showing in
History and **Undo AI turn**. The Variables panel and bind control are `ui-059`.

## Documentation

`docs/mcp.md` and `docs/ai-partner.md` (the tool reference tables) gain the seven tools, each
with one concrete call, for example: `set_variable { name: "piModel", value: 5 }` returns the
changed-parameter count and any `breakages`, and the whole turn undoes in one step.

## Design

Seven tools, each a thin wrapper, no logic of its own:

| Tool | Kind | Wraps |
|---|---|---|
| `list_variables` | read | `variablesOf(document)` plus the consumers of each |
| `define_variable` | write | `defineVariable` |
| `set_variable` | write | `setVariable`, after `variableImpactOf`; returns its `breakages` |
| `bind_param` | write | `bindParam`; the slot comes from `bindableParams` |
| `unbind_param` | write | `unbindParam` |
| `rename_variable` | write | `renameVariable` |
| `delete_variable` | write | `deleteVariable`, with `keepValues` |

- `var.define` is **not** a kernel-registry op (`docs/decisions/project-variables.md`), so
  `create` and `apply_records` cannot write one and `list_ops` does not list it. Do not add it
  there; the dedicated tools are the only write path.
- Every write goes through `document.batch` with origin `ai`/`mcp`, never `local`, and is
  counted by the existing record/step caps in `limits.js`.
- Variable names, labels and option labels are **data, never instructions**: they reach the
  model inside the `document_data` delimiter the way intent text does.
- A write tool takes the optional `rationale` and stores it as intent like the others.

## Affected files

- `src/ai/tools/variables.js` (+ `variables.spec.js`), `src/ai/tools/index.js` (register, and
  the tool reference), `src/ai/tools/limits.js`, `src/ai/tools/index.spec.js`
- `mcp/` server tool list if it enumerates tools explicitly (check `mcp/server.js`)
- `docs/mcp.md`, `docs/ai-partner.md`
- `TODO/done/ai-002-ai-tool-registry.md` — strike the "not yet wired" note when done

## Effort

M.

## Testing

- **Unit** — each tool: happy path, a refusal by name (unknown variable, wrong kind, an
  unbindable `transform.rotate` slot with `bindableParams`'s reason passed through verbatim,
  delete of a variable in use without `keepValues`), strict-schema conformance via the existing
  `toStrictWire` check, origin is `ai`, an over-cap call refused. The motivating case: define
  `piModel`, `bind_param` on the Pi's `model`, `set_variable` 4 → 5 → 4, one `Undo AI turn`.
- **MCP** — the same tool list over stdio in `mcp/` specs (the existing in-memory client).
- **Boundary** — kernel worker mocked, no network.
- **No `*.e2e.js`**: no UI surface; the chat panel renders tool rows generically (`ai-006`).
- **Acceptance scenarios**: 17 and 18 are the AI scenarios; run them only if their transcripts
  are touched. Closed findings in the same subsystem: `ai-002`'s atomicity finding (a variable
  batch is one atomic `ai` change) and `data-007` via a `set_variable` that shrinks a snapped
  body's parent.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
