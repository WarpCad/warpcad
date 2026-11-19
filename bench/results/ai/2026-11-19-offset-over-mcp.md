# `modify.offset` and `add-clearances`, driven through Claude Code (`TODO/ai-049`)

Run 2026-11-19 UTC. Client: Claude Code 2.1.322, headless `claude -p --model haiku` (`claude-haiku-5-5`), owner
subscription, no API key, `--output-format stream-json`. Same harness as `2026-11-15-skills-over-mcp.md`: a throwaway
`--mcp-config` naming `node mcp/server.js <scratch file>` with `--strict-mcp-config`, built-in tools cut to `ToolSearch` and
the MCP resource readers, scratch copies of `fixture-housing.ndjson` and `fixture-pi.ndjson`. Transcripts (results cut at
600 characters, home paths scrubbed) are in `2026-11-19-offset-over-mcp/`. Haiku is the cheapest model: read each result as a floor.

| Run | Prompt | Skill read | Calls | Cost | Result |
|---|---|---|---|---|---|
| `housing-run1` | *add 0.2 mm clearance to the group called Housing* | **no** (harness: it chose not to read it) | 15 | $0.021 | Not a drive of the new skill text. Valid anyway: shrank the Pin to 9.6 x 9.6 with `set_params`, `check_clearance` 0.2 mm, and said it had chosen the part. Never used `modify.offset` |
| `housing-run2` | same, plus "read the add-clearances skill and follow it" | not reachable | 12 | $0.012 | Harness defect: `--tools ""` removed `ReadMcpResourceTool`, so it could not read `skill://`; it wrote nothing and said so. Discarded |
| `housing-run3` | *add 0.2 mm clearance to the group called Housing* (resource readers allowed, as in 2026-11-15) | `skill://add-clearances/SKILL.md`, before any write | 20, 38 turns | $0.022 | **PASS with notes.** Followed the group paragraph: `copy` of the Pin, `modify.offset` with `distanceMm: 0.2`, `boolean.subtract` against `{ id: group, pieces: "Base" }`, in one `apply_records`; renamed the result back to Housing. `check_clearance` Pin to Base: **0.2 mm exactly**, no overlap (the old `enlarge` text needed a 0.05 mm tolerance). Watertight, thinnest wall 4.8 mm. The Pin kept its 10 x 10 size and the Base hole is 10.4 mm. Note: the first `apply_records` failed because it put `request`/`rationale` inside the steps (the schema takes them at the top); it loaded the schema and retried |
| `pi-run1` | *make an enclosure around the Raspberry Pi* (`ai-041`'s `create-enclosure` drive, regression re-run only) | skill read first | 50, 93 turns | $0.139 | **PASS (regression).** Same shape as 2026-11-15 `run2`: variables, bound outer block and cavity, standoffs, drilled holes, port cutters from the keep-outs, split into Base and Lid. Outer 94.9 x 62.4 x 27.745 mm, **`check_clearance` Pi to shell 0.2 mm, no overlap**, no tool errors. It does not call `modify.offset` (the skill sizes the cavity by formula). Warnings: five 0.52 mm wall readings at the rims of the port openings (the 0.53 mm tongue from `ai-048`, Q102), not 1.37 mm as in `ai-035` |

Total 4 `claude -p` runs, all `claude-haiku-5-5`, about $0.194.

## What this shows

- With the skill read, the model used `modify.offset` with `distanceMm: 0.2` (the clearance, not 2 x) without help, and the
  measured gap is exactly 0.2 mm.
- The skill is only as good as its reading: run 1 did not read it. Server instructions name the URIs; Haiku skipped them once in four.
- Not driven: the shrink branch (`distanceMm: -0.2`) and the fallback to `modify.enlarge`, a non-Haiku model, a curved part
  through the model (cylinder and L-shape are covered by `src/core/kernel/offset.spec.js`).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
