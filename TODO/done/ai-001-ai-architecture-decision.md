---
title: Decide the AI partner architecture — one tool surface, two transports, trust model
category: ai
kind: feature
priority: high
model: opus
milestone: M9
depends: []
status: done
---

> **Retired 2026-10-06. What shipped:** `docs/decisions/ai-partner.md`, which settles all
> nine decisions plus the CRDT section. It's **pending the user's review before
> `ai-002`**; six items for their call are listed at the end of that document. Follow-ons
> shipped in the same change: the revival section in `docs/decisions/document-sync.md`,
> two `CLAUDE.md` Stack rows (LLM client, MCP SDK) and its AI Partner wording, and
> `TODO/ROADMAP.md` (this row resolved, and `io-002`'s stale "AI chat key already exists"
> premise corrected).
>
> Two answers differ from what this file implied, both found by measuring:
>
> - **The LLM client is raw `fetch`, not the official SDK.** `@anthropic-ai/sdk` fails
>   `npm run licenses` as-is, because `standardwebhooks` brings in Unlicense
>   `fast-sha256`. It's also 14.3% of the app's main chunk for one endpoint, and its
>   error messages carry server body text, which `io-002`'s credential rule forbids
>   echoing. The SDK remains the documented fallback if the user adds the licence entry.
> - **"`@modelcontextprotocol/sdk`" is now the v1 package.** The SDK has split into v2
>   packages. The pick is `@modelcontextprotocol/server` 2.3.1 (Apache-2.0, a 3-package
>   tree against v1's 94).
>
> Decision 5 took the branch evaluation further than the file asked. The per-turn branch
> **is** the History preview's existing pattern: a throwaway document seeded from
> `foldableEntry` copies and sharing the live `foldCache`. It lands automatically as one
> atomic `ai` batch, and **Undo AI turn** removes it with the existing remove-and-rebuild.
> An explicit Accept per turn is left as a later setting, flagged for the user.
>
> No code, so there's no RED test. `TODO/ACCEPTANCE.md` exists, but this change touches
> no source, so Step 6's re-drive does not apply (as with `core-014a`). Typecheck, unit
> tests and spdx were re-run to show nothing regressed.

## Goal

Everything else in M9 builds on answers that are currently only implied by `CLAUDE.md`'s AI
Partner section. Write `docs/decisions/ai-partner.md` so the rest of the milestone can name
real modules. "Done" is the decision doc, in the shape `CLAUDE.md`'s Library decisions rule
requires (several real options with health data, a rejection table), plus the stack-table
and ROADMAP edits that follow from it. **No product code.**

The two target prompts, kept verbatim because they are the milestone's acceptance bar:

> Use the sketch tool to create an airfoil for a model plane wing, create the wing then the
> rest of the model so I can 3D print it.

> Here is a drawing of a raspberry pi 7 create a group object to be added to the library.

## Decisions this file must settle

1. **One tool surface, two transports.** The same framework-free tool registry
   (`src/ai/tools/`, `ai-002`) is served by (a) the in-browser chat agent and (b) the MCP
   server in `mcp/` (`ai-009`). Confirm, or say what replaces it.
2. **LLM client.** Compare `@anthropic-ai/sdk` in the browser (`dangerouslyAllowBrowser`),
   raw `fetch` to the Messages API, the Vercel AI SDK, and an OpenAI-compatible adapter.
   Is v1 Anthropic-only behind a one-method provider interface, or multi-provider? Record
   stars, open/closed issue ratio, last release, maintainer count, size, license
   (`npm run licenses` allow-list: a new entry is the user's call, not yours).
3. **MCP SDK.** `@modelcontextprotocol/sdk` vs a hand-rolled stdio JSON-RPC loop. Same
   health table.
4. **Tool-schema validation.** The kernel registry already validates params; do tool
   inputs reuse it, or add zod/ajv? Prefer no new dependency if the registry is enough.
5. **Undo vs `CLAUDE.md`'s origin scoping.** `CLAUDE.md` says programmatic edits never land
   in the local user's own undo stack, yet a person who dislikes what the AI just did must be
   able to take it back in one step. Read `src/core/document.js` (the origin-scoping notes
   around lines 100-150) and decide: a separate **Undo AI turn** control over origin-`ai`
   steps (recommended), or a history-revision. Say which, and why the other fails.
   **Also evaluate "AI works on a branch"**: a turn forks the log at the head, builds
   there, and lands as an accept/discard proposal. It needs no CRDT and no second entry on
   the local undo stack. Decision 6's CRDT question is answered *no* (see the Library
   decision below) unless this document finds a concrete need the branch model cannot meet.
6. **Concurrency.** `docs/decisions/document-sync.md`'s revival condition is "an MCP session
   editing a project a human has open". Decide what ships in v1: MCP works on a **closed**
   project file only, and the live bridge is a reserved later row (`ai-012`). Update that
   document's revival section either way.
7. **Trust model.** Project files and gists are untrusted input (scenario 8). Design-intent
   text (`ai-003`) and part names that arrive from a loaded project are *data*, never
   instructions: how are they delimited in the prompt, and what can a tool call *never* do
   (no network, no key access, no file writes outside the document, a per-turn step cap,
   a per-turn record cap)?
8. **Key handling.** BYOK key in IndexedDB only, never in the autosave blob, the project
   file, a gist, an export, the URL hash, or a log. Name the XSS exposure and the mitigation
   (CSP, no `innerHTML` of model output).
9. **Cost.** Which model is the default, what the chat shows (tokens used per turn), and
   whether prompt caching is used for the stable prefix (system prompt + tool schemas).
   Read the `claude-api` skill rather than answering from memory.

## CRDT, explicitly

Add a section answering "would a CRDT help the AI co-editor?" with the same rejection-table
rigour. Starting position (user asked, 2026-10-02): no. Origin-scoped undo already exists in
`document.js`. A CRDT guarantees convergence, not that a merged parametric log still
replays, so `ReplayRejection` handling is needed anyway. Array moves (the timeline's
reorder) and a shared rollback marker fit CRDTs badly. The cheaper answers are one writer
with the AI as its client (`ai-012`) or a branch/proposal model. Revisit only if
multi-person real-time editing becomes a goal.

## Interaction model

n/a — a decision record with no UI surface.

## Documentation

n/a — `docs/decisions/` is developer-facing. End-user pages come with `ai-006` and `ai-009`.

## Affected files

- `docs/decisions/ai-partner.md` (new), `docs/decisions/document-sync.md` (revival section),
  `CLAUDE.md` Stack table (add LLM-client and MCP-SDK rows) and AI Partner section if a
  decision changes its wording, `TODO/ROADMAP.md` (resolve this row, correct `io-002`'s
  stale "AI chat client already exists" note).

## Effort

M. A decision doc, but the undo and trust-model questions need real reading of `document.js`.

## Testing

None (no code). The doc is reviewed by the user before `ai-002` starts.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
