---
title: Let list_ops return a short summary or only the ops asked for, so learning the catalogue stops costing ~7.6k tokens a call
category: ai
kind: feature
priority: high
model: sonnet
milestone: none — Findings table, outside the milestone plan
depends: []
status: done
---

> **What shipped (2026-10-29).** As specified. Two things differ from the spec's expectations: the instructions line was reworded tersely (`list_ops {detail:"summary"} lists ops, {ops:[…]} gives params. Then describe_scene.`) to stay inside the 2,048-character cap, and WebMCP's existing paging (1,500-character advice) applies to the summary too, so a browser agent sees a first page with `page.total`; `ops` fetches details. The default is still full; flipping it is left to the owner. The real-model token arm and the acceptance hand-drive were not done.

## Goal

`list_ops` is the call every agent is told to make first. Today's `SERVER_INSTRUCTIONS` say *"Call
list_ops first"*, and the in-app prompt says to call it when unsure of an op or a param. It takes no
input and always returns the whole catalogue. Measured 2026-10-26 on a fresh file through
`mcp/projectFile.js`:

| What | Characters | ≈ Tokens (chars ÷ 4) |
|---|---|---|
| `list_ops` today: 24 create ops and 15 operate ops, full schemas and defaults | 30,531 | ~7.6k |
| …of which `primitive.sketch` alone | 10,975 | ~2.7k |
| A summary: each op's id, label, operand count, part-addressable flag and **param names only** | ~4,087 | ~1.0k |
| One op's full entry (`primitive.cylinder`) | 341 | ~85 |
| One op's full entry (`boolean.subtract`) | 500 | ~125 |

For comparison, the whole modelling guide (`ai-028`) is ~2.5k tokens. **This call is the largest
single cost an agent pays to learn WarpCad**, bigger than any prompt. It is also paid again every
time a model calls it to check one param name.

Done means `list_ops` takes an optional input, on every transport that lists it (the in-app
Assistant `ai`, MCP `mcp`, and WebMCP `webmcp`, all from the one registry):

- `{ "detail": "summary" }`: every op, without schemas or defaults. Each entry is `op`, `label`,
  `kind`, `operandCount`, `partAddressable` (operate only) and `params` as a **list of param
  names**. Target: at most 5,000 characters for today's catalogue, enforced by a test as a ratio to
  the full size, so a growing catalogue does not fail it for the wrong reason.
- `{ "ops": ["primitive.cylinder", "boolean.subtract"] }`: only those entries, in full (schema and
  defaults), in the order asked.
  - An unknown id is an error naming it, plus the closest known ids, so the model can fix the call.
    It is never silently dropped.
  - At most 20 ids per call, as a cap in `src/ai/tools/limits.js` with the other per-call caps.
- `{ "kind": "create" }` or `{ "kind": "operate" }`: only one half. This can combine with `detail`.
- **No input: unchanged.** It still returns the full catalogue, byte-identical to today. The in-app
  Assistant, `ai-011`'s eval cases, the `warpcad://op-catalogue` resource and `bench/` keep working
  unchanged. Changing the default is a separate decision for the owner, made with this task's
  numbers; see Proposed fix step 5.
- **The guidance names the cheap path.** Update every text that exists when this lands:
  - `ai-027`'s instructions: *"Call list_ops with detail: summary to see what exists, then with
    ops: [...] for the params of the ones you use."* This replaces *"Call list_ops first"*, inside
    the 2,048-character cap test.
  - `ai-028`'s guide and `SYSTEM_PROMPT`'s "Tools and operand rules" line. That bumps
    `PROMPT_VERSION`.
  - `ai-029`'s `build` recipe.
  - If none of `ai-027`–`ai-029` has landed, change today's `SERVER_INSTRUCTIONS` and
    `LIVE_SERVER_INSTRUCTIONS` line.
- **The file server's resources gain `warpcad://op-catalogue/summary`** (what `{ detail: 'summary' }`
  returns), beside the full `warpcad://op-catalogue`. `RESOURCES` entries today call their tool with
  `{}`, so give an entry an `input`.

## Interaction model

n/a in the app: no WarpCad UI changes. The surface is a tool input that models use.

