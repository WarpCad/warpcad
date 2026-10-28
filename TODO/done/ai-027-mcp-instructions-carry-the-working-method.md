---
title: Put WarpCad's working method in the MCP server instructions, inside Claude Code's 2,048-character cap
category: ai
kind: feature
priority: high
model: sonnet
milestone: none — Findings table, outside the milestone plan
depends: []   # soft: item 10 is only true once `ai-031` lands
status: done
---

> **Shipped (2026-10-28):** as filed, with rule 10 already replaced by the `record_prompt` line because `ai-031` had landed. The live server's lease and refusal lines were merged into one and its data line shortened (rule unchanged) to fit 1,900 characters. The real Claude Code before/after drive was declined by the owner, so it was **not driven** (see `TODO/VERIFY.md`). The cap's source was not re-checked online. Typecheck was red at baseline (missing `@types/node`), unchanged by this task.

## Goal

An agent that connects to either WarpCad MCP server (the file server `mcp/server.js`, or the live
endpoint `mcp/liveHttp.js`) has to work out the rules by trial and error in every session today. The
in-app Assistant gets them for free. Measured 2026-10-26:

| What the model is told | Characters |
|---|---|
| In-app Assistant: `SYSTEM_PROMPT` (`src/ai/prompt.js`) | 9,778 |
| File server: `SERVER_INSTRUCTIONS` (`mcp/server.js`) | 1,131 |
| Live server: `LIVE_SERVER_INSTRUCTIONS` (`mcp/liveHttp.js`) | 1,524 |

Server `instructions` are the one channel every MCP client reads without being asked: Claude Code
puts them in the model's system prompt. So the rules that waste the most calls when missing belong
there. The instructions are short today, so the agent does not know: where `positionMm` puts a body,
which operand of a subtract is kept, that a boolean consumes its operands, how `@1` works in
`apply_records`, that a write returns the scene, or that a part must be checked before it is called
done.

**The cap.** Issue reports against Claude Code (see the note under Proposed fix) say it cuts
`InitializeResult.instructions` and each tool description at **2,048 characters**, with no warning
in the model's context. A longer text arrives as a prefix that looks complete. Users will not change
that limit, so this task designs to it.

Done means:

- A new framework-free module, `src/ai/mcpInstructions.js`, holds the lines both servers share.
  It lives in `src/ai/`, not `mcp/`, so `ai-026`'s page can hand the live text to the native host.
  `SERVER_INSTRUCTIONS` and `LIVE_SERVER_INSTRUCTIONS` are composed from those lines plus each
  server's own lines: the file server's on-disk merge note; the live server's lease, refusal and
  selection lines.
