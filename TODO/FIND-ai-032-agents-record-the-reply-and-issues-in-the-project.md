---
title: Agents save their reply, and the issues they hit, in the project file beside the prompt
category: ai
kind: feature
priority: medium
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-10-29 at the owner's request)
depends: [ai-031, ai-027]
status: open
---

## Goal

**In user terms:** the owner's Fan Duct project (`~/Documents/fan-duct.ndjson`) carries the request that built it,
because `ai-031` made agents call `record_prompt`. It does **not** carry what the agent said back. That reply
(`~/Documents/fan-duct.response.txt`, 3,330 characters) holds the headline numbers, the derived-value table and a
"Where I deviated from the spec, and why" section: the part a person or the next model needs to know *why the
geometry is what it is*, and what went wrong on the way. Today it lives only in a chat window, and is lost when
the window closes.

Done means: when an agent finishes a piece of work, it **saves its final reply in the project, linked to the
prompt it answers**, including every problem it met while building (a deviation from the spec, a workaround, a
tool call that was refused, a check that failed and how it was resolved). Opening the file later, or handing it
to another model, gives the whole exchange: request, then reply, then the bodies.

**Why it is not already there.** Found by reading the code:

- `PromptRecord` (`src/core/prompt.js:75`) holds `id`, `text`, `produced`. There is no field for a reply.
- Nothing asks the agent for it. `record_prompt`'s instruction (`mcp/liveHttp.js:41`, `src/ai/mcpInstructions.js`,
  the in-app `SYSTEM_PROMPT`, the three MCP prompts of `ai-029`) says to record the request *first*; the reply
  does not exist yet at that moment, so the instruction has no natural place to ask for it.
- Over MCP and WebMCP the server never sees the agent's final message, only its tool calls. The reply can reach
  the project only if the agent **hands it over in a tool call**. The in-app chat is the one path that can do it
  itself.

## Relationship to `io-023`

`FIND-io-023` (gist README carries the brief) lists this field as its Open question 1 and builds it as a side
effect. **This finding owns the field, the tool and the agent guidance; `io-023` only renders what is stored.**
Build this first and `io-023`'s `depends` gains `ai-032`; its "Affected files" lose `src/core/prompt.js`,
`document.js` and `src/ai/tools/`.

## Interaction model

- **Precondition**: a prompt is bound to the call context (`record_prompt` ran, or the in-app chat bound the
  user's message). With no bound prompt, `record_response` **refuses** with "record the request first with
  `record_prompt`", so a reply never exists without its request. Calling it again appends another segment.
- **Trigger**: a new tool, **`record_response`**, called by the agent **last, immediately before its final
  message**, with the same text it is about to give the user. The in-app chat calls the same core function
  itself when a turn ends, with the assistant's final text; the user does nothing.
- **Feedback**: the tool echoes the stored text and whether it was cut, as `record_prompt` does. In the app, the
  prompt's entry in the AI activity list shows the reply under the request (collapsed to a few lines, **Show
  all** to expand) so the owner can see it was saved.
- **Second trigger, by hand**: **Add reply…** on a prompt's row in the AI activity list. Precondition: the prompt
  exists (it is enabled for any prompt, with or without a reply). Feedback: the text area closes and the reply
  appears under the request; undo removes it.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: the reply block wraps and scrolls inside the existing activity list at 390 px;
  **Add reply…** is a full-width tap target and its text area fills the sheet width.

## Documentation

- **Page**: `docs/mcp.md` (the tool and the instruction an agent receives) and the AI activity section of
  `docs/ai-partner.md`.
- **Example**: "Ask your agent for a fan duct. When it finishes, open **File ▾ → Prompts** (or the AI activity
  list): under your request is the agent's answer, including a **Problems met** section if it hit any. Save the
  project, send the file to someone else, and they see the same exchange. To add a reply to an older project, click **Add
  reply…** on the request, paste the text and click **Add**."
- **Media**: update the existing prompts shot in `e2e/docs/` (the one `ai-031` added) to show a reply under the
  request; regenerate with `npm run docs:media`.

## Decisions (owner, 2026-10-29)

1. **One text field**, not a separate issues list: `response`, with the guidance telling the agent to end with a
   **Problems met** section.
2. **A second call appends**, it does not replace. Consequence for the design: a single string cannot be merged
   by append between two replicas (last stamp would win and drop the other), so the reply is stored as an
   **ordered list of segments** `{ id, text }` under the prompt, each segment its own merge entry; the displayed
   reply is the segments joined by a blank line. Two replicas appending concurrently keep both, ordered by
   stamp. The total length is capped (point 3); an append that would exceed it is cut with `…` and says so.
