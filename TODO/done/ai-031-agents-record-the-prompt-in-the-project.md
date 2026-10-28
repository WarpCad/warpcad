---
title: Have an agent store the prompt that made a part in the project, in a hardened record
category: ai
kind: feature
priority: high
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-10-28 at the owner's request)
depends: [ai-003]
status: done
---


> **What shipped (2026-10-28).** As proposed, with these differences. The record lives in the state
> line's merge section as `merge.prompts` (beside `merge.gist`), not as a record line or a register: a
> released build refuses an unknown op or register name but ignores an unknown section key. It merges
> as a grow-only set with no stamps, and Undo, delete and Undo AI turn leave it alone. As the finding
> notes for `gist`, a released build drops the field if it saves; a later merge restores it (fixtures
> `prompt-written.ndjson` and `prompt-saved-by-v1.2.0.ndjson`). Binding is by `ctx.prompt`: every new
> record id from any write tool is added to the bound prompt's `produced`, which covers a boolean's
> result; `ctx.request` still wins for intent. The tab endpoint (`src/ai/bridge/tabEndpoint.js`) carries
> WebMCP and the live bridge, so `useWebMcp.js` and `useLiveBridge.js` did not change. **Not built:**
> the Feedback line's Prompt on the **timeline row** (the Inspector row is built). Acceptance 23 and 25
> not driven (real Claude Code; ask the owner before spending tokens); 27 driven with the stand-in.

## Goal

**In user terms:** the owner had an agent build a fan duct through WebMCP. The project file holds three
bodies and their parameters, but not the request that produced them. Whoever opens it later, a person or
another model, cannot tell what it was meant to be. `CLAUDE.md` says the document records design intent, "each
feature carries the prompt or instruction that produced it". For the in-app Assistant that holds. For an
agent that connects over **WebMCP or MCP** it does not: `ctx.request` (the user's words,
`src/ai/tools/index.js`) is set by the in-app chat turn only, so an external agent's writes carry at most a
one-line `rationale`. `ai-027`'s item 10 tells agents to pass `request` "from the transport", which today
does not exist for these two paths.

Done means:

- An agent can record **the prompt** it was given, in full (bounded), and name the bodies or steps it
  produced. It does so with a new tool and on `apply_records`, not by smuggling it into a body name or
  the project note.