- The shared lines carry these rules, taken from `SYSTEM_PROMPT` rather than reinvented, in this
  priority order (space is the constraint):
  1. Units: millimetres, degrees, Z up, the grid at Z = 0.
  2. Placement: `positionMm` x/y centre the footprint and z is the underside. Place each body
     relative to the others; never stack new bodies at the origin.
  3. Ids come from `describe_scene` or a write's result. Never guess one.
  4. `boolean.subtract` keeps its first operand. A boolean or group consumes its operands; use the
     new id it returns.
  5. `apply_records` does several steps atomically; a later step names an earlier body as `"@1"`.
  6. Every write returns the scene: read it instead of assuming. An error names the step and the
     reason: fix the call rather than repeating it.
  7. Check before saying done: `measure`, `check_printability` and `check_clearance`. On the live
     server only, also `capture_view`. The file server has no `capture_view` (measured
     2026-10-26: the live tool list adds `capture_view`, `get_selection` and `select`).
  8. Printing defaults in one line: 0.4 mm nozzle, 1.2 mm minimum wall, 0.2 / 0.4 mm clearance,
     220 × 220 × 250 mm bed.
  9. Ask once, with zero writes, when a size that decides the result is missing and has no
     default.
  10. Pass `request` (the user's words) and `rationale` (one line saying why) on every write. Both
      exist on MCP write tools: `rationale` comes from the registry, `request` from the transport.
      **Correction (2026-10-28):** the WebMCP and MCP transports do not set `request` today, so an
      agent's writes carry no prompt. `ai-031` adds `record_prompt` and fills `request` from it. Until
      it lands, this line is aspirational; once it lands, replace it with one line: *call
      `record_prompt` first with the user's request, as received*, and keep the composed text inside
      the cap.
- Each composed text is **at most 2,048 characters**, enforced by a unit test. Leave room for the
  one pointer line `ai-028` adds: aim for 1,900 or less.
- The document data line, and the rule that nothing from a document is interpolated (decision 7),
  are unchanged.

## Interaction model

n/a in the app: nothing in WarpCad's UI changes. The surface is the MCP client's system prompt.

- **Precondition**: n/a (any MCP client connected to either server).
- **Trigger**: n/a (the client reads `instructions` from `initialize`).
- **Feedback**: n/a in the app. The agent's behaviour is the feedback; see Testing's real drive.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: n/a.

## Documentation

- **Page**: `docs/mcp.md`, section "What Claude can do with it". Add a short paragraph, "What
  Claude already knows when it connects", listing the rules in plain words. A user then knows they
  do not have to explain millimetres, placement, or which body a subtract keeps.
- **Example**: "Run `npm run mcp:add -- bracket.ndjson`, start Claude Code in the WarpCad folder,
  and ask *a 40 mm cube with a 10 mm hole straight through it*. Claude places the cube on the grid,
  cuts the hole with a subtract, measures the result and tells you its size. You do not have to tell
  it the units or which body is kept."
- **Media**: none. The surface is the client's terminal, not the app, so `e2e/docs/` has nothing to
  shoot; `e2e/docs-media.spec.js` is unaffected.

## Affected files

- `src/ai/mcpInstructions.js` (new): the shared lines (an array joined with `\n`, the servers'
  existing style), plus `CLIENT_INSTRUCTIONS_CAP = 2048` with a comment naming where the number
  comes from and the date it was checked.
- `src/ai/mcpInstructions.spec.js` (new).
- `mcp/server.js`: `SERVER_INSTRUCTIONS` composed from the shared lines and its own.
- `mcp/liveHttp.js`: `LIVE_SERVER_INSTRUCTIONS` likewise.
- `mcp/server.spec.js`, `mcp/liveHttp.spec.js`: `initialize` carries the composed text.
- `docs/mcp.md`: the paragraph above.
- `TROUBLESHOOTING.md` (via `/troubleshoot`): "an MCP agent ignores a rule that is in the
  instructions" can mean the client cut the text at 2,048 characters.

## Proposed fix

0. **Baseline first, before any edit**: run the real drive in Testing against today's instructions
   and keep the numbers. Without a before, the after proves nothing.
1. Write `src/ai/mcpInstructions.js`. Copy the rules from `SYSTEM_PROMPT`'s Conventions, Tools,
   Printing defaults, Working method and When to ask sections, shortened. Do not edit
   `SYSTEM_PROMPT` in this task (`ai-028` refactors it).
2. Compose both servers' texts. If the live text goes over budget, shorten the live-only lease and
   refusal lines rather than drop a shared rule: a refused call already explains itself in its error
   text.
3. Leave tool descriptions alone. The longest MCP description is 750 characters (measured
   2026-10-26), but add a guard test that every MCP tool description stays at or under the same cap,
   since the same truncation applies to them.
4. **The cap's source.** It is not in Anthropic's docs as of 2026-10-26. It comes from Claude Code
   issue reports mirrored at claudeissues.com: issue 39106 ("MCP docs do not mention the 2KB cap on
   tool descriptions and server instructions"), 87650 and 81268. A later release reportedly added
   `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` to change it. Re-check the current Claude Code behaviour
   when this task is picked up, and record what you find in the constant's comment. Design to 2,048
   either way, because the default is what users have.
5. Out of scope, named so they are not assumed: the full guide as a resource (`ai-028`); slash
   command recipes (`ai-029`); WebMCP, which has no instructions channel; a Claude Code skill or
   plugin.

## Effort

M (a few hours), most of it the two real drives.

## Testing

- **Unit** (`src/ai/mcpInstructions.spec.js`):
  - Both composed texts are at most `CLIENT_INSTRUCTIONS_CAP`, and at most 1,900 until `ai-028`
    takes its line.
  - One loose content matcher per rule above, in the style of `src/ai/prompt.spec.js`: tested for
    content, not wording.
  - No interpolation: no `${`, `undefined` or `[object Object]`.
  - **Every tool name the text mentions is in that transport's list.** Read the names from the text
    and check each against `mcpToolDefinitions(tools)` or `mcpToolDefinitions(tools, { live: true })`.
    This is what stops the file server's text from telling an agent to call `capture_view`.
  - Every MCP tool description is at most the cap, for both lists.
- **`mcp/server.spec.js` / `mcp/liveHttp.spec.js`**: a real SDK client's `getInstructions()` after
  connecting equals the exported constant.
- **App-level e2e**: none new. There is no UI surface. Run the existing
  `e2e/ai-mcp-agent-pairing.e2e.js` unchanged, to prove the live endpoint still initializes.
  **Chromium only**: no WebGL, canvas or persistence path changes.
- **Driven for real (before and after)**: a real Claude Code, headless, on a fresh temp project
  file. The run is `claude -p` with `--mcp-config` pointing at `node mcp/server.js <tmp.ndjson>`,
  and `--output-format stream-json` so every tool call is countable. It spends the owner's
  subscription, so **ask the owner before running it**; if they decline, say "not driven" in the
  retirement note. Use three requests taken from `bench/ai/cases/`: `cube-with-hole`, `bracket-m4`
  and `ambiguous-request`. Run each twice per arm. Record per run:
  - calls before the first successful write;
  - refused or errored calls;
  - whether `list_ops` was called;
  - whether a check tool ran before the reply said done;
  - for `ambiguous-request`, zero writes.

  Write both arms to `bench/results/ai/<date>-mcp-instructions.md`. Two runs is an anecdote, not a
  benchmark: say so in the result file.
- **Acceptance scenarios to re-drive**: **23** (Claude Code edits the file you have open: the drive
  above is its MCP half; re-drive the in-app merge half with the stand-in if a real Claude Code was
  not used) and **25** (live access: the stand-in connects, and step 2's refusal wording is
  unchanged). Not 27: WebMCP does not read these instructions.
- **Closed findings re-run**: `ai-016`'s repro (`npm run mcp:add -- x.ndjson` registers a server
  that starts) and `ai-023`'s two (a client that quits without DELETE is swept after five minutes;
  the lease reads its real duration before the host replies), because `mcp/liveHttp.js` changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
