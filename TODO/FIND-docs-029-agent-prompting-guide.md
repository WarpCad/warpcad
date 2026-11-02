---
title: Publish an agent prompting guide so a browser agent (and the person writing its prompt) can find the tools, conventions and a worked example
category: docs
kind: feature
priority: medium
model: sonnet
milestone: none — Findings table, outside the milestone plan (filed 2026-11-02 at the owner's request)
depends: []
status: open
---

## Goal

**In user terms:** someone asked Claude to write a prompt that designs a part in WarpCad. Claude searched
for WarpCad documentation, found none it could use, and listed what it needed. Today `docs/webmcp.md`
and `docs/mcp.md` explain how to *connect* an agent. Nothing tells an agent, or the person writing its
prompt, *how to model well*: the exact tool names and schemas, the coordinate conventions, how
variables and booleans work, how to check the result, and one worked example. Nor can a crawler or an
agent's web search reach any of it: the docs are rendered into the in-app Help and published at
`app.warpcad.com/help/`, but there is no `llms.txt` and no page that lists the tools.

Done means a stranger (or a model with web search and no WarpCad context) can find one public page,
read it, and write a prompt that a browser agent carries out correctly on the first try. That page
answers the six things Claude asked for, in this order:

1. **Every WebMCP tool** with its exact name, description, input schema and one example call.
2. **Coordinates and units**: origin, which axis is up, units, angles, how a body, a part, a face or an
   edge is named and referenced.
3. **Variables and operations**: how a named variable is defined and bound (`define_variable`,
   `bind_param`, `set_variable`), and how cut, union, and fillet/chamfer work (operand counts, order,
   what an operand is).
4. **Verification**: how an agent checks its work: `describe_scene`, `measure`, the printability check,
   `capture_view` where available. Say plainly which of these WebMCP withholds
   (`WEBMCP_WITHHELD` in `src/ai/tools/index.js`).
5. **A worked example**: a small case (a box, a lid, one cutout) as the prompt a person would write,
   plus the exact sequence of tool calls that builds it, with the result of each.
6. **Constraints**: secure top-level page only, the Chrome flag and version, what Undo and Undo AI turn
   do with an agent's rows, and what an error looks like (a refusal names the cause and writes
   nothing; the limits in `src/ai/tools/limits.js`).