- The prompt is stored as **its own document record**, validated at load the way `asset.image` is for
  sketches (`validateImageAsset`, `src/core/project.js`): a record that fails validation is refused or
  dropped, never half-loaded; text only, with a hard cap; control and bidi characters stripped
  (`src/core/intent.js`'s `cleanText`); no markup parsed anywhere. It merges with the project
  (`docs/decisions/document-sync.md`: a record with an id, so two replicas that each add a prompt keep both),
  and survives **Download copy**, share links and gists.
- The record is **data, never instructions**: it reaches a model only inside the labelled data block
  (`src/ai/documentData.js`), exactly as intent does, and the trust model in `docs/decisions/ai-partner.md`
  gets a line for it.
- The Inspector shows it for a selected body that has one (read-only text, collapsed by default), so a
  person sees why a part exists.

## Interaction model

- **Precondition**: a project open; an agent connected (WebMCP, the file MCP server, the live bridge) or the
  in-app Assistant running.
- **Trigger**: the agent calls `record_prompt` (or passes `prompt` on `apply_records`); in the in-app chat it
  happens automatically from the user's message. A person never types into a new control to create one.
- **Feedback**: the timeline row and the Inspector for a produced body show **Prompt** with the text; the
  agent's tool result echoes the stored (cleaned, possibly truncated) text and its id, so a cut prompt is
  visible to the agent. A refusal names the reason (over the cap, empty).
- **Placement / Selection response**: selecting a produced body shows its prompt in the Inspector.
  **Selection count**: the Inspector shows the prompt for exactly one selected body; with several selected,
  it lists "N prompts" and no text.
- **Small-screen behavior**: the Inspector section is a collapsed row at 390 px; the text wraps and never
  scrolls the page sideways.

## Documentation

- **Page**: `docs/webmcp.md` and `docs/mcp.md` (a **The prompt is saved with the part** section) and the
  Inspector page. **Example**: "Ask your agent *a 140 × 250 mm fan duct, 1.6 mm walls*. Select the duct in
  WarpCad: the Inspector's **Prompt** row shows those words. Download the project: they are in the file."
- **Media**: `e2e/docs/` shot of the Inspector's **Prompt** row.

## Affected files

- `src/core/` (new `prompt.js` + spec): the cap, `cleanText`, the record's shape and `validatePromptRecord`.
- `src/core/project.js`: the validator runs at load, beside `validateImageAsset`.
- `src/core/document.js`, `src/core/merge/`: the record, fold and merge rules.
- `src/ai/tools/` (new `record_prompt` tool; `apply_records` takes `prompt`), registered once for both the
  MCP and WebMCP paths. Neither path adds tools of its own (`docs/decisions/ai-partner.md`).
- `src/ai/documentData.js`: the labelled data block.
- `src/components/inspector/`: the **Prompt** row.
- `docs/decisions/ai-partner.md`: the trust-model line; `docs/webmcp.md`, `docs/mcp.md`.
- `src/composables/useWebMcp.js`, `useLiveBridge.js`: where the transport sets `request`.

## Proposed fix

0. **Decide the shape first and record it.** Per-record **intent** already exists (`ai-003`): beside the
   entry, 500 characters, composed with the rationale. It is the right place for "why this step". It is the
   wrong place for the prompt: too short, tied to one entry, and an external agent never fills the request
   half. Recommended: a separate record kind (`note.prompt`) holding `{ id, text, produced: [ids] }`,
   one per request, so one prompt can cover many steps and a revision adds a new record rather than
   rewriting one. Check that a boolean consuming its operands does not orphan the `produced` ids; point at the
   result as well.
1. Write `src/core/prompt.js`: cap (suggest 4,000 characters; a prompt longer than intent's 500 is the
   point), clean, validate. Every bad shape has a test.
2. Add the load-time validator, the fold and the merge rule. An older build that meets the record must
   ignore it and keep it on save (as it already does for `gist`); prove that with a fixture.
3. Add `record_prompt` and `apply_records`' `prompt`. Make the tool's description say when to call it:
   **once, first, before writing**, with the user's words as received, not a paraphrase.
4. Fill `ctx.request` for WebMCP and MCP from the recorded prompt, so `intent` composition (`ai-003`)
   works for external agents as `ai-027` item 10 already assumes.
5. Update `ai-027`'s instructions text: one line, "Call `record_prompt` first with the user's request".
   That line is inside the 2,048-character budget `ai-027` enforces.
6. The Inspector row. Text only: no `v-html`, no Markdown rendering, no links followed.

## Effort

L. The record, the merge rule and the validator are the weight; the tool and the row are small.

## Testing

- **Unit**: `prompt.spec.js` (cap, truncation marker, control and bidi stripping, empty, non-string, a 1 MB
  string, `<img onerror>` stays inert text). Merge: two replicas each add a prompt, both survive; one deletes
  the produced body, the prompt remains. Load: a malformed record is rejected with a named reason. Older-build
  round trip. Tool: the result echoes the stored text.
- **E2E (real app, `/`)**: drive WebMCP with the existing stand-in agent: call `record_prompt`, build a body,
  select it, assert the Inspector's **Prompt** row. **All three viewports; all three engines** (the
  document, IndexedDB).
- **Acceptance scenarios**: re-drive 23 (Claude Code edits the open file), 25 (live access) and 27 (WebMCP).
  **Closed findings re-run**: `ai-003`'s intent repro and `ai-017`'s Undo-AI-turn repro, because the AI write
  path and `ctx.request` change.
- **Driven for real**: ask the owner before spending subscription tokens on a real agent run; otherwise say
  "not driven".

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
