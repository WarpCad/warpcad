# VERIFY.md model-behaviour rows, driven through Claude Code over MCP (`TODO/testing-032`)

**Claude Code over MCP, not the in-app Assistant.** The system prompt differs from the in-app Assistant's: it is
Claude Code's own, plus the server instructions and `warpcad://guide`. A pass here is evidence about the tools, not
about the chat panel, the cost chip or the fork-and-merge turn. Those stay in `TODO/VERIFY.md`.

Run 2026-11-15 UTC. Client: Claude Code 2.1.322, headless `claude -p --model haiku` (resolved to `claude-haiku-5-5`),
owner subscription, no API key, `--output-format stream-json`. Each run has a throwaway `--mcp-config` naming
`node mcp/server.js <scratch file>` with `--strict-mcp-config`, and the built-in tools cut to `ToolSearch` and the MCP
resource readers (plus `Read` for the drawing). Scratch project files only. Haiku is the cheapest model, not the one most
owners use: read each result as a floor. Dollar figures are what the CLI reported; the subscription is not billed per token.

Transcripts (tool calls in order, results cut at 600 characters, final reply) are in
`2026-11-15-claude-code-over-mcp/`, with the fixtures and the two final project files.

| Run | Row | Prompt | Calls | Cost | Result |
|---|---|---|---|---|---|
| `ai014` | ai-014 #1 | *make this case for a Pi 5* (project: Pi + cube, `piModel` bound) | 15 turns | $0.024 | **No `set_variable`, no `list_variables`.** Placed a second Pi (`model: 5`), built a tray and lid; `piModel` stayed 4 |
| `ai014b` | ai-014 #1 | same, fresh copy | 16 turns | $0.030 | Same: second Pi 5, shell, standoffs, lid. No variable tool |
| `ai014c` | ai-014 #1 | same, project also holds a 98 x 65 x 25 "Case" body | 16 turns | $0.022 | Same: built a new case beside the old one. No variable tool |
| `ai022` | ai-022 #1 | *Snap Block A onto Block B using outside+ along z, and tell me which side of Block B it lands on* | 9 turns | $0.007 | **PASS.** One `operate group.snap`, answered "the - side"; Block A went from z 0..10 to z -10..0, Block B unmoved |
| `s17` + `s17b` + `s17c` | ai-010 #1, #3 | scenario 17 sentence verbatim; then the answer; then *make the wing 20% longer* | 7 + 13 + 8 turns | $0.012 + $0.028 + $0.037 | See below |
| `s18` | ai-010 #2, ai-008 #1 | scenario 18 sentence verbatim plus the image path | 11 turns | $0.018 | See below |

Total 8 `claude -p` runs, all `claude-haiku-5-5`, about $0.178.

## ai-014 #1: `set_variable`

Three of three runs read the guide and `describe_scene`, then **never called `list_variables` or `set_variable`**. The
`describe_scene` answer lists the Pi's parts but says nothing about `model` being bound to `piModel`: the word
`piModel` appears in no tool result. The server instructions do say "to change what every bound body shares, call
`set_variable`", but nothing tells the model that this body is bound. Read as "make me a case for a Pi 5", the model built
new geometry around a newly placed Pi 5 and left the project's own Pi at 4. That is a defect in what the scene
read-back shows, not only a model quirk: filed as `FIND-ai-040`.

**Re-run 2026-11-18 after `ai-040`** (`describe_scene` now lists `boundTo: [{ path: "model", variable: "piModel", value: 4 }]`): three fresh `claude -p --model haiku` runs on `fixture-pi.ndjson`, same prompt. `set_variable` was called in **2 of 3** runs (was 0 of 3); run 1 still built geometry and used `evaluate_formula` without `set_variable`. Transcripts not stored.

## ai-022 #1: snap side

One run, one fixture (two 20 mm cubes 60 mm apart in X, equal Z). `group.snap`, `axes: z`, `orientation: outside+` landed Block A on
Block B's - side and the model said so. The tool description's corrected sentence is enough for Haiku here. One run is
an anecdote.

## Scenario 17 (airfoil), MCP route

- Run 1: read the guide, found an empty project, **asked** for the span (`AskUserQuestion` is not in this session, so it asked
  in plain text) and stated its assumptions (NACA 2412, 120 mm chord, 220 x 220 x 250 mm bed, 0.4 mm nozzle). Wrote nothing.
- Run 2, after "Span 400 mm, go with your assumptions": a `primitive.sketch` with a `naca4` curve (first call refused for a misplaced `atMm`, the retry landed)
  rotate, translate, `modify.splitWithJoint` at y 200 with a dowel, then fuselage, tailplane and fin as three cuboids in `apply_records` (first try refused: `request` and `rationale` are not step fields).
  `check_printability` returned 6 errors on the wing: one *larger than the build volume* for the whole body, and five *Wall 0.01 mm ...* at the trailing edge.
- **ai-010 #3: noticed, did not fix.** The reply named the sharp trailing edge ("about 0.01 mm, below the 0.4 mm nozzle", suggested a 0.4-0.6 mm blunt edge) and left it unfixed, listing it under "Still to fix". It did not report the wing as printable. Product call left open: it did not choose a blunt edge by itself.
- Honest but unfinished: it said each half "fits" while the checker could only check the whole group (and said so); it did not fix the weight (solid, about 0.5 kg).
- Follow-up (step 6), *make the wing 20% longer*: edited the existing wing (`modify.fit` to 480 mm, then re-split into three pieces), no second wing body, span 480 mm. The first fit removed the earlier split, which it noticed and redid.
- Not drivable over MCP: the viewport, laptop vs phone, Undo AI turn, Export, **Stop** mid-turn, the in-app cost chip. The "laptop and at phone (touch)" half of ai-010 #1 stays open for the in-app Assistant.
- Verdict for the tool route: **PASS with notes** (asks or states assumptions, sketch + split wing + rest of the model, check run, trailing edge flagged, follow-up edits in place). Not a FAIL, but the model did not finish the printability job it reported.

## Scenario 18 (drawing), MCP route

Over MCP the image tools (`set_reference_scale`, `locate_in_image`, overlay compare, `save_to_library`) are browser-only
(`transports: ['ai']`), so scale, overlay residual and the library Save card cannot be driven here. What can: reading the drawing with Claude Code's `Read`
and building the group.

- Read the drawing first, then `record_prompt`, guide, `describe_scene`, `list_ops`, one `apply_records` building a group (Board,
  USB-A 1, USB-A 2, Ethernet), `check_printability`, `measure`. 4 holes at 58 x 49 mm, 85 x 56 x 1.6 mm board, connectors overhanging 2 mm.
- Said the drawing is a "fictional board, not a real product" and modelled it as drawn; did not cite a real Raspberry Pi.
- **Connector heights: flagged as an estimate, not asked.** It took 3 mm "from the side view" and said real connectors are likely taller (the fixture's true heights are 16 mm USB-A and 13.5 mm Ethernet, so the guess is far off but labelled).
- Did not open with a dimension table; the dimensions are in the final prose. No scale step and no overlay, so no residual was reported, and it did not claim a match.
- It said plainly the group is not in the library from this session.
- Verdict: the reading and flagging half is **PASS with notes**; the scale, overlay residual and Save halves are **not testable over MCP**.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
