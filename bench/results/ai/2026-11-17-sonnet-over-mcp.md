# Sonnet over MCP: the ai-035 and ai-014 drives repeated on a stronger model (`TODO/testing-044`)

**Claude Code over MCP, not the in-app Assistant.** Run 2026-11-17 UTC. Client: Claude Code 2.1.322, headless
`claude -p --model sonnet` (resolved to `claude-sonnet-5-5`), owner subscription, no API key, `--strict-mcp-config`
with `node mcp/server.js <scratch file>`, the built-in tools cut to `ToolSearch` and the MCP resource readers. Scratch
copies of the 2026-11-15 fixtures (`2026-11-15-skills-over-mcp/fixture-*.ndjson`). The Haiku numbers are in
`2026-11-15-skills-over-mcp.md` and `2026-11-15-claude-code-over-mcp.md`. Dollar figures are what the CLI reported.

| Run | Prompt | Skill read | Calls | Cost | Result |
|---|---|---|---|---|---|
| `housing` | *add 0.2 mm clearance to the group called Housing* | `skill://add-clearances/SKILL.md`, after `record_prompt` and the guide, before any write | 21 | $0.245 | **PASS, better than Haiku.** Measured the Pin with `evaluate_formula`, one `apply_records` (cutter, rebuilt Pin, regroup), renamed the result back to `Housing` with `style.rename` (Haiku left "Group 1"), then **measured** the gap with `check_clearance` on the two parts: 0.2 mm, no overlap. Housing 40 x 40 x 25 mm unchanged, watertight, thinnest wall 4.8 mm |
| `pienc` | *make an enclosure around the Raspberry Pi* | `skill://create-enclosure/SKILL.md` before any geometry write | 74 | $0.759 | **PASS, same result as Haiku.** Variables `wall`, `clearance`, `standoff`, formulas for the shell, four drilled standoffs by `repeat`, seven port openings, Base and Lid split. 94.9 x 62.4 x 27.7 mm, `check_clearance` Pi to shell 0.2 mm, thinnest wall 1.37 mm. Said what it left out (microSD, LEDs, port cutters not tied to the formulas, no lid joint) |
| `pi5` | *make this case for a Pi 5* (project with a bound `piModel`) | create-enclosure | 66 | $0.690 | **PASS.** Called `set_variable piModel = 5` first (after `list_variables` and `get_timeline`), not `list_ops` or `operate` hunting for the Pi, then built the case on the Pi 5 |
| `wing` | *make me a printable wing* (scenario 17's MCP half) | none | 6 | $0.212 | **PASS, same as Haiku.** Read the guide, wrote nothing, asked for airfoil, span, chord, bed and extras, with a default it would use |

Total 4 `claude -p` runs, `claude-sonnet-5-5`, about $1.91 as reported. Sonnet is the same or better than the Haiku floor
on every row. The project open in the app (`ai-035` #6) was driven separately: the `housing` file merged through
**File, Merge file…** in Firefox (10 History rows, all `via mcp`; `Housing` selectable).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
