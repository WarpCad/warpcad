# WarpCad skills over MCP, driven through Claude Code (`TODO/ai-035`)

**Claude Code over MCP, not the in-app Assistant.** The system prompt is Claude Code's own plus the server
instructions and `warpcad://guide`. A pass is evidence about the skills and the tools, not about the chat panel.

Run 2026-11-15 UTC. Client: Claude Code 2.1.322, headless `claude -p --model haiku` (resolved to `claude-haiku-5-5`),
owner subscription, no API key, `--output-format stream-json`. Each run has a throwaway `--mcp-config` naming
`node mcp/server.js <scratch file>` with `--strict-mcp-config`, and the built-in tools cut to `ToolSearch` and the MCP
resource readers. Scratch project files only. Haiku is the cheapest model: read each result as a floor. Dollar figures are
what the CLI reported; the subscription is not billed per token.

Transcripts (tool calls in order, results cut at 600 characters, final reply, home paths scrubbed) are in
`2026-11-15-skills-over-mcp/`, with the two fixtures and the final project files of the two runs that finished the job.

**Fixtures.** `fixture-housing.ndjson`: a group called *Housing* with two box parts, `Base` (40 x 40 x 10 mm, with a
10 x 10 mm pocket through it) and `Pin` (10 x 10 x 20 mm, sitting in the pocket with no gap). `fixture-pi.ndjson`: a
Raspberry Pi (bound to a `piModel` variable) and an unrelated 6 mm cube.

| Run | Prompt | Skill read | Calls | Cost | Result |
|---|---|---|---|---|---|
| `run1` | *add 0.2 mm clearance to the group called Housing* | `skill://add-clearances/SKILL.md`, after `record_prompt`, the guide and `describe_scene`, **before any write** | 31, 32 turns | $0.026 | **Followed the skill and the result was wrong.** The skill's cut (`boolean.subtract` against `{ id: group, pieces: "Base" }`) uses up the whole group and returns a plain solid, so the Pin vanished. The model noticed, rebuilt the Pin and the group, and said so plainly. Group renamed to "Group 1" |
| `run1b` | same, after the skill gained a group paragraph (first draft) | read again | 15, 16 turns | $0.017 | **Wrote nothing, asked a question.** The draft told it to read the Pin's op and params from `get_timeline`, which has none, so it asked for the pocket size (it did not need it). Skill defect, not a model defect |
| `run1c` | same, skill text corrected to measure the Pin with `evaluate_formula` and rebuild it | read first, **before the guide and any other call** | 27, 28 turns | $0.018 | **PASS with notes.** Cut, rebuilt Pin, regrouped in one `apply_records`; read back Pin 10 x 10 x 20 at z 10, Base 40 x 40 x 10; `check_printability` clean (thinnest wall 4.8 mm). Said the gap is 0.2 mm by construction, not measured, and that the group is now "Group 1" (rename in the app) |
| `run2` | *make an enclosure around the Raspberry Pi* | `skill://create-enclosure/SKILL.md`, after `record_prompt` and the guide, **before any geometry write** | 94, 95 turns | $0.239 | **PASS with notes.** Variables `wall`, `clearance`, `standoff`; outer block and cavity bound to formulas; subtract; four standoffs with `repeat`; drilled with the Pi's `hole1..4`; seven port cutters from the `clearance-*` keep-outs; split into `Base` and `Lid` last. Measured 94.9 x 62.4 x 27.745 mm, watertight, thinnest wall 1.37 mm, **`check_clearance` Pi to shell: 0.2 mm gap, no overlap** |
| `run3` | *List every skill the warpcad MCP server offers* | not applicable | 5 turns | $0.005 | **PASS.** `ListMcpResourcesTool` showed both `skill://` resources with their descriptions; the model named both and what each is for |

| `run4` | *a 40 mm cube with a 10 mm hole straight through it* (`ai-028` re-run, empty project) | none (right: no skill applies) | 9 turns | $0.016 | **PASS.** Read `warpcad://guide` unasked, one `apply_records`, measured, print-checked, no question about units |
| `run5` | *make me a printable wing* (`ai-028` re-run, empty project) | none | 6 turns | $0.008 | **PASS.** Read the guide unasked, `describe_scene`, then asked (the airfoil, span and so on) with zero writes |

Total 7 `claude -p` runs, all `claude-haiku-5-5`, about $0.329. Plus, as the other re-runs `mcp/server.js` changing calls for:
`npm run test:e2e:headless -- --project=chromium-laptop` over the six live-bridge and MCP specs (`ai-live-bridge-preview`,
`ai-mcp-agent-pairing`, `mcp-merge`, `live-bridge-opt-out`, `mcp-connected-assistant`): 9 passed, 0 failed, 5 skipped by their own guards;
and the rotating pair `webkit-laptop + chromium-phone` over the same specs plus `live-mcp-header-entry`: 6 passed, 26 skipped, 0 failed.

## What this shows

- **The instructions line works.** In every run that had a job to do (4 of 4) the model read the matching skill by its URI
  before any write, with no slash command and no hint. The line in `SERVER_INSTRUCTIONS` naming the two URIs was enough;
  the SEP's fallback (a host that cannot do `skills/list`) is what Claude Code uses, since it showed the skills as resources.
  Claude Code did not call `skills/list` itself; the protocol spec (`mcp/skills-protocol.spec.js`) covers that method.
- **The clearance example in the task is a group of parts, and the first draft of `add-clearances` did not handle one.**
  `run1` is that defect, found by driving. Subtracting from a part of a group uses up the group, and no tool shows a
  part's op or params, so the skill now says to measure a box part, rebuild it, and regroup in one call, and to leave a
  round or shaped part alone and say so. That is exact only for boxes; filed as a tool gap in `FIND-ai-041`.
- **`check_clearance` cannot measure two parts of one group.** The `Housing` gap is by construction (a 10.4 mm cutter
  around a 10 mm pin), not read back. The enclosure run did measure the Pi against the shell (0.2 mm).
- **No tool names a body.** The rebuilt group is called "Group 1" and the user must rename it. Also in `FIND-ai-041`.
- **A model that stops to ask is a skill defect to look for.** `run1b` is one: the skill sent the model to a tool that
  does not show what it promised.
- Not driven: the project open in the app at the same time (the merge path is `testing-022`'s and is unchanged), a
  non-Haiku model, resin or CNC defaults (none are set), and the live server (`mcp/liveHttp.js` declares no skills).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