Plus a short section **"Writing a prompt for WarpCad"**: what to state (dimensions in mm, which face is
the datum, tolerances, what to leave as a variable), what not to (don't ask for a mesh, don't ask for
a fixed number of tool calls), and when to ask the agent to verify. Ask the agent to record the request
with the part (`apply_records`' `prompt`), since the document keeps design intent.

## Why it is not just "paste the schemas into `docs/webmcp.md`"

- **A hand-written tool list rots.** The registry in `src/ai/tools/` already holds every name,
  description and JSON schema, and `list_ops` already returns the operation catalogue. The tool
  reference must be **generated from the registry** at docs-build time, so a new tool or a changed
  param cannot leave the page wrong. A spec fails if the page's tool list and the registry differ.
- **A crawler cannot call `list_ops`.** An agent that has the app open can ask the page. One that is
  writing a prompt *before* opening the app, or a search engine, can only read a URL. The generated
  page is for them.
- **Examples must be run, not trusted.** The worked example's tool-call sequence is fed to the real
  registry in a spec (framework-free, kernel mocked at the boundary per `CLAUDE.md`) and its recorded
  results are what the page shows. An example that no longer runs fails the build.

## Interaction model

n/a — a documentation task. It adds no control. The only user-visible surfaces are a new Help page and
two public files, and both are reached by URL and by the Help sheet's existing index, not by a new
control.

## Documentation

- **Page**: new `docs/agent-prompting.md`, titled "Prompting an agent to design a part". Link it from
  `docs/webmcp.md` ("Next: how to write the prompt"), `docs/mcp.md`, `docs/ai-partner.md` and
  `docs/README.md`. It needs a sidebar entry (`.claude/commands/docs.md` Step 4) and an entry in
  `docs/help-slugs.json` (lockfile, `docs-028`).
- **Generated section**: a build step (extend `scripts/help-build.mjs`, or add
  `scripts/agent-docs.mjs` it calls) that writes the tool reference from `src/ai/tools/` into the page
  between marker comments, so the hand-written prose around it is not overwritten.
- **Public, crawlable, not behind the app**: published through the existing `help/` pipeline at
  `https://app.warpcad.com/help/agent-prompting.html`. Also publish
  `https://app.warpcad.com/llms.txt` (from `public/`, next to `CNAME`): a short Markdown index in the
  llms.txt convention that names WarpCad in one paragraph and links the guide, `webmcp`, `mcp`,
  `variables` and `booleans`. Add `llms-full.txt`, the guide as one Markdown file with no HTML, if the
  build can emit it cheaply. The home page (`~/src/@WarpCad/warpcad.github.io`, `docs-027`) links the
  guide from its docs list; that is a one-line change there, noted in this task's closing commit, not
  a second task.
- **Example** (the one the page must contain, step by step):
  1. State the request: *"A 60 × 40 × 20 mm box with a 2 mm wall, an open top, and a lid that sits
     in the opening with a 10 mm circular cutout. Make the wall thickness a variable."*
  2. `define_variable` `{ name: "wall", kind: "number", value: 2, unit: "mm" }`.
  3. `apply_records` with steps: create the outer box, create the inner box, `operate` subtract with
     `@1`, `@2` as operands, create the lid, create the cylinder, subtract. Show each result.
  4. `bind_param` the inner box's size to `wall`; `set_variable` `wall` to 3 and show the parts
     follow in one revision.
  5. `describe_scene` and `measure` to check size and the wall; `check_printability` for overhangs.
  6. Press **Undo AI turn**; every row from the agent goes in one step.
  Fix the real tool names and param shapes from the registry when writing this; the list above is the
  shape, not the contract.
- **Media**: one `e2e/docs/agent-prompting.docs.js` shot: the worked example's result in the viewport
  with History rows marked **via webmcp** (file `docs/screenshots/agent-prompting-result.png`), embedded
  in the page. Generated by `npm run docs:media`, never by hand; `e2e/docs-media.spec.js` guards it.

## Affected files

- `docs/agent-prompting.md` (new), `docs/webmcp.md`, `docs/mcp.md`, `docs/ai-partner.md`, `docs/README.md`
- `docs/help-slugs.json` (new slug), the Help sidebar source
- `scripts/help-build.mjs` or a new `scripts/agent-docs.mjs` (+ `.spec.js`): the generated tool reference
- `public/llms.txt` (new), `public/llms-full.txt` or its generator
- `src/ai/tools/` (read only; export what the generator needs if it is not already exported, no behaviour change)
- `e2e/docs/agent-prompting.docs.js` (new), `e2e/docs-media.spec.js` (claims the new picture)
- `docs/decisions/documentation.md` (one line: the page and `llms.txt` are published contract, like the slugs)

## Proposed fix

1. Read `src/ai/tools/index.js`, `schema.js` and each tool file; confirm what is exported and what the
   registry holds per tool (name, description, schema, writes-or-not, withheld-from-WebMCP).
2. Write the generator and its spec first (red): the page lists exactly the registry's tools, in the
   registry's order, and marks `WEBMCP_WITHHELD` ones.
3. Write the prose sections 2, 3, 4 and 6 from the code and from `docs/variables.md`,
   `docs/booleans.md`, `docs/undo-redo.md`, not from memory; link rather than repeat where a page exists.
4. Build the worked example as a spec that runs the tool calls against the registry and snapshots each
   result; paste those results into the page (generated, not typed).
5. Add `llms.txt`; add the page to the slugs lockfile, the sidebar, the cross-links.
6. Run `npm run docs:media`, `npm run help:build` (whatever the script is called), and the guards.
7. Hand a model with web search only the published URL and ask it to write the box-and-lid prompt;
   record whether it found the page and used the exact tool names. That is the acceptance check for
   this task, and it goes in `TODO/VERIFY.md` as a one-off row if it cannot run unattended.

## Effort

M. The prose is the larger part; the generator is small if the registry already exposes its schemas.

## Testing

- **Unit** (`scripts/agent-docs.spec.js`): the generated reference contains every registry tool once,
  with its schema; adding a fixture tool changes the output; a tool in `WEBMCP_WITHHELD` is marked.
  Degenerate cases: a tool with no params, a tool with a nested schema, a description containing
  Markdown characters.
- **Unit** (worked example): the example's call sequence runs against the registry with the kernel mocked
  at the boundary; every step succeeds; the final `describe_scene` matches the page.
- **Guards**: `e2e/docs-media.spec.js` (dead link, orphaned file, unclaimed picture) and the slug
  lockfile check pass. A check that `llms.txt` links resolve in `dist/`.
- **e2e**: a `*.e2e.js` that opens `/`, opens Help, finds **Prompting an agent to design a part**, and
  sees the generated tool list. This is the reachability gate for the page; Chromium only, since no
  WebGL, canvas or persistence path is involved. The docs shot is Chromium, laptop viewport.
- **Acceptance scenarios to re-drive**: none of the 28 are changed by a docs page. Re-drive the WebMCP
  scenario, if one exists in `TODO/ACCEPTANCE.md`, only if the exports from `src/ai/tools/` change.
- **Closed-finding regression**: none; this task adds no behaviour.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
