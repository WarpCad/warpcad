---
title: Serve WarpCad skills from the MCP server (the Skills extension, SEP-2640)
category: ai
kind: feature
priority: medium
model: opus
milestone: none — Findings table, filed 2026-11-13 at the owner's request
depends: []
status: done
---

## What shipped

The extension route, no SDK bump: `mcp/server.js` declares `io.modelcontextprotocol/skills`, answers `skills/list` and `skills/get`, serves each skill file as a `skill://<name>/<file>` resource, and names the two SKILL.md URIs in `SERVER_INSTRUCTIONS` (2,040 of 2,048 characters). Skills: `add-clearances` and `create-enclosure` in `mcp/skills/`; `mcp/skills.js` reads them. The clearance is an input; the stated FDM default is 0.2 mm per side (snug or press) and 0.4 mm (sliding), none for resin or CNC, a judgment call taken without the owner (recorded in `docs/decisions/ai-partner.md` Decision 14, and as a Verification row). Driving Claude Code (7 `claude -p --model haiku` runs, `bench/results/ai/2026-11-15-skills-over-mcp.md`) showed the first `add-clearances` draft lost a group's other part, since a boolean on a part of a group uses up the group; the skill now rebuilds a box part and regroups in one call. Not covered: the live server (`mcp/liveHttp.js`) declares no skills. Tool gaps the skills work around: `FIND-ai-041`.

## Goal

Let a connected AI partner (Claude Code today) discover and load **WarpCad skills** from the MCP server: written
workflows for multi-step modelling jobs that a single tool call can't express. The owner's two first examples:

- **Add clearances to a group.** Take a group of parts that must fit together, and open a gap (for example 0.2 mm
  for a printed press fit) on every mating face, with the rule for choosing the gap stated once.
- **Create an enclosure.** Given a part or group, build a box around it with wall thickness, lid split, standoffs and
  cut-outs, in the order that survives a timeline rebuild.

A skill is a directory with a `SKILL.md` (YAML frontmatter `name` and `description`, then Markdown instructions) and
optional supporting files. The model reads the short description first and loads the body only when it is relevant.
That keeps `SERVER_INSTRUCTIONS` short while the workflows can be as long as they need.

"Done" means: Claude Code connected to `mcp/server.js` lists at least these two skills, reads one, follows it, and
produces the result the skill describes, in a project that is open in the app.

### What the extension says (read 2026-11-13; re-read before building)

Source: <https://modelcontextprotocol.io/seps/2640-skills-extension>. Status Final, Extensions Track, created 2026-04-23,
by the Skills Over MCP Working Group. The page notes it is a historical record, so check the current specification and
its changelog for the authoritative text before coding to it.

