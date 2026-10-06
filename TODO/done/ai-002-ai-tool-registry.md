---
title: AI tool registry — a framework-free tool surface over the document's command layer
category: ai
kind: feature
priority: high
model: opus
milestone: M9
depends: [ai-001]
status: done
---

> **Retired 2026-10-06 (`/run-todos` batch, `/fix-todo ai-002`).** Shipped as specified in
> `src/ai/tools/` (`index.js`, `read.js`, `create.js`, `operate.js`, `batch.js`, `limits.js`,
> `schema.js`, each with a spec; 7 files, 141 tests), with no change to `src/core/document.js`.
> The headline spec, `index.spec.js`, drives a whole cube-sphere-subtract session through the
> registry in plain Node over both origins, and checks that the log equals the one a human's
> two drags plus a Subtract click would have written. Differences from this spec, each one
> deliberate:
>
> 1. **`apply_records` takes steps, not raw records.** Its input is `{ steps: [{ create } |
>    { operate }] }`, and a later step names an earlier step's body as `@n`. Raw records would
>    have been the `add_feature(op, params)` catch-all the Design section forbids: any op, no
>    placement, a missing `consumes`, invented ids.
> 2. **Param names are the registry's own** (`diameter`, `size`, `radius`), not renamed to
>    `diameterMm`. Each property's description states its unit instead. Renaming would have
>    made the AI's records differ from the UI's. The inputs this module authors do carry units
>    (`positionMm`, `deltaMm`, `deltaDeg`, `planeMm`).
> 3. **The JSON-Schema subset is wider than decision 4's list.** It adds `anyOf`, `const`,
>    `minItems`/`maxItems` and `description`. Strict mode needs every object closed, so per-op
>    `params` are `anyOf` branches. The Messages API requires an object at the top level, so
>    `create`/`operate` take `{ op, …, params: anyOf }`, and each tool's `validate` judges
>    `params` against the chosen op's own branch. Strict mode also **rejects
>    `minimum`/`maximum`/`minItems`/`maxItems`**, which decision 4 lists. `toStrictWire()`
>    drops them for the wire, and the local checker keeps enforcing them.
> 4. **Not every operation is offered.** `operate` covers 14 ops. `profile.extrudeLinear`,
>    `style.recolor` and `group.removePart` are in `NOT_OFFERED` with a reason each, and a spec
>    fails on any registry operation that is in neither list. `create` covers exactly the
>    Library rows, so `hardware.screw` (no Library row yet) is not offered.
> 5. **Sketch-point caps stay in the sketch model.** They are not copied into `limits.js`; a
>    spec proves a 4,097-point outline is refused in the sketch model's own words.
>
> **Finding for `ai-005`** (written into its TODO): decision 5's "one atomic `appendAll`" is
> not true of `appendAll`'s fast path. It commits record by record and throws a plain
> `Error`. The landing must be `document.batch` around `insertAt`, which is what `batch.js`
> does.
>
> Step 6: no acceptance scenario is reachable, because nothing the running app loads imports
> `src/ai/tools/` (checked by grep), so there was nothing to drive, as with `core-014a`.
> Scenario 17 (`ai-010`) is the first end-to-end use.

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
