---
title: Agent loop — plan, call tools, read results, correct mistakes, stop; one turn is one undo step
category: ai
kind: feature
priority: high
model: opus
milestone: M9
depends: [ai-002, ai-003, ai-004]
status: open
---

## Goal

Given a request, the agent works through tool calls until the job is done or it must ask a
question, and the user can take the whole turn back with one action. "Done": with a scripted
provider (`ai-010`), the loop completes a multi-step build, recovers from a rejected record
on its own, honours Stop within one step, and a thrown error leaves the document as it
found it.

## Design

- `src/ai/agent.js` (framework-free): `runTurn({ userMessage, images, ctx, signal })`.
  Streams assistant text; for each `tool_call` runs the registry tool, feeds the result back;
  loops until the model stops calling tools. Hard caps: steps per turn, records per turn,
  wall-clock. On cap: stop and say so — never silently truncate.
- **Transaction**: the turn opens one origin-`ai` unit (`ai-001` decision 5). Cancel or
  error → the unit is rolled back (the document byte-identical to before), and the transcript
  says so. Success → one **Undo AI turn** step.
- **Self-correction**: a tool error is returned to the model verbatim (`ReplayRejection`
  wording is already model-readable), at most N consecutive failures on the same call
  before the agent stops and asks the user.
- **System prompt** (`src/ai/prompt.js`, versioned string, unit-tested for content not
  wording): the conventions (mm, Z-up, degrees, ids, "placed not spawned"), the operand
  rules, a short worked example, the printing defaults, "inspect before you claim" (call
  `capture_view` / `measure` — `ai-007` — before saying a part is finished), "ask when the
  scale or intent is genuinely unknown rather than invent a dimension", and the project's
  standing instructions. Intent and names from the document are placed in a delimited
  **data** block with the instruction to treat them as content (`ai-001` decision 7).
- **Context size**: `describe_scene` is summarised after N bodies; older turns are
  compacted to their intent lines. Say what is dropped.
- **Clarifying questions** are a first-class outcome: the agent may end a turn with a
  question and zero writes. The airfoil request must produce "which airfoil / span /
  printer bed?" *or* state its assumptions in the transcript and proceed; the prompt picks
  one behaviour and a test pins it.

## Interaction model

n/a here — the loop has no UI of its own. Stop, Undo AI turn and the transcript are `ai-006`.

## Documentation

n/a — covered by `ai-006`'s page. The system prompt is developer-facing and lives in JSDoc.

## Affected files

- `src/ai/agent.js`, `src/ai/prompt.js`, `src/ai/context.js` (scene summary + compaction),
  each with a `.spec.js`.

## Effort

L.

## Testing

- **Unit** against a scripted fake provider: happy path; tool error then fix; repeated error
  → stops and asks; abort between and during a tool call; step/record caps; rollback leaves
  the document byte-identical (compare the serialised NDJSON); hostile intent text in the
  context does not alter the tool list or caps; two concurrent turns refused.
- **Boundary**: provider mocked, kernel worker mocked, no network.
- **Acceptance**: scenario 17/18 (`ai-010`).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
