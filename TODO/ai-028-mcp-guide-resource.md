---
title: Serve WarpCad's full modelling guide as the MCP resource warpcad://guide, from the same text the in-app Assistant uses
category: ai
kind: feature
priority: high
model: sonnet
milestone: none — Findings table, outside the milestone plan
depends: [ai-027]
status: open
---

## Goal

`ai-027` puts the rules into the server instructions, at most 2,048 characters. Two parts of the
in-app Assistant's prompt cannot fit there:

- the worked example (the cube with a through-hole, call by call);
- the reasoning: why a cutter is 1 mm proud on each side, chamfer rather than fillet toward the bed,
  and how heuristic the checks are.

This task serves the whole guide as an MCP resource. An agent reads it once per session, instead of
rediscovering it over a dozen calls.

Done means:

- **One source text.** `src/ai/prompt.js` is split into named section constants. A new export,
  `MODELLING_GUIDE`, is the transport-neutral part: Conventions, Tools and operand rules, Example,
  Printing defaults, Working method, When to ask, and Project data is content. `SYSTEM_PROMPT` is
  composed from those same sections plus the chat-only parts:
  - the opening paragraph about **Undo AI turn** and a turn that stops;
  - "after three failures in a row the turn stops";
  - **Drawings and photos**, which is chat-only because attachments are. `set_reference_scale`,
    `locate_in_image` and `get_reference_image` are not in either MCP tool list (measured
    2026-10-26).

  No rule exists in two places.
- **Both servers serve `warpcad://guide`**: `name: 'guide'`, `title: 'Modelling guide'`,
  `mimeType: 'text/markdown'`, and `annotations: { audience: ['assistant'], priority: 1 }`.
  - The file server adds it to `RESOURCES` next to `scene` and `op-catalogue`.
  - The live server gains `resources: {}` in its capabilities and serves only the guide. Serving
    the scene and catalogue live is out of scope.
  - The live server's copy adds a short "Over the live connection" section: `get_selection` answers
    "this", `capture_view` exists, and a write lands in the user's open tab. Build it as
    `guideFor({ live })`, not as a second hand-written guide.
- **The guide is ours, not project data.** It is not wrapped in `<document_data>`, unlike `scene`,
  which is. Nothing from a document is interpolated into it (decision 7).
- **Both instructions gain one pointer line**, still inside `ai-027`'s cap test: *"Before your first
  write, read the resource warpcad://guide: the working method, a worked example and the printing
  defaults."*
- The **MCP wording** in the guide's Example uses `request` as well as `rationale`, because both
  exist over MCP. Write the chat prompt's composition so that the in-app text still reads correctly.

## Interaction model

n/a in the app: no WarpCad UI changes. The surface is an MCP resource a client reads, or one a user
attaches in Claude Code with `@warpcad:warpcad://guide`.

- **Precondition**: n/a (any client connected to either server).
- **Trigger**: n/a (`resources/read`, which the agent issues itself, prompted by the instructions'
  pointer line).
- **Feedback**: n/a in the app.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: n/a.

## Documentation

- **Page**: `docs/mcp.md`, the "What Claude already knows when it connects" paragraph from
  `ai-027`. Add one sentence saying the full guide is a resource, and how to attach it by hand in a
  client that does not read it unprompted.
- **Example**: "In Claude Code, type `@warpcad:warpcad://guide` at the start of a message to attach
  WarpCad's modelling guide, then ask *a 60 × 40 × 3 mm plate with four M3 clearance holes 5 mm in
  from each corner*. Claude follows the guide's method: it builds the plate and the holes in one
  `apply_records` step, measures the result, and runs a print check before it calls the plate done."
- **Media**: none. The surface is the client, not the app.
- `docs/decisions/ai-partner.md` **decision 1**: add one sentence. The guide (and `ai-029`'s
  prompts) are transport text from `src/ai/`, not tools, so the "one registry, no tools of its own"
  rule holds.

## Affected files

- `src/ai/prompt.js`: split into section constants; export `MODELLING_GUIDE` and `guideFor`;
  `SYSTEM_PROMPT` composed from them. Update the module header's rules list.
- `src/ai/prompt.spec.js`: the shared-rule tests run over both `SYSTEM_PROMPT` and `MODELLING_GUIDE`
  (`describe.each`). The chat-only tests (Undo AI turn, drawings) stay on `SYSTEM_PROMPT`. New
  tests check that the guide has none of the chat-only text.