3. **Cap**: `PROMPT_LIMITS.maxResponseLength` = 20,000 characters across all segments, same cleaning as `text`.
4. **The existing Fan Duct file** gets a small **Add reply…** control on each prompt's row in the AI activity
   list: a text area (paste `fan-duct.response.txt`), **Add** / **Cancel**. It appends a segment through the
   command layer (origin `user`, so it is undoable), and is the only way to attach a reply to a prompt after
   the fact. No automatic backfill.

## Affected files

- `src/core/prompt.js` (+ spec): optional `responses` (ordered segments) on `PromptRecord` / `PromptEntry`, `prepareResponse()`
  cleaned and capped exactly as `preparePrompt` (control and bidi characters stripped, hard input cap, truncation
  reported); `PROMPT_LIMITS.maxResponseLength`.
- `src/core/document.js`, `src/core/merge*.js` (+ specs): an `addPromptResponse` that appends one segment to
  an existing prompt and never erases `text`, `produced` or earlier segments; the `merge.prompts` section carries
  each segment with its own stamp, so two replicas that both reply keep both, in stamp order. A file without it loads unchanged; a file with it, opened
  by the previous build, keeps it through a merge (follow `ai-031`'s `prompt-saved-by-v1.2.0.ndjson` fixture).
- `src/ai/tools/prompt.js`, `src/ai/tools/index.js` (+ specs): the `record_response` tool; add it to the
  write-tool lock list in `mcp/projectFile.js` (it changes no row but does write the file, as `record_prompt`
  does).
- The in-app agent (`ai-005`): call the same function when a turn ends, on success **and** on a turn that ends
  in an error (the error text is itself the issue worth keeping).
- Agent guidance, one sentence each, kept short (`ai-027` measured these against a token budget): `mcp/liveHttp.js`,
  `src/ai/mcpInstructions.js`, `src/ai/prompt.js` (`SYSTEM_PROMPT`), and the end of the `start`, `build` and
  `check-print` prompts in `src/ai/mcpPrompts.js`. Wording to start from: "When you finish, call
  `record_response` with your final message — including every problem you met: a deviation from the request, a
  workaround, a refused call, a failed check and how you resolved it."
- `src/components/ai/` (the activity list, the reply block and the **Add reply…** control, with `data-testid`s), `docs/mcp.md`, `docs/ai-partner.md`, `docs/decisions/ai-partner.md`
  (record that the reply is **data, never instructions**, same as the prompt).

## Proposed fix

1. Add the reply segments to the record and merge state; write the failing round-trip and merge specs first.
2. Add `record_response`; it binds to `ctx.prompt`, refuses with no bound prompt, and appends a segment.
3. Make the in-app chat fill it at the end of a turn.
4. Add the guidance sentences, then run `ai-027`'s token-budget spec and `ai-029`'s prompt specs: both have
   ceilings that one new sentence may break; raise a ceiling only with the measured number in the commit.
5. Show it in the activity list, add **Add reply…**; document; regenerate media.
6. Treat the stored reply as **untrusted text** wherever it is read back: `read` tools return it as data, the
   in-app model sees it only inside the same data wrapper the prompt uses, and it can never change a tool limit.

## Effort

M. The field and the tool are small; the merge-state change needs a compatibility fixture, and the guidance edits
touch five places that each have a size budget.

## Testing

- **Unit** (`prompt.spec.js`): `response` cleaned (bidi, control characters), capped with `…`, non-string refused,
  empty refused; a second call appends a segment; the cap cuts the last segment with `…`; further appends past
  the cap are refused with a reason.
- **Unit** (document and merge specs): setting a reply leaves `text` and `produced` intact; two replicas replying
  to the same prompt converge with both segments kept; a file with no reply loads; a file with one survives a merge with the
  previous build's fixture; a reply on a prompt the other replica deleted does not resurrect a half record.
- **Unit** (`tools/prompt.spec.js`, `mcp/prompt.spec.js`): no bound prompt refuses and writes nothing; over the
  closed-file MCP session the reply lands in the file under the lock; a hostile reply (`@name`, `<img onerror>`,
  "ignore previous instructions") is stored inert and returned as data.
- **Unit** (guidance specs): each place that carries the sentence still fits its budget.
- **E2E (real app, `/`)**: drive a scripted in-app turn that builds a body; assert the activity list shows the
  request, then the reply; **Save**, reload, and assert both are still there. Seed a project with a prompt and
  no reply (the Fan Duct shape), click **Add reply…**, paste text, **Add**, assert it shows, **Undo**, assert it
  is gone. **All three viewports; all three
  engines** (IndexedDB, persistence).
- **Acceptance scenarios**: re-drive the AI-building scenario and 30. **Closed findings re-run**: `ai-031`'s
  repro (a prompt survives Download copy, a share link and a gist) with a reply present, and `ai-027`'s
  (the instructions stay within budget).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