- Skills follow the [Agent Skills spec](https://agentskills.io/specification). Every file in a skill directory is an MCP
  **resource**, conventionally `skill://<skill-path>/<file>`; the last path segment must equal the `name` in the frontmatter,
  and `SKILL.md` is always addressable (`skill://enclosure/SKILL.md`).
- The extension id is `io.modelcontextprotocol/skills`. A server that declares it implements **`skills/list`** (every skill,
  with its frontmatter, and each file's `uri`, `digest` and `size`) and **`skills/get`** (one skill's entry by URI).
  `resources/directory/read` is optional.
- Hosts must be able to load a skill from its URI alone through the ordinary `resources/read`, so a server that cannot yet
  do the new methods can still be useful by serving the resources and naming the URIs in its instructions.
- Nested skills are supporting content only. Activating one needs fresh consent from the user.
- Skills can carry scripts. **WarpCad's skills must carry none**: Markdown instructions that call WarpCad's own tools.

## Interaction model

Pure `ai` change with no app UI surface: the skills are read by the model over MCP, not by a person in the app.
No precondition, trigger, placement, selection or small-screen behaviour applies (n/a for each). The only feedback is in
the AI's transcript and in the project the skill's steps edit, which already shows in the open app through the existing
MCP-to-app merge.

## Documentation

- **Page** — `docs/mcp.md`: a "Skills" section naming each shipped skill, its URI, and how a client sees it. Plus
  `docs/decisions/ai-partner.md`: one paragraph recording the choice below.
- **Example** — "Connect Claude Code, ask 'add 0.2 mm clearance to the group called Housing', and watch it read
  `skill://add-clearances/SKILL.md` before it makes the edits." Units are millimetres, Z-up, per `CLAUDE.md`.
- **Media** — none. Nothing here is a control in the app.

## Affected files

- `mcp/server.js` (declare the extension, answer `skills/list` and `skills/get`, serve the resources; line 151 holds the
  capabilities today)
- `mcp/skills/<name>/SKILL.md` (new, one directory per skill, with the SPDX marker at the end of each)
- `mcp/skills.js` (new: reads the directory, parses frontmatter, computes digests)
- `src/ai/tools/` only if a skill turns out to need a tool that does not exist yet (file that as its own task)
- `docs/mcp.md`, `docs/decisions/ai-partner.md`

## Proposed fix

Do not implement here; this is the plan.

1. **Design decision first (Opus).** Check that `@modelcontextprotocol/server` 2.3.1 (pinned in `mcp/package.json`) can
   declare an extension and register custom methods. If it can't, either bump it (re-run the library health check, per
   `CLAUDE.md`'s Library decisions) or serve plain `resources/read` with the URIs listed in `SERVER_INSTRUCTIONS`, and say
   which in `docs/decisions/ai-partner.md`. The second route needs no SDK change.
2. **Where skills live.** Files under `mcp/skills/`, shipped with the MCP package, so a skill and the tools it names are
   versioned together. That is the extension's own motivation.
3. **One registry, no second tool list.** `docs/decisions/ai-partner.md` says neither access path adds tools of its own.
   Skills must call only tools already in `src/ai/tools/`. A spec check lists every tool name a `SKILL.md` mentions and
   fails if one isn't in the registry, so a renamed tool can't leave a skill stale.
4. **First two skills**, each short, each ending with a "check your work" step (measure, list ops, confirm the result):
   `add-clearances` and `create-enclosure`. Decide in the task, with the owner, whether the clearance rule is a parameter
   the user gives or a default per process (FDM, resin, CNC).
5. **Trust model.** Skill text is shipped by us, so it is instructions, unlike text that arrives in a loaded project, which
   stays data (`docs/decisions/ai-partner.md`). Keep that line explicit in the decision record. A skill must never tell the
   model to trust project text.
6. **Candidates for later skills**, to list in the task, not to build: bolt-pattern layout, print-orientation checks,
   mounting-tab patterns, a gear-train recipe (parked with the gears work).

## Effort

M for the server side and two skills. The skill writing itself is the bigger part, and each skill must be driven by a real
client before it counts. L if step 1 finds the SDK can't do it and a bump is needed.

## Testing

- **Unit (Vitest, next to source):** `mcp/skills.spec.js` covers frontmatter parsing, the name-equals-directory rule, digests
  that change when a file changes, a missing `description`, a skill directory with no `SKILL.md`, and the registry-name check
  from step 3. Mock nothing; it reads real files.
- **Protocol spec:** an MCP-client spec in `mcp/` that initialises, sees the extension declared, calls `skills/list` and
  `skills/get`, and reads a resource, in plain Node.
- **E2E:** no `*.e2e.js`, because there is no app surface (Interaction model above). The real check is a drive with Claude Code
  as the client (`claude -p` on the owner's subscription, per the 2026-11-13 decision on `testing-022`, never an API key):
  ask for the clearance and the enclosure and confirm the result in the open project. Record it in `TODO/VERIFY.md` as
  `testing-022`'s rows are.
- **Browsers:** n/a, Node only.
- **Acceptance scenarios this could break:** none. The change adds MCP methods and files. Re-run `testing-022`'s MCP and
  live-bridge checks, since `mcp/server.js` changes.
- **Closed findings re-run:** the `ai-028` MCP checks, because the server's capabilities declaration changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
