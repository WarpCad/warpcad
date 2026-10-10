---
title: Acceptance scenarios 17 and 18 for the assistant, and a scripted provider for hermetic specs
category: ai
kind: feature
priority: high
model: sonnet
milestone: M9
depends: [ai-006]
status: done
---

> **Retired 2026-10-10 (`/fix-todo ai-010`).** The scripted provider and scenario 17 shipped; **the live run did not happen**, and the file's own rule applies: *"a FAIL recorded as FAIL is a successful outcome"*, and a run that was not done is recorded as not done. Scenarios 17 and 18 are still **not driven with a real key**: that needs the user's key, which an agent must not enter. Differences from the file: (1) Scenario 18 was already in `ACCEPTANCE.md` (written with `ai-008`), so this task wrote only **17**; there is no status table to extend (the file has none, and a table would cut against its "fixed and small" rule). (2) `src/ai/providers/scripted.js` is wired into the assistant store, **dev builds only** (`window.__WARPCAD_SCRIPTED__`, honoured only when `import.meta.env.DEV`; a spec runs the production build to prove it is ignored there), shows a **Scripted** badge, and never reads, writes or forgets the real key. (3) The two transcripts in `e2e/fixtures/ai/` are **hand-written, not recorded** (no live model run exists to record from); each carries a hash of the input schema of every tool it calls, so a changed schema fails the unit stage with "re-record" and `npm run ai:stamp` restamps after the calls are checked. Transcripts also support `$last:<prefix>` and `$all:<prefixes>` placeholders because the app, not the script, issues body ids. (4) The fixture-reading specs live in `scripts/ai-fixtures.spec.js`, not `src/`, because `src/` is typechecked without Node types. (5) `src/shims.d.ts` now types `import.meta.env` (first use in `src/`). **Found by running the real tools under the script:** the airfoil's default knife-edge trailing edge is a **0 mm wall**, which `check_printability` flags (*thinner than the 0.4 mm nozzle*); my first transcript glossed over it, which was the kind of misleading green this task exists to prevent, so the reply now says so and a spec asserts it.

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
