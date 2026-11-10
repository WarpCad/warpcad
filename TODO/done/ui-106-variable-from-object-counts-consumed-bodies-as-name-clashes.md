---
title: Creating a variable from an object refuses a name only one live body has
category: ui
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-09 from the owner's report
depends: []
status: done
---

> **Shipped as specified, with one deviation.** `formulaLookup().idsNamed` now returns only live bodies when any live body holds the name, and falls back to consumed roots otherwise; a deleted live body reports "no body named" (the open question, decided as recommended). The clash message lists only live bodies, each with what it was built from (for example `Group of Bolt, Nut`), not a parent group: the document has no parent-group concept for a root body, so that was the closest honest label. Unit tests (`document.spec.js`, `formula.spec.js`), the new `e2e/formula-consumed-chain.e2e.js` (the owner's chain fixture), and the acceptance drive of scenarios 14, 21 and 32 plus the ui-104 and ui-105 repros all pass.

## Problem

Filed 2026-11-09 from the owner's report, with a screenshot, on the same huzzah-feather-esp8266
project `ui-104` and `ui-105` came from (`~/Documents/huzzah-feather-esp8266.ndjson`, app v1.14.0,
9295c8e). The owner selected Cube 4, opened **Variables → New**, chose Kind **Formula**, and typed
`[esp8266 feather].board.width`. **Create** stayed disabled and the form showed:

> 3 bodies are named esp8266 feather (esp8266-feather-1-v5jezw-917, group-duolka-970,
> group-duolka-971): use #esp8266-feather-1-v5jezw-917 to choose one.

The owner sees **one** object called esp8266 feather in the Objects list. The other two are earlier
steps of the same body's history that a group merge consumed.

### Root cause (read from the code, not yet reproduced)

The log's tail for this body is a chain: `esp8266-feather-1-v5jezw-917` is renamed to *esp8266
feather*, then `group-duolka-970` (`group.merge`, name *esp8266 feather*) consumes it, then
`group-duolka-971` consumes 970. Only `group-duolka-971` is still a live body.

`formulaLookup().idsNamed` (`src/core/document.js`, near line 6140) keeps every root that is **not
deleted**, filtered by current name. A root a merge consumed is not deleted, so consumed roots pass.
That is deliberate for one case (the `formulaLookup` JSDoc: "a formula may measure a cutter that went
into a Subtract"), but `formulaToStored` (`src/core/formula.js`, near line 1264) treats *any* two
matches as an ambiguous name. Two faults follow:

1. **A name one live body holds is refused** because consumed ancestors share it. A group built from
   a renamed part, then merged again, always trips this.
2. **The suggested fix is wrong.** The hint says `use #esp8266-feather-1-v5jezw-917`, the *first* id,
   which is the oldest consumed ancestor, not the body on screen. Even a person who follows it binds
   the formula to a body that no longer shows.

## Affected files

- `src/core/formula.js` (`formulaToStored`, the `idsNamed` branch; `formulaToDisplay`, the
  `idsNamed(name).length !== 1` check, which has the same blind spot and keeps showing `#id`)
- `src/core/document.js` (`formulaLookup().idsNamed`; `mergedInto` / `stateOf` already know which
  roots are consumed)
- `src/core/formula.spec.js` (line 543 pins the current two-bodies message)
- The Variables form component under `src/components/` that shows the error and the **Insert…**
  button (find it from the `data-testid` of the Formula field)

## Proposed fix

1. **Prefer the live body.** When a name matches several roots, drop the consumed ones if exactly one
   live (unconsumed) root remains, and use it. Refuse only when two or more *live* bodies share the
   name, which is the case the existing spec on line 543 covers (`Screw`, two live screws).
2. **Keep consumed bodies reachable by `#id`** and by name when no live body has it, so measuring a
   cutter that went into a Subtract still works.
3. **A real clash lists only live bodies**, and the suggested id is one of them. Show each with its
   current display name or parent (the group it sits in) so the owner can tell them apart. The raw
   ids alone do not.
4. Make `formulaToDisplay` agree: a name is bracketable when exactly one live body holds it.
5. **Reproduce first** on a copy of the owner's file (`TODO/FIND-testing-018`'s copy rule: never edit
   the owner's file): load it, add the variable, confirm the refusal, then confirm Create enables and
   the stored formula resolves to `group-duolka-971`.

Open design question for the fix, decide in the PR rather than guess here: if the owner later
deletes the live body, should the name fall back to a consumed ancestor, or report *no body named*?
Recommended: report no body, since the name no longer points at anything visible.

## Effort

S–M. The lookup change is small. Choosing what the clash message shows takes the time.

## Testing

- `src/core/formula.spec.js`: the owner's chain as a unit case (rename, then two group merges: name
  resolves to the last group). Also: two live bodies, same name, still refused, and the hint names a
  live one. Also: a consumed cutter with a unique name still resolves. Also: a deleted body is not
  matched.
- `src/core/document.spec.js`: `formulaLookup().idsNamed` over a consumed chain.
- An app-level `*.e2e.js` spec that navigates to `/`, loads a project with a renamed-then-merged
  group, creates a Formula variable by name from the form, and sees Create enabled and the value
  appear. Runs on the three engine-viewport pairs the default rotation gives; the touch layout of the
  form is unchanged, so phone, tablet and laptop each get a snapshot only if the message layout
  changes. Kernel and persistence are involved, so all three engines.
- ACCEPTANCE scenarios: re-drive any that create a variable or a formula from a body, and the group
  scenarios.
- Closed findings re-run: `ui-105` (the same project, its group named esp8266 feather) and
  `ui-104` (editing inside a group), original reproduction steps against the new code.
- Docs: no new control. Check `docs/` for the Variables page's note on ambiguous names and update it
  if it describes the old behaviour.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