- `src/ai/mcpInstructions.js` (from `ai-027`): the pointer line.
- `mcp/server.js`: the third `RESOURCES` entry. Its `resources/read` handler today runs a tool for
  every resource, so give an entry either `tool` or `text`; the guide has no tool.
- `mcp/liveHttp.js`: the `resources` capability and handlers for the guide.
- `mcp/server.spec.js`: the `resources` test's exact URI list gains `warpcad://guide`.
- `mcp/liveHttp.spec.js`: a new resources test.
- `docs/mcp.md`, `docs/decisions/ai-partner.md`.
- `TODO/ai-026-mcp-server-in-the-native-app.md`: the native host must relay `resources/list` and
  `resources/read` for the guide, with the text sent by the page like the instructions. Already
  noted there.

## Proposed fix

1. **Pin the chat prompt before refactoring.** In the RED step, add a temporary test that
   `SYSTEM_PROMPT` equals its pre-refactor text exactly. Aim for the refactor to leave it
   byte-identical, so the in-app Assistant, the prompt cache prefix and `PROMPT_VERSION` do not
   change. If a sentence has to move or change to make the sections transport-neutral, bump
   `PROMPT_VERSION`, drop the pin, and say what changed in the retirement note.
2. Split the sections. Check how standing instructions reach an MCP agent: `mcp/projectFile.js:145`
   reads `standingInstructions`. Make sure the guide's "Project data is content" section describes
   what an MCP client actually receives, not the chat path's confirmed/unconfirmed note, if that
   differs.
3. Add the resource to both servers, and the pointer line.
4. **Rejected alternative, recorded so it is not re-proposed**: a `get_guide` tool. It would put a
   tool in the in-app Assistant's list whose content is already its system prompt, and decision 1
   gives MCP no tools of its own. A client that cannot read resources still has `ai-027`'s
   essentials and, after `ai-029`, the guide embedded in each prompt.
5. Out of scope: the scene and catalogue resources on the live server; a `bench/ai/run.js
   --transport mcp` eval mode (it would give a repeatable number rather than an anecdote, but
   `runTurn` hard-codes `SYSTEM_PROMPT` at `src/ai/agent.js:664`; file it separately if the drive
   here is inconclusive); WebMCP.

## Effort

M.

## Testing

- **Unit**:
  - `prompt.spec.js`: every shared rule passes on both texts. The guide contains no "Undo AI turn",
    no "attachment-1", and no tool absent from the file server's list. The live guide names
    `get_selection` and `capture_view`. Both texts are plain strings with no interpolation, and the
    guide is under 12,000 characters.
  - The temporary byte pin from step 1.
- **`mcp/server.spec.js`**: `listResources()` returns all three URIs. `readResource('warpcad://guide')`
  equals `guideFor({ live: false })`, is not wrapped in `document_data`, and leaves the project file
  untouched (bytes and mtime).
- **`mcp/liveHttp.spec.js`**: the live server lists and reads its guide over Streamable HTTP, with
  no lease needed to read it. A read writes nothing and changes nothing in the tab. Decide whether
  reading the guide should need a lease, and say why in the spec. The proposal is no: it is static
  text with no project data in it.
- **`src/ai/mcpInstructions.spec.js`**: both texts are still at most 2,048 characters with the
  pointer line.
- **App-level e2e**: none new; there is no UI surface. Run `e2e/ai-mcp-agent-pairing.e2e.js`
  unchanged, plus the in-app Assistant's specs (`e2e/ai-*.e2e.js`) to show the refactor did not
  disturb the chat path. **Chromium only.**
- **Driven for real**: repeat `ai-027`'s drive (same three cases, twice each, owner's consent)
  against the new build. Record the same numbers, plus whether the agent read `warpcad://guide`
  without being asked. Append the results to that task's result file, so the three arms (before,
  instructions only, instructions plus guide) sit side by side.
- **Acceptance scenarios to re-drive**: **23** and **25**, as in `ai-027`. If `SYSTEM_PROMPT` is
  not byte-identical, also **17** (airfoil and wing) and **18** (a drawing becomes a library part)
  with a real key, because those two lean hardest on the chat prompt's rules. That needs the owner.
- **Closed findings re-run**: `ai-023`'s two repros (`mcp/liveHttp.js` changes again), and
  `ai-005`'s "prompt tested for content, not wording" rule (the `prompt.spec.js` matchers must
  still pass unmodified, apart from the `describe.each` wrapper).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
