---
title: AI tool registry — a framework-free tool surface over the document's command layer
category: ai
kind: feature
priority: high
model: opus
milestone: M9
depends: [ai-001]
status: open
---

## Goal

A model can read the scene and change it through typed tools, and every change is the same
op record the UI would have appended. "Done": `src/ai/tools/` exports a registry of tool
definitions (`name`, `description`, JSON-Schema `input`, `run(ctx, input)`), runs in plain
Node, and a unit test drives a whole "cube, sphere, subtract" session through it with no
browser. The browser agent (`ai-005`) and the MCP server (`ai-009`) both consume this
registry; neither adds tools of its own.

## Design (read before building)

- **Derive from the kernel registry, don't hand-copy it.** `src/core/kernel/registry.js`
  already says which ops exist, their `operandCount`, defaults and param validation. The
  tools read it. But `CLAUDE.md`'s rule applies to the model as much as to a human:
  **creation and operation are separate tools**, never one `add_feature(op, params)` that
  accepts anything.
  - `list_ops` → `{ op, label, kind, operandCount, params schema, defaults }`
  - `create` — only `operandCount: 0` ops. Takes a position, so a created body is *placed*
    (the AI equivalent of drag-to-place), never dropped at the origin.
  - `operate` — only `operandCount ≥ 1` ops, and it **refuses** with a named reason unless
    the operand ids are valid, exist, and match the count (the same `acceptsOperandCount`
    the toolbar uses).
- **Read tools**: `describe_scene` (bodies with id, name, op, bounds in mm, colour, group
  parts), `describe_body(id)`, `get_timeline`, `get_selection`. Results are compact: a
  mesh is never returned, and sub-part names are, so the model can address a part.
- **Write tools return the new state's summary**, not just "ok", so the model sees what
  its call did. A rejected record returns `{ error, step, reason }` in the document's own
  `ReplayRejection` wording; the model gets a chance to correct (`ai-005`).
- **Batch**: `apply_records(records[])` appends several records atomically (one
  transaction; all or none). One AI *turn* is one undo unit (`ai-001` decision 5).
- **Origin**: every write passes the transport's origin (`ai` in the browser, `mcp` in the
  server). Never `local`.
- **Hard limits** enforced in the registry, not the prompt: max records per call, max
  records per turn, max sketch points (the sketch model already caps these for hostile
  input), no ids the document did not issue.
- **Selection is not a tool the model needs for geometry** (operations take ids), but
  `select` exists so the *human* sees what the AI is talking about (feedback rule).
- **Units**: millimetres, Z-up, degrees, every parameter name carries its unit
  (`radiusMm`, `angleDeg`) — the descriptions say so once, in the system prompt (`ai-005`).

## Interaction model

n/a — no UI surface; `core`-level. The visible half (agent activity rows) is `ai-006`.

## Documentation

n/a — no user-visible control. Tool reference for developers goes in the module's JSDoc and
is reused verbatim by `docs/mcp.md` (`ai-009`).

## Affected files

- `src/ai/tools/index.js`, `read.js`, `create.js`, `operate.js`, `batch.js`, `limits.js`
  (new), each with a `.spec.js`; `src/ai/tools/schema.js` (op params → JSON Schema).
- `src/core/document.js` only if `append` batching or origin tagging needs a public hook;
  prefer none.

## Effort

L. The schema derivation is the real work: registry param validation is code, not data, so
read how `validateSketchParams` and each entry's `ui.defaults` can be surfaced as a schema.
If it cannot be derived honestly for an op, that op gets an explicit hand-written schema
with a spec that fails when the registry's defaults drift from it.

## Testing

- **Unit**: every tool against a fake registry and the real one; operand-count refusals
  (0, 1, 2, 3 operands for each count class); an unknown id; a batch where the third record
  is invalid leaves the document unchanged; the per-turn cap; origin is `ai`/`mcp`, never
  `local`, and a `local` undo does not remove an AI record. Degenerate cases: empty scene,
  a record naming a suppressed or rolled-back row, a sketch with a self-intersecting outline.
- **Boundary**: the kernel worker is mocked, as everywhere (`CLAUDE.md`).
- **Acceptance**: none yet (no UI). Scenario 17 (`ai-010`) is the first end-to-end use.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