- **Precondition**: n/a (any transport that lists `list_ops`).
- **Trigger**: n/a (a model's tool call).
- **Feedback**: n/a in the app.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: n/a.

## Documentation

- **Page**: `docs/mcp.md`, "What Claude can do with it". One sentence: Claude reads a short list of
  what WarpCad can make and looks up the details only for the ops it uses, so a session starts
  faster and costs less. This is user-facing in effect only; the input is documented in the tool
  description, which models read.
- **Example**: "Ask Claude Code *what can WarpCad make?* It answers from the short catalogue: the
  primitives, the hardware parts and the operations by name. Then ask *a 30 mm cylinder with a 6 mm
  bore*, and it looks up only the cylinder's and the subtract's parameters before building."
- **Media**: none. The surface is the client, not the app.
- Developer docs: the `list_ops` row in `src/ai/tools/index.js`'s module-header tool table.

## Affected files

- `src/ai/tools/index.js`, `createListOpsTool`:
  - an input schema: `detail` (enum `summary` / `full`), `ops` (array of strings), `kind` (enum);
  - the summary builder;
  - the filter, with the unknown-id error;
  - the description, telling the model the summary exists, under the 2,048-character description
    cap from `ai-027`.

  Building the summary and the full catalogue once, at registry creation, keeps a call allocation-free
  as it is today.
- `src/ai/tools/limits.js`: the ids-per-call cap.
- `src/ai/tools/index.spec.js` (or a new `listOps.spec.js` if the cases outgrow it).
- `mcp/server.js`: the summary resource, and `RESOURCES` entries gain `input`.
- `mcp/server.spec.js`: the resource list and the new resource.
- The guidance texts named in Goal: `src/ai/mcpInstructions.js` or the two server constants,
  `src/ai/prompt.js` (with `PROMPT_VERSION`), and `src/ai/mcpPrompts.js`, whichever exist.
- `src/ai/prompt.spec.js`: the tools-rule matcher accepts the new wording.
- `docs/mcp.md`.

## Proposed fix

1. **Measure first**, in the RED step: record the full, summary and per-entry sizes above as the
   test's baseline. The no-input call must stay byte-identical. Pin it with a test that compares
   against the pre-change output, generated in the same test from a copy of today's builder, or
   stored as a fixture.
2. Build the summary from the same `paramsSchemaFor` / `OPERATIONS[op].params` data as the full
   entry, so the two cannot disagree on which params exist. A test asserts that every summary param
   name is a key of the full entry's schema, and the reverse.
3. Add the filter, the cap and the error. The error wording follows the registry's existing errors:
   it names the input and the reason, and lists what is valid. Listing the closest five known ids is
   enough.
4. Update the guidance texts, and the tool description.
5. **The default stays full in this task.** Flipping no-input to summary would save the most for an
   agent that ignores the guidance. But it changes the in-app Assistant's behaviour and every eval
   case at once, and `ai-011`'s harness has never been run against a real model to compare.
   Record this task's drive numbers, and leave the flip as a one-line decision for the owner in the
   retirement note.
6. **Decision 9 (cache prefix).** The tool definitions are part of the cached prefix. Changing
   `list_ops`'s input schema and description shifts that prefix once, for every transport. That is
   expected and fine. `definitions()` must stay deterministic: same registry, same JSON.
7. Out of scope: shrinking `primitive.sketch`'s schema itself (10,975 characters, 36% of the
   catalogue); the tool schemas' own size (`tools/list` is 70,714 characters on the file server).
   Each is a separate measurement and a separate task if this one's drive shows they matter.

## Effort

M.

## Testing

- **Unit**:
  - No input: byte-identical to before.
  - `detail: 'summary'`: has every op; no `defaults` and no schema objects; is at most 1/6 of the
    full size (today ~13%); its param names match the full entry's both ways.
  - `ops`: returns those entries in full, in order. An unknown id is refused with the closest ids.
    An empty array is refused. 21 ids are refused by the cap. A non-string id is refused.
  - `kind`: only that half; combines with `detail`.
  - `definitions()` is deterministic across two registries.
  - The description is at most 2,048 characters.
  - The guidance texts: `ai-027`'s cap test still passes, and `prompt.spec.js`'s tools rule passes
    with the new wording.
- **`mcp/server.spec.js`**: `list_ops` with each input over a real SDK client; the
  `warpcad://op-catalogue/summary` resource; neither touches the file (bytes and mtime).
- **WebMCP**: `e2e/webmcp.e2e.js` calls `list_ops` with `{ detail: 'summary' }` through
  `document.modelContext` and gets the summary. This is the existing app-level spec, navigating to
  `/`. **Chromium only**: WebMCP is behind a Chromium flag, and no WebGL or persistence path
  changes.
- **App-level e2e for the in-app Assistant**: none new (no UI). The scripted provider
  (`src/ai/providers/scripted.js`) runs one turn that calls `list_ops { ops: [...] }` then `create`,
  in the existing Assistant e2e that uses it, so the `ai` transport is exercised end to end.
- **Driven for real**: add an arm to `ai-027`'s result file, "with list_ops summary", using the
  same three cases twice each, with the owner's consent. Record total input tokens per run as well as
  call counts: this is the arm where tokens are the point. Note whether the agent used the summary
  without being told, and whether it ever called `list_ops` with no input.
- **Acceptance scenarios to re-drive**:
  - **23** and **25** (MCP, both servers);
  - **27** (WebMCP: an in-browser agent adds ten cubes, and `list_ops` is in its list);
  - **24** (edit while the Assistant works) with the scripted provider. With a real key, if the
    owner allows, also **17**, because the prompt's tools line changes.
- **Closed findings re-run**:
  - `ai-024`: a WebMCP agent can find and use the tools; re-run its ten-cubes repro with the
    summary call;
  - `ai-005`: the prompt is tested for content, so the matchers change only for the reworded tools
    rule;
  - `ai-011`: `npm run eval:ai -- --list` still lists every case, with no key needed.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
