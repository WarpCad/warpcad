---
title: Acceptance scenarios 17 and 18 for the assistant, and a scripted provider for hermetic specs
category: ai
kind: feature
priority: high
model: sonnet
milestone: M9
depends: [ai-006]
status: open
---

## Goal

`ACCEPTANCE.md` says new scenarios are added "only when a whole new capability class lands".
An assistant is one. Without a human-style scenario the AI milestone repeats the second
attempt's failure: green tests that prove the author's script, not that a person can use
it. "Done": two scenarios are written into `TODO/ACCEPTANCE.md` from the user's own words,
and a **scripted provider** lets CI exercise the full chat → tool → viewport path with no
network and no key.

## The scenarios (write these into ACCEPTANCE.md in its template)

**17. Airfoil and wing, ready to print.** Steps: with a real key, open the Assistant and
type, verbatim, *Use the sketch tool to create an airfoil for a model plane wing, create the
wing then the rest of the model so I can 3D print it.* Expect: it either asks a sensible
question or states its assumptions; a sketch with an airfoil outline and a lofted wing
appear; further parts (fuselage, tail) are added; it calls `check_printability` and reports
bed fit; **every body is visible, none replaced another** (scenario 1's lesson); Undo AI
turn removes the whole turn in one step; Export gives manifold STL(s). *Also drive it
differently on purpose:* interrupt with Stop mid-turn, then Send a follow-up ("make the
wing 20 % longer") — the follow-up must edit, not duplicate.

**18. A drawing becomes a library part.** Steps: attach a drawing of a board next to a
ruler (a real fixture in `e2e/fixtures/`), type *Here is a drawing of a raspberry pi 7
create a group object to be added to the library.* Expect: it determines or asks for scale,
builds a group with named sub-parts, shows the overlay, and waits for Confirm before saving;
the part is in **My parts**; **File ▸ New**, drag it in, it renders complete with the same
sub-parts. It must not state dimensions the drawing does not contain.

Both are **driven, not scripted**, with a real key at phone (touch) and laptop; PASS/FAIL
with the transcript saved under `bench/results/ai/` (cost is logged, not hidden).

## Design — the scripted provider

- `src/ai/providers/scripted.js`: implements the `ai-004` provider interface from a
  recorded or hand-written list of turns (`text`, `tool_call`, `usage`), so specs drive the
  **real** agent, tool registry, document and viewport with a deterministic model. It is a
  boundary mock in `CLAUDE.md`'s sense, and it must be obvious in the UI when one is active
  (a "scripted" badge), so nobody mistakes a CI transcript for the live model.
- A recorded transcript carries the registry version it was recorded against; a spec fails
  with "re-record" when a tool's schema changes, instead of passing against stale calls.
- **Limit of what this proves**, stated in `docs/decisions/ai-partner.md`: the scripted run
  proves the plumbing, never that the model's choices are good. Only the live runs and
  `ai-011`'s eval do.

## Interaction model

n/a — test infrastructure and docs; no new user-facing control (the "scripted" badge is a
developer-only indicator).

## Documentation

n/a — `TODO/ACCEPTANCE.md` is itself the artifact.

## Affected files

- `TODO/ACCEPTANCE.md` (two scenarios + status table), `src/ai/providers/scripted.js`
  (+ spec), `e2e/fixtures/ai/` (recorded transcripts, board drawing fixture),
  `e2e/ai-*.e2e.js` helpers, `TODO/VERIFY.md` only for genuinely one-off device notes.

## Effort

M.

## Testing

- **Unit**: scripted provider replays deterministically, rejects a stale registry version,
  streams chunk boundaries like the real client.
- **E2E**: reuses `ai-006`'s specs; adds a transcript-driven run of both scenarios'
  *plumbing* at three viewports and three engines.
- **Acceptance**: this task *creates* 17 and 18; it runs them once live, honestly (a
  FAIL recorded as FAIL is a successful outcome for this task).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
